import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/format';
import { ShoppingCart } from 'lucide-react';

export default function PurchaseReport() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(todayStr);
  const [supplier, setSupplier] = useState('');

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const res = await api.get('/suppliers');
      return res.data;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-report', startDate, endDate, supplier],
    queryFn: async () => {
      const params = { start_date: startDate, end_date: endDate };
      if (supplier) params.supplier_id = supplier;
      const res = await api.get('/reports/purchases', { params });
      return res.data;
    },
  });

  const items = data?.data || data || [];
  const suppliers = suppliersData?.data || suppliersData || [];
  const total = items.reduce((s, r) => s + (r.total || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Laporan Pembelian</h1>
        <p className="text-gray-500 text-sm">Rekapitulasi transaksi pembelian</p>
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Mulai</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Akhir</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
            <select
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white min-w-[180px]"
            >
              <option value="">Semua Supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.nama || s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <p className="text-gray-500">Memuat data pembelian...</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600 bg-gray-50">
                  <th className="px-4 py-3 font-medium w-10">No</th>
                  <th className="px-4 py-3 font-medium">No Pembelian</th>
                  <th className="px-4 py-3 font-medium">Tanggal</th>
                  <th className="px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-400">
                      <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      Tidak ada data pembelian
                    </td>
                  </tr>
                ) : (
                  items.map((r, i) => (
                    <tr key={r.id || i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                      <td className="px-4 py-3 font-mono text-xs text-blue-600">{r.no_pembelian || r.kode}</td>
                      <td className="px-4 py-3">{formatDate(r.tanggal || r.tanggal_pembelian)}</td>
                      <td className="px-4 py-3 text-gray-900">{r.nama_supplier || r.supplier}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatCurrency(r.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {items.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                    <td colSpan={4} className="px-4 py-3 text-gray-900">Total</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
