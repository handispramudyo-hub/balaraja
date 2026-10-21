import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/format';
import PrintHeader from '../../components/ui/PrintHeader';
import PrintFooter from '../../components/ui/PrintFooter';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import ResponsiveTable from '../../components/ui/ResponsiveTable';

export default function ExpenseReport() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(todayStr);
  const [category, setCategory] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const activeFilterCount = [startDate !== firstDay, endDate !== todayStr, category].filter(Boolean).length;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['expense-report', startDate, endDate, category],
    queryFn: async () => {
      const params = { start_date: startDate, end_date: endDate };
      if (category) params.category = category;
      const res = await api.get('/reports/expenses', { params });
      return res.data;
    },
  });

  const items = data?.data || data || [];

  const kategoriConfig = {
    transportasi: { label: 'Transportasi', icon: 'directions_car', tone: 'bg-primary-container text-on-primary-container' },
    ongkos_kirim: { label: 'Ongkos Kirim', icon: 'local_shipping', tone: 'bg-secondary-container text-on-secondary-container' },
    ongkir: { label: 'Ongkos Kirim', icon: 'local_shipping', tone: 'bg-secondary-container text-on-secondary-container' },
    operasional: { label: 'Operasional', icon: 'build', tone: 'bg-tertiary-fixed text-on-tertiary-fixed-variant' },
  };

  const humanize = (key) =>
    key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');

  const ringkasan = (data?.summary_by_category || [])
    .filter((s) => Number(s.total) > 0)
    .map((s) => ({
      key: s.kategori,
      total: Number(s.total) || 0,
      ...(kategoriConfig[s.kategori] || {
        label: humanize(s.kategori || '-'),
        icon: 'receipt_long',
        tone: 'bg-surface-container-high text-on-surface',
      }),
    }));

  //-total resmi dari server (bukan penjumlahan kategori hardcoded)
  const totalBiaya =
    Number(data?.total_expenses) || items.reduce((s, r) => s + (r.nominal || 0), 0);

  return (
    <main className="flex-grow px-4 py-6 overflow-y-auto print-area">
      <PrintHeader
        title="Laporan Biaya"
        subtitle="Rekapitulasi pengeluaran biaya operasional"
        period={`${formatDate(startDate)} s/d ${formatDate(endDate)}`}
        summary={[
          ...ringkasan.map((s) => ({ label: s.label, value: formatCurrency(s.total) })),
          { label: 'Grand Total', value: formatCurrency(totalBiaya) },
        ].slice(0, 3)}
      />
      <div className="no-print mb-6 flex justify-between items-end">
        <div>
          <h2 className="text-xl font-semibold text-on-surface mb-1">Laporan Biaya</h2>
          <p className="text-sm text-on-surface-variant">Rekapitulasi pengeluaran biaya</p>
        </div>
        <button
          onClick={() => window.print()}
          className="no-print bg-primary text-on-primary h-10 px-4 rounded-lg text-xs font-medium flex items-center gap-2 active:scale-95 transition-transform shadow-sm"
        >
          <span className="material-symbols-outlined text-[18px]">print</span> Cetak
        </button>
      </div>

      <button
        onClick={() => setShowFilters((v) => !v)}
        className="no-print w-full mb-6 flex items-center justify-between px-4 py-3 rounded-xl bg-surface border border-outline-variant/30 shadow-sm hover:bg-surface-container-high transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-on-surface">
          <span className="material-symbols-outlined text-[20px] text-primary">tune</span>
          Filter
          {activeFilterCount > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full bg-primary text-on-primary text-xs font-semibold">
              {activeFilterCount}
            </span>
          )}
        </span>
        <span className="material-symbols-outlined text-on-surface-variant transition-transform" style={{ transform: showFilters ? 'rotate(180deg)' : 'none' }}>
          expand_more
        </span>
      </button>

      {showFilters && (
        <section className="no-print bg-surface-container-lowest rounded-xl p-4 mb-6 shadow-sm border border-outline-variant/30 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-on-surface-variant" htmlFor="tanggal-awal-1">Tanggal Awal</label>
            <input
              id="tanggal-awal-1"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full h-12 bg-surface rounded-lg border border-outline-variant px-3 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-on-surface-variant" htmlFor="tanggal-akhir-2">Tanggal Akhir</label>
            <input
              id="tanggal-akhir-2"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full h-12 bg-surface rounded-lg border border-outline-variant px-3 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-on-surface-variant" htmlFor="kategori-3">Kategori</label>
            <div className="relative">
              <select
                id="kategori-3"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-12 bg-surface rounded-lg border border-outline-variant px-3 appearance-none text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors pr-10"
              >
                <option value="">Semua Kategori</option>
                <option value="transportasi">Transportasi</option>
                <option value="ongkos_kirim">Ongkos Kirim</option>
                <option value="operasional">Operasional</option>
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">arrow_drop_down</span>
            </div>
          </div>
        </section>
      )}

      {isLoading ? (
        <div className="no-print flex items-center justify-center h-40">
          <LoadingState rows={3} />
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} title="Gagal memuat laporan biaya" />
      ) : (
        <>
          <div className="mb-6">
            <ResponsiveTable
              label="Laporan biaya"
              rows={items}
              emptyState={
                <EmptyState icon="receipt_long" title="Tidak ada biaya" description="Belum ada pengeluaran pada periode atau kategori ini." />
              }
              columns={[
                { key: 'no', header: 'No', render: (r, i) => i + 1, cellClass: 'text-on-surface-variant' },
                { key: 'tanggal', header: 'Tanggal', render: (r) => formatDate(r.tanggal) },
                { key: 'kategori', header: 'Kategori', render: (r) => <span className="text-secondary font-medium">{r.kategori}</span> },
                { key: 'keterangan', header: 'Keterangan', render: (r) => r.keterangan || '-', cellClass: 'text-on-surface-variant' },
                { key: 'nominal', header: 'Nominal', align: 'right', render: (r) => formatCurrency(r.nominal), cellClass: 'font-bold text-on-surface tabular-nums' },
              ]}
              footer={
                <tr>
                  <td className="p-3 text-right" colSpan="4">Total</td>
                  <td className="p-3 text-right font-bold tabular-nums">{formatCurrency(totalBiaya)}</td>
                </tr>
              }
              cardTitle={(r) => r.kategori}
              cardMeta={(r) => formatDate(r.tanggal)}
              cardBadge={(r) => (
                <span className="text-sm font-bold text-on-surface tabular-nums">{formatCurrency(r.nominal)}</span>
              )}
              cardFields={[{ label: 'Keterangan', full: true, render: (r) => r.keterangan || '-' }]}
            />
          </div>

          {ringkasan.length > 0 && (
            <div className="no-print grid grid-cols-2 gap-3">
              {ringkasan.map((s) => (
                <div key={s.key} className={`${s.tone} rounded-xl p-4 shadow-sm relative overflow-hidden`}>
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
                  <div className="relative flex items-center gap-3">
                    <div className="w-10 h-10 shrink-0 rounded-full bg-black/10 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[20px]">{s.icon}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs opacity-80 truncate">{s.label}</p>
                      <p className="text-lg font-bold truncate">{formatCurrency(s.total)}</p>
                    </div>
                  </div>
                </div>
              ))}
              <div className="bg-primary text-on-primary rounded-xl p-4 shadow-sm relative overflow-hidden">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
                <div className="relative flex items-center gap-3">
                  <div className="w-10 h-10 shrink-0 rounded-full bg-white/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs opacity-80">Grand Total</p>
                    <p className="text-lg font-bold truncate">{formatCurrency(totalBiaya)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      <PrintFooter />
    </main>
  );
}
