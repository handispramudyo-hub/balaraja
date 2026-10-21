<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cicilan (angsuran) untuk piutang pelanggan DAN utang supplier.
 *
 * Konteks: `payments` (piutang pelanggan) dan `supplier_payments` (utang
 * supplier) sama-sama bisa mencatat pembayaran parsial tanpa batas jumlah.
 * Yang belum ada adalah KONSEP TENOR: cashier tidak bisa menulis "12x
 * cicilan" lalu melihat tanggal jatuh tempo tiap angsuran, dan sistem tidak
 * bisa memberi tahu angsuran mana yang lewat jatuh tempo.
 *
 * Tiga keputusan desain, dan alasannya:
 *
 * 1. SATU tabel `installment_plans` dipakai dua arah, dipisahkan kolom
 *    `direction`. Bukan dua tabel terpisah (sale_installments +
 *    purchase_installments) padahal isinya simetris. Aturan cicilan - bagi
 *    rata, sisa pembulatan, alokasi FIFO, tanggal jatuh tempo bulanan -
 *    identik di kedua sisi. Kalau diduplikasi, perbaikan bug tanggal jatuh
 *    tempo harus dilakukan dua kali dan tidak ada yang menjamin kedua salinan
 *    tetap sama. Satu tabel + satu service = satu tempat yang benar.
 *
 *    `sale_id`/`purchase_id` tetap dipakai FK (bukan ref_type/ref_id
 *    polymorphic) supaya integritas referensial dijamin database. Aturan
 *    "tepat satu dari keduanya terisi" ditegakkan di service dan test, bukan
 *    CHECK constraint, supaya perilakunya identik di MySQL dan SQLite.
 *
 * 2. TIDAK ada kolom `total` di `installment_plans`. Nominal yang dicicilkan
 *    selalu sama dengan total transaksi induknya (tidak ada uang muka: user
 *    justru memilih tanpa DP). Menyimpan total berarti ada dua sumber angka
 *    untuk satu fakta, dan sale.total yang diedit kemudian akan melenceng
 *    dari jadwal. Jadwal diturunkan dari `months` + total induk setiap kali
 *    perlu, jadi tidak ada yang bisa basi.
 *
 * 3. TIDAK ada `installment_plan_id` di `payments`/`supplier_payments`.
 *    Alokasi "pembayaran ini sudah menutup angsuran ke-1 dan ke-2" bukan
 *    fakta tentang pembayaran, tapi-hasil dari membandingkan total pembayaran
 *    dengan jadwal. Kalau kolomnya disimpan, setiap edit/hapus pembayaran
 *    wajib memperbarui dua tabel sekaligus dan satu jalur yang lupa akan
 *    meninggalkan angsuran yang ditandai lunas padahal uangnya sudah
 *    dihapus. `InstallmentService` menghitung ulang alokasi dari seluruh
 *    pembayaran setiap kali ada perubahan, jadi `installments.paid_amount`/
 *    `status` selalu bisa dibuktikan ulang dari tabel `payments` - tidak ada
 *    state yang dipercaya begitu saja.
 *
 * Catatan untuk pembaca lain: kolom `paid_amount`/`status` di `installments`
 * adalah denormalisasi, sama seperti `purchases.payable` yang sekarang.
 * `InstallmentService` adalah SATU-SATUNYA penulisnya, dan `InstallmentTest`
 * memeriksa ulang invarian dari sumber payment setelah tiap operasi.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('installment_plans', function (Blueprint $table) {
            $table->id();

            // 'receivable' = pelanggan beli cicilan (piutang kita).
            // 'payable'    = toko beli cicilan dari supplier (utang kita).
            $table->enum('direction', ['receivable', 'payable']);

            // Tepat satu yang terisi; dijaga service + test.
            $table->foreignId('sale_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('purchase_id')->nullable()->constrained()->cascadeOnDelete();

            // Jumlah angsuran. 1..36 dibatasi di validasi, bukan di DB,
            // supaya pesan error-nya bisa ditulis Bahasa Indonesia.
            $table->unsignedTinyInteger('months');

            // 'completed' ditulis otomatis oleh service saat semua angsuran
            // lunas - bukan tombol manual, supaya status plan tidak pernah
            // menyimpang dari isi jadwalnya.
            $table->enum('status', ['active', 'completed'])->default('active');

            $table->foreignId('user_id')->constrained();
            $table->timestamps();

            // Satu transaksi = satu plan. unik per kolom, bukan unique
            // (sale_id, purchase_id), karena NULL di unique composite
            // diperlakukan berbeda antar driver - sale_id NULL + purchase_id
            // yang sama bisa lolos di MySQL tapi tidak di SQLite.
            $table->unique('sale_id');
            $table->unique('purchase_id');

            $table->index(['direction', 'status']);
        });

        Schema::create('installments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('installment_plan_id')->constrained()->cascadeOnDelete();

            // 1..months. Unik per plan supaya tidak ada dua angsuran ke-2.
            $table->unsignedTinyInteger('seq');
            $table->date('due_date');

            // Nominal angsuran ini hasil bagi rata, DIBULATKAN ke sen, dan
            // PLAN TERAKHIR menyerap sisa pembulatan. Jadi SUM(amount)
            // selalu persis sama dengan total transaksi - inilah invarian
            // yang diperiksa InstallmentTest, bukan sekadar "~hampir sama".
            $table->decimal('amount', 15, 2);

            // Berapa dari `amount` yang sudah tertutup. 0 sampai amount.
            $table->decimal('paid_amount', 15, 2)->default(0);

            $table->enum('status', ['pending', 'paid'])->default('pending');

            $table->timestamps();

            $table->unique(['installment_plan_id', 'seq']);

            // Laporan "angsuran jatuh tempo bulan ini" dan kartu
            // angsuran yang lewat tempo sama-sama menyaring (status, due_date)
            // tanpa perlu join ke plan dulu.
            $table->index(['status', 'due_date']);
        });
    }

    public function down(): void
    {
        // Urutan dibalik: anak dulu, lalu induk. Men-drop plan lebih dulu
        // sudah cascade oleh FK, tapi drop eksplisit lebih jelas dan tidak
        // bergantung pada engine yang menjadwalkannya.
        Schema::dropIfExists('installments');
        Schema::dropIfExists('installment_plans');
    }
};
