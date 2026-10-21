<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\SupplierPayment;
use App\Models\User;
use App\Services\DocumentNumberService;
use App\Services\PurchasePayableService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Utang pembelian / pelunasan ke supplier.
 *
 * Yang paling dijaga di sini adalah satu invarian:
 *
 *     purchases.payable  ==  total - SUM(supplier_payments.amount)
 *
 * `payable` adalah angka yang dibaca daftar transaksi, laporan, dan kartu
 * supplier. Karena itu ia denormalisasi, dan denormalisasi bisa melenceng
 * tanpa jejak. Test terakhir (`test_payable_always_matches...`) memeriksa
 * invarian itu setelah SETIAP operasi, jadi satu jalur yang lupa
 * menghitung ulang akan ketahuan di sini dan bukan dari user yang melihat
 * angka utang salah.
 */
class SupplierDebtTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Supplier $supplier;

    private Category $category;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->category = Category::create(['name' => 'Minuman']);
        $this->supplier = Supplier::create(['name' => 'PT Sumber']);
    }

    private function product(): Product
    {
        $this->seq++;

        return Product::create([
            'code' => 'P'.str_pad((string) $this->seq, 3, '0', STR_PAD_LEFT),
            'name' => 'Teh Pucuk '.$this->seq,
            'category_id' => $this->category->id,
            'buy_price' => 10000,
            'sell_price' => 15000,
            'stock' => 0,
        ]);
    }

    /**
     * Buat pembelian lewat API supaya amount, payable, dan status benar-benar
     * melewati jalur produksi - bukan diisi manual.
     */
    private function createPurchase(array $overrides = []): Purchase
    {
        $payload = array_merge([
            'date' => '2026-09-01',
            'supplier_id' => $this->supplier->id,
            'items' => [
                ['product_id' => $this->product()->id, 'quantity' => 10, 'buy_price' => 10000],
            ],
        ], $overrides);

        $res = $this->actingAs($this->user)->postJson('/api/purchases', $payload);
        $res->assertCreated();

        return Purchase::findOrFail($res->json('id'));
    }

    private function pay(Purchase $purchase, float $amount, string $method = 'cash', array $extra = [])
    {
        return $this->actingAs($this->user)->postJson('/api/supplier-payments', array_merge([
            'date' => '2026-09-05',
            'supplier_id' => $this->supplier->id,
            'purchase_id' => $purchase->id,
            'amount' => $amount,
            'method' => $method,
        ], $extra));
    }

    private function assertPayableConsistent(Purchase $purchase): void
    {
        $purchase->refresh();
        $expected = round((float) $purchase->total - (float) $purchase->supplierPayments()->sum('amount'), 2);

        $this->assertEqualsWithDelta(
            $expected,
            (float) $purchase->payable,
            0.005,
            'payable tidak cocok dengan total - SUM(pembayaran)'
        );

        $this->assertEqualsWithDelta(
            $expected,
            $purchase->remainingPayable(),
            0.005,
            'remainingPayable() tidak cocok dengan payable yang tersimpan'
        );
    }

    // -----------------------------------------------------------------
    // Pembuatan transaksi
    // -----------------------------------------------------------------

    public function test_a_new_purchase_is_entirely_payable(): void
    {
        $purchase = $this->createPurchase();

        $this->assertEqualsWithDelta(100000.0, (float) $purchase->total, 0.001);
        $this->assertEqualsWithDelta(100000.0, (float) $purchase->payable, 0.001);
        $this->assertSame('unpaid', $purchase->payment_status);
        $this->assertDatabaseCount('supplier_payments', 0);

        $this->assertPayableConsistent($purchase);
    }

    public function test_a_purchase_can_be_created_with_an_initial_down_payment(): void
    {
        $purchase = $this->createPurchase(['payment' => 40000, 'payment_method' => 'transfer']);

        $this->assertEqualsWithDelta(100000.0, (float) $purchase->total, 0.001);
        $this->assertEqualsWithDelta(60000.0, (float) $purchase->payable, 0.001);
        $this->assertSame('partial', $purchase->payment_status);

        // WAJIB ada baris pembayaran, bukan cuma angka payable yang mengecil.
        // Kalau tidak, transaksi terlihat "sudah sebagian lunas" padahal tidak
        // ada uang masuk yang bisa ditelusuri.
        $this->assertDatabaseCount('supplier_payments', 1);
        $this->assertDatabaseHas('supplier_payments', [
            'purchase_id' => $purchase->id,
            'amount' => 40000,
            'method' => 'transfer',
        ]);

        $this->assertPayableConsistent($purchase);
    }

    public function test_a_purchase_created_fully_paid_is_marked_paid(): void
    {
        $purchase = $this->createPurchase(['payment' => 100000]);

        $this->assertEqualsWithDelta(0.0, (float) $purchase->payable, 0.001);
        $this->assertSame('paid', $purchase->payment_status);
        $this->assertPayableConsistent($purchase);
    }

    public function test_an_initial_payment_larger_than_the_total_is_rejected(): void
    {
        $res = $this->actingAs($this->user)->postJson('/api/purchases', [
            'date' => '2026-09-01',
            'supplier_id' => $this->supplier->id,
            'payment' => 150000,
            'items' => [
                ['product_id' => $this->product()->id, 'quantity' => 10, 'buy_price' => 10000],
            ],
        ]);

        $res->assertStatus(422);
        $res->assertJsonValidationErrors('payment');
        $this->assertDatabaseCount('purchases', 0);
        $this->assertDatabaseCount('supplier_payments', 0);
    }

    // -----------------------------------------------------------------
    // Pelunasan
    // -----------------------------------------------------------------

    public function test_paying_partially_reduces_the_remaining_debt(): void
    {
        $purchase = $this->createPurchase();

        $this->pay($purchase, 30000)->assertCreated();

        $purchase->refresh();
        $this->assertEqualsWithDelta(70000.0, (float) $purchase->payable, 0.001);
        $this->assertSame('partial', $purchase->payment_status);
        $this->assertPayableConsistent($purchase);
    }

    public function test_paying_the_exact_remaining_debt_marks_it_paid(): void
    {
        $purchase = $this->createPurchase();
        $this->pay($purchase, 30000)->assertCreated();

        $this->pay($purchase->fresh(), 70000)->assertCreated();

        $purchase->refresh();
        $this->assertEqualsWithDelta(0.0, (float) $purchase->payable, 0.001);
        $this->assertSame('paid', $purchase->payment_status);
        $this->assertPayableConsistent($purchase);
    }

    public function test_a_payment_larger_than_the_remaining_debt_is_rejected(): void
    {
        $purchase = $this->createPurchase();

        $res = $this->pay($purchase, 150000);
        $res->assertStatus(422);
        $res->assertJsonValidationErrors('amount');

        $this->assertDatabaseCount('supplier_payments', 0);
        $purchase->refresh();
        $this->assertEqualsWithDelta(100000.0, (float) $purchase->payable, 0.001);
        $this->assertSame('unpaid', $purchase->payment_status);
    }

    public function test_paying_the_exact_remaining_debt_is_accepted_despite_rounding(): void
    {
        // Sisa yang tidak genap: 100000 - 33333.33 = 66666.67
        $purchase = $this->createPurchase([
            'items' => [
                ['product_id' => $this->product()->id, 'quantity' => 3, 'buy_price' => 33333.33],
            ],
        ]);
        $this->pay($purchase, 33333.33)->assertCreated();

        $purchase->refresh();
        $remaining = (float) $purchase->payable;

        $this->pay($purchase, $remaining)->assertCreated();

        $purchase->refresh();
        $this->assertSame('paid', $purchase->payment_status);
        $this->assertEqualsWithDelta(0.0, (float) $purchase->payable, 0.001);
    }

    public function test_a_payment_cannot_be_attached_to_another_suppliers_purchase(): void
    {
        $purchase = $this->createPurchase();
        $other = Supplier::create(['name' => 'PT Lain']);

        $res = $this->pay($purchase, 10000, 'cash', ['supplier_id' => $other->id]);

        $res->assertStatus(422);
        $res->assertJsonValidationErrors('purchase_id');
        $this->assertDatabaseCount('supplier_payments', 0);
    }

    public function test_payment_methods_outside_the_database_enum_are_rejected(): void
    {
        $purchase = $this->createPurchase();

        // 'tunai' adalah label Indonesia, bukan nilai enum. Ini bug yang
        // pernah membuat SETIAP pembayaran piutang gagal 422; test ini
        // menjaganya tidak terjadi di sisi supplier.
        $res = $this->pay($purchase, 10000, 'tunai');
        $res->assertStatus(422);
        $res->assertJsonValidationErrors('method');
        $this->assertDatabaseCount('supplier_payments', 0);
    }

    // -----------------------------------------------------------------
    // Ubah & hapus pembayaran
    // -----------------------------------------------------------------

    public function test_raising_a_payment_amount_recalculates_the_remaining_debt(): void
    {
        $purchase = $this->createPurchase();
        $paymentId = $this->pay($purchase, 10000)->json('id');

        $this->actingAs($this->user)->putJson("/api/supplier-payments/{$paymentId}", [
            'date' => '2026-09-05',
            'supplier_id' => $this->supplier->id,
            'purchase_id' => $purchase->id,
            'amount' => 40000,
            'method' => 'cash',
        ])->assertOk();

        $purchase->refresh();
        $this->assertEqualsWithDelta(60000.0, (float) $purchase->payable, 0.001);
        $this->assertPayableConsistent($purchase);
    }

    public function test_raising_a_payment_above_the_remaining_debt_is_rejected(): void
    {
        $purchase = $this->createPurchase();
        $paymentId = $this->pay($purchase, 10000)->json('id');

        $res = $this->actingAs($this->user)->putJson("/api/supplier-payments/{$paymentId}", [
            'date' => '2026-09-05',
            'supplier_id' => $this->supplier->id,
            'purchase_id' => $purchase->id,
            'amount' => 200000,
            'method' => 'cash',
        ]);

        $res->assertStatus(422);
        $res->assertJsonValidationErrors('amount');
        $this->assertPayableConsistent($purchase);
    }

    public function test_deleting_a_payment_restores_the_remaining_debt(): void
    {
        $purchase = $this->createPurchase();
        $paymentId = $this->pay($purchase, 40000)->json('id');

        $purchase->refresh();
        $this->assertSame('partial', $purchase->payment_status);

        $this->actingAs($this->user)->deleteJson("/api/supplier-payments/{$paymentId}")->assertOk();

        $purchase->refresh();
        $this->assertEqualsWithDelta(100000.0, (float) $purchase->payable, 0.001);
        $this->assertSame('unpaid', $purchase->payment_status);
        $this->assertPayableConsistent($purchase);
    }

    public function test_deleting_the_last_payment_returns_a_paid_purchase_to_unpaid(): void
    {
        $purchase = $this->createPurchase();
        $paymentId = $this->pay($purchase, 100000)->json('id');

        $purchase->refresh();
        $this->assertSame('paid', $purchase->payment_status);

        $this->actingAs($this->user)->deleteJson("/api/supplier-payments/{$paymentId}")->assertOk();

        $purchase->refresh();
        $this->assertSame('unpaid', $purchase->payment_status);
        $this->assertEqualsWithDelta(100000.0, (float) $purchase->payable, 0.001);
    }

    // -----------------------------------------------------------------
    // Interaksi dengan edit & hapus transaksi pembelian
    // -----------------------------------------------------------------

    public function test_a_purchase_with_payments_cannot_be_deleted(): void
    {
        $purchase = $this->createPurchase();
        $this->pay($purchase, 50000)->assertCreated();

        $res = $this->actingAs($this->user)->deleteJson("/api/purchases/{$purchase->id}");

        $res->assertStatus(422);
        $res->assertJsonValidationErrors('purchase');
        $this->assertDatabaseHas('purchases', ['id' => $purchase->id]);
        $this->assertPayableConsistent($purchase);
    }

    public function test_a_purchase_with_payments_cannot_change_supplier(): void
    {
        $purchase = $this->createPurchase();
        $this->pay($purchase, 50000)->assertCreated();

        $other = Supplier::create(['name' => 'PT Lain']);

        $res = $this->actingAs($this->user)->putJson("/api/purchases/{$purchase->id}", [
            'date' => '2026-09-01',
            'supplier_id' => $other->id,
            'items' => [
                ['product_id' => $this->product()->id, 'quantity' => 10, 'buy_price' => 10000],
            ],
        ]);

        $res->assertStatus(422);
        $res->assertJsonValidationErrors('supplier_id');
        $this->assertSame($this->supplier->id, $purchase->fresh()->supplier_id);
    }

    public function test_lowering_the_total_of_a_partially_paid_purchase_reduces_the_debt(): void
    {
        $purchase = $this->createPurchase();
        $this->pay($purchase, 40000)->assertCreated();
        $purchase->refresh();
        $this->assertEqualsWithDelta(60000.0, (float) $purchase->payable, 0.001);

        // Total turun dari 100.000 ke 60.000, sedangkan 40.000 sudah dibayar.
        $this->actingAs($this->user)->putJson("/api/purchases/{$purchase->id}", [
            'date' => '2026-09-01',
            'supplier_id' => $this->supplier->id,
            'items' => [
                ['product_id' => $this->product()->id, 'quantity' => 6, 'buy_price' => 10000],
            ],
        ])->assertOk();

        $purchase->refresh();
        $this->assertEqualsWithDelta(60000.0, (float) $purchase->total, 0.001);
        $this->assertEqualsWithDelta(20000.0, (float) $purchase->payable, 0.001);
        $this->assertSame('partial', $purchase->payment_status);
        $this->assertPayableConsistent($purchase);
    }

    public function test_raising_the_total_above_what_was_paid_increases_the_debt(): void
    {
        $purchase = $this->createPurchase();
        $this->pay($purchase, 100000)->assertCreated();
        $purchase->refresh();
        $this->assertSame('paid', $purchase->payment_status);

        // Total dinaikkan ke 250.000 padahal 100.000 sudah lunas.
        $this->actingAs($this->user)->putJson("/api/purchases/{$purchase->id}", [
            'date' => '2026-09-01',
            'supplier_id' => $this->supplier->id,
            'items' => [
                ['product_id' => $this->product()->id, 'quantity' => 25, 'buy_price' => 10000],
            ],
        ])->assertOk();

        $purchase->refresh();
        $this->assertEqualsWithDelta(150000.0, (float) $purchase->payable, 0.001);
        $this->assertSame('partial', $purchase->payment_status);
        $this->assertPayableConsistent($purchase);
    }

    public function test_raising_the_total_of_a_purchase_with_no_payment_keeps_it_fully_payable(): void
    {
        $purchase = $this->createPurchase();

        $this->actingAs($this->user)->putJson("/api/purchases/{$purchase->id}", [
            'date' => '2026-09-02',
            'supplier_id' => $this->supplier->id,
            'items' => [
                ['product_id' => $this->product()->id, 'quantity' => 20, 'buy_price' => 10000],
            ],
        ])->assertOk();

        $purchase->refresh();
        $this->assertEqualsWithDelta(200000.0, (float) $purchase->payable, 0.001);
        $this->assertSame('unpaid', $purchase->payment_status);
    }

    public function test_lowering_the_total_below_the_amount_already_paid_is_rejected(): void
    {
        $purchase = $this->createPurchase();
        $this->pay($purchase, 70000)->assertCreated();
        $purchase->refresh();
        $this->assertEqualsWithDelta(30000.0, (float) $purchase->payable, 0.001);

        // Total diturunkan ke 50.000 sementara 70.000 sudah dibayar. Kalau
        // dibiarkan, `payable` jadi 0 dan transaksi ditandai lunas -
        // overpayment 20.000 hilang tanpa tercatat di mana pun.
        $res = $this->actingAs($this->user)->putJson("/api/purchases/{$purchase->id}", [
            'date' => '2026-09-01',
            'supplier_id' => $this->supplier->id,
            'items' => [
                ['product_id' => $this->product()->id, 'quantity' => 5, 'buy_price' => 10000],
            ],
        ]);

        $res->assertStatus(422);
        $res->assertJsonValidationErrors('items');

        // Tidak boleh ada efek samping: total lama dan utangnya utuh.
        $purchase->refresh();
        $this->assertEqualsWithDelta(100000.0, (float) $purchase->total, 0.001);
        $this->assertEqualsWithDelta(30000.0, (float) $purchase->payable, 0.001);
        $this->assertSame('partial', $purchase->payment_status);
        $this->assertPayableConsistent($purchase);
    }

    public function test_a_due_date_before_the_purchase_date_is_rejected(): void
    {
        $res = $this->actingAs($this->user)->postJson('/api/purchases', [
            'date' => '2026-09-20',
            'due_date' => '2026-09-01',
            'supplier_id' => $this->supplier->id,
            'items' => [
                ['product_id' => $this->product()->id, 'quantity' => 10, 'buy_price' => 10000],
            ],
        ]);

        $res->assertStatus(422);
        $res->assertJsonValidationErrors('due_date');
        $this->assertDatabaseCount('purchases', 0);
    }

    public function test_a_due_date_on_the_same_day_is_allowed(): void
    {
        $purchase = $this->createPurchase([
            'date' => '2026-09-20',
            'due_date' => '2026-09-20',
        ]);

        $this->assertSame('2026-09-20', $purchase->due_date->toDateString());
    }

    // -----------------------------------------------------------------
    // Invarian & tampilan
    // -----------------------------------------------------------------

    public function test_payable_always_matches_total_minus_payments_across_many_operations(): void
    {
        $purchase = $this->createPurchase();
        $this->assertPayableConsistent($purchase);

        $this->pay($purchase, 25000)->assertCreated();
        $this->assertPayableConsistent($purchase);

        $this->pay($purchase->fresh(), 25000)->assertCreated();
        $this->assertPayableConsistent($purchase);

        $paymentId = $this->pay($purchase->fresh(), 10000)->json('id');
        $this->assertPayableConsistent($purchase);

        $this->actingAs($this->user)->putJson("/api/supplier-payments/{$paymentId}", [
            'date' => '2026-09-06',
            'supplier_id' => $this->supplier->id,
            'purchase_id' => $purchase->id,
            'amount' => 40000,
            'method' => 'other',
        ])->assertOk();
        $this->assertPayableConsistent($purchase);

        $this->actingAs($this->user)->deleteJson("/api/supplier-payments/{$paymentId}")->assertOk();
        $this->assertPayableConsistent($purchase);

        $purchase->refresh();
        $this->assertSame('partial', $purchase->payment_status);
        $this->assertEqualsWithDelta(50000.0, (float) $purchase->payable, 0.001);
    }

    public function test_supplier_total_debt_sums_only_unsettled_purchases(): void
    {
        $unpaid = $this->createPurchase();
        $this->assertEqualsWithDelta(100000.0, $this->supplier->totalPayable(), 0.001);

        $paid = $this->createPurchase();
        $this->pay($paid, 100000)->assertCreated();

        // Yang lunas tidak boleh ikut dihitung.
        $this->assertEqualsWithDelta(100000.0, $this->supplier->fresh()->totalPayable(), 0.001);

        $this->pay($unpaid, 40000)->assertCreated();
        $this->assertEqualsWithDelta(60000.0, $this->supplier->fresh()->totalPayable(), 0.001);

        $breakdown = $this->supplier->fresh()->payableBreakdown();
        // Setelah dibayar 40.000 dari 100.000, transaksi ini berstatus
        // `partial`, bukan `unpaid`. Sisa utangnya 60.000 dan itu yang
        // masuk ke bucket `partial`.
        $this->assertEqualsWithDelta(0.0, $breakdown['unpaid'], 0.001);
        $this->assertEqualsWithDelta(60000.0, $breakdown['partial'], 0.001);
        $this->assertSame(1, $breakdown['count']);
    }

    public function test_purchase_list_exposes_the_remaining_debt(): void
    {
        $purchase = $this->createPurchase();
        $this->pay($purchase, 30000)->assertCreated();

        $res = $this->actingAs($this->user)->getJson('/api/purchases');
        $res->assertOk();

        $row = $res->json('data.0');
        $this->assertSame('partial', $row['payment_status']);
        $this->assertEqualsWithDelta(70000.0, (float) $row['payable'], 0.001);
        $this->assertEqualsWithDelta(100000.0, (float) $row['total'], 0.001);
    }

    public function test_purchase_list_can_filter_by_payment_status(): void
    {
        $unpaid = $this->createPurchase();
        $paid = $this->createPurchase();
        $this->pay($paid, 100000)->assertCreated();

        $res = $this->actingAs($this->user)->getJson('/api/purchases?payment_status=unpaid');
        $res->assertOk();

        $ids = collect($res->json('data'))->pluck('id');
        $this->assertCount(1, $ids);
        $this->assertSame($unpaid->id, $ids->first());
    }

    public function test_supplier_payments_can_be_listed_and_filtered(): void
    {
        $purchase = $this->createPurchase();
        $this->pay($purchase, 20000, 'cash')->assertCreated();
        $this->pay($purchase, 30000, 'transfer', ['date' => '2026-10-10'])->assertCreated();

        $res = $this->actingAs($this->user)
            ->getJson('/api/supplier-payments?start_date=2026-10-01&end_date=2026-10-31');
        $res->assertOk();

        $this->assertCount(1, $res->json('data'));
        $this->assertEqualsWithDelta(30000.0, (float) $res->json('data.0.amount'), 0.001);
        $this->assertSame($purchase->purchase_number, $res->json('data.0.purchase.purchase_number'));
    }

    public function test_payment_numbers_do_not_collide_with_customer_payments(): void
    {
        $purchase = $this->createPurchase();
        $res = $this->pay($purchase, 10000);

        // Prefix berbeda dari BY (piutang pelanggan). Kalau sama, nomor
        // dokumen akan bentrok saat dipakai sebagai rujukan manual.
        $this->assertStringStartsWith('TB', $res->json('payment_number'));
        $this->assertDatabaseHas('document_sequences', [
            'prefix' => 'TB',
            'doc_date' => '2026-09-05',
        ]);
    }

    public function test_status_helper_matches_the_three_states(): void
    {
        $service = app(PurchasePayableService::class);

        $this->assertSame('unpaid', $service->statusFor(0, 100000));
        $this->assertSame('partial', $service->statusFor(1, 100000));
        $this->assertSame('paid', $service->statusFor(100000, 100000));
        $this->assertSame('paid', $service->statusFor(99999.999, 100000));
    }

    public function test_supplier_api_total_matches_the_model_method(): void
    {
        $partial = $this->createPurchase();
        $this->pay($partial, 40000)->assertCreated();

        $paid = $this->createPurchase();
        $this->pay($paid, 100000)->assertCreated();

        $this->createPurchase();

        $res = $this->actingAs($this->user)->getJson('/api/suppliers');
        $res->assertOk();

        $apiRow = collect($res->json())->firstWhere('id', $this->supplier->id);
        $this->assertNotNull($apiRow, 'supplier tidak muncul di daftar API');

        // Dua definisi yang sama (agregat SQL vs method Eloquent) bisa
        // menyimpang kapan saja kalau salah satunya diedit. Test ini
        // menjaganya tidak: kalau tidak, layar supplier dan kartu utang
        // akan menampilkan angka berbeda untuk supplier yang sama.
        $this->assertEqualsWithDelta(
            $this->supplier->fresh()->totalPayable(),
            (float) $apiRow['total_payable'],
            0.005,
            'total_payable di API dan totalPayable() di model berbeda'
        );

        // 60.000 (partial) + 100.000 (unpaid); yang lunas tidak dihitung.
        $this->assertEqualsWithDelta(160000.0, (float) $apiRow['total_payable'], 0.005);
    }

    public function test_supplier_api_total_is_zero_for_a_supplier_with_no_debt(): void
    {
        $this->pay($this->createPurchase(), 100000)->assertCreated();

        $res = $this->actingAs($this->user)->getJson('/api/suppliers');
        $res->assertOk();

        $apiRow = collect($res->json())->firstWhere('id', $this->supplier->id);
        $this->assertEqualsWithDelta(0.0, (float) $apiRow['total_payable'], 0.005);
    }

    public function test_deleting_a_purchase_with_no_payment_still_works(): void
    {
        $purchase = $this->createPurchase();

        $this->actingAs($this->user)->deleteJson("/api/purchases/{$purchase->id}")->assertOk();

        $this->assertDatabaseMissing('purchases', ['id' => $purchase->id]);
        // Hapus transaksi harus mengembalikan stok, jadi movement pembalik
        // WAJIB ada. Kalau assert ini dibalik, penghapusan tetap terlihat
        // "sukses" padahal stok sudah berkurang permanen.
        $this->assertSame(
            1,
            StockMovement::where('reference_type', 'App\\Models\\Purchase')
                ->where('reference_id', $purchase->id)
                ->where('type', 'purchase_reverse')
                ->count()
        );
    }
}
