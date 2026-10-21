<?php

namespace App\Exports;

use App\Exports\Sheets\DetailSheet;
use App\Exports\Sheets\SummarySheet;
use Maatwebsite\Excel\Concerns\WithMultipleSheets;

/**
 * Workbook laporan transaksi: sheet Ringkasan + sheet Detail.
 *
 * Satu file, dua tampilan. Sheet Ringkasan untuk dibaca cepat, sheet Detail
 * untuk dihitung (SUMIF, pivot, rekonsiliasi dengan kartu stok).
 */
class GroupedReportExport implements WithMultipleSheets
{
    public function __construct(
        private SummarySheet $summary,
        private DetailSheet $detail,
    ) {}

    public function sheets(): array
    {
        return [$this->summary, $this->detail];
    }
}
