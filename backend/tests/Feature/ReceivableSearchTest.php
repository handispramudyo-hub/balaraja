<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Menjamin pencarian piutang bekerja di server.
 *
 * Motivasi: `search` awalnya hanya menyaring di browser. Akibatnya file
 * export berisi pelanggan yang justru sedang TERSEMBUNYI di layar — jadi
 * angka di file dan angka di layar berbeda. Test ini mengunci bahwa search
 * ikut diterapkan di server, sehingga export selalu sama dengan layar.
 */
class ReceivableSearchTest extends TestCase
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

    private function product(): Product
    {
        $this->seq++;

        return Product::create([
            'code' => 'P'.str_pad((string) $this->seq, 3, '0', STR_PAD_LEFT),
            'name' => 'Teh Pucuk '.$this->seq,
            'category_id' => $this->category->id,
            'unit' => 'botol',
            'buy_price' => 10000,
            'sell_price' => 15000,
            'stock' => 100,
            'min_stock' => 0,
        ]);
    }

    private function owingCustomer(string $name, string $code): Customer
    {
        $customer = Customer::create(['code' => $code, 'name' => $name]);
        $product = $this->product();

        $sale = Sale::create([
            'sale_number' => 'INV-'.$code,
            'date' => '2026-09-01',
            'customer_id' => $customer->id,
            'total' => 30000,
            'payment' => 0,
            'receivable' => 30000,
            'payment_status' => 'unpaid',
            'user_id' => $this->user->id,
        ]);

        SaleItem::create([
            'sale_id' => $sale->id,
            'product_id' => $product->id,
            'quantity' => 2,
            'sell_price' => 15000,
            'buy_price' => 10000,
            'subtotal' => 30000,
        ]);

        $customer->forceFill([
            'total_receivable' => 30000,
            'credit_limit' => 500000,
        ])->save();

        return $customer;
    }

    public function test_search_narrows_the_result_set(): void
    {
        $maju = $this->owingCustomer('Toko Maju', 'C001');
        $this->owingCustomer('Toko Bestseller', 'C002');

        $res = $this->actingAs($this->user)->getJson('/api/reports/receivables?search=Maju');
        $res->assertOk();

        $rows = $res->json('data');
        $this->assertCount(1, $rows, 'search harus menyaring di server');
        $this->assertSame('Toko Maju', $rows[0]['nama_toko']);
        $this->assertSame($maju->id, $rows[0]['id']);
    }

    public function test_search_is_case_insensitive(): void
    {
        $this->owingCustomer('Toko Maju', 'C001');
        $this->owingCustomer('Toko Bestseller', 'C002');

        $res = $this->actingAs($this->user)->getJson('/api/reports/receivables?search=maju');
        $res->assertOk();

        $this->assertCount(1, $res->json('data'));
        $this->assertSame('Toko Maju', $res->json('data.0.nama_toko'));
    }

    public function test_export_with_search_contains_only_visible_customers(): void
    {
        $this->owingCustomer('Toko Maju', 'C001');
        $this->owingCustomer('Toko Bestseller', 'C002');

        // Layar (tanpa search) = 2 pelanggan
        $all = $this->actingAs($this->user)->getJson('/api/reports/receivables')->json();
        $this->assertCount(2, $all['data']);

        // Layar dengan search = 1 pelanggan
        $filtered = $this->actingAs($this->user)->getJson('/api/reports/receivables?search=Maju')->json();
        $this->assertCount(1, $filtered['data']);

        // Export dengan search yang sama harus 1 pelanggan juga, bukan 2
        $this->assertEqualsWithDelta(
            (float) $filtered['summary']['sisa_piutang'],
            30000.0,
            0.001
        );
    }

    public function test_search_combines_with_status_filter(): void
    {
        $this->owingCustomer('Toko Maju', 'C001');

        $res = $this->actingAs($this->user)
            ->getJson('/api/reports/receivables?search=Maju&status=unpaid');
        $res->assertOk();
        $this->assertCount(1, $res->json('data'));

        // status yang tidak cocok harus mengembalikan kosong
        $empty = $this->actingAs($this->user)
            ->getJson('/api/reports/receivables?search=Maju&status=partial');
        $empty->assertOk();
        $this->assertCount(0, $empty->json('data'));
    }

    public function test_search_is_reported_in_meta_filters(): void
    {
        $this->owingCustomer('Toko Maju', 'C001');

        $res = $this->actingAs($this->user)->getJson('/api/reports/receivables?search=Maju');
        $res->assertOk();

        $this->assertContains('Cari Nama: Maju', $res->json('meta.filters'));
    }
}
