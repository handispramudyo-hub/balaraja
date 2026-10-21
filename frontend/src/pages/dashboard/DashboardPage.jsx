import { useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import useAuthStore from '../../stores/authStore';
import { formatCurrency, formatNumber } from '../../utils/format';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import Chart from 'chart.js/auto';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';

async function fetchDashboard() {
  const res = await api.get('/dashboard');
  return res.data;
}

function cssVar(name, fallback) {
  if (typeof window === 'undefined' || !window.getComputedStyle) return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function useChart(canvasRef, config) {
  const chartRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !config) return undefined;
    chartRef.current = new Chart(canvas, config);
    return () => {
      if (chartRef.current) chartRef.current.destroy();
      chartRef.current = null;
    };
  }, [canvasRef, config]);
}

function chartScales() {
  const tickColor = () => cssVar('--color-on-surface-variant', '#43474e');
  const gridColor = () => cssVar('--color-outline-variant', '#c4c6cf');
  return {
    x: {
      grid: { display: false },
      ticks: { font: { size: 11 }, color: tickColor },
      border: { color: gridColor },
    },
    y: {
      beginAtZero: true,
      ticks: { font: { size: 11 }, color: tickColor, callback: (v) => formatNumber(v) },
      grid: { color: gridColor },
      border: { display: false },
    },
  };
}

const chartBaseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 400 },
  plugins: { legend: { display: false }, tooltip: { displayColors: false } },
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { data, isLoading, isError, isFetching, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
  });

  const lineRef = useRef(null);
  const barRef = useRef(null);

  const omzetData = useMemo(() => data?.omzet_bulanan || [], [data]);
  const penjualanData = useMemo(() => data?.penjualan_bulanan || [], [data]);

  const omzetConfig = useMemo(
    () => ({
      type: 'line',
      data: {
        labels: omzetData.map((x) => x.label),
        datasets: [
          {
            data: omzetData.map((x) => x.value),
            borderColor: () => cssVar('--color-primary', '#022448'),
            backgroundColor: () => cssVar('--color-primary-fixed', '#d5e3ff'),
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.4,
            fill: true,
          },
        ],
      },
      options: { ...chartBaseOptions, scales: chartScales() },
    }),
    [omzetData],
  );

  const penjualanConfig = useMemo(
    () => ({
      type: 'bar',
      data: {
        labels: penjualanData.map((x) => x.label),
        datasets: [
          {
            data: penjualanData.map((x) => x.value),
            backgroundColor: () => cssVar('--color-tertiary-fixed-dim', '#edbf7f'),
            borderRadius: 4,
            maxBarThickness: 28,
          },
        ],
      },
      options: { ...chartBaseOptions, scales: chartScales() },
    }),
    [penjualanData],
  );

  useChart(lineRef, omzetData.length ? omzetConfig : null);
  useChart(barRef, penjualanData.length ? penjualanConfig : null);

  if (isError) {
    return (
      <div className="py-4">
        <ErrorState
          error={error}
          onRetry={() => refetch()}
          title="Gagal memuat dashboard"
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="py-4">
        <LoadingState message="Memuat data dashboard..." rows={4} />
      </div>
    );
  }

  const d = data || {};

  const stats = [
    {
      label: 'Omzet Hari Ini',
      icon: 'calendar_today',
      value: formatCurrency(d.omzet_hari_ini),
      from: 'from-primary',
      to: 'to-primary-container',
      valueClass: 'text-on-primary',
      labelClass: 'text-primary-fixed',
    },
    {
      label: 'Piutang Belum Lunas',
      icon: 'account_balance_wallet',
      value: formatCurrency(d.piutang_belum_lunas),
      from: 'from-tertiary-fixed',
      to: 'to-tertiary-fixed-dim',
      valueClass: 'text-on-tertiary-fixed',
      labelClass: 'text-on-tertiary-fixed/80',
    },
    {
      label: 'Stok Menipis',
      icon: 'warning',
      value: `${formatNumber(d.stok_menipis)} Produk`,
      from: 'from-error',
      to: 'to-on-error-container',
      valueClass: 'text-on-error',
      labelClass: 'text-error-container',
    },
    {
      label: 'Transaksi Hari Ini',
      icon: 'shopping_cart',
      value: formatNumber(d.transaksi_hari_ini),
      from: 'from-success-fixed',
      to: 'to-success-container',
      valueClass: 'text-on-success-container',
      labelClass: 'text-on-success-container/80',
    },
  ];

  const quickActions = [
    { label: 'Tambah Pembelian', icon: 'add_shopping_cart', to: '/pembelian/tambah', chip: 'bg-primary-container text-on-primary-container' },
    { label: 'Tambah Penjualan', icon: 'point_of_sale', to: '/penjualan/tambah', chip: 'bg-secondary-container text-on-secondary-container' },
    { label: 'Bayar Piutang', icon: 'payments', to: '/pembayaran', chip: 'bg-tertiary-fixed text-on-tertiary-fixed' },
    { label: 'Input Biaya', icon: 'receipt_long', to: '/biaya', chip: 'bg-error-container text-on-error-container' },
  ];

  return (
    <div className="space-y-6 py-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-on-surface">
            {greeting()}, {user?.name || 'Admin'}
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Ringkasan aktivitas BALARAJA hari ini
          </p>
        </div>
        {isFetching && (
          <span className="flex items-center gap-2 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
            Memperbarui...
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className={`bg-gradient-to-br ${s.from} ${s.to} p-4 rounded-2xl shadow-sm relative overflow-hidden`}
          >
            <span className="material-symbols-outlined absolute -right-3 -bottom-4 opacity-10 text-[96px] select-none pointer-events-none">
              {s.icon}
            </span>
            <p className={`flex items-center gap-1.5 mb-2 ${s.labelClass}`}>
              <span className="material-symbols-outlined text-sm">{s.icon}</span>
              <span className="text-xs font-medium">{s.label}</span>
            </p>
            <p className={`text-base sm:text-lg font-semibold tabular-nums break-words ${s.valueClass}`}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <section aria-labelledby="statistik-bulanan" className="space-y-3">
        <h2 id="statistik-bulanan" className="text-lg font-semibold text-on-surface">
          Statistik Bulanan
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-4">
            <h3 className="text-xs font-medium text-on-surface-variant mb-4">Omzet Bulanan</h3>
            {omzetData.length ? (
              <div className="h-48 w-full">
                <canvas ref={lineRef} role="img" aria-label="Grafik omzet bulanan" />
              </div>
            ) : (
              <EmptyState
                icon="show_chart"
                title="Belum ada data omzet"
                description="Data grafik muncul setelah ada transaksi penjualan."
              />
            )}
          </div>

          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-4">
            <h3 className="text-xs font-medium text-on-surface-variant mb-4">Penjualan Bulanan</h3>
            {penjualanData.length ? (
              <div className="h-48 w-full">
                <canvas ref={barRef} role="img" aria-label="Grafik penjualan bulanan" />
              </div>
            ) : (
              <EmptyState
                icon="bar_chart"
                title="Belum ada data penjualan"
                description="Data grafik muncul setelah ada transaksi penjualan."
              />
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="aksi-cepat" className="space-y-3">
        <h2 id="aksi-cepat" className="text-lg font-semibold text-on-surface">
          Aksi Cepat
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {quickActions.map((a) => (
            <button
              key={a.to}
              type="button"
              onClick={() => navigate(a.to)}
              className="no-print bg-surface-container-lowest border border-outline-variant rounded-2xl p-4 flex flex-col items-center justify-center gap-2 hover:bg-surface-container-low transition-colors active:scale-[0.98] transition-transform text-left"
            >
              <span className={`${a.chip} p-3 rounded-full`}>
                <span className="material-symbols-outlined" aria-hidden="true">{a.icon}</span>
              </span>
              <span className="text-xs font-medium text-on-surface text-center">{a.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
