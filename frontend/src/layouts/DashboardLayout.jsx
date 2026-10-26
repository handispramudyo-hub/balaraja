import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import DesktopSidebar from '../components/navigation/DesktopSidebar';
import MobileTabBar from '../components/navigation/MobileTabBar';
import MobileNavDrawer from '../components/navigation/MobileNavDrawer';
import QuickAddSheet from '../components/navigation/QuickAddSheet';
import CommandPalette from '../components/navigation/CommandPalette';
import { resolvePageTitle, resolveBackTarget } from '../navigation/navConfig';
import { useTheme } from '../lib/theme';

/**
 * Shell aplikasi.
 *
 * Desktop: sidebar tetap + bar atas berisi pencarian, aksi cepat, tema, dan
 * menu akun.
 *
 * Mobile: tanpa sidebar. Navigasi utama lewat tab bar bawah, dan seluruh
 * menu ada di drawer layar penuh. Sub-nav chip horizontal dihapus karena
 * memakai ruang vertikal yang mahal dan menyisakan dua baris navigasi
 * sekaligus di layar kecil.
 */
export default function DashboardLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { isDark, toggleTheme } = useTheme();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [openMenuFor, setOpenMenuFor] = useState(null);
  const showUserMenu = openMenuFor === pathname;
  const menuRef = useRef(null);
  const avatarRef = useRef(null);
  const firstItemRef = useRef(null);

  const closeMenu = useCallback(() => setOpenMenuFor(null), []);
  const pageTitle = resolvePageTitle(pathname);
  const backTarget = resolveBackTarget(pathname);

  // Ctrl/Cmd + K membuka pencarian global dari mana saja.
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!showUserMenu) return undefined;

    firstItemRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
        avatarRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = menuRef.current?.querySelectorAll('[role="menuitem"]');
      if (!items || items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showUserMenu, closeMenu]);

  const handleLogout = () => {
    setOpenMenuFor(null);
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#konten-utama"
        className="no-print sr-only focus:not-sr-only focus:absolute focus:z-[95] focus:top-2 focus:left-2 focus:bg-primary focus:text-on-primary focus:px-4 focus:py-2 focus:rounded-field focus:text-sm focus:font-medium"
      >
        Lewati ke konten utama
      </a>

      <DesktopSidebar user={user} />

      {/* Bar atas */}
      <header className="no-print sticky top-0 z-40 h-16 bg-surface border-b border-outline-variant/60 flex items-center gap-2 px-3 md:px-5 md:pl-[calc(17rem+1.25rem)]">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Buka menu navigasi"
          className="md:hidden h-11 w-11 -ml-1 flex items-center justify-center rounded-field text-on-surface hover:bg-surface-container"
        >
          <span className="material-symbols-outlined text-[24px]" aria-hidden="true">
            menu
          </span>
        </button>

        {backTarget ? (
          <button
            type="button"
            onClick={() => navigate(backTarget)}
            aria-label="Kembali"
            className="h-11 w-11 -ml-1 flex items-center justify-center rounded-field text-on-surface hover:bg-surface-container"
          >
            <span className="material-symbols-outlined text-[24px]" aria-hidden="true">
              arrow_back
            </span>
          </button>
        ) : (
          <div className="md:hidden flex items-center gap-2 min-w-0">
            <img src="/bj.png" alt="" className="w-8 h-8 rounded-lg object-cover" />
          </div>
        )}

        <h1 className="min-w-0 flex-1 truncate text-sm md:text-base font-semibold text-on-surface">
          <span className="md:hidden">{pageTitle}</span>
          <span className="hidden md:inline">{pageTitle}</span>
        </h1>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label="Cari (Ctrl+K)"
          className="hidden sm:flex items-center gap-2 h-10 pl-3 pr-2 rounded-field border border-outline-variant bg-surface-container-low text-sm text-on-surface-variant hover:bg-surface-container transition-colors min-w-[220px]"
        >
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
            search
          </span>
          <span className="flex-1 text-left">Cari…</span>
          <kbd className="hidden lg:inline text-[10px] border border-outline-variant rounded px-1.5 py-0.5">Ctrl K</kbd>
        </button>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label="Cari"
          className="sm:hidden h-11 w-11 flex items-center justify-center rounded-field text-on-surface hover:bg-surface-container"
        >
          <span className="material-symbols-outlined text-[24px]" aria-hidden="true">
            search
          </span>
        </button>

        <button
          type="button"
          onClick={() => setQuickOpen(true)}
          aria-label="Aksi cepat"
          className="hidden md:inline-flex h-10 items-center gap-2 px-3 rounded-field bg-accent text-on-accent text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
            bolt
          </span>
          Aksi Cepat
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
          className="hidden sm:inline-flex h-10 w-10 items-center justify-center rounded-field text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
            {isDark ? 'light_mode' : 'dark_mode'}
          </span>
        </button>

        <div className="relative">
          <button
            ref={avatarRef}
            type="button"
            onClick={() => setOpenMenuFor(showUserMenu ? null : pathname)}
            aria-haspopup="menu"
            aria-expanded={showUserMenu}
            aria-controls="user-menu"
            aria-label={`Menu akun ${user?.name || 'Admin'}`}
            className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-on-primary font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            {user?.name?.charAt(0)?.toUpperCase() || 'A'}
          </button>

          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={closeMenu} aria-hidden="true" />
              <div
                ref={menuRef}
                id="user-menu"
                role="menu"
                aria-label="Menu akun"
                className="absolute right-0 top-12 w-60 rounded-card bg-surface-container-lowest shadow-overlay border border-outline-variant overflow-hidden z-50"
              >
                <div className="px-4 py-3 border-b border-outline-variant/60">
                  <p className="text-sm font-medium text-on-surface truncate">{user?.name || 'Admin'}</p>
                  <p className="text-xs text-on-surface-variant truncate">{user?.email || 'admin@balaraja.com'}</p>
                </div>
                <button
                  ref={firstItemRef}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    navigate('/ubah-password');
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-on-surface hover:bg-surface-container transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                    lock
                  </span>
                  Ubah Kata Sandi
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={toggleTheme}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-on-surface hover:bg-surface-container transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                    {isDark ? 'light_mode' : 'dark_mode'}
                  </span>
                  {isDark ? 'Mode Terang' : 'Mode Gelap'}
                </button>
                <div className="h-px bg-outline-variant/60" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-danger hover:bg-danger-container/40 transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                    logout
                  </span>
                  Keluar
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Konten */}
      <main
        id="konten-utama"
        tabIndex={-1}
        className="main-content-desktop outline-none"
      >
        <div className="mx-auto w-full max-w-[1100px] px-4 py-4 md:py-6">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-24 text-on-surface-variant">
                <span className="material-symbols-outlined animate-spin text-3xl" aria-hidden="true">
                  progress_activity
                </span>
                <span className="sr-only">Memuat halaman</span>
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </main>

      {/* Navigasi mobile */}
      <MobileTabBar pathname={pathname} />

      {/* Tombol aksi cepat (FAB) */}
      <button
        type="button"
        onClick={() => setQuickOpen(true)}
        aria-label="Aksi cepat"
        className="no-print md:hidden fixed right-4 z-50 h-14 w-14 rounded-full bg-accent text-on-accent shadow-overlay flex items-center justify-center active:scale-95 transition-transform"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)' }}
      >
        <span className="material-symbols-outlined text-[26px]" aria-hidden="true">
          add
        </span>
      </button>

      <MobileNavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <QuickAddSheet open={quickOpen} onClose={() => setQuickOpen(false)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
