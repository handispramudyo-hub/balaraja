<?php

namespace App\Support\Pdf;

use App\Exports\ReportExportBuilder;
use Illuminate\Support\Carbon;

/**
 * PDF laporan transaksi tanpa dompdf.
 *
 * Menggambar layout yang sama dengan `reports.pdf.transaction` (kelompok per
 * transaksi, kartu dengan header dan tabel barang) memakai
 * {@see SimplePdfWriter}. Data tetap dari ReportQueryService lewat
 * ReportExportBuilder, jadi angka PDF sama dengan layar dan sama dengan Excel.
 *
 * Tiga bagian yang paling sering bikin PDF hasil tulis-tangan manual terlihat
 * rusak dan semuanya ditangani di sini: pemenggalan nama barang, pindah
 * halaman di tengah tabel, dan pengulangan header di setiap halaman.
 */
class TransactionReportPdf
{
    private const MARGIN = 40.0;
    private const FONT_TITLE = 14.0;
    private const FONT_META = 8.0;
    private const FONT_BODY = 8.5;
    private const FONT_SMALL = 7.5;
    private const ROW_HEIGHT = 13.0;
    private const CARD_GAP = 8.0;

    /** Warna mengikuti palet Abu-abu di view Blade. */
    private const COLOR_HEADER_BG = [229, 231, 235];
    private const COLOR_CARD_BG = [243, 244, 246];
    private const COLOR_ITEM_HEAD_BG = [250, 250, 250];
    private const COLOR_TOTAL_BG = [249, 250, 251];
    private const COLOR_BORDER = [209, 213, 219];
    private const COLOR_MUTED = [107, 114, 128];
    private const COLOR_TEXT = [17, 24, 39];

    private SimplePdfWriter $pdf;
    private float $contentWidth;
    private int $pageNumber = 0;

    /**
     * @param  array  $reportData  hasil ReportQueryService
     * @return string byte PDF
     */
    public function render(string $report, array $reportData): string
    {
        $config = ReportExportBuilder::configFor($report);

        if ($config === null) {
            throw new \InvalidArgumentException("Laporan tidak dikenal: {$report}");
        }

        // Penjualan & piutang butuh lebih banyak lebar kolom, sama seperti
        // keputusan di controller untuk dompdf.
        $this->pdf = new SimplePdfWriter($report !== 'purchases');
        $this->contentWidth = $this->pdf->width() - (self::MARGIN * 2);
        $this->pageNumber = 0;

        $this->startPage();

        $this->drawTitle($reportData['meta']);
        $this->drawSummary($reportData['summary'] ?? []);

        $transactions = $this->flatten($reportData['rows'] ?? [], $config);

        if ($transactions === []) {
            $this->pdf->setCursorY($this->pdf->cursorY() - 14);
            $this->pdf->text(self::MARGIN, $this->pdf->cursorY(), 'Tidak ada data pada periode ini.', self::FONT_BODY);
            $this->pdf->text(self::MARGIN, $this->pdf->cursorY(), '', 9);
        }

        foreach ($transactions as $transaction) {
            $this->drawTransaction($transaction, $config, $report);
        }

        return $this->pdf->output();
    }

    private function startPage(): void
    {
        $this->pageNumber++;

        if ($this->pageNumber === 1) {
            $this->pdf->setCursorY($this->pdf->height() - self::MARGIN);

            return;
        }

        $this->pdf->newPage($this->pdf->height() - self::MARGIN, function (SimplePdfWriter $pdf): void {
            $pdf->text(self::MARGIN, $pdf->height() - self::MARGIN, 'Lanjutan', self::FONT_META);
        });
    }

    /**
     * @param  array{title?: string, periode?: string, filters?: array<int, string>, generated_at?: mixed}  $meta
     */
    private function drawTitle(array $meta): void
    {
        $y = $this->pdf->cursorY();
        $this->pdf->text(self::MARGIN, $y, (string) ($meta['title'] ?? 'Laporan'), self::FONT_TITLE, true);
        $y -= 16;

        $parts = ['Periode: '.($meta['periode'] ?? '-')];

        if (! empty($meta['filters'])) {
            $parts[] = 'Filter: '.implode(' | ', (array) $meta['filters']);
        }

        $parts[] = 'Dicetak: '.$this->tanggal($meta['generated_at'] ?? null, true);

        $this->pdf->text(self::MARGIN, $y, implode('   ', $parts), self::FONT_META);
        $y -= 8;

        $this->pdf->line(self::MARGIN, $y, self::MARGIN + $this->contentWidth, $y, 0.6, self::COLOR_BORDER);
        $this->pdf->setCursorY($y - 12);
    }

