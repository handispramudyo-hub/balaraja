import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { formatCurrency, formatDate } from '../../utils/format';
import api from '../../services/api';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import Modal from '../../components/ui/Modal';

const statusStyles = {
  Lunas: {
    badge: 'bg-success/10 text-success border-success/20',
    bar: 'bg-success',
  },
  'Belum Bayar': {
    badge: 'bg-error-container text-on-error-container',
    bar: 'bg-error',
  },
  Sebagian: {
    badge: 'bg-warning/10 text-warning border-warning/20',
    bar: 'bg-warning',
  },
};

// Kolom `payment_status` di database menyimpan enum
// 'unpaid' | 'partial' | 'paid', sedangkan `statusStyles` di atas memakai
// label Bahasa Indonesia ('Belum Bayar' | 'Sebagian' | 'Lunas'). Fungsi ini
// menjemput keduanya. Sebelumnya fungsi ini mengembalikan nilai enum mentah,
// sehingga `statusStyles[label]` selalu undefined dan badge status tidak
// pernah dapat warna - kolomnya terlihat ada tapi tidak pernah informatif.
const STATUS_LABELS = {
  unpaid: 'Belum Bayar',
  partial: 'Sebagian',
  paid: 'Lunas',
};

function getStatusLabel(item) {
  const raw = item.payment_status || item.status;
  if (!raw) return 'Belum Bayar';
  return STATUS_LABELS[raw] || raw;
}

