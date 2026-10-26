<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Sale;
use App\Models\Product;
use App\Models\Customer;
use App\Models\InstallmentPlan;
use App\Models\Payment;
use App\Models\StockMovement;
use App\Services\DocumentNumberService;
use App\Services\InstallmentService;
use App\Services\ProductUnitService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class SaleController extends Controller
{
    /**
     * Lock baris produk (urut id agar konsisten & bebas deadlock) lalu
     * pastikan stok cukup. Lock harus diambil SEBELUM mengecek stok,
     * jika tidak ada celah, penjualan ganda bisa terjadi antar request
     * bersamaan: dua kasir sama-sama membaca stok 1, lalu sama-sama
     * menjual 1.
     *
     * Perbandingan stok HARUS memakai jumlah dalam satuan dasar, bukan
     * `quantity` apa adanya. Jual 5 btl dari stok 792 btl akan terlihat
     * "tidak cukup" kalau 5 dibandingkan langsung dengan 792.
     *
     * @return array{0: array<int, Product>, 1: array} produk terkunci + item yang sudah punya satuan dasar
     */
    private function lockAndValidateProducts(array $items): array
    {
        $productIds = array_values(array_unique(array_column($items, 'product_id')));
        sort($productIds);

        $products = Product::whereIn('id', $productIds)
            ->with('units')
            ->lockForUpdate()
            ->get()
            ->keyBy('id');

        $unitService = app(ProductUnitService::class);
        $requestedTotals = [];
        $resolved = [];

        foreach (array_values($items) as $index => $item) {
            $product = $products[$item['product_id']] ?? null;

            if (! $product) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    "items.{$index}.product_id" => 'Produk tidak ditemukan.',
                ]);
            }

            if (($product->status ?? 'active') !== 'active') {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    "items.{$index}.product_id" => "Produk '{$product->name}' tidak aktif dan tidak dapat dijual.",
                ]);
            }

            $unit = $unitService->resolveUnit(
                $product,
                $item['unit_id'] ?? null,
                $item['unit_name'] ?? null
            );
            $baseQuantity = $unit->toBaseQuantity((int) $item['quantity']);

            $requestedTotals[$item['product_id']] = ($requestedTotals[$item['product_id']] ?? 0) + $baseQuantity;

            $item['_unit'] = $unit;
            $item['_base_quantity'] = $baseQuantity;
            $item['_product'] = $product;
            $resolved[] = $item;
        }

        foreach ($requestedTotals as $productId => $totalBase) {
            $product = $products[$productId] ?? null;
            if (! $product) {
                continue;
            }

            if ((int) $product->stock < $totalBase) {
                $firstIndex = collect($items)
                    ->filter(fn ($it) => (int) ($it['product_id'] ?? 0) === (int) $productId)
                    ->keys()
                    ->first();

                $msg = "Stok {$product->name} tidak mencukupi. "
                    ."Butuh {$totalBase} {$product->unit}, tersedia {$product->stock} {$product->unit}.";

                throw \Illuminate\Validation\ValidationException::withMessages([
                    "items.".($firstIndex ?? 0).".product_id" => $msg,
                ]);
            }
        }

        return [$products->all(), $resolved];
    }

    public function index(Request $request)
    {
        $query = Sale::with('customer');

        if ($request->filled('date_from')) {
            $query->where('date', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $query->where('date', '<=', $request->date_to);
        }
        if ($request->filled('start_date')) {
            $query->where('date', '>=', $request->start_date);
        }
        if ($request->filled('end_date')) {
            $query->where('date', '<=', $request->end_date);
        }
        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }
        if ($request->filled('payment_status')) {
            if ($request->payment_status === 'unpaid_or_partial') {
                $query->whereIn('payment_status', ['unpaid', 'partial']);
            } else {
                $query->where('payment_status', $request->payment_status);
            }
        }

        // Pencarian nomor transaksi untuk dropdown pelunasan. Tanpa ini,
        // dropdown hanya menampilkan 15 baris pertama, sehingga penjualan
        // yang lebih lama tidak bisa dipilih padahal utangnya masih ada.
        if ($search = trim((string) $request->input('search', ''))) {
            $query->where('sale_number', 'like', '%'.$search.'%');
        }

        // Batas 200 mengikuti purchases: cukup untuk dropdown, tapi tetap
        // mencegah parametrinya dipakai menarik seluruh tabel.
        $perPage = min(max((int) $request->input('per_page', 15), 1), 200);

        $sales = $query->latest()->paginate($perPage);

        $sales->getCollection()->transform(function ($sale) {
            $sale->remaining_balance = (float) $sale->receivable;
            return $sale;
        });

        return response()->json($sales);
    }

    public function store(Request $request)
    {
        if ($request->due_date === '') $request->merge(['due_date' => null]);

        $validated = $request->validate([
            'date' => 'required|date',
            'customer_id' => 'required|exists:customers,id',
            'note' => 'nullable|string',
            'payment' => [
                'nullable',
                'numeric',
                'min:0',
                // Cicilan berarti seluruh total dibagi rata, jadi tidak ada
                // pembayaran di muka. Menerima DP bersamaan dengan jadwal
                // akan membuat dua sumber kebenaran yang saling bertentangan:
                // `sales.payment` menyatakan pelanggan sudah membayar,
                // sementara jadwal tetap menagih seluruh total. `receivable`
                // juga dihitung dari `payment`, sehingga pelanggan terlihat
                // tidak punya utang padahal angsuran menagih dia penuh.
                // Tolak kombinasi ini di pintu masuk, bukan diperbaiki diam-diam.
                function ($attribute, $value, $fail) use ($request) {
                    if ((float) $value > 0 && ! empty($request->input('installment_months'))) {
                        $fail('Cicilan tidak bisa digabung dengan pembayaran di muka.');
                    }
                },
            ],
            'due_date' => 'nullable|date|after_or_equal:date',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|exists:products,id',
            'items.*.quantity' => 'required|integer|min:1',
            'items.*.sell_price' => 'required|numeric|min:0',
            // Opsional: kalau tidak dikirim, produk pakai satuan basics
            // (base) sehingga form lama yang cuma kirim product_id/quantity
            // tetap jalan. `unit_name` disimpan sebagai fallback supaya
            // dokumen lama/lama tidak gagal.
            'items.*.unit_id' => 'nullable|integer|exists:product_units,id',
            'items.*.unit_name' => 'nullable|string|max:255',
            // Kosong = transaksi tunai biasa, tanpa jadwal angsuran.
            // Frontend cukup mengosongkan field, jadi tidak perlu
            // membedakan "tidak dikirim" dari "dikirim kosong".
            'installment_months' => 'nullable|integer|min:1|max:'.InstallmentService::MAX_MONTHS,
        ]);

        $sale = DB::transaction(function () use ($validated, $request) {
            [$products, $resolvedItems] = $this->lockAndValidateProducts($validated['items']);

            $saleNumber = app(DocumentNumberService::class)->next('SJ', $validated['date']);

            $total = 0;
            $itemsData = [];

            foreach ($resolvedItems as $item) {
                $product = $products[$item['product_id']];
                $subtotal = $item['quantity'] * $item['sell_price'];
                $total += $subtotal;

                $itemsData[] = [
                    'product_id' => $item['product_id'],
                    // Snapshot satuan, bukan FK. Kalau satuan produk diubah atau
                    // dihapus, dokumen lama harus tetap tercetak dengan arti
                    // yang sama seperti saat transaksi terjadi.
                    'unit_name' => $item['_unit']->name,
                    'unit_factor' => $item['_unit']->factor,
                    'base_quantity' => $item['_base_quantity'],
                    'quantity' => $item['quantity'],
                    'sell_price' => $item['sell_price'],
                    // HPP per satuan DASAR. `products.buy_price` dibaca per
                    // satuan dasar, jadi dikali faktor supaya 1 dus (24 btl)
                    // tidak dihitung HPP-nya cuma 1 btl.
                    'buy_price' => round((float) $product->buy_price * $item['_unit']->factor, 2),
                    'subtotal' => $subtotal,
                ];
            }

            $payment = $validated['payment'] ?? 0;
            $receivable = $total - $payment;

            if ($receivable > 0) {
                $paymentStatus = 'unpaid';
            } elseif ($receivable == 0 && $payment > 0) {
                $paymentStatus = 'paid';
            } else {
                $paymentStatus = 'unpaid';
            }

            if ($payment > 0 && $payment < $total) {
                $paymentStatus = 'partial';
            } elseif ($payment >= $total) {
                $paymentStatus = 'paid';
            }

            $sale = Sale::create([
                'sale_number' => $saleNumber,
                'date' => $validated['date'],
                'customer_id' => $validated['customer_id'],
                'total' => $total,
                'payment' => $payment,
                'receivable' => $receivable,
                'due_date' => $validated['due_date'] ?? null,
                'payment_status' => $paymentStatus,
                'note' => $validated['note'] ?? null,
                'user_id' => $request->user()->id,
            ]);

            $sale->items()->createMany($itemsData);

            foreach ($resolvedItems as $item) {
                $product = $products[$item['product_id']] ?? ($item['_product'] ?? Product::find($item['product_id']));
                $stockBefore = $product->stock;
                $product->decrement('stock', $item['_base_quantity']);

                StockMovement::create([
                    'product_id' => $item['product_id'],
                    'type' => 'sale',
                    'quantity' => $item['_base_quantity'],
                    'unit_name' => $item['_unit']->name,
                    'base_quantity' => $item['_base_quantity'],
                    'stock_before' => $stockBefore,
                    'stock_after' => $stockBefore - $item['_base_quantity'],
                    'reference_type' => 'App\\Models\\Sale',
                    'reference_id' => $sale->id,
                    'date' => $validated['date'],
                    'user_id' => $request->user()->id,
                ]);
            }

            if ($receivable > 0) {
                $customer = Customer::lockForUpdate()->find($validated['customer_id']);
                $totalReceivable = Sale::where('customer_id', $validated['customer_id'])
                    ->whereIn('payment_status', ['unpaid', 'partial'])
                    ->sum('receivable');
                $customer->update(['total_receivable' => $totalReceivable]);
            }

            // Jadwal angsuran dibuat di DALAM transaksi yang sama dengan
            // pembuatan penjualan. Kalau jadwalnya gagal ditulis (misal total
            // 0, yang tidak bisa dibagi bulan), seluruh penjualan ikut
            // dibatalkan - lebih baik kasir dapat error dan transaksi tidak
            // jadi daripada ada penjualan tanpa jadwal padahal kasir sudah
            // mengetik "3x cicilan".
            if (! empty($validated['installment_months'])) {
                $plan = InstallmentPlan::create([
                    'direction' => 'receivable',
                    'sale_id' => $sale->id,
                    'months' => (int) $validated['installment_months'],
                    'user_id' => $request->user()->id,
                ]);

                $installments = app(InstallmentService::class);
                $installments->generate($plan, (int) $validated['installment_months'], $total, $validated['date']);
            }

            return $sale;
        });

        return response()->json(
            $sale->load('customer', 'items.product', 'payments', 'installmentPlan.installments'),
            201
        );
    }

    public function show($id)
    {
        // `installmentPlan.installments` ikut dimuat supaya form edit tahu
        // penjualan ini dicicilkan berapa bulan, dan supaya kasir bisa lihat
        // jadwal tanpa harus membuka halaman angsuran terpisah.
        $sale = Sale::with('customer', 'items.product', 'payments', 'installmentPlan.installments')->findOrFail($id);

        return response()->json($sale);
    }

    public function update(Request $request, $id)
    {
        $sale = Sale::with('items', 'payments')->findOrFail($id);

        if ($request->due_date === '') $request->merge(['due_date' => null]);

        $validated = $request->validate([
            'date' => 'required|date',
            'customer_id' => 'required|exists:customers,id',
            'note' => 'nullable|string',
            'payment' => 'nullable|numeric|min:0',
            'due_date' => 'nullable|date|after_or_equal:date',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|exists:products,id',
            'items.*.quantity' => 'required|integer|min:1',
            'items.*.sell_price' => 'required|numeric|min:0',
            // Opsional: kalau tidak dikirim, produk pakai satuan basics
            // (base) sehingga form lama yang cuma kirim product_id/quantity
            // tetap jalan. `unit_name` disimpan sebagai fallback supaya
            // dokumen lama/lama tidak gagal.
            'items.*.unit_id' => 'nullable|integer|exists:product_units,id',
            'items.*.unit_name' => 'nullable|string|max:255',
        ]);

        $sale = DB::transaction(function () use ($validated, $sale, $request) {
            foreach ($sale->items as $oldItem) {
                $product = Product::lockForUpdate()->find($oldItem->product_id);
                $stockBefore = (int) $product->stock;
                // Item lama bisa jadi item sebelum fitur satuan ada, jadi
                // `base_quantity` masih NULL. Fallback ke `quantity` benar
                // karena waktu itu semua satuan bernilai 1.
                $oldBase = (int) ($oldItem->base_quantity ?? $oldItem->quantity);
                $product->increment('stock', $oldBase);

                // Movement bersifat append-only: pembatalan ditulis sebagai baris
                // `sale_reverse` (quantity negatif = stok kembali masuk), bukan
                // menghapus riwayat. Menghapus baris membuat kartu stok & laba-rugi
                // melenceng karena riwayat jadi tidak bisa diaudit.
                StockMovement::create([
                    'product_id' => $oldItem->product_id,
                    'type' => 'sale_reverse',
                    'quantity' => -1 * $oldBase,
                    'unit_name' => $oldItem->unit_name,
                    'base_quantity' => $oldBase,
                    'stock_before' => $stockBefore,
                    'stock_after' => $stockBefore + $oldBase,
                    'reference_type' => 'App\\Models\\Sale',
                    'reference_id' => $sale->id,
                    'date' => $validated['date'],
                    'user_id' => $request->user()->id,
                ]);
            }

            $sale->items()->delete();

            [$products, $resolvedItems] = $this->lockAndValidateProducts($validated['items']);

            $total = 0;
            $itemsData = [];

            foreach ($resolvedItems as $item) {
                $product = $products[$item['product_id']];

                $subtotal = $item['quantity'] * $item['sell_price'];
                $total += $subtotal;

                $itemsData[] = [
                    'product_id' => $item['product_id'],
                    'unit_name' => $item['_unit']->name,
                    'unit_factor' => $item['_unit']->factor,
                    'base_quantity' => $item['_base_quantity'],
                    'quantity' => $item['quantity'],
                    'sell_price' => $item['sell_price'],
                    'buy_price' => round((float) $product->buy_price * $item['_unit']->factor, 2),
                    'subtotal' => $subtotal,
                ];
            }

            $payment = $request->has('payment') ? floatval($request->payment) : floatval($sale->payment);
            $receivable = $total - $payment;

            if ($payment >= $total) {
                $paymentStatus = 'paid';
                $receivable = 0;
            } elseif ($payment > 0) {
                $paymentStatus = 'partial';
            } else {
                $paymentStatus = 'unpaid';
            }

            $sale->update([
                'date' => $validated['date'],
                'customer_id' => $validated['customer_id'],
                'total' => $total,
                'payment' => $payment,
                'receivable' => $receivable,
                'due_date' => $validated['due_date'] ?? null,
                'payment_status' => $paymentStatus,
                'note' => $validated['note'] ?? null,
            ]);

            // Kalau penjualan ini dicicilkan, nominal angsuran ikut
            // mengikuti total yang baru, dan tanggal jatuh temponya dihitung
            // ulang dari tanggal penjualan yang baru. Tanpa ini, jadwal akan
            // menjumlah ke total lama sementara `sales.total` sudah berubah.
            $installments = app(InstallmentService::class);
            $installments->resync($installments->planFor($sale));

            $sale->items()->createMany($itemsData);

            foreach ($resolvedItems as $item) {
                $product = $products[$item['product_id']] ?? ($item['_product'] ?? Product::find($item['product_id']));
                $stockBefore = $product->stock;
                $product->decrement('stock', $item['_base_quantity']);

                StockMovement::create([
                    'product_id' => $item['product_id'],
                    'type' => 'sale',
                    'quantity' => $item['_base_quantity'],
                    'unit_name' => $item['_unit']->name,
                    'base_quantity' => $item['_base_quantity'],
                    'stock_before' => $stockBefore,
                    'stock_after' => $stockBefore - $item['_base_quantity'],
                    'reference_type' => 'App\\Models\\Sale',
                    'reference_id' => $sale->id,
                    'date' => $validated['date'],
                    'user_id' => $request->user()->id,
                ]);
            }

            $customer = Customer::lockForUpdate()->find($validated['customer_id']);
            $totalReceivable = Sale::where('customer_id', $validated['customer_id'])
                ->whereIn('payment_status', ['unpaid', 'partial'])
                ->where('id', '!=', $sale->id)
                ->sum('receivable');
            $customer->update(['total_receivable' => $totalReceivable + $receivable]);

            return $sale;
        });

        return response()->json($sale->load('customer', 'items.product', 'payments'));
    }

    public function destroy(Request $request, $id)
    {
        $sale = Sale::with('items')->findOrFail($id);

        DB::transaction(function () use ($sale, $request) {
            foreach ($sale->items as $item) {
                $product = Product::lockForUpdate()->find($item->product_id);
                $stockBefore = (int) $product->stock;
                $base = (int) ($item->base_quantity ?? $item->quantity);
                $product->increment('stock', $base);

                StockMovement::create([
                    'product_id' => $item->product_id,
                    'type' => 'sale_reverse',
                    'quantity' => -1 * $base,
                    'unit_name' => $item->unit_name,
                    'base_quantity' => $base,
                    'stock_before' => $stockBefore,
                    'stock_after' => $stockBefore + $base,
                    'reference_type' => 'App\\Models\\Sale',
                    'reference_id' => $sale->id,
                    'date' => Carbon::parse($sale->date)->toDateString(),
                    'user_id' => $request->user()->id,
                ]);
            }

            Payment::where('sale_id', $sale->id)->delete();

            $customerId = $sale->customer_id;
            $sale->items()->delete();
            $sale->delete();

            $customer = Customer::lockForUpdate()->find($customerId);
            if ($customer) {
                $totalReceivable = Sale::where('customer_id', $customerId)
                    ->whereIn('payment_status', ['unpaid', 'partial'])
                    ->sum('receivable');
                $customer->update(['total_receivable' => $totalReceivable]);
            }
        });

        return response()->json(['message' => 'Penjualan berhasil dihapus']);
    }
}
