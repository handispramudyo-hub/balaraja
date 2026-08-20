import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/format';
import { Calculator, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Receipt } from 'lucide-react';

export default function ProfitLossPage() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(todayStr);
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['profit-loss', startDate, endDate],
    queryFn: async () => {
      const res = await api.get('/reports/profit-loss', { params: { start_date: startDate, end_date: endDate } });
      return res.data;
    },
    enabled: submitted,
  });

  const handleHitung = () => {
    setSubmitted(true);
    refetch();
  };

  const d = data?.data || data || {};
  const omzet = d.omzet || 0;
  const modal = d.modal || d.total_modal || 0;
  const labaKotor = d.laba_kotor || (omzet - modal);
  const biaya = d.biaya || {};
  const transportasi = biaya.transportasi || 0;
  const ongkos_kirim = biaya.ongkos_kirim || biaya.ongkir || 0;
  const operasional = biaya.operasional || 0;
  const totalBiaya = d.total_biaya || (transportasi + ongkos_kirim + operasional);
  const labaBersih = d.laba_bersih || (labaKotor - totalBiaya);
  const isLaba = labaBersih >= 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Laporan Laba Rugi</h1>
        <p className="text-gray-500 text-sm">Analisis laba dan rugi usaha</p>
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
          <button
            onClick={handleHitung}
            className="flex items-center gap-2 px-5 py-2 bg-blue-900 text-white rounded-lg text-sm font-semibold hover:bg-blue-800 transition"
          >
            <Calculator className="w-4 h-4" />
            Hitung
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-40">
          <p className="text-gray-500">Menghitung laporan...</p>
        </div>
      )}

      {!isLoading && submitted && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="bg-blue-900 text-white px-6 py-5 text-center">
            <h2 className="text-lg font-bold tracking-wide">LAPORAN LABA RUGI</h2>
            <p className="text-blue-200 text-sm mt-1">Periode: {formatDate(startDate)} s/d {formatDate(endDate)}</p>
          </div>

          <div className="px-6 py-6 space-y-6 max-w-2xl mx-auto">
            <div className="flex justify-between items-center py-3 border-b border-gray-200">
              <span className="text-gray-700 font-medium">OMZET</span>
              <span className="text-lg font-bold text-blue-900">{formatCurrency(omzet)}</span>
            </div>

            <div className="flex justify-between items-center py-3 border-b border-gray-200">
              <span className="text-gray-700 font-medium">MODAL</span>
              <span className="text-lg font-bold text-gray-900">{formatCurrency(modal)}</span>
            </div>

            <div className="flex justify-between items-center py-3 border-b-2 border-gray-300">
              <span className="text-gray-700 font-semibold">LABA KOTOR</span>
              <span className="text-lg font-bold text-blue-900">{formatCurrency(labaKotor)}</span>
            </div>

            <div className="py-3">
              <p className="text-gray-700 font-semibold mb-3">BIAYA</p>
              <div className="space-y-2 pl-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Transportasi</span>
                  <span className="text-gray-900">{formatCurrency(transportasi)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Ongkos Kirim</span>
                  <span className="text-gray-900">{formatCurrency(ongkos_kirim)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Operasional</span>
                  <span className="text-gray-900">{formatCurrency(operasional)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-gray-200 pt-2 mt-2">
                  <span className="text-gray-700 font-semibold">Total Biaya</span>
                  <span className="text-gray-900 font-semibold">{formatCurrency(totalBiaya)}</span>
                </div>
              </div>
            </div>

            <div className={`flex justify-between items-center py-4 border-t-2 ${isLaba ? 'border-green-400' : 'border-red-400'}`}>
              <div className="flex items-center gap-2">
                <span className="text-gray-900 font-bold text-lg">LABA BERSIH</span>
                {isLaba ? (
                  <ArrowUpRight className="w-5 h-5 text-green-500" />
                ) : (
                  <ArrowDownRight className="w-5 h-5 text-red-500" />
                )}
              </div>
              <span className={`text-2xl font-bold ${isLaba ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(labaBersih)}
              </span>
            </div>

            <div className="text-center pt-2">
              <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${isLaba ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {isLaba ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {isLaba ? 'LABA' : 'RUGI'}
              </span>
            </div>
          </div>
        </div>
      )}

      {!isLoading && submitted && !data && (
        <div className="text-center py-12 text-gray-400">
          <Receipt className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Data laporan tidak tersedia</p>
        </div>
      )}
    </div>
  );
}
