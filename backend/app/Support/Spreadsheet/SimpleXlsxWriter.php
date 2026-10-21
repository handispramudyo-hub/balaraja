<?php

namespace App\Support\Spreadsheet;

/**
 * Penulis `.xlsx` tanpa ekstensi `zip` maupun `xmlwriter`.
 *
 * Berkas xlsx adalah ZIP berisi file XML dengan struktur yang ditentukan
 * SpreadsheetML. File XML-nya ditulis sebagai string biasa, lalu dipaketkan
 * dengan {@see \App\Support\Archive\ZipWriter}. Hasilnya opened by Excel,
 * LibreOffice, dan juga bisa dibaca PhpSpreadsheet (dipakai di test sebagai
 * pembuktian bahwa file-nya benar-benar valid, bukan sekadar signature "PK").
 *
 * Cakupan sengaja dijaga sempit: yang dibutuhkan laporan BALARAJA saja —
 * dua sheet, header tebal, format angka `#,##0`, lebar kolom, freeze baris
 * pertama, dan auto-filter. Nilai ditulis sebagai `inlineStr` supaya tidak
 * perlu `sharedStrings.xml`.
 */
class SimpleXlsxWriter
{
    private const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    private const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

    /** Index style di `cellXfs`; harus sinkron dengan self::stylesXml(). */
    private const STYLE_PLAIN = 0;
    private const STYLE_HEADER = 1;
    private const STYLE_BORDER = 2;
    private const STYLE_MONEY = 3;
    private const STYLE_RIGHT = 4;
    private const STYLE_RIGHT_MONEY = 5;
    private const STYLE_BOLD = 6;

    /** @var array<int, array{title: string, headings: array<int, string>, rows: array<int, array<int, mixed>>, widths: array<int, int>, money_columns: array<int, bool>, auto_filter: bool, preamble: array<int, array{values: array<int, mixed>, style: string, money?: array<int, bool>}>, merges: array<int, string>}> */
    private array $sheets = [];

    /**
     * @param  array<int, string>  $headings
     * @param  array<int, array<int, mixed>>  $rows
     * @param  array<int, int>  $widths  lebar kolom per index (0 = kolom A)
     * @param  array<int, bool>  $moneyColumns  kolom mana yang diformat `#,##0`
     * @param  array<int, array{values: array<int, mixed>, style: string, money?: array<int, bool>}>  $preamble
     *        blok yang ditulis DI ATAS header tabel. Setiap entri punya
     *        `style`: `header` (tebal+fill), `values` (angka rata kanan), atau
     *        `blank` (baris pemisah tanpa sel). Dipakai sheet Ringkasan untuk
     *        menaruh angka total laporan sebelum tabel per-transaksi.
     * @param  array<int, string>  $merges  daftar range merge SpreadsheetML,
     *        mis. `A1:B1`. Wajib untuk isi yang lebih lebar dari satu kolom:
     *        Excel MEMOTONG teks yang kolom tetangganya terisi, jadi label
     *        panjang di kolom sempit akan hilang.
     */
    public function addSheet(
        string $title,
        array $headings,
        array $rows,
        array $widths = [],
        array $moneyColumns = [],
        bool $autoFilter = false,
        array $preamble = [],
        array $merges = [],
    ): void {
        $this->sheets[] = [
            'title' => $title,
            'headings' => array_values($headings),
            'rows' => array_values($rows),
            'widths' => $widths,
            'money_columns' => $moneyColumns,
            'auto_filter' => $autoFilter,
            'preamble' => array_values($preamble),
            'merges' => array_values($merges),
        ];
    }

    public function output(): string
    {
        $zip = new \App\Support\Archive\ZipWriter();

        $zip->add('[Content_Types].xml', $this->contentTypesXml());
        $zip->add('_rels/.rels', $this->rootRelsXml());
        $zip->add('xl/workbook.xml', $this->workbookXml());
        $zip->add('xl/_rels/workbook.xml.rels', $this->workbookRelsXml());
        $zip->add('xl/styles.xml', self::stylesXml());

        foreach (array_values($this->sheets) as $i => $sheet) {
            $zip->add('xl/worksheets/sheet'.($i + 1).'.xml', $this->sheetXml($sheet));
        }

        return $zip->output();
    }

