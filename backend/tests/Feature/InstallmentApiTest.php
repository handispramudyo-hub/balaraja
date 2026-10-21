<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Installment;
use App\Models\InstallmentPlan;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\Sale;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Uji jalur HTTP-nya, bukan memanggil service langsung. Tujuannya menangkap
 * hal yang tidak terlihat oleh `InstallmentTest`: apakah frontend bisa membuat
 * penjualan cicilan dengan satu request, apakah alokasi ikut bergerak saat
 * kasir mencatat pembayaran lewat endpoint yang sebenarnya, dan apakah
 * endpoint jadwal melaporkan angka yang benar.
 */
class InstallmentApiTest extends TestCase
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
        $this->customer = Customer::create(['code' => 'C001', 'name' => 'Budi']);
        $this->supplier = Supplier::create(['code' => 'S001', 'name' => 'PT Sumber']);
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

    private function auth(): self
    {
        return $this->actingAs($this->user);
    }

    /** @test */
    public function penjualan_biasa_tidak_membuat_jadwal_cicilan()
    {
        $product = $this->product();

        $this->auth()->postJson('/api/sales', [
            'date' => '2026-09-27',
            'customer_id' => $this->customer->id,
            'items' => [
                ['product_id' => $product->id, 'quantity' => 2, 'sell_price' => 50000],
            ],
        ])->assertCreated();

        $this->assertSame(0, InstallmentPlan::count());
        $this->assertSame(0, Installment::count());
    }

    /** @test */
    public function penjualan_cicilan_membuat_jadwal_lengkap_dalam_satu_request()
    {
        $product = $this->product();

        $response = $this->auth()->postJson('/api/sales', [
            'date' => '2026-09-27',
            'customer_id' => $this->customer->id,
            'installment_months' => 3,
            'items' => [
                ['product_id' => $product->id, 'quantity' => 2, 'sell_price' => 50000],
            ],
        ])->assertCreated();

        // Catatan: Laravel men-snake-case nama relasi saat serialisasi JSON,
        // jadi `installmentPlan()` muncul sebagai `installment_plan` di
        // respons - bukan `installmentPlan`. Ini yang dibaca frontend juga.
        // Total 100.000 / 3 -> 33.333,33 + 33.333,33 + 33.333,34
        $installments = $response->json('installment_plan.installments');
        $this->assertCount(3, $installments);
        $this->assertSame([1, 2, 3], array_column($installments, 'seq'));
        $this->assertSame(
            [33333.33, 33333.33, 33333.34],
            array_map(fn ($r) => round($r['amount'], 2), $installments)
        );
        $this->assertSame(100000.00, round(array_sum(array_column($installments, 'amount')), 2));
        $this->assertEquals(100000, $response->json('receivable'));
        $this->assertSame('unpaid', $response->json('payment_status'));
    }

    /** @test */
    public function jumlah_bulan_di_batas_tolak_422()
    {
        $product = $this->product();

        $this->auth()->postJson('/api/sales', [
            'date' => '2026-09-27',
            'customer_id' => $this->customer->id,
            'installment_months' => 99,
            'items' => [
                ['product_id' => $product->id, 'quantity' => 1, 'sell_price' => 50000],
            ],
        ])->assertStatus(422)->assertJsonValidationErrors('installment_months');
    }

    /** @test */
    public function pembayaran_melalui_endpoint_asli_langsung_menutup_angsuran()
    {
        $product = $this->product();

        $sale = $this->auth()->postJson('/api/sales', [
            'date' => '2026-09-27',
            'customer_id' => $this->customer->id,
            'installment_months' => 3,
            'items' => [
                ['product_id' => $product->id, 'quantity' => 2, 'sell_price' => 50000],
            ],
        ])->assertCreated()->json();

        // Bayar 2 bulan sekaligus harus menutup angsuran 1 dan 2.
        $this->auth()->postJson('/api/payments', [
            'date' => '2026-10-27',
            'customer_id' => $this->customer->id,
            'sale_id' => $sale['id'],
            'amount' => 66666.66,
            'method' => 'cash',
        ])->assertCreated();

        $plan = InstallmentPlan::first();
        $rows = $plan->installments()->get();

        $this->assertSame('paid', $rows[0]->status);
        $this->assertSame('paid', $rows[1]->status);
        $this->assertSame('pending', $rows[2]->status);
        $this->assertSame(66666.66, round($rows->sum('paid_amount'), 2));

        // Sisa piutang di penjualan harus sama dengan sisa angsuran.
        $sale = Sale::find($sale['id']);
        $this->assertSame(33333.34, round((float) $sale->receivable, 2));
        $this->assertSame(33333.34, round($rows[2]->remaining(), 2));
    }

    /** @test */
    public function menghapus_pembayaran_membuka_angsuran_yang_tadinya_lunas()
    {
        $product = $this->product();

        $sale = $this->auth()->postJson('/api/sales', [
            'date' => '2026-09-27',
            'customer_id' => $this->customer->id,
            'installment_months' => 2,
            'items' => [
                ['product_id' => $product->id, 'quantity' => 2, 'sell_price' => 50000],
            ],
        ])->assertCreated()->json();

        $payment = $this->auth()->postJson('/api/payments', [
            'date' => '2026-10-27',
            'customer_id' => $this->customer->id,
            'sale_id' => $sale['id'],
            'amount' => 50000,
            'method' => 'cash',
        ])->assertCreated()->json();

        $this->assertSame(1, Installment::where('status', 'paid')->count());

        $this->auth()->deleteJson('/api/payments/'.$payment['id'])->assertOk();

        $this->assertSame(0, Installment::where('status', 'paid')->count());
        $this->assertSame(0.00, round(Installment::sum('paid_amount'), 2));
        $this->assertSame('active', InstallmentPlan::first()->status);
    }

    /** @test */
    public function pembelian_cicilan_dari_supplier_ikut_punya_jadwal()
    {
        $product = $this->product();

        $response = $this->auth()->postJson('/api/purchases', [
            'date' => '2026-09-27',
            'supplier_id' => $this->supplier->id,
            'installment_months' => 2,
            'items' => [
                ['product_id' => $product->id, 'quantity' => 1, 'buy_price' => 500000],
            ],
        ])->assertCreated();

        $this->assertCount(2, $response->json('installment_plan.installments'));
        $this->assertEquals(500000, $response->json('payable'));

        // Pelunasan supplier lewat endpoint yang sebenarnya.
        $this->auth()->postJson('/api/supplier-payments', [
            'date' => '2026-10-27',
            'supplier_id' => $this->supplier->id,
            'purchase_id' => $response->json('id'),
            'amount' => 250000,
            'method' => 'cash',
        ])->assertCreated();

        $rows = Installment::orderBy('seq')->get();
        $this->assertSame(['paid', 'pending'], $rows->pluck('status')->all());
        $this->assertEquals(250000, round((float) Purchase::find($response->json('id'))->payable, 2));
    }

    /** @test */
    public function pembayaran_di_muka_bersamaan_cicilan_ditolak_ke_sale_dan_purchase()
    {
        $product = $this->product();

        // Kombinasi DP + cicilan harus ditolak di kedua arah. Kalau lolos,
        // `sales.payment`/`supplier_payments` menyatakan pelanggan sudah bayar
        // sementara jadwal tetap menagih seluruh total - pelanggan ditagih
        // dua kali untuk nominal yang sama.
        $this->auth()->postJson('/api/sales', [
            'date' => '2026-09-27',
            'customer_id' => $this->customer->id,
            'payment' => 20000,
            'installment_months' => 3,
            'items' => [
                ['product_id' => $product->id, 'quantity' => 1, 'sell_price' => 50000],
            ],
        ])->assertStatus(422)->assertJsonValidationErrors('payment');

        $this->auth()->postJson('/api/purchases', [
            'date' => '2026-09-27',
            'supplier_id' => $this->supplier->id,
            'payment' => 200000,
            'installment_months' => 2,
            'items' => [
                ['product_id' => $product->id, 'quantity' => 1, 'buy_price' => 500000],
            ],
        ])->assertStatus(422)->assertJsonValidationErrors('payment');

        // Tidak boleh ada transaksi yang tersimpan dari percobaan gagal di atas.
        $this->assertSame(0, Sale::count());
        $this->assertSame(0, Purchase::count());
        $this->assertSame(0, InstallmentPlan::count());

        // `payment: 0` tetap boleh - itu yang dikirim frontend saat cicilan
        // dipilih, jadi field ini harus lolos, bukan ditolak karena bernilai nol.
        $this->auth()->postJson('/api/sales', [
            'date' => '2026-09-27',
            'customer_id' => $this->customer->id,
            'payment' => 0,
            'installment_months' => 3,
            'items' => [
                ['product_id' => $product->id, 'quantity' => 1, 'sell_price' => 50000],
            ],
        ])->assertCreated();
    }

    /** @test */
    public function endpoint_jadwal_melaporkan_progres_sisa_dan_jatuh_tempo()
    {
        $product = $this->product();

        $sale = $this->auth()->postJson('/api/sales', [
            'date' => '2026-09-27',
            'customer_id' => $this->customer->id,
            'installment_months' => 3,
            'items' => [
                ['product_id' => $product->id, 'quantity' => 2, 'sell_price' => 50000],
            ],
        ])->assertCreated()->json();

        $this->auth()->postJson('/api/payments', [
            'date' => '2026-10-27',
            'customer_id' => $this->customer->id,
            'sale_id' => $sale['id'],
            'amount' => 33333.33,
            'method' => 'cash',
        ])->assertCreated();

        $plan = InstallmentPlan::first();
        $detail = $this->auth()->getJson('/api/installment-plans/'.$plan->id)->assertOk()->json();

        $this->assertSame('receivable', $detail['direction']);
        $this->assertSame('active', $detail['status']);
        $this->assertSame(3, $detail['months']);
        $this->assertEquals(100000, $detail['total']);
        $this->assertEquals(33333.33, $detail['paid']);
        $this->assertEquals(66666.67, $detail['outstanding']);
        $this->assertSame(['paid' => 1, 'total' => 3, 'remaining' => 2], $detail['progress']);
        $this->assertSame('Budi', $detail['counterparty_name']);
        // Angsuran 1 jatuh tempo 27 Oktober 2026...
        $this->assertSame('2026-10-27', $detail['installments'][0]['due_date']);
        $this->assertFalse($detail['installments'][0]['overdue']);
        // ...tapi karena sudah dibayar, yang "berikutnya" adalah angsuran 2
        // tanggal 27 November - NOT the one that's already settled.
        $this->assertSame('2026-11-27', $detail['next_due_date']);
        $this->assertSame('2026-11-27', $detail['installments'][1]['due_date']);

        $list = $this->auth()->getJson('/api/installment-plans?direction=receivable')
            ->assertOk()->json();
        $this->assertSame(1, $list['total']);
    }

    /** @test */
    public function mengganti_tenor_lewat_endpoint_tidak_menghapus_pembayaran()
    {
        $product = $this->product();

        $sale = $this->auth()->postJson('/api/sales', [
            'date' => '2026-09-27',
            'customer_id' => $this->customer->id,
            'installment_months' => 3,
            'items' => [
                ['product_id' => $product->id, 'quantity' => 2, 'sell_price' => 50000],
            ],
        ])->assertCreated()->json();

        $this->auth()->postJson('/api/payments', [
            'date' => '2026-10-27',
            'customer_id' => $this->customer->id,
            'sale_id' => $sale['id'],
            'amount' => 33333.33,
            'method' => 'cash',
        ])->assertCreated();

        $plan = InstallmentPlan::first();
        $updated = $this->auth()->putJson('/api/installment-plans/'.$plan->id, [
            'months' => 6,
        ])->assertOk()->json();

        $this->assertSame(6, $updated['months']);
        $this->assertCount(6, $updated['installments']);
        // Sisa = total 100.000 - 33.333,33 yang sudah dibayar.
        $this->assertEquals(66666.67, $updated['outstanding']);
        // Uang 33.333,33 yang sudah masuk tetap tercatat.
        $this->assertEquals(33333.33, $updated['paid']);
        $this->assertSame(1, $updated['progress']['paid']);
        $this->assertSame(100000.00, round(array_sum(array_column($updated['installments'], 'amount')), 2));
    }

    /** @test */
    public function menghapus_plan_tidak_menghapus_pembayaran_yang_sudah_masuk()
    {
        $product = $this->product();

        $sale = $this->auth()->postJson('/api/sales', [
            'date' => '2026-09-27',
            'customer_id' => $this->customer->id,
            'installment_months' => 3,
            'items' => [
                ['product_id' => $product->id, 'quantity' => 2, 'sell_price' => 50000],
            ],
        ])->assertCreated()->json();

        $this->auth()->postJson('/api/payments', [
            'date' => '2026-10-27',
            'customer_id' => $this->customer->id,
            'sale_id' => $sale['id'],
            'amount' => 33333.33,
            'method' => 'cash',
        ])->assertCreated();

        $plan = InstallmentPlan::first();
        $this->auth()->deleteJson('/api/installment-plans/'.$plan->id)->assertOk();

        $this->assertSame(0, Installment::count());
        $this->assertSame(0, InstallmentPlan::count());
        // Pembayaran tetap ada, dan piutang pelanggan tetap benar.
        $this->assertDatabaseHas('payments', ['amount' => 33333.33]);
        $this->assertSame(66666.67, round((float) Sale::find($sale['id'])->receivable, 2));
    }

    /** @test */
    public function mengedit_total_penjualan_menyesuaikan_jadwal_angsuran()
    {
        $product = $this->product();

        $sale = $this->auth()->postJson('/api/sales', [
            'date' => '2026-09-27',
            'customer_id' => $this->customer->id,
            'installment_months' => 3,
            'items' => [
                ['product_id' => $product->id, 'quantity' => 2, 'sell_price' => 50000],
            ],
        ])->assertCreated()->json();

        // Naikkan total jadi 300.000 (6 x 50.000).
        $this->auth()->putJson('/api/sales/'.$sale['id'], [
            'date' => '2026-09-27',
            'customer_id' => $this->customer->id,
            'items' => [
                ['product_id' => $product->id, 'quantity' => 6, 'sell_price' => 50000],
            ],
        ])->assertOk();

        $rows = Installment::orderBy('seq')->get();
        $this->assertSame(300000.00, round($rows->sum('amount'), 2));
        $this->assertSame(100000.00, round($rows[0]->amount, 2));
    }

    /** @test */
    public function menghapus_penjualan_menghapus_jadwalnya()
    {
        $product = $this->product();

        $sale = $this->auth()->postJson('/api/sales', [
            'date' => '2026-09-27',
            'customer_id' => $this->customer->id,
            'installment_months' => 3,
            'items' => [
                ['product_id' => $product->id, 'quantity' => 2, 'sell_price' => 50000],
            ],
        ])->assertCreated()->json();

        $this->auth()->deleteJson('/api/sales/'.$sale['id'])->assertOk();

        $this->assertSame(0, InstallmentPlan::count());
        $this->assertSame(0, Installment::count());
    }
}
