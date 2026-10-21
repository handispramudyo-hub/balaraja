<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Purchase;
use App\Models\Product;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Backfill migration, diuji dengan menjalankan migration-nya sendiri.
 *
 * Feature test biasa memverifikasi kode. Yang di sini diverifikasi adalah
 * PERILAKU SCHEMA terhadap data yang sudah ada sebelum migration jalan -
 * satu-satunya cara untuk membuktikan baris lama tidak mendapat angka
 * yang salah.
 *
 * `RefreshDatabase` tetap dipakai supaya schema dasar tersedia, lalu test
 * method memanggil `rewindToBeforeDebtMigration()` yang memundangkan DB ke
 * kondisi sebelum migration debt. Jadi tidak ada "sebelum" yang hilang.
 */
class SupplierDebtMigrationTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Supplier $supplier;

    private Category $category;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->category = Category::create(['name' => 'Minuman']);
        $this->supplier = Supplier::create(['name' => 'PT Sumber']);
    }

    /**
     * Kembalikan DB ke kondisi sebelum migration debt: hapus tabel/kolom
     * yang dibuat migration itu, lalu isi purchase "lama".
     */
    private function rewindToBeforeDebtMigration(): void
    {
        Schema::dropIfExists('supplier_payments');

        // Sama seperti `down()`: index lebih dulu, baru kolomnya.
        if (Schema::hasColumn('purchases', 'payment_status')
            && Schema::hasColumn('purchases', 'due_date')) {
            Schema::table('purchases', function ($table) {
                $table->dropIndex(['payment_status', 'due_date']);
            });
        }

        Schema::table('purchases', function ($table) {
            foreach (['payable', 'due_date', 'payment_status'] as $column) {
                if (Schema::hasColumn('purchases', $column)) {
                    $table->dropColumn($column);
                }
            }
        });

        DB::table('purchases')->truncate();

        Product::create([
            'code' => 'P001', 'name' => 'Teh Pucuk',
            'category_id' => $this->category->id,
            'buy_price' => 10000, 'sell_price' => 15000, 'stock' => 0,
        ]);
    }

    private function seedLegacyPurchase(string $number, float $total): int
    {
        return DB::table('purchases')->insertGetId([
            'purchase_number' => $number,
            'date' => '2026-08-15',
            'supplier_id' => $this->supplier->id,
            'user_id' => $this->user->id,
            'total' => $total,
            'note' => null,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function runDebtMigration(): object
    {
        $migration = require database_path('migrations/2026_09_27_000001_add_payable_tracking_to_purchases.php');
        $migration->up();

        return $migration;
    }

    public function test_existing_purchases_get_their_full_total_as_outstanding_debt(): void
    {
        $this->rewindToBeforeDebtMigration();

        // Tiga purchase lama, total berbeda, semua tanpa pembayaran -
        // persis kondisi produksi saat ini.
        $small = $this->seedLegacyPurchase('PB-20260815-001', 150000);
        $big = $this->seedLegacyPurchase('PB-20260816-001', 1250000);
        $fractional = $this->seedLegacyPurchase('PB-20260817-001', 333333.33);

        $this->runDebtMigration();

        foreach ([$small => 150000, $big => 1250000, $fractional => 333333.33] as $id => $total) {
            $row = DB::table('purchases')->where('id', $id)->first();

            $this->assertEqualsWithDelta(
                $total, (float) $row->payable, 0.005,
                "purchase {$id} harus berutang penuh, bukan {$row->payable}"
            );
            $this->assertSame('unpaid', $row->payment_status);
        }
    }

    public function test_backfill_makes_legacy_debt_visible_in_the_supplier_total(): void
    {
        $this->rewindToBeforeDebtMigration();
        $this->seedLegacyPurchase('PB-20260815-001', 150000);
        $this->seedLegacyPurchase('PB-20260816-001', 1250000);

        $this->runDebtMigration();

        // Ini yang akan dilihat user di layar supplier. Kalau backfill
        // tidak ada, totalnya 0 dan seluruh utang lama lenyap tanpa error.
        $this->assertEqualsWithDelta(
            1400000.0, (float) $this->supplier->fresh()->totalPayable(), 0.005
        );
    }

    public function test_backfill_makes_legacy_debt_appear_in_the_purchase_list(): void
    {
        $this->rewindToBeforeDebtMigration();
        $this->seedLegacyPurchase('PB-20260815-001', 150000);

        $this->runDebtMigration();

        $res = $this->actingAs($this->user)->getJson('/api/purchases');
        $res->assertOk();

        $row = $res->json('data.0');
        $this->assertEqualsWithDelta(150000.0, (float) $row['payable'], 0.005);
        $this->assertSame('unpaid', $row['payment_status']);
    }

    public function test_legacy_debt_can_actually_be_settled_after_the_migration(): void
    {
        $this->rewindToBeforeDebtMigration();
        $id = $this->seedLegacyPurchase('PB-20260815-001', 150000);

        $this->runDebtMigration();
        $purchase = Purchase::findOrFail($id);

        // Kalau payable backfill 0, pelunasan tidak mungkin terjadi dan
        // seluruh fitur ini tidak berguna untuk data lama.
        $this->actingAs($this->user)->postJson('/api/supplier-payments', [
            'date' => '2026-09-01',
            'supplier_id' => $this->supplier->id,
            'purchase_id' => $purchase->id,
            'amount' => 150000,
            'method' => 'transfer',
        ])->assertCreated();

        $purchase->refresh();
        $this->assertEqualsWithDelta(0.0, (float) $purchase->payable, 0.005);
        $this->assertSame('paid', $purchase->payment_status);
        $this->assertEqualsWithDelta(0.0, $this->supplier->fresh()->totalPayable(), 0.005);
    }

    public function test_migration_is_safe_to_run_on_an_empty_database(): void
    {
        $this->rewindToBeforeDebtMigration();

        $this->runDebtMigration();

        $this->assertSame(0, DB::table('purchases')->count());
        $this->assertTrue(Schema::hasTable('supplier_payments'));
        $this->assertTrue(Schema::hasColumn('purchases', 'payable'));
    }

    public function test_rollback_removes_everything_the_migration_added(): void
    {
        $this->rewindToBeforeDebtMigration();
        $this->seedLegacyPurchase('PB-20260815-001', 150000);
        $migration = $this->runDebtMigration();

        // `down()` dipanggil langsung, bukan lewat `migrate:rollback`.
        // Semua migration di test ini jalan dalam satu batch, jadi
        // rollback satu langkah akan menjatuhkan tabel `users` juga dan
        // sisa test gagal dengan error yang tidak ada hubungannya dengan
        // migration yang sedang diuji.
        $migration->down();

        $this->assertFalse(Schema::hasTable('supplier_payments'));
        $this->assertFalse(Schema::hasColumn('purchases', 'payable'));
        $this->assertFalse(Schema::hasColumn('purchases', 'payment_status'));
        $this->assertFalse(Schema::hasColumn('purchases', 'due_date'));

        // Data purchase lama harus utuh - rollback schema tidak boleh
        // ikut menghapus transaksi yang sudah tercatat.
        $row = DB::table('purchases')->first();
        $this->assertNotNull($row, 'purchase lama ikut hilang saat rollback');
        $this->assertEqualsWithDelta(150000.0, (float) $row->total, 0.005);
    }

    public function test_rollback_is_reversible_so_a_failed_deploy_can_be_retried(): void
    {
        $this->rewindToBeforeDebtMigration();
        $id = $this->seedLegacyPurchase('PB-20260815-001', 150000);

        $this->runDebtMigration()->down();
        $this->runDebtMigration();

        // Migration dijalankan lagi setelah rollback harus tetap jalan
        // dan tetap menghasilkan angka yang benar, tidak meledak dengan
        // "column already exists".
        $row = DB::table('purchases')->where('id', $id)->first();
        $this->assertEqualsWithDelta(150000.0, (float) $row->payable, 0.005);
        $this->assertSame('unpaid', $row->payment_status);
    }
}
