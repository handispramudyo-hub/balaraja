<?php

namespace Tests\Feature;

use App\Support\Pdf\SimplePdfWriter;
use Tests\TestCase;

/**
 * PDF fallback harus benar-benar valid, bukan cuma diawali "%PDF".
 *
 * Test ini mem-parse struktur filedenya sendiri (xref, trailer, offset objek)
 * karena tidak ada library PDF reader di environment test. Offset yang salah
 * adalah penyebab paling umum PDF rusak, jadi di sini dihitung ulang dari byte
 * aktual file.
 */
class SimplePdfWriterTest extends TestCase
{
    /**
     * Baca tabel xref dan pastikan setiap offset menunjuk ke objek yang benar.
     */
    private function assertXrefOffsetsAreValid(string $pdf, int $expectedPages): array
    {
        $this->assertStringStartsWith('%PDF-', $pdf);
        $this->assertStringEndsWith("%%EOF\n", $pdf);

        $this->assertSame(1, preg_match('/startxref\s+(\d+)/', $pdf, $m), 'startxref harus ada');
        $xrefOffset = (int) $m[1];

        $this->assertSame(
            "xref",
            substr($pdf, $xrefOffset, 4),
            'startxref harus menunjuk ke kata "xref"'
        );

        $this->assertSame(1, preg_match('/\/Size (\d+)/', $pdf, $m), 'trailer /Size harus ada');
        $size = (int) $m[1];

        $this->assertSame(1, preg_match('/xref\s+0 (\d+)\s+/', $pdf, $m), 'header xref harus ada');
        $this->assertSame($size, (int) $m[1], '/Size harus sama dengan jumlah entri xref');

        // Ekstrak offset dari baris entri xref.
        $matched = preg_match_all('/^(\d{10}) (\d{5}) ([nf]) $/m', $pdf, $entries, PREG_SET_ORDER);
        $this->assertIsInt($matched, 'tabel xref harus bisa diparse');
        $this->assertGreaterThan(0, $matched);
        $this->assertSame($size, count($entries), 'jumlah entri xref harus sama dengan /Size');

        $objectNumbers = [];
        foreach ($entries as $index => $entry) {
            if ($entry[3] !== 'n') {
                continue;
            }

            $objectNumber = $index; // entri pertama adalah objek 0 (free)
            $offset = (int) $entry[1];
            $objectNumbers[$objectNumber] = $offset;

            $this->assertSame(
                "{$objectNumber} 0 obj",
                substr($pdf, $offset, strlen("{$objectNumber} 0 obj")),
                "Offset objek {$objectNumber} harus menunjuk ke deklarasinya"
            );
        }

        $this->assertCount(4 + ($expectedPages * 2), $objectNumbers, 'jumlah objek tidak sesuai');

        // Setiap entri /Kids harus menunjuk ke objek bertipe /Page. Versi
        // pertama salah menukar nomor objek Page dan Contents, sehingga tree
        // halaman kosong: file tetap "valid" secara struktural tapi reader
        // menampilkan 0 halaman.
        $this->assertSame(
            1,
            preg_match('/\/Kids \[([^\]]*)\]/', $pdf, $m),
            'halaman harus punya /Kids'
        );

        $kids = [];
        preg_match_all('/(\d+) 0 R/', $m[1], $kidMatches);
        $kids = array_map('intval', $kidMatches[1]);

        $this->assertCount($expectedPages, $kids, '/Kids harus memuat satu entri per halaman');

        foreach ($kids as $kidNumber) {
            // Jendela 400 karakter: dictionary /Page ditambah /Resources
            // /Font panjangnya lebih dari 150 karakter.
            $body = substr($pdf, $objectNumbers[$kidNumber] ?? 0, 400);

            $this->assertStringContainsString('/Type /Page', $body, "Objek {$kidNumber} harus /Type /Page");

            $this->assertSame(
                1,
                preg_match('/\/Contents (\d+) 0 R/', $body, $c),
                "Objek {$kidNumber} harus menunjuk /Contents"
            );

            $contentsNumber = (int) $c[1];
            $this->assertArrayHasKey($contentsNumber, $objectNumbers, 'objek /Contents harus ada');
            $this->assertStringContainsString(
                'stream',
                substr($pdf, $objectNumbers[$contentsNumber], 200),
                "Objek {$contentsNumber} harus berisi stream"
            );
        }

        return $objectNumbers;
    }

