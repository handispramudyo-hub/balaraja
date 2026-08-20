import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/format';
import { Receipt, Truck, Package, Settings } from 'lucide-react';

export default function ExpenseReport() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(todayStr);
  const [category, setCategory] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['expense-report', startDate, endDate, category],
    queryFn: async () => {
      const params = { start_date: startDate, end_date: endDate };
      if (category) params.category = category;
      const res = await api.get('/reports/expenses', { params });
      return res.data;
    },
  });

  const items = data?.data || data || [];

  const rekap = {
    transportasi: items.filter((r) => (r.kategori || '').toLowerCase() === 'transportasi').reduce((s, r) => s + (r.nominal || 0), 0),
    ongkir: items.filter((r) => (r.kategori || '').toLowerCase() === 'ongkir' || (r.kategori || '').toLowerCase() === 'ongkos kirim').reduce((s, r) => s + (r.nominal || 0), 0),
    operasional: items.filter((r) => (r.kategori || '').toLowerCase() === 'operasional').reduce((s, r) => s + (r.nominal || 0), 0),
  };
  rekap.total = rekap.transportasi + rekap.ongkir + rekap.operasional;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Laporan Biaya</h1>
        <p className="text-gray-500 text-sm">Rekapitulasi pengeluaran biaya</p>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
            >
              <option value="">Semua Kategori</option>
              <option value="transportasi">Transportasi</option>
              <option value="ongkir">Ongkos Kirim</option>
              <option value="operasional">Operasional</option>
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <p className="text-gray-500">Memuat data biaya...</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-600 bg-gray-50">
                    <th className="px-4 py-3 font-medium w-10">No</th>
                    <th className="px-4 py-3 font-medium">Tanggal</th>
                    <th className="px-4 py-3 font-medium">Kategori</th>
                    <th className="px-4 py-3 font-medium">Keterangan</th>
                    <th className="px-4 py-3 font-medium text-right">Nominal</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-gray-400">
                        <Receipt className="w-10 h-10 mx-auto mb-2 opacity-50" />
                        Tidak ada data biaya
                      </td>
                    </tr>
                  ) : (
                    items.map((r, i) => (
                      <tr key={r.id || i} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                        <td className="px-4 py-3">{formatDate(r.tanggal)}</td>
                        <td className="px-4 py-3">
                          <span className="font-medium">{r.kategori}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{r.keterangan || '-'}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatCurrency(r.nominal)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {items.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                      <td colSpan={4} className="px-4 py-3 text-gray-900">Total</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(items.reduce((s, r) => s + (r.nominal || 0), 0))}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {items.length > 0 && (
            <div className="bg-white rounded-xl shadow p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Rekap Biaya</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                  <Truck className="w-8 h-8 text-blue-500" />
                  <div>
                    <p className="text-xs text-gray-500">Transportasi</p>
                    <p className="text-lg font-bold text-blue-700">{formatCurrency(rekap.transportasi)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                  <Package className="w-8 h-8 text-green-500" />
                  <div>
                    <p className="text-xs text-gray-500">Ongkos Kirim</p>
                    <p className="text-lg font-bold text-green-700">{formatCurrency(rekap.ongkir)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg">
                  <Settings className="w-8 h-8 text-orange-500" />
                  <div>
                    <p className="text-xs text-gray-500">Operasional</p>
                    <p className="text-lg font-bold text-orange-700">{formatCurrency(rekap.operasional)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-gray-900 rounded-lg">
                  <Receipt className="w-8 h-8 text-white opacity-80" />
                  <div>
                    <p className="text-xs text-gray-300">Grand Total</p>
                    <p className="text-lg font-bold text-white">{formatCurrency(rekap.total)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
