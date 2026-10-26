import cn from '../../lib/cn';
import { formatCurrency } from '../../lib/format';

/**
 * Nominal rupiah.
 *
 * `variant` mengatur penekanan visual:
 *   - `default`  teks biasa
 *   - `strong`   tebal, untuk total
 *   - `muted`    redup, untuk nominal yang belum jadioulder
 *   - `danger`   merah, untuk sisa piutang/utang
 */
export default function Money({ value, variant = 'default', className = '', showSymbol = true, ...rest }) {
  const amount = Number(value);
  const text = Number.isFinite(amount) ? formatCurrency(amount) : 'Rp0';

  return (
    <span
      className={cn(
        'tabular-nums whitespace-nowrap',
        variant === 'strong' && 'font-semibold text-on-surface',
        variant === 'muted' && 'text-on-surface-variant',
        variant === 'danger' && 'font-semibold text-danger',
        variant === 'success' && 'font-semibold text-success',
        variant === 'default' && 'text-on-surface',
        className
      )}
      {...rest}
    >
      {showSymbol ? text : text.replace('Rp', '')}
    </span>
  );
}
