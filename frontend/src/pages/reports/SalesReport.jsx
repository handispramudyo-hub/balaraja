import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/format';
import { ShoppingBag, CheckCircle2, Clock, XCircle } from 'lucide-react';

const statusConfig = {
  lunas: { label: 'Lunas', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  partial: { label: 'Sebagian', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  belum_bayar: { label: 'Belum Bayar', color: 'bg-red-100 text-red-700', icon: XCircle },
};

export default function SalesReport() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(todayStr);
  const [customer, setCustomer] = useState('');
  const [status, setStatus] = useState('');

  const { data: customersData } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const res = await api.get('/customers');
      return res.data;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['sales-report', startDate, endDate, customer, status],
    queryFn: async () => {
      const params = { start_date: startDate, end_date: endDate };
      if (customer) params.customer_id = customer;
      if (status) params.status = status;
      const res = await api.get('/reports/sales', { params });
      return res.data;
    },
  });

  const items = data?.data || data || [];
  const customers = customersData?.data || customersData || [];

  const totalPenjualan = items.reduce((s, r) => s + (r.total || 0), 0);
  const totalPembayaran = items.reduce((s, r) => s + (r.pembayaran || r.bayar || 0), 0);
  const totalPiutang = items.reduce((s, r) => s + (r.piutang || r.sisa_piutang || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Laporan Penjualan</h1>
        <p className="text-gray-500 text-sm">Rekapitulasi transaksi penjualan</p>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Toko</label>
            <select
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white min-w-[180px]"
            >
              <option value="">Semua Toko</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.nama_toko || c.nama || c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white min-w-[140px]"
            >
              <option value="">Semua Status</option>
              <option value="lunas">Lunas</option>
              <option value="partial">Sebagian</option>
              <option value="belum_bayar">Belum Bayar</option>
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <p className="text-gray-500">Memuat data penjualan...</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600 bg-gray-50">
                  <th className="px-4 py-3 font-medium w-10">No</th>
                  <th className="px-4 py-3 font-medium">No Transaksi</th>
                  <th className="px-4 py-3 font-medium">Tanggal</th>
                  <th className="px-4 py-3 font-medium">Toko</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium text-right">Pembayaran</th>
                  <th className="px-4 py-3 font-medium text-right">Piutang</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-gray-400">
                      <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      Tidak ada data penjualan
                    </td>
                  </tr>
                ) : (
                  items.map((r, i) => {
                    const st = r.status || (r.sisa_piutang > 0 ? (r.pembayaran > 0 ? 'partial' : 'belum_bayar') : 'lunas');
                    const cfg = statusConfig[st] || statusConfig.lunas;
                    const StatusIcon = cfg.icon;

                    return (
                      <tr key={r.id || i} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                        <td className="px-4 py-3 font-mono text-xs text-blue-600">{r.no_transaksi || r.kode}</td>
                        <td className="px-4 py-3">{formatDate(r.tanggal || r.tanggal_transaksi)}</td>
                        <td className="px-4 py-3 text-gray-900">{r.nama_toko || r.toko || r.customer}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatCurrency(r.total)}</td>
                        <td className="px-4 py-3 text-right text-green-600">{formatCurrency(r.pembayaran || r.bayar)}</td>
                        <td className="px-4 py-3 text-right text-red-600">{formatCurrency(r.piutang || r.sisa_piutang)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                            <StatusIcon className="w-3.5 h-3.5" />
                            {cfg.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {items.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                    <td colSpan={4} className="px-4 py-3 text-gray-900">Total</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(totalPenjualan)}</td>
                    <td className="px-4 py-3 text-right text-green-600">{formatCurrency(totalPembayaran)}</td>
                    <td className="px-4 py-3 text-right text-red-600">{formatCurrency(totalPiutang)}</td>
                    <td></td>
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
