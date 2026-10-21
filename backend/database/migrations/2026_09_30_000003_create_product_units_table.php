<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Satuan per produk ("konversi bebas per produk").
 *
 * Sebuah produk minuman dibeli per dus tapi dijual per btl. Sebelum ini produk
 * hanya punya SATU kolom `unit` (default 'dus') dan `stock` integer dalam
 * satuan itu, sehingga sells per btl tidak mungkin dicatat tanpa merusak
 * aritmetika stok.
 *
 * Konvensi faktor
 * ---------------
 * `factor` = berapa satuan dasar yang setara dengan 1 satuan ini.
 * Satuan dasar (paling kecil) selalu factor = 1.
 *
 *   base = btl (factor 1)   ->  1 dus factor 24  ->  1 dus = 24 btl
 *
 * Jadi `stock` SELALU disimpan dalam satuan dasar dan tetap integer. Jual 5 btl
 * dari stok 792 btl (33 dus) mengurangi tepat 5, tanpa pecahan. Sisa 787 btl
 * ditampilkan sebagai "32 dus + 19 btl".
 *
 * Kenapa `stock` tidak dikonversi di migration ini
 * ----------------------------------------------
 * Mengubah angka stok tanpa konfirmasi pengguna di UI adalah kesalahan yang
 * tidak bisa dibatalkan: kalau faktor dus-nya salah, seluruh stok jadi salah
 * dan tidak ada jejak kenapa. Jadi migration ini sengaja hanya menambah
 * struktur, tanpa menyentuh satu baris `stock` pun.
 *
 * - `products.unit` sekarang berarti SATUAN DASAR (bukan lagi "satuan yang
 *   dipakai untuk display"). Semua produk lama otomatis jadi ber-base dus
 *   dengan factor 1, jadi angkanya tetap persis seperti sebelumnya.
 * - Satu baris satuan dasar dibuat untuk setiap produk, supaya produk lama
 *   punya daftar satuan yang valid sejak awal.
 * - Faktor untuk satuan lain (btl, paket, ...) sengaja TIDAK dik-seed dengan
 *   angka tebakan. Factor dibiarkan 0 dan wajib diisi lewat form produk.
 *   Produk yang belum punya satuan tambahan tetap berfungsi persis seperti
 *   sebelumnya.
 *
 * Re-basing stok ke satuan terkecil dilakukan lewat endpoint khusus yang
 * menulis `adjustment` ke `stock_movements`, jadi selalu ada jejak audit.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_units', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();

            // Nama satuan bebas per produk: "dus", "btl", "pak", "box", ...
            $table->string('name', 32);

            // Berapa satuan dasar per 1 satuan ini. 0 berarti belum diisi -
            // sengaja dibiarkan begitu, bukan diisi angka tebakan.
            $table->unsignedInteger('factor')->default(0);

            $table->boolean('is_base')->default(false);

            $table->timestamps();

            // Satu produk tidak boleh punya dua satuan dengan nama sama,
            // karena nama itu yang tampil di dokumen dan jadi kunci bacaan kasir.
            $table->unique(['product_id', 'name']);
            $table->index(['product_id', 'is_base']);
        });

        // Satu baris satuan dasar per produk. products.unit yang lama langsung
        // dipakai apa adanya, jadi tidak ada data lama yang berubah.
        DB::table('products')->orderBy('id')->chunk(200, function ($products) {
            $rows = [];
            $now = now();
            foreach ($products as $product) {
                $unit = trim((string) ($product->unit ?: 'pcs')) ?: 'pcs';
                $rows[] = [
                    'product_id' => $product->id,
                    'name' => $unit,
                    'factor' => 1,
                    'is_base' => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
            if ($rows) {
                DB::table('product_units')->insert($rows);
            }
        });

        // Snapshot satuan di item transaksi. Sengaja TIDAK pakai foreign key:
        // kalau satuan produk diubah atau dihapus, dokumen lama harus tetap
        // menampilkan arti yang sama saat dicetak.
        foreach (['sale_items', 'purchase_items'] as $table) {
            Schema::table($table, function (Blueprint $t) use ($table) {
                $t->string('unit_name', 32)->nullable()->after('product_id');
                $t->unsignedInteger('unit_factor')->nullable()->after('unit_name');
                $t->unsignedInteger('base_quantity')->nullable()->after('unit_factor');
            });
        }

        // Catatan satuan pada movement. Nullable supaya movement lama (yang
        // jumlahnya memang sudah dalam satuan dasar produk) tetap utuh.
        Schema::table('stock_movements', function (Blueprint $t) {
            $t->string('unit_name', 32)->nullable()->after('quantity');
            $t->unsignedInteger('base_quantity')->nullable()->after('unit_name');
        });
    }

    public function down(): void
    {
        Schema::table('stock_movements', function (Blueprint $t) {
            $t->dropColumn(['unit_name', 'base_quantity']);
        });

        foreach (['sale_items', 'purchase_items'] as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->dropColumn(['unit_name', 'unit_factor', 'base_quantity']);
            });
        }

        Schema::dropIfExists('product_units');
    }
};