    /**
     * @param  array<string, mixed>  $summary
     */
    private function drawSummary(array $summary): void
    {
        if ($summary === []) {
            return;
        }

        $keys = array_keys($summary);
        $count = max(1, count($keys));
        $columnWidth = $this->contentWidth / $count;
        $top = $this->pdf->cursorY();
        $rowHeight = 15.0;

        // Baris label
        foreach ($keys as $i => $key) {
            $x = self::MARGIN + ($i * $columnWidth);
            $this->pdf->rect($x, $top - $rowHeight, $columnWidth, $rowHeight, self::COLOR_HEADER_BG);
            $this->pdf->text($x + 3, $top - $rowHeight + 4.5, (string) $key, self::FONT_SMALL, true);
            $this->pdf->line($x, $top - $rowHeight, $x, $top, 0.3, self::COLOR_BORDER);
        }

        // Baris nilai, rata kanan seperti view Blade (class .num)
        $valueTop = $top - $rowHeight;
        $bottom = $valueTop - $rowHeight;

        foreach ($keys as $i => $key) {
            $x = self::MARGIN + ($i * $columnWidth);
            $this->pdf->rect($x, $bottom, $columnWidth, $rowHeight, [255, 255, 255]);
            $this->pdf->textRight(
                $x + $columnWidth - 3,
                $bottom + 4.5,
                $this->nilai($summary[$key]),
                self::FONT_BODY,
                true
            );
            $this->pdf->line($x, $bottom, $x, $top, 0.3, self::COLOR_BORDER);
        }

        $this->pdf->line(self::MARGIN, $top, self::MARGIN + $this->contentWidth, $top, 0.3, self::COLOR_BORDER);
        $this->pdf->line(self::MARGIN, $bottom, self::MARGIN + $this->contentWidth, $bottom, 0.3, self::COLOR_BORDER);
        $this->pdf->line(self::MARGIN + $this->contentWidth, $bottom, self::MARGIN + $this->contentWidth, $top, 0.3, self::COLOR_BORDER);

        $this->pdf->setCursorY($bottom - self::CARD_GAP);
    }

    /**
     * Ratakan dua bentuk data laporan jadi satu daftar transaksi.
     *
     * Bentuk datar (penjualan/pembelian): row adalah transaksinya.
     * Bentuk bersarang (piutang): row adalah pelanggan, dan tiap penjualan di
     * dalam `detail` yang jadi transaksi. Logika ini sengaja sama dengan
     * yang dipakai view Blade dan DetailSheet.
     *
     * @param  array{party_label: string, party_key: string, nested_path: array<int, string>}  $config
     * @return array<int, array{no: string, tanggal: mixed, party: string, total: float, sisa: float, items: array}>
     */
    private function flatten(array $rows, array $config): array
    {
        $out = [];

        foreach ($rows as $row) {
            $party = (string) ($row[$config['party_key']] ?? '-');
            $groups = $this->groups($row, $config['nested_path']);

            foreach ($groups as $group) {
                $out[] = [
                    'no' => (string) ($group['no_transaksi'] ?? $group['no_pembelian'] ?? ('#'.($group['id'] ?? '?'))),
                    'tanggal' => $group['tanggal'] ?? null,
                    'party' => $party,
                    'total' => (float) ($group['total'] ?? $group['total_transaksi'] ?? 0),
                    'sisa' => (float) ($group['sisa_piutang'] ?? 0),
                    'items' => is_array($group['items'] ?? null) ? $group['items'] : [],
                ];
            }
        }

        return $out;
    }

