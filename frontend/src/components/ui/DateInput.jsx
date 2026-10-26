import cn from '../../lib/cn';

/**
 * Input tanggal.
 *
 * Memakai `<input type="date">` native: di HP hasilnya bisa langsung membuka
 * kalender sistem, dan nilainya selalu format YYYY-MM-DD yang dipahami API.
 */
export default function DateInput({
  className = '',
  invalid = false,
  disabled = false,
  onChange,
  ...rest
}) {
  return (
    <div className="relative w-full">
      <input
        type="date"
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
        className={cn(
          'w-full h-10 rounded-field border bg-surface-container-lowest pl-9 pr-3 text-sm',
          'text-on-surface transition-colors tabular-nums',
          'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
          'disabled:bg-surface-container disabled:text-on-surface-variant/60 disabled:cursor-not-allowed',
          invalid ? 'border-danger focus:border-danger focus:ring-danger/20' : 'border-outline-variant',
          className
        )}
        {...rest}
      />
      <span
        className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant pointer-events-none"
        aria-hidden="true"
      >
        calendar_today
      </span>
    </div>
  );
}
