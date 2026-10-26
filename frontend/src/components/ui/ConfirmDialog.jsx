import { useState } from 'react';
import Modal from './Modal';
import Button from './Button';

/**
 * Dialog konfirmasi.
 *
 * Menggantikan `window.confirm()` yang dipakai lama di beberapa halaman.
 * Bentuk dialog browser tidak konsisten antar browser, tidak bisa
 * diformat ulang, dan tidak bisa menampilkan pesan yang benar-benar
 * menjelaskan akibatnya.
 */
export default function ConfirmDialog({
  open = true,
  onClose,
  onConfirm,
  title = 'Konfirmasi',
  message,
  detail,
  confirmLabel = 'Hapus',
  cancelLabel = 'Batal',
  tone = 'danger',
  loading = false,
}) {
  const [error, setError] = useState(null);

  const handleConfirm = async () => {
    setError(null);
    try {
      await onConfirm?.();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Gagal memproses. Coba lagi.');
    }
  };

  if (!open) return null;

  return (
    <Modal
      onClose={loading ? undefined : onClose}
      title={title}
      variant="center"
      panelClassName="sm:max-w-sm"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={handleConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <span
          className={`material-symbols-outlined text-2xl shrink-0 ${
            tone === 'danger' ? 'text-danger' : 'text-primary'
          }`}
          aria-hidden="true"
        >
          {tone === 'danger' ? 'warning' : 'help'}
        </span>
        <div className="min-w-0">
          {message && <p className="text-sm text-on-surface">{message}</p>}
          {detail && <p className="text-xs text-on-surface-variant mt-1.5">{detail}</p>}
          {error && <p className="text-xs text-danger mt-2">{error}</p>}
        </div>
      </div>
    </Modal>
  );
}