    public function test_minimal_document_is_structurally_valid(): void
    {
        $pdf = new SimplePdfWriter();
        $pdf->setCursorY(700);
        $pdf->text(50, 700, 'Halo dunia', 12, true);

        $bytes = $pdf->output();

        $this->assertXrefOffsetsAreValid($bytes, 1);
        $this->assertStringContainsString('/Type /Catalog', $bytes);
        $this->assertStringContainsString('/Count 1', $bytes);
        $this->assertStringContainsString('%%EOF', $bytes);
    }

    public function test_landscape_swaps_page_dimensions(): void
    {
        $potrait = new SimplePdfWriter(false);
        $landscape = new SimplePdfWriter(true);

        $this->assertEqualsWithDelta(595.28, $potrait->width(), 0.01);
        $this->assertEqualsWithDelta(841.89, $potrait->height(), 0.01);
        $this->assertEqualsWithDelta(841.89, $landscape->width(), 0.01);
        $this->assertEqualsWithDelta(595.28, $landscape->height(), 0.01);

        $this->assertStringContainsString('/MediaBox [0 0 595.28 841.89]', $potrait->output());
        $this->assertStringContainsString('/MediaBox [0 0 841.89 595.28]', $landscape->output());
    }

    public function test_multiple_pages_each_get_their_own_objects(): void
    {
        $pdf = new SimplePdfWriter();
        $pdf->setCursorY(700);

        for ($page = 1; $page <= 4; $page++) {
            if ($page > 1) {
                $pdf->newPage(700, function (SimplePdfWriter $p) use ($page) {
                    $p->text(50, 780, "Halaman {$page}", 9, true);
                });
            }

            $pdf->text(50, 700, "Isi halaman {$page}", 9);
        }

        $bytes = $pdf->output();

        $this->assertXrefOffsetsAreValid($bytes, 4);
        $this->assertStringContainsString('/Count 4', $bytes);

        for ($page = 1; $page <= 4; $page++) {
            $this->assertStringContainsString("(Isi halaman {$page})", $bytes);
        }
    }

    public function test_text_is_escaped_so_parentheses_do_not_break_syntax(): void
    {
        $pdf = new SimplePdfWriter();
        $pdf->setCursorY(700);
        $pdf->text(50, 700, 'Toko (Majumundung) 100% \\ deals');

        $bytes = $pdf->output();

        $this->assertXrefOffsetsAreValid($bytes, 1);
        $this->assertStringContainsString('\(Majumundung\)', $bytes);
    }

    public function test_non_latin_characters_do_not_corrupt_the_file(): void
    {
        $pdf = new SimplePdfWriter();
        $pdf->setCursorY(700);
        $pdf->text(50, 700, 'Toko 东京 Kedai ☕');

        $bytes = $pdf->output();

        $this->assertXrefOffsetsAreValid($bytes, 1);
        // Semua byte harus WinAnsi: kalau ada UTF-8 multi-byte yang bocor,
        // pembaca PDF akan menampilkan karakter Replacement.
        $this->assertNotFalse(
            iconv('Windows-1252', 'UTF-8', $bytes),
            'PDF harus bisa dibaca ulang sebagai Windows-1252'
        );
    }

    public function test_to_win_ansi_handles_asian_and_symbols(): void
    {
        $this->assertSame('Halo', SimplePdfWriter::toWinAnsi('Halo'));
        $this->assertSame('a & b', SimplePdfWriter::toWinAnsi('a & b'));

        $converted = SimplePdfWriter::toWinAnsi('东京');
        $this->assertSame('', $converted, 'CJK tidak punya padanan WinAnsi');
    }

    public function test_text_width_grows_with_length(): void
    {
        $pdf = new SimplePdfWriter();

        // Huruf 'a' dipakai berulang supaya lebar benar-benar linear.
        $short = $pdf->textWidth('aa', 10);
        $long = $pdf->textWidth('aaaa', 10);

        $this->assertGreaterThan(0, $short);
        $this->assertGreaterThan($short, $long);
        $this->assertEqualsWithDelta($long / 2, $short, 0.01, 'lebar harus linear dengan panjang');
    }

    public function test_bold_is_wider_than_regular(): void
    {
        $pdf = new SimplePdfWriter();

        $this->assertGreaterThan(
            $pdf->textWidth('Total', 10, false),
            $pdf->textWidth('Total', 10, true)
        );
    }

