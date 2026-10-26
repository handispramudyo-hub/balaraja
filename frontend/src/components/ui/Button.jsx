import cn from '../../lib/cn';
import Icon from './Icon';

const VARIANTS = {
  primary: 'bg-primary text-on-primary hover:opacity-90 active:opacity-100',
  accent: 'bg-accent text-on-accent hover:opacity-90',
  secondary: 'bg-surface-container text-on-surface border border-outline-variant hover:bg-surface-container-high',
  outline: 'bg-transparent text-on-surface border border-outline-variant hover:bg-surface-container-low',
  ghost: 'bg-transparent text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
  danger: 'bg-danger text-white hover:opacity-90',
  dangerGhost: 'bg-transparent text-danger hover:bg-danger-container',
};

const SIZES = {
  xs: 'h-7 px-2.5 text-2xs gap-1 rounded-lg',
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-field',
  md: 'h-10 px-4 text-sm gap-2 rounded-field',
  lg: 'h-11 px-5 text-sm gap-2 rounded-field',
};

const ICON_SIZE = {
  xs: 'text-sm',
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-lg',
};

/**
 * Tombol utama aplikasi.
 *
 * `icon` menerima nama ikon Material Symbols. `loading` menampilkan spinner
 * dan menonaktifkan tombol supaya tidak terkirim dua kali.
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  filledIcon = false,
  loading = false,
  disabled = false,
  fullWidth = false,
  type = 'button',
  className = '',
  ...rest
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors select-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:opacity-50 disabled:pointer-events-none',
        VARIANTS[variant] ?? VARIANTS.primary,
        SIZES[size] ?? SIZES.md,
        fullWidth && 'w-full',
        className
      )}
      {...rest}
    >
      {loading ? (
        <span className="material-symbols-outlined animate-spin" aria-hidden="true">
          progress_activity
        </span>
      ) : (
        icon && <Icon name={icon} filled={filledIcon} className={ICON_SIZE[size] ?? ICON_SIZE.md} />
      )}
      {children && <span className="truncate">{children}</span>}
      {iconRight && !loading && (
        <Icon name={iconRight} className={ICON_SIZE[size] ?? ICON_SIZE.md} />
      )}
    </button>
  );
}
