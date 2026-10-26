import cn from '../../lib/cn';
import Icon from './Icon';

const TONES = {
  default: 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
  primary: 'text-primary hover:bg-primary-fixed',
  danger: 'text-danger hover:bg-danger-container',
  accent: 'text-accent hover:bg-accent-container',
  onPrimary: 'text-on-primary hover:bg-white/15',
};

const SIZES = {
  sm: 'w-8 h-8 rounded-lg',
  md: 'w-9 h-9 rounded-field',
  lg: 'w-10 h-10 rounded-field',
};

/**
 * Tombol ikon saja.
 *
 * Wajib menerima `label`: aria-label itu yang dibaca screen reader, jadi
 * tombol tanpa teks tetap harus menjelaskan dirinya.
 */
export default function IconButton({
  icon,
  label,
  filled = false,
  tone = 'default',
  size = 'md',
  className = '',
  ...rest
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center transition-colors shrink-0',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:opacity-40 disabled:pointer-events-none',
        SIZES[size] ?? SIZES.md,
        TONES[tone] ?? TONES.default,
        className
      )}
      {...rest}
    >
      <Icon name={icon} filled={filled} className="text-lg" />
    </button>
  );
}
