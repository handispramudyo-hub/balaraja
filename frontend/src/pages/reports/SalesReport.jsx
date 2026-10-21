import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/format';
import PrintHeader from '../../components/ui/PrintHeader';
import PrintFooter from '../../components/ui/PrintFooter';
import { ErrorState, EmptyState } from '../../components/ui/States';
import ResponsiveTable from '../../components/ui/ResponsiveTable';
import ReportToolbar from '../../components/reports/ReportToolbar';
import ItemDetail from '../../components/reports/ItemDetail';
import { useReportExport, compactParams } from '../../hooks/useReportExport';

const statusConfig = {
  paid: { label: 'Lunas', color: 'bg-success-container text-success', icon: 'check_circle' },
  partial: { label: 'Sebagian', color: 'bg-warning-container text-warning', icon: 'schedule' },
  unpaid: { label: 'Belum Bayar', color: 'bg-error-container text-on-error-container', icon: 'cancel' },
};

export default function SalesReport() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(todayStr);
  const [customer, setCustomer] = useState('');
  const [status, setStatus] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState('ringkasan');

  const activeFilterCount = [startDate !== firstDay, endDate !== todayStr, customer, status].filter(Boolean).length;

  const filterParams = useMemo(
    () => compactParams({
      start_date: startDate,
      end_date: endDate,
      customer_id: customer,
      payment_status: status,
    }),
    [startDate, endDate, customer, status]
  );

  const { exporting, error: exportError, exportReport, clearError } = useReportExport('sales', filterParams);

  const { data: customersData } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const res = await api.get('/customers');
      return res.data;
    },
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sales-report', filterParams],
    queryFn: async () => {
      const res = await api.get('/reports/sales', { params: filterParams });
      return res.data;
    },
  });

  const items = data?.data || data || [];
  const customers = customersData?.data || customersData || [];

  // Header/footer memakai sum dari SERVER, bukan reduce di browser.
  // Kalau reduce lokal, begitu server menambah filter atau membulatkan
  // angka, total di layar bisa melenceng dari isi tabel.
  const serverSummary = data?.summary;
  const totalPenjualan = serverSummary?.omzet ?? items.reduce((s, r) => s + (r.total || 0), 0);
  const totalPembayaran = serverSummary?.diterima ?? items.reduce((s, r) => s + (r.pembayaran || r.bayar || 0), 0);
  const totalPiutang = serverSummary?.piutang ?? items.reduce((s, r) => s + (r.piutang || r.sisa_piutang || 0), 0);

  return (
    <main className="flex-grow px-4 py-6 overflow-y-auto print-area">
      <PrintHeader
        title="Laporan Penjualan"
        subtitle="Rekapitulasi transaksi penjualan"
        period={`${formatDate(startDate)} s/d ${formatDate(endDate)}`}
        summary={[
          { label: 'Total Penjualan', value: formatCurrency(totalPenjualan) },
          { label: 'Diterima', value: formatCurrency(totalPembayaran) },
          { label: 'Piutang', value: formatCurrency(totalPiutang) },
        ]}
      />
      <div className="no-print mb-6 flex flex-wrap justify-between items-end gap-3">
        <div>
          <h2 className="text-xl font-semibold text-on-surface mb-1">Laporan Penjualan</h2>
          <p className="text-sm text-on-surface-variant">Rekapitulasi transaksi penjualan</p>
        </div>
        <ReportToolbar
          view={view}
          onViewChange={setView}
          onPrint={() => window.print()}
          onExport={exportReport}
          exporting={exporting}
          exportNote={view === 'ringkasan' ? 'Export tetap berisi rincian barang (sheet Detail / PDF lengkap)' : null}
        />
      </div>

      {exportError && (
        <div className="no-print mb-4 flex items-start gap-2 rounded-xl bg-error-container text-on-error-container px-4 py-3 text-sm">
          <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
          <div className="flex-1">
            <p>{exportError}</p>
          </div>
          <button type="button" onClick={clearError} className="shrink-0" aria-label="Tutup pesan">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      <section className="no-print grid grid-cols-2 gap-2 mb-6">
        <div className="bg-primary-container text-on-primary-container rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
          <p className="text-xs opacity-80 mb-1">Total Penjualan</p>
          <p className="text-lg font-bold">{formatCurrency(totalPenjualan)}</p>
          <p className="text-[10px] opacity-70 mt-2">{items.length} Transaksi</p>
        </div>
        <div className="bg-error-container text-on-error-container rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-error/10 rounded-full blur-xl"></div>
          <p className="text-xs opacity-80 mb-1">Total Piutang</p>
          <p className="text-lg font-bold">{formatCurrency(totalPiutang)}</p>
          <p className="text-[10px] opacity-70 mt-2">{items.filter((r) => (r.piutang || r.sisa_piutang || 0) > 0).length} Transaksi Pending</p>
        </div>
      </section>

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
            <label className="text-xs font-medium text-on-surface-variant" htmlFor="toko-3">Toko</label>
            <div className="relative">
              <select
                id="toko-3"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                className="w-full h-12 bg-surface rounded-lg border border-outline-variant px-3 appearance-none text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors pr-10"
              >
                <option value="">Semua Toko</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.nama_toko || c.nama || c.name}</option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">arrow_drop_down</span>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-on-surface-variant" htmlFor="status-4">Status</label>
            <div className="relative">
              <select
                id="status-4"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full h-12 bg-surface rounded-lg border border-outline-variant px-3 appearance-none text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors pr-10"
              >
                <option value="">Semua Status</option>
                <option value="paid">Lunas</option>
                <option value="partial">Sebagian</option>
                <option value="unpaid">Belum Bayar</option>
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">arrow_drop_down</span>
            </div>
          </div>
        </section>
      )}

      {isLoading ? (
        <div className="no-print flex items-center justify-center h-40">
          <p className="text-on-surface-variant">Memuat data penjualan...</p>
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} title="Gagal memuat laporan penjualan" />
      ) : (
        <>
          <ResponsiveTable
            label="Laporan penjualan"
            rows={items}
            minWidth="760px"
            emptyState={
              <EmptyState icon="shopping_bag" title="Tidak ada penjualan" description="Belum ada transaksi penjualan pada periode ini." />
            }
            columns={[
              { key: 'no', header: 'No', render: (r, i) => i + 1, cellClass: 'text-on-surface-variant' },
              { key: 'no_trx', header: 'No Transaksi', render: (r) => r.no_transaksi || r.kode || '\u2014', cellClass: 'text-secondary font-medium' },
              { key: 'tanggal', header: 'Tanggal', render: (r) => formatDate(r.tanggal || r.tanggal_transaksi) },
              { key: 'toko', header: 'Toko', render: (r) => r.nama_toko || r.toko || r.customer || '\u2014' },
    // print-money menandai kolom angka untuk aturan @media print. Penanda ini
    // dipakai pada th DAN td karena table-layout:fixed mengambil lebar kolom
    // dari baris pertama, yaitu baris header. Selector :has(.tabular-nums)
    // tidak bisa dipakai: :has() hanya melihat keturunan, jadi tidak cocok
    // pada elemen yang memegangnya sendiri, dan aturan lebarnya diam-diam
    // tidak pernah berlaku.
    { key: 'total', header: 'Total', align: 'right', headClass: 'print-money', render: (r) => formatCurrency(r.total), cellClass: 'font-bold text-on-surface tabular-nums print-money' },
    { key: 'bayar', header: 'Pembayaran', align: 'right', headClass: 'print-money', render: (r) => formatCurrency(r.pembayaran || r.bayar), cellClass: 'text-success bg-success-container/30 tabular-nums print-money' },
    { key: 'piutang', header: 'Piutang', align: 'right', headClass: 'print-money', render: (r) => formatCurrency(r.piutang || r.sisa_piutang), cellClass: 'text-danger bg-danger-container/30 tabular-nums print-money' },

              {
                key: 'status', header: 'Status',
                render: (r) => {
                  const st = r.payment_status || ((r.piutang || r.sisa_piutang) > 0 ? ((r.pembayaran || r.bayar) > 0 ? 'partial' : 'unpaid') : 'paid');
                  const cfg = statusConfig[st] || statusConfig.unpaid;
                  return (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                      <span className="material-symbols-outlined text-[14px]">{cfg.icon}</span>
                      {cfg.label}
                    </span>
                  );
                },
              },
            ]}
            footer={
              <tr>
                <td className="p-3 text-right" colSpan="4">Total</td>
                <td className="p-3 text-right font-bold tabular-nums">{formatCurrency(totalPenjualan)}</td>
                <td className="p-3 text-right text-success tabular-nums">{formatCurrency(totalPembayaran)}</td>
                <td className="p-3 text-right text-danger tabular-nums">{formatCurrency(totalPiutang)}</td>
                <td></td>
              </tr>
            }
            cardTitle={(r) => r.no_transaksi || r.kode || '\u2014'}
            cardMeta={(r) => formatDate(r.tanggal || r.tanggal_transaksi)}
            cardBadge={(r) => {
              const st = r.payment_status || ((r.piutang || r.sisa_piutang) > 0 ? ((r.pembayaran || r.bayar) > 0 ? 'partial' : 'unpaid') : 'paid');
              const cfg = statusConfig[st] || statusConfig.unpaid;
              return <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.color}`}>{cfg.label}</span>;
            }}
            cardFields={[
              { label: 'Toko', full: true, render: (r) => r.nama_toko || r.toko || r.customer || '\u2014' },
              { label: 'Total', render: (r) => formatCurrency(r.total) },
              { label: 'Piutang', render: (r) => <span className="text-danger">{formatCurrency(r.piutang || r.sisa_piutang)}</span> },
            ]}
            cardFooter={(r) => (
              <div className="flex items-center justify-between text-xs">
                <span className="text-on-surface-variant">Sudah dibayar</span>
                <span className="font-semibold text-success tabular-nums">{formatCurrency(r.pembayaran || r.bayar)}</span>
              </div>
            )}
            expandedRow={
              view === 'detail' ? (r) => <ItemDetail items={r.items} transactionTotal={r.total} /> : undefined
            }
            cardDetail={
              view === 'detail'
                ? (r) => <ItemDetail items={r.items} variant="list" transactionTotal={r.total} />
                : undefined
            }
          />
        </>
      )}
      <PrintFooter />
    </main>
  );
}
