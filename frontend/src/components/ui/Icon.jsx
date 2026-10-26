import cn from '../../lib/cn';

/**
 * Ikon Material Symbols.
 *
 * `filled` memakai sumbu FILL (ikon solid) — dipakai untuk state aktif.
 */
export default function Icon({ name, filled = false, className = '', size, ...rest }) {
  if (!name) return null;

  return (
    <span
      aria-hidden="true"
      className={cn('material-symbols-outlined leading-none', filled && 'fill', className)}
      style={size ? { fontSize: size } : undefined}
      {...rest}
    >
      {name}
    </span>
  );
}
