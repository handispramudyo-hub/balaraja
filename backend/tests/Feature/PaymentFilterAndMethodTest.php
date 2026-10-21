<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\Sale;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Menjamin filter tanggal dan enum metode pembayaran benar-benar memfilter.
 *
 * Motivasi: ketiganya pernah rusak tanpa satu pun error yang terlihat.
 *
 * 1. `PaymentsPage.jsx` mengirim `method: 'tunai'`, sementara kolom enum di
 *    database adalah ('cash','transfer','other') dan PaymentController
 *    memvalidasi `in:cash,transfer,other`. Tidak ada mapping di lapisan API,
 *    jadi SETIAP penyimpanan pembayaran piutang ditolak 422 - halaman
 *    pembayaran tidak bisa dipakai sama sekali.
 * 2. `PurchasesPage.jsx` mengirim `start_date`/`end_date`, sementara
 *    `PurchaseController::index` hanya membaca `date_from`/`date_to`.
 * 3. `PaymentsPage.jsx` mengirim `start_date`/`end_date`, sementara
 *    `PaymentController::index` hanya membaca `date` (tunggal).
 *
 * Ketiganya gagal SENGAJA-DIAM: request tetap 200, tabel tetap terisi,
 * hanya hasilnya tidak pernah terfilter atau tidak pernah tersimpan.
 * Test di bawah mengunci perilaku yang benar supaya tidak bisa kembali.
 */
class PaymentFilterAndMethodTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Customer $customer;

    private Supplier $supplier;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->customer = Customer::create(['code' => 'C001', 'name' => 'Toko Maju']);
        $this->supplier = Supplier::create(['name' => 'PT Sumber']);
    }

    private function product(): Product
    {
        $this->seq++;

        return Product::create([
            'code' => 'P'.str_pad((string) $this->seq, 3, '0', STR_PAD_LEFT),
            'name' => 'Teh Pucuk '.$this->seq,
            'buy_price' => 10000,
            'sell_price' => 15000,
            'stock' => 50,
        ]);
    }

    private function saleWithReceivable(string $number, string $date, float $total): Sale
    {
        return Sale::create([
            'sale_number' => $number,
            'date' => $date,
            'customer_id' => $this->customer->id,
            'total' => $total,
            'payment' => 0,
            'receivable' => $total,
            'payment_status' => 'unpaid',
            'user_id' => $this->user->id,
        ]);
    }

    private function purchaseOn(string $date, float $total): Purchase
    {
        return Purchase::create([
            'purchase_number' => 'PB-'.str_replace('-', '', $date),
            'date' => $date,
            'supplier_id' => $this->supplier->id,
            'total' => $total,
            'user_id' => $this->user->id,
        ]);
    }

    /**
     * Setiap metode yang ditawarkan form harus benar-benar bisa disimpan.
     * 'tunai' dan 'lainnya' sengaja ikut diuji: itu nilai yang pernah
     * dikirim PaymentsPage.jsx, dan '@dataProvider' tidak dipakai di repo
     * ini karena metadata doc-comment sudah deprecated di PHPUnit 12.
     */
    public function test_a_payment_can_be_saved_with_every_method_the_form_offers(): void
    {
        $expected = ['cash', 'transfer', 'other'];

        foreach ($expected as $i => $method) {
            $sale = $this->saleWithReceivable('INV-'.$i, '2026-09-01', 50000);

            $res = $this->actingAs($this->user)->postJson('/api/payments', [
                'date' => '2026-09-02',
                'customer_id' => $this->customer->id,
                'sale_id' => $sale->id,
                'amount' => 25000,
                'method' => $method,
            ]);

            $res->assertCreated();
            $this->assertSame($method, $res->json('method'));
        }

        $this->assertDatabaseCount('payments', count($expected));
    }

    public function test_methods_outside_the_database_enum_are_rejected(): void
    {
        $sale = $this->saleWithReceivable('INV-2', '2026-09-01', 50000);

        // Nilai label Bahasa Indonesia harus DITOLAK. Kalau suatu saat
        // frontend mengirim 'tunai' lagi, test ini yang akan menangkapnya.
        $res = $this->actingAs($this->user)->postJson('/api/payments', [
            'date' => '2026-09-02',
            'customer_id' => $this->customer->id,
            'sale_id' => $sale->id,
            'amount' => 25000,
            'method' => 'tunai',
        ]);

        $res->assertStatus(422);
        $res->assertJsonValidationErrors('method');
        $this->assertDatabaseCount('payments', 0);
    }

    public function test_purchase_list_filters_by_the_parameter_names_the_page_actually_sends(): void
    {
        $this->purchaseOn('2026-09-01', 100000);
        $this->purchaseOn('2026-09-15', 200000);
        $this->purchaseOn('2026-10-05', 300000);

        // PurchasesPage mengirim start_date/end_date.
        $res = $this->actingAs($this->user)
            ->getJson('/api/purchases?start_date=2026-09-01&end_date=2026-09-30');
        $res->assertOk();

        $dates = collect($res->json('data'))->pluck('date')->toArray();
        $this->assertCount(2, $dates, 'rentang September harus mengembalikan 2 pembelian');
        foreach ($dates as $date) {
            $this->assertStringStartsWith('2026-09', $date);
        }
    }

    public function test_purchase_list_still_accepts_the_legacy_date_from_and_date_to_aliases(): void
    {
        $this->purchaseOn('2026-09-01', 100000);
        $this->purchaseOn('2026-10-05', 300000);

        $res = $this->actingAs($this->user)
            ->getJson('/api/purchases?date_from=2026-10-01&date_to=2026-10-31');
        $res->assertOk();

        $this->assertCount(1, $res->json('data'), 'alias lama tidak boleh ikut rusak');
    }

    public function test_purchase_search_finds_transactions_beyond_the_first_page(): void
    {
        // Tiga pembelian, tapi yang dicari hanya yang paling lama. Tanpa
        // pencarian, dropdown pelunasan hanya menampilkan baris pertama
        // sehingga transaksi ini terlihat tidak punya utang.
        $this->purchaseOn('2026-09-01', 100000);
        $this->purchaseOn('2026-09-15', 200000);
        $this->purchaseOn('2026-10-05', 300000);

        $res = $this->actingAs($this->user)
            ->getJson('/api/purchases?search=20260901');
        $res->assertOk();

        $numbers = collect($res->json('data'))->pluck('purchase_number');
        $this->assertCount(1, $numbers);
        $this->assertSame('PB-20260901', $numbers->first());

        // Pencarian yang tidak cocok harus kosong, bukan membocorkan semua data.
        $empty = $this->actingAs($this->user)
            ->getJson('/api/purchases?search=TIDAK_ADA');
        $empty->assertOk();
        $this->assertCount(0, $empty->json('data'));
    }

    public function test_sale_search_finds_transactions_beyond_the_first_page(): void
    {
        $this->saleWithReceivable('INV-LAMA', '2026-09-01', 100000);
        $this->saleWithReceivable('INV-BARU', '2026-09-15', 200000);

        $res = $this->actingAs($this->user)
            ->getJson('/api/sales?search=LAMA');
        $res->assertOk();

        $numbers = collect($res->json('data'))->pluck('sale_number');
        $this->assertSame(['INV-LAMA'], $numbers->all());
    }

    public function test_per_page_is_capped_so_the_param_cannot_drain_the_table(): void
    {
        $res = $this->actingAs($this->user)
            ->getJson('/api/purchases?per_page=100000');
        $res->assertOk();

        // Parameternya harus dijepit, bukan dipercaya. Nilai 100000 berarti
        // "semua" kalau tidak dijepit.
        $this->assertSame(200, $res->json('per_page'));
    }

    public function test_payment_list_filters_by_the_date_range_the_page_actually_sends(): void
    {
        $saleA = $this->saleWithReceivable('INV-A', '2026-09-01', 100000);
        $saleB = $this->saleWithReceivable('INV-B', '2026-11-01', 100000);

        Payment::create([
            'payment_number' => 'BY-1', 'date' => '2026-09-05',
            'customer_id' => $this->customer->id, 'sale_id' => $saleA->id,
            'amount' => 10000, 'method' => 'cash', 'user_id' => $this->user->id,
        ]);
        Payment::create([
            'payment_number' => 'BY-2', 'date' => '2026-11-05',
            'customer_id' => $this->customer->id, 'sale_id' => $saleB->id,
            'amount' => 10000, 'method' => 'transfer', 'user_id' => $this->user->id,
        ]);

        $res = $this->actingAs($this->user)
            ->getJson('/api/payments?start_date=2026-09-01&end_date=2026-09-30');
        $res->assertOk();

        $numbers = collect($res->json('data'))->pluck('payment_number')->toArray();
        $this->assertSame(['BY-1'], $numbers, 'hanya pembayaran September yang boleh muncul');
    }

    public function test_payment_list_keeps_the_single_date_filter_working(): void
    {
        $saleA = $this->saleWithReceivable('INV-A', '2026-09-01', 100000);

        Payment::create([
            'payment_number' => 'BY-1', 'date' => '2026-09-05',
            'customer_id' => $this->customer->id, 'sale_id' => $saleA->id,
            'amount' => 10000, 'method' => 'cash', 'user_id' => $this->user->id,
        ]);

        $res = $this->actingAs($this->user)->getJson('/api/payments?date=2026-09-05');
        $res->assertOk();
        $this->assertCount(1, $res->json('data'));

        $empty = $this->actingAs($this->user)->getJson('/api/payments?date=2026-09-06');
        $empty->assertOk();
        $this->assertCount(0, $empty->json('data'));
    }
}
