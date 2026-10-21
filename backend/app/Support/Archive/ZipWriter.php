<?php

namespace App\Support\Archive;

/**
 * Penulis arsip ZIP tanpa ekstensi `zip`.
 *
 * Shared hosting BALARAJA tidak punya ekstensi `zip` maupun `phar`, jadi
 * `\ZipArchive` dan `PharData` tidak bisa dipakai. Tapi `xlsx` pada hakikatnya
 * hanya ZIP berisi handful file XML, dan semua primitif yang dibutuhkan ada di
 * core PHP: `gzdeflate()` (ext-zlib) untuk kompresi dan `crc32()` untuk checksum.
 *
 * Yang ditulis di sini adalah subset ZIP yang memang dibaca Excel:
 *  - metode 8 (deflate) kalau `gzdeflate` tersedia, metode 0 (store) kalau tidak
 *  - UTF-8 flag (bit 11) supaya nama file non-ASCII aman
 *
 * Timestamp dic purposefullykan supaya output deterministik: dua export dengan
 * data sama menghasilkan byte sama, sehingga bisa di-cache dan dibandingkan
 * di test.
 */
class ZipWriter
{
    /** 2026-01-01 00:00:00 dalam format DOS time/date. */
    private const DOS_TIME = 0x0000;
    private const DOS_DATE = 0x5C21;

    /** @var array<int, array{name: string, offset: int}> */
    private array $entries = [];

    private string $body = '';

    /** True kalau `gzdeflate` ada dan layak dipakai. */
    private bool $canDeflate;

    public function __construct()
    {
        $this->canDeflate = function_exists('gzdeflate');
    }

    /**
     * Tambahkan satu file ke arsip.
     *
     * @param  string  $name  path internal, mis. `xl/workbook.xml`
     * @param  string  $contents  isi file
     */
    public function add(string $name, string $contents): void
    {
        $crc = crc32($contents);
        $uncompressedSize = strlen($contents);

        // `gzdeflate` menghasilkan raw deflate (tanpa header zlib), persis
        // yang dipakai ZIP metode 8. Kalau hasilnya lebih besar dari data
        // mentah (mis. data sangat repetitif tapi pendek), pakai store saja.
        $deflated = $this->canDeflate ? gzdeflate($contents, 6) : false;

        if ($deflated !== false && strlen($deflated) < $uncompressedSize) {
            $method = 8;
            $payload = $deflated;
        } else {
            $method = 0;
            $payload = $contents;
        }

        $offset = strlen($this->body);
        $nameBytes = $name;

        $this->body .= $this->localHeader($nameBytes, $method, $crc, strlen($payload), $uncompressedSize);
        $this->body .= $payload;

        $this->entries[] = [
            'name' => $nameBytes,
            'offset' => $offset,
            'method' => $method,
            'crc' => $crc,
            'compressed_size' => strlen($payload),
            'uncompressed_size' => $uncompressedSize,
        ];
    }

    /**
     * Susun byte ZIP final: local headers + central directory + EOCD.
     */
    public function output(): string
    {
        $central = '';
        $offset = strlen($this->body);

        foreach ($this->entries as $entry) {
            $central .= $this->centralHeader($entry);
        }

        $count = count($this->entries);

        $eocd = pack('V', 0x06054B50)      // signature EOCD
            .pack('v', 0)                  // nomor disk
            .pack('v', 0)                  // disk dengan central directory
            .pack('v', $count)             // entri di disk ini
            .pack('v', $count)             // total entri
            .pack('V', strlen($central))   // ukuran central directory
            .pack('V', $offset)            // offset awal central directory
            .pack('v', 0);                 // panjang komentar

        return $this->body.$central.$eocd;
    }

    /**
     * @param  array{name: string, offset: int, method: int, crc: int, compressed_size: int, uncompressed_size: int}  $entry
     */
    private function centralHeader(array $entry): string
    {
        return pack('V', 0x02014B50)      // signature central directory
            .pack('v', 0x031E)             // version made by: UNIX, spec 3.0
            .pack('v', 20)                 // version needed
            .pack('v', 0x0800)             // flags: nama file UTF-8
            .pack('v', $entry['method'])
            .pack('v', self::DOS_TIME)
            .pack('v', self::DOS_DATE)
            .pack('V', $entry['crc'])
            .pack('V', $entry['compressed_size'])
            .pack('V', $entry['uncompressed_size'])
            .pack('v', strlen($entry['name']))
            .pack('v', 0)                  // extra field length
            .pack('v', 0)                  // comment length
            .pack('v', 0)                  // disk number start
            .pack('v', 0)                  // internal attributes
            .pack('V', 0x81A40000)         // external attributes: -rw-r--r--
            .pack('V', $entry['offset'])
            .$entry['name'];
    }

    private function localHeader(string $name, int $method, int $crc, int $compressedSize, int $uncompressedSize): string
    {
        return pack('V', 0x04034B50)      // signature local file header
            .pack('v', 20)                 // version needed
            .pack('v', 0x0800)             // flags: nama file UTF-8
            .pack('v', $method)
            .pack('v', self::DOS_TIME)
            .pack('v', self::DOS_DATE)
            .pack('V', $crc)
            .pack('V', $compressedSize)
            .pack('V', $uncompressedSize)
            .pack('v', strlen($name))
            .pack('v', 0)                  // extra field length
            .$name;
    }
}
