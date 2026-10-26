import { useEffect, useState } from 'react';
import cn from '../../lib/cn';
import { formatNumberCurrency } from '../../lib/format';

/**
 * Input nominal rupiah.
 *
 * Nilai yang dikembalikan ke pemanggil tetap angka (bukan string), sedangkan
 * yang ditampilkan memakai pemisah ribuan Indonesia. Selama field focused,
 * teks yang diketik tidak diformat ulang supaya caret tidak melompat; saat
 * blur angka diformat penuh.
 */
export default function MoneyInput({
  value,
  onChange,
  className = '',
  placeholder = '0',
  invalid = false,
  disabled = false,
  ...rest
}) {
  const format = (input) => (input === '' || input === null || input === undefined
    ? ''
    : formatNumberCurrency(input));

  const [text, setText] = useState(() => format(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);

  const handleChange = (event) => {
    const digits = event.target.value.replace(/\D/g, '');
    setText(digits === '' ? '' : Number(digits).toLocaleString('id-ID'));
    onChange?.(digits === '' ? '' : Number(digits));
  };

  const handleBlur = () => {
    setFocused(false);
    setText(format(value));
  };

  return (
    <div className="relative w-full">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant pointer-events-none">
        Rp
      </span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        className={cn(
          'w-full h-10 rounded-field border bg-surface-container-lowest pl-9 pr-3 text-sm',
          'tabular-nums text-on-surface transition-colors',
          'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
          'disabled:bg-surface-container disabled:text-on-surface-variant/60 disabled:cursor-not-allowed',
          invalid ? 'border-danger focus:border-danger focus:ring-danger/20' : 'border-outline-variant',
          className
        )}
        {...rest}
      />
    </div>
  );
}
