import cn from '../../lib/cn';

const BASE =
  'w-full h-10 rounded-field border bg-surface-container-lowest text-sm text-on-surface ' +
  'placeholder:text-on-surface-variant/60 px-3 transition-colors ' +
  'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 ' +
  'disabled:bg-surface-container disabled:text-on-surface-variant/60 disabled:cursor-not-allowed';

const STATE = {
  default: 'border-outline-variant',
  error: 'border-danger focus:border-danger focus:ring-danger/20',
  success: 'border-success focus:border-success focus:ring-success/20',
};

/** Input teks biasa dengan gaya yang sama di seluruh aplikasi. */
export default function Input({
  state = 'default',
  className = '',
  icon,
  suffix,
  invalid = false,
  ...rest
}) {
  const iconPadding = icon ? 'pl-9' : '';
  const suffixPadding = suffix ? 'pr-10' : '';

  return (
    <div className="relative w-full">
      {icon && (
        <span
          className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant pointer-events-none"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <input
        className={cn(BASE, STATE[invalid ? 'error' : state] ?? STATE.default, iconPadding, suffixPadding, className)}
        {...rest}
      />
      {suffix && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-xs">
          {suffix}
        </div>
      )}
    </div>
  );
}
