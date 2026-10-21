<?php

namespace App\Exports\Sheets;

use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithColumnWidths;
use Maatwebsite\Excel\Concerns\WithEvents;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithTitle;
use Maatwebsite\Excel\Events\AfterSheet;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;

/**
 * Sheet "Detail": satu baris per BARIS BARANG, dikelompokkan per transaksi.
 *
 * Format ini yang paling berguna di Excel: tiap baris item punya kolom
 * transaksi, jadi user bisa pakai SUMIF/pivot tanpa perlu membaca dokumen
 * yang tersusun vertikal.
 *
 * Kolom subtotal sengaja diulang (kolom "Subtotal Baris" berisi nilai per item,
 * kolom "Total Transaksi" berisi total header) supaya hasil penjumlahan
 * per-item bisa langsung dibandingkan dengan total transaksi.
 *
 * Laporan piutang punya bentuk dua tingkat: pelanggan -> daftar penjualan ->
 * barang. Dulu sheet ini hanya membaca $row['items'], sehingga piutang
 * terbaca sebagai "tidak ada rincian barang" dan semua detail penjualan
 * hilang dari file. $nestedPath membuat sheet ini turun ke tingkat kedua.
 */
class DetailSheet implements FromArray, ShouldAutoSize, WithColumnWidths, WithEvents, WithHeadings, WithTitle
{
    private const LAST_COL = 'K';

    /**
     * @param  array  $report  hasil ReportQueryService
     * @param  array<int, string>  $nestedPath  jalur ke daftar transaksi di dalam row
     */
    public function __construct(
        private array $report,
        private string $partyLabel = 'Pelanggan',
        private string $partyKey = 'nama_toko',
        private array $nestedPath = [],
    ) {}

    public function title(): string
    {
        return 'Detail';
    }

    public function headings(): array
    {
        return [
            'No', 'No Transaksi', 'Tanggal', $this->partyLabel,
            'Kode Barang', 'Nama Barang', 'Satuan',
            'Qty', 'Harga', 'Subtotal Baris', 'Total Transaksi',
        ];
    }

    public function columnWidths(): array
    {
        // Kunci WAJIB huruf kolom (A, B, ...), bukan nomor kolom.
        return [
            'A' => 5, 'B' => 20, 'C' => 13, 'D' => 24, 'E' => 14,
            'F' => 30, 'G' => 10, 'H' => 9, 'I' => 15, 'J' => 16, 'K' => 17,
        ];
    }

    public function array(): array
    {
        $out = [];
        $no = 0;

        foreach (array_values($this->report['rows'] ?? []) as $row) {
            foreach ($this->groups($row) as $group) {
                $no = $this->appendGroup($out, $no, $row, $group);
            }
        }

        return $out;
    }

    /**
     * Pecah satu row laporan menjadi daftar "grup transaksi".
     *
     * Bentuk datar (penjualan/pembelian): row itu sendiri transaksi, jadi
     * dikembalikan apa adanya. Bentuk bersarang (piutang): row adalah
     * pelanggan, grupnya tiap penjualan di dalam `detail`.
     *
     * @return array<int, array>
     */
    private function groups(array $row): array
    {
        if ($this->nestedPath === []) {
            return [$row];
        }

        $nested = $row;

        foreach ($this->nestedPath as $key) {
            if ($nested instanceof Collection) {
                $nested = $nested->all();
            }

            if (! is_array($nested) || ! array_key_exists($key, $nested)) {
                return [];
            }

            $nested = $nested[$key];
        }

        // ReportQueryService mengembalikan Collection untuk `detail`, jadi
        // setelah turun satu level hasilnya MASIH Collection. Kalau tidak
        // dikonversi ke array di sini, `is_array()` menolaknya dan sheet
        // Detail piutang keluar kosong tanpa error sama sekali.
        if ($nested instanceof Collection) {
            $nested = $nested->all();
        }

        return is_array($nested) ? array_values($nested) : [];
    }

    private function appendGroup(array &$out, int $no, array $row, array $group): int
    {
        $items = $group['items'] ?? [];
        $totalTransaksi = (float) ($group['total'] ?? 0);
        $party = $row[$this->partyKey] ?? '-';

        // Transaksi tanpa item tetap harus muncul, kalau tidak nilainya
        // hilang diam-diam dari rekap Excel.
        if ($items === []) {
            $no++;

            $out[] = [
                $no, $this->noTransaksi($group), $this->tanggal($group['tanggal'] ?? null),
                $party, '-', '(tidak ada rincian barang)', '-',
                null, null, null, $totalTransaksi,
            ];

            return $no;
        }

        $first = true;

        foreach ($items as $item) {
            $no++;

            $out[] = [
                $no,
                $first ? $this->noTransaksi($group) : '',
                $first ? $this->tanggal($group['tanggal'] ?? null) : '',
                $first ? $party : '',
                $item['kode'] ?? '-',
                $item['nama'] ?? '-',
                $item['satuan'] ?? '-',
                (float) ($item['qty'] ?? 0),
                (float) ($item['harga'] ?? 0),
                (float) ($item['subtotal'] ?? 0),
                $first ? $totalTransaksi : null,
            ];
            $first = false;
        }

        return $no;
    }

    public function registerEvents(): array
    {
        return [
            AfterSheet::class => function (AfterSheet $event) {
                $sheet = $event->sheet->getDelegate();
                $lastRow = $sheet->getHighestRow();

                // Rantai fluent dipecah: setBold() mengembalikan objek Font,
                // bukan Style, jadi getFill() harus dipanggil dari Style lagi.
                $header = $sheet->getStyle('A1:'.self::LAST_COL.'1');
                $header->getFont()->setBold(true);
                $header->getFill()
                    ->setFillType(Fill::FILL_SOLID)
                    ->getStartColor()->setARGB('FFE8EAF6');

                $sheet->getStyle('A1:'.self::LAST_COL."{$lastRow}")
                    ->getBorders()->getAllBorders()->setBorderStyle(Border::BORDER_THIN);

                foreach (range(2, $lastRow) as $r) {
                    $sheet->getStyle("H{$r}:".self::LAST_COL."{$r}")->getAlignment()->setHorizontal('right');
                    $sheet->getStyle("I{$r}:".self::LAST_COL."{$r}")->getNumberFormat()->setFormatCode('#,##0');
                }

                $sheet->freezePane('A2');
                $sheet->setAutoFilter('A1:'.self::LAST_COL."{$lastRow}");
            },
        ];
    }

    private function noTransaksi(array $row): string
    {
        return $row['no_transaksi'] ?? $row['no_pembelian'] ?? ('#'.($row['id'] ?? '?'));
    }

    private function tanggal($value): string
    {
        return SummarySheet::tanggal($value);
    }
}
