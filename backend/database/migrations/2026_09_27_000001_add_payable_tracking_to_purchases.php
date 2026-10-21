<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Utang pembelian / pelunasan ke supplier.
 *
 * SEBELUM migration ini, `purchases` hanya punya `total`. Tidak ada satu pun
 * konsep sisa utang di sisi supplier: tabel `payments` terikat NOT NULL ke
 * `customers` + `sales`, jadi secara fisik tidak bisa menyimpan pembayaran ke
 * supplier. purchases yang belum dibayar tidak bisa dibayar sama sekali.
 *
 * Tiga keputusan desain, dan alasannya:
 *
 * 1. Tabel BARU `supplier_payments`, bukan widen `payments` jadi polymorphic.
 *    `payments` sudah berisi data piutang pelanggan yang berjalan. Mengubah
 *    `customer_id`/`sale_id` dari NOT NULL jadi nullable berarti setiap
 *    pembacaan `payments` (laporan, dashboard, ekspor) harus decides
 *    "apakah baris ini piutang atau utang?" - dan baris dengan kedua kolom
 *    null akan lolos semua perhitungan. Tabel terpisah membuat jenis
 *    pembayaran melekat pada tempatnya dan tidak bisa tercampur diam-diam.
 *
 * 2. TIDAK ada kolom saldo di `suppliers` (padanan `customers.total_receivable`).
 *    Saldo denormalisasi itu harus disinkronkan ulang di setiap create/update/
 *    delete pembayaran. Kalau satu jalur lupa, saldo melenceng permanen
 *    tanpa error yang terlihat. Di sini `purchases.payable` sudah menyimpan sendiri,
 *    jadi total utang supplier = `SUM(payable)` - tidak ada yang bisa
 *    tidak sinkron karena tidak ada yang duplikat.
 *
 * 3. `purchases.payment` TIDAK ikut disimpan. Nominal yang sudah dibayar
 *    selalu bisa dihitung `SUM(supplier_payments.amount)`. Dua sumber angka
 *    untuk satu fakta berarti satu dari keduanya pasti akan menyimpang.
 *    Yang disimpan hanya `payable` (sisa) + `payment_status`, karena keduanya
 *    perlu dibaca cepat saat daftar transaksi ditampilkan dan sudah jadi
 *    sumber kebenaran tunggal.
 *
 * Kolom `payment` sengaja TIDAK ditambahkan: menambahnya hanya akan
 * menciptakan tempat kedua yang bisa menyimpan nominal yang sama.
 *
 * 4. Pembayaran ke supplier BISA diubah dan dihapus, sama seperti
 *    `payments` (piutang pelanggan) yang juga punya endpoint update dan
 *    destroy. Polanya sengaja disamakan supaya kasir tidak learner dua
 *    aturan berbeda untuk dua jenis pembayaran yang kelihatan sama di
 *    layar. `payable` dihitung ulang oleh `PurchasePayableService` pada
 *    setiap create/update/delete, dan `SupplierDebtTest` memeriksa invarian
 *    `payable == total - SUM(amount)` setelah tiap operasi - jadi koreksi
 *    tetap tidak bisa meninggalkan angka sisa utang yang salah.
 *
 *    Konsekuensi yang perlu diketahui: riwayat pelunasan supplier bisa
 *    berubah setelah-the-fact tanpa jejak "dibalik". Kalau di kemudian
 *    hari dibutuhkan jejak audit penuh, ini titik Critique-nya - tambahkan
 *    baris reversal (tabel tetap sama, `payable` tetap dihitung dari
 *    SUM), JANGAN digantikan dengan menghapus riwayat.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('supplier_payments', function (Blueprint $table) {
            $table->id();
            $table->string('payment_number')->unique();
            $table->date('date');
            $table->foreignId('supplier_id')->constrained();
            $table->foreignId('purchase_id')->constrained();
            $table->decimal('amount', 15, 2);
            // Enum sama persis dengan payments.* supaya satu daftar metode
            // berlaku di kedua sisi. 'tunai'/'lainnya' DITOLAK: nilai enum
            // inilah yang harus dikirim frontend, bukan label Bahasa
            // Indonesianya.
            $table->enum('method', ['cash', 'transfer', 'other'])->default('cash');
            $table->text('note')->nullable();
            $table->foreignId('user_id')->constrained();
            $table->timestamps();

            // Daftar pembayaran di layar hampir selalu "terbaru dulu" dan
            // hampir selalu difilter per supplier, jadi keduanya di-index.
            $table->index(['supplier_id', 'date']);
        });

        Schema::table('purchases', function (Blueprint $table) {
            // Sisa utang. Untuk pembelian yang sudah lunas, nilainya 0
            // (bukan null) supaya SUM() tidak perlu COALESCE.
            $table->decimal('payable', 15, 2)->default(0);
            $table->date('due_date')->nullable();
            $table->enum('payment_status', ['unpaid', 'partial', 'paid'])->default('unpaid');

            // Daftar/list cartera utang selalu di-filter per status.
            $table->index(['payment_status', 'due_date']);
        });

        // Backfill WAJIB. Kolom baru di atas default ke payable=0 dan
        // status='unpaid'. Untuk baris lama kombinasi itu SENGAJA
        // menyesatkan: totalnya 100.000 tapi sisa utangnya 0, sehingga
        // satu transaksi sekaligus berstatus "unpaid" sekaligus tercatat
        // tidak punya utang. Laporan utang akan melaporkan 0 dan transaksi
        // itu hilang dari daftar utang tanpa satu pun error.
        //
        // Baris existing dibuat SEBELUM tabel `supplier_payments` ada, jadi
        // tidak ada satu pun pembayaran ke supplier yang tercatat. Semua
        // purchase lama berarti utangnya masih utuh: payable = total dan
        // status = unpaid.
        DB::table('purchases')->update([
            'payable' => DB::raw('total'),
            'payment_status' => 'unpaid',
        ]);
    }

    public function down(): void
    {
        // Index harus dihapus sebagai PERMINTAAN TERSENDIRI, sebelum dropColumn.
        // Kalau dropIndex dan dropColumn diletakkan dalam satu Schema::table(),
        // driver SQL building ulang tabel dan dropColumn dieksekusi sementara
        // index (payment_status, due_date) masih menyimpan referensi ke
        // `due_date`. Akibatnya rollback CRASH dengan "no such column:
        // due_date" - persis pada saat paling tidak desirable, yaitu saat
        // deploy bermasalah dan tabel harus dikembalikan ke keadaan lama.
        Schema::table('purchases', function (Blueprint $table) {
            $table->dropIndex(['payment_status', 'due_date']);
        });

        Schema::table('purchases', function (Blueprint $table) {
            $table->dropColumn(['payable', 'due_date', 'payment_status']);
        });

        Schema::dropIfExists('supplier_payments');
    }
};
