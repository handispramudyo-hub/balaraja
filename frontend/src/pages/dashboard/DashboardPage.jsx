import { useQuery } from '@tanstack/react-query';
import useAuthStore from '../../stores/authStore';
import { formatCurrency, formatNumber } from '../../utils/format';
import StatCard from '../../components/ui/StatCard';
import { useNavigate } from 'react-router-dom';
import {
  DollarSign,
  TrendingUp,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Package,
  Boxes,
  AlertTriangle,
  XCircle,
  ShoppingCart,
  ShoppingBag,
  CreditCard,
  AlertCircle,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

async function fetchDashboard() {
  const res = await fetch('/api/dashboard');
  if (!res.ok) throw new Error('Gagal memuat data dashboard');
  return res.json();
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Memuat data...</p>
      </div>
    );
  }

  const d = data || {};

  const quickActions = [
    { label: 'Pembelian', to: '/pembelian/tambah', color: 'bg-indigo-500 hover:bg-indigo-600' },
    { label: 'Penjualan', to: '/penjualan/tambah', color: 'bg-green-500 hover:bg-green-600' },
    { label: 'Pembayaran', to: '/pembayaran', color: 'bg-teal-500 hover:bg-teal-600' },
    { label: 'Biaya', to: '/biaya', color: 'bg-orange-500 hover:bg-orange-600' },
  ];

  const labaRugi = d.laba_bersih ?? 0;
  const isLaba = labaRugi >= 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Selamat datang, {user?.name || 'Admin'}</p>
      </div>

      {/* Financial Summary */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Ringkasan Keuangan
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Omzet Hari ini" value={formatCurrency(d.omzet_hari_ini)} icon={DollarSign} color="blue" />
          <StatCard title="Omzet Bulan ini" value={formatCurrency(d.omzet_bulan_ini)} icon={TrendingUp} color="green" />
          <StatCard title="Total Modal" value={formatCurrency(d.total_modal)} icon={Wallet} color="purple" />
          <StatCard
            title="Laba Bersih"
            value={formatCurrency(d.laba_bersih)}
            icon={isLaba ? ArrowUpRight : ArrowDownRight}
            color={isLaba ? 'emerald' : 'red'}
          />
        </div>
      </div>

      {/* Inventory Summary */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Ringkasan Inventaris
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Produk" value={formatNumber(d.total_produk)} icon={Package} color="orange" />
          <StatCard title="Total Stok" value={formatNumber(d.total_stok)} icon={Boxes} color="cyan" />
          <StatCard title="Stok Menipis" value={formatNumber(d.stok_menipis)} icon={AlertTriangle} color="yellow" />
          <StatCard title="Stok Habis" value={formatNumber(d.stok_habis)} icon={XCircle} color="red" />
        </div>
      </div>

      {/* Transaction Summary */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Ringkasan Transaksi
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Pembelian" value={formatCurrency(d.total_pembelian)} icon={ShoppingCart} color="indigo" />
          <StatCard title="Total Penjualan" value={formatCurrency(d.total_penjualan)} icon={ShoppingBag} color="green" />
          <StatCard title="Pembayaran Diterima" value={formatCurrency(d.pembayaran_diterima)} icon={CreditCard} color="teal" />
          <StatCard title="Piutang Belum Lunas" value={formatCurrency(d.piutang_belum_lunas)} icon={AlertCircle} color="red" />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Omzet Bulanan</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={d.omzet_bulanan || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Penjualan Bulanan</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={d.penjualan_bulanan || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Bar dataKey="value" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Aksi Cepat
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {quickActions.map((a) => (
            <button
              key={a.to}
              onClick={() => navigate(a.to)}
              className={`${a.color} text-white rounded-xl px-4 py-3 text-sm font-semibold shadow transition-colors`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
