import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody } from '../../components/ui/Card';
import DataTable from '../../components/ui/DataTable';
import SearchInput from '../../components/ui/SearchInput';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import Badge, { StatusBadge } from '../../components/ui/Badge';
import Money from '../../components/ui/Money';
import { EmptyState } from '../../components/ui/States';
import { formatDateShort, daysUntil } from '../../lib/format';

/**
 * Halaman Utang Supplier.
 *
 * Dipisah dari "Pelunasan Utang" karena keduanya berbeda tugas: halaman ini
 * menunjukkan APA YANG DIPINJAM (posisi utang), sedangkan pelunasan
 * menunjukkan APA YANG SUDAH DIBAYAR (riwayat pembayaran). Sebelumnya
 * keduanya menunjuk ke rute yang sama, jadi satu menu tidak pernah bisa
 * dijangkau.
 *
 * Sumber data: `/api/purchases?has_debt=1` — server sudah memfilter
 * transaksi yang sisa utangnya di atas nol, jadi halaman ini tidak pernah
 * menampilkan transaksi lunas.
 */
export default function PayablesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [sortBy, setSortBy] = useState('due_date');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['payables', supplierId],
    queryFn: async () => {
      const res = await api.get('/purchases', {
        params: {
          has_debt: 1,
          per_page: 200,
          ...(supplierId ? { supplier_id: supplierId } : {}),
        },
      });
      return res.data;
    },
  });

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const res = await api.get('/suppliers');
      return res.data;
    },
  });

  const supplierList = suppliers?.data || suppliers || [];
  const purchases = useMemo(() => data?.data || data || [], [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = term
      ? purchases.filter((purchase) =>
          `${purchase.purchase_number ?? ''} ${purchase.supplier?.name ?? ''}`
            .toLowerCase()
            .includes(term)
        )
      : purchases;

    const sorted = [...rows];
    if (sortBy === 'due_date') {
      sorted.sort((a, b) => {
        const ad = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        const bd = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        return ad - bd;
      });
    } else if (sortBy === 'payable') {
      sorted.sort((a, b) => Number(b.payable ?? 0) - Number(a.payable ?? 0));
    } else {
      sorted.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return sorted;
  }, [purchases, search, sortBy]);

  const summary = useMemo(() => {
    const total = filtered.reduce((sum, purchase) => sum + Number(purchase.payable ?? 0), 0);
    const overdue = filtered.filter((purchase) => {
      const days = daysUntil(purchase.due_date);
      return days !== null && days < 0;
    });
    const overdueTotal = overdue.reduce((sum, purchase) => sum + Number(purchase.payable ?? 0), 0);
    return {
      total,
      count: filtered.length,
      overdueCount: overdue.length,
      overdueTotal,
      supplierCount: new Set(filtered.map((purchase) => purchase.supplier_id)).size,
    };
  }, [filtered]);

  const columns = [
    {
      key: 'purchase_number',
      header: 'No. Transaksi',
      sortable: true,
      render: (purchase) => (
        <span className="font-medium text-on-surface">{purchase.purchase_number}</span>
      ),
    },
    {
      key: 'date',
      header: 'Tanggal',
      sortable: true,
      render: (purchase) => <span className="text-on-surface-variant">{formatDateShort(purchase.date)}</span>,
    },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (purchase) => (
        <span className="text-on-surface-variant">{purchase.supplier?.name || '-'}</span>
      ),
    },
    {
      key: 'due_date',
      header: 'Jatuh Tempo',
      sortable: true,
      sortValue: (purchase) => purchase.due_date ?? '',
      render: (purchase) => {
        const days = daysUntil(purchase.due_date);
        if (!purchase.due_date) return <span className="text-on-surface-variant">-</span>;
        return (
          <div className="flex flex-col">
            <span className={days !== null && days < 0 ? 'text-danger font-medium' : ''}>
              {formatDateShort(purchase.due_date)}
            </span>
            {days !== null && days < 0 && (
              <span className="text-2xs text-danger">Lewat {Math.abs(days)} hari</span>
            )}
          </div>
        );
      },
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      sortable: true,
      render: (purchase) => (
        <Money value={purchase.total} variant="muted" className="text-xs" />
      ),
    },
    {
      key: 'payable',
      header: 'Sisa Utang',
      align: 'right',
      sortable: true,
      render: (purchase) => <Money value={purchase.payable} variant="strong" />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (purchase) => <StatusBadge kind="payment" value={purchase.payment_status} />,
    },
    {
      key: 'aksi',
      header: 'Aksi',
      align: 'right',
      render: (purchase) => (
        <Button
          size="xs"
          variant="secondary"
          icon="payments"
          onClick={() => navigate(`/pelunasan-utang?purchase=${purchase.id}`)}
        >
          Bayar
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Utang Supplier"
        subtitle="Sisa kewajiban kepada supplier dari transaksi pembelian yang belum lunas"
        breadcrumbs={[{ label: 'Keuangan', to: '/piutang' }, { label: 'Utang Supplier' }]}
        actions={
          <Button
            variant="outline"
            size="sm"
            icon="receipt_long"
            onClick={() => navigate('/pelunasan-utang')}
          >
            Riwayat Pelunasan
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardBody className="py-3">
            <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Total Utang</p>
            <Money value={summary.total} variant="strong" className="text-base mt-1 block" />
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-3">
            <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Transaksi Utang</p>
            <p className="text-base font-semibold text-on-surface mt-1">
              {summary.count} <span className="text-xs font-normal text-on-surface-variant">transaksi</span>
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-3">
            <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Supplier</p>
            <p className="text-base font-semibold text-on-surface mt-1">
              {summary.supplierCount} <span className="text-xs font-normal text-on-surface-variant">supplier</span>
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-3">
            <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Lewat Jatuh Tempo</p>
            {summary.overdueCount > 0 ? (
              <>
                <Money value={summary.overdueTotal} variant="danger" className="text-base mt-1 block" />
                <Badge tone="danger" size="sm" className="mt-1">
                  {summary.overdueCount} transaksi
                </Badge>
              </>
            ) : (
              <p className="text-base font-semibold text-success mt-1">Tidak ada</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Cari nomor transaksi atau supplier…"
          className="sm:max-w-xs"
        />
        <Select
          value={supplierId}
          onChange={(event) => setSupplierId(event.target.value)}
          aria-label="Filter supplier"
          className="sm:max-w-[220px]"
        >
          <option value="">Semua supplier</option>
          {supplierList.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </Select>
        <Select
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value)}
          aria-label="Urutkan"
          className="sm:max-w-[200px]"
        >
          <option value="due_date">Urut: jatuh tempo</option>
          <option value="payable">Urut: sisa utang</option>
          <option value="date">Urut: tanggal transaksi</option>
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(row) => row.id}
        loading={isLoading}
        minWidth="860px"
        emptyState={
          isError ? (
            <div role="alert" className="py-6 text-center">
              <p className="text-sm font-medium text-danger">Gagal memuat data utang</p>
              <p className="text-xs text-on-surface-variant mt-1">
                {error?.response?.status
                  ? `Server merespons dengan kesalahan (${error.response.status}).`
                  : 'Periksa koneksi internet Anda lalu coba lagi.'}
              </p>
              <Button size="sm" variant="outline" icon="refresh" className="mt-3" onClick={() => refetch()}>
                Coba Lagi
              </Button>
            </div>
          ) : (
            <EmptyState
              icon="paid"
              title="Tidak ada utang"
              description={
                search.trim() || supplierId
                  ? 'Tidak ada transaksi utang yang cocok dengan filter.'
                  : 'Semua pembelian sudah lunas. Tidak ada kewajiban yang tertunda.'
              }
            />
          )
        }
        cardTitle={(purchase) => purchase.purchase_number}
        cardMeta={(purchase) => `${purchase.supplier?.name || '-'} · ${formatDateShort(purchase.date)}`}
        cardBadge={(purchase) => <Money value={purchase.payable} variant="strong" />}
        cardFields={[
          { label: 'Total', render: (purchase) => <Money value={purchase.total} variant="muted" /> },
          { label: 'Sisa Utang', render: (purchase) => <Money value={purchase.payable} variant="strong" /> },
          {
            label: 'Jatuh Tempo',
            render: (purchase) =>
              purchase.due_date ? formatDateShort(purchase.due_date) : '-',
          },
          {
            label: 'Status',
            render: (purchase) => <StatusBadge kind="payment" value={purchase.payment_status} />,
          },
        ]}
        cardActions={(purchase) => (
          <button
            type="button"
            onClick={() => navigate(`/pelunasan-utang?purchase=${purchase.id}`)}
            className="w-full py-3 text-xs font-medium text-primary hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              payments
            </span>
            Bayar
          </button>
        )}
      />
    </div>
  );
}
