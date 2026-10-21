<?php

namespace App\Http\Controllers\Api;

use App\Exports\ReportExportBuilder;
use App\Exports\Sheets\DetailSheet;
use App\Exports\Sheets\SummarySheet;
use App\Http\Controllers\Controller;
use App\Services\ReportQueryService;
use App\Support\Pdf\TransactionReportPdf;
use App\Support\Spreadsheet\SimpleXlsxWriter;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Maatwebsite\Excel\Facades\Excel;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate as PhpSpreadsheetCoordinate;

/**
 * Export laporan ke Excel dan PDF.
 *
 * Aturan terpenting: SEMUA exporter lewat ReportQueryService, sama seperti
 * layar. Kalau export punya query sendiri, angkanya bisa berbeda dari layar
 * dan user tidak akan pernah tahu mana yang benar.
 *
 * Bentuk kolom per laporan delegated ke ReportExportBuilder supaya logika
 * yang sama bisa dipakai ulang tanpa mengulang di test.
 */
class ReportExportController extends Controller
{
    public function __construct(private ReportQueryService $reports) {}

    /**
     * Satu endpoint untuk semua laporan yang bisa di-export.
     * Format: ?format=excel|pdf
     */
    public function __invoke(Request $request, string $report)
    {
        if (ReportExportBuilder::configFor($report) === null) {
            abort(404, 'Laporan tidak dikenal.');
        }

        $format = strtolower((string) $request->query('format', 'excel'));

        if (! in_array($format, ['excel', 'pdf'], true)) {
            abort(422, 'Format harus excel atau pdf.');
        }

        $reportData = $this->loadReport($report, $request);
        $filename = $this->filename($reportData['meta']['slug'], $format);

        if ($format === 'pdf') {
            return $this->pdf($reportData, $report, $filename);
        }

        return $this->excel($report, $reportData, $filename);
    }

    /**
     * Daftar ekstensi yang dibutuhkan engine utama (PhpSpreadsheet/dompdf).
     *
     * Tidak memblokir export: kalau ada yang hilang, engine cadangan murni PHP
     * yang dipakai. Dipisah sebagai method public supaya test bisa memeriksa
     * daftar ini tanpa bergantung ekstensi server tempat test berjalan.
     *
     * @param  array<int, string>  $loaded  hasil get_loaded_extensions()
     * @return array<int, string>
     */
    public static function missingExtensions(string $format, array $loaded): array
    {
        $required = $format === 'pdf' ? ['dom'] : ['xmlwriter', 'zip'];

        return array_values(array_filter(
            $required,
            static fn (string $ext) => ! in_array($ext, $loaded, true)
        ));
    }

    /**
     * Dipisah supaya test bisa menyimulasikan server tanpa ekstensi.
     *
     * @return array<int, string>
     */
    protected function loadedExtensions(): array
    {
        return get_loaded_extensions();
    }

    /**
     * Excel: PhpSpreadsheet kalau ekstensinya ada, kalau tidak pakai writer
     * murni PHP. Keduanya menghasilkan sheet Ringkasan + Detail dari data yang
     * sama, jadi file di server tetap utuh walau ekstensi dimatikan.
     */
    private function excel(string $report, array $reportData, string $filename)
    {
        if (self::missingExtensions('excel', $this->loadedExtensions()) !== []) {
            $bytes = $this->plainXlsx($report, $reportData);

            return response($bytes, 200, [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition' => 'attachment; filename="'.$filename.'"',
                'Content-Length' => (string) strlen($bytes),
            ]);
        }

        return Excel::download(
            ReportExportBuilder::build($report, $reportData),
            $filename
        );
    }

    /**
     * @return array<int, string>
     */
    private function moneyColumnsFor(array $config): array
    {
        $money = [];

        foreach ($config['summary_columns'] as $i => $column) {
            $money[$i] = ($column['kind'] ?? 'text') === 'money';
        }

        return $money;
    }

