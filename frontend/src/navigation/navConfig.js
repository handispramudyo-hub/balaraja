/**
 * Sumber tunggal navigasi aplikasi.
 *
 * Sidebar desktop, tab bar mobile, drawer mobile, action sheet, dan judul
 * halaman semuanya diturunkan dari berkas ini. Sebelumnya menu ada di tiga
 * tempat (sidebar, bottom nav, sub-nav) yang harus disinkron manual — dan
 * sudah pernah tidak sinkron: `/pelunasan-utang` muncul dua kali dengan
 * label berbeda, dan tab "Keuangan" tidak mengenali rute itu.
 *
 * Rute tetap sama seperti versi lama supaya bookmark dan tautan lama tidak
 * putus.
 */

export const NAV_SECTIONS = [
  {
    id: 'master',
    label: 'Master Data',
    items: [
      { id: 'produk', label: 'Produk', icon: 'inventory_2', to: '/produk' },
      { id: 'kategori', label: 'Kategori', icon: 'category', to: '/kategori' },
      { id: 'pelanggan', label: 'Pelanggan', icon: 'store', to: '/toko' },
      { id: 'supplier', label: 'Supplier', icon: 'local_shipping', to: '/supplier' },
    ],
  },
  {
    id: 'transaksi',
    label: 'Transaksi',
    items: [
      { id: 'trx-pembelian', label: 'Pembelian', icon: 'add_shopping_cart', to: '/pembelian' },
      { id: 'trx-penjualan', label: 'Penjualan', icon: 'point_of_sale', to: '/penjualan' },
      { id: 'pembayaran', label: 'Pembayaran', icon: 'payments', to: '/pembayaran' },
      { id: 'pelunasan', label: 'Pelunasan Utang', icon: 'handshake', to: '/pelunasan-utang' },
      { id: 'angsuran', label: 'Jadwal Angsuran', icon: 'calendar_month', to: '/angsuran' },
      { id: 'biaya', label: 'Biaya', icon: 'receipt_long', to: '/biaya' },
    ],
  },
  {
    id: 'keuangan',
    label: 'Keuangan',
    items: [
      { id: 'piutang', label: 'Piutang', icon: 'account_balance_wallet', to: '/piutang' },
      { id: 'utang', label: 'Utang', icon: 'price_change', to: '/utang' },
      { id: 'laba-rugi', label: 'Laba & Rugi', icon: 'trending_up', to: '/laba-rugi' },
    ],
  },
  {
    id: 'laporan',
    label: 'Laporan',
    items: [
      { id: 'rpt-stok', label: 'Stok', icon: 'inventory', to: '/laporan/stok' },
      { id: 'rpt-pembelian', label: 'Pembelian', icon: 'description', to: '/laporan/pembelian' },
      { id: 'rpt-penjualan', label: 'Penjualan', icon: 'sell', to: '/laporan/penjualan' },
      { id: 'rpt-pengeluaran', label: 'Pengeluaran', icon: 'money_off', to: '/laporan/pengeluaran' },
    ],
  },
];

/** Tab bawah mobile: lima titik masuk utama. */
export const MOBILE_TABS = [
  { id: 'beranda', label: 'Beranda', icon: 'home', to: '/', match: ['/'] },
  {
    id: 'master',
    label: 'Master',
    icon: 'inventory_2',
    to: '/produk',
    match: ['/produk', '/kategori', '/toko', '/supplier'],
  },
  {
    id: 'transaksi',
    label: 'Transaksi',
    icon: 'point_of_sale',
    to: '/penjualan',
    match: ['/pembelian', '/penjualan', '/pembayaran', '/pelunasan-utang', '/angsuran', '/biaya'],
  },
  {
    id: 'keuangan',
    label: 'Keuangan',
    icon: 'account_balance_wallet',
    to: '/piutang',
    match: ['/piutang', '/utang', '/laba-rugi'],
  },
  {
    id: 'laporan',
    label: 'Laporan',
    icon: 'assessment',
    to: '/laporan/stok',
    match: ['/laporan'],
  },
];

