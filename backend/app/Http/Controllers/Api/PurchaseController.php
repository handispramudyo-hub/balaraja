<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Purchase;
use App\Models\InstallmentPlan;
use App\Models\Product;
use App\Models\StockMovement;
use App\Models\SupplierPayment;
use App\Services\DocumentNumberService;
use App\Services\InstallmentService;
use App\Services\PurchasePayableService;
use App\Services\ProductUnitService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class PurchaseController extends Controller
{
    public function index(Request $request)
    {
        $query = Purchase::with('supplier');

        // Nama parameter filter tanggal diseragamkan ke start_date/end_date,
        // sama seperti yang dipakai /reports/* dan export. Sebelumnya endpoint
        // ini hanya membaca date_from/date_to sementara frontend mengirim
        // start_date/end_date, jadi kedua filter tanggal di halaman transaksi
        // pembelian tidak pernah memfilter apa pun - terlihat bekerja, diam.
        $dateFrom = $request->input('start_date', $request->input('date_from'));
        $dateTo = $request->input('end_date', $request->input('date_to'));

        if ($dateFrom) {
            $query->where('date', '>=', $dateFrom);
        }
        if ($dateTo) {
            $query->where('date', '<=', $dateTo);
        }
        if ($request->filled('supplier_id')) {
            $query->where('supplier_id', $request->supplier_id);
        }
        if ($request->filled('payment_status')) {
            $query->whereIn('payment_status', (array) $request->payment_status);
        }
        if ($request->filled('has_debt')) {
            $request->boolean('has_debt')
                ? $query->where('payable', '>', 0)
                : $query->where('payable', '<=', 0);
        }

        // Pencarian nomor transaksi untuk dropdown pelunasan. Tanpa ini,
        // dropdown hanya bisa menampilkan `per_page` baris pertama - transaksi
        // yang lebih lama tidak bisa dipilih, dan user mengira datanya hilang.
        if ($search = trim((string) $request->input('search', ''))) {
            $query->where('purchase_number', 'like', '%'.$search.'%');
        }

        // Halaman daftar 15 baris, tapi dropdown "pilih transaksi yang masih
        // utang" butuh lebih dari itu - kalau dipaksa 15, supplier dengan
        // lebih dari 15 transaksi utang akan terlihat seperti tidak punya
        // utang sama sekali. Nilai dibatasi 200 supaya parametrinya tidak
        // bisa dipakai menarik seluruh tabel.
        $perPage = min(max((int) $request->input('per_page', 15), 1), 200);

        $purchases = $query->latest()->paginate($perPage);

        return response()->json($purchases);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'date' => 'required|date',
            'supplier_id' => 'required|exists:suppliers,id',
            'due_date' => 'nullable|date|after_or_equal:date',
            // Pembayaran awal (DP / bayar sebagian). Opsional, dan tidak
            // boleh melebihi total - dicek di bawah setelah total dihitung,
            // karena total bergantung pada item yang dikirim.
            'payment' => [
                'nullable',
                'numeric',
                'min:0',
                // Sama seperti penjualan: memilih cicilan berarti seluruh
                // total dibagi rata tanpa DP. Pembayaran di muka yang lolos di
                // sini akan dibayar dua kali - sekali lewat `supplier_payments`
                // dan sekali lagi lewat jadwal angsuran.
                function ($attribute, $value, $fail) use ($request) {
                    if ((float) $value > 0 && ! empty($request->input('installment_months'))) {
                        $fail('Cicilan tidak bisa digabung dengan pembayaran di muka.');
                    }
                },
            ],
            'payment_method' => 'nullable|in:cash,transfer,other',
            'note' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|exists:products,id',
            'items.*.quantity' => 'required|integer|min:1',
            'items.*.buy_price' => 'required|numeric|min:0',
            // Opsional supaya form lama (hanya product_id/quantity/buy_price)
            // tetap jalan; kosong berarti pakai satuan dasar produk.
            'items.*.unit_id' => 'nullable|integer|exists:product_units,id',
            'items.*.unit_name' => 'nullable|string|max:255',
            // Kosong = pembelian dibayar penuh, tanpa jadwal angsuran.
            'installment_months' => 'nullable|integer|min:1|max:'.InstallmentService::MAX_MONTHS,
        ]);

        $purchase = DB::transaction(function () use ($validated, $request) {
            $purchaseNumber = app(DocumentNumberService::class)->next('PB', $validated['date']);

            // Resolve satuan dulu, sebelum purchase & item dibuat. Baris item
            // menyimpan snapshot satuan, jadi harus sudah tahu satuan mana
            // yang dipilih ketika dokumen ini dicetak.
            $resolvedItems = $this->resolveUnits($validated['items']);

            $total = 0;
            $itemsData = [];

            foreach ($resolvedItems as $item) {
                $subtotal = $item['quantity'] * $item['buy_price'];
                $total += $subtotal;

                $itemsData[] = [
                    'product_id' => $item['product_id'],
                    'unit_name' => $item['_unit']->name,
                    'unit_factor' => $item['_unit']->factor,
                    'base_quantity' => $item['_base_quantity'],
                    'quantity' => $item['quantity'],
                    'buy_price' => $item['buy_price'],
                    'subtotal' => $subtotal,
                ];
            }

            $total = round($total, 2);
            $initialPaid = round((float) ($validated['payment'] ?? 0), 2);

            if ($initialPaid - $total > 0.005) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'payment' => 'Pembayaran awal melebihi total pembelian.',
                ]);
            }

            $payable = max(0.0, round($total - $initialPaid, 2));

            $purchase = Purchase::create([
                'purchase_number' => $purchaseNumber,
                'date' => $validated['date'],
                'supplier_id' => $validated['supplier_id'],
                'total' => $total,
                'payable' => $payable,
                'due_date' => $validated['due_date'] ?? null,
                'payment_status' => app(PurchasePayableService::class)->statusFor($initialPaid, $total),
                'note' => $validated['note'] ?? null,
                'user_id' => $request->user()->id,
            ]);

            // Pembayaran awal dicatat sebagai supplier_payments, bukan hanya
            // disimpan di payable. Kalau tidak, baris ini akan terlihat
            // "sudah lunas" padahal tidak ada satu pun uang masuk yang
            // tercatat, dan sisa utangnya tidak bisa dilacak.
            if ($initialPaid > 0) {
                SupplierPayment::create([
                    'payment_number' => app(DocumentNumberService::class)->next('TB', $validated['date']),
                    'date' => $validated['date'],
                    'supplier_id' => $validated['supplier_id'],
                    'purchase_id' => $purchase->id,
                    'amount' => $initialPaid,
                    'method' => $validated['payment_method'] ?? 'cash',
                    'note' => 'Pembayaran awal saat pembelian dibuat',
                    'user_id' => $request->user()->id,
                ]);
            }

            $purchase->items()->createMany($itemsData);

            foreach ($resolvedItems as $item) {
                $product = Product::lockForUpdate()->find($item['product_id']);
                $stockBefore = $product->stock;
                $product->increment('stock', $item['_base_quantity']);

                StockMovement::create([
                    'product_id' => $item['product_id'],
                    'type' => 'purchase',
                    'quantity' => $item['_base_quantity'],
                    'unit_name' => $item['_unit']->name,
                    'base_quantity' => $item['_base_quantity'],
                    'stock_before' => $stockBefore,
                    'stock_after' => $stockBefore + $item['_base_quantity'],
                    'reference_type' => 'App\\Models\\Purchase',
                    'reference_id' => $purchase->id,
                    'date' => $validated['date'],
                    'user_id' => $request->user()->id,
                ]);
            }

            // Jadwal angsuran dibuat di transaksi yang sama dengan pembuatan
            // pembelian, dengan alasan yang sama seperti di SaleController:
            // kasir yang sudah mengetik "3x cicilan" tidak boleh berakhir
            // dengan pembelian tersimpan tanpa jadwal.
            if (! empty($validated['installment_months'])) {
                $plan = InstallmentPlan::create([
                    'direction' => 'payable',
                    'purchase_id' => $purchase->id,
                    'months' => (int) $validated['installment_months'],
                    'user_id' => $request->user()->id,
                ]);

                $installments = app(InstallmentService::class);
                $installments->generate(
                    $plan,
                    (int) $validated['installment_months'],
                    $total,
                    $validated['date']
                );

                // Pembayaran awal (kalau ada) ikut dialokasikan ke jadwal.
                $installments->recalculate($plan);
            }

            return $purchase;
        });

        return response()->json(
            $purchase->load('supplier', 'items.product', 'installmentPlan.installments'),
            201
        );
    }

    public function show($id)
    {
        $purchase = Purchase::with('supplier', 'items.product', 'installmentPlan.installments')->findOrFail($id);

        return response()->json($purchase);
    }

    public function update(Request $request, $id)
    {
        $purchase = Purchase::with('items')->findOrFail($id);

        $validated = $request->validate([
            'date' => 'required|date',
            'supplier_id' => 'required|exists:suppliers,id',
            'due_date' => 'nullable|date|after_or_equal:date',
            'note' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|exists:products,id',
            'items.*.quantity' => 'required|integer|min:1',
            'items.*.buy_price' => 'required|numeric|min:0',
            // Opsional supaya form lama (hanya product_id/quantity/buy_price)
            // tetap jalan; kosong berarti pakai satuan dasar produk.
            'items.*.unit_id' => 'nullable|integer|exists:product_units,id',
            'items.*.unit_name' => 'nullable|string|max:255',
        ]);

        // Dua guard, keduanya menolak SEBELUM ada efek samping, supaya tidak
        // ada yang sudah terlanjur berubah ketika request ditolak.
        //
        // 1. Ganti supplier saat sudah ada pembayaran tidak boleh lolos.
        //    Pembayaran sudah tercatat atas nama supplier lama; kalau
        //    dipindahkan diam-diam, kolom supplier_id di baris pembayaran
        //    jadi catatan yang tidak bisa dipertanggungjawabkan dari mana pun.
        if ((int) $purchase->supplier_id !== (int) $validated['supplier_id']
            && $purchase->supplierPayments()->exists()) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'supplier_id' => 'Supplier tidak bisa diubah karena transaksi ini sudah punya pembayaran.',
            ]);
        }

        // 2. Total turun di bawah nominal yang sudah dibayar tidak boleh
        //    lolos. Kalau dibiarkan, `payable` dihitung 0 dan transaksi
        //    ditandai lunas padahal supplier sudah menerima uang lebih
        //    banyak dari tagihan. Itu overpayment yang tidak tercatat di
        //    mana pun - dan user tidak akan pernah mengetahuinya. Transaksi
        //    dibiarkan, tapi pembayaran yang terlanjur lebih besar harus
        //    dikoreksi dari halaman pelunasan.
        $alreadyPaid = (float) $purchase->supplierPayments()->sum('amount');
        $newTotal = array_sum(array_map(
            fn (array $item) => round($item['quantity'] * $item['buy_price'], 2),
            $validated['items']
        ));
        $newTotal = round($newTotal, 2);

        if ($newTotal < $alreadyPaid - 0.005) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'items' => 'Total tidak boleh lebih kecil dari pembayaran yang sudah tercatat '
                    .'(Rp '.number_format($alreadyPaid, 0, ',', '.').'). '
                    .'Koreksi pembayaran di halaman pelunasan dulu.',
            ]);
        }

        DB::transaction(function () use ($validated, $purchase, $request, $newTotal) {
            $productIds = array_values(array_unique(array_column($purchase->items->toArray(), 'product_id')));
            sort($productIds);
            $products = Product::whereIn('id', $productIds)->lockForUpdate()->get()->keyBy('id');

            foreach ($purchase->items as $oldItem) {
                $product = $products[$oldItem->product_id];
                // Item lama bisa dibuat sebelum fitur satuan ada, jadi
                // `base_quantity` masih NULL. Fallback ke `quantity` benar
                // karena waktu itu semua satuan bernilai 1.
                $oldBase = (int) ($oldItem->base_quantity ?? $oldItem->quantity);
                $product->decrement('stock', $oldBase);

                StockMovement::create([
                    'product_id' => $oldItem->product_id,
                    'type' => 'purchase_reverse',
                    'quantity' => -$oldBase,
                    'unit_name' => $oldItem->unit_name,
                    'base_quantity' => $oldBase,
                    'stock_before' => $product->stock + $oldBase,
                    'stock_after' => $product->stock,
                    'reference_type' => 'App\\Models\\Purchase',
                    'reference_id' => $purchase->id,
                    'date' => $validated['date'],
                    'user_id' => $request->user()->id,
                ]);
            }

            $purchase->items()->delete();

            // `total` dibulatkan ke dua desimal. Tanpa itu, total 99999.99
            // bisa tersimpan sebagai 99999.98999 dari akumulasi float, dan
            // `payable` (dibulatkan) tidak akan pernah sama persis dengan
            // `total - SUM(pembayaran)`.
            // `total` sudah dihitung (dan di-round) di guard sebelum transaksi
            // dimulai. Loop di bawah hanya membangun `$itemsData`; kalau
            // `$total` ikut dijumlahkan lagi di sini, totalnya terhitung dua
            // kali. `subtotal` per item ikut di-round supaya penjumlahannya
            // persis sama dengan `$newTotal` yang dipakai untuk validasi.
            $itemsData = [];

            $resolvedItems = $this->resolveUnits($validated['items']);

            foreach ($resolvedItems as $item) {
                $subtotal = round($item['quantity'] * $item['buy_price'], 2);

                $itemsData[] = [
                    'product_id' => $item['product_id'],
                    'unit_name' => $item['_unit']->name,
                    'unit_factor' => $item['_unit']->factor,
                    'base_quantity' => $item['_base_quantity'],
                    'quantity' => $item['quantity'],
                    'buy_price' => $item['buy_price'],
                    'subtotal' => $subtotal,
                ];
            }

            $purchase->update([
                'date' => $validated['date'],
                'supplier_id' => $validated['supplier_id'],
                'total' => $newTotal,
                'due_date' => $validated['due_date'] ?? null,
                'note' => $validated['note'] ?? null,
            ]);

            // Total berubah, jadi sisa utang WAJIB dihitung ulang. Kalau
            // tidak, `payable` masih angka lama: lowering total tidak
            // mengurangi utang, dan menaikkan total di atas nominal yang
            // sudah dibayar membuat `payable` negatif.
            app(PurchasePayableService::class)->recalculate($purchase);

            // Kalau pembelian ini dicicilkan, nominal angsuran harus ikut
            // mengikuti total yang baru. Kalau tidak, `SUM(installments.
            // amount)` akan menyimpang dari `purchases.total` dan sisa
            // utang yang tampil di layar tidak akan cocok dengan jadwal.
            $installments = app(InstallmentService::class);
            $plan = $installments->planFor($purchase);
            if ($plan !== null) {
                $installments->resync($plan);
            }

            $purchase->items()->createMany($itemsData);

            $newProductIds = array_values(array_unique(array_column($validated['items'], 'product_id')));
            sort($newProductIds);
            $newProducts = Product::whereIn('id', $newProductIds)->lockForUpdate()->get()->keyBy('id');

            foreach ($resolvedItems as $item) {
                $product = $newProducts[$item['product_id']];
                $stockBefore = $product->stock;
                $product->increment('stock', $item['_base_quantity']);

                StockMovement::create([
                    'product_id' => $item['product_id'],
                    'type' => 'purchase',
                    'quantity' => $item['_base_quantity'],
                    'unit_name' => $item['_unit']->name,
                    'base_quantity' => $item['_base_quantity'],
                    'stock_before' => $stockBefore,
                    'stock_after' => $stockBefore + $item['_base_quantity'],
                    'reference_type' => 'App\\Models\\Purchase',
                    'reference_id' => $purchase->id,
                    'date' => $validated['date'],
                    'user_id' => $request->user()->id,
                ]);
            }
        });

        return response()->json($purchase->load('supplier', 'items.product'));
    }

    public function destroy(Request $request, $id)
    {
        $purchase = Purchase::with('items')->findOrFail($id);

        // Hapus transaksi yang sudah dibayar berarti uang yang sudah keluar
        // tiba-tiba tidak ada jejaknya, dan `supplier_payments` yang masih
        // menunjuk ke purchase yang dihapus akan menggagalkan seluruh tabel
        // (FK restrict) dengan pesan error yang tidak berguna.
        if ($purchase->supplierPayments()->exists()) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'purchase' => 'Transaksi pembelian yang sudah dibayar tidak bisa dihapus. Hapus pembayarannya dulu.',
            ]);
        }

        DB::transaction(function () use ($purchase, $request) {
            foreach ($purchase->items as $item) {
                $product = Product::lockForUpdate()->find($item->product_id);
                $stockBefore = (int) $product->stock;
                $base = (int) ($item->base_quantity ?? $item->quantity);
                $product->decrement('stock', $base);

                // Sama seperti PurchaseController::update — tulis pembatalan,
                // bukan hapus riwayat movement.
                StockMovement::create([
                    'product_id' => $item->product_id,
                    'type' => 'purchase_reverse',
                    'quantity' => -1 * $base,
                    'unit_name' => $item->unit_name,
                    'base_quantity' => $base,
                    'stock_before' => $stockBefore,
                    'stock_after' => $stockBefore - $base,
                    'reference_type' => 'App\\Models\\Purchase',
                    'reference_id' => $purchase->id,
                    'date' => Carbon::parse($purchase->date)->toDateString(),
                    'user_id' => $request->user()->id,
                ]);
            }

            $purchase->items()->delete();
            $purchase->delete();
        });

        return response()->json(['message' => 'Pembelian berhasil dihapus']);
    }

    /**
     * Pasangkan tiap baris item dengan satuan yang dipilih, dan hitung
     * jumlah dalam satuan dasar.
     *
     * Pembelian tidak perlu cek ketersediaan stok (barang justru bertambah),
     * jadi ini murni resolusi satuan - tidak ada lock di sini. Lock produk
     * diambil terpisah saat stock movement ditulis.
     *
     * @return array<int, array> item + `_unit` dan `_base_quantity`
     */
    private function resolveUnits(array $items): array
    {
        $productIds = array_values(array_unique(array_column($items, 'product_id')));
        sort($productIds);

        $products = Product::whereIn('id', $productIds)->with('units')->get()->keyBy('id');
        $unitService = app(ProductUnitService::class);
        $resolved = [];

        foreach (array_values($items) as $index => $item) {
            $product = $products[$item['product_id']] ?? null;

            if (! $product) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    "items.{$index}.product_id" => 'Produk tidak ditemukan.',
                ]);
            }

            $unit = $unitService->resolveUnit(
                $product,
                $item['unit_id'] ?? null,
                $item['unit_name'] ?? null
            );

            $item['_unit'] = $unit;
            $item['_base_quantity'] = $unit->toBaseQuantity((int) $item['quantity']);
            $resolved[] = $item;
        }

        return $resolved;
    }
}
