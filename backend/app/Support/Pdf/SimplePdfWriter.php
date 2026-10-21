<?php

namespace App\Support\Pdf;

/**
 * Penulis PDF minimal tanpa ekstensi `dom`.
 *
 * dompdf dan PhpSpreadsheet sama-sama butuh `dom`/`xmlwriter`, yang tidak ada
 * di SAPI web BALARAJA. PDF sendiri formatnya sederhana: daftar objek dengan
 * offset byte yang dicatat di tabel `xref`. Semua yang dibutuhkan laporan
 * (teks, garis, kotak, halaman) bisa ditulis dengan operator `-Tj`, `re`, dan
 * `m/l/S` memakai font base-14 Helvetica yang tersedia di setiap pembaca PDF
 * tanpa embedding.
 *
 * Batasan yang disengaja: teks WinAnsi/Latin-1. Karakter di luar itu
 * (emoji, CJK) diganti `?` alih-alih merusak file.
 */
class SimplePdfWriter
{
    public const A4_WIDTH = 595.28;
    public const A4_HEIGHT = 841.89;

    private const FONT_REGULAR = 'F1';
    private const FONT_BOLD = 'F2';

    /**
     * Lebar glyph Helvetica dalam satuan 1/1000 em, untuk karakter 32..126.
     *
     * Nilai ini dibutuhkan untuk centering, perataan kanan, dan pemenggalan
     * teks. Karakter di luar rentang ini memakai lebar rata-rata 556.
     *
     * @var array<int, int>
     */
    private const WIDTHS_REGULAR = [
        278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
        556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
        1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
        667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
        333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
        556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
    ];

    /** @var array<int, int> */
    private const WIDTHS_BOLD = [
        278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
        556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
        975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
        667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
        333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
        611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
    ];

    private float $width;
    private float $height;
    private bool $landscape;

    private string $content = '';
    private float $cursorY = 0.0;

    /** @var array<int, string> isi stream tiap halaman, sudah di-flush */
    private array $pages = [];

    /** @var array<int, string> objek PDF yang ditulis manual (1..4) */
    private array $objects = [];

    public function __construct(bool $landscape = false)
    {
        $this->landscape = $landscape;
        $this->width = $landscape ? self::A4_HEIGHT : self::A4_WIDTH;
        $this->height = $landscape ? self::A4_WIDTH : self::A4_HEIGHT;
    }

    public function width(): float
    {
        return $this->width;
    }

    public function height(): float
    {
        return $this->height;
    }

    public function setCursorY(float $y): void
    {
        $this->cursorY = $y;
    }

    public function cursorY(): float
    {
        return $this->cursorY;
    }

    public function hasRoom(float $needed): bool
    {
        return $this->cursorY - $needed >= 40;
    }

    /**
     * Tulis teks pada koordinat absolut (titik kiri bawah teks).
     */
    public function text(float $x, float $y, string $text, float $size = 9, bool $bold = false): void
    {
        $text = self::toWinAnsi($text);

        if ($text === '') {
            return;
        }

        $font = $bold ? self::FONT_BOLD : self::FONT_REGULAR;

        $this->content .= sprintf(
            "BT /%s %.2F Tf 1 0 0 1 %.2F %.2F Tm (%s) Tj ET\n",
            $font,
            $size,
            $x,
            $y,
            self::escapeText($text)
        );
    }

    /**
     * Tulis teks rata kanan pada koordinat `x` (tepi kanan).
     */
    public function textRight(float $x, float $y, string $text, float $size = 9, bool $bold = false): void
    {
        $text = self::toWinAnsi($text);

        if ($text === '') {
            return;
        }

        $this->text($x - $this->textWidth($text, $size, $bold), $y, $text, $size, $bold);
    }

    /**
     * Tulis teks rata tengah pada koordinat `x` (titik tengah).
     */
    public function textCenter(float $x, float $y, string $text, float $size = 9, bool $bold = false): void
    {
        $text = self::toWinAnsi($text);

        if ($text === '') {
            return;
        }

        $this->text($x - ($this->textWidth($text, $size, $bold) / 2), $y, $text, $size, $bold);
    }

    public function line(float $x1, float $y1, float $x2, float $y2, float $thickness = 0.4, array $rgb = [0, 0, 0]): void
    {
        [$r, $g, $b] = self::normalizeColor($rgb);

        $this->content .= sprintf(
            "q %.3F %.3F %.3F RG %.2F w %.2F %.2F m %.2F %.2F l S Q\n",
            $r,
            $g,
            $b,
            $thickness,
            $x1,
            $y1,
            $x2,
            $y2
        );
    }