export default function PurchasesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    supplier_id: '',
    payment_status: '',
  });
  const [detail, setDetail] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['purchases', filters],
    queryFn: async () => {
      const params = {};
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      if (filters.supplier_id) params.supplier_id = filters.supplier_id;
      if (filters.payment_status) params.payment_status = filters.payment_status;
      const res = await api.get('/purchases', { params });
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

  const { data: purchaseDetail } = useQuery({
    queryKey: ['purchase-detail', detail?.id],
    queryFn: async () => {
      if (!detail?.id) return null;
      const res = await api.get(`/purchases/${detail.id}`);
      return res.data;
    },
    enabled: !!detail?.id,
  });

  const purchases = data?.data || data || [];
  const hasFilter = !!(filters.start_date || filters.end_date || filters.supplier_id || filters.payment_status);
  const supplierList = suppliers?.data || suppliers || [];

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const res = await api.delete(`/purchases/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Pembelian berhasil dihapus');
      setDeleteConfirm(null);
      setDetail(null);
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Gagal menghapus pembelian');
    },
  });

  return (
    <main className="flex-grow p-4 flex flex-col gap-4 max-w-3xl mx-auto w-full">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-primary">Daftar Transaksi</h2>
        <button
          onClick={() => navigate('/pembelian/tambah')}
          className="bg-primary text-on-primary text-xs font-medium py-2 px-4 rounded-lg shadow-sm hover:bg-primary-container hover:text-on-primary-container transition-colors flex items-center gap-2 h-12"
        >
          <span className="material-symbols-outlined text-lg">add</span> Tambah
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-surface-container-lowest p-3 rounded-xl shadow-sm border border-outline-variant/30 flex flex-col md:flex-row gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-on-surface-variant mb-1" htmlFor="tanggal-mulai-1">Tanggal Mulai</label>
          <input
            id="tanggal-mulai-1"
            type="date"
            value={filters.start_date}
            onChange={(e) => setFilters((f) => ({ ...f, start_date: e.target.value }))}
            className="w-full border border-outline-variant rounded-lg p-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-surface"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-on-surface-variant mb-1" htmlFor="tanggal-akhir-2">Tanggal Akhir</label>
          <input
            id="tanggal-akhir-2"
            type="date"
            value={filters.end_date}
            onChange={(e) => setFilters((f) => ({ ...f, end_date: e.target.value }))}
            className="w-full border border-outline-variant rounded-lg p-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-surface"
          />
        </div>
        <div className="flex-1 relative">
          <label className="block text-xs font-medium text-on-surface-variant mb-1" htmlFor="supplier-3">Supplier</label>
          <select
            id="supplier-3"
            value={filters.supplier_id}
            onChange={(e) => setFilters((f) => ({ ...f, supplier_id: e.target.value }))}
            className="w-full border border-outline-variant rounded-lg p-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-surface appearance-none"
          >
            <option value="">Semua Supplier</option>
            {supplierList.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <span className="material-symbols-outlined absolute right-2 top-2.5 text-outline pointer-events-none">arrow_drop_down</span>
        </div>
        <div className="flex-1 relative">
          <label className="block text-xs font-medium text-on-surface-variant mb-1" htmlFor="status-4">Status Bayar</label>
          <select
            id="status-4"
            value={filters.payment_status}
            onChange={(e) => setFilters((f) => ({ ...f, payment_status: e.target.value }))}
            className="w-full border border-outline-variant rounded-lg p-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-surface appearance-none"
          >
            <option value="">Semua Status</option>
            <option value="unpaid">Belum Bayar</option>
            <option value="partial">Sebagian</option>
            <option value="paid">Lunas</option>
          </select>
          <span className="material-symbols-outlined absolute right-2 top-2.5 text-outline pointer-events-none">arrow_drop_down</span>
        </div>
      </div>

      {/* Transaction Cards */}
      <div className="flex flex-col gap-3">
        {isLoading ? (
          <div className="bg-surface-container-lowest p-4 rounded-xl shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] border border-outline-variant/20">
            <LoadingState rows={3} />
          </div>
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} title="Gagal memuat data pembelian" />
        ) : purchases.length === 0 ? (
          <EmptyState
            icon="inventory_2"
            title={hasFilter ? 'Tidak ada pembelian yang cocok' : 'Belum ada pembelian'}
            description={
              hasFilter
                ? 'Coba ubah atau kosongkan filter tanggal dan supplier.'
                : 'Catat pembelian barang dari supplier untuk menambah stok.'
            }
          />
        ) : (
          purchases.map((item) => {
            const status = getStatusLabel(item);
            const styles = statusStyles[status] || statusStyles['Belum Bayar'];
            const itemCount = item.items?.length || item.item_count || 0;

            return (
              <div
                key={item.id}
                onClick={() => setDetail(item)}
                className="bg-surface-container-lowest p-4 rounded-xl shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] border border-outline-variant/20 relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${styles.bar}`} />
                <div className="pl-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-medium text-outline">
                        {item.purchase_number} • {formatDate(item.date)}
                      </span>
                      <h3 className="text-lg font-semibold text-on-surface mt-1">
                        {item.supplier?.name || '-'}
                      </h3>
                    </div>
                    <span className={`${styles.badge} text-xs font-medium px-2 py-1 rounded-full border`}>
                      {status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/pembelian/${item.id}/edit`); }}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:bg-surface-variant hover:text-primary transition-colors"
                      title="Edit"
                    >
                      <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item); }}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:bg-error-container hover:text-error transition-colors"
                      title="Hapus"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                  <div className="flex justify-between items-end mt-2">
                    <span className="text-sm text-on-surface-variant flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">shopping_bag</span> {itemCount} Items
                    </span>
                    <span className="text-lg font-bold text-primary">{formatCurrency(item.total)}</span>
                  </div>
                  {Number(item.payable) > 0 && (
                    <div className="flex justify-between items-center mt-1.5 pt-1.5 border-t border-outline-variant/20">
                      <span className="text-xs text-on-surface-variant flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">price_change</span> Sisa Utang
                      </span>
                      <span className="text-sm font-semibold text-error tabular-nums">
                        {formatCurrency(item.payable)}
                      </span>
                    </div>
                  )}
                  {item.due_date && (
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-xs text-on-surface-variant">Jatuh Tempo</span>
                      <span className="text-xs text-on-surface">{formatDate(item.due_date)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Detail Modal */}
      {detail && (
        <Modal onClose={() => setDetail(null)} title="Detail pembelian" variant="center" zIndex={60} panelClassName="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-outline-variant">
              <div>
                <h3 className="text-lg font-bold text-on-surface">Detail Pembelian</h3>
                <p className="text-sm text-on-surface-variant">{detail.purchase_number}</p>
              </div>
              <button onClick={() => setDetail(null)} className="p-1 rounded hover:bg-surface-container">
                <X className="w-5 h-5 text-on-surface-variant" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-on-surface-variant">Tanggal</span>
                  <p className="font-medium text-on-surface">{formatDate(detail.date)}</p>
                </div>
                <div>
                  <span className="text-on-surface-variant">Supplier</span>
                  <p className="font-medium text-on-surface">{detail.supplier?.name || '-'}</p>
                </div>
                <div>
                  <span className="text-on-surface-variant">Catatan</span>
                  <p className="font-medium text-on-surface">{detail.note || '-'}</p>
                </div>
                <div>
                  <span className="text-on-surface-variant">Total</span>
                  <p className="font-bold text-on-surface">{formatCurrency(detail.total)}</p>
                </div>
              </div>

              {purchaseDetail?.items && purchaseDetail.items.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-on-surface mb-2">Item Pembelian</h4>
                  <div className="overflow-x-auto -mx-1 px-1">
                    <table className="w-full text-sm border border-outline-variant rounded-lg overflow-hidden min-w-[420px]">
                    <thead>
                      <tr className="bg-surface-container-low">
                        <th className="px-3 py-2 text-left text-xs font-semibold text-on-surface-variant">Produk</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-on-surface-variant">Qty</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-on-surface-variant">Harga</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-on-surface-variant">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-container">
                      {purchaseDetail.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-on-surface">{item.product?.name || item.product_name}</td>
                          <td className="px-3 py-2 text-right text-on-surface">
                            {item.quantity} {item.unit_name || ''}
                          </td>
                          <td className="px-3 py-2 text-right text-on-surface">{formatCurrency(item.buy_price)}</td>
                          <td className="px-3 py-2 text-right font-medium text-on-surface">{formatCurrency(item.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </div>
        </Modal>
      )}

      {deleteConfirm && (
        <Modal onClose={() => setDeleteConfirm(null)} title="Konfirmasi hapus pembelian" variant="center" zIndex={70} panelClassName="bg-surface rounded-xl shadow-xl w-full max-w-sm p-6 mx-4">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-error text-2xl">delete</span>
              <h3 className="text-lg font-bold text-on-surface">Hapus Pembelian?</h3>
            </div>
            <p className="text-sm text-on-surface-variant mb-6">
              Transaksi <strong>{deleteConfirm.purchase_number}</strong> akan dihapus. Stok produk akan dikembalikan.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 rounded-xl border border-outline-variant text-on-surface text-sm font-medium hover:bg-surface-container-high transition-colors">Batal</button>
              <button onClick={() => deleteMutation.mutate(deleteConfirm.id)} disabled={deleteMutation.isPending} className="px-4 py-2 rounded-xl bg-error text-on-error text-sm font-medium hover:bg-error/90 transition-colors disabled:opacity-50">
                {deleteMutation.isPending ? 'Menghapus...' : 'Hapus'}
              </button>
            </div>
        </Modal>
      )}
    </main>
  );
}
