import { useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { NAV_SECTIONS, QUICK_ACTIONS } from '../../navigation/navConfig';
import { useTheme } from '../../lib/theme';
import useAuthStore from '../../stores/authStore';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Drawer navigasi mobile.
 *
 * Layar penuh dengan kisi ikon, bukan chip horizontal: chip lama membuat
 * sub-navigasi memanjang ke luar layar dan menyisakan ruang vertikal yang
 * sia-sia. Di sini semua tujuan terlihat tanpa harus digeser.
 */
export default function MobileNavDrawer({ open, onClose }) {
  const panelRef = useRef(null);
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const { isDark, toggleTheme } = useTheme();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const raf = requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector(FOCUSABLE);
      first?.focus();
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
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0
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

  const go = (to) => {
    onClose();
    navigate(to);
  };

  return (
    <div className="no-print fixed inset-0 z-[80] bg-surface flex flex-col">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu navigasi"
        className="flex flex-col h-full bg-surface"
      >
        <header className="shrink-0 h-16 px-4 flex items-center justify-between border-b border-outline-variant/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/bj.png" alt="" className="w-9 h-9 rounded-lg object-cover" />
            <div className="min-w-0">
              <p className="font-nota-display text-base leading-none text-on-surface">BALARAJA</p>
              <p className="text-[11px] text-on-surface-variant truncate mt-0.5">
                {user?.name || 'Administrator'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup menu"
            className="h-10 w-10 flex items-center justify-center rounded-field text-on-surface-variant hover:bg-surface-container"
          >
            <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
              close
            </span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          <section aria-label="Aksi cepat">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant/80 mb-2.5">
              Aksi Cepat
            </p>
            <div className="grid grid-cols-4 gap-2">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => go(action.to)}
                  className="flex flex-col items-center justify-center gap-1.5 min-h-[76px] rounded-card border border-outline-variant/70 bg-surface-container-lowest active:bg-surface-container transition-colors"
                >
                  <span className="material-symbols-outlined text-[24px] text-accent" aria-hidden="true">
                    {action.icon}
                  </span>
                  <span className="text-[11px] font-medium text-on-surface text-center leading-tight px-1">
                    {action.label}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {NAV_SECTIONS.map((section) => (
            <section key={section.id} className="mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant/80 mb-2.5">
                {section.label}
              </p>
              <ul className="grid grid-cols-3 gap-2">
                {section.items.map((item) => (
                  <li key={item.id}>
                    <NavLink
                      to={item.to}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `flex flex-col items-center justify-center gap-1.5 min-h-[84px] rounded-card border px-1 py-2 transition-colors ${
                          isActive
                            ? 'border-accent/40 bg-accent-soft text-accent'
                            : 'border-outline-variant/70 bg-surface-container-lowest text-on-surface active:bg-surface-container'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span
                            className="material-symbols-outlined text-[26px]"
                            aria-hidden="true"
                            style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                          >
                            {item.icon}
                          </span>
                          <span className="text-[11px] font-medium text-center leading-tight">
                            {item.label}
                          </span>
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="shrink-0 border-t border-outline-variant/60 px-4 py-3 flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-field border border-outline-variant/70 text-sm text-on-surface"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              {isDark ? 'light_mode' : 'dark_mode'}
            </span>
            {isDark ? 'Mode Terang' : 'Mode Gelap'}
          </button>
          <button
            type="button"
            onClick={() => go('/ubah-password')}
            className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-field border border-outline-variant/70 text-sm text-on-surface"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              lock
            </span>
            Sandi
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              logout();
              navigate('/login');
            }}
            className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-field border border-outline-variant/70 text-sm text-danger"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              logout
            </span>
            Keluar
          </button>
        </footer>
      </div>
    </div>
  );
}