    /**
     * @param  array<int, string>  $nestedPath
     * @return array<int, array>
     */
    private function groups(array $row, array $nestedPath): array
    {
        if ($nestedPath === []) {
            return [$row];
        }

        $nested = $row;

        foreach ($nestedPath as $key) {
            if ($nested instanceof \Illuminate\Support\Collection) {
                $nested = $nested->all();
            }

            if (! is_array($nested) || ! array_key_exists($key, $nested)) {
                return [];
            }

            $nested = $nested[$key];
        }

        if ($nested instanceof \Illuminate\Support\Collection) {
            $nested = $nested->all();
        }

        return is_array($nested) ? array_values($nested) : [];
    }

    /**
     * @param  array{no: string, tanggal: mixed, party: string, total: float, sisa: float, items: array}  $trx
     * @param  array{party_label: string, party_key: string, nested_path: array<int, string>}  $config
     */
    private function drawTransaction(array $trx, array $config, string $report): void
    {
        $this->ensureRoom(self::ROW_HEIGHT * 4);

        $y = $this->pdf->cursorY();
        $height = self::ROW_HEIGHT;

        // Header kartu
        $this->pdf->rect(self::MARGIN, $y - $height, $this->contentWidth, $height, self::COLOR_CARD_BG);
        $this->pdf->text(self::MARGIN + 4, $y - $height + 4, $trx['no'], self::FONT_BODY, true);

        $afterNo = self::MARGIN + 8 + $this->pdf->textWidth($trx['no'], self::FONT_BODY, true);
        $meta = ' · '.$this->tanggal($trx['tanggal']).' · '.$config['party_label'].': '.$trx['party'];

        $this->pdf->text(
            $afterNo,
            $y - $height + 4,
            $this->pdf->truncate($meta, max(20, $this->contentWidth * 0.45), self::FONT_SMALL),
            self::FONT_SMALL
        );

        $right = $report === 'receivables'
            ? 'Sisa: '.self::uang($trx['sisa'])
            : 'Total: '.self::uang($trx['total']);

        $this->pdf->textRight(
            self::MARGIN + $this->contentWidth - 4,
            $y - $height + 4,
            $right,
            self::FONT_BODY,
            $report !== 'receivables'
        );

        $y -= $height;
        $this->pdf->setCursorY($y);

        if ($trx['items'] === []) {
            $this->pdf->rect(self::MARGIN, $y - $height, $this->contentWidth, $height, [255, 255, 255]);
            $this->pdf->text(self::MARGIN + 4, $y - $height + 4, 'Rincian barang tidak tersedia.', self::FONT_SMALL);
            $this->pdf->line(self::MARGIN, $y - $height, self::MARGIN + $this->contentWidth, $y - $height, 0.3, self::COLOR_BORDER);
            $this->pdf->line(self::MARGIN, $y, self::MARGIN + $this->contentWidth, $y, 0.3, self::COLOR_BORDER);
            $this->pdf->line(self::MARGIN, $y - $height, self::MARGIN, $y, 0.3, self::COLOR_BORDER);
            $this->pdf->line(self::MARGIN + $this->contentWidth, $y - $height, self::MARGIN + $this->contentWidth, $y, 0.3, self::COLOR_BORDER);
            $this->pdf->setCursorY($y - $height - self::CARD_GAP);

            return;
        }

        $columns = $this->itemColumns();
        $y = $this->drawItemHeader($y, $columns);
        $subtotal = 0.0;

        foreach ($trx['items'] as $item) {
            $y = $this->drawItemRow($y, $item);
            $subtotal += (float) ($item['subtotal'] ?? 0);
        }

        $y = $this->drawSubtotalRow($y, $subtotal);

        $this->pdf->line(self::MARGIN, $y, self::MARGIN + $this->contentWidth, $y, 0.4, self::COLOR_BORDER);
        $this->pdf->setCursorY($y - self::CARD_GAP);
    }

