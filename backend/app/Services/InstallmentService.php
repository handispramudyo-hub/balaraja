<?php

namespace App\Services;

use App\Models\Installment;
use App\Models\InstallmentPlan;
use App\Models\Payment;
use App\Models\Purchase;
use App\Models\Sale;
use App\Models\SupplierPayment;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Satu-satunya tempat yang menulis `installments.amount`, `paid_amount`,
 * dan `status`.
 *
 * Alasan_flow yang sama seperti `PurchasePayableService`: jadwal angsuran
 * adalah nilai turunan (dari `months` + total transaksi) dan alokasi
 * pembayaran adalah nilai turunan (dari seluruh pembayaran pada transaksi
 * itu). Kalau dua-duanya ditulis dari beberapa controller, setiap jalur
 * baru - edit jadwal, hapus pembayaran, ubah total penjualan - jadi satu
 * chances lagi angka-angka ini melenceng tanpa error.
 *
 * Prinsip yang dipegang: JANGAN PERNAH menyimpan hasil alokasi. Setiap
 * `recalculate()` mengembalikan pembayaran ke nol lebih dulu, lalu memutar
 * ulang seluruh pembayaran (diurutkan tanggal, lalu id) dengan alokasi FIFO.
 * Konsekuensinya alokasi selalu bisa dibuktikan ulang dari tabel payments,
 * jadi tidak ada state yang dipercaya begitu saja - persis alasan tidak ada
 * `installment_plan_id` di tabel payments.
 *
 * FIFO dipilih karena itulah yang diharapkan kasir: bayar 2 juta untuk
 * angsuran 1 juta pertama harus menutup angsuran bulan 1, bukan menyeimbangkan
 * Rp500rb ke setiap angsuran.
 */
class InstallmentService
{
    /** Batas atas. 36 bulan = 3 tahun, cukup untuk kredit barang tahan lama. */
    public const MAX_MONTHS = 36;

    /**
     * Pecah total menjadi `months` nominal, dengan sisa pembulatan
     * diserap angsuran terakhir.
     *
     * Kenapa bukan `round($total / $months, 2)` untuk semua baris: total
     * 1.000.000 dibagi 3 = 333.333,33, dikali 3 = 999.999,99. Selisih
     * 1 sen itu akan terkumpul jadi `payable`/`receivable` yang selalu
     * menggantung 1 sen dan tidak pernah_status "lunas". Menyerapnya ke
     * baris terakhir membuat `SUM(amount) == total` persis, dan itu yang
     * diuji, bukan pendekatan "hampir benar".
     *
     * @return array<int, float> indeks 0 = angsuran ke-1
     */
    public function splitAmounts(float $total, int $months): array
    {
        $total = round($total, 2);
        $base = round($total / $months, 2);
        $amounts = array_fill(0, $months, $base);

        // Sisa pembulatan, bisa negatif kalau base menjulohROUND ceil
        // (mis. 100 / 3 = 33.33, base 33.33 * 3 = 99.99, sisa +0.01).
        $remainder = round($total - ($base * $months), 2);

        if ($remainder != 0.0) {
            $last = $months - 1;
            $amounts[$last] = round($amounts[$last] + $remainder, 2);
        }

        return $amounts;
    }

    /**
     * Tanggal jatuh tempo angsuran ke-$seq.
     *
     * `addMonthsNoOverflow()` dipakai, bukan `addMonths()`: transaksi
     * tanggal 31 Januari harus jatuh tempo 28/29 Februari, bukan melompat
     * ke 3 Maret. Untuk cicilan, praktisnya-meaning-nya "tanggal 31" tetap
     * tanggal akhir bulan berikutnya.
     */
    public function dueDateFor(string $startDate, int $seq): Carbon
    {
        return Carbon::parse($startDate)->startOfDay()->addMonthsNoOverflow($seq);
    }

