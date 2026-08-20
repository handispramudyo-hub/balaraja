import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import {
  Package,
  LayoutDashboard,
  Tags,
  Truck,
  Store,
  ShoppingCart,
  ShoppingBag,
  CreditCard,
  Receipt,
  Wallet,
  TrendingUp,
  Box,
  FileText,
  Menu,
  LogOut,
  Search,
} from 'lucide-react';
import { useState } from 'react';

const navGroups = [
  {
    title: null,
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, to: '/' },
    ],
  },
  {
    title: 'Master Data',
    items: [
      { label: 'Produk', icon: Package, to: '/produk' },
      { label: 'Kategori', icon: Tags, to: '/kategori' },
      { label: 'Supplier', icon: Truck, to: '/supplier' },
      { label: 'Toko', icon: Store, to: '/toko' },
    ],
  },
  {
    title: 'Transaksi',
    items: [
      { label: 'Pembelian', icon: ShoppingCart, to: '/pembelian' },
      { label: 'Penjualan', icon: ShoppingBag, to: '/penjualan' },
      { label: 'Pembayaran', icon: CreditCard, to: '/pembayaran' },
      { label: 'Biaya', icon: Receipt, to: '/biaya' },
    ],
  },
  {
    title: 'Keuangan',
    items: [
      { label: 'Piutang', icon: Wallet, to: '/piutang' },
      { label: 'Laba & Rugi', icon: TrendingUp, to: '/laba-rugi' },
    ],
  },
  {
    title: 'Laporan',
    items: [
      { label: 'Stok', icon: Box, to: '/laporan/stok' },
      { label: 'Pembelian', icon: FileText, to: '/laporan/pembelian' },
      { label: 'Penjualan', icon: FileText, to: '/laporan/penjualan' },
      { label: 'Piutang', icon: FileText, to: '/laporan/piutang' },
      { label: 'Pengeluaran', icon: FileText, to: '/laporan/pengeluaran' },
      { label: 'Laba Rugi', icon: FileText, to: '/laporan/laba-rugi' },
    ],
  },
];

export default function DashboardLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 text-white flex flex-col overflow-y-auto">
        <div className="flex items-center gap-2 px-6 py-5 border-b border-gray-800">
          <Package className="w-8 h-8 text-blue-400" />
          <div>
            <h1 className="text-lg font-bold tracking-wide">BALARAJA</h1>
            <p className="text-xs text-gray-400">Sistem Manajemen Stok & Keuangan</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-4">
          {navGroups.map((group) => (
            <div key={group.title || 'main'}>
              {group.title && (
                <p className="px-3 mb-1 text-xs uppercase font-semibold text-gray-500">
                  {group.title}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                          isActive
                            ? 'bg-gray-700 text-blue-400'
                            : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                        }`
                      }
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Top Navbar */}
      <header className="fixed top-0 left-64 right-0 z-40 h-16 bg-white border-b border-gray-200 flex items-center px-6 gap-4">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-md hover:bg-gray-100 lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Cari..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex items-center gap-3 ml-auto">
          <span className="text-sm font-medium text-gray-700">{user?.name || 'Admin'}</span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Keluar
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="ml-64 mt-16 p-6">
        <Outlet />
      </main>
    </div>
  );
}
