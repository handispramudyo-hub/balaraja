import cn from '../../lib/cn';

/**
 * Kartu.
 *
 * Permukaan memakai border 1px, bukan shadow: shadow hanya dipakai untuk
 * lapisan yang benar-benar melayang (modal, drawer, dropdown).
 */
export function Card({ children, className = '', as: Tag = 'section', ...rest }) {
  return (
    <Tag
      className={cn(
        'rounded-card border border-outline-variant/70 bg-surface-container-lowest',
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Kepala kartu: judul, deskripsi, dan area aksi. */
export function CardHeader({ title, subtitle, actions, icon, className = '' }) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 border-b border-outline-variant/60 px-4 py-3',
        className
      )}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        {icon && (
          <span className="material-symbols-outlined text-lg text-primary mt-0.5" aria-hidden="true">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-on-surface truncate">{title}</h2>
          {subtitle && <p className="text-xs text-on-surface-variant mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
    </div>
  );
}

/** Isi kartu. */
export function CardBody({ children, className = '' }) {
  return <div className={cn('px-4 py-4', className)}>{children}</div>;
}

/** Kaki kartu. */
export function CardFooter({ children, className = '' }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-t border-outline-variant/60 px-4 py-3',
        className
      )}
    >
      {children}
    </div>
  );
}

export default Card;
