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
use App\Services\InstallmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Cicilan diuji dari dua sisi sekaligus (piutang pelanggan + utang supplier)
 * karena keduanya berjalan di atas `InstallmentService` yang sama. Kalau suatu
 * aturan jadwal hanya diuji dari satu sisi, bug di sisi lain baru muncul di
 * produksi.
 */
class InstallmentTest extends TestCase
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
            'buy_price' => 10000,
            'sell_price' => 15000,
            'stock' => 0,
        ]);
    }

    private function makeSale(float $total, int $months): Sale
    {
        $customer = Customer::create([
            'code' => 'C'.str_pad((string) ++$this->seq, 3, '0', STR_PAD_LEFT),
            'name' => 'Pelanggan '.$this->seq,
        ]);
        $product = $this->product();

        $sale = Sale::create([
            'sale_number' => 'SL-'.uniqid(),
            'date' => now()->format('Y-m-d'),
            'customer_id' => $customer->id,
            'total' => $total,
            'payment' => 0,
            'receivable' => $total,
            'payment_status' => 'unpaid',
            'user_id' => $this->user->id,
        ]);

        $sale->items()->create([
            'product_id' => $product->id,
            'quantity' => 1,
            'sell_price' => $total,
            'buy_price' => 0,
            'subtotal' => $total,
        ]);

        return $sale;
    }

    private function makePurchase(float $total): Purchase
    {
        $supplier = Supplier::create([
            'code' => 'S'.str_pad((string) ++$this->seq, 3, '0', STR_PAD_LEFT),
            'name' => 'PT Sumber '.$this->seq,
        ]);
        $product = $this->product();

        $purchase = Purchase::create([
            'purchase_number' => 'PB-'.uniqid(),
            'date' => now()->format('Y-m-d'),
            'supplier_id' => $supplier->id,
            'total' => $total,
            'payable' => $total,
            'payment_status' => 'unpaid',
            'user_id' => $this->user->id,
        ]);

        $purchase->items()->create([
            'product_id' => $product->id,
            'quantity' => 1,
            'buy_price' => $total,
            'subtotal' => $total,
        ]);

        return $purchase;
    }

    /** @test */
    public function membagi_total_rata_dan_menyerap_sisa_pembulatan_di_angsuran_terakhir()
    {
        $service = new InstallmentService();

        // 1.000.000 / 3 = 333.333,33 -> 333.333,33 + 333.333,33 + 333.333,34
        $amounts = $service->splitAmounts(1000000, 3);

        $this->assertSame([333333.33, 333333.33, 333333.34], $amounts);
        // Invarian yang diutamakan: jumlah harus PERSIS sama dengan total.
        $this->assertSame(1000000.00, round(array_sum($amounts), 2));
    }

    /** @test */
    public function sisa_pembulatan_tidak_membuat_sisa_yang_tidak_pernah_lunas()
    {
        $service = new InstallmentService();
        $sale = $this->makeSale(10000, 3);

        $plan = InstallmentPlan::create([
            'direction' => 'receivable',
            'sale_id' => $sale->id,
            'months' => 3,
            'user_id' => $this->user->id,
        ]);

        $service->generate($plan, 3, 10000, now()->format('Y-m-d'));

        $rows = $plan->installments()->get();
        $this->assertCount(3, $rows);
        $this->assertSame(10000.00, round($rows->sum('amount'), 2));

        $this->assertSame([1, 2, 3], $rows->pluck('seq')->all());
        $this->assertSame(
            ['3333.33', '3333.33', '3333.34'],
            $rows->pluck('amount')->map(fn ($a) => number_format($a, 2, '.', ''))->all()
        );
    }

    /** @test */
    public function jatuh_tempo_berurutan_satu_bulan_ke_satu_bulan()
    {
        $service = new InstallmentService();

        $this->assertSame('2026-10-27', $service->dueDateFor('2026-09-27', 1)->toDateString());
        $this->assertSame('2026-11-27', $service->dueDateFor('2026-09-27', 2)->toDateString());
        $this->assertSame('2027-09-27', $service->dueDateFor('2026-09-27', 12)->toDateString());
    }

    /** @test */
    public function tanggal_akhir_bulan_tidak_melompat_ke_bulan_berikutnya()
    {
        $service = new InstallmentService();

        // 31 Januari + 1 bulan harus 28 Februari, bukan 3 Maret.
        $this->assertSame('2026-02-28', $service->dueDateFor('2026-01-31', 1)->toDateString());
        // 29 Februari (tahun kabisat) + 1 bulan = 29 Maret. Tidak ada
        // overflow di sini: tanggal 29 itu sah di Maret, jadi clamping hanya
        // terjadi kalau bulan tujuan benar-benar lebih pendek - itulah
        // bedanya dengan `addMonths()` biasa yang melompat ke 29 April.
        $this->assertSame('2028-03-29', $service->dueDateFor('2028-02-29', 1)->toDateString());
        // 30 April + 1 bulan = 30 Mei. Mei punya 31 hari, jadi tidak ada
        // penjepitan sama sekali - tanggal 30 dipertahankan. Perhatikan ini
        // BUKAN "tanggal akhir bulan": 30 April tidak berakhir di 31 Mei.
        $this->assertSame('2026-05-30', $service->dueDateFor('2026-04-30', 1)->toDateString());
        // 31 Agustus + 1 bulan = 30 September: bulan tujuan hanya 30 hari,
        // jadi inilah kasus yang benar-benar dijepit.
        $this->assertSame('2026-09-30', $service->dueDateFor('2026-08-31', 1)->toDateString());
    }

    /** @test */
    public function satu_pembayaran_menutup_angsuran_pertama()
    {
        $service = new InstallmentService();
        $sale = $this->makeSale(3000000, 3);

        $plan = InstallmentPlan::create([
            'direction' => 'receivable',
            'sale_id' => $sale->id,
            'months' => 3,
            'user_id' => $this->user->id,
        ]);
        $service->generate($plan, 3, 3000000, now()->format('Y-m-d'));

        $sale->payments()->create([
            'payment_number' => 'BY-' . uniqid(),
            'date' => now()->format('Y-m-d'),
            'customer_id' => $sale->customer_id,
            'amount' => 1000000,
            'method' => 'cash',
            'user_id' => $this->user->id,
        ]);

        $service->recalculate($plan);

        $rows = $plan->installments()->get();
        $this->assertSame('paid', $rows[0]->status);
        $this->assertSame('pending', $rows[1]->status);
        $this->assertSame('pending', $rows[2]->status);
        $this->assertSame(1000000.00, round($rows->sum('paid_amount'), 2));
    }

    /** @test */
    public function bayar_beberapa_angsuran_sekaligus_menutup_dari_awal_secara_fifo()
    {
        $service = new InstallmentService();
        $sale = $this->makeSale(3000000, 3);

        $plan = InstallmentPlan::create([
            'direction' => 'receivable',
            'sale_id' => $sale->id,
            'months' => 3,
            'user_id' => $this->user->id,
        ]);
        $service->generate($plan, 3, 3000000, now()->format('Y-m-d'));

        // Bayar 2 bulan sekaligus: harus menutup angsuran 1 dan 2.
        $sale->payments()->create([
            'payment_number' => 'BY-' . uniqid(),
            'date' => now()->format('Y-m-d'),
            'customer_id' => $sale->customer_id,
            'amount' => 2000000,
            'method' => 'cash',
            'user_id' => $this->user->id,
        ]);

        $service->recalculate($plan);

        $rows = $plan->installments()->get();
        $this->assertSame(['paid', 'paid', 'pending'], $rows->pluck('status')->all());
        $this->assertSame(2000000.00, round($rows->sum('paid_amount'), 2));
        $this->assertSame('active', $plan->refresh()->status);
    }

    /** @test */
    public function pelunasan_penuh_menandai_plan_completed()
    {
        $service = new InstallmentService();
        $sale = $this->makeSale(3000000, 3);

        $plan = InstallmentPlan::create([
            'direction' => 'receivable',
            'sale_id' => $sale->id,
            'months' => 3,
            'user_id' => $this->user->id,
        ]);
        $service->generate($plan, 3, 3000000, now()->format('Y-m-d'));

        $sale->payments()->create([
            'payment_number' => 'BY-' . uniqid(),
            'date' => now()->format('Y-m-d'),
            'customer_id' => $sale->customer_id,
            'amount' => 3000000,
            'method' => 'transfer',
            'user_id' => $this->user->id,
        ]);

        $service->recalculate($plan);

        $this->assertSame('completed', $plan->refresh()->status);
        $this->assertSame(0.0, $plan->outstanding());
    }

    /** @test */
    public function menghapus_pembayaran_membuka_kembali_angsuran_yang_tadinya_lunas()
    {
        $service = new InstallmentService();
        $sale = $this->makeSale(2000000, 2);

        $plan = InstallmentPlan::create([
            'direction' => 'receivable',
            'sale_id' => $sale->id,
            'months' => 2,
            'user_id' => $this->user->id,
        ]);
        $service->generate($plan, 2, 2000000, now()->format('Y-m-d'));

        $payment = $sale->payments()->create([
            'payment_number' => 'BY-' . uniqid(),
            'date' => now()->format('Y-m-d'),
            'customer_id' => $sale->customer_id,
            'amount' => 2000000,
            'method' => 'cash',
            'user_id' => $this->user->id,
        ]);

        $service->recalculate($plan);
        $this->assertSame('completed', $plan->refresh()->status);

        $payment->delete();
        $service->recalculate($plan);

        $plan->refresh();
        $this->assertSame('active', $plan->status);
        $this->assertSame(['pending', 'pending'], $plan->installments()->pluck('status')->all());
        $this->assertSame(0.00, round($plan->installments()->sum('paid_amount'), 2));
    }

    /** @test */
    public function sisi_utang_supplier_memakai_jadwal_dan_alokasi_yang_sama()
    {
        $service = new InstallmentService();
        $purchase = $this->makePurchase(3000000);

        $plan = InstallmentPlan::create([
            'direction' => 'payable',
            'purchase_id' => $purchase->id,
            'months' => 3,
            'user_id' => $this->user->id,
        ]);
        $service->generate($plan, 3, 3000000, now()->format('Y-m-d'));

        $purchase->supplierPayments()->create([
            'payment_number' => 'TB-' . uniqid(),
            'date' => now()->format('Y-m-d'),
            'supplier_id' => $purchase->supplier_id,
            'amount' => 1000000,
            'method' => 'cash',
            'user_id' => $this->user->id,
        ]);

        $service->recalculate($plan);

        $rows = $plan->installments()->get();
        $this->assertSame(['paid', 'pending', 'pending'], $rows->pluck('status')->all());
        $this->assertSame(1000000.00, round($rows->sum('paid_amount'), 2));
        $this->assertSame(2000000.00, $plan->outstanding());
    }

    /** @test */
    public function mengganti_tenor_tidak_menghapus_riwayat_pembayaran_yang_sudah_masuk()
    {
        $service = new InstallmentService();
        $sale = $this->makeSale(3000000, 3);

        $plan = InstallmentPlan::create([
            'direction' => 'receivable',
            'sale_id' => $sale->id,
            'months' => 3,
            'user_id' => $this->user->id,
        ]);
        $service->generate($plan, 3, 3000000, now()->format('Y-m-d'));

        $sale->payments()->create([
            'payment_number' => 'BY-' . uniqid(),
            'date' => now()->format('Y-m-d'),
            'customer_id' => $sale->customer_id,
            'amount' => 1000000,
            'method' => 'cash',
            'user_id' => $this->user->id,
        ]);
        $service->recalculate($plan);

        // Ubah 3 -> 6 bulan. Uang yang sudah masuk harus tetap teralokasi.
        $service->changeTenor($plan, 6);

        $plan->refresh();
        $rows = $plan->installments()->get();

        $this->assertCount(6, $rows);
        $this->assertSame(3000000.00, round($rows->sum('amount'), 2));
        $this->assertSame(500000.00, round($rows[0]->amount, 2));
        $this->assertSame(1000000.00, round($rows->sum('paid_amount'), 2));
        $this->assertSame('paid', $rows[0]->status);
    }

    /** @test */
    public function resinkronisasi_setelah_total_transaksi_diubah()
    {
        $service = new InstallmentService();
        $sale = $this->makeSale(3000000, 3);

        $plan = InstallmentPlan::create([
            'direction' => 'receivable',
            'sale_id' => $sale->id,
            'months' => 3,
            'user_id' => $this->user->id,
        ]);
        $service->generate($plan, 3, 3000000, now()->format('Y-m-d'));

        $sale->update(['total' => 6000000]);
        $service->resync($plan);

        $rows = $plan->refresh()->installments()->get();
        // Jadwal HARUS ikut jadi 6 juta, kalau tidak SUM(amount) ≠ sale.total.
        $this->assertSame(6000000.00, round($rows->sum('amount'), 2));
        $this->assertSame(2000000.00, round($rows[0]->amount, 2));
    }

    /** @test */
    public function satu_transaksi_hanya_boleh_punya_satu_plan()
    {
        $sale = $this->makeSale(1000000, 2);

        InstallmentPlan::create([
            'direction' => 'receivable',
            'sale_id' => $sale->id,
            'months' => 2,
            'user_id' => $this->user->id,
        ]);

        $this->expectException(\Illuminate\Database\QueryException::class);

        InstallmentPlan::create([
            'direction' => 'receivable',
            'sale_id' => $sale->id,
            'months' => 4,
            'user_id' => $this->user->id,
        ]);
    }

    /** @test */
    public function jadwal_yang_nempel_ke_nol_atau_dua_transaksi_ditolak()
    {
        $service = app(InstallmentService::class);

        // Tidak menempel ke transaksi mana pun: `paidFor()` akan mengembalikan
        // null dan alokasi pembayaran berjalan tanpa sumber mana pun.
        $orphan = InstallmentPlan::create([
            'direction' => 'receivable',
            'months' => 2,
            'user_id' => $this->user->id,
        ]);
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $service->generate($orphan, 2, 1000000, '2026-09-27');
    }

    /** @test */
    public function arah_jadwal_harus_cocok_dengan_jenis_transaksi()
    {
        $purchase = $this->makePurchase(1000000);
        $service = app(InstallmentService::class);

        // `receivable` yang menempel ke purchase akan membaca pembayaran dari
        // sales yang tidak ada, sehingga pembayaran supplier tidak pernah
        // menutup angsuran. Kegagalan diam-diam, jadi harus ditolak.
        $mismatch = InstallmentPlan::create([
            'direction' => 'receivable',
            'purchase_id' => $purchase->id,
            'months' => 2,
            'user_id' => $this->user->id,
        ]);

        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $service->generate($mismatch, 2, 1000000, '2026-09-27');
    }

    /** @test */
    public function menghapus_transaksi_menghapus_jadwalnya_otomatis()
    {
        $service = new InstallmentService();
        $sale = $this->makeSale(1000000, 4);

        $plan = InstallmentPlan::create([
            'direction' => 'receivable',
            'sale_id' => $sale->id,
            'months' => 4,
            'user_id' => $this->user->id,
        ]);
        $service->generate($plan, 4, 1000000, now()->format('Y-m-d'));
        $this->assertSame(4, Installment::count());

        $sale->delete();

        $this->assertSame(0, InstallmentPlan::where('sale_id', $sale->id)->count());
        $this->assertSame(0, Installment::count());
    }

    /** @test */
    public function progres_menampilkan_berapa_angsuran_yang_sudah_lunas()
    {
        $service = new InstallmentService();
        $sale = $this->makeSale(3000000, 3);

        $plan = InstallmentPlan::create([
            'direction' => 'receivable',
            'sale_id' => $sale->id,
            'months' => 3,
            'user_id' => $this->user->id,
        ]);
        $service->generate($plan, 3, 3000000, now()->format('Y-m-d'));
        $service->recalculate($plan);

        $this->assertSame(['paid' => 0, 'total' => 3, 'remaining' => 3], $plan->progress());

        $sale->payments()->create([
            'payment_number' => 'BY-' . uniqid(),
            'date' => now()->format('Y-m-d'),
            'customer_id' => $sale->customer_id,
            'amount' => 2000000,
            'method' => 'cash',
            'user_id' => $this->user->id,
        ]);
        $service->recalculate($plan);

        $this->assertSame(['paid' => 2, 'total' => 3, 'remaining' => 1], $plan->refresh()->progress());
    }
}
