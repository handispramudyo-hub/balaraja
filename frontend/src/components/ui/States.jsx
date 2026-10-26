import cn from '../../lib/cn';

/**
 * Placeholder saat data sedang dimuat.
 *
 * Pakai skeleton (bukan spinner) supaya layout tidak melompat saat data
 * tiba:placeholder punya tinggi yang mendekati isi sebenarnya.
 */
export function LoadingState({ message = 'Memuat data...', rows = 3, className = '' }) {
  return (
    <div className={cn('flex flex-col gap-3', className)} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{message}</span>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-16 rounded-card bg-surface-container animate-pulse"
          style={{ animationDelay: `${index * 120}ms` }}
        />
      ))}
    </div>
  );
}

/**
 * Tampilan gagal memuat.
 *
 * Pesan error mentah dari server tidak ditampilkan apa adanya: yang
 * ditampilkan adalah penjelasan yang bisa ditindaklanjuti, sementara
 * detail teknisnya tetap ada di log browser.
 */
export function ErrorState({ error, onRetry, title = 'Gagal memuat data', className = '' }) {
  const status = error?.response?.status;
  const detail =
    status === 404
      ? 'Data yang dibuka tidak ditemukan. Mungkin sudah dihapus.'
      : status === 403
        ? 'Anda tidak punya akses ke bagian ini.'
        : status
          ? `Server merespons dengan kesalahan (${status}).`
          : 'Periksa koneksi internet Anda lalu coba lagi.';

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center text-center gap-3 py-10 px-4 rounded-card',
        'bg-danger-container text-on-danger-container border border-danger/20',
        className
      )}
    >
      <span className="material-symbols-outlined text-[34px]" aria-hidden="true">
        cloud_off
      </span>
      <div>
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-xs opacity-85 mt-1 max-w-xs">{detail}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-2 h-9 px-4 rounded-field bg-danger text-white text-xs font-semibold hover:opacity-90 transition"
        >
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
            refresh
          </span>
          Coba Lagi
        </button>
      )}
    </div>
  );
}

/**
 * Keadaan kosong.
 *
 * `action` dipakai untuk memberi jalan keluar yang konkret (mis. tombol
 * "Tambah produk"), bukan sekadar memberi tahu tidak ada data.
 */
export function EmptyState({ icon = 'inbox', title = 'Belum ada data', description, action, className = '' }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center gap-3 py-10 px-4 rounded-card',
        'border border-dashed border-outline-variant bg-surface-container-low',
        className
      )}
    >
      <span className="material-symbols-outlined text-[34px] text-outline" aria-hidden="true">
        {icon}
      </span>
      <div>
        <p className="font-medium text-sm text-on-surface">{title}</p>
        {description && <p className="text-xs text-on-surface-variant mt-1 max-w-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}
