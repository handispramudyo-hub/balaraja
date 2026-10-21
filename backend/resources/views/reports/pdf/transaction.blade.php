{{-- PDF laporan transaksi: format GROUPED per transaksi.
     Data sudah_INCLUDE semua field dari ReportQueryService, jadi tidak ada
     query di view ini — view murni presentation. --}}
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <title>{{ $meta['title'] }}</title>
    <style>
        /* DejaVu Sans dipakai karena font bawaan dompdf (Helvetica) tidak
           punya glyph lengkap untuk karakter Indonesia. */
        * { font-family: "DejaVu Sans", sans-serif; }
        body { font-size: 9px; color: #111827; margin: 0; }
        h1 { font-size: 14px; margin: 0 0 2px; }
        .muted { color: #6b7280; }
        .meta { font-size: 8px; color: #374151; margin-bottom: 6px; }
        .meta span { margin-right: 10px; }

        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #d1d5db; padding: 3px 4px; vertical-align: top; }
        th { background: #e5e7eb; text-align: left; font-weight: bold; }

        .num { text-align: right; white-space: nowrap; }
        .center { text-align: center; }

        .kartu { margin-bottom: 7px; page-break-inside: avoid; }
        .kartu-head { background: #f3f4f6; padding: 4px 5px; font-size: 8.5px; }
        .kartu-head .no { font-weight: bold; font-size: 9.5px; }
        .items { background: #ffffff; }
        .items th { font-size: 7.5px; background: #fafafa; }
        .items td { font-size: 8px; }
        .items tfoot td { font-weight: bold; background: #f9fafb; }

        .total-row td { background: #e5e7eb; font-weight: bold; }

        .ringkas { margin-bottom: 8px; }
        .ringkas table { font-size: 8.5px; }
    </style>
</head>
<body>

    <h1>{{ $meta['title'] }}</h1>
    <div class="meta">
        <span>Periode: {{ $meta['periode'] }}</span>
        @if (!empty($meta['filters']))
            <span>Filter: {{ implode(' | ', $meta['filters']) }}</span>
        @endif
        <span>Dicetak: {{ \Illuminate\Support\Carbon::parse($meta['generated_at'])->format('d/m/Y H:i') }}</span>
    </div>

    {{-- Ringkasan total, selalu dicetak supaya angka kunci terlihat tanpa
         harus menggulir halaman. --}}
    <div class="ringkas">
        <table>
            <tr>
                @foreach ($summary as $key => $value)
                    <th style="width:{{ 100 / max(count($summary), 1) }}%">{{ $key }}</th>
                @endforeach
            </tr>
            <tr>
                @foreach ($summary as $value)
                    <td class="num">{{ is_numeric($value) ? number_format((float) $value, 0, ',', '.') : $value }}</td>
                @endforeach
            </tr>
        </table>
    </div>

    @if (count($rows) === 0)
        <p class="muted">Tidak ada data pada periode ini.</p>
    @endif

    {{-- Normalisasi bentuk data: laporan penjualan/pembelian punya `items`
         langsung per transaksi, laporan piutang punya `detail` (daftar
         penjualan per pelanggan) yang masing-masing punya `items`.
         Disini keduanya diratakan jadi satu daftar "transaksi" supaya tabel
         PDF tidak perlu dua kali kode. --}}
    @php
        $transaksi = [];
        foreach ($rows as $row) {
            if (!empty($row['detail'])) {
                foreach ($row['detail'] as $d) {
                    $transaksi[] = [
                        'no' => $d['no_transaksi'] ?? ('#'.$d['id']),
                        'tanggal' => $d['tanggal'] ?? null,
                        'nama' => $row['nama_toko'] ?? '-',
                        'total' => (float) ($d['total'] ?? 0),
                        'items' => $d['items'] ?? [],
                        'sisa' => (float) ($d['sisa_piutang'] ?? 0),
                    ];
                }
            } else {
                $transaksi[] = [
                    'no' => $row['no_transaksi'] ?? $row['no_pembelian'] ?? ('#'.$row['id']),
                    'tanggal' => $row['tanggal'] ?? null,
                    'nama' => $row['nama_toko'] ?? $row['nama_supplier'] ?? '-',
                    'total' => (float) ($row['total'] ?? $row['total_transaksi'] ?? 0),
                    'items' => $row['items'] ?? [],
                    'sisa' => (float) ($row['sisa_piutang'] ?? 0),
                ];
            }
        }
    @endphp

    @foreach ($transaksi as $trx)
        <div class="kartu">
            <div class="kartu-head">
                <span class="no">{{ $trx['no'] }}</span>
                &nbsp;&middot;&nbsp;
                {{ $trx['tanggal'] instanceof \Illuminate\Support\Carbon
                    ? $trx['tanggal']->format('d/m/Y') : ($trx['tanggal'] ?? '-') }}
                &nbsp;&middot;&nbsp;{{ $partyLabel }}: {{ $trx['nama'] }}
                @if ($kind === 'receivables')
                    <span style="float:right;">Sisa: {{ number_format($trx['sisa'], 0, ',', '.') }}</span>
                @else
                    <span style="float:right; font-weight:bold;">
                        Total: {{ number_format($trx['total'], 0, ',', '.') }}
                    </span>
                @endif
            </div>

            @if (!empty($trx['items']))
                <table class="items">
                    <thead>
                        <tr>
                            <th style="width:12%">Kode</th>
                            <th>Nama Barang</th>
                            <th style="width:10%">Satuan</th>
                            <th style="width:8%" class="num">Qty</th>
                            <th style="width:14%" class="num">Harga</th>
                            <th style="width:15%" class="num">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        @foreach ($trx['items'] as $item)
                            <tr>
                                <td>{{ $item['kode'] }}</td>
                                <td>{{ $item['nama'] }}</td>
                                <td>{{ $item['satuan'] }}</td>
                                <td class="num">{{ rtrim(rtrim(number_format((float) $item['qty'], 0, ',', '.'), '0'), ',') }}</td>
                                <td class="num">{{ number_format((float) $item['harga'], 0, ',', '.') }}</td>
                                <td class="num">{{ number_format((float) $item['subtotal'], 0, ',', '.') }}</td>
                            </tr>
                        @endforeach
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="5" class="num">Subtotal</td>
                            <td class="num">{{ number_format(array_sum(array_map(fn ($i) => (float) $i['subtotal'], $trx['items'])), 0, ',', '.') }}</td>
                        </tr>
                    </tfoot>
                </table>
            @else
                <p class="muted" style="padding:4px 5px; margin:0;">Rincian barang tidak tersedia.</p>
            @endif
        </div>
    @endforeach

</body>
</html>
