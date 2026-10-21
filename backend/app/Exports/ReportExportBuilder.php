<?php

namespace App\Exports;

use App\Exports\Sheets\DetailSheet;
use App\Exports\Sheets\SummarySheet;

/**
 * Membangun objek export dari hasil ReportQueryService.
 *
 * Dipisah dari controller supaya logika "kolom mana untuk laporan mana"
 * bisa diuji langsung tanpa lewat HTTP. Endpoint tetap satu-satunya jalan
 * produksi, tapi test tidak perlu melawan response BinaryFileResponse yang
 * file sementara-nya dihapus begitu respons dikirim.
 */
class ReportExportBuilder
{
    /**
     * Definisi per laporan: kolom sheet Ringkasan, label kolom, sumber
     * party, dan jalur data bersarang (kalau ada).
     *
     * `summary_columns` ditulis eksplisit per laporan. Column spec inilah yang
     * mencegah bug lama: sheet Ringkasan memakai kolom penjualan (dengan
     * kolom "Status") untuk laporan pembelian dan piutang, sehingga angka
     * jatuh di kolom yang labelnya tidak sesuai.
     *
     * @return array{
     *     summary_columns: array<int, array{label: string, value: callable, kind?: string, width?: int}>,
     *     summary_labels: array<string, string>,
     *     party_label: string,
     *     party_key: string,
     *     nested_path: array<int, string>
     * }|null
     */
    public static function configFor(string $report): ?array
    {
        return match ($report) {
            'sales' => [
                'summary_columns' => [
                    ['label' => 'No', 'value' => fn (array $r, int $i) => $i + 1, 'kind' => 'int', 'width' => 5],
                    ['label' => 'No Transaksi', 'value' => fn (array $r) => $r['no_transaksi'] ?? ('#'.$r['id']), 'width' => 20],
                    ['label' => 'Tanggal', 'value' => fn (array $r) => SummarySheet::tanggal($r['tanggal'] ?? null), 'width' => 13],
                    ['label' => 'Pelanggan', 'value' => fn (array $r) => $r['nama_toko'] ?? '-', 'width' => 26],
                    ['label' => 'Total', 'value' => fn (array $r) => (float) ($r['total'] ?? 0), 'kind' => 'money', 'width' => 16],
                    ['label' => 'Dibayar', 'value' => fn (array $r) => (float) ($r['pembayaran'] ?? 0), 'kind' => 'money', 'width' => 16],
                    ['label' => 'Sisa Piutang', 'value' => fn (array $r) => (float) ($r['sisa_piutang'] ?? 0), 'kind' => 'money', 'width' => 16],
                    ['label' => 'Status', 'value' => fn (array $r) => SummarySheet::statusLabel($r['payment_status'] ?? null), 'width' => 14],
                ],
                'summary_labels' => [
                    'jumlah_transaksi' => 'Jumlah Transaksi',
                    'omzet' => 'Omzet',
                    // `ucwords()` akan menulis "Hpp"; akronim harus eksplisit.
                    'hpp' => 'HPP',
                    'laba_kotor' => 'Laba Kotor',
                    'diterima' => 'Diterima',
                    'piutang' => 'Piutang',
                ],
                'party_label' => 'Pelanggan',
                'party_key' => 'nama_toko',
                'nested_path' => [],
            ],
            'purchases' => [
                'summary_columns' => [
                    ['label' => 'No', 'value' => fn (array $r, int $i) => $i + 1, 'kind' => 'int', 'width' => 5],
                    ['label' => 'No Pembelian', 'value' => fn (array $r) => $r['no_pembelian'] ?? ('#'.$r['id']), 'width' => 20],
                    ['label' => 'Tanggal', 'value' => fn (array $r) => SummarySheet::tanggal($r['tanggal'] ?? null), 'width' => 13],
                    ['label' => 'Supplier', 'value' => fn (array $r) => $r['nama_supplier'] ?? '-', 'width' => 26],
                    ['label' => 'Total', 'value' => fn (array $r) => (float) ($r['total'] ?? 0), 'kind' => 'money', 'width' => 16],
                    // Utang memakai kolom & helper yang sama persis dengan
                    // laporan piutang (`receivables`). Dua laporan ini dibaca
                    // side-by-side, jadi bentuk kolomnya harus sama: user
                    // tidak boleh harus mencerna dua format untuk konsep
                    // yang identik.
                    ['label' => 'Sisa Utang', 'value' => fn (array $r) => (float) ($r['sisa_utang'] ?? 0), 'kind' => 'money', 'width' => 16],
                    ['label' => 'Jatuh Tempo', 'value' => fn (array $r) => SummarySheet::tanggal($r['jatuh_tempo'] ?? null), 'width' => 13],
                    ['label' => 'Status', 'value' => fn (array $r) => SummarySheet::statusLabel($r['status_pembayaran'] ?? null), 'width' => 14],
                ],
                'summary_labels' => [
                    'jumlah_transaksi' => 'Jumlah Transaksi',
                    'total' => 'Total',
                    'sisa_utang' => 'Sisa Utang',
                ],
                'party_label' => 'Supplier',
                'party_key' => 'nama_supplier',
                'nested_path' => [],
            ],
            'receivables' => [
                'summary_columns' => [
                    ['label' => 'No', 'value' => fn (array $r, int $i) => $i + 1, 'kind' => 'int', 'width' => 5],
                    ['label' => 'Pelanggan', 'value' => fn (array $r) => $r['nama_toko'] ?? '-', 'width' => 26],
                    ['label' => 'Total Transaksi', 'value' => fn (array $r) => (float) ($r['total_transaksi'] ?? 0), 'kind' => 'money', 'width' => 16],
                    ['label' => 'Dibayar', 'value' => fn (array $r) => (float) ($r['pembayaran'] ?? 0), 'kind' => 'money', 'width' => 16],
                    ['label' => 'Sisa Piutang', 'value' => fn (array $r) => (float) ($r['sisa_piutang'] ?? 0), 'kind' => 'money', 'width' => 16],
                    ['label' => 'Jatuh Tempo', 'value' => fn (array $r) => SummarySheet::tanggal($r['jatuh_tempo'] ?? null), 'width' => 13],
                    ['label' => 'Status', 'value' => fn (array $r) => SummarySheet::statusLabel($r['status_lunas'] ?? null), 'width' => 14],
                ],
                'summary_labels' => [
                    'jumlah_pelanggan' => 'Jumlah Pelanggan',
                    'total_transaksi' => 'Total Transaksi',
                    'pembayaran' => 'Pembayaran',
                    'sisa_piutang' => 'Sisa Piutang',
                ],
                'party_label' => 'Pelanggan',
                'party_key' => 'nama_toko',
                // Piutang: pelanggan -> daftar penjualan (detail) -> barang.
                'nested_path' => ['detail'],
            ],
            default => null,
        };
    }

    public static function build(string $report, array $reportData): GroupedReportExport
    {
        $config = self::configFor($report);

        if ($config === null) {
            throw new \InvalidArgumentException("Laporan tidak dikenal: {$report}");
        }

        return new GroupedReportExport(
            new SummarySheet($reportData, $config['summary_columns'], $config['summary_labels']),
            new DetailSheet($reportData, $config['party_label'], $config['party_key'], $config['nested_path']),
        );
    }
}
