import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/format';
import { Search, AlertTriangle, Clock, XCircle, CheckCircle2, CreditCard, DollarSign } from 'lucide-react';

const statusConfig = {
  belum_bayar: { label: 'Belum Bayar', color: 'bg-red-100 text-red-700', icon: XCircle },
  partial: { label: 'Sebagian', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  overdue: { label: 'Jatuh Tempo', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
  lunas: { label: 'Lunas', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
};

function getStatus(c) {
  if (c.status_lunas === 'lunas') return 'lunas';
  const today = new Date().toISOString().split('T')[0];
  if (c.jatuh_tempo && c.jatuh_tempo < today && c.sisa_piutang > 0) return 'overdue';
  if (c.sisa_piutang === 0) return 'lunas';
  if (c.pembayaran > 0 && c.pembayaran < c.total_transaksi) return 'partial';
  return 'belum_bayar';
}

export default function ReceivableReport() {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['receivable-report'],
    queryFn: async () => {
      const res = await api.get('/reports/receivables');
      return res.data;
    },
  });

  const items = data?.data || data || [];
  const filtered = items
    .filter((c) => (c.nama_toko || c.toko || '').toLowerCase().includes(search.toLowerCase()))
    .filter((c) => !filterStatus || getStatus(c) === filterStatus);

  const totalPiutang = filtered.reduce((s, c) => s + (c.total_transaksi || 0), 0);
  const totalBelumBayar = filtered.filter((c) => getStatus(c) === 'belum_bayar').reduce((s, c) => s + (c.sisa_piutang || 0), 0);
  const totalSebagian = filtered.filter((c) => getStatus(c) === 'partial').reduce((s, c) => s + (c.sisa_piutang || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Laporan Piutang</h1>
        <p className="text-gray-500 text-sm">Rekapitulasi piutang pelanggan</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium opacity-90">Total Piutang</span>
            <DollarSign className="w-5 h-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totalPiutang)}</p>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium opacity-90">Belum Bayar</span>
            <XCircle className="w-5 h-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totalBelumBayar)}</p>
        </div>
        <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium opacity-90">Sebagian</span>
            <Clock className="w-5 h-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totalSebagian)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex flex-wrap items-end gap-4 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Cari nama toko..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
            />
          </div>
          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
            >
              <option value="">Semua Status</option>
              <option value="belum_bayar">Belum Bayar</option>
              <option value="partial">Sebagian</option>
              <option value="overdue">Jatuh Tempo</option>
              <option value="lunas">Lunas</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <p className="text-gray-500">Memuat data piutang...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600">
                  <th className="pb-3 font-medium w-10">No</th>
                  <th className="pb-3 font-medium">Toko</th>
                  <th className="pb-3 font-medium text-right">Total Transaksi</th>
                  <th className="pb-3 font-medium text-right">Pembayaran</th>
                  <th className="pb-3 font-medium text-right">Sisa Piutang</th>
                  <th className="pb-3 font-medium">Jatuh Tempo</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400">
                      <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      Tidak ada data piutang
                    </td>
                  </tr>
                ) : (
                  filtered.map((c, i) => {
                    const status = getStatus(c);
                    const cfg = statusConfig[status];
                    const StatusIcon = cfg.icon;

                    return (
                      <tr key={c.id || i} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{c.nama_toko || c.toko}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(c.total_transaksi)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(c.pembayaran)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-red-600">{formatCurrency(c.sisa_piutang)}</td>
                        <td className="px-4 py-3">{c.jatuh_tempo ? formatDate(c.jatuh_tempo) : '-'}</td>
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
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
