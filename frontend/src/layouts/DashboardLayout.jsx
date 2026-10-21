import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../stores/authStore';

const navGroups = [
  {
    title: null,
    items: [
      { label: 'Dashboard', icon: 'home', to: '/' },
    ],
  },
  {
    title: 'Master Data',
    items: [
      { label: 'Produk', icon: 'inventory_2', to: '/produk' },
      { label: 'Kategori', icon: 'category', to: '/kategori' },
      { label: 'Supplier', icon: 'local_shipping', to: '/supplier' },
      { label: 'Toko', icon: 'store', to: '/toko' },
    ],
  },
  {
    title: 'Transaksi',
    items: [
      { label: 'Pembelian', icon: 'add_shopping_cart', to: '/pembelian' },
      { label: 'Penjualan', icon: 'point_of_sale', to: '/penjualan' },
      { label: 'Pembayaran', icon: 'payments', to: '/pembayaran' },
      { label: 'Pelunasan Utang', icon: 'local_shipping', to: '/pelunasan-utang' },
      { label: 'Jadwal Angsuran', icon: 'calendar_month', to: '/angsuran' },
      { label: 'Biaya', icon: 'receipt_long', to: '/biaya' },
    ],
  },
  {
    title: 'Keuangan',
    items: [
      { label: 'Piutang', icon: 'account_balance_wallet', to: '/piutang' },
      { label: 'Utang', icon: 'price_change', to: '/pelunasan-utang' },
      { label: 'Laba & Rugi', icon: 'trending_up', to: '/laba-rugi' },
    ],
  },
  {
    title: 'Laporan',
    items: [
      { label: 'Stok', icon: 'inventory', to: '/laporan/stok' },
      { label: 'Pembelian', icon: 'description', to: '/laporan/pembelian' },
      { label: 'Penjualan', icon: 'description', to: '/laporan/penjualan' },
      { label: 'Pengeluaran', icon: 'description', to: '/laporan/pengeluaran' },
    ],
  },
];

const bottomNavTabs = [
  { label: 'Beranda', icon: 'home', to: '/', match: ['/'] },
  { label: 'Master', icon: 'inventory_2', to: '/produk', match: ['/produk', '/kategori', '/supplier', '/toko'] },
  { label: 'Transaksi', icon: 'receipt_long', to: '/pembelian', match: ['/pembelian', '/penjualan', '/pembayaran', '/pelunasan-utang', '/angsuran', '/biaya'] },
  { label: 'Keuangan', icon: 'payments', to: '/piutang', match: ['/piutang', '/laba-rugi'] },
  { label: 'Laporan', icon: 'assessment', to: '/laporan/stok', match: ['/laporan/stok', '/laporan/pembelian', '/laporan/penjualan', '/laporan/pengeluaran'] },
];

const subNavItems = {
  Master: [
    { label: 'Produk', to: '/produk' },
    { label: 'Kategori', to: '/kategori' },
    { label: 'Supplier', to: '/supplier' },
    { label: 'Toko', to: '/toko' },
  ],
  Transaksi: [
    { label: 'Pembelian', to: '/pembelian' },
    { label: 'Penjualan', to: '/penjualan' },
    { label: 'Pembayaran', to: '/pembayaran' },
    { label: 'Pelunasan', to: '/pelunasan-utang' },
    { label: 'Angsuran', to: '/angsuran' },
    { label: 'Biaya', to: '/biaya' },
  ],
  Keuangan: [
    { label: 'Piutang', to: '/piutang' },
    { label: 'Utang', to: '/pelunasan-utang' },
    { label: 'Laba & Rugi', to: '/laba-rugi' },
  ],
  Laporan: [
    { label: 'Stok', to: '/laporan/stok' },
    { label: 'Pembelian', to: '/laporan/pembelian' },
    { label: 'Penjualan', to: '/laporan/penjualan' },
    { label: 'Pengeluaran', to: '/laporan/pengeluaran' },
  ],
};