    private function plainXlsx(string $report, array $reportData): string
    {
        $config = ReportExportBuilder::configFor($report);

        // Sheet diinstansikan ulang di sini (bukan lewat GroupedReportExport)
        // supaya method layout-nya yang dipakai. Semuanya murni data tanpa
        // menyentuh PhpSpreadsheet, jadi logika flatten detail tetap satu
        // sumber kebenaran.
        $summary = new SummarySheet($reportData, $config['summary_columns'], $config['summary_labels']);
        $detail = new DetailSheet($reportData, $config['party_label'], $config['party_key'], $config['nested_path']);

        $writer = new SimpleXlsxWriter();

        // Ringkasan membawa blok total laporan di atas header tabel, supaya
        // Excel punya angka yang sama dengan layar dan PDF. Tanpa ini, omzet /
        // hpp / laba_kotor hilang dari file Excel.
        $writer->addSheet(
            $summary->title(),
            $summary->headings(),
            $summary->arrayRows(),
            $this->widthsFromLetters($summary->columnWidths()),
            $this->moneyColumnsFor($config),
            false,
            $summary->preamble(),
            $summary->merges(),
        );

        $writer->addSheet(
            $detail->title(),
            $detail->headings(),
            $detail->array(),
            $this->widthsFromLetters($detail->columnWidths()),
            // Kolom H..K: Qty, Harga, Subtotal Baris, Total Transaksi.
            [7 => true, 8 => true, 9 => true, 10 => true],
            true,
        );

        return $writer->output();
    }

    /**
     * Ubah peta lebar kolom {"A": 5, ...} jadi daftar berindex 0.
     *
     * @param  array<string, float>  $widths
     * @return array<int, float>
     */
    private function widthsFromLetters(array $widths): array
    {
        $out = [];

        foreach ($widths as $letter => $width) {
            $out[PhpSpreadsheetCoordinate::columnIndexFromString($letter) - 1] = $width;
        }

        ksort($out);

        return $out;
    }

    private function loadReport(string $report, Request $request): array
    {
        return match ($report) {
            'sales' => $this->reports->sales($request),
            'purchases' => $this->reports->purchases($request),
            'receivables' => $this->reports->receivables($request),
            default => abort(404, 'Laporan tidak dikenal.'),
        };
    }

    private function pdf(array $reportData, string $report, string $filename)
    {
        $config = ReportExportBuilder::configFor($report);

        // dompdf butuh ext-dom. Kalau tidak ada (shared hosting BALARAJA),
        // PDF digambar sendiri dari data yang sama persis.
        if (self::missingExtensions('pdf', $this->loadedExtensions()) !== []) {
            $bytes = (new TransactionReportPdf())->render($report, $reportData);

            return response($bytes, 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'attachment; filename="'.$filename.'"',
                'Content-Length' => (string) strlen($bytes),
            ]);
        }

        // Penjualan & piutang lebih banyak kolom, jadi pakai landscape.
        $landscape = $report !== 'purchases';

        $pdf = Pdf::loadView('reports.pdf.transaction', [
            'meta' => $reportData['meta'],
            'summary' => $reportData['summary'],
            'rows' => $reportData['rows'],
            'kind' => $report,
            'partyLabel' => $config['party_label'],
        ])
            ->setPaper('a4', $landscape ? 'landscape' : 'portrait')
            ->setOption('isRemoteEnabled', false)
            ->setOption('defaultFont', 'DejaVu Sans');

        // dompdf 3.x `output()` selalu mengembalikan string (tidak ada konsep
        // destination seperti di versi 1/2). Dipakai response langsung, bukan
        // streamDownload, supaya perilakunya deterministik dan mudah diuji.
        return response($pdf->output(), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
        ]);
    }

    private function filename(string $slug, string $format): string
    {
        $ext = $format === 'excel' ? 'xlsx' : 'pdf';

        return "laporan-{$slug}-".Carbon::now()->format('Y-m-d').".{$ext}";
    }
}
