import { useState } from 'react';
import cn from '../../lib/cn';

/**
 * Tab navigasi.
 *
 * Tanpa `value`, komponen mengelola state sendiri. Dengan `value`, dipakai
 * sebagai controlled (dipakai halaman Pusat Kas yang butuh tab yang
 *ardtogonal dengan URL).
 */
export default function Tabs({ items, value, onChange, className = '', size = 'md', variant = 'underline' }) {
  const [internal, setInternal] = useState(items[0]?.key);
  const active = value ?? internal;

  const select = (key) => {
    if (value === undefined) setInternal(key);
    onChange?.(key);
  };

  const tabSize = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-2 text-sm';

  if (variant === 'pill') {
    return (
      <div
        role="tablist"
        className={cn('inline-flex items-center gap-1 rounded-field bg-surface-container p-1', className)}
      >
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active === item.key}
            onClick={() => select(item.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors',
              tabSize,
              active === item.key
                ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            )}
          >
            {item.icon && (
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                {item.icon}
              </span>
            )}
            {item.label}
            {item.badge != null && (
              <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-on-accent">
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div role="tablist" className={cn('flex items-center gap-1 overflow-x-auto hide-scrollbar', className)}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={active === item.key}
          onClick={() => select(item.key)}
          className={cn(
            'inline-flex items-center gap-1.5 font-medium whitespace-nowrap border-b-2 transition-colors',
            tabSize,
            active === item.key
              ? 'border-primary text-primary'
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          )}
        >
          {item.icon && (
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              {item.icon}
            </span>
          )}
          {item.label}
          {item.badge != null && (
            <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-on-accent">
              {item.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
