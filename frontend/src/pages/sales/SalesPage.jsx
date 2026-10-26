import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import DataTable from '../../components/ui/DataTable';
import Sheet from '../../components/ui/Sheet';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import SearchInput from '../../components/ui/SearchInput';
import Select from '../../components/ui/Select';
import DateInput from '../../components/ui/DateInput';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import { StatusBadge } from '../../components/ui/Badge';
import Money from '../../components/ui/Money';
import { EmptyState } from '../../components/ui/States';
import { formatCurrency, formatDate, formatDateShort } from '../../lib/format';

export default function SalesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    customer_id: '',
    payment_status: '',
    search: '',
  });
  const [detail, setDetail] = useState(null);
  const [printData, setPrintData] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['sales', filters],
    queryFn: async () => {
      const params = {};
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      if (filters.customer_id) params.customer_id = filters.customer_id;
      if (filters.payment_status) params.payment_status = filters.payment_status;
      if (filters.search.trim()) params.search = filters.search.trim();
      const res = await api.get('/sales', { params });
      return res.data;
    },
  });

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get('/customers')).data,
  });

  const { data: saleDetail } = useQuery({
    queryKey: ['sale-detail', detail?.id],
    queryFn: async () => {
      if (!detail?.id) return null;
      const res = await api.get(`/sales/${detail.id}`);
      return res.data;
    },
    enabled: !!detail?.id,
  });

  const sales = useMemo(() => data?.data || data || [], [data]);
  const customerList = useMemo(() => customers?.data || customers || [], [customers]);

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const res = await api.delete(`/sales/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Penjualan berhasil dihapus');
      setDeleteTarget(null);
      setDetail(null);
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Gagal menghapus penjualan');
      setDeleteTarget(null);
    },
  });

  const handlePrint = async (sale) => {
    try {
      const res = await api.get(`/sales/${sale.id}`);
      setPrintData(res.data);
      setShowPreview(true);
    } catch {
      toast.error('Gagal memuat data penjualan');
    }
  };

  const getReceiptFilename = () => {
    if (!printData) return 'Nota.pdf';
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const date = new Date(printData.date);
    const day = String(date.getDate()).padStart(2, '0');
    const month = months[date.getMonth()];
    const name = (printData.customer?.name || 'Pelanggan').replace(/\s+/g, '');
    return `Nota-${name}${day}${month}`;
  };

  const handlePrintNow = () => {
    const filename = getReceiptFilename();
    document.title = filename;
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.title = 'BALARAJA';
      }, 2000);
    }, 200);
  };

  const renderNotaKontan = (d) => (
    <div className="print-nota-kontan">
      <div className="nk-top-band" />
      <div className="nk-header">
        <div className="nk-title">Toko Balaraja</div>
        <div className="nk-meta">
          <div className="nk-row">
            <span className="nk-label">Hari/Tgl</span>
            <span className="nk-value">
              {d.date ? new Date(d.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
            </span>
          </div>
          <div className="nk-row">
            <span className="nk-label">Kepada Yth</span>
            <span className="nk-value">{d.customer?.name || '-'}</span>
          </div>
        </div>
      </div>
      <div className="nk-divider" />
      <div className="nk-nota-no">
        <span>Nota No.</span>
        <span className="nk-value">{d.sale_number}</span>
      </div>
      <table className="nk-table">
        <thead>
          <tr>
            <th style={{ width: '7%' }}>No</th>
            <th>Nama Barang</th>
            <th style={{ width: '10%' }}>Qty</th>
            <th style={{ width: '26%' }}>Harga Satuan</th>
            <th style={{ width: '24%' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {(d.items || []).map((item, index) => (
            <tr key={index}>
              <td className="nk-center">{index + 1}</td>
              <td>{item.product?.name || item.product_name}</td>
              {/* Satuan ikut ditampilkan. Nota yang menulis "2" tanpa satuan
                  tidak bisa diperiksa ulang kalau produknya punya dus dan btl. */}
              <td className="nk-right">{item.quantity} {item.unit_name || ''}</td>
              <td className="nk-right">{formatCurrency(item.sell_price)}</td>
              <td className="nk-right">{formatCurrency(item.subtotal)}</td>
            </tr>
          ))}
          <tr className="nk-total-row">
            <td colSpan={4} className="nk-total-label">Jumlah</td>
            <td className="nk-right nk-total-value">{formatCurrency(d.total)}</td>
          </tr>
        </tbody>
      </table>
      <div className="nk-sigs">
        <div className="nk-sig">
          <div className="nk-sig-label">Tanda Terima</div>
          <div className="nk-sig-line">( ............................... )</div>
        </div>
        <div className="nk-sig">
          <div className="nk-sig-label">Hormat Kami,</div>
          <div className="nk-sig-line">( ............................... )</div>
        </div>
      </div>
      <div className="nk-bottom-band" />
    </div>
  );

  const hasPayment = (sale) =>
    Boolean(sale) && Number(sale.total ?? 0) - Number(sale.receivable ?? 0) > 0.005;

  const columns = [
    {
      key: 'sale_number',
      header: 'No. Transaksi',
      sortable: true,
      render: (item) => (
        <div className="min-w-0">
          <p className="font-medium text-on-surface truncate">{item.sale_number}</p>
          <p className="text-2xs text-on-surface-variant truncate">{formatDateShort(item.date)}</p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Pelanggan',
      render: (item) => (
        <span className="text-on-surface-variant truncate">{item.customer?.name || '-'}</span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      sortable: true,
      render: (item) => <Money value={item.total} variant="strong" />,
    },
    {
      key: 'receivable',
      header: 'Sisa Piutang',
      align: 'right',
      sortable: true,
      render: (item) =>
        Number(item.receivable ?? 0) > 0 ? (
          <Money value={item.receivable} variant="danger" />
        ) : (
          <span className="text-on-surface-variant text-xs">-</span>
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
            icon="print"
            label={`Cetak nota ${item.sale_number}`}
            size="sm"
            tone="primary"
            onClick={() => handlePrint(item)}
          />
          <IconButton
            icon="edit"
            label={`Edit ${item.sale_number}`}
            size="sm"
            tone="primary"
            onClick={() => navigate(`/penjualan/${item.id}/edit`)}
          />
          <IconButton
            icon="delete"
            label={`Hapus ${item.sale_number}`}
            size="sm"
            tone="danger"
            onClick={() => setDeleteTarget(item)}
          />
        </div>
      ),
    },
  ];

  const hasFilter = Boolean(
    filters.start_date || filters.end_date || filters.customer_id || filters.payment_status || filters.search
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Penjualan"
        subtitle="Riwayat transaksi penjualan dan status pelunasan"
        breadcrumbs={[{ label: 'Transaksi', to: '/penjualan' }, { label: 'Penjualan' }]}
        actions={
          <Button icon="point_of_sale" size="sm" onClick={() => navigate('/penjualan/tambah')}>
            Kasir
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
          value={filters.customer_id}
          onChange={(event) => setFilters((f) => ({ ...f, customer_id: event.target.value }))}
          aria-label="Filter pelanggan"
        >
          <option value="">Semua pelanggan</option>
          {customerList.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </Select>
        <Select
          value={filters.payment_status}
          onChange={(event) => setFilters((f) => ({ ...f, payment_status: event.target.value }))}
          aria-label="Filter status pembayaran"
        >
          <option value="">Semua status</option>
          <option value="paid">Lunas</option>
          <option value="partial">Sebagian</option>
          <option value="unpaid">Belum bayar</option>
        </Select>
      </div>

      <SearchInput
        value={filters.search}
        onChange={(value) => setFilters((f) => ({ ...f, search: value }))}
        placeholder="Cari nomor transaksi…"
        className="sm:max-w-xs"
      />

      <DataTable
        columns={columns}
        rows={sales}
        rowKey={(row) => row.id}
        loading={isLoading}
        minWidth="820px"
        onRowClick={(row) => setDetail(row)}
        emptyState={
          isError ? (
            <div role="alert" className="py-6 text-center">
              <p className="text-sm font-medium text-danger">Gagal memuat penjualan</p>
              <p className="text-xs text-on-surface-variant mt-1">
                {error?.response?.status
                  ? `Server merespons dengan kesalahan (${error.response.status}).`
                  : 'Periksa koneksi internet Anda lalu coba lagi.'}
              </p>
            </div>
          ) : (
            <EmptyState
              icon="receipt_long"
              title={hasFilter ? 'Penjualan tidak ditemukan' : 'Belum ada penjualan'}
              description={
                hasFilter
                  ? 'Coba ubah atau kosongkan filter.'
                  : 'Mulai transaksi pertama lewat halaman Kasir.'
              }
              action={
                <Button size="sm" icon="point_of_sale" onClick={() => navigate('/penjualan/tambah')}>
                  Buka Kasir
                </Button>
              }
            />
          )
        }
        cardTitle={(item) => item.sale_number}
        cardMeta={(item) => `${item.customer?.name || '-'} · ${formatDate(item.date)}`}
        cardBadge={(item) => <StatusBadge kind="payment" value={item.payment_status} />}
        cardFields={[
          { label: 'Total', render: (item) => <Money value={item.total} variant="strong" /> },
          {
            label: 'Sisa Piutang',
            render: (item) =>
              Number(item.receivable ?? 0) > 0 ? (
                <Money value={item.receivable} variant="danger" />
              ) : (
                'Lunas'
              ),
          },
        ]}
        cardActions={(item) => (
          <>
            <button
              type="button"
              onClick={() => handlePrint(item)}
              className="flex-1 py-3 text-xs font-medium text-primary hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                print
              </span>
              Cetak
            </button>
            <button
              type="button"
              onClick={() => navigate(`/penjualan/${item.id}/edit`)}
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

      {/* Detail penjualan */}
      <Sheet
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="Detail Penjualan"
        description={detail?.sale_number}
        icon="receipt_long"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              icon="print"
              onClick={() => handlePrint(detail)}
            >
              Cetak Nota
            </Button>
            <Button
              size="sm"
              icon="edit"
              onClick={() => navigate(`/penjualan/${detail?.id}/edit`)}
            >
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
              <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Pelanggan</p>
              <p className="text-sm font-medium text-on-surface mt-0.5 truncate">
                {detail?.customer?.name || '-'}
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
              <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Sisa Piutang</p>
              <Money
                value={detail?.receivable ?? 0}
                variant={Number(detail?.receivable ?? 0) > 0 ? 'danger' : 'default'}
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

          {saleDetail?.items && saleDetail.items.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-on-surface mb-2">Item Penjualan</h3>
              <ul className="divide-y divide-outline-variant/50 rounded-field border border-outline-variant/70 overflow-hidden">
                {saleDetail.items.map((item, index) => (
                  <li key={index} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-on-surface truncate">
                        {item.product?.name || item.product_name}
                      </p>
                      <p className="text-2xs text-on-surface-variant">
                        {item.quantity} {item.unit_name || ''} × {formatCurrency(item.sell_price)}
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

      {/* Print Nota Kontan — hidden on screen, only visible during print */}
      {printData && (
        <div className="print-isolated print-only">{renderNotaKontan(printData)}</div>
      )}

      {showPreview && printData && (
        <Modal
          className="no-print"
          onClose={() => {
            setShowPreview(false);
            setPrintData(null);
          }}
          title="Pratinjau nota"
          subtitle={printData.sale_number}
          variant="center"
          panelClassName="sm:max-w-lg"
          bodyClassName="p-4 flex justify-center bg-surface-container"
          footer={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowPreview(false);
                  setPrintData(null);
                }}
              >
                Tutup
              </Button>
              <Button size="sm" icon="print" onClick={handlePrintNow}>
                Cetak
              </Button>
            </>
          }
        >
          <div className="bg-print-paper shadow-md rounded">{renderNotaKontan(printData)}</div>
        </Modal>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (hasPayment(deleteTarget)) {
            throw new Error(
              'Transaksi ini sudah menerima pembayaran. Hapus pembayarannya dulu lewat halaman Pembayaran agar tidak ada pembayaran yang hilang diam-diam.'
            );
          }
          deleteMutation.mutate(deleteTarget.id);
        }}
        title="Hapus penjualan?"
        message={`Transaksi ${deleteTarget?.sale_number ?? ''} akan dihapus dan stok produk dikembalikan.`}
        detail={
          hasPayment(deleteTarget)
            ? 'Transaksi ini sudah punya pembayaran. Menghapus transaksi akan ikut menghapus pembayaran yang tercatat.'
            : 'Tindakan ini tidak bisa dibatalkan.'
        }
        confirmLabel="Hapus"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
