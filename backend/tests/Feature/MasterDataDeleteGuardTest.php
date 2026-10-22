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
 * Menjamin penghapusan master data yang masih dipakai transaksi DITOLAK
 * dengan pesan yang bisa dibaca pengguna, bukan error 500 mentah.
 *
 * Regresi yang diperbaiki: `destroy()` pada CustomerController,
 * SupplierController, dan ProductController memanggil `delete()` tanpa cek
 * relasi. MySQL melempar QueryException 1451 (foreign key constraint), yang
 * Laravel balas sebagai 500 tanpa penjelasan. Log produksi 2026-10-21 penuh
 * dengan error ini.
 */
class MasterDataDeleteGuardTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Category $category;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->category = Category::create(['name' => 'Minuman']);
    }

    private function auth(): self
    {
        return $this->actingAs($this->user);
    }

    private function product(): Product
    {
        $this->seq++;

        return Product::create([
            'code' => 'P'.str_pad((string) $this->seq, 3, '0', STR_PAD_LEFT),
            'name' => 'Teh '.$this->seq,
            'category_id' => $this->category->id,
            'buy_price' => 10000,
            'sell_price' => 15000,
            'stock' => 100,
        ]);
    }

    /** @test */
    public function customer_yang_punya_penjualan_tidak_bisa_dihapus()
    {
        $customer = Customer::create(['code' => 'C001', 'name' => 'Budi']);
        $product = $this->product();

        $sale = Sale::create([
            'sale_number' => 'INV-001',
            'date' => '2026-10-21',
            'customer_id' => $customer->id,
            'total' => 15000,
            'payment' => 15000,
            'receivable' => 0,
            'payment_status' => 'paid',
            'user_id' => $this->user->id,
        ]);
        SaleItem::create([
            'sale_id' => $sale->id,
            'product_id' => $product->id,
            'quantity' => 1,
            'sell_price' => 15000,
            'buy_price' => 10000,
            'subtotal' => 15000,
        ]);

        $this->auth()->deleteJson("/api/customers/{$customer->id}")
            ->assertStatus(409)
            ->assertJsonStructure(['message']);

        $this->assertDatabaseHas('customers', ['id' => $customer->id]);
    }

    /** @test */
    public function customer_tanpa_transaksi_tetap_bisa_dihapus()
    {
        $customer = Customer::create(['code' => 'C002', 'name' => 'Siti']);

        $this->auth()->deleteJson("/api/customers/{$customer->id}")
            ->assertOk();

        $this->assertDatabaseMissing('customers', ['id' => $customer->id]);
    }

    /** @test */
    public function supplier_yang_punya_pembelian_tidak_bisa_dihapus()
    {
        $supplier = Supplier::create(['code' => 'S001', 'name' => 'PT Sumber']);
        $product = $this->product();

        $purchase = Purchase::create([
            'purchase_number' => 'PB-001',
            'date' => '2026-10-21',
            'supplier_id' => $supplier->id,
            'total' => 10000,
            'user_id' => $this->user->id,
        ]);
        PurchaseItem::create([
            'purchase_id' => $purchase->id,
            'product_id' => $product->id,
            'quantity' => 1,
            'buy_price' => 10000,
            'subtotal' => 10000,
        ]);

        $this->auth()->deleteJson("/api/suppliers/{$supplier->id}")
            ->assertStatus(409)
            ->assertJsonStructure(['message']);

        $this->assertDatabaseHas('suppliers', ['id' => $supplier->id]);
    }

    /** @test */
    public function supplier_tanpa_pembelian_tetap_bisa_dihapus()
    {
        $supplier = Supplier::create(['code' => 'S002', 'name' => 'CV Makmur']);

        $this->auth()->deleteJson("/api/suppliers/{$supplier->id}")
            ->assertOk();

        $this->assertDatabaseMissing('suppliers', ['id' => $supplier->id]);
    }

    /** @test */
    public function produk_yang_dipakai_penjualan_tidak_bisa_dihapus()
    {
        $customer = Customer::create(['code' => 'C003', 'name' => 'Ani']);
        $product = $this->product();

        $sale = Sale::create([
            'sale_number' => 'INV-002',
            'date' => '2026-10-21',
            'customer_id' => $customer->id,
            'total' => 15000,
            'payment' => 15000,
            'receivable' => 0,
            'payment_status' => 'paid',
            'user_id' => $this->user->id,
        ]);
        SaleItem::create([
            'sale_id' => $sale->id,
            'product_id' => $product->id,
            'quantity' => 1,
            'sell_price' => 15000,
            'buy_price' => 10000,
            'subtotal' => 15000,
        ]);

        $this->auth()->deleteJson("/api/products/{$product->id}")
            ->assertStatus(409)
            ->assertJsonStructure(['message']);

        $this->assertDatabaseHas('products', ['id' => $product->id]);
    }

    /** @test */
    public function produk_tanpa_transaksi_tetap_bisa_dihapus()
    {
        $product = $this->product();

        $this->auth()->deleteJson("/api/products/{$product->id}")
            ->assertOk();

        $this->assertDatabaseMissing('products', ['id' => $product->id]);
    }

    /** @test */
    public function produk_dengan_riwayat_stok_tidak_bisa_dihapus()
    {
        // Regresi: produk yang punya baris `stock_movements` ditahan FK
        // stock_movements_product_id_foreign. Guard awal hanya mengecek
        // sale_items/purchase_items, sehingga delete meledak 500.
        $product = $this->product();

        StockMovement::create([
            'product_id' => $product->id,
            'type' => 'adjustment',
            'quantity' => 5,
            'stock_before' => 100,
            'stock_after' => 105,
            'date' => '2026-10-22',
            'user_id' => $this->user->id,
        ]);

        $this->auth()->deleteJson("/api/products/{$product->id}")
            ->assertStatus(409)
            ->assertJsonStructure(['message']);

        $this->assertDatabaseHas('products', ['id' => $product->id]);
    }
}
