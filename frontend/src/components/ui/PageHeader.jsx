import { Link } from 'react-router-dom';
import cn from '../../lib/cn';

/**
 * Kepala halaman.
 *
 * Menampilkan remah roti (desktop), judul, subjudul, dan area aksi. Semua
 * halaman baru memakai komponen ini supaya jarak antar bagian seragam.
 */
export default function PageHeader({
  title,
  subtitle,
  breadcrumbs = [],
  actions,
  className = '',
}) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {breadcrumbs.length > 0 && (
        <nav aria-label="Remah roti" className="hidden md:block">
          <ol className="flex items-center gap-1 text-xs text-on-surface-variant">
            {breadcrumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 && (
                  <span className="material-symbols-outlined text-sm opacity-60" aria-hidden="true">
                    chevron_right
                  </span>
                )}
                {crumb.to ? (
                  <Link to={crumb.to} className="hover:text-primary transition-colors">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-on-surface font-medium">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg md:text-xl font-semibold text-on-surface truncate">{title}</h1>
          {subtitle && <p className="text-xs md:text-sm text-on-surface-variant mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
