import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import DataTable from '../../components/ui/DataTable';
import Sheet from '../../components/ui/Sheet';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import SearchInput from '../../components/ui/SearchInput';
import Select from '../../components/ui/Select';
import DateInput from '../../components/ui/DateInput';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import { StatusBadge } from '../../components/ui/Badge';
import Money from '../../components/ui/Money';
import { EmptyState } from '../../components/ui/States';
import { formatCurrency, formatDate, formatDateShort, daysUntil } from '../../lib/format';

export default function PurchasesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    supplier_id: '',
    payment_status: '',
    search: '',
  });
  const [detail, setDetail] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['purchases', filters],
    queryFn: async () => {
      const params = {};
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      if (filters.supplier_id) params.supplier_id = filters.supplier_id;
      if (filters.payment_status) params.payment_status = filters.payment_status;
      if (filters.search.trim()) params.search = filters.search.trim();
      const res = await api.get('/purchases', { params });
      return res.data;
    },
  });

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => (await api.get('/suppliers')).data,
  });

  const { data: purchaseDetail } = useQuery({
    queryKey: ['purchase-detail', detail?.id],
    queryFn: async () => {
      if (!detail?.id) return null;
      const res = await api.get(`/purchases/${detail.id}`);
      return res.data;
    },
    enabled: !!detail?.id,
  });

  const purchases = useMemo(() => data?.data || data || [], [data]);
  const supplierList = useMemo(() => suppliers?.data || suppliers || [], [suppliers]);

  const summary = useMemo(() => {
    const total = purchases.reduce((sum, item) => sum + Number(item.total ?? 0), 0);
    const payable = purchases.reduce((sum, item) => sum + Number(item.payable ?? 0), 0);
    const overdue = purchases.filter((item) => {
      const days = daysUntil(item.due_date);
      return days !== null && days < 0;
    });
    return {
      total,
      payable,
      count: purchases.length,
      overdueCount: overdue.length,
    };
  }, [purchases]);

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const res = await api.delete(`/purchases/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Pembelian berhasil dihapus');
      setDeleteTarget(null);
      setDetail(null);
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Gagal menghapus pembelian');
      setDeleteTarget(null);
    },
  });

  const columns = [
    {
      key: 'purchase_number',
      header: 'No. Transaksi',
      sortable: true,
      render: (item) => (
        <div className="min-w-0">
          <p className="font-medium text-on-surface truncate">{item.purchase_number}</p>
          <p className="text-2xs text-on-surface-variant truncate">{formatDateShort(item.date)}</p>
        </div>
      ),
    },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (item) => (
        <span className="text-on-surface-variant truncate">{item.supplier?.name || '-'}</span>
      ),
    },
    {
      key: 'due_date',
      header: 'Jatuh Tempo',
      sortable: true,
      sortValue: (item) => item.due_date ?? '',
      render: (item) => {
        if (!item.due_date) return <span className="text-on-surface-variant text-xs">-</span>;
        const days = daysUntil(item.due_date);
        return (
          <div className="flex flex-col">
            <span className={days !== null && days < 0 ? 'text-danger font-medium' : ''}>
              {formatDateShort(item.due_date)}
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
      render: (item) => <Money value={item.total} variant="strong" />,
    },
    {
      key: 'payable',
      header: 'Sisa Utang',
      align: 'right',
      sortable: true,
      render: (item) =>
        Number(item.payable ?? 0) > 0 ? (
          <Money value={item.payable} variant="danger" />
        ) : (
          <span className="text-on-surface-variant text-xs">Lunas</span>
        ),
    },
    {
      key: 'payment_status',
      header: 'Status',
      render: (item) => <StatusBadge kind="payment" value={item.payment_status} />,
    },
    {
      key: 'aksi',
      header: 'Aksi',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-0.5">
          <IconButton
            icon="edit"
            label={`Edit ${item.purchase_number}`}
            size="sm"
            tone="primary"
            onClick={() => navigate(`/pembelian/${item.id}/edit`)}
          />
          <IconButton
            icon="delete"
            label={`Hapus ${item.purchase_number}`}
            size="sm"
            tone="danger"
            onClick={() => setDeleteTarget(item)}
          />
        </div>
      ),
    },
  ];

  const hasFilter = Boolean(
    filters.start_date || filters.end_date || filters.supplier_id || filters.payment_status || filters.search
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pembelian"
        subtitle="Riwayat transaksi pembelian dari supplier dan status pelunasan"
        breadcrumbs={[{ label: 'Transaksi', to: '/pembelian' }, { label: 'Pembelian' }]}
        actions={
          <Button icon="add" size="sm" onClick={() => navigate('/pembelian/tambah')}>
            Tambah Pembelian
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <DateInput
          value={filters.start_date}
          onChange={(value) => setFilters((f) => ({ ...f, start_date: value }))}
          aria-label="Tanggal mulai"
          placeholder="Mulai"
        />
        <DateInput
          value={filters.end_date}
          onChange={(value) => setFilters((f) => ({ ...f, end_date: value }))}
          aria-label="Tanggal akhir"
          placeholder="Akhir"
        />
        <Select
          value={filters.supplier_id}
          onChange={(event) => setFilters((f) => ({ ...f, supplier_id: event.target.value }))}
          aria-label="Filter supplier"
        >
          <option value="">Semua supplier</option>
          {supplierList.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </Select>
        <Select
          value={filters.payment_status}
          onChange={(event) => setFilters((f) => ({ ...f, payment_status: event.target.value }))}
          aria-label="Filter status pembayaran"
        >
          <option value="">Semua status</option>
          <option value="unpaid">Belum bayar</option>
          <option value="partial">Sebagian</option>
          <option value="paid">Lunas</option>
        </Select>
      </div>

      <SearchInput
        value={filters.search}
        onChange={(value) => setFilters((f) => ({ ...f, search: value }))}
        placeholder="Cari nomor transaksi…"
        className="sm:max-w-xs"
      />

      {summary.count > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest px-3.5 py-3">
            <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Nilai Pembelian</p>
            <Money value={summary.total} variant="strong" className="text-base mt-1 block" />
          </div>
          <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest px-3.5 py-3">
            <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Transaksi</p>
            <p className="text-base font-semibold text-on-surface mt-1">{summary.count}</p>
          </div>
          <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest px-3.5 py-3">
            <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Sisa Utang</p>
            <Money value={summary.payable} variant="danger" className="text-base mt-1 block" />
          </div>
          <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest px-3.5 py-3">
            <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Lewat Jatuh Tempo</p>
            <p
              className={`text-base font-semibold mt-1 ${
                summary.overdueCount > 0 ? 'text-danger' : 'text-success'
              }`}
            >
              {summary.overdueCount > 0 ? `${summary.overdueCount} transaksi` : 'Tidak ada'}
            </p>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={purchases}
        rowKey={(row) => row.id}
        loading={isLoading}
        minWidth="880px"
        onRowClick={(row) => setDetail(row)}
        emptyState={
          isError ? (
            <div role="alert" className="py-6 text-center">
              <p className="text-sm font-medium text-danger">Gagal memuat pembelian</p>
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
              icon="inventory_2"
              title={hasFilter ? 'Pembelian tidak ditemukan' : 'Belum ada pembelian'}
              description={
                hasFilter
                  ? 'Coba ubah atau kosongkan filter tanggal, supplier, dan status.'
                  : 'Catat pembelian barang dari supplier untuk menambah stok.'
              }
              action={
                <Button size="sm" icon="add" onClick={() => navigate('/pembelian/tambah')}>
                  Tambah Pembelian
                </Button>
              }
            />
          )
        }
        cardTitle={(item) => item.purchase_number}
        cardMeta={(item) => `${item.supplier?.name || '-'} · ${formatDate(item.date)}`}
        cardBadge={(item) => <StatusBadge kind="payment" value={item.payment_status} />}
        cardFields={[
          { label: 'Total', render: (item) => <Money value={item.total} variant="strong" /> },
          {
            label: 'Sisa Utang',
            render: (item) =>
              Number(item.payable ?? 0) > 0 ? (
                <Money value={item.payable} variant="danger" />
              ) : (
                'Lunas'
              ),
          },
          {
            label: 'Jatuh Tempo',
            render: (item) => (item.due_date ? formatDateShort(item.due_date) : '-'),
          },
        ]}
        cardActions={(item) => (
          <>
            <button
              type="button"
              onClick={() => navigate(`/pembelian/${item.id}/edit`)}
              className="flex-1 py-3 text-xs font-medium text-primary hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                edit
              </span>
              Edit
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(item)}
              className="flex-1 py-3 text-xs font-medium text-danger hover:bg-danger-container transition-colors flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                delete
              </span>
              Hapus
            </button>
          </>
        )}
      />

      <Sheet
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="Detail Pembelian"
        description={detail?.purchase_number}
        icon="inventory_2"
        footer={
          <>
            <Button variant="outline" size="sm" icon="close" onClick={() => setDetail(null)}>
              Tutup
            </Button>
            <Button size="sm" icon="edit" onClick={() => navigate(`/pembelian/${detail?.id}/edit`)}>
              Edit
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-field bg-surface-container px-3 py-2.5">
              <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Tanggal</p>
              <p className="text-sm font-medium text-on-surface mt-0.5">{formatDate(detail?.date)}</p>
            </div>
            <div className="rounded-field bg-surface-container px-3 py-2.5">
              <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Supplier</p>
              <p className="text-sm font-medium text-on-surface mt-0.5 truncate">
                {detail?.supplier?.name || '-'}
              </p>
            </div>
            <div className="rounded-field bg-surface-container px-3 py-2.5">
              <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Jatuh Tempo</p>
              <p className="text-sm font-medium text-on-surface mt-0.5">
                {detail?.due_date ? formatDate(detail.due_date) : '-'}
              </p>
            </div>
            <div className="rounded-field bg-surface-container px-3 py-2.5">
              <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Status</p>
              <div className="mt-1">
                <StatusBadge kind="payment" value={detail?.payment_status} />
              </div>
            </div>
            <div className="rounded-field bg-surface-container px-3 py-2.5">
              <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Total</p>
              <Money value={detail?.total ?? 0} variant="strong" className="text-sm mt-0.5 block" />
            </div>
            <div className="rounded-field bg-surface-container px-3 py-2.5">
              <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Sisa Utang</p>
              <Money
                value={detail?.payable ?? 0}
                variant={Number(detail?.payable ?? 0) > 0 ? 'danger' : 'default'}
                className="text-sm mt-0.5 block"
              />
            </div>
          </div>

          {detail?.note && (
            <div className="rounded-field bg-surface-container px-3 py-2.5">
              <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Catatan</p>
              <p className="text-sm text-on-surface mt-0.5">{detail.note}</p>
            </div>
          )}

          {purchaseDetail?.items && purchaseDetail.items.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-on-surface mb-2">Item Pembelian</h3>
              <ul className="divide-y divide-outline-variant/50 rounded-field border border-outline-variant/70 overflow-hidden">
                {purchaseDetail.items.map((item, index) => (
                  <li key={index} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-on-surface truncate">
                        {item.product?.name || item.product_name}
                      </p>
                      <p className="text-2xs text-on-surface-variant">
                        {item.quantity} {item.unit_name || ''} × {formatCurrency(item.buy_price)}
                      </p>
                    </div>
                    <Money value={item.subtotal} variant="strong" className="text-sm shrink-0" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Sheet>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        title="Hapus pembelian?"
        message={`Transaksi ${deleteTarget?.purchase_number ?? ''} akan dihapus dan stok produk dikembalikan.`}
        detail="Tindakan ini tidak bisa dibatalkan."
        confirmLabel="Hapus"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