    /**
     * @return array<int, array{key: string, label: string, width: float, align: string}>
     */
    private function itemColumns(): array
    {
        $w = $this->contentWidth;
        $kode = $w * 0.12;
        $satuan = $w * 0.10;
        $qty = $w * 0.08;
        $harga = $w * 0.14;
        $subtotal = $w * 0.15;

        return [
            ['key' => 'kode', 'label' => 'Kode', 'width' => $kode, 'align' => 'left'],
            ['key' => 'nama', 'label' => 'Nama Barang', 'width' => $w - $kode - $satuan - $qty - $harga - $subtotal, 'align' => 'left'],
            ['key' => 'satuan', 'label' => 'Satuan', 'width' => $satuan, 'align' => 'left'],
            ['key' => 'qty', 'label' => 'Qty', 'width' => $qty, 'align' => 'right'],
            ['key' => 'harga', 'label' => 'Harga', 'width' => $harga, 'align' => 'right'],
            ['key' => 'subtotal', 'label' => 'Subtotal', 'width' => $subtotal, 'align' => 'right'],
        ];
    }

    /**
     * @param  array<int, array{key: string, label: string, width: float, align: string}>  $columns
     */
    private function drawItemHeader(float $y, array $columns): float
    {
        $height = self::ROW_HEIGHT;
        $x = self::MARGIN;

        foreach ($columns as $column) {
            $this->pdf->rect($x, $y - $height, $column['width'], $height, self::COLOR_ITEM_HEAD_BG);
            $this->pdf->line($x, $y - $height, $x, $y, 0.3, self::COLOR_BORDER);

            $label = $this->pdf->truncate($column['label'], $column['width'] - 6, self::FONT_SMALL, true);

            if ($column['align'] === 'right') {
                $this->pdf->textRight($x + $column['width'] - 3, $y - $height + 4, $label, self::FONT_SMALL, true);
            } else {
                $this->pdf->text($x + 3, $y - $height + 4, $label, self::FONT_SMALL, true);
            }

            $x += $column['width'];
        }

        $this->pdf->line(self::MARGIN, $y - $height, self::MARGIN + $this->contentWidth, $y - $height, 0.3, self::COLOR_BORDER);
        $this->pdf->line(self::MARGIN, $y, self::MARGIN + $this->contentWidth, $y, 0.3, self::COLOR_BORDER);
        $this->pdf->line(self::MARGIN + $this->contentWidth, $y - $height, self::MARGIN + $this->contentWidth, $y, 0.3, self::COLOR_BORDER);

        // Cursor WAJIB disinkronkan di setiap method yang memakan tinggi
        // vertikal. Kalau dilewatkan, drawItemRow() membaca cursor lama dan
        // menggambar baris barang tepat di atas header kartu.
        $this->pdf->setCursorY($y - $height);

        return $y - $height;
    }

    private function drawItemRow(float $y, array $item): float
    {
        $columns = $this->itemColumns();

        // Nama barang boleh panjang dan boleh membungkus, jadi tinggi baris
        // dihitung dari jumlah baris wrap - bukan konstan.
        $nameLines = $this->pdf->wrap((string) ($item['nama'] ?? '-'), $columns[1]['width'] - 6, self::FONT_SMALL);
        $height = max(self::ROW_HEIGHT, (count($nameLines) * 9.0) + 5);

        $this->ensureRoom($height);
        $y = $this->pdf->cursorY();

        $x = self::MARGIN;

        foreach ($columns as $column) {
            $this->pdf->rect($x, $y - $height, $column['width'], $height, [255, 255, 255]);
            $this->pdf->line($x, $y - $height, $x, $y, 0.3, self::COLOR_BORDER);

            if ($column['key'] === 'nama') {
                $lineY = $y - $height + 4 + (($height - (count($nameLines) * 9.0)) / 2);

                foreach ($nameLines as $line) {
                    $this->pdf->text($x + 3, $lineY, $line, self::FONT_SMALL);
                    $lineY -= 9;
                }
            } else {
                $text = $this->cellValue($column['key'], $item);
                $text = $this->pdf->truncate($text, $column['width'] - 6, self::FONT_SMALL);

                if ($column['align'] === 'right') {
                    $this->pdf->textRight($x + $column['width'] - 3, $y - $height + 4, $text, self::FONT_SMALL);
                } else {
                    $this->pdf->text($x + 3, $y - $height + 4, $text, self::FONT_SMALL);
                }
            }

            $x += $column['width'];
        }

        $this->pdf->line(self::MARGIN, $y - $height, self::MARGIN + $this->contentWidth, $y - $height, 0.3, self::COLOR_BORDER);
        $this->pdf->line(self::MARGIN, $y, self::MARGIN + $this->contentWidth, $y, 0.3, self::COLOR_BORDER);
        $this->pdf->line(self::MARGIN + $this->contentWidth, $y - $height, self::MARGIN + $this->contentWidth, $y, 0.3, self::COLOR_BORDER);

        $this->pdf->setCursorY($y - $height);

        return $y - $height;
    }

