<?php

namespace App\Services;

use App\Models\Purchase;
use App\Models\SupplierPayment;
use App\Models\Supplier;

/**
 * Satu-satunya tempat yang menulis `purchases.payable` dan
 * `purchases.payment_status`.
 *
 * Kenapa harus service terpisah, bukan helper static yang dipanggil dari
 * mana-mana: `payable` adalah denormalisasi dari `total - SUM(payments)`.
 * Setiap jalur yang menambah, mengubah, atau menghapus pembayaran wajib
 * memanggilnya, kalau tidak `payable` akan melenceng diam-diam. Dengan semua
 * penulisan terkumpul di sini, yang perlu diawasi hanya "apakah setiap jalur
 * memanggil PurchasePayableService" - bukan "apakah rumusnya sama di lima
 * tempat".
 *
 * Perhatikan tidak ada caching dan tidak ada eloquent event listener. Keduanya
 * terlihat elegan tapi justru menyembunyikan pemanggilannya: kalau
 * `purchases.payable` di-update dari event listener, menguji jalurnya jadi jauh
 * lebih sulit, dan bugs "kadang anglep ada" jauh lebih sulit ditelusuri.
 */
class PurchasePayableService
{
    /**
     * Hitung ulang sisa utang + status satu transaksi pembelian.
     *
     * Dijalankan di dalam transaksi database yang sama dengan penulisan
     * pembayaran, jadi `lockForUpdate` di caller tetap berlaku.
     */
    public function recalculate(Purchase $purchase): Purchase
    {
        // PENTING: lock baris pembelian dulu. Dua pembayaran yang masuk
        // bersamaan untuk pembelian yang sama akan membaca SUM() yang sama
        // lalu sama-sama menulis hasil lama, sehingga satu pembayaran hilang
        // dari payable tanpa ada jejaknya.
        $locked = Purchase::whereKey($purchase->getKey())->lockForUpdate()->first();

        if ($locked === null) {
            return $purchase;
        }

        $paid = round((float) $locked->supplierPayments()->sum('amount'), 2);
        $total = round((float) $locked->total, 2);
        $payable = max(0.0, round($total - $paid, 2));

        // Toleransi 0.005: pembulatan float. Pembayaran terakhir biasanya
        // tidak genap rupiah, dan tanpa toleransi sisa receh 0.004 akan
        // receh 0.004 akan membuat transaksi yang sudah lunas tetap
        // berstatus "Sebagian" selamanya.
        $status = $this->statusFor($paid, $total);

        $locked->forceFill([
            'payable' => $payable,
            'payment_status' => $status,
        ])->save();

        return $locked;
    }

    /**
     * @return 'unpaid'|'partial'|'paid'
     */
    public function statusFor(float $paid, float $total): string
    {
        if ($paid <= 0.0) {
            return 'unpaid';
        }

        if ($paid + 0.005 >= $total) {
            return 'paid';
        }

        return 'partial';
    }

    /**
     * Hitung ulang seluruh pembelian milik satu supplier.
     *
     * Dipakai setelah pembayaran dihapus atau diedit supaya tidak ada satu
     * pun transaksi yang tertinggal dengan nominal lama.
     */
    public function recalculateForSupplier(int $supplierId): void
    {
        Purchase::where('supplier_id', $supplierId)
            ->pluck('id')
            ->each(fn ($id) => $this->recalculate(Purchase::find($id)));
    }

    /**
     * Total utang satu supplier, dibaca langsung dari `purchases.payable`.
     */
    public function totalForSupplier(Supplier $supplier): float
    {
        return round((float) $supplier->purchases()
            ->whereIn('payment_status', ['unpaid', 'partial'])
            ->sum('payable'), 2);
    }

    /**
     * Jumlah pembayaran ke supplier pada periode tertentu, untuk laporan
     * arus kas keluar.
     */
    public function paidBetween(string $from, string $to): float
    {
        return round((float) SupplierPayment::whereBetween('date', [$from, $to])->sum('amount'), 2);
    }
}
