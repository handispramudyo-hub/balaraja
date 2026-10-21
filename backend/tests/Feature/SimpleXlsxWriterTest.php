<?php

namespace Tests\Feature;

use App\Support\Spreadsheet\SimpleXlsxWriter;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Tests\TestCase;

/**
 * Fallback XLSX harus benar-benar bisa dibuka Excel, bukan cuma signature "PK".
 *
 * Test ini membukanya dengan PhpSpreadsheet (pembuktian terkuat yang tersedia
 * tanpa aplikasi Excel), lalu memeriksa isi sheet, nilai, dan format angka.
 */
class SimpleXlsxWriterTest extends TestCase
{
    private function parse(string $xlsx)
    {
        $path = tempnam(sys_get_temp_dir(), 'xlsx').'.xlsx';
        file_put_contents($path, $xlsx);

        try {
            return IOFactory::load($path);
        } finally {
            @unlink($path);
        }
    }

    public function test_output_is_a_valid_zip_archive(): void
    {
        $zip = new \App\Support\Archive\ZipWriter();
        $zip->add('a.txt', str_repeat('halo dunia ', 50));
        $bytes = $zip->output();

        $this->assertSame("PK\x03\x04", substr($bytes, 0, 4));

        // ext-zip tersedia di environment test, jadi kita bisa membuktikan
        // arsipnya benar-benar bisa dibaca, bukan cuma signature-nya.
        $path = tempnam(sys_get_temp_dir(), 'zip');
        file_put_contents($path, $bytes);

        try {
            $archive = new \ZipArchive();
            $this->assertTrue($archive->open($path) === true);
            $this->assertTrue($archive->locateName('a.txt') !== false);
            $this->assertSame(str_repeat('halo dunia ', 50), $archive->getFromName('a.txt'));
            $archive->close();
        } finally {
            @unlink($path);
        }
    }

    public function test_zip_handles_empty_and_binary_content(): void
    {
        $zip = new \App\Support\Archive\ZipWriter();
        $zip->add('kosong.txt', '');
        $zip->add('bin.dat', "\x00\x01\x02\xFF");
        $bytes = $zip->output();

        $path = tempnam(sys_get_temp_dir(), 'zip');
        file_put_contents($path, $bytes);

        try {
            $archive = new \ZipArchive();
            $this->assertTrue($archive->open($path) === true);
            $this->assertSame('', $archive->getFromName('kosong.txt'));
            $this->assertSame("\x00\x01\x02\xFF", $archive->getFromName('bin.dat'));
            $archive->close();
        } finally {
            @unlink($path);
        }
    }

    public function test_zip_output_is_deterministic(): void
    {
        $a = new \App\Support\Archive\ZipWriter();
        $a->add('x.txt', 'isi sama');

        $b = new \App\Support\Archive\ZipWriter();
        $b->add('x.txt', 'isi sama');

        $this->assertSame($a->output(), $b->output());
    }

    public function test_two_sheets_are_readable_with_expected_values(): void
    {
        $writer = new SimpleXlsxWriter();

        $writer->addSheet(
            'Ringkasan',
            ['No', 'Pelanggan', 'Total'],
            [
                [1, 'Toko Maju', 15015000.0],
                [2, 'Toko Besar', 400500.0],
            ],
            [5, 26, 16],
            [false, false, true],
        );

        $writer->addSheet(
            'Detail',
            ['No', 'Kode Barang', 'Qty', 'Harga', 'Subtotal Baris'],
            [
                [1, 'P001', 2.0, 5000.0, 10000.0],
                [2, 'P002', 1.0, 2500.0, 2500.0],
            ],
            [5, 14, 9, 15, 16],
            [false, false, true, true, true],
            true,
        );

        $spreadsheet = $this->parse($writer->output());

        $this->assertSame(['Ringkasan', 'Detail'], $spreadsheet->getSheetNames());

        $ringkasan = $spreadsheet->getSheetByName('Ringkasan');
        $this->assertSame('No', (string) $ringkasan->getCell('A1')->getValue());
        $this->assertSame('Pelanggan', (string) $ringkasan->getCell('B1')->getValue());
        $this->assertSame('Total', (string) $ringkasan->getCell('C1')->getValue());
        $this->assertSame('Toko Maju', (string) $ringkasan->getCell('B2')->getValue());
        $this->assertEquals(15015000.0, $ringkasan->getCell('C2')->getValue());
        $this->assertEquals(400500.0, $ringkasan->getCell('C3')->getValue());

        $detail = $spreadsheet->getSheetByName('Detail');
        $this->assertSame('Subtotal Baris', (string) $detail->getCell('E1')->getValue());
        $this->assertSame('P002', (string) $detail->getCell('B3')->getValue());
        $this->assertEquals(2500.0, $detail->getCell('E3')->getValue());
        // 1 baris header + 2 baris data.
        $this->assertSame(3, $detail->getHighestRow());
    }

