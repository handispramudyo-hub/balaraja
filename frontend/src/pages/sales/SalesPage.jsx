import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { formatCurrency, formatDate } from '../../utils/format';
import api from '../../services/api';
import { toast } from 'sonner';
import Modal from '../../components/ui/Modal';

const statusConfig = {
  paid: {
    label: 'Lunas',
    bg: 'bg-success-container',
    text: 'text-on-success-container',
  },
  partial: {
    label: 'Sebagian',
    bg: 'bg-warning-container',
    text: 'text-on-warning-container',
  },
  unpaid: {
    label: 'Belum Bayar',
    bg: 'bg-danger-container',
    text: 'text-on-danger-container',
  },
};

export default function SalesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    customer_id: '',
    payment_status: '',
  });
  const [detail, setDetail] = useState(null);
  const [printData, setPrintData] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['sales', filters],
    queryFn: async () => {
      const params = {};
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      if (filters.customer_id) params.customer_id = filters.customer_id;
      if (filters.payment_status) params.payment_status = filters.payment_status;
      const res = await api.get('/sales', { params });
      return res.data;
    },
  });

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const res = await api.get('/customers');
      return res.data;
    },
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

  const sales = data?.data || data || [];
  const customerList = customers?.data || customers || [];

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const res = await api.delete(`/sales/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Penjualan berhasil dihapus');
      setDeleteConfirm(null);
      setDetail(null);
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Gagal menghapus penjualan');
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
    const d = new Date(printData.date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = months[d.getMonth()];
    const name = (printData.customer?.name || 'Toko').replace(/\s+/g, '');
    return `Nota-${name}${day}${month}`;
  };

  const handlePrintNow = () => {
    const filename = getReceiptFilename();
    document.title = filename;
    setTimeout(() => {
      window.print();
      setTimeout(() => { document.title = 'BALARAJA'; }, 2000);
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
            <span className="nk-value">{d.date ? new Date(d.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</span>
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
          {(d.items || []).map((item, i) => (
            <tr key={i}>
              <td className="nk-center">{i + 1}</td>
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

  return (
    <div className="min-h-screen bg-surface">
      <style>{`
        @media print {
          @page { size: 105mm 165mm; margin: 0; }
        }
      `}</style>
      {/* Sticky Filter Bar */}
      <div className="no-print pt-4 pb-2 -mx-4 px-4">
        <div className="flex gap-2 overflow-x-auto pb-2 snap-x">
          {/* Date Range */}
          <div className="relative min-w-[200px] snap-start">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-outline text-[18px]">calendar_today</span>
            </div>
            <input
              className="w-full pl-10 pr-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-sm text-on-surface focus:ring-2 focus:ring-primary focus:border-primary transition-all shadow-sm"
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters((f) => ({ ...f, start_date: e.target.value }))}
            />
          </div>
          <div className="relative min-w-[200px] snap-start">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-outline text-[18px]">calendar_today</span>
            </div>
            <input
              className="w-full pl-10 pr-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-sm text-on-surface focus:ring-2 focus:ring-primary focus:border-primary transition-all shadow-sm"
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters((f) => ({ ...f, end_date: e.target.value }))}
            />
          </div>
          {/* Customer Dropdown */}
          <div className="relative min-w-[180px] snap-start">
            <select
              className="w-full pl-3 pr-10 py-2 appearance-none bg-surface-container-lowest border border-outline-variant rounded-lg text-sm text-on-surface focus:ring-2 focus:ring-primary focus:border-primary transition-all shadow-sm"
              value={filters.customer_id}
              onChange={(e) => setFilters((f) => ({ ...f, customer_id: e.target.value }))}
            >
              <option value="">Semua Pelanggan</option>
              {customerList.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-outline text-[18px]">arrow_drop_down</span>
            </div>
          </div>
          {/* Payment Status */}
          <div className="relative min-w-[160px] snap-start">
            <select
              className="w-full pl-3 pr-10 py-2 appearance-none bg-surface-container-lowest border border-outline-variant rounded-lg text-sm text-on-surface focus:ring-2 focus:ring-primary focus:border-primary transition-all shadow-sm"
              value={filters.payment_status}
              onChange={(e) => setFilters((f) => ({ ...f, payment_status: e.target.value }))}
            >
              <option value="">Semua Status</option>
              <option value="paid">Lunas</option>
              <option value="partial">Sebagian</option>
              <option value="unpaid">Belum Bayar</option>
            </select>
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-outline text-[18px]">arrow_drop_down</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sale Cards */}
      <div className="no-print flex flex-col gap-3 mt-4 pb-24">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <span className="material-symbols-outlined text-on-surface-variant animate-spin text-3xl">progress_activity</span>
          </div>
        ) : sales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant">
            <span className="material-symbols-outlined text-5xl mb-2">receipt_long</span>
            <p className="text-sm">Tidak ada data penjualan</p>
          </div>
        ) : (
          sales.map((item) => {
            const status = statusConfig[item.payment_status] || statusConfig.unpaid;
            const itemCount = item.items_count || item.items?.length || 0;
            return (
              <div
                key={item.id}
                onClick={() => setDetail(item)}
                className="bg-surface-container-lowest rounded-xl p-4 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] border border-surface-container-low hover:border-outline-variant transition-colors group cursor-pointer relative overflow-hidden"
              >
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${status.bg}`} />
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-xs font-medium text-on-surface-variant mb-1">{item.sale_number} &bull; {formatDate(item.date)}</p>
                    <h3 className="text-lg font-semibold text-on-surface">{item.customer?.name || '-'}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handlePrint(item); }}
                      className="p-2 rounded-full hover:bg-surface-container-high text-outline hover:text-primary transition-colors"
                      title="Cetak Nota"
                    >
                      <span className="material-symbols-outlined text-[18px]">print</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/penjualan/${item.id}/edit`); }}
                      className="p-2 rounded-full hover:bg-surface-container-high text-outline hover:text-primary transition-colors"
                      title="Edit"
                    >
                      <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item); }}
                      className="p-2 rounded-full hover:bg-surface-container-high text-outline hover:text-error transition-colors"
                      title="Hapus"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>{status.label}</span>
                  </div>
                </div>
                <div className="flex justify-between items-end mt-4 pt-3 border-t border-surface-container">
                  <div className="flex flex-col gap-1">
                    {itemCount > 0 && (
                      <div className="flex items-center gap-1 text-on-surface-variant text-xs">
                        <span className="material-symbols-outlined text-[16px]">inventory_2</span>
                        <span>{itemCount} Item</span>
                      </div>
                    )}
                    {item.payment_status === 'partial' && item.remaining_balance > 0 && (
                      <p className="text-xs text-on-surface-variant">Sisa: {formatCurrency(item.remaining_balance)}</p>
                    )}
                  </div>
                  <p className="text-lg font-semibold text-primary">{formatCurrency(item.total)}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => navigate('/penjualan/tambah')}
        className="no-print fixed bottom-20 md:bottom-8 right-4 md:right-8 z-20 w-14 h-14 bg-primary text-on-primary rounded-2xl shadow-[0_8px_12px_-4px_rgba(0,0,0,0.15)] flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
      >
        <span className="material-symbols-outlined text-[28px]">add</span>
      </button>

      {/* Detail Modal */}
      {detail && (
        <Modal
          onClose={() => setDetail(null)}
          title="Detail penjualan"
          variant="sheet"
          zIndex={60}
          className="no-print"
          panelClassName="bg-surface-container-low w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[85vh] overflow-y-auto"
        >
            <div className="flex items-center justify-between p-5 border-b border-outline-variant sticky top-0 bg-surface-container-low z-10">
              <div>
                <h3 className="text-lg font-bold text-on-surface">Detail Penjualan</h3>
                <p className="text-sm text-on-surface-variant">{detail.sale_number}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePrint(detail)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">print</span>
                  <span className="hidden sm:inline">Cetak Nota</span>
                </button>
                <button
                  onClick={() => setDetail(null)}
                  className="p-2 rounded-full hover:bg-surface-container-high transition-colors"
                >
                  <span className="material-symbols-outlined text-on-surface-variant">close</span>
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-container-low rounded-xl p-3">
                  <span className="text-xs text-on-surface-variant flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">calendar_today</span> Tanggal
                  </span>
                  <p className="font-medium text-on-surface mt-1">{formatDate(detail.date)}</p>
                </div>
                <div className="bg-surface-container-low rounded-xl p-3">
                  <span className="text-xs text-on-surface-variant flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">storefront</span> Toko
                  </span>
                  <p className="font-medium text-on-surface mt-1">{detail.customer?.name || '-'}</p>
                </div>
                <div className="bg-surface-container-low rounded-xl p-3">
                  <span className="text-xs text-on-surface-variant flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">event</span> Jatuh Tempo
                  </span>
                  <p className="font-medium text-on-surface mt-1">{detail.due_date ? formatDate(detail.due_date) : '-'}</p>
                </div>
                <div className="bg-surface-container-low rounded-xl p-3">
                  <span className="text-xs text-on-surface-variant flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">info</span> Status
                  </span>
                  <p className="mt-1">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${(statusConfig[detail.payment_status] || statusConfig.unpaid).bg} ${(statusConfig[detail.payment_status] || statusConfig.unpaid).text}`}>
                      {(statusConfig[detail.payment_status] || statusConfig.unpaid).label}
                    </span>
                  </p>
                </div>
                <div className="bg-surface-container-low rounded-xl p-3">
                  <span className="text-xs text-on-surface-variant flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">payments</span> Total
                  </span>
                  <p className="font-bold text-on-surface mt-1">{formatCurrency(detail.total)}</p>
                </div>
                <div className="bg-surface-container-low rounded-xl p-3">
                  <span className="text-xs text-on-surface-variant flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">account_balance_wallet</span> Sisa Piutang
                  </span>
                  <p className="font-bold text-on-surface mt-1">{formatCurrency(detail.receivable || 0)}</p>
                </div>
                {detail.note && (
                  <div className="col-span-2 bg-surface-container-low rounded-xl p-3">
                    <span className="text-xs text-on-surface-variant flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">sticky_note_2</span> Catatan
                    </span>
                    <p className="font-medium text-on-surface mt-1">{detail.note}</p>
                  </div>
                )}
              </div>

              {saleDetail?.items && saleDetail.items.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-on-surface mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-base">shopping_cart</span>
                    Item Penjualan
                  </h4>
                  <div className="bg-surface-container-lowest rounded-xl overflow-hidden border border-outline-variant">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[420px]">
                      <thead>
                        <tr className="bg-surface-container-low">
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-on-surface-variant">Produk</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-on-surface-variant">Qty</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-on-surface-variant">Harga</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-on-surface-variant">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant">
                        {saleDetail.items.map((item, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-3 text-on-surface">{item.product?.name || item.product_name}</td>
                            <td className="px-4 py-3 text-right text-on-surface-variant">
                              {item.quantity} {item.unit_name || ''}
                            </td>
                            <td className="px-4 py-3 text-right text-on-surface-variant">{formatCurrency(item.sell_price)}</td>
                            <td className="px-4 py-3 text-right font-medium text-on-surface">{formatCurrency(item.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
        </Modal>
      )}

      {/* Print Nota Kontan — hidden on screen, only visible during print */}
      {printData && (
        <div className="print-isolated print-only">
          {renderNotaKontan(printData)}
        </div>
      )}

      {showPreview && printData && (
        <Modal className="no-print" onClose={() => { setShowPreview(false); setPrintData(null); }} title="Pratinjau nota" variant="center" zIndex={70} panelClassName="bg-surface rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant shrink-0">
              <div>
                <h3 className="text-lg font-bold text-on-surface">Preview Nota</h3>
                <p className="text-xs text-on-surface-variant">{printData.sale_number}</p>
              </div>
              <button onClick={() => { setShowPreview(false); setPrintData(null); }} className="p-2 rounded-full hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined text-on-surface-variant">close</span>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 flex justify-center">
              <div className="bg-print-paper shadow-md rounded">
                {renderNotaKontan(printData)}
              </div>
            </div>
            <div className="shrink-0 px-5 py-3 border-t border-outline-variant flex gap-3">
              <button onClick={() => { setShowPreview(false); setPrintData(null); }} className="flex-1 py-3 rounded-xl border border-outline-variant text-on-surface text-sm font-medium hover:bg-surface-container-high transition-colors">Tutup</button>
              <button onClick={handlePrintNow} className="flex-1 py-3 rounded-xl bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[18px]">print</span> Cetak
              </button>
            </div>
        </Modal>
      )}

      {deleteConfirm && (
        <Modal onClose={() => setDeleteConfirm(null)} title="Konfirmasi hapus penjualan" variant="center" zIndex={70} panelClassName="bg-surface rounded-xl shadow-xl w-full max-w-sm p-6 mx-4">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-error text-2xl">delete</span>
              <h3 className="text-lg font-bold text-on-surface">Hapus Penjualan?</h3>
            </div>
            <p className="text-sm text-on-surface-variant mb-6">
              Transaksi <strong>{deleteConfirm.sale_number}</strong> akan dihapus. Stok produk akan dikembalikan.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 rounded-xl border border-outline-variant text-on-surface text-sm font-medium hover:bg-surface-container-high transition-colors">Batal</button>
              <button onClick={() => deleteMutation.mutate(deleteConfirm.id)} disabled={deleteMutation.isPending} className="px-4 py-2 rounded-xl bg-error text-on-error text-sm font-medium hover:bg-error/90 transition-colors disabled:opacity-50">
                {deleteMutation.isPending ? 'Menghapus...' : 'Hapus'}
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
}
