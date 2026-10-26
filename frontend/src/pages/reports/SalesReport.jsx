import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../lib/format';
import DateInput from '../../components/ui/DateInput';
import Select from '../../components/ui/Select';
import Money from '../../components/ui/Money';
import { StatusBadge } from '../../components/ui/Badge';
import ReportShell from '../../components/reports/ReportShell';
import ReportToolbar from '../../components/reports/ReportToolbar';
import ResponsiveTable from '../../components/ui/ResponsiveTable';
import ItemDetail from '../../components/reports/ItemDetail';
import { EmptyState } from '../../components/ui/States';
import { useReportExport, compactParams } from '../../hooks/useReportExport';

function monthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
}

export default function SalesReport() {
  const firstDay = monthStart();
  const todayStr = new Date().toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(todayStr);
  const [customer, setCustomer] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState('ringkasan');

  const activeFilterCount = [startDate !== firstDay, endDate !== todayStr, customer, status].filter(Boolean).length;

  const filterParams = useMemo(
    () =>
      compactParams({
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
    queryFn: async () => (await api.get('/customers')).data,
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sales-report', filterParams],
    queryFn: async () => (await api.get('/reports/sales', { params: filterParams })).data,
  });

  const items = data?.data || data || [];
  const customers = customersData?.data || customersData || [];

  // Header/footer memakai sum dari SERVER, bukan reduce di browser.
  // Kalau reduce lokal, begitu server menambah filter atau membulatkan
  // angka, total di layar bisa melenceng dari isi tabel.
  const serverSummary = data?.summary;
  const totalPenjualan = serverSummary?.omzet ?? items.reduce((s, r) => s + (r.total || 0), 0);
  const totalPembayaran =
    serverSummary?.diterima ?? items.reduce((s, r) => s + (r.pembayaran || r.bayar || 0), 0);
  const totalPiutang =
    serverSummary?.piutang ?? items.reduce((s, r) => s + (r.piutang || r.sisa_piutang || 0), 0);
  const jumlahBelumLunas = items.filter(
    (r) => (r.piutang || r.sisa_piutang || 0) > 0
  ).length;

  return (
    <ReportShell
      title="Laporan Penjualan"
      subtitle="Rekapitulasi transaksi penjualan"
      breadcrumbLabel="Laporan"
      period={`${formatDate(startDate)} s/d ${formatDate(endDate)}`}
      summary={[
        { label: 'Total Penjualan', value: formatCurrency(totalPenjualan) },
        { label: 'Diterima', value: formatCurrency(totalPembayaran) },
        { label: 'Piutang', value: formatCurrency(totalPiutang) },
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
          label: 'Total Penjualan',
          value: formatCurrency(totalPenjualan),
          note: `${items.length} transaksi`,
          className: 'bg-primary-container text-on-primary-container',
        },
        {
          label: 'Diterima',
          value: formatCurrency(totalPembayaran),
          note: 'Sudah dibayar pelanggan',
        },
        {
          label: 'Piutang',
          value: formatCurrency(totalPiutang),
          note: `${jumlahBelumLunas} transaksi belum lunas`,
          className: 'bg-danger-container text-on-danger-container',
        },
        {
          label: 'Rata-rata Transaksi',
          value: formatCurrency(items.length ? totalPenjualan / items.length : 0),
          note: 'Per transaksi',
        },
      ]}
      filters={{
        activeCount: activeFilterCount,
        onReset: () => {
          setStartDate(firstDay);
          setEndDate(todayStr);
          setCustomer('');
          setStatus('');
        },
        children: (
          <>
            <DateInput value={startDate} onChange={setStartDate} aria-label="Tanggal awal" />
            <DateInput value={endDate} onChange={setEndDate} aria-label="Tanggal akhir" />
            <Select
              value={customer}
              onChange={(event) => setCustomer(event.target.value)}
              aria-label="Filter pelanggan"
            >
              <option value="">Semua pelanggan</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nama_toko || c.nama || c.name}
                </option>
              ))}
            </Select>
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Filter status pembayaran"
            >
              <option value="">Semua status</option>
              <option value="paid">Lunas</option>
              <option value="partial">Sebagian</option>
              <option value="unpaid">Belum Bayar</option>
            </Select>
          </>
        ),
      }}
      isLoading={isLoading}
      isError={isError}
      error={error}
      onRetry={() => refetch()}
      loadingMessage="Memuat data penjualan..."
      errorTitle="Gagal memuat laporan penjualan"
    >
      <ResponsiveTable
        label="Laporan penjualan"
        rows={items}
        minWidth="760px"
        emptyState={
          <EmptyState
            icon="shopping_bag"
            title="Tidak ada penjualan"
            description="Belum ada transaksi penjualan pada periode ini."
          />
        }
        columns={[
          { key: 'no', header: 'No', render: (r, i) => i + 1, cellClass: 'text-on-surface-variant' },
          {
            key: 'no_trx',
            header: 'No Transaksi',
            render: (r) => r.no_transaksi || r.kode || '—',
            cellClass: 'text-secondary font-medium',
          },
          {
            key: 'tanggal',
            header: 'Tanggal',
            render: (r) => formatDate(r.tanggal || r.tanggal_transaksi),
          },
          {
            key: 'toko',
            header: 'Pelanggan',
            render: (r) => r.nama_toko || r.toko || r.customer || '—',
          },
          // print-money menandai kolom angka untuk aturan @media print. Penanda
          // ini dipakai pada th DAN td karena table-layout:fixed mengambil
          // lebar kolom dari baris pertama, yaitu baris header.
          {
            key: 'total',
            header: 'Total',
            align: 'right',
            headClass: 'print-money',
            render: (r) => <Money value={r.total} variant="strong" />,
            cellClass: 'print-money',
          },
          {
            key: 'bayar',
            header: 'Pembayaran',
            align: 'right',
            headClass: 'print-money',
            render: (r) => <Money value={r.pembayaran || r.bayar} variant="success" />,
            cellClass: 'print-money',
          },
          {
            key: 'piutang',
            header: 'Piutang',
            align: 'right',
            headClass: 'print-money',
            render: (r) =>
              Number(r.piutang || r.sisa_piutang || 0) > 0 ? (
                <Money value={r.piutang || r.sisa_piutang} variant="danger" />
              ) : (
                <span className="text-on-surface-variant text-xs">-</span>
              ),
            cellClass: 'print-money',
          },
          {
            key: 'status',
            header: 'Status',
            render: (r) => (
              <StatusBadge
                kind="payment"
                value={
                  r.payment_status ||
                  ((r.piutang || r.sisa_piutang) > 0
                    ? (r.pembayaran || r.bayar) > 0
                      ? 'partial'
                      : 'unpaid'
                    : 'paid')
                }
              />
            ),
          },
        ]}
        footer={
          <tr>
            <td className="p-3 text-right" colSpan="4">Total</td>
            <td className="p-3 text-right font-bold tabular-nums print-money">
              {formatCurrency(totalPenjualan)}
            </td>
            <td className="p-3 text-right text-success tabular-nums print-money">
              {formatCurrency(totalPembayaran)}
            </td>
            <td className="p-3 text-right text-danger tabular-nums print-money">
              {formatCurrency(totalPiutang)}
            </td>
            <td></td>
          </tr>
        }
        cardTitle={(r) => r.no_transaksi || r.kode || '—'}
        cardMeta={(r) => formatDate(r.tanggal || r.tanggal_transaksi)}
        cardBadge={(r) => (
          <StatusBadge
            kind="payment"
            value={
              r.payment_status ||
              ((r.piutang || r.sisa_piutang) > 0
                ? (r.pembayaran || r.bayar) > 0
                  ? 'partial'
                  : 'unpaid'
                : 'paid')
            }
          />
        )}
        cardFields={[
          { label: 'Pelanggan', full: true, render: (r) => r.nama_toko || r.toko || r.customer || '—' },
          { label: 'Total', render: (r) => <Money value={r.total} variant="strong" /> },
          {
            label: 'Piutang',
            render: (r) =>
              Number(r.piutang || r.sisa_piutang || 0) > 0 ? (
                <Money value={r.piutang || r.sisa_piutang} variant="danger" />
              ) : (
                'Lunas'
              ),
          },
        ]}
        cardFooter={(r) => (
          <div className="flex items-center justify-between text-xs">
            <span className="text-on-surface-variant">Sudah dibayar</span>
            <Money
              value={r.pembayaran || r.bayar}
              variant="success"
              className="font-semibold"
            />
          </div>
        )}
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