    public function rect(float $x, float $y, float $w, float $h, array $rgb = [0, 0, 0]): void
    {
        [$r, $g, $b] = self::normalizeColor($rgb);

        $this->content .= sprintf(
            "q %.3F %.3F %.3F rg %.2F %.2F %.2F %.2F re f Q\n",
            $r,
            $g,
            $b,
            $x,
            $y,
            $w,
            $h
        );
    }

    /**
     * Lebar teks dalam satuan point.
     */
    public function textWidth(string $text, float $size = 9, bool $bold = false): float
    {
        $text = self::toWinAnsi($text);
        $table = $bold ? self::WIDTHS_BOLD : self::WIDTHS_REGULAR;
        $total = 0;

        $length = strlen($text);

        for ($i = 0; $i < $length; $i++) {
            $code = ord($text[$i]);
            $total += $table[$code - 32] ?? 556;
        }

        return ($total * $size) / 1000;
    }

    /**
     * Potong teks agar muat dalam lebar tertentu, menambahkan elipsis.
     */
    public function truncate(string $text, float $maxWidth, float $size = 9, bool $bold = false): string
    {
        $text = self::toWinAnsi($text);

        if ($this->textWidth($text, $size, $bold) <= $maxWidth) {
            return $text;
        }

        $ellipsis = '...';
        $ellipsisWidth = $this->textWidth($ellipsis, $size, $bold);

        $out = '';

        for ($i = 0; $i < strlen($text); $i++) {
            $candidate = $out.$text[$i];

            if ($this->textWidth($candidate, $size, $bold) + $ellipsisWidth > $maxWidth) {
                break;
            }

            $out = $candidate;
        }

        return rtrim($out).$ellipsis;
    }

    /**
     * Pecah teks menjadi beberapa baris sesuai lebar tersedia.
     *
     * @return array<int, string>
     */
    public function wrap(string $text, float $maxWidth, float $size = 9, bool $bold = false): array
    {
        $text = self::toWinAnsi($text);
        $words = preg_split('/\s+/', trim($text)) ?: [];
        $lines = [];
        $current = '';

        foreach ($words as $word) {
            $candidate = $current === '' ? $word : $current.' '.$word;

            if ($this->textWidth($candidate, $size, $bold) <= $maxWidth) {
                $current = $candidate;

                continue;
            }

            if ($current !== '') {
                $lines[] = $current;
                $current = '';
            }

            // Satu kata panjang melebihi lebar: dipotong paksa.
            while ($this->textWidth($word, $size, $bold) > $maxWidth) {
                $chunk = '';

                foreach (str_split($word) as $char) {
                    if ($this->textWidth($chunk.$char, $size, $bold) > $maxWidth) {
                        break;
                    }

                    $chunk .= $char;
                }

                if ($chunk === '') {
                    $chunk = $word[0];
                }

                $lines[] = $chunk;
                $word = substr($word, strlen($chunk));
            }

            $current = $word;
        }

        if ($current !== '') {
            $lines[] = $current;
        }

        return $lines === [] ? [''] : $lines;
    }

    /**
     * Tutup halaman sekarang dan mulai halaman baru dengan posisi cursor
     * baru. Dipanggil renderer saat tabel melewati batas bawah.
     *
     * @param  callable(\SimplePdfWriter): void  $drawHeader  isi header halaman baru
     */
    public function newPage(float $cursorY, callable $drawHeader): void
    {
        $this->flushPage();
        $this->cursorY = $cursorY;
        $drawHeader($this);
    }

    public function output(): string
    {
        if ($this->content !== '' || $this->pages === []) {
            $this->flushPage();
        }

        // Objek 1 = Catalog, 2 = Pages, 3 = Font F1, 4 = Font F2.
        // Halaman berikutnya mulai dari objek 5, berpasangan Page + Contents.
        $pageCount = count($this->pages);

        $kids = '';
        for ($i = 0; $i < $pageCount; $i++) {
            $kids .= (5 + ($i * 2)).' 0 R ';
        }

        $this->objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
        $this->objects[2] = '<< /Type /Pages /Kids ['.trim($kids).'] /Count '.$pageCount.' >>';
        $this->objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
        $this->objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

        return $this->assemble();
    }

