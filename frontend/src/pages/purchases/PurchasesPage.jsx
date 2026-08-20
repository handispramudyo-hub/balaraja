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
  Truck,
  Filter,
} from 'lucide-react';

export default function PurchasesPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    supplier_id: '',
  });
  const [detail, setDetail] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['purchases', filters],
    queryFn: async () => {
      const params = {};
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      if (filters.supplier_id) params.supplier_id = filters.supplier_id;
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
  const supplierList = suppliers?.data || suppliers || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pembelian</h1>
          <p className="text-gray-500">Daftar transaksi pembelian</p>
        </div>
        <button
          onClick={() => navigate('/pembelian/tambah')}
          className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow transition-colors"
        >
          <Plus className="w-4 h-4" />
          Tambah Pembelian
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Filter</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Supplier</label>
            <div className="relative">
              <Truck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={filters.supplier_id}
                onChange={(e) => setFilters((f) => ({ ...f, supplier_id: e.target.value }))}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
              >
                <option value="">Semua Supplier</option>
                {supplierList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
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
                <th className="px-4 py-3 text-left font-semibold text-gray-600">No Pembelian</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Tanggal</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Supplier</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Total</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">Memuat data...</td>
                </tr>
              ) : purchases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">Tidak ada data pembelian</td>
                </tr>
              ) : (
                purchases.map((item, idx) => (
                  <tr
                    key={item.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setDetail(item)}
                  >
                    <td className="px-4 py-3 text-gray-700">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{item.purchase_number}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(item.date)}</td>
                    <td className="px-4 py-3 text-gray-600">{item.supplier?.name || '-'}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">{formatCurrency(item.total)}</td>
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
                ))
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
                <h3 className="text-lg font-bold text-gray-900">Detail Pembelian</h3>
                <p className="text-sm text-gray-500">{detail.purchase_number}</p>
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
                  <span className="text-gray-500">Supplier</span>
                  <p className="font-medium text-gray-800">{detail.supplier?.name || '-'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Catatan</span>
                  <p className="font-medium text-gray-800">{detail.notes || '-'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Total</span>
                  <p className="font-bold text-gray-900">{formatCurrency(detail.total)}</p>
                </div>
              </div>

              {purchaseDetail?.items && purchaseDetail.items.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Item Pembelian</h4>
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
                      {purchaseDetail.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-gray-700">{item.product?.name || item.product_name}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{item.quantity}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(item.buy_price)}</td>
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