    private function contentTypesXml(): string
    {
        $overrides = '';

        foreach (array_keys($this->sheets) as $i) {
            $overrides .= '<Override PartName="/xl/worksheets/sheet'.($i + 1).'.xml"'
                .' ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }

        return $this->declaration()
            .'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            .'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            .'<Default Extension="xml" ContentType="application/xml"/>'
            .'<Override PartName="/xl/workbook.xml"'
            .' ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            .'<Override PartName="/xl/styles.xml"'
            .' ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            .$overrides
            .'</Types>';
    }

    private function rootRelsXml(): string
    {
        return $this->declaration()
            .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            .'<Relationship Id="rId1" Type="'.self::NS_REL.'/officeDocument" Target="xl/workbook.xml"/>'
            .'</Relationships>';
    }

    private function workbookXml(): string
    {
        $sheets = '';

        foreach (array_values($this->sheets) as $i => $sheet) {
            $sheets .= '<sheet name="'.$this->escape($sheet['title']).'"'
                .' sheetId="'.($i + 1).'" r:id="rId'.($i + 1).'"/>';
        }

        return $this->declaration()
            .'<workbook xmlns="'.self::NS_MAIN.'" xmlns:r="'.self::NS_REL.'">'
            .'<sheets>'.$sheets.'</sheets>'
            .'</workbook>';
    }

    private function workbookRelsXml(): string
    {
        $rels = '';
        $n = count($this->sheets);

        foreach (array_keys($this->sheets) as $i) {
            $rels .= '<Relationship Id="rId'.($i + 1).'" Type="'.self::NS_REL.'/worksheet"'
                .' Target="worksheets/sheet'.($i + 1).'.xml"/>';
        }

        $rels .= '<Relationship Id="rId'.($n + 1).'" Type="'.self::NS_REL.'/styles" Target="styles.xml"/>';

        return $this->declaration()
            .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            .$rels
            .'</Relationships>';
    }

    /**
     * @param  array{title: string, headings: array<int, string>, rows: array<int, array<int, mixed>>, widths: array<int, int>, money_columns: array<int, bool>, auto_filter: bool, preamble: array<int, array{values: array<int, mixed>, style: string, money?: array<int, bool>}>, merges: array<int, string>}  $sheet
     */
    private function sheetXml(array $sheet): string
    {
        $preamble = $sheet['preamble'];
        $headerRow = count($preamble) + 1;
        $lastCol = self::columnLetter(max(
            1,
            count($sheet['headings']),
            $this->widestRow($preamble),
        ));
        $lastRow = $headerRow + count($sheet['rows']);

        $cols = '';
        foreach ($sheet['widths'] as $index => $width) {
            $n = $index + 1;
            $cols .= '<col min="'.$n.'" max="'.$n.'" width="'.$width.'" customWidth="1"/>';
        }

        $top = '';

        foreach ($preamble as $i => $block) {
            $rowNumber = $i + 1;
            $values = array_values($block['values']);

            if ($values === []) {
                $top .= '<row r="'.$rowNumber.'"/>';

                continue;
            }

            $top .= '<row r="'.$rowNumber.'">';

            foreach ($values as $c => $value) {
                $ref = self::columnLetter($c + 1).$rowNumber;
                $style = match ($block['style'] ?? '') {
                    'header' => self::STYLE_HEADER,
                    // Kolom pertama baris pasangan adalah label (tebal),
                    // sisanya mengikuti jenis datanya.
                    'pair' => $c === 0 ? self::STYLE_BOLD : $this->styleFor($c, $value, $block['money'] ?? []),
                    // Baris pemisah: tanpa border dan tanpa format.
                    'blank' => self::STYLE_PLAIN,
                    default => $this->styleFor($c, $value, $block['money'] ?? []),
                };
                $top .= $this->cell($ref, $style, $value);
            }

            $top .= '</row>';
        }

        $header = '<row r="'.$headerRow.'">';
        foreach ($sheet['headings'] as $i => $heading) {
            $header .= $this->cell(self::columnLetter($i + 1).$headerRow, self::STYLE_HEADER, $heading);
        }
        $header .= '</row>';

        $body = '';
        foreach ($sheet['rows'] as $r => $row) {
            $rowNumber = $headerRow + $r + 1;
            $body .= '<row r="'.$rowNumber.'">';

            foreach (array_values($row) as $i => $value) {
                $ref = self::columnLetter($i + 1).$rowNumber;
                $body .= $this->cell($ref, $this->styleFor($i, $value, $sheet['money_columns']), $value);
            }

            $body .= '</row>';
        }

        $freeze = $headerRow + 1;

        $mergeCells = '';

        if ($sheet['merges'] !== []) {
            $mergeCells = '<mergeCells count="'.count($sheet['merges']).'">';

            foreach ($sheet['merges'] as $range) {
                $mergeCells .= '<mergeCell ref="'.$range.'"/>';
            }

            $mergeCells .= '</mergeCells>';
        }

        return $this->declaration()
            .'<worksheet xmlns="'.self::NS_MAIN.'" xmlns:r="'.self::NS_REL.'">'
            .'<dimension ref="A1:'.$lastCol.$lastRow.'"/>'
            .'<sheetViews><sheetView workbookViewId="0" tabSelected="0">'
            .'<pane ySplit="'.$freeze.'" topLeftCell="A'.$freeze.'" activePane="bottomLeft" state="frozen"/>'
            .'</sheetView></sheetViews>'
            .'<sheetFormatPr defaultRowHeight="15"/>'
            .($cols === '' ? '' : '<cols>'.$cols.'</cols>')
            .'<sheetData>'.$top.$header.$body.'</sheetData>'
            // Urutan elemen di dalam <worksheet> ditentukan schema, bukan
            // bebas: autoFilter lebih dulu, mergeCells sesudahnya.
            .($sheet['auto_filter'] ? '<autoFilter ref="A'.$headerRow.':'.$lastCol.$lastRow.'"/>' : '')
            .$mergeCells
            .'</worksheet>';
    }

    /**
     * @param  array<int, array{values: array<int, mixed>, style: string, money?: array<int, bool>}>  $preamble
     */
    private function widestRow(array $preamble): int
    {
        $widest = 0;

        foreach ($preamble as $block) {
            $widest = max($widest, count($block['values']));
        }

        return $widest;
    }

    /**
     * @param  array<int, bool>  $moneyColumns
     */
    private function styleFor(int $columnIndex, mixed $value, array $moneyColumns): int
    {
        $isNumber = is_int($value) || is_float($value);

        if (! $isNumber) {
            // Kolom angka yang kosong (mis. Total Transaksi di baris item
            // kedua) tetap dikembalikan sebagai string kosong, bukan sel
            // numerik, supaya tidak muncul sebagai 0.
            return self::STYLE_BORDER;
        }

        if ($moneyColumns[$columnIndex] ?? false) {
            return self::STYLE_RIGHT_MONEY;
        }

        return self::STYLE_RIGHT;
    }

    private function cell(string $ref, int $style, mixed $value): string
    {
        if ($value === null || $value === '') {
            return '<c r="'.$ref.'" s="'.self::STYLE_BORDER.'"/>';
        }

        if (is_int($value) || is_float($value)) {
            // is_numeric-looking string (mis. "12") tetap diperlakukan tekstual
            // supaya kolom kode barang tidak berubah jadi angka.
            return '<c r="'.$ref.'" s="'.$style.'"><v>'.$this->number($value).'</v></c>';
        }

        return '<c r="'.$ref.'" s="'.$style.'" t="inlineStr"><is><t xml:space="preserve">'
            .$this->escape((string) $value)
            .'</t></is></c>';
    }

    private function number(int|float $value): string
    {
        if (is_int($value)) {
            return (string) $value;
        }

        // Bulatkan supaya tidak menghasilkan 15015000.000000001 yang tampil
        // sebagai angka ganjil di Excel.
        $rounded = round($value, 6);

        return rtrim(rtrim(number_format($rounded, 6, '.', ''), '0'), '.') ?: '0';
    }

    private function declaration(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    }

    private function escape(string $value): string
    {
        // Buang karakter kontrol yang ilegal di XML 1.0 (selain tab, LF, CR)
        // supaya file tidak ditolak Excel.
        $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', $value) ?? $value;

        return htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }

    public static function columnLetter(int $index): string
    {
        $letter = '';

        while ($index > 0) {
            $index--;
            $letter = chr(65 + ($index % 26)).$letter;
            $index = intdiv($index, 26);
        }

        return $letter === '' ? 'A' : $letter;
    }

    /**
     * Style bersama untuk semua sheet.
     *
     * `numFmt 164` = `#,##0`. Border 1 = garis tipis semua sisi. Fill 1
     * (`gray125`) wajib ada di setiap workbook OOXML walau tidak dipakai.
     */
    private static function stylesXml(): string
    {
        $declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

        return $declaration
            .'<styleSheet xmlns="'.self::NS_MAIN.'">'
            .'<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>'
            .'<fonts count="2">'
            .'<font><sz val="11"/><name val="Calibri"/></font>'
            .'<font><b/><sz val="11"/><name val="Calibri"/></font>'
            .'</fonts>'
            .'<fills count="3">'
            .'<fill><patternFill patternType="none"/></fill>'
            .'<fill><patternFill patternType="gray125"/></fill>'
            .'<fill><patternFill patternType="solid">'
            .'<fgColor rgb="FFE8EAF6"/><bgColor indexed="64"/>'
            .'</patternFill></fill>'
            .'</fills>'
            .'<borders count="2">'
            .'<border><left/><right/><top/><bottom/><diagonal/></border>'
            .'<border>'
            .'<left style="thin"><color rgb="FFB0B0B0"/></left>'
            .'<right style="thin"><color rgb="FFB0B0B0"/></right>'
            .'<top style="thin"><color rgb="FFB0B0B0"/></top>'
            .'<bottom style="thin"><color rgb="FFB0B0B0"/></bottom>'
            .'<diagonal/>'
            .'</border>'
            .'</borders>'
            .'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            .'<cellXfs count="7">'
            // 0: default
            .'<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
            // 1: header (tebal + fill + border)
            .'<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1">'
            .'<alignment horizontal="center" vertical="center" wrapText="1"/>'
            .'</xf>'
            // 2: teks dengan border
            .'<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>'
            // 3: angka currency dengan border
            .'<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>'
            // 4: teks rata kanan dengan border
            .'<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1">'
            .'<alignment horizontal="right"/>'
            .'</xf>'
            // 5: angka currency rata kanan dengan border
            .'<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1">'
            .'<alignment horizontal="right"/>'
            .'</xf>'
            // 6: label tebal dengan border (blok summary sheet Ringkasan)
            .'<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>'
            .'</cellXfs>'
            .'<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
            .'</styleSheet>';
    }
}
