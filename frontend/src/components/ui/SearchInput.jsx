import cn from '../../lib/cn';

/**
 * Kolom pencarian.
 *
 * `onClear` dipanggil saat tombol silang ditekan; `hint` bisa menampilkan
 * shortcut (mis. "Ctrl+K") di dalam field.
 */
export default function SearchInput({
  value,
  onChange,
  placeholder = 'Cari...',
  hint,
  className = '',
  inputRef,
  onKeyDown,
  autoFocus = false,
  ...rest
}) {
  const hasValue = value !== undefined && value !== null && String(value).length > 0;

  return (
    <div className={cn('relative w-full', className)}>
      <span
        className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant pointer-events-none"
        aria-hidden="true"
      >
        search
      </span>
      <input
        ref={inputRef}
        type="search"
        value={value ?? ''}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(event) => onChange?.(event.target.value)}
        onKeyDown={onKeyDown}
        className={cn(
          'w-full h-10 rounded-field border border-outline-variant bg-surface-container-lowest',
          'pl-9 pr-20 text-sm text-on-surface placeholder:text-on-surface-variant/60 transition-colors',
          'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
          '[&::-webkit-search-cancel-button]:appearance-none'
        )}
        {...rest}
      />
      {hint && !hasValue && (
        <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center rounded border border-outline-variant bg-surface-container px-1.5 py-0.5 text-[10px] font-medium text-on-surface-variant">
          {hint}
        </kbd>
      )}
      {hasValue && (
        <button
          type="button"
          onClick={() => onChange?.('')}
          aria-label="Bersihkan pencarian"
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            close
          </span>
        </button>
      )}
    </div>
  );
}
