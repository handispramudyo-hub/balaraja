import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/format';
import { Search, ChevronDown, ChevronRight, AlertTriangle, Clock, CheckCircle2, XCircle, DollarSign } from 'lucide-react';

const statusConfig = {
  belum_bayar: { label: 'Belum Bayar', color: 'bg-red-100 text-red-700', icon: XCircle },
  partial: { label: 'Sebagian', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  overdue: { label: 'Jatuh Tempo', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
  lunas: { label: 'Lunas', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
};

function getStatus(customer) {
  if (customer.status_lunas === 'lunas') return 'lunas';
  const today = new Date().toISOString().split('T')[0];
  if (customer.jatuh_tempo && customer.jatuh_tempo < today && customer.sisa_piutang > 0) return 'overdue';
  if (customer.sisa_piutang === 0) return 'lunas';
  if (customer.pembayaran > 0 && customer.pembayaran < customer.total_transaksi) return 'partial';
  return 'belum_bayar';
}

export default function ReceivablesPage() {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['receivables'],
    queryFn: async () => {
      const res = await api.get('/reports/receivables');
      return res.data;
    },
  });

  const items = data?.data || data || [];
  const filtered = items.filter((c) =>
    (c.nama_toko || c.toko || '').toLowerCase().includes(search.toLowerCase())
  );

  const summary = {
    total: filtered.reduce((s, c) => s + (c.total_transaksi || 0), 0),
    belumBayar: filtered.filter((c) => getStatus(c) === 'belum_bayar').length,
    partial: filtered.filter((c) => getStatus(c) === 'partial').length,
    overdue: filtered.filter((c) => getStatus(c) === 'overdue').length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Memuat data piutang...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Piutang</h1>
        <p className="text-gray-500 text-sm">Daftar piutang dari pelanggan</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium opacity-90">Total Piutang</span>
            <DollarSign className="w-5 h-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold">{formatCurrency(summary.total)}</p>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium opacity-90">Belum Bayar</span>
            <XCircle className="w-5 h-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold">{summary.belumBayar} toko</p>
        </div>
        <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium opacity-90">Sebagian</span>
            <Clock className="w-5 h-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold">{summary.partial} toko</p>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-xl p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium opacity-90">Jatuh Tempo</span>
            <AlertTriangle className="w-5 h-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold">{summary.overdue} toko</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex items-center gap-3 mb-4">
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
        </div>

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
                  <td colSpan={7} className="py-8 text-center text-gray-400">Tidak ada data piutang</td>
                </tr>
              ) : (
                filtered.map((c, i) => {
                  const status = getStatus(c);
                  const cfg = statusConfig[status];
                  const StatusIcon = cfg.icon;
                  const isOpen = expanded === i;
                  const isOverdue = status === 'overdue';

                  return (
                    <>
                      <tr
                        key={c.id || i}
                        className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition ${isOverdue ? 'bg-red-50/50' : ''}`}
                        onClick={() => setExpanded(isOpen ? null : i)}
                      >
                        <td className="py-3 text-gray-500">{i + 1}</td>
                        <td className="py-3 font-medium text-gray-900 flex items-center gap-2">
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          {c.nama_toko || c.toko}
                        </td>
                        <td className="py-3 text-right">{formatCurrency(c.total_transaksi)}</td>
                        <td className="py-3 text-right">{formatCurrency(c.pembayaran)}</td>
                        <td className="py-3 text-right font-semibold text-red-600">{formatCurrency(c.sisa_piutang)}</td>
                        <td className="py-3">
                          <span className={isOverdue ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                            {c.jatuh_tempo ? formatDate(c.jatuh_tempo) : '-'}
                          </span>
                          {isOverdue && (
                            <span className="ml-2 inline-flex items-center gap-1 text-xs text-red-600">
                              <AlertTriangle className="w-3 h-3" /> Terlambat
                            </span>
                          )}
                        </td>
                        <td className="py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                            <StatusIcon className="w-3.5 h-3.5" />
                            {cfg.label}
                          </span>
                        </td>
                      </tr>
                      {isOpen && c.detail && (
                        <tr key={`${c.id || i}-detail`}>
                          <td colSpan={7} className="px-4 py-3 bg-gray-50">
                            <div className="ml-6">
                              <p className="text-xs font-semibold text-gray-600 mb-2">Detail Penjualan Belum Lunas:</p>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-gray-500 border-b border-gray-200">
                                    <th className="pb-1 font-medium">No</th>
                                    <th className="pb-1 font-medium">Tanggal</th>
                                    <th className="pb-1 font-medium text-right">Total</th>
                                    <th className="pb-1 font-medium text-right">Bayar</th>
                                    <th className="pb-1 font-medium text-right">Sisa</th>
                                    <th className="pb-1 font-medium">Jatuh Tempo</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {c.detail.map((d, j) => (
                                    <tr key={d.id || j} className="border-b border-gray-100">
                                      <td className="py-1 text-gray-500">{j + 1}</td>
                                      <td className="py-1">{formatDate(d.tanggal || d.tanggal_transaksi)}</td>
                                      <td className="py-1 text-right">{formatCurrency(d.total)}</td>
                                      <td className="py-1 text-right">{formatCurrency(d.pembayaran || d.bayar)}</td>
                                      <td className="py-1 text-right font-medium">{formatCurrency(d.sisa_piutang || d.sisa)}</td>
                                      <td className="py-1">{d.jatuh_tempo ? formatDate(d.jatuh_tempo) : '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
