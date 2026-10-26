import cn from '../../lib/cn';

const BASE =
  'w-full h-10 rounded-field border border-outline-variant bg-surface-container-lowest text-sm ' +
  'text-on-surface pl-3 pr-9 transition-colors appearance-none ' +
  'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 ' +
  'disabled:bg-surface-container disabled:text-on-surface-variant/60 disabled:cursor-not-allowed';

/**
 * Dropdown native yang diberi gaya.
 *
 * Memakai `<select>` asli supaya perilaku keyboard, layar sentuh, dan roda
 * gulir di mobile tetap sama dengan select bawaan sistem.
 */
export default function Select({ className = '', children, invalid = false, ...rest }) {
  return (
    <div className="relative w-full">
      <select
        className={cn(
          BASE,
          invalid && 'border-danger focus:border-danger focus:ring-danger/20',
          className
        )}
        {...rest}
      >
        {children}
      </select>
      <span
        className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant pointer-events-none"
        aria-hidden="true"
      >
        expand_more
      </span>
    </div>
  );
}
