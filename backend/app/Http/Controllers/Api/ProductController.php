<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\StockMovement;
use App\Services\ProductUnitService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ProductController extends Controller
{
    /**
     * Aturan daftar satuan produk.
     *
     * Faktor boleh 0 karena user belum tentu tahu isi kemasan saat produk baru
     * dibuat - yang wajib hanya satu satuan dasar bernilai 1. Satuan lain yang
     * masih 0 ditolak saat dipakai di transaksi, bukan saat disimpan, supaya
     * user tidak terkunci di tengah jalan.
     */
    private const UNIT_RULES = [
        'units' => 'nullable|array|max:12',
        'units.*.id' => 'nullable|integer',
        'units.*.name' => 'required_with:units|string|max:32',
        'units.*.factor' => 'required_with:units|integer|min:0|max:1000000',
        'units.*.is_base' => 'nullable|boolean',
        // Mengganti satuan dasar mengubah angka stok yang sudah dipakai di
        // laporan, jadi harus lewat konfirmasi eksplisit - bukan checkbox
        // yang terseset di form produk.
        'confirm_unit_rebase' => 'nullable|boolean',
    ];

    /**
     * Jalur simpan daftar satuan, dipakai store & update.
     *
     * Ditarik ke sini karena dua jalur itu harus berperilaku persis sama:
     * kalau store bisa mengganti satuan dasar tanpa konfirmasi sementara
     * update tidak bisa, user akan menemukan dua perilaku berbeda dari form
     * yang kelihatan sama.
     *
     * Kalau `confirm_unit_rebase` tidak dikirim, `syncUnits` menolak
     * pergantian satuan dasar dan mengembalikan detail konversinya lewat
     * `meta.preview`, supaya form bisa menampilkan "33 dus (792 btl)" lalu
     * meminta persetujuan.
     *
     * @param  array<string, mixed>  $validated
     */
    private function saveUnits(Product $product, array $validated, ?int $userId = null): void
    {
        $units = $validated['units'] ?? null;

        if (empty($units)) {
            return;
        }

        app(ProductUnitService::class)->syncUnits(
            $product,
            $units,
            (bool) ($validated['confirm_unit_rebase'] ?? false),
            $userId,
        );

        $product->refresh();
    }

    /**
     * Buang key yang bukan kolom `products` sebelum mass-update.
     *
     * Sengaja pakai daftar putih, bukan `unset` satu per satu: setiap key baru
     * yang ditambahkan ke validasi akan otomatis ikut dibuang, jadi tidak ada
     * jalur yang bisa diam-diam menulis kolom yang tidak seharusnya.
     *
     * `stock` tidak termasuk daftar ini. Pada `update` stok tidak boleh
     * di-overwrite diam-diam (ia lewat jalur adjustment), sedangkan pada
     * `store` stok awal memang kolom biasa - makanya opsional di sini.
     *
     * @param  array<string, mixed>  $validated
     * @param  array<int, string>  $extra
     * @return array<string, mixed>
     */
    private function onlyColumns(array $validated, array $extra = []): array
    {
        return array_intersect_key($validated, array_flip(array_merge([
            'code', 'name', 'category_id', 'unit',
            'buy_price', 'sell_price', 'min_stock', 'supplier_id', 'status',
        ], $extra)));
    }

    public function index(Request $request)
    {
        $query = Product::with(['category', 'supplier', 'units']);

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('code', 'like', "%{$search}%");
            });
        }

        $products = $query->get();

        // Form beli/jual mengambil daftar produk dari endpoint ini, jadi satuan
        // dasar harus ikut terkirim - kalau tidak, kasir tidak pernah melihat
        // pilihan satuan selain satuan dasar.
        return response()->json(
            $products->map(fn (Product $product) => $this->present($product))->all()
        );
    }

    public function store(Request $request)
    {
        $validated = $request->validate(array_merge([
            'code'         => 'nullable|string|max:255|unique:products,code',
            'name'         => 'required|string|max:255',
            'category_id'  => 'required|exists:categories,id',
            'unit'         => 'nullable|string|max:255',
            'buy_price'    => 'nullable|numeric|min:0',
            'sell_price'   => 'nullable|numeric|min:0',
            'stock'        => 'nullable|integer|min:0',
            'min_stock'    => 'nullable|integer|min:0',
            'supplier_id'  => 'nullable|exists:suppliers,id',
            'status'       => 'nullable|string|max:255',
        ], self::UNIT_RULES));

        if (empty($validated['code'])) {
            $last = Product::orderBy('id', 'desc')->first();
            $next = 1;
            if ($last && $last->code) {
                $next = intval(substr($last->code, 1)) + 1;
            }
            $validated['code'] = 'P' . str_pad($next, 3, '0', STR_PAD_LEFT);
        }

        // `units` dan `confirm_unit_rebase` bukan kolom `products`, jadi harus
        // dilepas dari mass-update. Tapi `saveUnits` masih membacanya, jadi
        // pemisahan dilakukan di sini, bukan sebelum.
        $product = Product::create($this->onlyColumns($validated, ['stock']));

        // Daftar satuan disimpan setelah produk ada, karena `product_units`
        // menunjuk `products.id`. `products.unit` lalu ikut mengikuti satuan
        // dasar, bukan nilai `unit` yang dikirim form.
        $this->saveUnits($product, $validated, $request->user()->id);

        if ($product->units()->count() === 0 && ! empty($validated['unit'])) {
            // Migration hanya meng-backfill produk yang sudah ada. Produk baru
            // tetap butuh baris satuan dasar, kalau tidak daftar satuan-nya
            // kosong dan form beli/jual tidak punya apa-apa untuk ditampilkan.
            app(ProductUnitService::class)->syncUnits($product, [
                ['name' => $validated['unit'], 'factor' => 1, 'is_base' => true],
            ]);
        }

        $product->refresh();

        $this->recordStockMovement($product, 0, (int) $product->stock, $request, 'Stok awal saat produk dibuat');

        return response()->json($this->present($product->load('units')), 201);
    }

    public function show($id)
    {
        $product = Product::with(['category', 'supplier', 'units'])->findOrFail($id);

        return response()->json($this->present($product));
    }

    public function update(Request $request, $id)
    {
        $product = Product::findOrFail($id);

        $validated = $request->validate(array_merge([
            'code'         => 'nullable|string|max:255|unique:products,code,' . $id,
            'name'         => 'required|string|max:255',
            'category_id'  => 'required|exists:categories,id',
            'unit'         => 'nullable|string|max:255',
            'buy_price'    => 'nullable|numeric|min:0',
            'sell_price'   => 'nullable|numeric|min:0',
            'stock'        => 'nullable|integer|min:0',
            'min_stock'    => 'nullable|integer|min:0',
            'supplier_id'  => 'nullable|exists:suppliers,id',
            'status'       => 'nullable|string|max:255',
        ], self::UNIT_RULES));

        // Stok TIDAK boleh di-overwrite diam-diam. Nilai `stock` dicabut dari
        // mass-update lalu diterapkan lewat movement `adjustment`, supaya kartu
        // stok tetap bisa diaudit. Route adjustment khusus (Gelombang 1B)
        // akan menggantikan jalur ini.
        $requestedStock = $request->filled('stock') ? (int) $request->input('stock') : null;
        unset($validated['stock']);

        DB::transaction(function () use ($validated, $product, $requestedStock, $request) {
            // Rebase mengonversi `stock` dengan rasio isi satuan. Kalau form
            // sekaligus mengirim nilai `stock` lama, angka itu ditimpa
            // sesudahnya dan hasil konversinya hilang - user menekan
            // "konfirmasi", melihat 792 btl, lalu menemukan stoknya balik
            // lagi ke 33 dengan dua baris adjustment yang saling
            // bertentangan. Tolak kombinasinya, jangan pilih salah satu
            // diam-diam.
            if ($requestedStock !== null && ! empty($validated['units'])) {
                if (app(ProductUnitService::class)->changesBaseUnit($product, $validated['units'])) {
                    throw ValidationException::withMessages([
                        'stock' => 'Satuan dasar produk ini sedang diganti, jadi stok tidak bisa '
                            .'diisi ulang sekaligus. Kosongkan kolom stok - nilainya akan '
                            .'dihitung otomatis dari satuan yang baru.',
                    ]);
                }
            }

            // WAJIB dibaca SEBELUM save: setelah save, Eloquent menyinkronkan
            // nilai original sehingga selisih stok tidak bisa dihitung lagi.
            $stockBefore = (int) $product->stock;

            $product->update($this->onlyColumns($validated));

            // Kalau daftar satuan ikut dikirim, `syncUnits` yang memutuskan
            // apakah ini simpan biasa atau pergantian satuan dasar. Kalau perlu
            // konfirmasi, ia melempar ValidationException - yang membuat
            // seluruh transaksi membatal, jadi produk tidak pernah tersimpan
            // setengah jalan.
            $this->saveUnits($product, $validated, $request->user()->id);

            if ($requestedStock === null || $requestedStock === $stockBefore) {
                return;
            }

            $product->forceFill(['stock' => $requestedStock])->save();

            $this->recordStockMovement(
                $product,
                $stockBefore,
                $requestedStock,
                $request,
                'Penyesuaian stok via form produk'
            );
        });

        return response()->json($this->present($product->load('units')));
    }

    /**
     * Ringkasan perubahan satuan dasar, tanpa menyentuh data.
     *
     * Menerima daftar satuan yang sedang di-usulkan, bukan `target_unit_id`.
     * Alasannya faktor isi hanya diketahui dari daftar itu: sistem tidak bisa
     * menebak bahwa satu dus berisi 24 btl. Form mengirim daftar lengkap yang
     * sedang diedit, lalu endpoint ini menjawab "33 dos (792 btl)".
     *
     * Endpoint ini hanya membaca - tidak ada efek samping, jadi form boleh
     * memanggilnya sesering mungkin.
     */
    public function previewUnitRebase(Request $request, $id, ProductUnitService $service)
    {
        $product = Product::with('units')->findOrFail($id);
        $validated = $request->validate(self::UNIT_RULES);

        return response()->json($service->previewRebase($product, $validated['units'] ?? []));
    }

    /**
     * Ganti satuan dasar produk sekaligus mengonversi stoknya.
     *
     * Dipisah dari form produk karena ini satu-satunya operasi yang mengubah
     * makna `products.stock`, jadi harus punya langkah konfirmasi sendiri dan
     * selalu menulis `adjustment` ke kartu stok.
     */
    public function rebaseUnit(Request $request, $id, ProductUnitService $service)
    {
        $product = Product::with('units')->findOrFail($id);
        $validated = $request->validate(self::UNIT_RULES);

        $service->syncUnits($product, $validated['units'] ?? [], confirmed: true, userId: $request->user()->id);

        return response()->json($this->present($product->refresh()->load('units')));
    }

    /**
     * Bentuk respons yang dipakai index, show, store, update, dan rebase,
     * supaya satuan dasar tidak pernah tampil dengan nama berbeda di
     * layar yang berbeda.
     */
    private function present(Product $product): array
    {
        $product->loadMissing('units');

        $data = $product->toArray();
        $data['stock_status'] = $this->getStockStatus($product);
        $data['base_unit'] = $product->units->firstWhere('is_base', true)?->name ?? $product->unit;

        return $data;
    }

    /**
     * Catat perubahan stok sebagai movement `adjustment` (append-only).
     * Melewati pencatatan membuat kartu stok tidak bisa diaudit.
     *
     * Nilai before/after diteruskan eksplisit karena `getOriginal()` hanya
     * valid SEBELUM `save()` dipanggil.
     */
    private function recordStockMovement(
        Product $product,
        int $stockBefore,
        int $stockAfter,
        Request $request,
        string $note
    ): void {
        $delta = $stockAfter - $stockBefore;

        if ($delta === 0) {
            return;
        }

        StockMovement::create([
            'product_id' => $product->id,
            'type' => 'adjustment',
            'quantity' => $delta,
            'unit_name' => $product->units()->where('is_base', true)->value('name') ?? $product->unit,
            'base_quantity' => $stockAfter,
            'stock_before' => $stockBefore,
            'stock_after' => $stockAfter,
            'reference_type' => 'App\\Models\\Product',
            'reference_id' => $product->id,
            'note' => $note,
            'date' => Carbon::today()->toDateString(),
            'user_id' => $request->user()->id,
        ]);
    }

    public function destroy($id)
    {
        $product = Product::findOrFail($id);

        // Cegah FK 1451 (sale_items / purchase_items / stock_movements) jadi
        // 500. Cek dulu apa yang menahan produk, lalu tolak dengan 409.
        $reasons = [];
        $sales = DB::table('sale_items')->where('product_id', $id)->count();
        if ($sales) {
            $reasons[] = $sales . ' item penjualan';
        }
        $purchases = DB::table('purchase_items')->where('product_id', $id)->count();
        if ($purchases) {
            $reasons[] = $purchases . ' item pembelian';
        }
        if ($reasons) {
            return response()->json([
                'message' => 'Produk tidak bisa dihapus karena masih dipakai di '
                    . implode(' dan ', $reasons)
                    . '. Hapus transaksinya dulu.',
            ], 409);
        }

        $product->delete();

        return response()->json(['message' => 'Product deleted']);
    }

    protected function getStockStatus(Product $product): string
    {
        if ($product->stock == 0) {
            return 'habis';
        }

        if ($product->stock <= $product->min_stock) {
            return 'menipis';
        }

        return 'aman';
    }
}