    public function test_header_is_bold_and_money_columns_use_number_format(): void
    {
        $writer = new SimpleXlsxWriter();
        $writer->addSheet(
            'Ringkasan',
            ['Total'],
            [[1234567.0]],
            [16],
            [true],
        );

        $spreadsheet = $this->parse($writer->output());
        $sheet = $spreadsheet->getSheetByName('Ringkasan');

        $this->assertTrue($sheet->getStyle('A1')->getFont()->getBold());
        $this->assertSame('#,##0', $sheet->getStyle('A2')->getNumberFormat()->getFormatCode());
        $this->assertEqualsWithDelta(16, $sheet->getColumnDimension('A')->getWidth(), 0.01);
    }

    public function test_special_characters_and_ampersand_survive(): void
    {
        $writer = new SimpleXlsxWriter();
        $writer->addSheet(
            'Detail',
            ['Nama Barang'],
            [['Teh <Pucuk> & "Jasmine" 2\'5"']],
        );

        $spreadsheet = $this->parse($writer->output());
        $value = (string) $spreadsheet->getSheetByName('Detail')->getCell('A2')->getValue();

        $this->assertSame('Teh <Pucuk> & "Jasmine" 2\'5"', $value);
    }

    public function test_empty_and_null_cells_do_not_become_zero(): void
    {
        $writer = new SimpleXlsxWriter();
        $writer->addSheet(
            'Detail',
            ['Qty', 'Total Transaksi'],
            [[null, 1000.0], ['', 1000.0]],
        );

        $spreadsheet = $this->parse($writer->output());
        $sheet = $spreadsheet->getSheetByName('Detail');

        $this->assertNull($sheet->getCell('A2')->getValue());
        $this->assertEquals(1000.0, $sheet->getCell('B2')->getValue());
    }

    public function test_column_letter_conversion(): void
    {
        $this->assertSame('A', SimpleXlsxWriter::columnLetter(1));
        $this->assertSame('Z', SimpleXlsxWriter::columnLetter(26));
        $this->assertSame('AA', SimpleXlsxWriter::columnLetter(27));
        $this->assertSame('AB', SimpleXlsxWriter::columnLetter(28));
        $this->assertSame('K', SimpleXlsxWriter::columnLetter(11));
    }

    public function test_float_values_do_not_leak_binary_noise(): void
    {
        $writer = new SimpleXlsxWriter();
        $writer->addSheet('Ringkasan', ['Total'], [[0.1 + 0.2]]);

        $spreadsheet = $this->parse($writer->output());
        $value = $spreadsheet->getSheetByName('Ringkasan')->getCell('A2')->getValue();

        $this->assertEqualsWithDelta(0.3, $value, 0.000001);
        $this->assertStringNotContainsString('0000000', (string) $value);
    }

    public function test_sheet_with_no_rows_still_has_header(): void
    {
        $writer = new SimpleXlsxWriter();
        $writer->addSheet('Ringkasan', ['No', 'Pelanggan'], []);

        $spreadsheet = $this->parse($writer->output());
        $sheet = $spreadsheet->getSheetByName('Ringkasan');

        $this->assertSame(1, $sheet->getHighestRow());
        $this->assertSame('Pelanggan', (string) $sheet->getCell('B1')->getValue());
    }

    public function test_coordinate_helper_agrees_with_our_column_letter(): void
    {
        foreach ([1, 5, 11, 26, 27, 30, 52, 53] as $index) {
            $this->assertSame(
                Coordinate::stringFromColumnIndex($index),
                SimpleXlsxWriter::columnLetter($index),
                "Kolom {$index} harus sama dengan PhpSpreadsheet"
            );
        }
    }
}