    /**
     * Baris penutup tabel barang: label "Subtotal" di kolom kedua dari kanan
     * dan nilainya di kolom terakhir, sejajar dengan kolom Subtotal Baris.
     */
    private function drawSubtotalRow(float $y, float $subtotal): float
    {
        $height = self::ROW_HEIGHT;
        $lastColumn = $this->itemColumns()[count($this->itemColumns()) - 1];
        $valueRight = self::MARGIN + $this->contentWidth - 3;
        $labelRight = $valueRight - $lastColumn['width'] - 4;

        $this->pdf->rect(self::MARGIN, $y - $height, $this->contentWidth, $height, self::COLOR_TOTAL_BG);

        $x = self::MARGIN;
        foreach ($this->itemColumns() as $column) {
            $this->pdf->line($x, $y - $height, $x, $y, 0.3, self::COLOR_BORDER);
            $x += $column['width'];
        }

        $this->pdf->line($labelRight + 4, $y - $height, $labelRight + 4, $y, 0.3, self::COLOR_BORDER);

        // Label di kolom kedua dari kanan, nilai di kolom terakhir.
        $this->pdf->textRight($labelRight, $y - $height + 4, 'Subtotal', self::FONT_SMALL, true);
        $this->pdf->textRight($valueRight, $y - $height + 4, self::uang($subtotal), self::FONT_SMALL, true);

        $this->pdf->line(self::MARGIN, $y - $height, self::MARGIN + $this->contentWidth, $y - $height, 0.3, self::COLOR_BORDER);
        $this->pdf->line(self::MARGIN, $y, self::MARGIN + $this->contentWidth, $y, 0.3, self::COLOR_BORDER);
        $this->pdf->line(self::MARGIN + $this->contentWidth, $y - $height, self::MARGIN + $this->contentWidth, $y, 0.3, self::COLOR_BORDER);

        $this->pdf->setCursorY($y - $height);

        return $y - $height;
    }

    /**
     * Pindah halaman kalau ruang tersisa tidak cukup.
     */
    private function ensureRoom(float $needed): void
    {
        if ($this->pdf->hasRoom($needed)) {
            return;
        }

        $this->startPage();
    }

    private function cellValue(string $key, array $item): string
    {
        return match ($key) {
            'kode' => (string) ($item['kode'] ?? '-'),
            'satuan' => (string) ($item['satuan'] ?? '-'),
            'qty' => self::qty((float) ($item['qty'] ?? 0)),
            'harga' => self::uang((float) ($item['harga'] ?? 0)),
            'subtotal' => self::uang((float) ($item['subtotal'] ?? 0)),
            default => (string) ($item[$key] ?? '-'),
        };
    }

    private function nilai(mixed $value): string
    {
        return is_numeric($value) ? self::uang((float) $value) : (string) $value;
    }

    public static function uang(float $value): string
    {
        return number_format($value, 0, ',', '.');
    }

    /**
     * Qty boleh pecahan (1,5 btl), jadi desimal dibuang hanya kalau nol.
     */
    public static function qty(float $value): string
    {
        return rtrim(rtrim(number_format($value, 0, ',', '.'), '0'), ',') ?: '0';
    }

    private function tanggal(mixed $value, bool $withTime = false): string
    {
        if ($value === null || $value === '') {
            return '-';
        }

        $format = $withTime ? 'd/m/Y H:i' : 'd/m/Y';

        if ($value instanceof Carbon) {
            return $value->format($format);
        }

        try {
            return Carbon::parse($value)->format($format);
        } catch (\Throwable) {
            return (string) $value;
        }
    }
}
