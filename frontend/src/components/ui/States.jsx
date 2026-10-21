export function LoadingState({ message = 'Memuat data...', rows = 3 }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{message}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-16 rounded-xl bg-surface-container animate-pulse"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Gagal memuat data' }) {
  const detail =
    error?.response?.status
      ? `Server merespons dengan kesalahan (${error.response.status}).`
      : 'Periksa koneksi internet Anda lalu coba lagi.';

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center text-center gap-3 py-10 px-4 rounded-xl bg-error-container text-on-error-container"
    >
      <span className="material-symbols-outlined text-[36px]">cloud_off</span>
      <div>
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-xs opacity-80 mt-1 max-w-xs">{detail}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-error text-on-error text-xs font-semibold hover:opacity-90 active:scale-95 transition"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          Coba Lagi
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon = 'inbox', title = 'Belum ada data', description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 py-10 px-4 rounded-xl border border-dashed border-outline-variant">
      <span className="material-symbols-outlined text-[36px] text-outline">{icon}</span>
      <div>
        <p className="font-medium text-sm text-on-surface">{title}</p>
        {description && <p className="text-xs text-on-surface-variant mt-1 max-w-xs">{description}</p>}
      </div>
      {action}
    </div>
  );
}
