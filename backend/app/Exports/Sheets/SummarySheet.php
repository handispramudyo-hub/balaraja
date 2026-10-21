<?php

namespace App\Exports\Sheets;

use Illuminate\Support\Carbon;
use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithColumnWidths;
use Maatwebsite\Excel\Concerns\WithEvents;
use Maatwebsite\Excel\Concerns\WithTitle;
use Maatwebsite\Excel\Events\AfterSheet;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;

/**
 * Sheet "Ringkasan": blok total laporan, lalu satu baris per transaksi tanpa
 * rincian barang.
 *
 * Data diambil dari ReportQueryService, jadi angkanya dijamin sama dengan
 * yang tampil di layar dan sama dengan sheet Detail.
 *
 * Tata letak sheet:
 *   baris 1 : nama-nilai summary (jumlah_transaksi, omzet, hpp, ...)
 *   baris 2 : nilainya
 *   baris 3 : pemisah
 *   baris 4 : header tabel per-transaksi
 *   baris 5+: data
 *
 * Blok summary wajib ada karena PDF (transaction.blade.php) mencetaknya juga.
 * Tanpanya, export Excel kehilangan angka kunci (omzet, hpp, laba_kotor)
 * yang ada di layar dan di PDF.
 *
 * Kolom didesain berbasis DATA, bukan hardcoded. Versi sebelumnya selalu
 * menulis 8 kolom berbentuk laporan penjualan ke semua laporan, sehingga
 * laporan pembelian (8 header) dan piutang (7 header) mendapat nilai yang
 * meleset ke kolom sebelah - contohnya kolom "Status" berisi angka sisa
 * piutang. Jumlah header per laporan memang berbeda-beda, jadi yang dipakai
 * adalah daftar label per laporan, bukan satu daftar tetap.
 */
class SummarySheet implements FromArray, ShouldAutoSize, WithColumnWidths, WithEvents, WithTitle
{
    /**
     * @param  array  $report  hasil ReportQueryService
     * @param  array<int, array{label: string, value: callable, kind?: string, width?: int}>  $columns
     * @param  array<string, string>  $summaryLabelMap  nama angka summary per laporan
     */
    public function __construct(
        private array $report,
        private array $columns = [],
        private array $summaryLabelMap = [],
    ) {
        $this->columns = $columns ?: self::defaultColumns();
    }

    /**
     * Kolom default dipakai kalau ReportExportBuilder tidak memberi spec.
     */
    private static function defaultColumns(): array
    {
        return [
            ['label' => 'No', 'value' => fn (array $r, int $i) => $i + 1, 'kind' => 'int', 'width' => 5],
            ['label' => 'Pelanggan', 'value' => fn (array $r) => $r['nama_toko'] ?? '-', 'width' => 26],
            ['label' => 'Total', 'value' => fn (array $r) => (float) ($r['total'] ?? 0), 'kind' => 'money', 'width' => 16],
        ];
    }

    public function title(): string
    {
        return 'Ringkasan';
    }

    /**
     * @return array<int, string>
     */
    public function headings(): array
    {
        return array_map(fn (array $c) => $c['label'], $this->columns);
    }

    /**
     * @return array<int, string>
     */
    public function summaryLabels(): array
    {
        return array_map(
            fn ($key) => $this->summaryLabel((string) $key),
            array_keys($this->summary()),
        );
    }

    /**
     * @return array<int, float|int|string>
     */
    public function summaryValues(): array
    {
        $values = [];

        foreach ($this->summary() as $value) {
            $values[] = is_numeric($value) ? $value + 0 : (string) $value;
        }

        return $values;
    }

