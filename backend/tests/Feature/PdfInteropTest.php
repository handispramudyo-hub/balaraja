<?php

namespace Tests\Feature;

use App\Support\Pdf\SimplePdfWriter;
use Tests\TestCase;

/**
 * Bukti bahwa PDF fallback bukan hanya "struktur plausible" tapi benar-benar
 * bisa dibaca parser PDF sungguhan.
 *
 * Berkas hasil render disimpan ke folder yang dibaca test Python `pypdf`, yang
 * akan reopen filenya, menghitung halaman, dan mengekstrak teks. Locally test
 * ini dilewati kalau pypdf tidak ada; di produksi tidak dipakai sama sekali.
 */
class PdfInteropTest extends TestCase
{
    private function dir(): string
    {
        $dir = storage_path('framework/testing/pdf-interop');

        if (! is_dir($dir)) {
            mkdir($dir, 0777, true);
        }

        return $dir;
    }

    public function test_generated_pdf_is_readable_by_pypdf(): void
    {
        $pdf = new SimplePdfWriter();
        $pdf->setCursorY(780);
        $pdf->text(50, 780, 'LAPORAN PENJUALAN', 14, true);
        $pdf->text(50, 750, 'Periode 01/09/2026 - 30/09/2026', 9);
        $pdf->line(50, 740, 545, 740);
        $pdf->rect(50, 700, 200, 18, [232, 234, 246]);
        $pdf->text(56, 706, 'Total', 9, true);
        $pdf->textRight(244, 706, '15.415.500', 9, true);
        $pdf->text(50, 660, 'Toko Maju (INV-001) 2.500.000', 9);

        $path = $this->dir().DIRECTORY_SEPARATOR.'interop.pdf';
        file_put_contents($path, $pdf->output());

        $script = $this->dir().DIRECTORY_SEPARATOR.'check_pdf.py';
        file_put_contents($script, <<<'PY'
import json
import sys

from pypdf import PdfReader

path = sys.argv[1]
reader = PdfReader(path)
text = "\n".join(page.extract_text() or "" for page in reader.pages)

print(json.dumps({
    "pages": len(reader.pages),
    "encrypted": reader.is_encrypted,
    "text": text,
    "mediabox": [float(v) for v in reader.pages[0].mediabox],
}))
PY);

        $python = $this->pythonBinary();

        if ($python === null) {
            $this->markTestSkipped('python3 + pypdf tidak tersedia di environment test');
        }

        $output = shell_exec(escapeshellarg($python).' '.escapeshellarg($script).' '.escapeshellarg($path).' 2>&1');

        @unlink($path);
        @unlink($script);

        $data = json_decode((string) $output, true);

        $this->assertIsArray($data, "pypdf gagal mem-parsing PDF: {$output}");

        $this->assertSame(1, $data['pages']);
        $this->assertFalse($data['encrypted']);
        $this->assertStringContainsString('LAPORAN PENJUALAN', $data['text']);
        $this->assertStringContainsString('15.415.500', $data['text']);
        $this->assertStringContainsString('Toko Maju', $data['text']);
        $this->assertEqualsWithDelta(595.28, $data['mediabox'][2], 0.1);
    }

    public function test_multipage_pdf_reports_correct_page_count(): void
    {
        $pdf = new SimplePdfWriter();
        $pdf->setCursorY(780);

        for ($page = 1; $page <= 3; $page++) {
            if ($page > 1) {
                $pdf->newPage(780, function (SimplePdfWriter $p) use ($page) {
                    $p->text(50, 780, "Halaman {$page}", 10, true);
                });
            }

            $pdf->text(50, 700, "Baris isi halaman {$page}", 9);
        }

        $path = $this->dir().DIRECTORY_SEPARATOR.'multipage.pdf';
        file_put_contents($path, $pdf->output());

        $script = $this->dir().DIRECTORY_SEPARATOR.'count_pdf.py';
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

        $python = $this->pythonBinary();

        if ($python === null) {
            $this->markTestSkipped('python3 + pypdf tidak tersedia di environment test');
        }

        $output = shell_exec(escapeshellarg($python).' '.escapeshellarg($script).' '.escapeshellarg($path).' 2>&1');

        @unlink($path);
        @unlink($script);

        $data = json_decode((string) $output, true);

        $this->assertIsArray($data, "pypdf gagal: {$output}");
        $this->assertSame(3, $data['pages']);

        for ($page = 1; $page <= 3; $page++) {
            $this->assertStringContainsString("Baris isi halaman {$page}", $data['text'][$page - 1]);
        }
    }

    private function pythonBinary(): ?string
    {
        $candidates = ['python3', 'python'];

        foreach ($candidates as $binary) {
            $probe = PHP_OS_FAMILY === 'Windows'
                ? 'where '.escapeshellarg($binary)
                : 'command -v '.escapeshellarg($binary);

            $found = @shell_exec($probe.' 2>nul');

            if (is_string($found) && trim($found) !== '') {
                return $binary;
            }
        }

        return null;
    }
}
