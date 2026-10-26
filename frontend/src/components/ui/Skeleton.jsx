import cn from '../../lib/cn';

/** Placeholder saat data sedang dimuat. */
export function Skeleton({ className = '' }) {
  return <div className={cn('rounded bg-surface-container-high animate-pulse', className)} />;
}

/** Several baris placeholder untuk tabel. */
export function SkeletonRows({ rows = 5, className = '' }) {
  return (
    <div className={cn('space-y-2.5', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Memuat data</span>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="h-3 w-3/5" />
          <Skeleton className="h-3 w-1/6 ml-auto" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder berbentuk kartu. */
export function SkeletonCards({ rows = 3, className = '' }) {
  return (
    <div className={cn('space-y-3', className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-card border border-outline-variant/60 bg-surface-container-lowest p-4 space-y-3">
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
