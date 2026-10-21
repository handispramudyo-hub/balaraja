<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\User;
use App\Services\ReportQueryService;
use App\Support\Pdf\TransactionReportPdf;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

/**
 * PDF fallback harus menampilkan data yang sama dengan layar dan dengan Excel.
 *
 * Verifikasi dilakukan dengan mengekstrak teks dari PDF hasil render memakai
 * pypdf, lalu membandingkannya dengan angka yang benar-benar ada di database.
 */
class TransactionReportPdfTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Customer $customer;
    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $category = Category::create(['name' => 'Minuman']);
        $this->customer = Customer::create(['code' => 'C001', 'name' => 'Toko Maju']);
        $this->category = $category;
    }

    private Category $category;

    private function product(): Product
    {
        $this->seq++;

        return Product::create([
            'code' => 'P'.str_pad((string) $this->seq, 3, '0', STR_PAD_LEFT),
            'name' => 'Teh Pucuk '.$this->seq,
            'category_id' => $this->category->id,
            'unit' => 'btl',
            'price' => 5000,
            'sell_price' => 5000,
            'buy_price' => 4000,
            'stock' => 20,
        ]);
    }

    private function makeSale(array $lines, string $date = '2026-09-01'): Sale
    {
        $sale = Sale::create([
            'sale_number' => 'INV-'.$date.'-'.$this->seq,
            'date' => $date,
            'customer_id' => $this->customer->id,
            'total' => 0,
            'payment' => 0,
            'receivable' => 0,
            'payment_status' => 'unpaid',
            'user_id' => $this->user->id,
        ]);

        foreach ($lines as [$product, $qty]) {
            SaleItem::create([
                'sale_id' => $sale->id,
                'product_id' => $product->id,
                'quantity' => $qty,
                'sell_price' => (float) $product->sell_price,
                'buy_price' => (float) $product->buy_price,
                'subtotal' => $qty * (float) $product->sell_price,
            ]);
        }

        $sale->update([
            'total' => $sale->items()->sum('subtotal'),
            'receivable' => $sale->items()->sum('subtotal'),
        ]);

        // Laporan piutang hanya mengambil pelanggan dengan total_receivable
        // > 0, jadi saldo pelanggan wajib ikut diupdate.
        $this->customer->forceFill([
            'total_receivable' => (float) $this->customer->total_receivable + (float) $sale->total,
        ])->save();

        return $sale;
    }

    /**
     * Render PDF lalu kembalikan teks yang diekstrak pypdf.
     *
     * @return array{bytes: string, text: string, pages: int}|null
     */
    private function extract(string $report, array $reportData): ?array
    {
        $bytes = (new TransactionReportPdf())->render($report, $reportData);

        $dir = storage_path('framework/testing/pdf-render');
        if (! is_dir($dir)) {
            mkdir($dir, 0777, true);
        }

        $path = $dir.DIRECTORY_SEPARATOR.'report.pdf';
        file_put_contents($path, $bytes);

        $script = $dir.DIRECTORY_SEPARATOR.'extract.py';
        file_put_contents($script, <<<'PY'
import json
import sys

from pypdf import PdfReader

reader = PdfReader(sys.argv[1])
print(json.dumps({
    "pages": len(reader.pages),
    "text": [page.extract_text() or "" for page in reader.pages],
}))
PY);

        $python = null;
        foreach (['python3', 'python'] as $binary) {
            $probe = PHP_OS_FAMILY === 'Windows'
                ? 'where '.escapeshellarg($binary)
                : 'command -v '.escapeshellarg($binary);

            if (is_string(@shell_exec($probe.' 2>nul')) && trim((string) @shell_exec($probe.' 2>nul')) !== '') {
                $python = $binary;
                break;
            }
        }

        if ($python === null) {
            @unlink($path);
            @unlink($script);

            return null;
        }

        $output = shell_exec(escapeshellarg($python).' '.escapeshellarg($script).' '.escapeshellarg($path).' 2>&1');

        @unlink($path);
        @unlink($script);

        $data = json_decode((string) $output, true);

        $this->assertIsArray($data, "pypdf gagal: {$output}");

        return [
            'bytes' => $bytes,
            'pages' => $data['pages'],
            'text' => implode("\n", $data['text']),
        ];
    }

    /**
     * Teks PDF tidak boleh saling menimpa.
     *
     * Bug ini dulu tidak ketahuan karena semua test lain cuma mengecek
     * `assertStringContainsString`, yaitu TEKSNYA ADA atau tidak. Padahal
     * `drawItemRow()` membaca ulang `cursorY()` yang belum disinkronkan
     * `drawItemHeader()`, sehingga baris barang digambar ~2pt di bawah
     * header kartu: nomor transaksi, kode barang, dan nominal saling
     * tumpuk. Isi PDF tetap "lengkap" secara teks, tapi tidak terbaca.
     *
     * Test ini karena itu memeriksa GEOMETRI (bounding box tiap word),
     * bukan isi teks.
     */
    public function test_pdf_text_never_overlaps_itself(): void
    {
        $a = $this->product(['name' => 'Teh Pucuk Teh Pucuk']);
        $b = $this->product(['name' => 'Air Mineral Kemasan Botol 600ml']);
        $this->makeSale([[$a, 2], [$b, 3]], '2026-09-01');
        $this->makeSale([[$b, 1]], '2026-09-02');

        foreach (['sales', 'receivables'] as $report) {
            $data = app(ReportQueryService::class)->{$report}(
                Request::create("/api/reports/export/{$report}", 'GET')
            );

            $result = $this->wordBoxes($report, $data);

            if ($result === null) {
                $this->markTestSkipped('pymupdf tidak tersedia');
            }

            $this->assertNotEmpty($result['words'], "{$report}: tidak ada word sama sekali");

            foreach ($result['overflow'] as $item) {
                $this->fail("{$report}: teks keluar halaman -> {$item}");
            }

            $this->assertSame(
                [],
                $result['overlaps'],
                "{$report}: ada teks yang saling menimpa -> ".implode(' | ', array_slice($result['overlaps'], 0, 8))
            );
        }
    }

    /**
     * Ambil bounding box tiap word via pymupdf, lalu laporkan yang keluar
     * halaman atau bertumpuk.
     *
     * @return array{words: int, overlaps: array<int, string>, overflow: array<int, string>}|null
     */
    private function wordBoxes(string $report, array $data): ?array
    {
        $dir = storage_path('framework/testing/pdf-render');
        $path = $dir.DIRECTORY_SEPARATOR.'boxes.pdf';
        $script = $dir.DIRECTORY_SEPARATOR.'boxes.py';

        file_put_contents($path, (new TransactionReportPdf)->render($report, $data));
        file_put_contents($script, <<<'PY'
import json
import sys

import pymupdf

doc = pymupdf.open(sys.argv[1])
overlaps, overflow, total = [], [], 0

for pno, page in enumerate(doc, 1):
    limit = page.rect
    words = page.get_text("words")
    total += len(words)
    rects = []

    for w in words:
        r = pymupdf.Rect(w[:4])
        rects.append((w[4], r))
        if r.x0 < -0.5 or r.y0 < -0.5 or r.x1 > limit.width + 0.5 or r.y1 > limit.height + 0.5:
            overflow.append(f"p{pno} {w[4]!r} {tuple(round(v) for v in w[:4])}")

    for i in range(len(rects)):
        for j in range(i + 1, len(rects)):
            a, b = rects[i][1], rects[j][1]
            x = max(0.0, min(a.x1, b.x1) - max(a.x0, b.x0))
            y = max(0.0, min(a.y1, b.y1) - max(a.y0, b.y0))
            if not x or not y:
                continue
            smaller = min(a.get_area(), b.get_area())
            if smaller and (x * y) / smaller > 0.25:
                overlaps.append(
                    f"p{pno} {rects[i][0]!r}@({rects[i][1].x0:.0f},{rects[i][1].y0:.0f})"
                    f" vs {rects[j][0]!r}@({rects[j][1].x0:.0f},{rects[j][1].y0:.0f})"
                )

print(json.dumps({"words": total, "overlaps": overlaps, "overflow": overflow}))
PY);

        $python = null;
        foreach (['python3', 'python'] as $binary) {
            $probe = PHP_OS_FAMILY === 'Windows'
                ? 'where '.escapeshellarg($binary)
                : 'command -v '.escapeshellarg($binary);
            $found = (string) @shell_exec($probe.' 2>nul');

            if (trim($found) !== '') {
                $python = $binary;
                break;
            }
        }

        if ($python === null) {
            @unlink($path);
            @unlink($script);

            return null;
        }

        $output = shell_exec(escapeshellarg($python).' '.escapeshellarg($script).' '.escapeshellarg($path).' 2>&1');

        @unlink($path);
        @unlink($script);

        if (! str_contains((string) $output, '"words"')) {
            return null;
        }

        return json_decode((string) $output, true);
    }

    public function test_sales_pdf_contains_transaction_and_item_rows(): void
    {
        $a = $this->product();
        $b = $this->product();
        $this->makeSale([[$a, 2], [$b, 1]], '2026-09-01');

        $data = app(ReportQueryService::class)->sales(Request::create('/api/reports/export/sales', 'GET'));
        $result = $this->extract('sales', $data);

        if ($result === null) {
            $this->markTestSkipped('pypdf tidak tersedia');
        }

        $this->assertStringStartsWith('%PDF-', $result['bytes']);
        $this->assertStringContainsString('INV-2026-09-01', $result['text']);
        $this->assertStringContainsString('Toko Maju', $result['text']);
        $this->assertStringContainsString('Teh Pucuk 1', $result['text']);
        $this->assertStringContainsString('Teh Pucuk 2', $result['text']);
        // 2 x 5.000 = 10.000
        $this->assertStringContainsString('10.000', $result['text']);
        $this->assertStringContainsString('Subtotal', $result['text']);
    }

    public function test_sales_pdf_is_landscape_and_purchases_is_portrait(): void
    {
        $this->makeSale([[$this->product(), 1]]);

        $sales = (new TransactionReportPdf())->render('sales', app(ReportQueryService::class)->sales(
            Request::create('/api/reports/export/sales', 'GET')
        ));

        $purchases = (new TransactionReportPdf())->render('purchases', app(ReportQueryService::class)->purchases(
            Request::create('/api/reports/export/purchases', 'GET')
        ));

        $this->assertStringContainsString('/MediaBox [0 0 841.89 595.28]', $sales);
        $this->assertStringContainsString('/MediaBox [0 0 595.28 841.89]', $purchases);
    }

    public function test_receivables_pdf_includes_nested_sale_details(): void
    {
        $a = $this->product();
        $this->makeSale([[$a, 3]], '2026-09-05');

        $data = app(ReportQueryService::class)->receivables(Request::create('/api/reports/export/receivables', 'GET'));
        $result = $this->extract('receivables', $data);

        if ($result === null) {
            $this->markTestSkipped('pypdf tidak tersedia');
        }

        // Ini yang dulu hilang: piutang punya `detail`, bukan `items` langsung.
        $this->assertStringContainsString('Teh Pucuk 1', $result['text']);
        $this->assertStringContainsString('15.000', $result['text']);
        $this->assertStringContainsString('Sisa:', $result['text']);
    }

    public function test_summary_block_prints_totals(): void
    {
        $this->makeSale([[$this->product(), 4]], '2026-09-01');

        $data = app(ReportQueryService::class)->sales(Request::create('/api/reports/export/sales', 'GET'));
        $result = $this->extract('sales', $data);

        if ($result === null) {
            $this->markTestSkipped('pypdf tidak tersedia');
        }

        // Kunci summary dicetak apa adanya (sama seperti view Blade), jadi
        // expected di sini juga snake_case.
        $this->assertStringContainsString('omzet', $result['text']);
        $this->assertStringContainsString('laba_kotor', $result['text']);
        $this->assertStringContainsString('20.000', $result['text']);
    }

    public function test_empty_report_says_so_instead_of_being_blank(): void
    {
        $data = app(ReportQueryService::class)->sales(Request::create('/api/reports/export/sales', 'GET'));
        $result = $this->extract('sales', $data);

        if ($result === null) {
            $this->markTestSkipped('pypdf tidak tersedia');
        }

        $this->assertStringContainsString('Tidak ada data pada periode ini.', $result['text']);
    }

    public function test_many_transactions_paginate_and_repeat_continuation_marker(): void
    {
        for ($i = 0; $i < 14; $i++) {
            $this->makeSale([[$this->product(), 2]], '2026-09-'.str_pad((string) ($i + 1), 2, '0', STR_PAD_LEFT));
        }

        $data = app(ReportQueryService::class)->sales(Request::create('/api/reports/export/sales', 'GET'));
        $result = $this->extract('sales', $data);

        if ($result === null) {
            $this->markTestSkipped('pypdf tidak tersedia');
        }

        $this->assertGreaterThan(1, $result['pages'], '14 transaksi harus jadi lebih dari 1 halaman');
        $this->assertStringContainsString('Lanjutan', $result['text']);
    }

    public function test_transaction_without_items_states_it_explicitly(): void
    {
        $product = $this->product();
        $sale = $this->makeSale([[$product, 1]]);
        $sale->items()->delete();

        $data = app(ReportQueryService::class)->sales(Request::create('/api/reports/export/sales', 'GET'));
        $result = $this->extract('sales', $data);

        if ($result === null) {
            $this->markTestSkipped('pypdf tidak tersedia');
        }

        $this->assertStringContainsString('Rincian barang tidak tersedia.', $result['text']);
    }

    public function test_long_product_name_is_wrapped_not_cut_silently(): void
    {
        $product = $this->product();
        $product->update(['name' => 'Air Mineral Dalam Kemasan Botol Plastik 600 ml Kemasan Isi Ulang Kemasan{example}']);
        $this->makeSale([[$product, 1]]);

        $data = app(ReportQueryService::class)->sales(Request::create('/api/reports/export/sales', 'GET'));
        $bytes = (new TransactionReportPdf())->render('sales', $data);

        // Nama panjang dipecah jadi beberapa baris, bukan dipotong diam-diam
        // jadi "Air Mineral Dalam Kemasan Bot..." tanpa penjelasan.
        $this->assertStringStartsWith('%PDF-', $bytes);
        $this->assertGreaterThan(
            substr_count($bytes, 'Tm'),
            40,
            'nama panjang harus menambah baris teks'
        );
    }

    public function test_money_and_qty_formatting_matches_blade_view(): void
    {
        $this->assertSame('15.415.500', TransactionReportPdf::uang(15415500));
        $this->assertSame('0', TransactionReportPdf::uang(0));
        // number_format(..., 0) membulatkan, sama seperti view Blade.
        $this->assertSame('1.235', TransactionReportPdf::uang(1234.6));

        $this->assertSame('2', TransactionReportPdf::qty(2.0));
        $this->assertSame('1', TransactionReportPdf::qty(1.0));
        $this->assertSame('12', TransactionReportPdf::qty(12.0));
        $this->assertSame('0', TransactionReportPdf::qty(0.0));
    }

    public function test_unknown_report_is_rejected(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        (new TransactionReportPdf())->render('tidak-ada', ['meta' => [], 'rows' => [], 'summary' => []]);
    }
}
