import Modal from '../ui/Modal';
import { formatCurrency, formatNumber } from '../../utils/format';

/**
 * Dialog konfirmasi pergantian satuan dasar.
 *
 * Isinya berasal dari endpoint `rebase-preview`, bukan dari perhitungan ulang
 * di sini. Alasannya angka yang dihitung client bisaseen berbeda dari server
 * (misal karena factor terpotong) dan user akan mengonfirmasi angka yang
 * berbeda dari yang benar-benar terjadi.
 *
 * Dialog ini adalah MOMEN yang mengubah angka stok yang sudah pernah muncul di
 * laporan, jadi tidak boleh berupa `window.confirm` satu baris: harga ikut
 * berubah, dan kedua sisi angka harusnya bisa dibandingkan.
 */
export default function RebaseConfirmDialog({ preview, loading, onConfirm, onCancel, pending }) {
  const confirmDisabled = loading || pending || !preview;

  return (
    <Modal
      onClose={onCancel}
      title="Konfirmasi perubahan satuan dasar"
      variant="center"
      zIndex={80}
      panelClassName="bg-surface w-full sm:max-w-md rounded-2xl shadow-xl overflow-hidden"
      initialFocus="button"
    >
      <div className="px-6 pt-5 pb-4 space-y-4">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-3xl text-warning shrink-0">warning</span>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-on-surface">
              Ganti satuan dasar produk ini?
            </h3>
            <p className="text-sm text-on-surface-variant">
              Stok dan harga per satuan akan ditulis ulang. Angka stok lama tidak bisa
              dikembalikan tanpa adjustment baru.
            </p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
            Menghitung dampaknya...
          </div>
        )}

        {preview && (
          <dl className="rounded-xl bg-surface-container-low divide-y divide-outline-variant/40 text-sm">
            <div className="flex items-center justify-between px-4 py-3">
              <dt className="text-on-surface-variant">Satuan dasar</dt>
              <dd className="font-medium text-on-surface">
                {preview.from} &rarr; <strong className="text-primary">{preview.to}</strong>
              </dd>
            </div>

            <div className="flex items-center justify-between px-4 py-3">
              <dt className="text-on-surface-variant">Konversi</dt>
              <dd className="text-on-surface">
                1 {preview.to} = {formatNumber(preview.factor)} {preview.from}
              </dd>
            </div>

            <div className="flex items-center justify-between px-4 py-3">
              <dt className="text-on-surface-variant">Stok</dt>
              <dd className="text-on-surface">
                {formatNumber(preview.before)} {preview.from} &rarr;{' '}
                <strong className={preview.before === preview.after ? 'text-on-surface' : 'text-primary'}>
                  {formatNumber(preview.after)} {preview.to}
                </strong>
              </dd>
            </div>

            {preview?.min_stock_after !== undefined && (
              <div className="flex items-center justify-between px-4 py-3">
                <dt className="text-on-surface-variant">Stok Minimum / {preview.to}</dt>
                <dd className="text-on-surface">
                  {formatNumber(preview.min_stock_before ?? 0)} {preview.from} &rarr;{' '}
                  <strong>
                    {formatNumber(preview.min_stock_after ?? 0)} {preview.to}
                  </strong>
                </dd>
              </div>
            )}

            <div className="flex items-center justify-between px-4 py-3">
              <dt className="text-on-surface-variant">Harga beli / {preview.to}</dt>
              <dd className="text-on-surface">
                {formatCurrency(preview.buy_price_before)} &rarr;{' '}
                <strong>{formatCurrency(preview.buy_price_after)}</strong>
              </dd>
            </div>

            <div className="flex items-center justify-between px-4 py-3">
              <dt className="text-on-surface-variant">Harga jual / {preview.to}</dt>
              <dd className="text-on-surface">
                {formatCurrency(preview.sell_price_before)} &rarr;{' '}
                <strong>{formatCurrency(preview.sell_price_after)}</strong>
              </dd>
            </div>
          </dl>
        )}

        {preview?.factor === 1 && (
          <p className="rounded-lg bg-warning-container border border-warning-fixed px-3 py-2.5 text-xs text-on-warning-container">
            Isi satuan bernilai <strong>1</strong>, jadi stok tidak berubah sama sekali - ini
            hanya memperbaiki nama satuan. Kalau maksudnya genuinely mengubah satuan, isi
            kolomnya dengan jumlah sebenarnya (misal 24) lalu buka lagi dialog ini.
          </p>
        )}

        {preview && preview.before > 0 && preview.after === 0 && (
          <p className="rounded-lg bg-error-container border border-error/20 px-3 py-2.5 text-xs text-on-error-container">
            Hasil konversi membuat stok jadi nol padahal produk ini masih ada. Periksa lagi
            angka isinya sebelum melanjutkan.
          </p>
        )}
      </div>

      <div className="sticky bottom-0 bg-surface border-t border-outline-variant/30 px-6 py-3 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-5 h-10 text-sm font-medium text-on-surface-variant hover:bg-surface-variant rounded-full transition-colors"
        >
          Batal
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmDisabled}
          className="px-5 h-10 text-sm font-medium text-on-primary bg-primary hover:bg-primary/90 rounded-full transition-colors disabled:opacity-50"
        >
          {pending ? 'Menyimpan...' : 'Ya, ganti satuan dasar'}
        </button>
      </div>
    </Modal>
  );
}
