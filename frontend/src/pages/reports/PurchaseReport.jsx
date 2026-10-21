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

// Bentuk & warna badge mengikuti `ReceivableReport` supaya laporan piutang dan
// laporan utang dibaca sebagai pasangan yang sama, bukan dua tabel terpisah
// yang kebetulan sama-sama punya kolom Status.
const statusConfig = {
  belum_bayar: { label: 'Belum Bayar', color: 'bg-error-container text-on-error-container', icon: 'cancel' },
  partial: { label: 'Sebagian', color: 'bg-warning-container text-warning', icon: 'schedule' },
  overdue: { label: 'Jatuh Tempo', color: 'bg-error-container text-on-error-container', icon: 'warning' },
  lunas: { label: 'Lunas', color: 'bg-success-container text-success', icon: 'check_circle' },
};

const STATUS_LABEL = {
  unpaid: 'Belum Bayar',
  partial: 'Sebagian',
  paid: 'Lunas',
};

// Enum dari DB dan key badge lokal sengaja dipisahkan karena nilainya memang
// berbeda: `payment_status` berisi `unpaid/partial/paid`, sedangkan
// `statusConfig` memakai `belum_bayar/partial/overdue/lunas`. Tanpa pemetaan
// eksplisit di antaranya, `paid` tidak akan ketemu dan jatuh ke fallback
// `belum_bayar` - transaksi yang sudah lunas tampil merah "Belum Bayar".
// Kesalahan bacaan seperti itu paling merusak, karena membuat kasir menagih
// pelanggan yang sebenarnya sudah melunasi.
const STATUS_FROM_DB = {
  unpaid: 'belum_bayar',
  partial: 'partial',
  paid: 'lunas',
};

function paymentBadgeStatus(row) {
  return STATUS_FROM_DB[row.status_pembayaran] || 'belum_bayar';
}

// Utang lewat jatuh tempo dilaporkan terpisah dari status pembayaran, karena
// "sudah bayar" dan "tepat waktu" adalah dua pertanyaan berbeda. Urutan
// pemeriksaan penting: lunas dicek lebih dulu supaya transaksi yang sudah
// dibayar tidak ikut ditandai lewat tempo hanya karena Due masih terisi.
function getStatus(r) {
  const sisa = Number(r.sisa_utang ?? r.payable ?? 0);
  if (sisa <= 0) return 'lunas';
  const today = new Date().toISOString().split('T')[0];
  if (r.jatuh_tempo && r.jatuh_tempo < today) return 'overdue';
  return r.status_pembayaran === 'partial' ? 'partial' : 'belum_bayar';
}