// Urut dari paling spesifik ke paling umum.
const pageTitles = [
  ['/produk/tambah', 'Tambah Produk'],
  ['/produk/'], 'Produk',
  ['/kategori', 'Kategori'],
  ['/supplier', 'Supplier'],
  ['/toko', 'Toko'],
  ['/pembelian/tambah', 'Tambah Pembelian'],
  ['/penjualan/tambah', 'Tambah Penjualan'],
  ['/pembelian', 'Pembelian'],
  ['/penjualan', 'Penjualan'],
  ['/pembayaran', 'Pembayaran'],
  ['/pelunasan-utang', 'Pelunasan Utang'],
  ['/angsuran', 'Jadwal Angsuran'],
  ['/biaya', 'Biaya'],
  ['/piutang', 'Piutang'],
  ['/laba-rugi', 'Laba & Rugi'],
  ['/laporan/stok-terkini', 'Laporan Stok Terkini'],
  ['/laporan/stok', 'Laporan Stok'],
  ['/laporan/pembelian', 'Laporan Pembelian'],
  ['/laporan/penjualan', 'Laporan Penjualan'],
  ['/laporan/pengeluaran', 'Laporan Pengeluaran'],
  ['/laporan/biaya', 'Laporan Biaya'],
  ['/ubah-password', 'Ubah Kata Sandi'],
  ['/', 'Dashboard'],
];

function resolvePageTitle(pathname) {
  for (const [prefix, title] of pageTitles) {
    if (prefix === '/') return pathname === '/' ? title : null;
    if (pathname === prefix || pathname.startsWith(prefix)) return title;
  }
  return null;
}

function isActiveTab(pathname, tab) {
  return tab.match.some((p) => (p === '/' ? pathname === '/' : pathname.startsWith(p)));
}

// Rute detail/form yang punya halaman induk: tampilkan tombol kembali di shell.
const backTargets = [
  ['/produk/tambah', '/produk'],
  ['/penjualan/tambah', '/penjualan'],
  ['/pembelian/tambah', '/pembelian'],
];

function resolveBackTarget(pathname) {
  for (const [prefix, target] of backTargets) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return target;
  }
  return null;
}

