<?php

namespace Tests\Feature;

use App\Exports\ReportExportBuilder;
use App\Http\Controllers\Api\ReportExportController;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Supplier;
use App\Models\User;
use App\Services\ReportQueryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\BinaryFileResponse;
use Illuminate\Http\Request;
use Illuminate\Http\StreamedResponse;
use Maatwebsite\Excel\Facades\Excel;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Tests\TestCase;

/**
 * Menjamin export Excel/PDF tidak pernah berbeda dari yang tampil di layar.
 *
 * Ini guard "tidak ada nilai yang hilang" yang paling penting: file export
 * dibaca KEMBALI (xlsx di-parse ulang, pdf dicek signature-nya), lalu
 * angkanya dibandingkan dengan respons JSON laporan yang sama.
 *
 * Kalau suatu saat ada query terpisah untuk export, test ini langsung merah.
 */
class ReportExportTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Category $category;

    private Customer $customer;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->category = Category::create(['name' => 'Minuman']);
        $this->customer = Customer::create(['code' => 'C001', 'name' => 'Toko Maju']);
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

    /** @param  array<int, array{0: Product, 1: int}>  $lines */
    private function makeSale(array $lines, string $date = '2026-09-01'): Sale
    {
        $total = 0;

        $sale = Sale::create([
            'sale_number' => 'INV-'.$this->seq.'-'.$date,
            'date' => $date,
            'customer_id' => $this->customer->id,
            'total' => 0,
            'payment' => 0,
            'receivable' => 0,
            'payment_status' => 'unpaid',
            'user_id' => $this->user->id,
        ]);

        foreach ($lines as [$product, $qty]) {
            $subtotal = $qty * (float) $product->sell_price;

            SaleItem::create([
                'sale_id' => $sale->id,
                'product_id' => $product->id,
                'quantity' => $qty,
                'sell_price' => (float) $product->sell_price,
                'buy_price' => (float) $product->buy_price,
                'subtotal' => $subtotal,
            ]);

            $total += $subtotal;
        }

        $sale->forceFill(['total' => $total, 'receivable' => $total])->save();

        // Laporan piutang hanya mengambil pelanggan dengan total_receivable
        // > 0. Kalau saldo pelanggan tidak ikut diupdate, laporan piutang
        // mengembalikan NOL BARIS dan test export piutang jadi hijau tanpa
        // benar-benar menguji apa pun.
        $this->customer->forceFill([
            'total_receivable' => (float) $this->customer->total_receivable + $total,
        ])->save();

        return $sale;
    }

    private function responseBody($response): string
    {
        if ($response instanceof BinaryFileResponse) {
            $path = $response->getFile()->getPathname();

            return is_file($path) ? (string) file_get_contents($path) : '';
        }

        if ($response instanceof StreamedResponse) {
            ob_start();
            $response->sendContent();
            $content = ob_get_clean();

            return $content === false ? '' : $content;
        }

        return (string) $response->getContent();
    }

    /**
     * Binary hasil export, TANPA lewat HTTP.
     *
     * `Excel::download()` menulis ke file sementara lalu menghapusnya begitu
     * respons terkirim (`deleteFileAfterSend(true)`) â€” jadi isinya tidak bisa
     * dibaca lagi setelah request selesai. `Excel::raw()` mengembalikan string
     * langsung, dan karena dibangun dari ReportExportBuilder yang sama, isi
     * file-nya identik dengan yang diunduh user.
     */
    private function rawExcel(string $report, array $query = []): string
    {
        $request = Request::create('/api/reports/export/'.$report, 'GET', $query);
        $app = app();
        $app->instance('request', $request);

        $reportData = $app->make(ReportQueryService::class)->{$report}($request);

        return Excel::raw(
            ReportExportBuilder::build($report, $reportData),
            \Maatwebsite\Excel\Excel::XLSX
        );
    }

    /** Parse binary xlsx dari string, return spreadsheet-nya. */
    private function loadXlsx(string $binary)
    {
        $path = tempnam(sys_get_temp_dir(), 'xlsx').'.xlsx';
        file_put_contents($path, $binary);

        $spreadsheet = IOFactory::load($path);
        @unlink($path);

        return $spreadsheet;
    }

    public function test_excel_export_is_a_valid_xlsx_with_two_sheets(): void
    {
        $a = $this->product();
        $b = $this->product();
        $this->makeSale([[$a, 2], [$b, 3]], '2026-09-01');

        // bentuk endpoint
        $this->actingAs($this->user)
            ->get('/api/reports/export/sales?format=excel')
            ->assertOk()
            ->assertHeader(
                'content-type',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            );

        // isi file
        $body = $this->rawExcel('sales');
        $this->assertStringStartsWith('PK', $body, 'Bukan file xlsx yang valid');

        $spreadsheet = $this->loadXlsx($body);
        $names = $spreadsheet->getSheetNames();

        $this->assertCount(2, $names, 'Excel harus punya sheet Ringkasan + Detail');
        $this->assertSame('Ringkasan', $names[0]);
        $this->assertSame('Detail', $names[1]);
    }

    public function test_excel_detail_sheet_totals_match_the_screen_report(): void
    {
        $a = $this->product();
        $b = $this->product();
        $this->makeSale([[$a, 2], [$b, 3]], '2026-09-01');
        $this->makeSale([[$b, 5]], '2026-09-02');

        // 1. angka layar
        $json = $this->actingAs($this->user)->getJson('/api/reports/sales')->json();
        $screenTotal = (float) $json['summary']['omzet'];
        $screenCount = $json['summary']['jumlah_transaksi'];

        // 2. angka export
        $spreadsheet = $this->loadXlsx($this->rawExcel('sales'));

        // Sheet Ringkasan: kolom E = Total per transaksi. Baris data mulai
        // sesudah header tabel, bukan langsung di baris 2, karena baris 1-2
        // sekarang dipakai blok total laporan.
        $summarySheet = $spreadsheet->getSheet(0);
        $summaryTotal = 0.0;
        $summaryRows = 0;
        $summaryHeadings = ['No', 'No Transaksi', 'Tanggal', 'Pelanggan', 'Total', 'Dibayar', 'Sisa Piutang', 'Status'];
        for ($r = $this->summaryHeaderRow($summarySheet, $summaryHeadings) + 1; $r <= $summarySheet->getHighestRow(); $r++) {
            $value = $summarySheet->getCell("E{$r}")->getCalculatedValue();
            if (is_numeric($value)) {
                $summaryTotal += (float) $value;
                $summaryRows++;
            }
        }

        $this->assertSame($screenCount, $summaryRows, 'Jumlah baris ringkasan tidak sama dengan layar');
        $this->assertEqualsWithDelta($screenTotal, $summaryTotal, 0.01, 'Total sheet Ringkasan beda dengan layar');

        // Sheet Detail: kolom J = Subtotal Baris, K = Total Transaksi
        $detailSheet = $spreadsheet->getSheet(1);
        $detailItemTotal = 0.0;
        $detailHeaderTotal = 0.0;
        for ($r = 2; $r <= $detailSheet->getHighestRow(); $r++) {
            $sub = $detailSheet->getCell("J{$r}")->getCalculatedValue();
            if (is_numeric($sub)) {
                $detailItemTotal += (float) $sub;
            }
            $trx = $detailSheet->getCell("K{$r}")->getCalculatedValue();
            if (is_numeric($trx)) {
                $detailHeaderTotal += (float) $trx;
            }
        }

        // rekonsiliasi: jumlah subtotal item == total transaksi == layar
        $this->assertEqualsWithDelta($screenTotal, $detailHeaderTotal, 0.01, 'Total header di sheet Detail beda dengan layar');
        $this->assertEqualsWithDelta($detailHeaderTotal, $detailItemTotal, 0.01, 'Subtotal item di sheet Detail tidak rekonsiliasi dengan total transaksi');
    }

    public function test_excel_export_respects_date_filters(): void
    {
        $a = $this->product();
        $b = $this->product();
        $this->makeSale([[$a, 1]], '2026-09-01');   // 15.000
        $this->makeSale([[$b, 1]], '2026-10-05');   // 15.000

        $body = $this->rawExcel('sales', [
            'start_date' => '2026-09-01',
            'end_date' => '2026-09-30',
        ]);

        $sheet = $this->loadXlsx($body)->getSheet(0);
        $headings = ['No', 'No Transaksi', 'Tanggal', 'Pelanggan', 'Total', 'Dibayar', 'Sisa Piutang', 'Status'];
        $header = $this->summaryHeaderRow($sheet, $headings);
        $first = $header + 1;

        $this->assertSame($first, $sheet->getHighestRow(), 'Filter tanggal tidak diterapkan di export');
        $this->assertEqualsWithDelta(15000.0, (float) $sheet->getCell("E{$first}")->getCalculatedValue(), 0.01);
    }

    public function test_excel_detail_sheet_lists_every_item_row(): void
    {
        $a = $this->product(['code' => 'BRG-01', 'name' => 'Teh Pucuk', 'unit' => 'botol']);
        $b = $this->product(['code' => 'BRG-02', 'name' => 'Air Mineral', 'unit' => 'botol']);
        $this->makeSale([[$a, 2], [$b, 3]], '2026-09-01');

        $sheet = $this->loadXlsx($this->rawExcel('sales'))->getSheet(1);

        $rows = [];
        for ($r = 2; $r <= $sheet->getHighestRow(); $r++) {
            $rows[] = [
                'kode' => (string) $sheet->getCell("E{$r}")->getValue(),
                'nama' => (string) $sheet->getCell("F{$r}")->getValue(),
                'satuan' => (string) $sheet->getCell("G{$r}")->getValue(),
                'qty' => $sheet->getCell("H{$r}")->getCalculatedValue(),
                'harga' => $sheet->getCell("I{$r}")->getCalculatedValue(),
                'subtotal' => $sheet->getCell("J{$r}")->getCalculatedValue(),
            ];
        }

        $this->assertCount(2, $rows, 'Setiap baris barang harus punya baris sendiri di sheet Detail');
        $this->assertSame('BRG-01', $rows[0]['kode']);
        $this->assertSame('Teh Pucuk', $rows[0]['nama']);
        $this->assertSame('botol', $rows[0]['satuan']);
        $this->assertEqualsWithDelta(2.0, (float) $rows[0]['qty'], 0.001);
        $this->assertEqualsWithDelta(15000.0, (float) $rows[0]['harga'], 0.001);
        $this->assertEqualsWithDelta(30000.0, (float) $rows[0]['subtotal'], 0.001);

        $this->assertSame('BRG-02', $rows[1]['kode']);
        $this->assertEqualsWithDelta(45000.0, (float) $rows[1]['subtotal'], 0.001);
    }

    public function test_pdf_export_is_a_valid_pdf(): void
    {
        $a = $this->product();
        $b = $this->product();
        $this->makeSale([[$a, 2], [$b, 3]], '2026-09-01');

        $response = $this->actingAs($this->user)->get('/api/reports/export/sales?format=pdf');
        $response->assertOk();
        $response->assertHeader('content-type', 'application/pdf');

        $body = $this->responseBody($response);
        $this->assertStringStartsWith('%PDF', $body, 'Bukan file PDF yang valid');
    }

    public function test_pdf_export_contains_item_names(): void
    {
        $a = $this->product(['name' => 'Teh Pucuk Harum']);
        $this->makeSale([[$a, 2]], '2026-09-01');

        $response = $this->actingAs($this->user)->get('/api/reports/export/sales?format=pdf');
        $response->assertOk();

        $body = $this->responseBody($response);
        $this->assertNotEmpty($body);

        // dompdf mengompres stream secara default, jadi cukup pastikan file
        // benar-benar sizeable (bukan halaman kosong) dan signature benar.
        $this->assertGreaterThan(1000, strlen($body), 'PDF hasil export suspiciously kecil');
    }

    public function test_unknown_report_is_rejected(): void
    {
        $this->actingAs($this->user)
            ->get('/api/reports/export/tidak-ada?format=excel')
            ->assertNotFound();
    }

    public function test_invalid_format_is_rejected(): void
    {
        $this->actingAs($this->user)
            ->get('/api/reports/export/sales?format=docx')
            ->assertStatus(422);
    }

    public function test_export_requires_authentication(): void
    {
        $this->get('/api/reports/export/sales?format=excel')->assertUnauthorized();
    }

    /**
     * PEMBELIAN
     *
     * Sheet Ringkasan dulu menulis 8 kolom penjualan apa adanya ke config
     * pembelian yang cuma 5 header. Akibatnya baris "~5000" muncul di kolom
     * ke-6 yang tidak punya header, dan pemformatan uang terpAKet ke kolom
     * yang salah. Test ini mengunci jumlah kolom dan isi tiap kolom.
     */
    public function test_purchases_summary_columns_match_its_own_headings(): void
    {
        $supplier = Supplier::create(['code' => 'S001', 'name' => 'PT Sumber Makmur']);

        $product = Product::create([
            'code' => 'BRG-BELI',
            'name' => 'Teh Pucuk Kemasan',
            'category_id' => $this->category->id,
            'unit' => 'dus',
            'buy_price' => 45000,
            'sell_price' => 52000,
            'stock' => 50,
            'min_stock' => 0,
        ]);

        $purchase = Purchase::create([
            'purchase_number' => 'PO-2026-09-001',
            'date' => '2026-09-03',
            'supplier_id' => $supplier->id,
            'total' => 0,
            'user_id' => $this->user->id,
        ]);

        PurchaseItem::create([
            'purchase_id' => $purchase->id,
            'product_id' => $product->id,
            'quantity' => 4,
            'buy_price' => 45000,
            'subtotal' => 180000,
        ]);

        $purchase->forceFill(['total' => 180000])->save();

        $spreadsheet = $this->loadXlsx($this->rawExcel('purchases'));
        $sheet = $spreadsheet->getSheet(0);

        // Tujuh kolom, bukan lima. Kolom Sisa Utang / Jatuh Tempo / Status
        // ditambahkan saat fitur utang pembelian masuk, dan sengaja memakai
        // label serta helper yang sama dengan laporan piutang
        // (`receivables`) supaya kedua laporan bisa dibaca berdampingan.
        $expectedHeadings = ['No', 'No Pembelian', 'Tanggal', 'Supplier', 'Total', 'Sisa Utang', 'Jatuh Tempo', 'Status'];
        $header = $this->summaryHeaderRow($sheet, $expectedHeadings);
        $row = $header + 1;

        $this->assertSame($expectedHeadings, $this->headingValues($sheet, $header));

        // Tidak boleh ada kolom ekstra: kalau ada, nilainya jatuh di kolom
        // tanpa judul dan angka jadi tak bertanda. Blok summary lebih sempit
        // dari tabel detail, jadi lebar sheet tetap mengikuti tabel detail.
        $this->assertSame(
            Coordinate::stringFromColumnIndex(count($expectedHeadings)),
            $sheet->getHighestColumn(),
            'Sheet Ringkasan pembelian punya kolom berlebih'
        );

        $this->assertSame(1, (int) $sheet->getCell("A{$row}")->getCalculatedValue());
        $this->assertSame('PO-2026-09-001', (string) $sheet->getCell("B{$row}")->getValue());
        $this->assertSame('03/09/2026', (string) $sheet->getCell("C{$row}")->getValue());
        $this->assertSame('PT Sumber Makmur', (string) $sheet->getCell("D{$row}")->getValue());
        $this->assertEqualsWithDelta(180000.0, (float) $sheet->getCell("E{$row}")->getCalculatedValue(), 0.01);

        // Utang transaksi yang sama harus ikut terbawa, dan nilainya harus
        // PERSIS sama dengan `payable` yang dibaca di daftar transaksi. Kalau
        // laporan menghitung ulang sendiri, ada peluang di mana file
        // export dan layar menampilkan angka berbeda.
        $this->assertEqualsWithDelta(
            (float) $purchase->fresh()->payable,
            (float) $sheet->getCell("F{$row}")->getCalculatedValue(),
            0.01
        );
        $this->assertSame(
            'unpaid',
            $purchase->fresh()->payment_status,
            'fixture harus punya utang untuk menguji kolom status'
        );
        $this->assertSame('Belum Bayar', (string) $sheet->getCell("H{$row}")->getValue());

        // Kolom Total harus diformat sebagai uang, bukan teks biasa.
        $this->assertSame(
            '#,##0',
            $sheet->getStyle("E{$row}")->getNumberFormat()->getFormatCode()
        );
    }

    public function test_purchases_detail_totals_match_the_screen_report(): void
    {
        $supplier = Supplier::create(['code' => 'S001', 'name' => 'PT Sumber Makmur']);
        $product = $this->product();

        foreach ([[$product, 2], [$product, 3]] as $idx => [$p, $qty]) {
            $purchase = Purchase::create([
                'purchase_number' => 'PO-'.($idx + 1),
                'date' => '2026-09-0'.($idx + 1),
                'supplier_id' => $supplier->id,
                'total' => 0,
                'user_id' => $this->user->id,
            ]);

            PurchaseItem::create([
                'purchase_id' => $purchase->id,
                'product_id' => $p->id,
                'quantity' => $qty,
                'buy_price' => 10000,
                'subtotal' => $qty * 10000,
            ]);

            $purchase->forceFill(['total' => $qty * 10000])->save();
        }

        $screenTotal = (float) $this->actingAs($this->user)
            ->getJson('/api/reports/purchases')->json('summary.total');

        $detailSheet = $this->loadXlsx($this->rawExcel('purchases'))->getSheet(1);

        $itemTotal = 0.0;
        $headerTotal = 0.0;
        for ($r = 2; $r <= $detailSheet->getHighestRow(); $r++) {
            $sub = $detailSheet->getCell("J{$r}")->getCalculatedValue();
            if (is_numeric($sub)) {
                $itemTotal += (float) $sub;
            }
            $trx = $detailSheet->getCell("K{$r}")->getCalculatedValue();
            if (is_numeric($trx)) {
                $headerTotal += (float) $trx;
            }
        }

        $this->assertEqualsWithDelta($screenTotal, $headerTotal, 0.01);
        $this->assertEqualsWithDelta($headerTotal, $itemTotal, 0.01);
    }

    /**
     * PIUTANG
     *
     * Data piutang bersarang: pelanggan -> daftar penjualan -> barang. Sheet
     * Detail dulu hanya membaca $row['items'], jadi setiap pelanggan terbaca
     * "tidak ada rincian barang" dan SEMUA detail penjualan hilang dari file.
     * Test ini mengunci bahwa level kedua benar-benar ikut diekspor.
     */
    public function test_receivables_detail_sheet_keeps_nested_sale_items(): void
    {
        $a = $this->product(['code' => 'BRG-01', 'name' => 'Teh Pucuk']);
        $b = $this->product(['code' => 'BRG-02', 'name' => 'Air Mineral']);

        $this->makeSale([[$a, 2], [$b, 3]], '2026-09-01');

        $detailSheet = $this->loadXlsx($this->rawExcel('receivables'))->getSheet(1);

        $names = [];
        for ($r = 2; $r <= $detailSheet->getHighestRow(); $r++) {
            $names[] = (string) $detailSheet->getCell("F{$r}")->getValue();
        }

        $this->assertNotContains('(tidak ada rincian barang)', $names, 'Detail piutang kehilangan rincian barang');
        $this->assertSame(['Teh Pucuk', 'Air Mineral'], $names);
        $this->assertSame('INV-'.$this->seq.'-2026-09-01', (string) $detailSheet->getCell('B2')->getValue());
        $this->assertSame('Toko Maju', (string) $detailSheet->getCell('D2')->getValue());
    }
    public function test_receivables_summary_columns_match_its_own_headings(): void
    {
        $this->product();
        $this->makeSale([[$this->product(), 2]], '2026-09-01');

        $spreadsheet = $this->loadXlsx($this->rawExcel('receivables'));
        $sheet = $spreadsheet->getSheet(0);

        $expectedHeadings = [
            'No', 'Pelanggan', 'Total Transaksi', 'Dibayar', 'Sisa Piutang', 'Jatuh Tempo', 'Status',
        ];
        $row = $this->summaryHeaderRow($sheet, $expectedHeadings) + 1;
        $this->assertSame($expectedHeadings, $this->headingValues($sheet, $row - 1));

        $this->assertSame(1, (int) $sheet->getCell("A{$row}")->getCalculatedValue());
        $this->assertSame('Toko Maju', (string) $sheet->getCell("B{$row}")->getValue());
        $this->assertEqualsWithDelta(30000.0, (float) $sheet->getCell("C{$row}")->getCalculatedValue(), 0.01);
        $this->assertEqualsWithDelta(0.0, (float) $sheet->getCell("D{$row}")->getCalculatedValue(), 0.01);
        $this->assertEqualsWithDelta(30000.0, (float) $sheet->getCell("E{$row}")->getCalculatedValue(), 0.01);

        // Kolom Status harus TEKS label, bukan angka sisa piutang.
        $this->assertIsString($sheet->getCell("G{$row}")->getValue());
        $this->assertSame('Belum Bayar', (string) $sheet->getCell("G{$row}")->getValue());
    }

    public function test_receivables_excel_totals_match_the_screen_report(): void
    {
        $a = $this->product();
        $this->makeSale([[$a, 2]], '2026-09-01');
        $this->makeSale([[$a, 3]], '2026-09-02');

        $screen = $this->actingAs($this->user)->getJson('/api/reports/receivables')->json();
        $screenReceivable = (float) $screen['summary']['sisa_piutang'];

        // Guard: kalau layar sendiri nol, perbandingan di bawah tidak
        // membuktikan apa pun.
        $this->assertGreaterThan(0, $screenReceivable, 'Fixture piutang tidak terbentuk');
        $this->assertCount(1, $screen['data']);
        $this->assertCount(2, $screen['data'][0]['detail'], 'Harus ada 2 penjualan di detail piutang');

        $spreadsheet = $this->loadXlsx($this->rawExcel('receivables'));

        $summarySheet = $spreadsheet->getSheet(0);
        $summaryReceivable = 0.0;
        $receivableHeadings = ['No', 'Pelanggan', 'Total Transaksi', 'Dibayar', 'Sisa Piutang', 'Jatuh Tempo', 'Status'];
        for ($r = $this->summaryHeaderRow($summarySheet, $receivableHeadings) + 1; $r <= $summarySheet->getHighestRow(); $r++) {
            $summaryReceivable += (float) $summarySheet->getCell("E{$r}")->getCalculatedValue();
        }
        $this->assertEqualsWithDelta($screenReceivable, $summaryReceivable, 0.01);

        $detailSheet = $spreadsheet->getSheet(1);
        $detailItemTotal = 0.0;
        $detailHeaderTotal = 0.0;
        for ($r = 2; $r <= $detailSheet->getHighestRow(); $r++) {
            $sub = $detailSheet->getCell("J{$r}")->getCalculatedValue();
            if (is_numeric($sub)) {
                $detailItemTotal += (float) $sub;
            }
            $trx = $detailSheet->getCell("K{$r}")->getCalculatedValue();
            if (is_numeric($trx)) {
                $detailHeaderTotal += (float) $trx;
            }
        }

        $this->assertEqualsWithDelta($screenReceivable, $detailHeaderTotal, 0.01);
        $this->assertEqualsWithDelta($detailHeaderTotal, $detailItemTotal, 0.01);
    }

    public function test_purchases_pdf_export_is_a_valid_pdf(): void
    {
        $supplier = Supplier::create(['code' => 'S001', 'name' => 'PT Sumber Makmur']);
        $product = $this->product();

        $purchase = Purchase::create([
            'purchase_number' => 'PO-PDF',
            'date' => '2026-09-03',
            'supplier_id' => $supplier->id,
            'total' => 30000,
            'user_id' => $this->user->id,
        ]);
        PurchaseItem::create([
            'purchase_id' => $purchase->id,
            'product_id' => $product->id,
            'quantity' => 3,
            'buy_price' => 10000,
            'subtotal' => 30000,
        ]);

        $response = $this->actingAs($this->user)->get('/api/reports/export/purchases?format=pdf');
        $response->assertOk();
        $response->assertHeader('content-type', 'application/pdf');
        $this->assertStringStartsWith('%PDF', $this->responseBody($response));
    }

    public function test_receivables_pdf_export_is_a_valid_pdf(): void
    {
        $a = $this->product();
        $this->makeSale([[$a, 2], [$a, 1]], '2026-09-01');

        $response = $this->actingAs($this->user)->get('/api/reports/export/receivables?format=pdf');
        $response->assertOk();
        $response->assertHeader('content-type', 'application/pdf');
        $this->assertStringStartsWith('%PDF', $this->responseBody($response));
    }

    /**
     * Tanpa ini, Export di produksi hanya menampilkan "500 Server Error"
     * tanpa petunjuk. Test ini mengunci daftar ekstensi yang dibutuhkan engine
     * utama per format (dipakai untuk memilih engine, bukan untuk memblokir).
     */
    public function test_missing_extensions_are_detected_per_format(): void
    {
        $lengkap = ['dom', 'xmlwriter', 'zip'];

        $this->assertSame([], ReportExportController::missingExtensions('excel', $lengkap));
        $this->assertSame([], ReportExportController::missingExtensions('pdf', $lengkap));

        $tanpaZip = ['dom', 'xmlwriter'];
        $this->assertSame(['zip'], ReportExportController::missingExtensions('excel', $tanpaZip));

        $tanpaXml = ['dom', 'zip'];
        $this->assertSame(['xmlwriter'], ReportExportController::missingExtensions('excel', $tanpaXml));

        $tanpaDom = ['xmlwriter', 'zip'];
        $this->assertSame(['dom'], ReportExportController::missingExtensions('pdf', $tanpaDom));

        $kosong = [];
        $this->assertSame(['xmlwriter', 'zip'], ReportExportController::missingExtensions('excel', $kosong));
    }

    /**
     * Ini adalah test yang paling penting untuk hosting BALARAJA.
     *
     * Server produksi tidak punya ext-zip/ext-xmlwriter/ext-dom, jadi export
     * TIDAK boleh 503 dan tidak boleh 500: harus tetap menghasilkan file utuh
     * lewat writer murni PHP. Test ini mengunci dua hal sekaligus:
     *   1. fallback aktif (status 200 + signature file benar), dan
     *   2. isinya sama persis dengan yang dihasilkan engine utama, sehingga
     *      mengaktifkan ekstensi di server tidak mengubah isi laporan.
     */
    public function test_export_falls_back_to_pure_php_engines_without_extensions(): void
    {
        $a = $this->product(['code' => 'BRG-01', 'name' => 'Teh Pucuk']);
        $b = $this->product(['code' => 'BRG-02', 'name' => 'Air Mineral']);
        $this->makeSale([[$a, 2], [$b, 3]], '2026-09-01');

        $this->makePurchase();

        $this->bindServerWithoutExtensions();

        foreach (['sales', 'purchases', 'receivables'] as $report) {
            $excel = $this->actingAs($this->user)->get('/api/reports/export/'.$report.'?format=excel');

            $excel->assertStatus(200);
            $excel->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

            $fallbackXlsx = $this->responseBody($excel);
            $this->assertStringStartsWith('PK', $fallbackXlsx, $report.': fallback excel bukan file zip');

            $pdf = $this->actingAs($this->user)->get('/api/reports/export/'.$report.'?format=pdf');
            $pdf->assertStatus(200);
            $pdf->assertHeader('content-type', 'application/pdf');
            $this->assertStringStartsWith('%PDF-', $this->responseBody($pdf), $report.': fallback pdf bukan PDF');

            // Fallback tidak boleh mengosongkan isi: dua sheet, header utuh,
            // dan angka yang sama dengan file dari engine utama.
            $fallback = $this->loadXlsx($fallbackXlsx);
            $this->assertSame(2, $fallback->getSheetCount(), $report.': fallback harus punya 2 sheet');
            $this->assertSame(
                'Ringkasan',
                $fallback->getSheet(0)->getTitle(),
                $report.': sheet pertama fallback'
            );
            $this->assertSame(
                'Detail',
                $fallback->getSheet(1)->getTitle(),
                $report.': sheet kedua fallback'
            );
            $this->assertGreaterThan(
                1,
                $fallback->getSheet(1)->getHighestRow(),
                $report.': detail fallback harus punya baris data'
            );

            $expected = $this->sheetValues($this->loadXlsx($this->rawExcel($report)));
            $actual = $this->sheetValues($fallback);

            $this->assertSame(
                [],
                $this->cellMismatches($expected, $actual),
                $report.': isi fallback excel harus identik dengan PhpSpreadsheet'
            );
        }
    }

    /**
     * Paritas PDF: judul, nomor, dan nominal harus sama antara dompdf dan
     * renderer murni PHP supaya user tidak melihat laporan berbeda hanya
     * karena ekstensi server berubah.
     *
     * Teks diekstrak dengan pypdf karena dompdf mengompres stream PDF-nya,
     * sehingga kata kunci tidak bisa dicari di byte mentah.
     */
    public function test_pdf_fallback_contains_the_same_key_values(): void
    {
        $this->makeSale([[$this->product(['code' => 'BRG-01', 'name' => 'Teh Pucuk']), 2]], '2026-09-01');

        $denganDom = $this->pdfText($this->responseBody(
            $this->actingAs($this->user)->get('/api/reports/export/sales?format=pdf')
        ));

        $this->bindServerWithoutExtensions();

        $tanpaDom = $this->pdfText($this->responseBody(
            $this->actingAs($this->user)->get('/api/reports/export/sales?format=pdf')
        ));

        if ($denganDom === null || $tanpaDom === null) {
            $this->markTestSkipped('pypdf tidak tersedia');
        }

        foreach (['Laporan Penjualan', 'INV-', 'Toko Maju', 'Teh Pucuk', '10.000'] as $needle) {
            $this->assertStringContainsString($needle, $denganDom, 'dompdf tidak memuat: '.$needle);
            $this->assertStringContainsString($needle, $tanpaDom, 'fallback tidak memuat: '.$needle);
        }
    }

    /**
     * PhpSpreadsheet membuang sel bernilai nol, jadi kolom "Dibayar" pada
     * penjualan yang belum dibayar hilang begitu saja di file engine utama.
     * Writer cadangan wajib tetap menulis 0 supaya angka di file sama dengan
     * yang tampil di layar.
     */
    public function test_fallback_keeps_zero_values_that_phpspreadsheet_drops(): void
    {
        $this->makeSale([[$this->product(['code' => 'BRG-01', 'name' => 'Teh Pucuk']), 2]], '2026-09-01');

        $this->bindServerWithoutExtensions();

        $fallback = $this->loadXlsx($this->responseBody(
            $this->actingAs($this->user)->get('/api/reports/export/sales?format=excel')
        ));

        $ringkasan = $fallback->getSheet(0);
        $headings = ['No', 'No Transaksi', 'Tanggal', 'Pelanggan', 'Total', 'Dibayar', 'Sisa Piutang', 'Status'];
        $kolom = array_search('Dibayar', $this->rowValues($ringkasan, $this->summaryHeaderRow($ringkasan, $headings)), true);

        $this->assertNotFalse($kolom, 'kolom Dibayar tidak ditemukan');

        $nilai = (string) $ringkasan
            ->getCell(Coordinate::stringFromColumnIndex($kolom + 1).($this->summaryHeaderRow($ringkasan, $headings) + 1))
            ->getValue();

        $this->assertSame(
            '0',
            $nilai,
            'penjualan belum dibayar harus tetap menunjukkan 0, bukan sel kosong'
        );
    }

    /**
     * Nomor baris (1-based) header tabel per-transaksi di sheet Ringkasan.
     *
     * Sheet ini menaruh blok total laporan DI ATAS tabel, jadi header tabel
     * tidak lagi di baris 1. Dicari lewat isi, bukan angka tetap, supaya test
     * tetap benar kalau tata letaknya berubah.
     *
     * @param  array<int, string>  $headings
     */
    private function summaryHeaderRow($sheet, array $headings): int
    {
        for ($r = 1; $r <= $sheet->getHighestRow(); $r++) {
            $row = $this->rowValues($sheet, $r);

            if (array_slice($row, 0, count($headings)) === array_map('strval', $headings)) {
                return $r;
            }
        }

        $this->fail('header tabel tidak ditemukan di sheet Ringkasan');
    }

    /**
     * @return array<int, string>
     */
    private function rowValues($sheet, int $row): array
    {
        $values = [];

        for ($c = 0; $c < Coordinate::columnIndexFromString($sheet->getHighestColumn()); $c++) {
            $values[] = (string) $sheet->getCell(Coordinate::stringFromColumnIndex($c + 1).$row)->getValue();
        }

        return $values;
    }

    /**
     * Sheet Ringkasan harus menaruh angka total laporan di atas tabel, sama
     * seperti yang dicetak PDF dan ditampilkan di layar.
     *
     * Tanpa blok ini, export Excel kehilangan angka kunci: `hpp` dan
     * `laba_kotor` tidak bisa diturunkan dari kolom tabel mana pun, jadi
     * hanya baris TOTAL tidak akan cukup.
     *
     * Tata letaknya vertikal (label di A, nilai di C) karena kolom A hanya
     * 5 karakter dan Excel memotong teks yang kolom tetangganya terisi.
     */
    public function test_summary_totals_are_written_above_the_table_by_both_engines(): void
    {
        $a = $this->product(['code' => 'BRG-01', 'name' => 'Teh Pucuk']);
        $b = $this->product(['code' => 'BRG-02', 'name' => 'Air Mineral']);
        $this->makeSale([[$a, 1]], '2026-09-01');
        $this->makeSale([[$b, 3]], '2026-09-02');

        $screen = $this->actingAs($this->user)->getJson('/api/reports/sales')->json();
        $labels = ReportExportBuilder::configFor('sales')['summary_labels'];

        $this->assertSame(
            array_values($labels),
            array_map(fn ($key) => $labels[$key], array_keys($screen['summary'])),
            'nama summary dari ReportQueryService berubah',
        );

        $this->bindServerWithoutExtensions();

        $fallback = $this->loadXlsx($this->responseBody(
            $this->actingAs($this->user)->get('/api/reports/export/sales?format=excel')
        ));
        $primary = $this->loadXlsx($this->rawExcel('sales'));

        foreach (['fallback' => $fallback, 'phpspreadsheet' => $primary] as $engine => $sheet) {
            $pairs = $this->summaryPairs($sheet->getSheet(0));

            $this->assertSame(
                array_values($labels),
                array_column($pairs, 'label'),
                "{$engine}: label summary tidak lengkap atau tidak urut",
            );

            foreach ($screen['summary'] as $key => $value) {
                $row = array_search($labels[$key], array_column($pairs, 'label'), true);
                $this->assertNotFalse($row, "{$engine}: label summary {$key} hilang");
                $this->assertEqualsWithDelta(
                    (float) $value,
                    (float) $pairs[$row]['value'],
                    0.01,
                    "{$engine}: nilai summary {$key} beda dengan layar",
                );
            }

            // Label summary harus di-merge dua kolom; tanpa merge, "Jumlah
            // Transaksi" terpotong di kolom A yang cuma 5 karakter.
            $merged = array_map(
                fn (string $r) => strtoupper($r),
                array_keys($sheet->getSheet(0)->getMergeCells()),
            );

            $this->assertContains('A1:B1', $merged, "{$engine}: label summary tidak di-merge");
            $this->assertContains('C1:D1', $merged, "{$engine}: nilai summary tidak di-merge");
        }
    }

    /**
     * Baca pasangan (label, nilai) dari blok summary di sheet Ringkasan.
     *
     * @return array<int, array{label: string, value: string}>
     */
    private function summaryPairs($sheet): array
    {
        $headings = ['No', 'No Transaksi', 'Tanggal', 'Pelanggan', 'Total', 'Dibayar', 'Sisa Piutang', 'Status'];
        $pairs = [];

        for ($r = 1; $r < $this->summaryHeaderRow($sheet, $headings); $r++) {
            $label = (string) $sheet->getCell("A{$r}")->getValue();
            $value = (string) $sheet->getCell("C{$r}")->getValue();

            // Baris pemisah sengaja berisi satu spasi, bukan kosong, karena
            // Maatwebsite membuang baris kosong. Jadi harus diabaikan.
            if (trim($label) === '' && trim($value) === '') {
                continue;
            }

            $pairs[] = ['label' => $label, 'value' => $value];
        }

        return $pairs;
    }

    private function makePurchase(): void
    {
        $supplier = Supplier::create(['code' => 'S001', 'name' => 'PT Sumber Makmur']);
        $product = $this->product(['code' => 'BRG-BELI', 'name' => 'Teh Pucuk Kemasan']);

        $purchase = Purchase::create([
            'purchase_number' => 'PO-2026-09-001',
            'date' => '2026-09-03',
            'supplier_id' => $supplier->id,
            'total' => 0,
            'user_id' => $this->user->id,
        ]);

        PurchaseItem::create([
            'purchase_id' => $purchase->id,
            'product_id' => $product->id,
            'quantity' => 4,
            'buy_price' => 45000,
            'subtotal' => 180000,
        ]);

        $purchase->forceFill(['total' => 180000])->save();
    }

    /**
     * Ekstrak teks dari binary PDF. Null kalau pypdf tidak terpasang.
     */
    private function pdfText(string $binary): ?string
    {
        $dir = storage_path('framework/testing/report-parity');
        if (! is_dir($dir)) {
            mkdir($dir, 0777, true);
        }

        $pdf = $dir.DIRECTORY_SEPARATOR.'parity.pdf';
        $script = $dir.DIRECTORY_SEPARATOR.'extract.py';

        file_put_contents($pdf, $binary);
        file_put_contents($script, <<<'PY'
import sys

from pypdf import PdfReader

print("\n".join(page.extract_text() or "" for page in PdfReader(sys.argv[1]).pages))
PY);

        $python = null;
        foreach (['python3', 'python'] as $binary) {
            $probe = PHP_OS_FAMILY === 'Windows'
                ? 'where '.escapeshellarg($binary).' 2>nul'
                : 'command -v '.escapeshellarg($binary).' 2>/dev/null';
            $found = @shell_exec($probe);
            if (is_string($found) && trim($found) !== '') {
                $python = $binary;
                break;
            }
        }

        if ($python === null) {
            @unlink($pdf);
            @unlink($script);

            return null;
        }

        $text = shell_exec(escapeshellarg($python).' '.escapeshellarg($script).' '.escapeshellarg($pdf).' 2>&1');

        @unlink($pdf);
        @unlink($script);

        return is_string($text) && $text !== '' ? $text : null;
    }

    /**
     * Bandingkan dua workbook sel per sel dan kembalikan daftar sel yang beda.
     *
     * Satu perbedaan yang DIWAIJARKAN: PhpSpreadsheet membuang sel bernilai
     * nol. `Worksheet::fromArray()` tidak menulis `<v>` sama sekali untuk
     * `0`/`0.0`, jadi "Dibayar" pada penjualan yang belum dibayar muncul
     * KOSONG di file PhpSpreadsheet. Writer cadangan menulis `0`, yang justru
     * lebih jujur karena itulah yang tampil di layar. Test ini membolehkan
     * pasangan ('', '0') dan akan tetap gagal untuk sel lain yang beda.
     *
     * @param  array<string, array<int, array<int, string>>>  $expected
     * @param  array<string, array<int, array<int, string>>>  $actual
     * @return array<int, string>
     */
    private function cellMismatches(array $expected, array $actual): array
    {
        $mismatches = [];

        foreach ($expected as $title => $rows) {
            if (! isset($actual[$title])) {
                $mismatches[] = "sheet hilang: {$title}";

                continue;
            }

            foreach ($rows as $r => $cells) {
                foreach ($cells as $c => $value) {
                    $other = $actual[$title][$r][$c] ?? null;

                    if ($value === $other) {
                        continue;
                    }

                    $zeroPair = (string) $value === '' && (string) $other === '0';

                    if ($zeroPair) {
                        continue;
                    }

                    $mismatches[] = sprintf(
                        '%s!%s%d: PhpSpreadsheet=%s fallback=%s',
                        $title,
                        Coordinate::stringFromColumnIndex($c + 1),
                        $r + 1,
                        var_export($value, true),
                        var_export($other, true),
                    );
                }
            }
        }

        return $mismatches;
    }

    /**
     * @param  \PhpOffice\PhpSpreadsheet\Spreadsheet  $spreadsheet
     * @return array<int, array<int, string>>
     */
    private function sheetValues($spreadsheet): array
    {
        $out = [];

        for ($s = 0; $s < $spreadsheet->getSheetCount(); $s++) {
            $sheet = $spreadsheet->getSheet($s);

            // getHighestColumn() mengembalikan HURUF kolom ("K"), bukan index.
            // Di PHP 8 membandingkan int dengan string non-numerik jadi
            // komparasi string, jadi loop di bawah akan berjalan tanpa batas
            // kalau huruf tidak diubah ke index lebih dulu.
            $columns = Coordinate::columnIndexFromString($sheet->getHighestColumn());
            $rows = [];

            for ($r = 1; $r <= $sheet->getHighestRow(); $r++) {
                $cells = [];
                for ($c = 1; $c <= $columns; $c++) {
                    $cells[] = (string) $sheet->getCell(
                        Coordinate::stringFromColumnIndex($c).$r
                    )->getValue();
                }
                $rows[] = $cells;
            }

            $out[$sheet->getTitle()] = $rows;
        }

        return $out;
    }

    /**
     * Simulasikan shared hosting yang ekstensi PHP-nya belum aktif.
     *
     * Butuh subclass karena ekstensi tidak bisa di-unload saat runtime.
     */
    private function bindServerWithoutExtensions(): void
    {
        $this->app->bind(ReportExportController::class, function () {
            return new class(app(ReportQueryService::class)) extends ReportExportController
            {
                protected function loadedExtensions(): array
                {
                    return [];
                }
            };
        });
    }

    /**
     * Nilai sel baris tertentu dari kolom A sampai kolom terakhir terpakai.
     *
     * Sengaja memakai getHighestColumn() (bukan jumlah header yang diharapkan)
     * supaya kolom berlebih ikut terbaca dan ketahuan sebagai bug.
     *
     * @return array<int, string>
     */
    private function headingValues($sheet, int $row): array
    {
        $values = [];

        // getHighestColumn() mengembalikan STRING ("A", "B", ...), bukan
        // indeks. Kalau dipakai langsung di loop `for ($c = 1; $c <= $col)`,
        // PHP membandingkan sebagai teks dan loopnya jalan melebihi "Z"
        // sampai coordinate "AAAA1" yang tidak valid.
        $lastIndex = Coordinate::columnIndexFromString($sheet->getHighestColumn());

        for ($c = 1; $c <= $lastIndex; $c++) {
            $column = Coordinate::stringFromColumnIndex($c);
            $values[] = (string) $sheet->getCell("{$column}{$row}")->getValue();
        }

        return $values;
    }
}
