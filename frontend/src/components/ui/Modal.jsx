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

const OVERLAY = {
  sheet: 'fixed inset-0 bg-black/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center',
  center: 'fixed inset-0 bg-black/45 backdrop-blur-[2px] flex items-center justify-center',
};

const PANEL = {
  sheet:
    'w-full sm:w-auto sm:max-w-lg rounded-t-2xl sm:rounded-modal bg-surface-container-lowest ' +
    'border border-outline-variant shadow-overlay flex flex-col max-h-[92vh] sm:max-h-[85vh]',
  center:
    'w-full sm:w-auto sm:max-w-md rounded-modal bg-surface-container-lowest ' +
    'border border-outline-variant shadow-overlay flex flex-col max-h-[92vh]',
};

/**
 * Modal dialog.
 *
 * Perilaku yang dijaga: focus masuk ke panel saat dibuka, focus terkurung di
 * dalam panel (Tab tidak keluar), Escape menutup, dan fokus kembali ke
 * elemen pemicu saat ditutup.
 */
export default function Modal({
  onClose,
  title,
  subtitle,
  variant = 'sheet',
  zIndex = 60,
  panelClassName = '',
  className = '',
  bodyClassName = 'px-4 py-4',
  initialFocus,
  footer,
  children,
}) {
  const panelRef = useRef(null);
  const restoreRef = useRef(null);
  const titleId = useId();
  const subtitleId = useId();

  // `onClose` biasanya arrow function baru di setiap render induk. Kalau
  // effect bergantung padanya, effect akan berjalan ulang pada setiap
  // ketikan, mengembalikan fokus ke elemen pemicu, lalu memfokuskan elemen
  // pertama lagi - sehingga kursor lompat dan pengetikan terasa rusak.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    restoreRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.classList.add('overflow-hidden');

    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = (initialFocus && panel.querySelector(initialFocus)) || panel.querySelector(FOCUSABLE);
      if (target) target.focus();
    };

    const raf = requestAnimationFrame(focusFirst);

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const items = Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
      );
      if (items.length === 0) {
        event.preventDefault();
        return;
      }

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

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      document.documentElement.classList.remove('overflow-hidden');
      const restore = restoreRef.current;
      if (restore && typeof restore.focus === 'function' && document.body.contains(restore)) {
        restore.focus();
      }
    };
  }, [initialFocus]);

  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget) onCloseRef.current?.();
  };

  return (
    <div
      className={cn(OVERLAY[variant] ?? OVERLAY.sheet, className)}
      style={{ zIndex }}
      onClick={handleOverlayClick}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        className={cn(PANEL[variant] ?? PANEL.sheet, panelClassName)}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-outline-variant/60">
            <div className="min-w-0">
              {title && (
                <h2 id={titleId} className="text-base font-semibold text-on-surface truncate">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p id={subtitleId} className="text-xs text-on-surface-variant mt-0.5">
                  {subtitle}
                </p>
              )}
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

        {/* Tanpa judul visual, aria-labelledby harus tetap menunjuk elemen
            yang ada supaya dialog tetap terbaca screen reader. */}
        {!title && (
          <h2 id={titleId} className="sr-only">
            Dialog
          </h2>
        )}

        <div className={cn('min-h-0 flex-1 overflow-y-auto', bodyClassName)}>{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-outline-variant/60 px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
