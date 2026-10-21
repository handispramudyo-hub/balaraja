<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Menjamin laporan penjualan/pembelian/piutang mengekspos detail barang
 * TANPA kehilangan satu pun nilai yang dulu sudah tampil.
 *
 * Yang dikunci di sini:
 *  1. Kompatibilitas mundur - semua field lama masih ada dan nilainya sama,
 *     jadi penambahan `items` tidak bisa diam-diam merusak kolom di frontend.
 *  2. Rekonsiliasi - jumlah subtotal item WAJIB sama dengan total header.
 *     Inilah pengaman utama terhadap "nilai hilang": kalau detail dan header
 *     berbeda, test ini gagal.
 *  3. Produk yang sudah dihapus tetap muncul sebagai baris item, bukan
 *     hilang diam-diam dari detail.
 *  4. HPP TIDAK boleh bocor per item (keputusan laporan penjualan/pembelian).
 */
class ReportItemDetailTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Category $category;

    private Customer $customer;

    private Supplier $supplier;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->category = Category::create(['name' => 'Minuman']);
        $this->customer = Customer::create(['code' => 'C001', 'name' => 'Toko Maju']);
        $this->supplier = Supplier::create(['name' => 'PT Sumber']);
    }

    private function product(array $attributes = []): Product
    {
        $this->seq++;

        return Product::create(array_merge([
            'code' => 'P'.str_pad((string) $this->seq, 3, '0', STR_PAD_LEFT),
            'name' => 'Teh Pucuk '.$this->seq,
            'category_id' => $this->category->id,
            'unit' => 'botol',
            'buy_price' => 10000,
            'sell_price' => 15000,
            'stock' => 100,
            'min_stock' => 0,
        ], $attributes));
    }

    /** @param  array<int, array{0: Product, 1: int}>  $lines  [product, qty] */
    private function makeSale(array $lines, string $date = '2026-09-01', array $saleAttributes = []): Sale
    {
        $total = 0;

        $sale = Sale::create(array_merge([
            'sale_number' => 'INV-'.$this->seq.'-'.$date,
            'date' => $date,
            'customer_id' => $this->customer->id,
            'total' => 0,
            'payment' => 0,
            'receivable' => 0,
            'payment_status' => 'unpaid',
            'user_id' => $this->user->id,
        ], $saleAttributes));

        foreach ($lines as [$product, $qty]) {
            // Snapshot harga dari produk saat transaksi dibuat — ini yang
            // membuat HPP historis tidak berubah retroactive.
            $sellPrice = (float) $product->sell_price;
            $subtotal = $qty * $sellPrice;

            SaleItem::create([
                'sale_id' => $sale->id,
                'product_id' => $product->id,
                'quantity' => $qty,
                'sell_price' => $sellPrice,
                'buy_price' => (float) $product->buy_price,
                'subtotal' => $subtotal,
            ]);

            $total += $subtotal;
        }

        $sale->forceFill([
            'total' => $total,
            'receivable' => $total - (float) ($saleAttributes['payment'] ?? 0),
        ])->save();

        return $sale;
    }

    /** @param  array<int, array{0: Product, 1: int}>  $lines  [product, qty] */
    private function makePurchase(array $lines, string $date = '2026-09-01'): Purchase
    {
        $total = 0;

        $purchase = Purchase::create([
            'purchase_number' => 'PO-'.$this->seq.'-'.$date,
            'date' => $date,
            'supplier_id' => $this->supplier->id,
            'total' => 0,
            'payment' => 0,
            'user_id' => $this->user->id,
        ]);

        foreach ($lines as [$product, $qty]) {
            $buyPrice = (float) $product->buy_price;
            $subtotal = $qty * $buyPrice;

            PurchaseItem::create([
                'purchase_id' => $purchase->id,
                'product_id' => $product->id,
                'quantity' => $qty,
                'buy_price' => $buyPrice,
                'subtotal' => $subtotal,
            ]);

            $total += $subtotal;
        }

        $purchase->forceFill(['total' => $total])->save();

        return $purchase;
    }

    public function test_sales_report_keeps_legacy_fields_and_adds_item_detail(): void
    {
        $a = $this->product(['code' => 'BRG-01', 'name' => 'Teh Pucuk', 'unit' => 'botol']);
        $b = $this->product(['code' => 'BRG-02', 'name' => 'Air Mineral', 'unit' => 'botol']);

        $this->makeSale([[$a, 2], [$b, 3]], '2026-09-01', [
            'payment' => 50000,
            'payment_status' => 'partial',
        ]);

        $res = $this->actingAs($this->user)->getJson('/api/reports/sales');
        $res->assertOk();

        $rows = $res->json('data');
        $this->assertCount(1, $rows);
        $row = $rows[0];

        // 1. field lama tidak hilang / tidak berubah bentuk
        $this->assertArrayHasKey('id', $row);
        $this->assertArrayHasKey('no_transaksi', $row);
        $this->assertArrayHasKey('tanggal', $row);
        $this->assertArrayHasKey('nama_toko', $row);
        $this->assertArrayHasKey('total', $row);
        $this->assertArrayHasKey('pembayaran', $row);
        $this->assertArrayHasKey('sisa_piutang', $row);
        $this->assertArrayHasKey('payment_status', $row);

        $this->assertSame('Toko Maju', $row['nama_toko']);
        $this->assertEqualsWithDelta(75000.0, (float) $row['total'], 0.001);           // 2x15rb + 3x15rb
        $this->assertEqualsWithDelta(50000.0, (float) $row['pembayaran'], 0.001);
        $this->assertEqualsWithDelta(25000.0, (float) $row['sisa_piutang'], 0.001);
        $this->assertSame('partial', $row['payment_status']);

        // 2. detail item lengkap
        $this->assertCount(2, $row['items']);
        $this->assertSame('BRG-01', $row['items'][0]['kode']);
        $this->assertSame('Teh Pucuk', $row['items'][0]['nama']);
        $this->assertSame('botol', $row['items'][0]['satuan']);
        $this->assertEqualsWithDelta(2.0, (float) $row['items'][0]['qty'], 0.001);
        $this->assertEqualsWithDelta(15000.0, (float) $row['items'][0]['harga'], 0.001);
        $this->assertEqualsWithDelta(30000.0, (float) $row['items'][0]['subtotal'], 0.001);

        $this->assertSame('BRG-02', $row['items'][1]['kode']);
        $this->assertEqualsWithDelta(45000.0, (float) $row['items'][1]['subtotal'], 0.001);
    }

    /**
     * Regresi: laporan/cetak/Excel TIDAK BOLEH ikut berubah label satuan
     * hanya karena owner mengganti satuan dasar produk SETELAH transaksi.
     *
     * reproduced: `satuan` dibaca dari `products.unit`. Setelah rebase
     * dos -> btl, `products.unit` = 'btl', sehingga penjualan lama "2 dos"
     * ikut tercetak "2 btl" - qty-nya masih 2 (dalam dos), jadi angkanya
     * jadi salah, bukan cuma salah label. Test ini gagal kalau `satuan`
     * kembali ke produk.
     */
    public function test_report_uses_item_unit_snapshot_after_base_unit_changes(): void
    {
        $p = $this->product(['code' => 'BRG-01', 'name' => 'Teh Pucuk', 'unit' => 'dos']);

        $this->makeSale([[$p, 2]], '2026-09-01');
        SaleItem::whereHas('sale')->first()->forceFill(['unit_name' => 'dos'])->save();

        // Owner menggantinya satuan dasar ke botol.
        $p->forceFill(['unit' => 'btl'])->save();

        $res = $this->actingAs($this->user)->getJson('/api/reports/sales');
        $res->assertOk();

        $row = $res->json('data.0');
        $this->assertSame('dos', $row['items'][0]['satuan'], 'qty 2 dicetak dengan satuan dasar saat ini');
        $this->assertEqualsWithDelta(2.0, (float) $row['items'][0]['qty'], 0.001);
    }

    /**
     * Baris legacy (sebelum fitur satuan) tidak punya snapshot. Satu-satunya
     * satuan yang benar untuk baris itu adalah satuan dasar produk, jadi
     * harus tetap tampil - bukan berubah jadi '-'.
     */
    public function test_report_falls_back_to_product_unit_when_item_snapshot_is_null(): void
    {
        $p = $this->product(['code' => 'BRG-01', 'name' => 'Teh Pucuk', 'unit' => 'dos']);

        $this->makeSale([[$p, 2]], '2026-09-01');
        $this->assertNull(SaleItem::first()->unit_name, 'fixture harus benar-benar legacy');

        $res = $this->actingAs($this->user)->getJson('/api/reports/sales');
        $res->assertOk();

        $this->assertSame('dos', $res->json('data.0.items.0.satuan'));
    }

    public function test_sales_report_reconciles_item_subtotals_with_header_total(): void    {
        $a = $this->product();
        $b = $this->product();
        $c = $this->product();

        $this->makeSale([[$a, 4], [$b, 1], [$c, 7]], '2026-09-01');
        $this->makeSale([[$b, 2], [$c, 5]], '2026-09-02');

        $res = $this->actingAs($this->user)->getJson('/api/reports/sales');
        $res->assertOk();

        $rows = $res->json('data');
        $sumHeader = 0.0;
        $sumItems = 0.0;

        foreach ($rows as $row) {
            $rowItemTotal = 0.0;
            foreach ($row['items'] as $item) {
                $rowItemTotal += (float) $item['subtotal'];
            }

            // guard utama: detail harus sama dengan header
            $this->assertEqualsWithDelta(
                (float) $row['total'],
                $rowItemTotal,
                0.001,
                'Subtotal item tidak rekonsiliasi dengan total transaksi '.$row['no_transaksi']
            );

            $sumHeader += (float) $row['total'];
            $sumItems += $rowItemTotal;
        }

        $this->assertEqualsWithDelta($sumHeader, $sumItems, 0.001);
        $this->assertEqualsWithDelta($sumHeader, (float) $res->json('summary.omzet'), 0.001);
        $this->assertSame(2, $res->json('summary.jumlah_transaksi'));
    }

    public function test_sales_report_hides_hpp_per_item_but_keeps_report_level_totals(): void
    {
        $a = $this->product(['buy_price' => 8000, 'sell_price' => 15000]);
        $this->makeSale([[$a, 2]], '2026-09-01');

        $res = $this->actingAs($this->user)->getJson('/api/reports/sales');
        $res->assertOk();

        $item = $res->json('data.0.items.0');

        // tidak boleh ada HPP/laba di baris item
        $this->assertArrayNotHasKey('buy_price', $item);
        $this->assertArrayNotHasKey('hpp', $item);
        $this->assertArrayNotHasKey('laba', $item);
        $this->assertArrayNotHasKey('profit', $item);

        // ... tapi total laporan tetap punya HPP supaya Laba Rugi rekonsiliasi
        $this->assertEqualsWithDelta(16000.0, (float) $res->json('data.0.hpp'), 0.001);
        $this->assertEqualsWithDelta(14000.0, (float) $res->json('data.0.laba_kotor'), 0.001);
        $this->assertEqualsWithDelta(16000.0, (float) $res->json('summary.hpp'), 0.001);
        $this->assertEqualsWithDelta(14000.0, (float) $res->json('summary.laba_kotor'), 0.001);
    }

    public function test_purchase_report_keeps_legacy_fields_and_adds_item_detail(): void
    {
        $a = $this->product(['code' => 'BRG-09', 'name' => 'Gula', 'unit' => 'sak']);
        $b = $this->product(['code' => 'BRG-10', 'name' => 'Garam', 'unit' => 'pack']);

        $this->makePurchase([[$a, 5], [$b, 2]], '2026-09-01');

        $res = $this->actingAs($this->user)->getJson('/api/reports/purchases');
        $res->assertOk();

        $row = $res->json('data.0');

        $this->assertArrayHasKey('no_pembelian', $row);
        $this->assertArrayHasKey('tanggal', $row);
        $this->assertArrayHasKey('nama_supplier', $row);
        $this->assertArrayHasKey('total', $row);
        $this->assertSame('PT Sumber', $row['nama_supplier']);
        $this->assertEqualsWithDelta(70000.0, (float) $row['total'], 0.001);   // 5x10rb + 2x10rb

        $this->assertCount(2, $row['items']);
        $this->assertSame('BRG-09', $row['items'][0]['kode']);
        $this->assertSame('sak', $row['items'][0]['satuan']);
        $this->assertEqualsWithDelta(5.0, (float) $row['items'][0]['qty'], 0.001);
        $this->assertEqualsWithDelta(10000.0, (float) $row['items'][0]['harga'], 0.001);   // harga BELI
        $this->assertEqualsWithDelta(50000.0, (float) $row['items'][0]['subtotal'], 0.001);

        $itemTotal = 0.0;
        foreach ($row['items'] as $item) {
            $itemTotal += (float) $item['subtotal'];
        }
        $this->assertEqualsWithDelta((float) $row['total'], $itemTotal, 0.001);
        $this->assertEqualsWithDelta((float) $row['total'], (float) $res->json('summary.total'), 0.001);
    }

    public function test_receivables_report_exposes_item_detail_per_sale(): void
    {
        $a = $this->product(['code' => 'BRG-01', 'name' => 'Teh Pucuk', 'unit' => 'botol']);
        $b = $this->product(['code' => 'BRG-02', 'name' => 'Air Mineral', 'unit' => 'botol']);

        $this->makeSale([[$a, 2], [$b, 3]], '2026-09-01', [
            'payment' => 0,
            'payment_status' => 'unpaid',
        ]);

        $this->customer->forceFill([
            'total_receivable' => 75000,
            'credit_limit' => 500000,
        ])->save();

        $res = $this->actingAs($this->user)->getJson('/api/reports/receivables');
        $res->assertOk();

        $row = $res->json('data.0');

        // field lama
        $this->assertArrayHasKey('nama_toko', $row);
        $this->assertArrayHasKey('total_transaksi', $row);
        $this->assertArrayHasKey('pembayaran', $row);
        $this->assertArrayHasKey('sisa_piutang', $row);
        $this->assertArrayHasKey('jatuh_tempo', $row);
        $this->assertArrayHasKey('status_lunas', $row);
        $this->assertArrayHasKey('detail', $row);

        $this->assertSame('Toko Maju', $row['nama_toko']);
        $this->assertEqualsWithDelta(75000.0, (float) $row['total_transaksi'], 0.001);
        $this->assertEqualsWithDelta(75000.0, (float) $row['sisa_piutang'], 0.001);
        $this->assertSame('unpaid', $row['status_lunas']);

        $sale = $row['detail'][0];
        $this->assertArrayHasKey('no_transaksi', $sale);
        $this->assertArrayHasKey('total', $sale);
        $this->assertArrayHasKey('sisa_piutang', $sale);
        $this->assertArrayHasKey('jatuh_tempo', $sale);

        $this->assertCount(2, $sale['items']);
        $this->assertSame('BRG-01', $sale['items'][0]['kode']);
        $this->assertEqualsWithDelta(30000.0, (float) $sale['items'][0]['subtotal'], 0.001);
        $this->assertEqualsWithDelta(45000.0, (float) $sale['items'][1]['subtotal'], 0.001);

        $itemTotal = 0.0;
        foreach ($sale['items'] as $item) {
            $itemTotal += (float) $item['subtotal'];
        }
        $this->assertEqualsWithDelta((float) $sale['total'], $itemTotal, 0.001);
    }

    public function test_product_used_by_a_sale_item_cannot_be_deleted(): void
    {
        // Kontrak skema yang membuat detail item selalu utuh: `sale_items.product_id`
        // punya FK tanpa cascade, jadi produk yang sudah pernah terjual TIDAK
        // bisa dihapus dan baris item tidak mungkin menjadi yatim.
        //
        // Karena itu fallback '(produk dihapus)' di ReportQueryService murni
        // defensif untuk data legacy — bukan jalur yang bisa diam-diam
        // membuang nilai dari laporan.
        $a = $this->product();
        $this->makeSale([[$a, 1]], '2026-09-01');

        $this->expectException(QueryException::class);

        $a->delete();
    }

    public function test_report_meta_carries_title_and_active_filters_for_print_and_export(): void
    {
        $a = $this->product();
        $this->makeSale([[$a, 1]], '2026-09-01');

        $res = $this->actingAs($this->user)->getJson('/api/reports/sales?start_date=2026-09-01&end_date=2026-09-30&payment_status=unpaid');
        $res->assertOk();

        $meta = $res->json('meta');
        $this->assertSame('Laporan Penjualan', $meta['title']);
        $this->assertSame('penjualan', $meta['slug']);
        $this->assertSame('01/09/2026 - 30/09/2026', $meta['periode']);
        $this->assertContains('Status Pembayaran: Belum bayar', $meta['filters']);
        $this->assertNotEmpty($meta['generated_at']);
    }

    public function test_date_filters_still_scope_rows(): void
    {
        $a = $this->product();
        $b = $this->product();

        $this->makeSale([[$a, 1]], '2026-09-01');
        $this->makeSale([[$b, 1]], '2026-10-05');

        $res = $this->actingAs($this->user)->getJson('/api/reports/sales?start_date=2026-09-01&end_date=2026-09-30');
        $res->assertOk();

        $this->assertCount(1, $res->json('data'));
        $this->assertEqualsWithDelta(15000.0, (float) $res->json('summary.omzet'), 0.001);
    }
}
