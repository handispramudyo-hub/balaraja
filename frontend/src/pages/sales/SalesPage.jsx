import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { formatCurrency, formatDate } from '../../utils/format';
import api from '../../services/api';
import {
  Plus,
  Eye,
  X,
  Calendar,
  Store,
  Filter,
} from 'lucide-react';

const statusBadge = {
  lunas: { label: 'Lunas', className: 'bg-green-100 text-green-700' },
  partial: { label: 'Partial', className: 'bg-yellow-100 text-yellow-700' },
  belum_bayar: { label: 'Belum Bayar', className: 'bg-red-100 text-red-700' },
};

export default function SalesPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    customer_id: '',
    payment_status: '',
  });
  const [detail, setDetail] = useState(null);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Penjualan</h1>
          <p className="text-gray-500">Daftar transaksi penjualan</p>
        </div>
        <button
          onClick={() => navigate('/penjualan/tambah')}
          className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow transition-colors"
        >
          <Plus className="w-4 h-4" />
          Tambah Penjualan
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Filter</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal Mulai</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) => setFilters((f) => ({ ...f, start_date: e.target.value }))}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal Akhir</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) => setFilters((f) => ({ ...f, end_date: e.target.value }))}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Toko</label>
            <div className="relative">
              <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={filters.customer_id}
                onChange={(e) => setFilters((f) => ({ ...f, customer_id: e.target.value }))}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
              >
                <option value="">Semua Toko</option>
                {customerList.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status Pembayaran</label>
            <select
              value={filters.payment_status}
              onChange={(e) => setFilters((f) => ({ ...f, payment_status: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
            >
              <option value="">Semua Status</option>
              <option value="lunas">Lunas</option>
              <option value="partial">Partial</option>
              <option value="belum_bayar">Belum Bayar</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-semibold text-gray-600">No</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">No Transaksi</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Tanggal</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Toko</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Total</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Pembayaran</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Sisa Piutang</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">Memuat data...</td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">Tidak ada data penjualan</td>
                </tr>
              ) : (
                sales.map((item, idx) => {
                  const badge = statusBadge[item.payment_status] || statusBadge.belum_bayar;
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setDetail(item)}
                    >
                      <td className="px-4 py-3 text-gray-700">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{item.sale_number}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(item.date)}</td>
                      <td className="px-4 py-3 text-gray-600">{item.customer?.name || '-'}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">{formatCurrency(item.total)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(item.amount_paid)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(item.remaining_balance)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDetail(item); }}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
                        >
                          <Eye className="w-4 h-4" />
                          Detail
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Detail Penjualan</h3>
                <p className="text-sm text-gray-500">{detail.sale_number}</p>
              </div>
              <button onClick={() => setDetail(null)} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Tanggal</span>
                  <p className="font-medium text-gray-800">{formatDate(detail.date)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Toko</span>
                  <p className="font-medium text-gray-800">{detail.customer?.name || '-'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Jatuh Tempo</span>
                  <p className="font-medium text-gray-800">{detail.due_date ? formatDate(detail.due_date) : '-'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Status</span>
                  <p className="font-medium">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${(statusBadge[detail.payment_status] || statusBadge.belum_bayar).className}`}>
                      {(statusBadge[detail.payment_status] || statusBadge.belum_bayar).label}
                    </span>
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Total</span>
                  <p className="font-bold text-gray-900">{formatCurrency(detail.total)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Sisa Piutang</span>
                  <p className="font-bold text-gray-900">{formatCurrency(detail.remaining_balance)}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500">Catatan</span>
                  <p className="font-medium text-gray-800">{detail.notes || '-'}</p>
                </div>
              </div>

              {saleDetail?.items && saleDetail.items.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Item Penjualan</h4>
                  <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Produk</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Qty</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Harga</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {saleDetail.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-gray-700">{item.product?.name || item.product_name}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{item.quantity}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(item.sell_price)}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-800">{formatCurrency(item.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
