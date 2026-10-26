import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../lib/format';
import DateInput from '../../components/ui/DateInput';
import Select from '../../components/ui/Select';
import Money from '../../components/ui/Money';
import Badge from '../../components/ui/Badge';
import ReportShell from '../../components/reports/ReportShell';
import ReportToolbar from '../../components/reports/ReportToolbar';
import ResponsiveTable from '../../components/ui/ResponsiveTable';
import ItemDetail from '../../components/reports/ItemDetail';
import { EmptyState } from '../../components/ui/States';
import { useReportExport, compactParams } from '../../hooks/useReportExport';

// Bentuk & warna badge mengikuti laporan piutang supaya laporan utang dan
// piutang dibaca sebagai pasangan yang sama, bukan dua tabel terpisah.
const STATUS_META = {
  belum_bayar: { label: 'Belum Bayar', tone: 'danger', icon: 'cancel' },
  partial: { label: 'Sebagian', tone: 'warning', icon: 'schedule' },
  overdue: { label: 'Jatuh Tempo', tone: 'danger', icon: 'warning' },
  lunas: { label: 'Lunas', tone: 'success', icon: 'check_circle' },
};

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

function DebtBadge({ status }) {
  const cfg = STATUS_META[status] || STATUS_META.belum_bayar;
  return (
    <Badge tone={cfg.tone} icon={cfg.icon} size="sm">
      {cfg.label}
    </Badge>
  );
}

function monthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
}