function StatusBadge({ status }) {
  const cfg = statusConfig[status] || statusConfig.belum_bayar;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <span className="material-symbols-outlined text-[13px]">{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}

export default function PurchaseReport() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(todayStr);
  const [supplier, setSupplier] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState('ringkasan');
  const [filterStatus, setFilterStatus] = useState('');

  const activeFilterCount = [startDate !== firstDay, endDate !== todayStr, supplier, filterStatus].filter(Boolean).length;

  // `payment_status` ikut dikirim ke server, bukan hanya dipakai untuk
  // menyembunyikan baris di browser. Kalau hanya difilter sisi klien, file
  // export tetap berisi transaksi yang justru tidak terlihat di layar.
  const filterParams = useMemo(
    () => compactParams({ start_date: startDate, end_date: endDate, supplier_id: supplier, payment_status: filterStatus }),
    [startDate, endDate, supplier, filterStatus]
  );

  const { exporting, error: exportError, exportReport, clearError } = useReportExport('purchases', filterParams);

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const res = await api.get('/suppliers');
      return res.data;
    },
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['purchase-report', filterParams],
    queryFn: async () => {
      const res = await api.get('/reports/purchases', { params: filterParams });
      return res.data;
    },
  });

  const items = data?.data || data || [];
  const suppliers = suppliersData?.data || suppliersData || [];

  // Total dari server, dengan fallback reduce lokal.
  const serverSummary = data?.summary;
  const total = serverSummary?.total ?? items.reduce((s, r) => s + (r.total || 0), 0);
  // Utang tersisa tidak boleh hilang hanya karena summary server tidak
  // mengirimnya (mis. backend lama masih jalan). Kalau `sisa_utang`
  // undefined, jumlahkan sendiri dari `payable` per baris.
  const sisaUtang = serverSummary?.sisa_utang
    ?? items.reduce((s, r) => s + (r.sisa_utang ?? r.payable ?? 0), 0);

  return (
    <main className="flex-grow px-4 py-6 overflow-y-auto print-area">
      <PrintHeader
        title="Laporan Pembelian"
        subtitle="Rekapitulasi transaksi pembelian dari supplier"
        period={`${formatDate(startDate)} s/d ${formatDate(endDate)}`}
        summary={[
          { label: 'Jumlah Transaksi', value: `${items.length}` },
          { label: 'Total Pembelian', value: formatCurrency(total) },
          { label: 'Sisa Utang', value: formatCurrency(sisaUtang) },
        ]}
      />
      <div className="no-print mb-6 flex flex-wrap justify-between items-end gap-3">
        <div>
          <h2 className="text-xl font-semibold text-on-surface mb-1">Laporan Pembelian</h2>
          <p className="text-sm text-on-surface-variant">Rekapitulasi transaksi pembelian</p>
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
            <label className="text-xs font-medium text-on-surface-variant" htmlFor="supplier-3">Supplier</label>
            <div className="relative">
              <select
                id="supplier-3"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="w-full h-12 bg-surface rounded-lg border border-outline-variant px-3 appearance-none text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors pr-10"
              >
                <option value="">Semua Supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.nama || s.name}</option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">arrow_drop_down</span>
            </div>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="text-xs font-medium text-on-surface-variant" htmlFor="status-4">Status Pembayaran</label>
            <div className="relative">
              <select
                id="status-4"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full h-12 bg-surface rounded-lg border border-outline-variant px-3 appearance-none text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors pr-10"
              >
                <option value="">Semua Status</option>
                <option value="unpaid">Belum Bayar</option>
                <option value="partial">Sebagian</option>
                <option value="paid">Lunas</option>
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">arrow_drop_down</span>
            </div>
          </div>
        </section>
      )}

      {isLoading ? (
        <div className="no-print flex items-center justify-center h-40">
          <p className="text-on-surface-variant">Memuat data pembelian...</p>
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} title="Gagal memuat laporan pembelian" />
      ) : (
        <ResponsiveTable
          label="Laporan pembelian"
          rows={items}
          emptyState={
            <EmptyState icon="shopping_cart" title="Tidak ada pembelian" description="Belum ada transaksi pembelian pada periode ini." />
          }
          columns={[
            { key: 'no', header: 'No', render: (r, i) => i + 1, cellClass: 'text-on-surface-variant' },
            { key: 'no_pembelian', header: 'No Pembelian', render: (r) => r.no_pembelian || r.kode || '\u2014', cellClass: 'text-secondary font-medium' },
            { key: 'tanggal', header: 'Tanggal', render: (r) => formatDate(r.tanggal || r.tanggal_pembelian) },
            { key: 'supplier', header: 'Supplier', render: (r) => r.nama_supplier || r.supplier || '\u2014' },
            { key: 'total', header: 'Total', align: 'right', headClass: 'print-money', render: (r) => formatCurrency(r.total), cellClass: 'font-bold text-on-surface tabular-nums print-money' },
            {
              key: 'sisa_utang',
              header: 'Sisa Utang',
              align: 'right',
              headClass: 'print-money',
              render: (r) => formatCurrency(r.sisa_utang ?? r.payable ?? 0),
              cellClass: 'tabular-nums print-money text-error font-medium',
            },
            { key: 'jatuh_tempo', header: 'Jatuh Tempo', headClass: 'print-num', render: (r) => (r.jatuh_tempo ? formatDate(r.jatuh_tempo) : '—') },
            {
              key: 'status_pembayaran',
              header: 'Status',
              render: (r) => <StatusBadge status={paymentBadgeStatus(r)} />,
            },
          ]}
          footer={
            <tr>
              <td className="p-3 text-right" colSpan="4">Total</td>
              <td className="p-3 text-right font-bold tabular-nums print-money">{formatCurrency(total)}</td>
              <td className="p-3 text-right font-bold tabular-nums print-money">{formatCurrency(sisaUtang)}</td>
              <td className="p-3" colSpan="2" />
            </tr>
          }
          cardTitle={(r) => r.no_pembelian || r.kode || '\u2014'}
          cardMeta={(r) => formatDate(r.tanggal || r.tanggal_pembelian)}
          cardFields={[
            { label: 'Supplier', render: (r) => r.nama_supplier || r.supplier || '\u2014' },
            { label: 'Sisa Utang', render: (r) => formatCurrency(r.sisa_utang ?? r.payable ?? 0) },
            { label: 'Status', render: (r) => STATUS_LABEL[r.status_pembayaran] || '—' },
            { label: 'Kondisi', render: (r) => statusConfig[getStatus(r)]?.label || '—' },
          ]}
          cardBadge={(r) => (
            <span className="text-sm font-bold text-on-surface tabular-nums">{formatCurrency(r.total)}</span>
          )}
          expandedRow={view === 'detail' ? (r) => <ItemDetail items={r.items} transactionTotal={r.total} /> : undefined}
          cardDetail={
            view === 'detail'
              ? (r) => <ItemDetail items={r.items} variant="list" transactionTotal={r.total} />
              : undefined
          }
        />
      )}
      <PrintFooter />
    </main>
  );
}