/** Aksi cepat: dipakai di FAB mobile dan blok "Aksi Cepat" di drawer. */
export const QUICK_ACTIONS = [
  { id: 'penjualan', label: 'Penjualan', icon: 'point_of_sale', to: '/penjualan/tambah' },
  { id: 'pembelian', label: 'Pembelian', icon: 'add_shopping_cart', to: '/pembelian/tambah' },
  { id: 'pembayaran', label: 'Pembayaran', icon: 'payments', to: '/pembayaran' },
  { id: 'biaya', label: 'Biaya', icon: 'receipt_long', to: '/biaya' },
];

/**
 * Rute yang punya halaman induk, untuk tombol "kembali" di shell.
 */
export const BACK_TARGETS = [
  { prefix: '/produk/tambah', to: '/produk' },
  { prefix: '/produk/', to: '/produk' },
  { prefix: '/pembelian/tambah', to: '/pembelian' },
  { prefix: '/pembelian/', to: '/pembelian' },
  { prefix: '/penjualan/tambah', to: '/penjualan' },
  { prefix: '/penjualan/', to: '/penjualan' },
];

/**
 * Judul halaman. Urut dari paling spesifik ke paling umum, karena pencocokan
 * dilakukan dengan prefix.
 */
const PAGE_TITLES = [
  { prefix: '/produk/tambah', title: 'Tambah Produk' },
  { prefix: '/produk/', title: 'Detail Produk' },
  { prefix: '/produk', title: 'Produk' },
  { prefix: '/kategori', title: 'Kategori' },
  { prefix: '/supplier', title: 'Supplier' },
  { prefix: '/toko', title: 'Pelanggan' },
  { prefix: '/pembelian/tambah', title: 'Tambah Pembelian' },
  { prefix: '/pembelian/', title: 'Edit Pembelian' },
  { prefix: '/pembelian', title: 'Pembelian' },
  { prefix: '/penjualan/tambah', title: 'Kasir' },
  { prefix: '/penjualan/', title: 'Edit Penjualan' },
  { prefix: '/penjualan', title: 'Penjualan' },
  { prefix: '/pembayaran', title: 'Pembayaran' },
  { prefix: '/pelunasan-utang', title: 'Pelunasan Utang' },
  { prefix: '/angsuran', title: 'Jadwal Angsuran' },
  { prefix: '/biaya', title: 'Biaya' },
  { prefix: '/piutang', title: 'Piutang' },
  { prefix: '/utang', title: 'Utang Supplier' },
  { prefix: '/laba-rugi', title: 'Laba & Rugi' },
  { prefix: '/laporan/stok', title: 'Laporan Stok' },
  { prefix: '/laporan/pembelian', title: 'Laporan Pembelian' },
  { prefix: '/laporan/penjualan', title: 'Laporan Penjualan' },
  { prefix: '/laporan/pengeluaran', title: 'Laporan Pengeluaran' },
  { prefix: '/laporan/piutang', title: 'Piutang' },
  { prefix: '/laporan/laba-rugi', title: 'Laba & Rugi' },
  { prefix: '/ubah-password', title: 'Ubah Kata Sandi' },
  { prefix: '/', title: 'Dashboard' },
];

export function resolvePageTitle(pathname) {
  for (const entry of PAGE_TITLES) {
    if (entry.prefix === '/') {
      if (pathname === '/') return entry.title;
      continue;
    }
    if (pathname === entry.prefix || pathname.startsWith(entry.prefix)) return entry.title;
  }
  return 'BALARAJA';
}

export function resolveBackTarget(pathname) {
  for (const entry of BACK_TARGETS) {
    if (pathname === entry.prefix || pathname.startsWith(entry.prefix)) return entry.to;
  }
  return null;
}

/** Semua item menu dalam satu daftar datar. */
export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((section) =>
  section.items.map((item) => ({ ...item, section: section.id, sectionLabel: section.label }))
);

/** Cari item menu yang cocok dengan pathname (untuk sidebar dan drawer). */
export function findActiveItem(pathname) {
  return (
    ALL_NAV_ITEMS.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`)) ?? null
  );
}

/** Tab mobile yang aktif untuk pathname tertentu. */
export function findActiveTab(pathname) {
  return (
    MOBILE_TABS.find((tab) => tab.match.some((prefix) => (prefix === '/' ? pathname === '/' : pathname.startsWith(prefix)))) ??
    null
  );
}
