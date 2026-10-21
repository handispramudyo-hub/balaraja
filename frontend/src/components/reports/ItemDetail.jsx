import { formatCurrency, formatNumber } from '../../utils/format';

/**
 * Baris detail barang untuk satu transaksi.
 *
 * Satu komponen dipakai untuk tiga konteks sekaligus — tabel desktop, kartu
 * mobile, dan hasil cetak — supaya isi detail yang tampil di layar PERSIS
 * sama dengan yang keluar saat dicetak. Kalau ada dua markup terpisah,
 * cepat atau lambat keduanya akan berbeda.
 *
 * `variant="table"` dipakai di dalam tabel desktop/print, `variant="list"`
 * untuk kartu mobile yang sempit. Keduanya membaca data yang sama.
 *
 * Catatan: HPP/laba per item sengaja tidak ada di sini (keputusan laporan
 * penjualan/pembelian). Yang ditampilkan hanya kode, nama, satuan, qty,
 * harga, dan subtotal.
 */
export default function ItemDetail({
  items = [],
  variant = 'table',
  subtotalLabel = 'Subtotal',
  transactionTotal = null,
}) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];

  if (list.length === 0) {
    return (
      <p className="text-xs italic text-on-surface-variant/80 px-3 py-2">
        Detail barang tidak tersedia untuk transaksi ini.
      </p>
    );
  }

  // Qty dijumlah, bukan subtotal. Menggabungkannya jadi "total item" akan
  // salah kapur: satu transaksi 2 item x 3 = 6, bukan 5.
  const totalQty = list.reduce((s, it) => s + (Number(it.qty) || 0), 0);
  const totalSubtotal = list.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);

  // Rekonsiliasi: jumlah subtotal item harus sama dengan total header
  // transaksi. Kalau tidak sama, berarti ada nilai yang hilang di salah satu
  // sisi — dan itu justru hal yang paling harus terlihat oleh user.
  const expectedSubtotal = Number(transactionTotal);
  const mismatch =
    Number.isFinite(expectedSubtotal) &&
    expectedSubtotal !== 0 &&
    Math.abs(totalSubtotal - expectedSubtotal) > 0.5;

  if (variant === 'list') {
    return (
      <div className="border-t border-outline-variant/30 bg-surface-container-low/40 px-3.5 py-3">
        <ul className="flex flex-col gap-2.5">
          {list.map((it, i) => (
            <li key={`${it.kode}-${i}`} className="text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-on-surface truncate">
                    {it.nama}
                    {it.kode && <span className="text-on-surface-variant font-normal"> ({it.kode})</span>}
                  </p>
                  <p className="text-on-surface-variant mt-0.5">
                    {formatNumber(it.qty)} {it.satuan} &times; {formatCurrency(it.harga)}
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums text-on-surface">
                  {formatCurrency(it.subtotal)}
                </span>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-2.5 pt-2 border-t border-outline-variant/40 flex items-center justify-between text-xs">
          <span className="text-on-surface-variant">
            {formatNumber(totalQty)} item &middot; {list.length} baris
          </span>
          <span className="font-semibold tabular-nums text-on-surface">
            {subtotalLabel} {formatCurrency(totalSubtotal)}
          </span>
        </div>
        {mismatch && <ReconcileWarning total={totalSubtotal} expected={expectedSubtotal} />}
      </div>
    );
  }

  return (
    <div className="print-detail bg-surface-container-low/60 border-y border-outline-variant/30">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-on-surface-variant">
            <th scope="col" className="text-left font-medium py-1.5 pl-3 pr-2 w-24">Kode</th>
            <th scope="col" className="text-left font-medium py-1.5 px-2">Nama Barang</th>
            <th scope="col" className="text-left font-medium py-1.5 px-2 w-20">Satuan</th>
            <th scope="col" className="text-right font-medium py-1.5 px-2 w-20">Qty</th>
            <th scope="col" className="text-right font-medium py-1.5 px-2 w-28">Harga</th>
            <th scope="col" className="text-right font-medium py-1.5 pl-2 pr-3 w-28">Subtotal</th>
          </tr>
        </thead>
        <tbody className="text-on-surface">
          {list.map((it, i) => (
            <tr key={`${it.kode}-${i}`} className="border-t border-outline-variant/20">
              <td className="py-1.5 pl-3 pr-2 text-on-surface-variant tabular-nums">{it.kode}</td>
              <td className="py-1.5 px-2">{it.nama}</td>
              <td className="py-1.5 px-2 text-on-surface-variant">{it.satuan}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{formatNumber(it.qty)}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(it.harga)}</td>
              <td className="py-1.5 pl-2 pr-3 text-right font-medium tabular-nums">
                {formatCurrency(it.subtotal)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-outline-variant/40 font-semibold">
            <td colSpan="3" className="py-1.5 pl-3 pr-2 text-right text-on-surface-variant">
              {subtotalLabel}
            </td>
            <td className="py-1.5 px-2 text-right tabular-nums">{formatNumber(totalQty)}</td>
            <td className="py-1.5 px-2"></td>
            <td className="py-1.5 pl-2 pr-3 text-right tabular-nums">{formatCurrency(totalSubtotal)}</td>
          </tr>
        </tfoot>
      </table>
      {mismatch && <ReconcileWarning total={totalSubtotal} expected={expectedSubtotal} />}
    </div>
  );
}

/**
 * Peringatan rekonsiliasi.
 *
 * Muncul kalau jumlah subtotal detail tidak sama dengan total header transaksi.
 * Ini kondisi yang harus terlihat, bukan disembunyikan — kalau tidak, user
 * bisa saja menyimpan file yang angkanya tidak cocok.
 */
function ReconcileWarning({ total, expected }) {
  return (
    <p className="print-detail px-3 py-1.5 text-[11px] text-error-container bg-error-container/50">
      <span className="material-symbols-outlined text-[12px] align-text-bottom">warning</span>{' '}
      Rincian berjumlah {formatCurrency(total)}, tidak sama dengan total transaksi{' '}
      {formatCurrency(expected)}. Periksa transaksi ini.
    </p>
  );
}