export default function PurchaseReport() {
  const firstDay = monthStart();
  const todayStr = new Date().toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(todayStr);
  const [supplier, setSupplier] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [view, setView] = useState('ringkasan');

  const activeFilterCount = [startDate !== firstDay, endDate !== todayStr, supplier, filterStatus].filter(Boolean).length;

  // `payment_status` ikut dikirim ke server, bukan hanya dipakai untuk
  // menyembunyikan baris di browser. Kalau hanya difilter sisi klien, file
  // export tetap berisi transaksi yang justru tidak terlihat di layar.
  const filterParams = useMemo(
    () =>
      compactParams({
        start_date: startDate,
        end_date: endDate,
        supplier_id: supplier,
        payment_status: filterStatus,
      }),
    [startDate, endDate, supplier, filterStatus]
  );

  const { exporting, error: exportError, exportReport, clearError } = useReportExport('purchases', filterParams);

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => (await api.get('/suppliers')).data,
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['purchase-report', filterParams],
    queryFn: async () => (await api.get('/reports/purchases', { params: filterParams })).data,
  });

  const items = data?.data || data || [];
  const suppliers = suppliersData?.data || suppliersData || [];

  const serverSummary = data?.summary;
  const total = serverSummary?.total ?? items.reduce((s, r) => s + (r.total || 0), 0);
  const sisaUtang =
    serverSummary?.sisa_utang ?? items.reduce((s, r) => s + (r.sisa_utang ?? r.payable ?? 0), 0);
  const jumlahBelumLunas = items.filter((r) => getStatus(r) !== 'lunas').length;

  return (
    <ReportShell
      title="Laporan Pembelian"
      subtitle="Rekapitulasi transaksi pembelian dari supplier"
      breadcrumbLabel="Laporan"
      period={`${formatDate(startDate)} s/d ${formatDate(endDate)}`}
      summary={[
        { label: 'Jumlah Transaksi', value: `${items.length}` },
        { label: 'Total Pembelian', value: formatCurrency(total) },
        { label: 'Sisa Utang', value: formatCurrency(sisaUtang) },
      ]}
      toolbar={
        <ReportToolbar
          view={view}
          onViewChange={setView}
          onPrint={() => window.print()}
          onExport={exportReport}
          exporting={exporting}
          exportNote={
            view === 'ringkasan'
              ? 'Export tetap berisi rincian barang (sheet Detail / PDF lengkap)'
              : null
          }
        />
      }
      exportError={exportError}
      onClearExportError={clearError}
      stats={[
        {
          label: 'Total Pembelian',
          value: formatCurrency(total),
          note: `${items.length} transaksi`,
          className: 'bg-primary-container text-on-primary-container',
        },
        {
          label: 'Sisa Utang',
          value: formatCurrency(sisaUtang),
          note: `${jumlahBelumLunas} transaksi belum lunas`,
          className: 'bg-danger-container text-on-danger-container',
        },
        {
          label: 'Sudah Dibayar',
          value: formatCurrency(Math.max(total - sisaUtang, 0)),
          note: 'Pembayaran ke supplier',
        },
        {
          label: 'Rata-rata Pembelian',
          value: formatCurrency(items.length ? total / items.length : 0),
          note: 'Per transaksi',
        },
      ]}
      filters={{
        activeCount: activeFilterCount,
        onReset: () => {
          setStartDate(firstDay);
          setEndDate(todayStr);
          setSupplier('');
          setFilterStatus('');
        },
        children: (
          <>
            <DateInput value={startDate} onChange={setStartDate} aria-label="Tanggal awal" />
            <DateInput value={endDate} onChange={setEndDate} aria-label="Tanggal akhir" />
            <Select
              value={supplier}
              onChange={(event) => setSupplier(event.target.value)}
              aria-label="Filter supplier"
            >
              <option value="">Semua supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nama || s.name}
                </option>
              ))}
            </Select>
            <Select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
              aria-label="Filter status pembayaran"
            >
              <option value="">Semua status</option>
              <option value="unpaid">Belum Bayar</option>
              <option value="partial">Sebagian</option>
              <option value="paid">Lunas</option>
            </Select>
          </>
        ),
      }}
      isLoading={isLoading}
      isError={isError}
      error={error}
      onRetry={() => refetch()}
      loadingMessage="Memuat data pembelian..."
      errorTitle="Gagal memuat laporan pembelian"
    >
      <ResponsiveTable
        label="Laporan pembelian"
        rows={items}
        emptyState={
          <EmptyState
            icon="shopping_cart"
            title="Tidak ada pembelian"
            description="Belum ada transaksi pembelian pada periode ini."
          />
        }
        columns={[
          { key: 'no', header: 'No', render: (r, i) => i + 1, cellClass: 'text-on-surface-variant' },
          {
            key: 'no_pembelian',
            header: 'No Pembelian',
            render: (r) => r.no_pembelian || r.kode || '—',
            cellClass: 'text-secondary font-medium',
          },
          {
            key: 'tanggal',
            header: 'Tanggal',
            render: (r) => formatDate(r.tanggal || r.tanggal_pembelian),
          },
          {
            key: 'supplier',
            header: 'Supplier',
            render: (r) => r.nama_supplier || r.supplier || '—',
          },
          {
            key: 'total',
            header: 'Total',
            align: 'right',
            headClass: 'print-money',
            render: (r) => <Money value={r.total} variant="strong" />,
            cellClass: 'print-money',
          },
          {
            key: 'sisa_utang',
            header: 'Sisa Utang',
            align: 'right',
            headClass: 'print-money',
            render: (r) =>
              Number(r.sisa_utang ?? r.payable ?? 0) > 0 ? (
                <Money value={r.sisa_utang ?? r.payable} variant="danger" />
              ) : (
                <span className="text-on-surface-variant text-xs">-</span>
              ),
            cellClass: 'print-money',
          },
          {
            key: 'jatuh_tempo',
            header: 'Jatuh Tempo',
            headClass: 'print-num',
            render: (r) => (r.jatuh_tempo ? formatDate(r.jatuh_tempo) : '—'),
          },
          {
            key: 'status_pembayaran',
            header: 'Status',
            render: (r) => <DebtBadge status={paymentBadgeStatus(r)} />,
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
        cardTitle={(r) => r.no_pembelian || r.kode || '—'}
        cardMeta={(r) => formatDate(r.tanggal || r.tanggal_pembelian)}
        cardBadge={(r) => <Money value={r.total} variant="strong" className="text-sm" />}
        cardFields={[
          { label: 'Supplier', render: (r) => r.nama_supplier || r.supplier || '—' },
          {
            label: 'Sisa Utang',
            render: (r) =>
              Number(r.sisa_utang ?? r.payable ?? 0) > 0 ? (
                <Money value={r.sisa_utang ?? r.payable} variant="danger" />
              ) : (
                'Lunas'
              ),
          },
          { label: 'Status', render: (r) => <DebtBadge status={paymentBadgeStatus(r)} /> },
          { label: 'Kondisi', render: (r) => <DebtBadge status={getStatus(r)} /> },
        ]}
        expandedRow={view === 'detail' ? (r) => <ItemDetail items={r.items} transactionTotal={r.total} /> : undefined}
        cardDetail={
          view === 'detail'
            ? (r) => <ItemDetail items={r.items} variant="list" transactionTotal={r.total} />
            : undefined
        }
      />
    </ReportShell>
  );
}
