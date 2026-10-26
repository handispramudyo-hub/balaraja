import { useEffect, useId, useRef } from 'react';
import cn from '../../lib/cn';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Bottom sheet (mobile).
 *
 * Dipakai untuk aksi cepat, filter, dan pilihan yang tidak muat di layar
 * kecil. Di desktop (md+) sheet ini berubah jadi panel tengah agar tetap
 * masuk akal saat jendela lebar.
 */
export default function Sheet({
  open = true,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  className = '',
  panelClassName = '',
}) {
  const panelRef = useRef(null);
  const titleId = useId();

  // Sama seperti Modal: `onClose` sering berupa arrow function baru setiap
  // render. Menjadikannya dependensi effect membuat fokus input di dalam
  // sheet diambil ulang pada setiap ketikan.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = panel.querySelector(FOCUSABLE);
      if (target) target.focus();
    });

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[70] bg-black/45 backdrop-blur-[2px] flex items-end md:items-center md:justify-center',
        className
      )}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'w-full md:w-auto md:max-w-md rounded-t-2xl md:rounded-modal bg-surface-container-lowest',
          'border border-outline-variant shadow-overlay flex flex-col max-h-[88vh] overflow-hidden',
          panelClassName
        )}
      >
        <div className="pt-2 pb-1 md:hidden flex justify-center shrink-0" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-outline-variant" />
        </div>

        {(title || description) && (
          <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-3 border-b border-outline-variant/60 shrink-0">
            <div className="flex items-start gap-2.5 min-w-0">
              {icon && (
                <span className="material-symbols-outlined text-xl text-primary mt-0.5" aria-hidden="true">
                  {icon}
                </span>
              )}
              <div className="min-w-0">
                {title && (
                  <h2 id={titleId} className="text-base font-semibold text-on-surface truncate">
                    {title}
                  </h2>
                )}
                {description && (
                  <p className="text-xs text-on-surface-variant mt-0.5">{description}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                close
              </span>
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-outline-variant/60 px-4 py-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
