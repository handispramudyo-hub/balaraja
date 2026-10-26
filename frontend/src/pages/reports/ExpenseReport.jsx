import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../lib/format';
import DateInput from '../../components/ui/DateInput';
import Select from '../../components/ui/Select';
import Money from '../../components/ui/Money';
import Badge from '../../components/ui/Badge';
import ReportShell, { ExportPlaceholderButton } from '../../components/reports/ReportShell';
import ReportToolbar from '../../components/reports/ReportToolbar';
import ResponsiveTable from '../../components/ui/ResponsiveTable';
import { EmptyState } from '../../components/ui/States';

const KATEGORI = {
  transportasi: { label: 'Transportasi', icon: 'directions_car', tone: 'primary' },
  ongkos_kirim: { label: 'Ongkos Kirim', icon: 'local_shipping', tone: 'info' },
  ongkir: { label: 'Ongkos Kirim', icon: 'local_shipping', tone: 'info' },
  operasional: { label: 'Operasional', icon: 'build', tone: 'neutral' },
};

function humanize(key) {
  return (key || '-').charAt(0).toUpperCase() + (key || '').slice(1).replace(/_/g, ' ');
}

function monthStart() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return first.toISOString().split('T')[0];
}

export default function ExpenseReport() {
  const firstDay = monthStart();
  const todayStr = new Date().toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(todayStr);
  const [category, setCategory] = useState('');

  const activeFilterCount = [startDate !== firstDay, endDate !== todayStr, category].filter(Boolean).length;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['expense-report', startDate, endDate, category],
    queryFn: async () => {
      const params = { start_date: startDate, end_date: endDate };
      if (category) params.category = category;
      return (await api.get('/reports/expenses', { params })).data;
    },
  });

  const items = data?.data || data || [];

  const ringkasan = (data?.summary_by_category || [])
    .filter((s) => Number(s.total) > 0)
    .map((s) => ({
      key: s.kategori,
      total: Number(s.total) || 0,
      ...(KATEGORI[s.kategori] || {
        label: humanize(s.kategori),
        icon: 'receipt_long',
        tone: 'neutral',
      }),
    }));

  const totalBiaya =
    Number(data?.total_expenses) || items.reduce((s, r) => s + (r.nominal || 0), 0);

  const stats = [
    ...ringkasan.map((s) => ({
      label: s.label,
      value: formatCurrency(s.total),
      className: 'bg-surface-container-lowest border border-outline-variant/70',
    })),
    {
      label: 'Grand Total',
      value: formatCurrency(totalBiaya),
      className: 'bg-primary-container text-on-primary-container',
    },
  ].slice(0, 4);

  return (
    <ReportShell
      title="Laporan Biaya"
      subtitle="Rekapitulasi pengeluaran biaya operasional"
      breadcrumbLabel="Laporan"
      period={`${formatDate(startDate)} s/d ${formatDate(endDate)}`}
      summary={[
        ...ringkasan.map((s) => ({ label: s.label, value: formatCurrency(s.total) })),
        { label: 'Grand Total', value: formatCurrency(totalBiaya) },
      ].slice(0, 3)}
      toolbar={
        <>
          <ReportToolbar
            showViewToggle={false}
            onPrint={() => window.print()}
          />
          <ExportPlaceholderButton label="Export Excel" />
        </>
      }
      stats={stats}
      filters={{
        activeCount: activeFilterCount,
        onReset: () => {
          setStartDate(firstDay);
          setEndDate(todayStr);
          setCategory('');
        },
        children: (
          <>
            <DateInput
              value={startDate}
              onChange={setStartDate}
              aria-label="Tanggal awal"
            />
            <DateInput
              value={endDate}
              onChange={setEndDate}
              aria-label="Tanggal akhir"
            />
            <Select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              aria-label="Filter kategori"
            >
              <option value="">Semua kategori</option>
              <option value="transportasi">Transportasi</option>
              <option value="ongkos_kirim">Ongkos Kirim</option>
              <option value="operasional">Operasional</option>
            </Select>
          </>
        ),
      }}
      isLoading={isLoading}
      isError={isError}
      error={error}
      onRetry={() => refetch()}
      loadingMessage="Memuat data biaya..."
      errorTitle="Gagal memuat laporan biaya"
    >
      <ResponsiveTable
        label="Laporan biaya"
        rows={items}
        emptyState={
          <EmptyState
            icon="receipt_long"
            title="Tidak ada biaya"
            description="Belum ada pengeluaran pada periode atau kategori ini."
          />
        }
        columns={[
          { key: 'no', header: 'No', render: (r, i) => i + 1, cellClass: 'text-on-surface-variant' },
          { key: 'tanggal', header: 'Tanggal', render: (r) => formatDate(r.tanggal) },
          {
            key: 'kategori',
            header: 'Kategori',
            render: (r) => (
              <Badge tone={KATEGORI[r.kategori]?.tone || 'neutral'} size="sm">
                {KATEGORI[r.kategori]?.label || humanize(r.kategori)}
              </Badge>
            ),
          },
          {
            key: 'keterangan',
            header: 'Keterangan',
            render: (r) => r.keterangan || '-',
            cellClass: 'text-on-surface-variant',
          },
          {
            key: 'nominal',
            header: 'Nominal',
            align: 'right',
            headClass: 'print-money',
            render: (r) => <Money value={r.nominal} variant="strong" />,
            cellClass: 'print-money',
          },
        ]}
        footer={
          <tr>
            <td className="p-3 text-right" colSpan="4">Total</td>
            <td className="p-3 text-right font-bold tabular-nums print-money">
              {formatCurrency(totalBiaya)}
            </td>
          </tr>
        }
        cardTitle={(r) => KATEGORI[r.kategori]?.label || humanize(r.kategori)}
        cardMeta={(r) => formatDate(r.tanggal)}
        cardBadge={(r) => <Money value={r.nominal} variant="strong" className="text-sm" />}
        cardFields={[{ label: 'Keterangan', full: true, render: (r) => r.keterangan || '-' }]}
      />
    </ReportShell>
  );
}
