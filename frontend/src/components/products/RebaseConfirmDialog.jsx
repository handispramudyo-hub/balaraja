import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { formatCurrency, formatNumber } from '../../lib/format';

/**
 * Dialog konfirmasi pergantian satuan dasar.
 *
 * Isinya berasal dari endpoint `rebase-preview`, bukan dari perhitungan ulang
 * di sini. Alasannya angka yang dihitung client bisa berbeda dari server
 * (misal karena factor terpotong) dan user akan mengonfirmasi angka yang
 * berbeda dari yang benar-benar terjadi.
 *
 * Dialog ini adalah MOMEN yang mengubah angka stok yang sudah pernah muncul di
 * laporan, jadi tidak boleh berupa `window.confirm` satu baris: harga ikut
 * berubah, dan kedua sisi angka harusnya bisa dibandingkan.
 */
export default function RebaseConfirmDialog({ preview, loading, onConfirm, onCancel, pending }) {
  const confirmDisabled = loading || pending || !preview;

  const rows = preview
    ? [
        {
          label: 'Satuan dasar',
          value: (
            <>
              {preview.from} &rarr; <strong className="text-primary">{preview.to}</strong>
            </>
          ),
        },
        {
          label: 'Konversi',
          value: `1 ${preview.to} = ${formatNumber(preview.factor)} ${preview.from}`,
        },
        {
          label: 'Stok',
          value: (
            <>
              {formatNumber(preview.before)} {preview.from} &rarr;{' '}
              <strong className={preview.before === preview.after ? 'text-on-surface' : 'text-primary'}>
                {formatNumber(preview.after)} {preview.to}
              </strong>
            </>
          ),
        },
        ...(preview.min_stock_after !== undefined
          ? [
              {
                label: `Stok Minimum / ${preview.to}`,
                value: (
                  <>
                    {formatNumber(preview.min_stock_before ?? 0)} {preview.from} &rarr;{' '}
                    <strong>
                      {formatNumber(preview.min_stock_after ?? 0)} {preview.to}
                    </strong>
                  </>
                ),
              },
            ]
          : []),
        {
          label: `Harga Beli / ${preview.to}`,
          value: (
            <>
              {formatCurrency(preview.buy_price_before)} &rarr;{' '}
              <strong>{formatCurrency(preview.buy_price_after)}</strong>
            </>
          ),
        },
        {
          label: `Harga Jual / ${preview.to}`,
          value: (
            <>
              {formatCurrency(preview.sell_price_before)} &rarr;{' '}
              <strong>{formatCurrency(preview.sell_price_after)}</strong>
            </>
          ),
        },
      ]
    : [];

  return (
    <Modal
      onClose={onCancel}
      title="Konfirmasi perubahan satuan dasar"
      variant="center"
      zIndex={80}
      panelClassName="sm:max-w-md"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onCancel}>
            Batal
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={confirmDisabled}
            loading={pending}
          >
            Ganti Satuan Dasar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-2xl text-warning shrink-0" aria-hidden="true">
            warning
          </span>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-on-surface">Ganti satuan dasar produk ini?</p>
            <p className="text-xs text-on-surface-variant">
              Stok dan harga per satuan akan ditulis ulang. Angka stok lama tidak bisa
              dikembalikan tanpa adjustment baru.
            </p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-base animate-spin" aria-hidden="true">
              progress_activity
            </span>
            Menghitung dampaknya...
          </div>
        )}

        {preview && (
          <dl className="rounded-field divide-y divide-outline-variant/40 bg-surface-container text-sm overflow-hidden">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <dt className="text-on-surface-variant">{row.label}</dt>
                <dd className="text-on-surface text-right">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {preview?.factor === 1 && (
          <p className="rounded-field bg-warning-container border border-warning-fixed px-3 py-2.5 text-xs text-on-warning-container">
            Isi satuan bernilai <strong>1</strong>, jadi stok tidak berubah sama sekali - ini
            hanya memperbaiki nama satuan. Kalau maksudnya genuinely mengubah satuan, isi
            kolomnya dengan jumlah sebenarnya (misal 24) lalu buka lagi dialog ini.
          </p>
        )}

        {preview && preview.before > 0 && preview.after === 0 && (
          <p className="rounded-field bg-error-container border border-error/20 px-3 py-2.5 text-xs text-on-error-container">
            Hasil konversi membuat stok jadi nol padahal produk ini masih ada. Periksa lagi
            angka isinya sebelum melanjutkan.
          </p>
        )}

        {pending && (
          <Badge tone="info" size="sm" icon="progress_activity">
            Menyimpan perubahan satuan...
          </Badge>
        )}
      </div>
    </Modal>
  );
}