    /**
     * Buat jadwal dari nol untuk satu plan.
     *
     * Menghapus jadwal lama lebih dulu, lalu menulis ulang dari `seq` 1..N.
     * Dipakai saat plan dibuat dan saat tenor berubah. Alokasi pembayaran
     * TIDAK ikut di-hapus: `recalculate()` dipanggil setelahnya dan
     * mengisinya kembali dari tabel pembayaran.
     */
    public function generate(InstallmentPlan $plan, int $months, float $total, string $startDate): InstallmentPlan
    {
        $months = max(1, min(self::MAX_MONTHS, $months));
        $total = round($total, 2);

        // Total 0 (atau negatif, kalau data rusak) tidak bisa dipecah jadi
        // jadwal. Tanpa guard ini `splitAmounts` akan mengembalikan N baris
        // bernilai 0, dan karena `0 + 0.005 >= 0` setiap angsuran langsung
        // terhitung LUNAS - tampilan akan menampilkan "6 dari 6 lunas"
        // untuk transaksi yang belum menerima uang sepeser pun. Itu jauh
        // lebih menyesatkan daripada ditolak.
        if ($total <= 0) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'installment_months' => 'Total transaksi harus lebih dari 0 untuk bisa dicicilkan.',
            ]);
        }

        // Jadwal harus menempel ke tepat satu transaksi, dan arahnya harus
        // cocok dengan transaksi itu. Constraint DB tidak bisa dipakai
        // di sini (CHECK tidak dip-porting ke MySQL), jadi dijaga di
        // generate() - satu tempat yang dipakai penjualan dan pembelian.
        //
        // Tanpa guard ini, plan `receivable` yang menempel ke purchase akan
        // terlihat benar di form (total, tenor, jumlah bulan) tapi
        // `paidFor()` membaca pembayaran dari sisi yang salah, sehingga
        // pembayaran pelanggan tidak pernah menutup angsuran. Kegagalan
        // semacam itu tidak melempar error, hanya menghasilkan angka yang
        // diam-diam salah - itu yang paling mahal untuk ditemukan belakangan.
        $hasSale = $plan->sale_id !== null;
        $hasPurchase = $plan->purchase_id !== null;

        if ($hasSale === $hasPurchase) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'installment_months' => 'Jadwal angsuran harus menempel ke tepat satu transaksi (penjualan atau pembelian).',
            ]);
        }

        $expectedDirection = $hasSale ? 'receivable' : 'payable';
        if ($plan->direction !== $expectedDirection) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'installment_months' => 'Arah jadwal angsuran tidak cocok dengan jenis transaksinya.',
            ]);
        }

        $amounts = $this->splitAmounts($total, $months);

        DB::transaction(function () use ($plan, $months, $amounts, $startDate) {
            $plan->installments()->delete();
            $plan->forceFill(['months' => $months, 'status' => 'active'])->save();

            $now = Carbon::now();
            $rows = [];

            for ($i = 0; $i < $months; $i++) {
                $rows[] = [
                    'installment_plan_id' => $plan->id,
                    'seq' => $i + 1,
                    'due_date' => $this->dueDateFor($startDate, $i + 1)->toDateString(),
                    'amount' => $amounts[$i],
                    'paid_amount' => 0,
                    'status' => 'pending',
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            Installment::insert($rows);
        });

        return $plan->refresh();
    }

    /**
     * Hitung ulang seluruh alokasi pembayaran pada satu plan.
     *
     * Dijalankan di dalam transaksi database yang sama dengan penulisan
     * pembayaran, jadi `lockForUpdate` di caller tetap berlaku.
     *
     * Parameter boleh null: majority pemanggilnya "recalculate plan milik
     * transaksi ini, kalau ada". Memaksakan setiap caller melakukan
     * `if ($plan !== null)` hanya menambah opportunity untuk lupa, dan
     * transaksi tanpa cicilan adalah kasus paling umum.
     */
    public function recalculate(?InstallmentPlan $plan): ?InstallmentPlan
    {
        if ($plan === null) {
            return null;
        }

        DB::transaction(function () use ($plan) {
            $locked = InstallmentPlan::whereKey($plan->getKey())->lockForUpdate()->first();

            if ($locked === null) {
                return;
            }

            $rows = Installment::where('installment_plan_id', $locked->id)
                ->orderBy('seq')
                ->lockForUpdate()
                ->get();

            if ($rows->isEmpty()) {
                return;
            }

            $paid = $this->paidFor($locked);
            $now = Carbon::now();
            $changed = 0;
            $fullySettled = true;

            foreach ($rows as $row) {
                // FIFO: sisa uang yang belum dialokasikan mengisi angsuran
                // ini, tapi tidak boleh melebihi nominal angsuran ini.
                $allocate = min($paid, (float) $row->amount);
                $allocate = max(0.0, round($allocate, 2));
                $paid = round($paid - $allocate, 2);

                $settled = $allocate + 0.005 >= (float) $row->amount;

                if (! $settled) {
                    $fullySettled = false;
                }

                if (round((float) $row->paid_amount, 2) == $allocate && $row->status === ($settled ? 'paid' : 'pending')) {
                    continue;
                }

                Installment::whereKey($row->id)->update([
                    'paid_amount' => $allocate,
                    'status' => $settled ? 'paid' : 'pending',
                    'updated_at' => $now,
                ]);

                $changed++;
            }

            $status = $fullySettled ? 'completed' : 'active';
            if ($locked->status !== $status) {
                $locked->forceFill(['status' => $status])->save();
            }
        });

        return $plan->refresh();
    }
    /**
     * Ubah tenor (jumlah bulan) tanpa kehilangan riwayat pembayaran.
     *
     * Nominal angsuran dihitung ulang dari total transaksi yang SAAT INI,
     * lalu `recalculate()` memutar ulang alokasi. Efeknya: kalau angsuran
     * ke-1 sudah lunas dan tenor diubah dari 3 ke 6 bulan, `recalculate`
     * akan memutar ulang seluruh pembayaran sehingga uang yang sudah
     * masuk tetap teralokasi ke angsuran pertama, bukan hilang.
     *
     * @throws \Illuminate\Validation\ValidationException
     *   kalau total yang akan dicicilkan lebih kecil dari yang sudah dibayar
     */
    public function changeTenor(InstallmentPlan $plan, int $months): InstallmentPlan
    {
        $transaction = $plan->transaction();

        if ($transaction === null) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'months' => 'Transaksi induk cicilan ini sudah tidak ada.',
            ]);
        }

        $months = max(1, min(self::MAX_MONTHS, $months));
        $total = round((float) $transaction->total, 2);
        $paid = $this->paidFor($plan);

        // Jadwal baru harus bisa menampung uang yang sudah masuk. Kalau tidak,
        // hasil bolak-baliknya akan membuat "sudah bayar 3 juta" berubah
        // menjadi "sisa 3 juta" - saldo pelanggan berbalik arah tanpa ada
        // transaksi yang menjelaskan.
        if ($total + 0.005 < $paid) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'months' => 'Total transaksi lebih kecil dari yang sudah dibayar. '
                    .'Ubah total transaksi dulu sebelum mengganti tenor.',
            ]);
        }

        $this->generate($plan, $months, $total, $this->startDateFor($plan));

        // WAJIB. `generate()` menulis ulang jadwal dari nol dengan
        // `paid_amount = 0`, jadi tanpa panggilan di bawah ini uang yang
        // sudah dibayar akan hilang dari tampilan sampai ada pembayaran
        // berikutnya yang memicu recalculate. Ini bukan " histories hilang di
        // database" - payments tetap utuh - tapi angsuran yang sudah lunas
        // akan tampil belum lunas, dan itu lebih buruk karena terlihat
        // seperti data yang salah.
        return $this->recalculate($plan);
    }

    /**
     * Total yang sudah dibayar pada transaksi induk, sesuai arah plan.
     */
    public function paidFor(InstallmentPlan $plan): float
    {
        if ($plan->direction === 'payable') {
            return round((float) $plan->purchase?->supplierPayments()->sum('amount'), 2);
        }

        return round((float) $plan->sale?->payments()->sum('amount'), 2);
    }

    /**
     * Tanggal mulai dihitung jatuh temponya. Untuk piutang pelanggan dipakai
     * tanggal penjualan; untuk utang supplier, tanggal pembelian. Kalau
     * tanggal transaksi kosong (data rusak), jatuh tempo dihitung dari hari
     * ini supaya user tetap melihat jadwal yang masuk akal.
     */
    public function startDateFor(InstallmentPlan $plan): string
    {
        $date = $plan->transaction()?->date;

        if ($date === null) {
            return Carbon::now()->toDateString();
        }

        return $date instanceof Carbon
            ? $date->toDateString()
            : Carbon::parse($date)->toDateString();
    }

    /**
     * Plan milik satu transaksi, kalau ada. Dipakai controller pembayaran
     * supaya mereka tidak perlu tahu bentuk relasinya.
     */
    public function planFor(Sale|Purchase $transaction): ?InstallmentPlan
    {
        return InstallmentPlan::query()
            ->where('direction', $transaction instanceof Sale ? 'receivable' : 'payable')
            ->where(fn ($q) => $transaction instanceof Sale
                ? $q->where('sale_id', $transaction->id)
                : $q->where('purchase_id', $transaction->id))
            ->first();
    }

    /**
     * Panggil ulang alokasi setelah total transaksi berubah.
     *
     * Nominal angsuran ikut dihitung ulang supaya jadwal tetap menjumlah ke
     * total yang baru - kalau tidak, `SUM(amount)` akan menyimpang dari
     * `sale.total`/`purchase.total` dan sisa/tagihan tidak akan cocok.
     *
     * Parameter boleh null, sama seperti `recalculate`: sebagian besar
     * penjualan/pembelian memang tidak dicicilkan sama sekali.
     */
    public function resync(?InstallmentPlan $plan): ?InstallmentPlan
    {
        if ($plan === null) {
            return null;
        }

        $transaction = $plan->transaction();

        if ($transaction === null) {
            return $plan;
        }

        $total = round((float) $transaction->total, 2);

        $this->generate($plan, (int) $plan->months, $total, $this->startDateFor($plan));

        return $this->recalculate($plan);
    }

    /**
     * Daftar angsuran yang lewat jatuh tempo dan belum lunas, untuk
     * peringatan di dashboard. Tidak memakai scope eloquent supaya bisa
     * dipakai juga dari query agregat.
     */
    public function overdueCount(string $asOf): int
    {
        return Installment::query()
            ->where('status', 'pending')
            ->whereDate('due_date', '<', $asOf)
            ->count();
    }
}