    public function test_width_tables_cover_printable_ascii_exactly(): void
    {
        // Panjang tabel harus 95 (kode 32..126). Kalau tidak, teks dengan
        // karakter di luar jangkauan diam-diam memakai lebar default 556 dan
        // kolom bisa meluber.
        $reflection = new \ReflectionClass(SimplePdfWriter::class);

        foreach (['WIDTHS_REGULAR', 'WIDTHS_BOLD'] as $name) {
            $table = $reflection->getConstant($name);

            $this->assertIsArray($table, "{$name} harus array");
            $this->assertCount(95, $table, "{$name} harus punya 95 entri (kode 32..126)");

            foreach ($table as $width) {
                $this->assertIsInt($width);
                $this->assertGreaterThan(0, $width);
                // Glyph '@' (at) memang 1015 di Helvetica, jadi batas atasnya
                // bukan 1000.
                $this->assertLessThanOrEqual(1015, $width);
            }
        }
    }

    public function test_truncate_adds_ellipsis_and_fits_width(): void
    {
        $pdf = new SimplePdfWriter();
        $max = 60.0;

        $long = 'Nama Barang Yang Sangat Panjang Sekali';
        $cut = $pdf->truncate($long, $max, 9);

        $this->assertStringEndsWith('...', $cut);
        $this->assertLessThanOrEqual($max, $pdf->textWidth($cut, 9));
        $this->assertLessThan(strlen($long), strlen($cut));

        $short = 'Teh';
        $this->assertSame($short, $pdf->truncate($short, $max, 9), 'teks yang muat tidak boleh dipotong');
    }

    public function test_wrap_breaks_on_word_boundaries(): void
    {
        $pdf = new SimplePdfWriter();
        $max = 90.0;

        $lines = $pdf->wrap('Teh Pucuk Teh Botol Sosro 450 ml Kemasan单身', $max, 9);

        $this->assertGreaterThan(1, count($lines));

        foreach ($lines as $line) {
            $this->assertLessThanOrEqual($max, $pdf->textWidth($line, 9), "Baris terlalu lebar: {$line}");
        }

        // Kata utuh, kecuali kata yang memang lebih lebar dari satu baris.
        $this->assertStringContainsString('Pucuk', implode(' ', $lines));
    }

    public function test_wrap_breaks_a_single_oversized_word(): void
    {
        $pdf = new SimplePdfWriter();
        $word = str_repeat('X', 200);

        $lines = $pdf->wrap($word, 80, 9);

        $this->assertGreaterThan(1, count($lines));

        foreach ($lines as $line) {
            $this->assertLessThanOrEqual(80, $pdf->textWidth($line, 9));
        }
    }

    public function test_text_right_aligns_to_given_edge(): void
    {
        $pdf = new SimplePdfWriter();
        $pdf->setCursorY(700);
        $pdf->textRight(500, 700, '12345', 10);

        $bytes = $pdf->output();

        $this->assertXrefOffsetsAreValid($bytes, 1);
        // x = 500 - lebar("12345")
        $expectedX = 500 - $pdf->textWidth('12345', 10);
        $this->assertStringContainsString(
            sprintf('1 0 0 1 %.2F 700.00 Tm', $expectedX),
            $bytes
        );
    }

    public function test_graphics_operators_are_emitted(): void
    {
        $pdf = new SimplePdfWriter();
        $pdf->setCursorY(700);
        $pdf->rect(40, 650, 200, 20, [232, 234, 246]);
        $pdf->line(40, 650, 240, 650, 0.5, [176, 176, 176]);

        $bytes = $pdf->output();

        $this->assertXrefOffsetsAreValid($bytes, 1);
        $this->assertStringContainsString(' re f', $bytes);
        $this->assertStringContainsString(' m ', $bytes);
        $this->assertStringContainsString(' l S', $bytes);
    }

    public function test_empty_document_still_has_one_page(): void
    {
        $bytes = (new SimplePdfWriter())->output();

        $this->assertXrefOffsetsAreValid($bytes, 1);
        $this->assertStringContainsString('/Count 1', $bytes);
    }

    public function test_empty_text_draws_nothing(): void
    {
        $pdf = new SimplePdfWriter();
        $pdf->setCursorY(700);
        $pdf->text(50, 700, '');
        $pdf->textRight(500, 700, '');
        $pdf->textCenter(300, 700, '');

        $bytes = $pdf->output();

        $this->assertXrefOffsetsAreValid($bytes, 1);
        $this->assertStringNotContainsString('Tj', $bytes);
    }
}
