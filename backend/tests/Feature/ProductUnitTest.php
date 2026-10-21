<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use App\Models\ProductUnit;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\StockMovement;
use App\Models\User;
use App\Services\ProductUnitService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * Satuan produk bebas + konversi antar satuan.
 *
 * Yang dijaga di sini adalah satu hal yang paling mudah rusak tanpa
 * terlihat: `products.stock` hanya punya satu angka, dan maknanya bergantung
 * pada satuan dasar. Kalau ada satu jalur yang menambah/mengurangi stok dengan
 * jumlah yang belum dikonversi, stoknya langsung melenceng - dan karena
 * tidak ada error, yang jadi korban adalah user yang melihat angka salah di
 * laporan.
 *
 * Karena itu test di sini sengaja memakai scenario nyata: beli per dus,
 * jual sebagian per btl, lalu ganti satuan dasar di tengah jalan.
 */
class ProductUnitTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Category $category;

    private ProductUnitService $units;

    private int $seq = 0;

    private int $partySeq = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->category = Category::create(['name' => 'Minuman']);
        $this->units = app(ProductUnitService::class);
    }

    private function supplier(): \App\Models\Supplier
    {
        $this->partySeq++;

        return \App\Models\Supplier::create(['name' => 'PT Sumber '.$this->partySeq]);
    }

    private function customer(): \App\Models\Customer
    {
        $this->partySeq++;

        return \App\Models\Customer::create([
            'name' => 'Warung '.$this->partySeq,
            'code' => 'C'.str_pad((string) $this->partySeq, 3, '0', STR_PAD_LEFT),
        ]);
    }

    private function product(array $overrides = []): Product
    {
        $this->seq++;

        return Product::create(array_merge([
            'code' => 'P'.str_pad((string) $this->seq, 3, '0', STR_PAD_LEFT),
            'name' => 'Teh Pucuk '.$this->seq,
            'category_id' => $this->category->id,
            'buy_price' => 10000,
            'sell_price' => 15000,
            'stock' => 0,
        ], $overrides));
    }

    /**
     * Produk dengan dua satuan: btl (dasar) dan dus (24 btl).
     */
    private function productWithPack(array $overrides = [], int $packSize = 24): Product
    {
        $product = $this->product($overrides);

        $this->units->syncUnits($product, [
            ['name' => 'btl', 'factor' => 1, 'is_base' => true],
            ['name' => 'dus', 'factor' => $packSize, 'is_base' => false],
        ]);

        return $product->refresh();
    }

    private function purchase(Product $product, array $item, array $overrides = []): Purchase
    {
        $res = $this->actingAs($this->user)->postJson('/api/purchases', array_merge([
            'date' => '2026-09-01',
            'supplier_id' => $this->supplier()->id,
            'items' => [array_merge(['product_id' => $product->id, 'buy_price' => 10000], $item)],
        ], $overrides));

        $res->assertCreated();

        return Purchase::findOrFail($res->json('id'));
    }

    private function sale(Product $product, array $item, array $overrides = []): Sale
    {
        $res = $this->actingAs($this->user)->postJson('/api/sales', array_merge([
            'date' => '2026-09-02',
            'customer_id' => $this->customer()->id,
            'items' => [array_merge([
                'product_id' => $product->id,
                'sell_price' => 15000,
            ], $item)],
        ], $overrides));

        $res->assertCreated();

        return Sale::findOrFail($res->json('id'));
    }

    // -----------------------------------------------------------------
    // Daftar satuan
    // -----------------------------------------------------------------

    public function test_saving_units_keeps_products_unit_in_sync_with_the_base()
    {
        $product = $this->product();

        $this->units->syncUnits($product, [
            ['name' => 'btl', 'factor' => 1, 'is_base' => true],
            ['name' => 'dus', 'factor' => 24, 'is_base' => false],
        ]);

        $this->assertSame('btl', $product->refresh()->unit);
        $this->assertDatabaseHas('product_units', [
            'product_id' => $product->id,
            'name' => 'dus',
            'factor' => 24,
            'is_base' => false,
        ]);
    }

    public function test_saving_units_twice_keeps_the_same_unit_ids()
    {
        $product = $this->productWithPack();
        $ids = $product->units()->pluck('id')->all();

        // Kalau baris dihapus lalu dibuat ulang, id berubah setiap simpan.
        // Form yang sedang dibuka akan menunjuk satuan yang sudah tidak ada,
        // dan `target_unit_id` untuk ganti satuan dasar jadi tidak terpakai.
        $this->units->syncUnits($product, [
            ['name' => 'btl', 'factor' => 1, 'is_base' => true],
            ['name' => 'dus', 'factor' => 30, 'is_base' => false],
        ]);

        $this->assertSame($ids, $product->refresh()->units()->pluck('id')->all());
        $this->assertSame(30, (int) $product->units()->where('name', 'dus')->value('factor'));
    }

    public function test_units_require_exactly_one_base()
    {
        $product = $this->product();

        $this->expectException(ValidationException::class);

        $this->units->syncUnits($product, [
            ['name' => 'btl', 'factor' => 1, 'is_base' => false],
            ['name' => 'dus', 'factor' => 24, 'is_base' => false],
        ]);
    }

    public function test_two_base_units_are_rejected()
    {
        $product = $this->product();

        $this->expectException(ValidationException::class);

        $this->units->syncUnits($product, [
            ['name' => 'btl', 'factor' => 1, 'is_base' => true],
            ['name' => 'dus', 'factor' => 1, 'is_base' => true],
        ]);
    }

    public function test_base_unit_factor_must_be_one()
    {
        $product = $this->product();

        $this->expectException(ValidationException::class);

        $this->units->syncUnits($product, [
            ['name' => 'btl', 'factor' => 24, 'is_base' => true],
        ]);
    }

    public function test_duplicate_unit_names_are_rejected()
    {
        $product = $this->product();

        $this->expectException(ValidationException::class);

        $this->units->syncUnits($product, [
            ['name' => 'btl', 'factor' => 1, 'is_base' => true],
            ['name' => 'BTL', 'factor' => 24, 'is_base' => false],
        ]);
    }

    public function test_a_product_always_needs_at_least_one_unit()
    {
        $product = $this->product();

        $this->expectException(ValidationException::class);

        $this->units->syncUnits($product, []);
    }

    public function test_switching_the_base_unit_through_the_unit_form_is_rejected()
    {
        $product = $this->productWithPack();

        // Kalau form produk boleh mengganti satuan dasar tanpa konversi,
        // 33 dus akan dilabeli "btl" tanpa jadi 792. Stoknya salah tanpa
        // ada error, jadi form harus menolak dan mengarahkan ke rebase.
        try {
            $this->units->syncUnits($product, [
                ['name' => 'btl', 'factor' => 1, 'is_base' => false],
                ['name' => 'dus', 'factor' => 24, 'is_base' => true],
            ]);
            $this->fail('Ganti satuan dasar harus ditolak di form satuan.');
        } catch (ValidationException $e) {
            $this->assertStringContainsString('satuan dasar', mb_strtolower($e->getMessage()));
        }

        $this->assertSame('btl', $product->refresh()->unit);
        $this->assertSame(0, (int) $product->stock);
    }

    // -----------------------------------------------------------------
    // Pembelian: stok bertambah dalam satuan dasar
    // -----------------------------------------------------------------

    public function test_buying_in_packs_increases_stock_by_the_pack_size()
    {
        $product = $this->productWithPack();
        $dus = $product->units()->where('name', 'dus')->firstOrFail();

        $purchase = $this->purchase($product, [
            'unit_id' => $dus->id,
            'quantity' => 2,
        ]);

        $this->assertSame(48, (int) $product->refresh()->stock);

        $item = PurchaseItem::findOrFail($purchase->items()->first()->id);
        $this->assertSame('dus', $item->unit_name);
        $this->assertSame(24, $item->unit_factor);
        $this->assertSame(48, $item->base_quantity);
        // `quantity` tetap seperti yang diketik kasir, supaya dokumen dan
        // subtotal tidak berubah bentuk.
        $this->assertSame(2, $item->quantity);
        $this->assertSame(20000.0, (float) $item->subtotal);
    }

    public function test_stock_movement_records_base_quantity()
    {
        $product = $this->productWithPack();
        $dus = $product->units()->where('name', 'dus')->firstOrFail();

        $this->purchase($product, ['unit_id' => $dus->id, 'quantity' => 1]);

        $movement = StockMovement::where('type', 'purchase')->latest('id')->firstOrFail();

        $this->assertSame(24, (int) $movement->quantity);
        $this->assertSame(24, (int) $movement->base_quantity);
        $this->assertSame('dus', $movement->unit_name);
        $this->assertSame(0, (int) $movement->stock_before);
        $this->assertSame(24, (int) $movement->stock_after);
    }

    public function test_buying_without_a_unit_uses_the_base_unit()
    {
        $product = $this->productWithPack();

        $this->purchase($product, ['quantity' => 5]);

        $this->assertSame(5, (int) $product->refresh()->stock);

        $item = PurchaseItem::latest('id')->firstOrFail();
        $this->assertSame('btl', $item->unit_name);
        $this->assertSame(1, $item->unit_factor);
    }

    public function test_an_unknown_unit_is_rejected()
    {
        $product = $this->productWithPack();
        $other = $this->productWithPack([], 12);

        $res = $this->actingAs($this->user)->postJson('/api/purchases', [
            'date' => '2026-09-01',
            'supplier_id' => $this->supplier()->id,
            'items' => [[
                'product_id' => $product->id,
                'unit_id' => $other->units()->where('name', 'dus')->value('id'),
                'quantity' => 1,
                'buy_price' => 10000,
            ]],
        ]);

        $res->assertStatus(422);
        $this->assertSame(0, (int) $product->refresh()->stock);
    }

    public function test_a_unit_without_a_factor_is_rejected()
    {
        $product = $this->productWithPack();
        $dus = $product->units()->where('name', 'dus')->firstOrFail();
        $dus->update(['factor' => 0]);

        $res = $this->actingAs($this->user)->postJson('/api/purchases', [
            'date' => '2026-09-01',
            'supplier_id' => $this->supplier()->id,
            'items' => [[
                'product_id' => $product->refresh()->id,
                'unit_id' => $dus->id,
                'quantity' => 1,
                'buy_price' => 10000,
            ]],
        ]);

        $res->assertStatus(422);
        $this->assertSame(0, (int) $product->refresh()->stock);
    }

    // -----------------------------------------------------------------
    // Penjualan: penjualan sebagian dari satuan besar
    // -----------------------------------------------------------------

    public function test_selling_part_of_a_pack_deducts_only_what_was_sold()
    {
        $product = $this->productWithPack();
        $dus = $product->units()->where('name', 'dus')->firstOrFail();
        $this->purchase($product, ['unit_id' => $dus->id, 'quantity' => 1]);

        $this->assertSame(24, (int) $product->refresh()->stock);

        $sale = $this->sale($product, ['unit_id' => $dus->id, 'quantity' => 1, 'sell_price' => 30000]);
        $this->assertSame(0, (int) $product->refresh()->stock);

        $item = SaleItem::findOrFail($sale->items()->first()->id);
        $this->assertSame('dus', $item->unit_name);
        $this->assertSame(24, $item->unit_factor);
        $this->assertSame(24, $item->base_quantity);
        // HPP per satuan yang terjual ikut dikali faktor, supaya laba satu
        // dus tidak dihitung seolah HPP-nya cuma satu btl.
        $this->assertEqualsWithDelta(240000.0, (float) $item->buy_price, 0.005);
    }

    public function test_selling_single_bottles_from_stock_held_in_bottles()
    {
        $product = $this->productWithPack();
        $this->purchase($product, ['quantity' => 24]);

        $this->sale($product, ['quantity' => 5]);

        $this->assertSame(19, (int) $product->refresh()->stock);
    }

    public function test_selling_more_than_the_stock_in_base_units_is_rejected()
    {
        $product = $this->productWithPack();
        $dus = $product->units()->where('name', 'dus')->firstOrFail();
        $this->purchase($product, ['unit_id' => $dus->id, 'quantity' => 1]);

        // Stok 24 btl. Meminta 2 dus berarti 48 btl - harus ditolak, dan
        // penolakan ini hanya ketahuan kalau stok dibandingkan dalam satuan
        // dasar.
        $res = $this->actingAs($this->user)->postJson('/api/sales', [
            'date' => '2026-09-02',
            'customer_id' => $this->customer()->id,
            'items' => [[
                'product_id' => $product->id,
                'unit_id' => $dus->id,
                'quantity' => 2,
                'sell_price' => 30000,
            ]],
        ]);

        $res->assertStatus(422);
        $this->assertSame(24, (int) $product->refresh()->stock);
    }

    public function test_sale_movement_carries_the_unit_that_was_used()
    {
        $product = $this->productWithPack();
        $dus = $product->units()->where('name', 'dus')->firstOrFail();
        $this->purchase($product, ['unit_id' => $dus->id, 'quantity' => 1]);
        $this->sale($product, ['unit_id' => $dus->id, 'quantity' => 1, 'sell_price' => 30000]);

        $movement = StockMovement::where('type', 'sale')->latest('id')->firstOrFail();

        $this->assertSame(24, (int) $movement->quantity);
        $this->assertSame('dus', $movement->unit_name);
        $this->assertSame(24, (int) $movement->stock_before);
        $this->assertSame(0, (int) $movement->stock_after);
    }

    // -----------------------------------------------------------------
    // Koreksi & hapus: harus mengembalikan jumlah dalam satuan dasar
    // -----------------------------------------------------------------

    public function test_updating_a_sale_returns_the_old_base_quantity()
    {
        $product = $this->productWithPack();
        $dus = $product->units()->where('name', 'dus')->firstOrFail();
        $this->purchase($product, ['unit_id' => $dus->id, 'quantity' => 3]);

        $sale = $this->sale($product, ['unit_id' => $dus->id, 'quantity' => 1, 'sell_price' => 30000]);
        $this->assertSame(48, (int) $product->refresh()->stock);

        $this->actingAs($this->user)->putJson("/api/sales/{$sale->id}", [
            'date' => '2026-09-02',
            'customer_id' => $sale->customer_id,
            'items' => [[
                'product_id' => $product->id,
                'unit_id' => $dus->id,
                'quantity' => 2,
                'sell_price' => 30000,
            ]],
        ])->assertOk();

        // 72 - 48 = 24: satu dus kembali, dua dus keluar.
        $this->assertSame(24, (int) $product->refresh()->stock);
    }

    public function test_deleting_a_sale_returns_the_base_quantity()
    {
        $product = $this->productWithPack();
        $dus = $product->units()->where('name', 'dus')->firstOrFail();
        $this->purchase($product, ['unit_id' => $dus->id, 'quantity' => 2]);

        $sale = $this->sale($product, ['unit_id' => $dus->id, 'quantity' => 1, 'sell_price' => 30000]);
        $this->assertSame(24, (int) $product->refresh()->stock);

        $this->actingAs($this->user)->deleteJson("/api/sales/{$sale->id}")->assertOk();

        $this->assertSame(48, (int) $product->refresh()->stock);
    }

    public function test_updating_a_purchase_reverses_in_base_units()
    {
        $product = $this->productWithPack();
        $dus = $product->units()->where('name', 'dus')->firstOrFail();
        $purchase = $this->purchase($product, ['unit_id' => $dus->id, 'quantity' => 2]);

        $this->assertSame(48, (int) $product->refresh()->stock);

        $this->actingAs($this->user)->putJson("/api/purchases/{$purchase->id}", [
            'date' => '2026-09-01',
            'supplier_id' => $purchase->supplier_id,
            'items' => [[
                'product_id' => $product->id,
                'unit_id' => $dus->id,
                'quantity' => 1,
                'buy_price' => 10000,
            ]],
        ])->assertOk();

        $this->assertSame(24, (int) $product->refresh()->stock);
    }

    public function test_deleting_a_purchase_reverses_in_base_units()
    {
        $product = $this->productWithPack();
        $dus = $product->units()->where('name', 'dus')->firstOrFail();
        $purchase = $this->purchase($product, ['unit_id' => $dus->id, 'quantity' => 2]);

        $this->actingAs($this->user)->deleteJson("/api/purchases/{$purchase->id}")->assertOk();

        $this->assertSame(0, (int) $product->refresh()->stock);
    }

    /**
     * Item lama dibuat sebelum fitur satuan ada, jadi `base_quantity` NULL.
     * reversed-nya harus tetap benar karena waktu itu semua satuan = 1.
     */
    public function test_legacy_items_without_base_quantity_still_reverse_correctly()
    {
        $product = $this->productWithPack();
        $this->purchase($product, ['quantity' => 10]);

        $purchase = Purchase::latest('id')->firstOrFail();
        $item = $purchase->items()->first();
        $item->update(['base_quantity' => null, 'unit_factor' => null, 'unit_name' => null]);

        $this->actingAs($this->user)->deleteJson("/api/purchases/{$purchase->id}")->assertOk();

        $this->assertSame(0, (int) $product->refresh()->stock);
    }

    /**
     * Daftar satuan yang dipakai untuk menurunkan satuan dasar ke btl.
     *
     * Ini skenario yang paling dekat dengan data asli: produk lama hanya
     * punya satu satuan (`dus`) dengan stok 33, lalu pemilik tokoé©šã
     * discovering barang itu sebenarnya dijual per btl. Faktor isi dus hanya
     * diketahui dari daftar ini, jadi sistem tidak boleh menebaknya.
     */
    private function toBottles(int $packSize = 24, string $pack = 'dus', string $base = 'btl'): array
    {
        return [
            ['name' => $base, 'factor' => 1, 'is_base' => true],
            ['name' => $pack, 'factor' => $packSize, 'is_base' => false],
        ];
    }

    /**
     * Produk dalam keadaan lama: satu satuan, faktor 1, stok dalam satuan itu.
     */
    private function legacyProduct(int $stock, string $unit = 'dus', array $prices = []): Product
    {
        $product = $this->product(array_merge(['stock' => $stock, 'unit' => $unit], $prices));
        $this->units->syncUnits($product, [
            ['name' => $unit, 'factor' => 1, 'is_base' => true],
        ]);

        return $product->refresh();
    }

    public function test_rebase_preview_reports_the_conversion_before_it_happens()
    {
        $product = $this->legacyProduct(33);

        // Preview harus menjelaskan asumsi apa yang terjadi, karena ini
        // keputusan yang mengubah angka stok yang sudah terlanjur dipakai di
        // laporan.
        $preview = $this->units->previewRebase($product, $this->toBottles(24));

        $this->assertSame('dus', $preview['from']);
        $this->assertSame('btl', $preview['to']);
        $this->assertSame(24, $preview['factor']);
        $this->assertSame(33, $preview['before']);
        $this->assertSame(792, $preview['after']);
    }

    public function test_rebase_preview_does_not_touch_anything()
    {
        $product = $this->legacyProduct(33);

        $this->units->previewRebase($product, $this->toBottles(24));

        $product->refresh();
        $this->assertSame(33, (int) $product->stock);
        $this->assertSame('dus', $product->unit);
        $this->assertSame(0, StockMovement::where('type', 'adjustment')->count());
    }

    public function test_rebase_converts_stock_and_writes_an_adjustment()
    {
        $product = $this->legacyProduct(33);

        $this->units->syncUnits($product, $this->toBottles(24), confirmed: true, userId: $this->user->id);

        $product->refresh();
        $this->assertSame(792, (int) $product->stock);
        $this->assertSame('btl', $product->unit);

        $movement = StockMovement::where('type', 'adjustment')->latest('id')->firstOrFail();
        $this->assertSame(33, (int) $movement->stock_before);
        $this->assertSame(792, (int) $movement->stock_after);
        $this->assertSame(759, (int) $movement->quantity);
    }

    /**
     * Harga produk dibaca per satuan dasar. Kalau tidak ikut dibagi saat
     * rebase, harga per dus akan dipakai seolah-olah harga per btl dan laba
     * ikut berlipat - dan angka formnya masih terlihat masuk akal.
     */
    public function test_rebase_divides_prices_so_they_keep_meaning_per_base_unit()
    {
        $product = $this->legacyProduct(12, 'dus', ['buy_price' => 240000, 'sell_price' => 300000]);

        $this->units->syncUnits($product, $this->toBottles(24), confirmed: true, userId: $this->user->id);

        $product->refresh();
        $this->assertEqualsWithDelta(10000.0, (float) $product->buy_price, 0.005);
        $this->assertEqualsWithDelta(12500.0, (float) $product->sell_price, 0.005);
    }

    public function test_rebase_divides_prices_even_when_stock_is_zero()
    {
        $product = $this->legacyProduct(0, 'dus', ['buy_price' => 240000, 'sell_price' => 300000]);

        $this->units->syncUnits($product, $this->toBottles(24), confirmed: true, userId: $this->user->id);

        $product->refresh();
        $this->assertSame(0, (int) $product->stock);
        $this->assertEqualsWithDelta(10000.0, (float) $product->buy_price, 0.005);
    }

    public function test_rebase_moves_the_base_flag_to_exactly_one_unit()
    {
        $product = $this->legacyProduct(5);

        $this->units->syncUnits($product, $this->toBottles(24), confirmed: true, userId: $this->user->id);

        $this->assertSame(1, $product->refresh()->units()->where('is_base', true)->count());
        $this->assertTrue((bool) $product->units()->where('name', 'btl')->value('is_base'));
    }

    public function test_rebase_is_refused_without_confirmation_and_changes_nothing()
    {
        $product = $this->legacyProduct(33);

        try {
            $this->units->syncUnits($product, $this->toBottles(24));
            $this->fail('Pergantian satuan dasar harus minta konfirmasi.');
        } catch (\Illuminate\Validation\ValidationException $e) {
            // Pesannya harus berdiri sendiri karena inilah yang dibaca user di
            // form - angka konversinya tidak ada di tempat lain.
            $message = $e->errors()['units'][0];
            $this->assertStringContainsString('33 dus', $message);
            $this->assertStringContainsString('792 btl', $message);
            $this->assertStringContainsString('dibagi 24', $message);
        }

        $product->refresh();
        $this->assertSame(33, (int) $product->stock);
        $this->assertSame('dus', $product->unit);
        $this->assertSame(0, StockMovement::where('type', 'adjustment')->count());
    }

    public function test_rebase_needs_to_know_how_many_base_units_fit_in_the_old_unit()
    {
        $product = $this->legacyProduct(33);

        // Tanpa faktor untuk satuan lama, sistem tidak akan menebak isi dus.
        $this->expectException(\Illuminate\Validation\ValidationException::class);

        $this->units->syncUnits($product, [
            ['name' => 'btl', 'factor' => 1, 'is_base' => true],
            ['name' => 'dus', 'factor' => 0, 'is_base' => false],
        ], confirmed: true, userId: $this->user->id);
    }

    public function test_rebase_needs_the_old_unit_to_stay_in_the_list()
    {
        $product = $this->legacyProduct(33);

        // Menghapus satuan lama sambil mengganti basis membuat ukuran lama
        // tidak diketahui, jadi hasil konversinya tidak bisa dipertanggungjawabkan.
        $this->expectException(\Illuminate\Validation\ValidationException::class);

        $this->units->syncUnits($product, [
            ['name' => 'btl', 'factor' => 1, 'is_base' => true],
        ], confirmed: true, userId: $this->user->id);
    }

    /**
     * Menaikkan satuan dasar tidak pernah bisa tepat: 792 btl adalah 33 dus,
     * bukan 792 dus. Karena `stock` integer, membulatkan berarti selisih fisik
     * barang yang tidak ketahuan - jadi sistem menolak, bukan mengarang angka.
     */
    public function test_the_base_unit_cannot_be_raised_to_a_larger_unit()
    {
        $product = $this->productWithPack(['stock' => 792]);

        $this->expectException(\Illuminate\Validation\ValidationException::class);

        $this->units->syncUnits($product, [
            ['name' => 'btl', 'factor' => 0, 'is_base' => false],
            ['name' => 'dus', 'factor' => 1, 'is_base' => true],
        ], confirmed: true, userId: $this->user->id);
    }

    public function test_editing_only_the_factor_does_not_rebase_the_stock()
    {
        $product = $this->productWithPack(['stock' => 40]);

        // Menaikkan isi dus dari 24 ke 30 TIDAK boleh diam-diam mengubah stok.
        // User mungkin salah ketik, dan mengarang 40 x 30 = 1200 btl akan
        // menghapus 1160 btl dari catatan tanpa jejak.
        $this->units->syncUnits($product, [
            ['name' => 'btl', 'factor' => 1, 'is_base' => true],
            ['name' => 'dus', 'factor' => 30, 'is_base' => false],
        ]);

        $this->assertSame(40, (int) $product->refresh()->stock);
        $this->assertSame(30, (int) $product->units()->where('name', 'dus')->value('factor'));
    }

    /**
     * Data produksi punya `doss` di salah satu produk, sementara produk lain
     * `dos`. Itu hampir pasti salah ketik untuk satuan yang sama, tapi sistem
     * tidak boleh mengaranginya: kalau user menyatakan 1 dos = 1 doss (rasio 1),
     * yang terjadi adalah pengetikan ulang nama, bukan konversi barang.
     */
    public function test_a_ratio_of_one_relabels_the_base_unit_without_moving_stock()
    {
        $product = $this->legacyProduct(49, 'doss', ['buy_price' => 700000]);

        $this->units->syncUnits($product, [
            ['name' => 'doss', 'factor' => 1, 'is_base' => false],
            ['name' => 'dos', 'factor' => 1, 'is_base' => true],
        ], confirmed: true, userId: $this->user->id);

        $product->refresh();
        $this->assertSame('dos', $product->unit);
        $this->assertSame(49, (int) $product->stock);
        $this->assertSame(700000.0, (float) $product->buy_price);
        $this->assertSame(1, $product->units()->where('is_base', true)->count());

        // Jejak auditorsinya harus jujur: nol barang bergerak.
        $movement = StockMovement::where('type', 'adjustment')->latest('id')->firstOrFail();
        $this->assertSame(0, (int) $movement->quantity);
        $this->assertSame(49, (int) $movement->stock_before);
        $this->assertSame(49, (int) $movement->stock_after);
    }

    public function test_the_product_form_will_not_accept_a_stock_value_while_rebasing()
    {
        $product = $this->legacyProduct(33);

        $res = $this->actingAs($this->user)->putJson("/api/products/{$product->id}", [
            'name' => $product->name,
            'category_id' => $product->category_id,
            'units' => $this->toBottles(24),
            'confirm_unit_rebase' => true,
            'stock' => 33,
        ]);

        $res->assertStatus(422);
        $res->assertJsonValidationErrors('stock');

        $product->refresh();
        $this->assertSame(33, (int) $product->stock);
        $this->assertSame('dus', $product->unit);
        $this->assertSame(0, StockMovement::where('type', 'adjustment')->count());
    }

    public function test_the_product_form_still_accepts_a_stock_change_that_is_not_a_rebase()
    {
        $product = $this->productWithPack(['stock' => 40]);

        $res = $this->actingAs($this->user)->putJson("/api/products/{$product->id}", [
            'name' => $product->name,
            'category_id' => $product->category_id,
            'stock' => 45,
            'units' => [
                ['name' => 'btl', 'factor' => 1, 'is_base' => true],
                ['name' => 'dus', 'factor' => 24, 'is_base' => false],
            ],
        ]);

        $res->assertOk();
        $this->assertSame(45, (int) $product->refresh()->stock);
        $this->assertSame(1, StockMovement::where('type', 'adjustment')->count());
    }

    // -----------------------------------------------------------------
    // Putusan: satu produk, satu arti stok
    // -----------------------------------------------------------------

    public function test_stock_equals_the_sum_of_all_movements_for_every_unit_combination()
    {
        $product = $this->productWithPack([], 24);
        $dus = $product->units()->where('name', 'dus')->firstOrFail();

        $this->purchase($product, ['unit_id' => $dus->id, 'quantity' => 2]);   // +48
        $this->sale($product, ['unit_id' => $dus->id, 'quantity' => 1, 'sell_price' => 30000]);  // -24
        $this->purchase($product, ['quantity' => 5]);                            // +5
        $this->sale($product, ['quantity' => 9, 'sell_price' => 15000]);         // -9

        $product->refresh();

        // Arah movement ada di kolom `type`, bukan di `quantity` - `quantity`
        // selalu besarnya. Jadi invariannya dijumlah dari selisih before/after,
        // yang juga sekaligus membuktikan rantai `stock_after` tiap baris
        // saling nyambung tanpa celah.
        $movements = StockMovement::where('product_id', $product->id)->orderBy('id')->get();

        $running = 0;
        foreach ($movements as $movement) {
            $this->assertSame(
                (int) $movement->stock_before,
                $running,
                "stock_before movement #{$movement->id} tidak nyambung dengan baris sebelumnya"
            );
            $running = (int) $movement->stock_after;
        }

        $this->assertSame(20, (int) $product->stock);
        $this->assertSame($running, (int) $product->stock);
    }

    // -----------------------------------------------------------------
    // Endpoint produk
    // -----------------------------------------------------------------

    private function storeProduct(array $overrides = []): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->user)->postJson('/api/products', array_merge([
            'name' => 'Teh Pucuk Baru',
            'category_id' => $this->category->id,
            'stock' => 0,
        ], $overrides));
    }

    public function test_creating_a_product_with_units_saves_the_list_and_the_base_name()
    {
        $res = $this->storeProduct([
            'units' => [
                ['name' => 'btl', 'factor' => 1, 'is_base' => true],
                ['name' => 'dus', 'factor' => 24, 'is_base' => false],
            ],
        ]);

        $res->assertCreated();
        $this->assertSame('btl', $res->json('unit'));
        $this->assertSame('btl', $res->json('base_unit'));
        $this->assertCount(2, $res->json('units'));
    }

    public function test_creating_a_product_without_units_still_gets_one_base_unit()
    {
        // Migration hanya meng-backfill produk yang sudah ada. Produk baru tetap
        // butuh baris satuan dasar, kalau tidak form beli/jual tidak punya
        // apa pun untuk ditampilkan.
        $res = $this->storeProduct(['unit' => 'pcs']);

        $res->assertCreated();
        $this->assertSame('pcs', $res->json('unit'));
        $this->assertCount(1, $res->json('units'));
        $this->assertSame('pcs', $res->json('units.0.name'));
        $this->assertTrue((bool) $res->json('units.0.is_base'));
    }

    public function test_a_new_product_with_a_single_base_unit_can_be_sold_straight_away()
    {
        $res = $this->storeProduct(['unit' => 'pcs', 'stock' => 7]);
        $product = Product::findOrFail($res->json('id'));

        $this->sale($product, ['quantity' => 3]);

        $this->assertSame(4, (int) $product->refresh()->stock);
        $this->assertSame('pcs', SaleItem::latest('id')->firstOrFail()->unit_name);
    }

    public function test_product_list_exposes_units_so_the_sale_form_can_offer_choices()
    {
        $this->productWithPack();

        $res = $this->actingAs($this->user)->getJson('/api/products');
        $res->assertOk();

        $first = $res->json('0');
        $this->assertCount(2, $first['units']);
        $this->assertSame('btl', $first['base_unit']);
    }

    public function test_rebase_preview_endpoint_reports_before_and_after()
    {
        $product = $this->legacyProduct(33, 'dus', ['buy_price' => 240000, 'sell_price' => 300000]);

        $res = $this->actingAs($this->user)->postJson("/api/products/{$product->id}/units/rebase-preview", [
            'units' => $this->toBottles(24),
        ]);

        $res->assertOk();
        $this->assertSame('dus', $res->json('from'));
        $this->assertSame('btl', $res->json('to'));
        $this->assertSame(33, $res->json('before'));
        $this->assertSame(792, $res->json('after'));
        $this->assertSame(24, $res->json('factor'));
        $this->assertEqualsWithDelta(240000.0, (float) $res->json('buy_price_before'), 0.005);
        $this->assertEqualsWithDelta(10000.0, (float) $res->json('buy_price_after'), 0.005);
        $this->assertEqualsWithDelta(300000.0, (float) $res->json('sell_price_before'), 0.005);
        $this->assertEqualsWithDelta(12500.0, (float) $res->json('sell_price_after'), 0.005);

        // Endpoint ini hanya membaca - stok tidak boleh tersentuh.
        $this->assertSame(33, (int) $product->refresh()->stock);
        $this->assertSame('dus', $product->unit);
    }

    public function test_rebase_endpoint_converts_stock_and_prices()
    {
        $product = $this->legacyProduct(10, 'dus', ['buy_price' => 240000, 'sell_price' => 300000]);

        $res = $this->actingAs($this->user)->postJson("/api/products/{$product->id}/units/rebase", [
            'units' => $this->toBottles(24),
        ]);

        $res->assertOk();
        $this->assertSame(240, (int) $res->json('stock'));
        $this->assertSame('btl', $res->json('unit'));
        $this->assertSame('btl', $res->json('base_unit'));
        $this->assertEqualsWithDelta(10000.0, (float) $res->json('buy_price'), 0.005);
        $this->assertEqualsWithDelta(12500.0, (float) $res->json('sell_price'), 0.005);
    }

    public function test_rebase_endpoint_rejects_an_empty_unit_list()
    {
        $product = $this->legacyProduct(10);

        $this->actingAs($this->user)

            ->postJson("/api/products/{$product->id}/units/rebase", ['units' => []])
            ->assertStatus(422);

        $this->assertSame(10, (int) $product->refresh()->stock);
    }

    public function test_rebase_endpoint_rejects_a_list_with_no_base_unit()
    {
        $product = $this->legacyProduct(10);

        $this->actingAs($this->user)
            ->postJson("/api/products/{$product->id}/units/rebase", [
                'units' => [
                    ['name' => 'btl', 'factor' => 1],
                    ['name' => 'dus', 'factor' => 24],
                ],
            ])
            ->assertStatus(422);

        $this->assertSame(10, (int) $product->refresh()->stock);
    }

    public function test_rebase_endpoint_is_refused_for_a_unit_with_no_factor()
    {
        $product = $this->legacyProduct(10);

        $this->actingAs($this->user)
            ->postJson("/api/products/{$product->id}/units/rebase", [
                'units' => [
                    ['name' => 'btl', 'factor' => 1, 'is_base' => true],
                    ['name' => 'dus', 'factor' => 0, 'is_base' => false],
                ],
            ])
            ->assertStatus(422);

        $this->assertSame(10, (int) $product->refresh()->stock);
    }

    public function test_unit_endpoints_require_authentication()
    {
        $product = $this->legacyProduct(10);

        $this->postJson("/api/products/{$product->id}/units/rebase-preview", [
            'units' => $this->toBottles(24),
        ])->assertUnauthorized();

        $this->postJson("/api/products/{$product->id}/units/rebase", [
            'units' => $this->toBottles(24),
        ])->assertUnauthorized();
    }

    public function test_updating_units_through_the_product_form_cannot_change_the_base()
    {
        $product = $this->productWithPack();

        $res = $this->actingAs($this->user)->putJson("/api/products/{$product->id}", [
            'name' => $product->name,
            'category_id' => $this->category->id,
            'units' => [
                ['name' => 'btl', 'factor' => 1, 'is_base' => false],
                ['name' => 'dus', 'factor' => 24, 'is_base' => true],
            ],
        ]);

        $res->assertStatus(422);
        $this->assertSame('btl', $product->refresh()->unit);
    }

    public function test_updating_units_through_the_product_form_keeps_existing_stock()
    {
        $product = $this->productWithPack(['stock' => 40]);

        $this->actingAs($this->user)->putJson("/api/products/{$product->id}", [
            'name' => $product->name,
            'category_id' => $this->category->id,
            'units' => [
                ['name' => 'btl', 'factor' => 1, 'is_base' => true],
                ['name' => 'dus', 'factor' => 24, 'is_base' => false],
                ['name' => 'pak', 'factor' => 100, 'is_base' => false],
            ],
        ])->assertOk();

        $this->assertSame(40, (int) $product->refresh()->stock);
        $this->assertCount(3, $product->units);
    }
}
