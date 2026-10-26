/**
 * Gabungkan class name tanpa dependensi tambahan.
 *
 * Nilai falsy dibuang supaya Conditional class bisa ditulis inline:
 * `cn('btn', isActive && 'btn-active')`.
 */
export default function cn(...parts) {
  return parts
    .flat(Infinity)
    .filter((part) => typeof part === 'string' && part.trim() !== '')
    .join(' ');
}