    /**
     * Deskripsi blok di atas header tabel, untuk writer XLSX cadangan.
     *
     * @return array<int, array{values: array<int, mixed>, style: string, money?: array<int, bool>}>
     */
    public function preamble(): array
    {
        $blocks = [];
        $labels = $this->summaryLabels();

        foreach ($this->summaryValues() as $i => $value) {
            $blocks[] = [
                // Label di kolom A, nilai di kolom C. Keduanya di-merge dengan
                // kolom berikutnya karena kolom A cuma 5 karakter (Lebarnya
                // untuk "No") dan Excel MEMOTONG teks yang kolom tetangganya
                // terisi. "Jumlah Transaksi" butuh ~17 karakter.
                'values' => [$labels[$i], '', $value],
                'style' => 'pair',
                'money' => [2 => is_numeric($value)],
            ];
        }

        // Baris pemisah harus berisi SATU SPASI, bukan array kosong.
        // Maatwebsite\Excel\Sheet::appendRows() meratakan baris dengan
        // Collection::flatMap(), dan flatMap membuang entri yang hasilnya
        // array kosong. Kalau baris ini kosong, seluruh blok summary naik satu
        // baris di file XLSX PhpSpreadsheet: header tabel menimpa baris
        // pemisah, lalu merge A3:B3 menelan "No Pembelian" dan "Supplier".
        $blocks[] = ['values' => [' '], 'style' => 'blank'];

        return $blocks;
    }

    /**
     * @return array<int, string>
     */
    public function merges(): array
    {
        $merges = [];

        // Hanya baris PASANGAN yang di-merge; baris pemisah dan header tabel
        // tidak boleh ikut, kalau tidak sel berikutnya jadi slave merge dan
        // isinya hilang saat dibaca.
        for ($r = 1; $r <= count($this->summaryLabels()); $r++) {
            $merges[] = "A{$r}:B{$r}";
            $merges[] = "C{$r}:D{$r}";
        }

        return $merges;
    }

    /**
     * Nomor baris (1-based) header tabel per-transaksi.
     */
    public function headerRow(): int
    {
        return count($this->preamble()) + 1;
    }

    /**
     * Isi lengkap sheet, dipakai engine PhpSpreadsheet (interface FromArray).
     * Sheet ini sengaja TIDAK memakai WithHeadings karena header tabel tidak
     * lagi di baris 1 — blok summary yang ada di sana.
     *
     * @return array<int, array<int, mixed>>
     */
    public function array(): array
    {
        $grid = [];

        foreach ($this->preamble() as $block) {
            $grid[] = $block['values'];
        }

        $grid[] = $this->headings();

        foreach ($this->arrayRows() as $row) {
            $grid[] = $row;
        }

        return $grid;
    }

    /**
     * Hanya baris per-transaksi, tanpa blok summary dan tanpa header tabel.
     * Dipakai writer XLSX cadangan, yang menulis header dan preamble lewat
     * parameternya sendiri supaya bisa mengatur freeze pane dan auto-filter.
     *
     * @return array<int, array<int, mixed>>
     */
    public function arrayRows(): array
    {
        $out = [];

        foreach (array_values($this->report['rows'] ?? []) as $i => $row) {
            $line = [];

            foreach ($this->columns as $column) {
                $line[] = ($column['value'])($row, $i);
            }

            $out[] = $line;
        }

        return $out;
    }

    /**
     * @return array<string, mixed>
     */
    private function summary(): array
    {
        $summary = $this->report['summary'] ?? [];

        return is_array($summary) ? $summary : [];
    }

    /**
     * `hpp` -> `HPP`, `laba_kotor` -> `Laba Kotor`.
     *
     * Label dari ReportExportBuilder dipakai kalau tersedia karena
     * `ucwords()` tidak bisa tahu mana akronim: tanpa peta itu "hpp" akan
     * tertulis "Hpp" di sheet.
     */
    private function summaryLabel(string $key): string
    {
        if (isset($this->summaryLabelMap[$key])) {
            return $this->summaryLabelMap[$key];
        }

        $label = ucwords(str_replace('_', ' ', $key));

        return $label === '' ? $key : $label;
    }

    public function columnWidths(): array
    {
        $widths = [];

        foreach ($this->columns as $i => $column) {
            // Kunci WAJIB huruf kolom (A, B, ...), bukan nomor kolom.
            $widths[Coordinate::stringFromColumnIndex($i + 1)] = $column['width'] ?? 16;
        }

        return $widths;
    }

