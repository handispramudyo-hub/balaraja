<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Menjamin integritas ledger `stock_movements`.
 *
 * Regresi yang diperbaiki:
 *  - enum `sale_reverse` dibuang migration 2026_09_25, sehingga pembatalan
 *    penjualan tidak punya tipe movement sendiri
 *  - SaleController & PurchaseController MENGHAPUS baris movement saat
 *    update/destroy, menghilangkan jejak audit sehingga kartu stok melenceng
 *  - ReportController::stock hanya menghitung tipe `purchase` & `sale`
 *  - ProductController menimpa kolom `stock` tanpamovement
 */
class StockMovementIntegrityTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Category $category;

    private Customer $customer;

    private Supplier $supplier;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->category = Category::create(['name' => 'Minuman']);
        $this->customer = Customer::create(['code' => 'C001', 'name' => 'Toko Maju']);
        $this->supplier = Supplier::create(['name' => 'PT Sumber']);
    }

    private function product(array $attributes = []): Product
    {
        $this->seq++;

        return Product::create(array_merge([
            'code' => 'P' . str_pad((string) $this->seq, 3, '0', STR_PAD_LEFT),
            'name' => 'Teh Pucuk ' . $this->seq,
            'category_id' => $this->category->id,
            'unit' => 'botol',
            'buy_price' => 10000,
            'sell_price' => 15000,
            'stock' => 100,
            'min_stock' => 0,
        ], $attributes));
    }

    private function makeSale(Product $product, int $qty = 10, string $date = '2026-09-01'): Sale
    {
        $stockBefore = (int) $product->stock;

        $sale = Sale::create([
            'sale_number' => 'INV-' . $product->code . '-' . $date,
            'date' => $date,
            'customer_id' => $this->customer->id,
            'total' => $qty * 15000,
            'payment' => 0,
            'receivable' => $qty * 15000,
            'payment_status' => 'unpaid',
            'user_id' => $this->user->id,
        ]);

        SaleItem::create([
            'sale_id' => $sale->id,
            'product_id' => $product->id,
            'quantity' => $qty,
            'sell_price' => 15000,
            'buy_price' => 10000,
            'subtotal' => $qty * 15000,
        ]);

        $product->forceFill(['stock' => $stockBefore - $qty])->save();

        StockMovement::create([
            'product_id' => $product->id,
            'type' => 'sale',
            'quantity' => $qty,
            'stock_before' => $stockBefore,
            'stock_after' => $stockBefore - $qty,
            'reference_type' => 'App\\Models\\Sale',
            'reference_id' => $sale->id,
            'date' => $date,
            'user_id' => $this->user->id,
        ]);

        return $sale;
    }

    private function makePurchase(Product $product, int $qty = 20, string $date = '2026-09-01'): Purchase
    {
        $stockBefore = (int) $product->stock;

        $purchase = Purchase::create([
            'purchase_number' => 'PO-' . $product->code,
            'date' => $date,
            'supplier_id' => $this->supplier->id,
            'total' => $qty * 10000,
            'user_id' => $this->user->id,
        ]);

        PurchaseItem::create([
            'purchase_id' => $purchase->id,
            'product_id' => $product->id,
            'quantity' => $qty,
            'buy_price' => 10000,
            'subtotal' => $qty * 10000,
        ]);

        $product->forceFill(['stock' => $stockBefore + $qty])->save();

        StockMovement::create([
            'product_id' => $product->id,
            'type' => 'purchase',
            'quantity' => $qty,
            'stock_before' => $stockBefore,
            'stock_after' => $stockBefore + $qty,
            'reference_type' => 'App\\Models\\Purchase',
            'reference_id' => $purchase->id,
            'date' => $date,
            'user_id' => $this->user->id,
        ]);

        return $purchase;
    }

    public function test_destroying_a_sale_writes_a_reversal_and_keeps_history(): void
    {
        $product = $this->product();
        $sale = $this->makeSale($product, 10);

        $this->actingAs($this->user)
            ->deleteJson('/api/sales/' . $sale->id)
            ->assertOk();

        // Riwayat asli harus tetap ada — tidak boleh dihapus.
        $this->assertDatabaseHas('stock_movements', [
            'type' => 'sale',
            'reference_id' => $sale->id,
            'product_id' => $product->id,
            'quantity' => 10,
        ]);

        // Pembatalan dicatat sebagai `sale_reverse` (quantity negatif).
        $this->assertDatabaseHas('stock_movements', [
            'type' => 'sale_reverse',
            'reference_id' => $sale->id,
            'product_id' => $product->id,
            'quantity' => -10,
        ]);

        $this->assertSame(100, (int) $product->fresh()->stock);
    }

    public function test_updating_a_sale_appends_a_reversal_instead_of_deleting_it(): void
    {
        $product = $this->product();
        $sale = $this->makeSale($product, 10);

        $this->actingAs($this->user)->putJson('/api/sales/' . $sale->id, [
            'date' => '2026-09-01',
            'customer_id' => $this->customer->id,
            'payment' => 0,
            'items' => [[
                'product_id' => $product->id,
                'quantity' => 4,
                'sell_price' => 15000,
            ]],
        ])->assertOk();

        $this->assertDatabaseHas('stock_movements', [
            'type' => 'sale', 'reference_id' => $sale->id, 'quantity' => 10,
        ]);
        $this->assertDatabaseHas('stock_movements', [
            'type' => 'sale_reverse', 'reference_id' => $sale->id, 'quantity' => -10,
        ]);
        $this->assertDatabaseHas('stock_movements', [
            'type' => 'sale', 'reference_id' => $sale->id, 'quantity' => 4,
        ]);

        // 100 - 10 (jual) + 10 (batal) - 4 (jual baru)
        $this->assertSame(96, (int) $product->fresh()->stock);
    }

    public function test_destroying_a_purchase_writes_a_reversal_and_keeps_history(): void
    {
        $product = $this->product();
        $purchase = $this->makePurchase($product, 20);

        $this->actingAs($this->user)
            ->deleteJson('/api/purchases/' . $purchase->id)
            ->assertOk();

        $this->assertDatabaseHas('stock_movements', [
            'type' => 'purchase', 'reference_id' => $purchase->id, 'quantity' => 20,
        ]);
        $this->assertDatabaseHas('stock_movements', [
            'type' => 'purchase_reverse', 'reference_id' => $purchase->id, 'quantity' => -20,
        ]);

        $this->assertSame(100, (int) $product->fresh()->stock);
    }

    public function test_stock_report_nets_out_reversals(): void
    {
        $product = $this->product();
        $sale = $this->makeSale($product, 10, '2026-09-01');

        $this->actingAs($this->user)
            ->deleteJson('/api/sales/' . $sale->id)
            ->assertOk();

        $row = collect(
            $this->actingAs($this->user)
                ->getJson('/api/reports/stock?date=2026-09-01')
                ->assertOk()
                ->json('data')
        )->firstWhere('id', $product->id);

        // Masuk/Keluar sengaja BRUTO: penjualan 10 keluar dan pembatalannya
        // 10 masuk terjadi di hari yang sama, jadi keduanya tercatat. Yang
        // harus nol adalah EFEK BERSIHnya — terlihat dari stok_sesudah.
        $this->assertEqualsWithDelta(10.0, (float) $row['stok_keluar'], 0.001);
        $this->assertEqualsWithDelta(10.0, (float) $row['stok_masuk'], 0.001);
        $this->assertEqualsWithDelta(100.0, (float) $row['stok_sesudah'], 0.001);
    }

    public function test_stock_report_keeps_incoming_and_outgoing_separate_on_the_same_day(): void
    {
        $product = $this->product();
        $this->makeSale($product, 10, '2026-09-01');
        $this->makePurchase($product, 4, '2026-09-01');

        $row = collect(
            $this->actingAs($this->user)
                ->getJson('/api/reports/stock?date=2026-09-01')
                ->assertOk()
                ->json('data')
        )->firstWhere('id', $product->id);

        // Net-nya hanya -6, tapi kolom masuk & keluar wajib/bruto terpisah.
        // Stok: 100 - 10 (jual) + 4 (beli) = 94
        $this->assertEqualsWithDelta(4.0, (float) $row['stok_masuk'], 0.001);
        $this->assertEqualsWithDelta(10.0, (float) $row['stok_keluar'], 0.001);
        $this->assertEqualsWithDelta(94.0, (float) $row['stok_sesudah'], 0.001);
    }

    public function test_stock_report_is_accurate_for_a_past_date(): void
    {
        $product = $this->product();
        $this->makeSale($product, 10, '2026-09-01');

        // Stok sekarang 90, jadi sebelum penjualan 01/09 masih 100.
        $before = collect(
            $this->actingAs($this->user)
                ->getJson('/api/reports/stock?date=2026-08-31')
                ->assertOk()
                ->json('data')
        )->firstWhere('id', $product->id);

        $this->assertEqualsWithDelta(100.0, (float) $before['stok_sesudah'], 0.001);

        $after = collect(
            $this->actingAs($this->user)
                ->getJson('/api/reports/stock?date=2026-09-01')
                ->assertOk()
                ->json('data')
        )->firstWhere('id', $product->id);

        $this->assertEqualsWithDelta(90.0, (float) $after['stok_sesudah'], 0.001);
    }

    public function test_product_update_records_an_adjustment_movement(): void
    {
        $product = $this->product();

        $this->actingAs($this->user)->putJson('/api/products/' . $product->id, [
            'name' => $product->name,
            'category_id' => $this->category->id,
            'stock' => 75,
        ])->assertOk();

        $this->assertDatabaseHas('stock_movements', [
            'product_id' => $product->id,
            'type' => 'adjustment',
            'quantity' => -25,
            'stock_before' => 100,
            'stock_after' => 75,
        ]);

        $this->assertSame(75, (int) $product->fresh()->stock);
    }

    public function test_customer_decimal_columns_are_cast_to_float(): void
    {
        $customer = Customer::create([
            'code' => 'C009',
            'name' => 'Toko Kde',
            'credit_limit' => 5000000.55,
            'total_receivable' => 1234500.25,
        ])->fresh();

        $this->assertIsFloat($customer->credit_limit);
        $this->assertIsFloat($customer->total_receivable);
        $this->assertEqualsWithDelta(5000000.55, $customer->credit_limit, 0.01);
        $this->assertEqualsWithDelta(1234500.25, $customer->total_receivable, 0.01);
    }

    public function test_dashboard_charts_group_by_month(): void
    {
        $product = $this->product();
        $this->makeSale($product, 10, now()->format('Y-m-01'));

        $payload = $this->actingAs($this->user)
            ->getJson('/api/dashboard')
            ->assertOk()
            ->json();

        $omzet = $payload['charts']['omzet_chart'];
        $laba = $payload['charts']['laba_chart'];

        $this->assertCount(12, $omzet);
        $this->assertCount(12, $laba);

        $index = (int) now()->month - 1;

        $this->assertSame(now()->format('M'), $omzet[$index]['month']);
        $this->assertEqualsWithDelta(150000.0, (float) $omzet[$index]['value'], 0.01);
        // Omzet 150.000 - modal (10 x 10.000) = 50.000
        $this->assertEqualsWithDelta(50000.0, (float) $laba[$index]['value'], 0.01);
    }
}