    private function flushPage(): void
    {
        $this->pages[] = $this->content;
        $this->content = '';
    }

    private function assemble(): string
    {
        $pdf = '%PDF-1.4'."\n";
        $offsets = [];

        $maxObject = 4 + (count($this->pages) * 2);

        for ($n = 1; $n <= $maxObject; $n++) {
            if (isset($this->objects[$n])) {
                $body = $this->objects[$n];
            } elseif (($n - 5) % 2 === 0 && isset($this->pages[intdiv($n - 5, 2)])) {
                // Objek ganjil mulai dari 5 = halaman itu sendiri.
                $index = intdiv($n - 5, 2);
                $body = '<< /Type /Page /Parent 2 0 R'
                    .' /MediaBox [0 0 '.self::fmt($this->width).' '.self::fmt($this->height).']'
                    .' /Resources << /Font << /'.self::FONT_REGULAR.' 3 0 R /'.self::FONT_BOLD.' 4 0 R >> >>'
                    .' /Contents '.($n + 1).' 0 R >>';
            } elseif (($n - 5) % 2 === 1 && isset($this->pages[intdiv($n - 5, 2)])) {
                // Objek genap berikutnya = stream isi halaman.
                $body = $this->contentObject($n, intdiv($n - 5, 2));
            } else {
                continue;
            }

            $offsets[$n] = strlen($pdf);
            $pdf .= $n." 0 obj\n".$body."\nendobj\n";
        }

        $xrefOffset = strlen($pdf);
        $size = $maxObject + 1;

        $pdf .= "xref\n0 {$size}\n";
        $pdf .= "0000000000 65535 f \n";

        for ($n = 1; $n <= $maxObject; $n++) {
            $pdf .= isset($offsets[$n])
                ? sprintf("%010d 00000 n \n", $offsets[$n])
                // Objek yang tidak pernah ditulis tetap harus punya entri,
                // kalau tidak pembaca PDF menolak dokumennya.
                : "0000000000 65535 f \n";
        }

        $pdf .= "trailer\n<< /Size {$size} /Root 1 0 R >>\n";
        $pdf .= "startxref\n{$xrefOffset}\n%%EOF\n";

        return $pdf;
    }

    private function contentObject(int $number, int $pageIndex): string
    {
        $stream = $this->pages[$pageIndex];

        return '<< /Length '.strlen($stream)." >>\nstream\n".$stream."endstream";
    }

    private static function fmt(float $value): string
    {
        return rtrim(rtrim(number_format($value, 2, '.', ''), '0'), '.') ?: '0';
    }

    /**
     * @return array{0: float, 1: float, 2: float}
     */
    private static function normalizeColor(array $rgb): array
    {
        return [
            max(0, min(1, ($rgb[0] ?? 0) / 255)),
            max(0, min(1, ($rgb[1] ?? 0) / 255)),
            max(0, min(1, ($rgb[2] ?? 0) / 255)),
        ];
    }

    private static function escapeText(string $text): string
    {
        return str_replace(
            ['\\', '(', ')', "\r", "\n"],
            ['\\\\', '\\(', '\\)', ' ', ' '],
            $text
        );
    }

    /**
     * Ubah teks UTF-8 menjadi WinAnsi (Latin-1).
     *
     * Karakter di luar jangkauan diganti `?`. Emoji atau CJK di nama pelanggan
     * lebih baik tampil tanda tanya daripada membuat PDF gagal dibuka.
     */
    public static function toWinAnsi(string $text): string
    {
        if ($text === '') {
            return '';
        }

        // Jalur cepat: string ASCII tak perlu sentuhan lain.
        if (! preg_match('/[\x80-\xFF]/', $text)) {
            return $text;
        }

        if (function_exists('iconv')) {
            $converted = @iconv('UTF-8', 'Windows-1252//TRANSLIT', $text);

            if ($converted !== false) {
                return $converted;
            }

            $converted = @iconv('UTF-8', 'Windows-1252//IGNORE', $text);

            if ($converted !== false) {
                return $converted;
            }
        }

        $converted = @mb_convert_encoding($text, 'Windows-1252', 'UTF-8');

        if (is_string($converted) && $converted !== '') {
            return $converted;
        }

        $out = '';

        foreach (preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $char) {
            $out .= strlen($char) === 1 && ord($char) < 256 ? $char : '?';
        }

        return $out;
    }
}