export default function DashboardLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Menu akun terbuka hanya untuk pathname saat dibuka, sehingga otomatis
  // tertutup saat navigasi tanpa perlu setState di dalam effect.
  const [openMenuFor, setOpenMenuFor] = useState(null);
  const showUserMenu = openMenuFor === pathname;
  const menuRef = useRef(null);
  const avatarRef = useRef(null);
  const firstItemRef = useRef(null);

  const closeMenu = useCallback(() => setOpenMenuFor(null), []);

  const handleLogout = () => {
    setOpenMenuFor(null);
    logout();
    navigate('/login');
  };

  const activeBottomTab = bottomNavTabs.find((t) => isActiveTab(pathname, t));
  const currentSubNav = activeBottomTab ? subNavItems[activeBottomTab.label] : null;
  const pageTitle = resolvePageTitle(pathname);
  const backTarget = resolveBackTarget(pathname);

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

  return (
    <div className="min-h-screen bg-surface">
      <a
        href="#konten-utama"
        className="no-print sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:top-2 focus:left-2 focus:bg-primary focus:text-on-primary focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Lewati ke konten utama
      </a>

      {/* Desktop Sidebar */}
      <nav
        aria-label="Navigasi utama"
        className="no-print desktop-sidebar flex-col fixed left-0 top-14 bottom-0 w-64 bg-surface border-r border-outline-variant/30 py-6 px-4 z-30"
      >
        <div className="flex items-center gap-3 mb-6 px-4">
          <img src="/bj.png" alt="" className="w-10 h-10 rounded-xl object-cover" />
          <div>
            <span className="text-xl font-bold text-primary">BALARAJA</span>
            <span className="text-xs text-on-surface-variant block">Sistem Manajemen</span>
          </div>
        </div>

        <div className="flex flex-col gap-1 overflow-y-auto flex-1">
          {navGroups.map((group) => (
            <div key={group.title || 'main'}>
              {group.title && (
                <div className="mt-4 px-4 text-xs font-medium text-on-surface-variant/60 uppercase tracking-wider mb-1">
                  {group.title}
                </div>
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-4 px-4 py-3 rounded-xl transition-colors ${
                      isActive
                        ? 'bg-secondary-container text-on-secondary-container'
                        : 'text-on-surface-variant hover:bg-surface-container-high'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className="material-symbols-outlined"
                        aria-hidden="true"
                        style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                      >
                        {item.icon}
                      </span>
                      <span className="text-base font-medium">{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </div>

        <div className="mt-auto pt-6 border-t border-outline-variant/30 px-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 shrink-0 rounded-full bg-primary flex items-center justify-center text-on-primary font-semibold text-sm">
              {user?.name?.charAt(0)?.toUpperCase() || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-on-surface truncate">{user?.name || 'Admin'}</p>
              <p className="text-xs text-on-surface-variant truncate">{user?.role || 'Administrator'}</p>
            </div>
          </div>
        </div>
      </nav>

      {/* Top App Bar */}
      <header className="no-print bg-surface shadow-sm sticky top-0 z-40 h-14 flex items-center px-4 gap-3 justify-between">
        <div className="flex items-center gap-1 sm:gap-3 min-w-0">
          {backTarget && (
            <button
              type="button"
              onClick={() => navigate(backTarget)}
              aria-label="Kembali"
              className="md:hidden -ml-2 p-2 rounded-full text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
            </button>
          )}
          <div className="flex items-center gap-3 md:hidden">
            <img src="/bj.png" alt="" className="h-9 w-9 rounded-lg object-contain" />
            <span className="text-lg font-bold text-primary">BALARAJA</span>
          </div>
          {pageTitle && (
            <h1 className="hidden md:block text-base font-semibold text-on-surface truncate">
              {pageTitle}
            </h1>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden lg:inline-flex items-center gap-1.5 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-base">calendar_today</span>
            {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>

          <div className="relative">
            <button
              ref={avatarRef}
              type="button"
              onClick={() => setOpenMenuFor(showUserMenu ? null : pathname)}
              aria-haspopup="menu"
              aria-expanded={showUserMenu}
              aria-controls="user-menu"
              aria-label={`Menu akun ${user?.name || 'Admin'}`}
              className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-on-primary font-semibold text-sm hover:opacity-90 transition-opacity"
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
                  className="absolute right-0 top-12 w-56 bg-surface rounded-xl shadow-lg border border-outline-variant/30 z-50 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-outline-variant/30">
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
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-container-high focus:bg-surface-container-high focus:outline-none transition-colors text-on-surface"
                  >
                    <span className="material-symbols-outlined text-[20px]" aria-hidden="true">lock</span>
                    <span className="text-sm">Ubah Kata Sandi</span>
                  </button>
                  <div className="h-px bg-outline-variant/30" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-error-container/50 focus:bg-error-container/50 focus:outline-none transition-colors text-error"
                  >
                    <span className="material-symbols-outlined text-[20px]" aria-hidden="true">logout</span>
                    <span className="text-sm">Keluar</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Sub-Navigation — horizontal scrollable tabs */}
      {currentSubNav && (
        <nav
          aria-label={`Sub navigasi ${activeBottomTab.label}`}
          className="no-print mobile-sub-nav sticky top-14 z-30 bg-surface border-b border-outline-variant/30 overflow-x-auto hide-scrollbar"
        >
          <div className="flex gap-2 px-4 py-2 min-w-max">
            {currentSubNav.map((item) => {
              const active =
                item.to === '/'
                  ? pathname === '/'
                  : pathname === item.to || pathname.startsWith(item.to + '/');
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                    active
                      ? 'bg-secondary-container text-on-secondary-container shadow-sm'
                      : 'text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {item.label}
                </NavLink>
              );
            })}
          </div>
        </nav>
      )}

      {/* Main Content */}
      <main id="konten-utama" tabIndex={-1} className="main-content-desktop outline-none">
        <div className="mx-auto w-full max-w-7xl p-4">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-24 text-on-surface-variant">
                <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
                <span className="sr-only">Memuat halaman</span>
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Navigasi bawah"
        className="no-print mobile-bottom-nav bg-surface shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.06)] fixed bottom-0 w-full z-50 justify-around items-center px-2 pt-2"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 8px)' }}
      >
        {bottomNavTabs.map((tab) => {
          const active = isActiveTab(pathname, tab);
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'flex flex-col items-center justify-center bg-secondary-container text-on-secondary-container rounded-xl px-2 py-1 active:scale-95 transition-transform duration-150'
                  : 'flex flex-col items-center justify-center text-on-surface-variant active:scale-95 transition-transform duration-150 p-2 rounded-xl'
              }
            >
              <span
                className="material-symbols-outlined"
                aria-hidden="true"
                style={{ fontSize: '22px', ...(active ? { fontVariationSettings: "'FILL' 1" } : undefined) }}
              >
                {tab.icon}
              </span>
              <span className="text-[10px] mt-0.5 truncate" style={{ fontWeight: active ? 700 : 400 }}>
                {tab.label}
              </span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
