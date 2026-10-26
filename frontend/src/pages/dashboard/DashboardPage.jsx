import { useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../stores/authStore';
import api from '../../services/api';
import Chart from 'chart.js/auto';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Money from '../../components/ui/Money';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import { QUICK_ACTIONS } from '../../navigation/navConfig';
import { formatNumber, daysUntil } from '../../lib/format';
import { useTheme } from '../../lib/theme';

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
  return {
    x: {
      grid: { display: false },
      ticks: { font: { size: 11 }, color: cssVar('--color-on-surface-variant', '#4a4e55') },
      border: { color: cssVar('--color-outline-variant', '#d8d5ce') },
    },
    y: {
      beginAtZero: true,
      ticks: {
        font: { size: 11 },
        color: cssVar('--color-on-surface-variant', '#4a4e55'),
        callback: (value) => formatNumber(value),
      },
      grid: { color: cssVar('--color-outline-variant', '#d8d5ce') },
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
  const { isDark } = useTheme();

  const { data, isLoading, isError, isFetching, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get('/dashboard')).data,
  });

  // "Tugas Hari Ini" butuh detail yang tidak ada di ringkasan dashboard:
  // transaksi yang jatuh tempo, angsuran berjalan, dan produk yang menipis.
  // Semua diambil paralel; tidak ada satu pun yang boleh menggagalkan
  // halaman ini secara keseluruhan.
  const { data: unpaidSales } = useQuery({
    queryKey: ['dashboard', 'unpaid-sales'],
    queryFn: async () =>
      (await api.get('/sales', { params: { payment_status: 'unpaid_or_partial', per_page: 100 } })).data
        ?.data ?? [],
  });

  const { data: debtPurchases } = useQuery({
    queryKey: ['dashboard', 'debt-purchases'],
    queryFn: async () =>
      (await api.get('/purchases', { params: { has_debt: 1, per_page: 100 } })).data?.data ?? [],
  });

  const { data: plans } = useQuery({
    queryKey: ['dashboard', 'installment-plans'],
    queryFn: async () =>
      (await api.get('/installment-plans', { params: { has_outstanding: 1, per_page: 100 } })).data
        ?.data ?? [],
  });

  const { data: products } = useQuery({
    queryKey: ['dashboard', 'products'],
    queryFn: async () => (await api.get('/products')).data ?? [],
  });

  const lineRef = useRef(null);
  const barRef = useRef(null);

  const financial = data?.financial_summary ?? {};
  const inventory = data?.inventory_summary ?? {};
  const transaction = data?.transaction_summary ?? {};

  const omzetChart = useMemo(() => data?.charts?.omzet_chart ?? [], [data]);
  const labaChart = useMemo(() => data?.charts?.laba_chart ?? [], [data]);

  const omzetConfig = useMemo(
    () => ({
      type: 'line',
      data: {
        labels: omzetChart.map((item) => item.month),
        datasets: [
          {
            data: omzetChart.map((item) => item.value),
            borderColor: cssVar('--color-primary', '#0e2a47'),
            backgroundColor: isDark
              ? cssVar('--color-primary-container', '#16385e')
              : cssVar('--color-primary-fixed', '#d8e6fa'),
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
    [omzetChart, isDark]
  );

  const labaConfig = useMemo(
    () => ({
      type: 'bar',
      data: {
        labels: labaChart.map((item) => item.month),
        datasets: [
          {
            data: labaChart.map((item) => item.value),
            backgroundColor: isDark
              ? cssVar('--color-accent-container', '#ffe8d9')
              : cssVar('--color-accent', '#c2410c'),
            borderRadius: 4,
            maxBarThickness: 26,
          },
        ],
      },
      options: { ...chartBaseOptions, scales: chartScales() },
    }),
    [labaChart, isDark]
  );

  useChart(lineRef, omzetChart.length ? omzetConfig : null);
  useChart(barRef, labaChart.length ? labaConfig : null);

  const tasks = useMemo(() => {
    const list = [];

    const sales = Array.isArray(unpaidSales) ? unpaidSales : [];
    const dueReceivables = sales.filter((sale) => {
      const days = daysUntil(sale.due_date);
      return days !== null && days <= 7;
    });
    if (dueReceivables.length) {
      list.push({
        id: 'piutang',
        icon: 'account_balance_wallet',
        tone: 'danger',
        title: `${dueReceivables.length} piutang jatuh tempo ≤ 7 hari`,
        detail: dueReceivables
          .slice(0, 2)
          .map((sale) => `${sale.sale_number} (${sale.customer?.name ?? '-'})`)
          .join(', '),
        amount: dueReceivables.reduce((sum, sale) => sum + Number(sale.receivable ?? 0), 0),
        to: '/piutang',
      });
    }

    const debts = Array.isArray(debtPurchases) ? debtPurchases : [];
    const dueDebts = debts.filter((purchase) => {
      const days = daysUntil(purchase.due_date);
      return days !== null && days <= 7;
    });
    if (dueDebts.length) {
      list.push({
        id: 'utang',
        icon: 'price_change',
        tone: 'warning',
        title: `${dueDebts.length} utang supplier jatuh tempo ≤ 7 hari`,
        detail: dueDebts
          .slice(0, 2)
          .map((purchase) => `${purchase.purchase_number} (${purchase.supplier?.name ?? '-'})`)
          .join(', '),
        amount: dueDebts.reduce((sum, purchase) => sum + Number(purchase.payable ?? 0), 0),
        to: '/utang',
      });
    }

    const installmentPlans = Array.isArray(plans) ? plans : [];
    const dueInstallments = installmentPlans.filter((plan) => {
      const days = daysUntil(plan.next_due_date);
      return days !== null && days <= 7;
    });
    if (dueInstallments.length) {
      list.push({
        id: 'angsuran',
        icon: 'calendar_month',
        tone: 'info',
        title: `${dueInstallments.length} jadwal angsuran jatuh tempo ≤ 7 hari`,
        detail: dueInstallments
          .slice(0, 2)
          .map((plan) => `${plan.transaction_number ?? '-'} (${plan.counterparty_name ?? '-'})`)
          .join(', '),
        amount: dueInstallments.reduce((sum, plan) => sum + Number(plan.outstanding ?? 0), 0),
        to: '/angsuran',
      });
    }

    const productList = Array.isArray(products) ? products : [];
    const lowStock = productList.filter(
      (product) => Number(product.stock ?? 0) <= Number(product.min_stock ?? 0)
    );
    if (lowStock.length) {
      list.push({
        id: 'stok',
        icon: 'inventory_2',
        tone: 'warning',
        title: `${lowStock.length} produk stok menipis`,
        detail: lowStock
          .slice(0, 2)
          .map((product) => `${product.name} (sisa ${product.stock})`)
          .join(', '),
        amount: null,
        to: '/produk',
      });
    }

    return list;
  }, [unpaidSales, debtPurchases, plans, products]);

  if (isError) {
    return (
      <div className="py-4">
        <ErrorState error={error} onRetry={() => refetch()} title="Gagal memuat dashboard" />
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

  const kpis = [
    {
      label: 'Omzet Hari Ini',
      value: financial.omzet_today,
      icon: 'today',
      hint: 'dari transaksi penjualan hari ini',
      to: '/penjualan',
    },
    {
      label: 'Omzet Bulan Ini',
      value: financial.omzet_month,
      icon: 'calendar_month',
      hint: `modal ${formatNumber(financial.total_modal)}`,
      to: '/laba-rugi',
    },
    {
      label: 'Laba Kotor Bulan Ini',
      value: financial.laba_kotor,
      icon: 'trending_up',
      hint: `biaya ${formatNumber(financial.total_biaya)}`,
      to: '/laba-rugi',
    },
    {
      label: 'Piutang Belum Lunas',
      value: financial.total_piutang,
      icon: 'account_balance_wallet',
      hint: `${formatNumber(transaction.unpaid_receivable)} dari transaksi berjalan`,
      to: '/piutang',
    },
  ];

  const counters = [
    { label: 'Produk', value: formatNumber(inventory.total_products), to: '/produk' },
    { label: 'Total Stok', value: formatNumber(inventory.total_stock), to: '/laporan/stok' },
    { label: 'Stok Menipis', value: formatNumber(inventory.low_stock), to: '/produk' },
    { label: 'Stok Habis', value: formatNumber(inventory.out_of_stock), to: '/produk' },
    { label: 'Penjualan Bulan Ini', value: formatNumber(transaction.total_sales_month), to: '/penjualan' },
    {
      label: 'Pembelian Bulan Ini',
      value: formatNumber(transaction.total_purchases_month),
      to: '/pembelian',
    },
    {
      label: 'Pembayaran Diterima',
      value: transaction.payments_received_month,
      money: true,
      to: '/pembayaran',
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${greeting()}, ${user?.name || 'Admin'}`}
        subtitle={new Date().toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
        actions={
          <>
            {isFetching && (
              <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-on-surface-variant">
                <span className="material-symbols-outlined text-base animate-spin" aria-hidden="true">
                  progress_activity
                </span>
                Memperbarui
              </span>
            )}
            <Button variant="outline" size="sm" icon="refresh" onClick={() => refetch()}>
              Segarkan
            </Button>
            <Button variant="primary" size="sm" icon="point_of_sale" onClick={() => navigate('/penjualan/tambah')}>
              Kasir
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="cursor-pointer hover:border-outline transition-colors">
            <CardBody className="py-3.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-2xs uppercase tracking-wide text-on-surface-variant">{kpi.label}</p>
                <span className="material-symbols-outlined text-lg text-on-surface-variant/70" aria-hidden="true">
                  {kpi.icon}
                </span>
              </div>
              <Money
                value={kpi.value}
                variant="strong"
                className="text-lg mt-1.5 block truncate"
              />
              <p className="text-2xs text-on-surface-variant mt-1 truncate">{kpi.hint}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-1">
          <CardHeader
            title="Tugas Hari Ini"
            subtitle="Hal yang perlu ditangani"
            icon="task_alt"
            actions={
              tasks.length > 0 ? <Badge tone="danger">{tasks.length}</Badge> : undefined
            }
          />
          <CardBody className="p-0">
            {tasks.length === 0 ? (
              <EmptyState
                icon="task_alt"
                title="Tidak ada tugas mendesak"
                description="Tidak ada jatuh tempo dalam 7 hari ke depan dan stok masih aman."
              />
            ) : (
              <ul className="divide-y divide-outline-variant/50">
                {tasks.map((task) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => navigate(task.to)}
                      className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-surface-container-low transition-colors"
                    >
                      <span
                        className={`material-symbols-outlined text-xl mt-0.5 ${
                          task.tone === 'danger'
                            ? 'text-danger'
                            : task.tone === 'warning'
                              ? 'text-warning'
                              : 'text-info'
                        }`}
                        aria-hidden="true"
                      >
                        {task.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-on-surface">{task.title}</span>
                        <span className="block text-xs text-on-surface-variant mt-0.5 line-clamp-2">
                          {task.detail}
                        </span>
                      </span>
                      {task.amount != null && (
                        <Money value={task.amount} variant="strong" className="text-xs shrink-0" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card>
            <CardHeader title="Omzet Bulanan" icon="show_chart" />
            <CardBody>
              {omzetChart.length ? (
                <div className="h-44 w-full">
                  <canvas ref={lineRef} role="img" aria-label="Grafik omzet bulanan" />
                </div>
              ) : (
                <EmptyState
                  icon="show_chart"
                  title="Belum ada data omzet"
                  description="Grafik muncul setelah ada transaksi penjualan."
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Laba Kotor Bulanan" icon="trending_up" />
            <CardBody>
              {labaChart.length ? (
                <div className="h-44 w-full">
                  <canvas ref={barRef} role="img" aria-label="Grafik laba kotor bulanan" />
                </div>
              ) : (
                <EmptyState
                  icon="bar_chart"
                  title="Belum ada data laba"
                  description="Grafik muncul setelah ada transaksi penjualan."
                />
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="Ringkasan Angka" icon="analytics" />
        <CardBody className="grid grid-cols-2 sm:grid-cols-4 gap-y-4 gap-x-3">
          {counters.map((counter) => (
            <button
              key={counter.label}
              type="button"
              onClick={() => navigate(counter.to)}
              className="text-left min-w-0"
            >
              <p className="text-2xs uppercase tracking-wide text-on-surface-variant truncate">
                {counter.label}
              </p>
              <p className="text-sm font-semibold text-on-surface mt-0.5 truncate">
                {counter.money ? (
                  <Money value={counter.value} variant="strong" className="text-sm" />
                ) : (
                  counter.value
                )}
              </p>
            </button>
          ))}
        </CardBody>
      </Card>

      <section aria-labelledby="aksi-cepat">
        <h2 id="aksi-cepat" className="text-sm font-semibold text-on-surface mb-2">
          Aksi Cepat
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => navigate(action.to)}
              className="no-print bg-surface-container-lowest border border-outline-variant/70 rounded-card p-4 flex flex-col items-center justify-center gap-2 hover:border-outline hover:bg-surface-container-low transition-colors active:scale-[0.98] transition-transform"
            >
              <span className="w-10 h-10 rounded-full bg-accent-soft flex items-center justify-center">
                <span className="material-symbols-outlined text-accent" aria-hidden="true">
                  {action.icon}
                </span>
              </span>
              <span className="text-xs font-medium text-on-surface text-center">{action.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
