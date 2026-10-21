<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * 2026_09_25_000001 mengganti enum dan membuang `sale_reverse` (masih menyisakan
 * `purchase_reverse` + `adjustment_reverse`). Akibatnya pembatalan penjualan
 * tidak punya tipe movement sendiri, sehingga SaleController menghapus baris
 * riwayat sebagai gantinya — membuat kartu stok & laba-rugi melenceng.
 *
 * Migration ini mengembalikan `sale_reverse` secara additive. Enum lama tidak
 * diubah karena sudah tercatat di tabel `migrations` pada produksi.
 */
return new class extends Migration
{
    private const WITH_SALE_REVERSE = "ENUM('purchase','sale','adjustment','purchase_reverse','sale_reverse','adjustment_reverse') NOT NULL";

    private const WITHOUT_SALE_REVERSE = "ENUM('purchase','sale','adjustment','purchase_reverse','adjustment_reverse') NOT NULL";

    public function up(): void
    {
        if (DB::connection()->getDriverName() !== 'mysql') {
            return;
        }

        DB::statement('ALTER TABLE stock_movements MODIFY COLUMN type ' . self::WITH_SALE_REVERSE);
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() !== 'mysql') {
            return;
        }

        DB::statement('ALTER TABLE stock_movements MODIFY COLUMN type ' . self::WITHOUT_SALE_REVERSE);
    }
};