    public function registerEvents(): array
    {
        return [
            AfterSheet::class => function (AfterSheet $event) {
                $sheet = $event->sheet->getDelegate();
                $headerRow = $this->headerRow();
                $summaryRows = count($this->summaryLabels());
                $lastCol = Coordinate::stringFromColumnIndex(max(1, count($this->columns)));
                $lastRow = max($headerRow, $sheet->getHighestRow());
                $firstData = $headerRow + 1;

                // Rantai fluent dipecah: setBold() mengembalikan objek Font,
                // bukan Style, jadi getFill() harus dipanggil dari Style lagi.
                $sheet->getStyle("A{$headerRow}:{$lastCol}{$headerRow}")
                    ->getFont()->setBold(true);
                $sheet->getStyle("A{$headerRow}:{$lastCol}{$headerRow}")
                    ->getFill()
                    ->setFillType(Fill::FILL_SOLID)
                    ->getStartColor()->setARGB('FFE8EAF6');

                if ($summaryRows > 0) {
                    // Label summary (kolom A) tebal, nilai (kolom C) rata
                    // kanan. Format uang hanya untuk yang benar-benar numerik;
                    // memaksakan "#,##0" pada tanggal atau teks akan
                    // menampilkan angka gibberish.
                    $sheet->getStyle("A1:A{$summaryRows}")->getFont()->setBold(true);

                    foreach ($this->summaryValues() as $i => $value) {
                        $row = $i + 1;
                        $cell = $sheet->getStyle("C{$row}");

                        if (! is_numeric($value)) {
                            continue;
                        }

                        $cell->getAlignment()->setHorizontal('right')->setVertical('center');
                        $cell->getNumberFormat()->setFormatCode('#,##0');
                    }

                    $sheet->getStyle("A1:D{$summaryRows}")
                        ->getBorders()->getAllBorders()->setBorderStyle(Border::BORDER_THIN);

                    foreach ($this->merges() as $range) {
                        $sheet->mergeCells($range);
                    }
                }

                $sheet->getStyle("A{$headerRow}:{$lastCol}{$lastRow}")
                    ->getBorders()->getAllBorders()->setBorderStyle(Border::BORDER_THIN);

                // Format per KOLOM sesuai jenisnya. Dulu kolom uang dipatok
                // E:G dan H, jadi laporan dengan jumlah kolom berbeda salah
                // format dan kolom Status ikut diberi angka.
                foreach ($this->columns as $i => $column) {
                    if (($column['kind'] ?? 'text') === 'text') {
                        continue;
                    }

                    $col = Coordinate::stringFromColumnIndex($i + 1);

                    $sheet->getStyle("{$col}{$headerRow}:{$col}{$lastRow}")
                        ->getAlignment()->setHorizontal('right')->setVertical('center');

                    if (($column['kind'] ?? null) === 'money') {
                        $sheet->getStyle("{$col}{$firstData}:{$col}{$lastRow}")
                            ->getNumberFormat()->setFormatCode('#,##0');
                    }
                }

                $sheet->freezePane('A'.$firstData);
            },
        ];
    }

    /**
     * Ubah tanggal jadi format Indonesia. Nilai dari server bisa berupa
     * Carbon, string `Y-m-d`, atau string `Y-m-d H:i:s` (SQLite vs MySQL),
     * jadi semuanya harus ditangani.
     */
    public static function tanggal($value): string
    {
        if ($value === null || $value === '') {
            return '-';
        }

        if ($value instanceof Carbon) {
            return $value->format('d/m/Y');
        }

        try {
            return Carbon::parse($value)->format('d/m/Y');
        } catch (\Throwable) {
            return (string) $value;
        }
    }

    public static function statusLabel(?string $status): string
    {
        return match ($status) {
            'paid', 'lunas' => 'Lunas',
            'partial' => 'Sebagian',
            'unpaid' => 'Belum Bayar',
            default => (string) ($status ?? '-'),
        };
    }
}
