import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/format';
import PrintHeader from '../../components/ui/PrintHeader';
import PrintFooter from '../../components/ui/PrintFooter';

export default function ProfitLossReport() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(todayStr);
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
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
  const biaya = d.expenses || d.biaya || {};
  const transportasi = biaya.transportasi || 0;
  const ongkos_kirim = biaya.ongkos_kirim || biaya.ongkir || 0;
  const operasional = biaya.operasional || 0;
  const totalBiaya = d.total_biaya || (transportasi + ongkos_kirim + operasional);
  const labaBersih = d.laba_bersih || (labaKotor - totalBiaya);
  const isLaba = labaBersih >= 0;

  return (
    <>
      <main className="flex-grow px-4 py-6 overflow-y-auto print-area">
        <div className="mb-6 flex justify-between items-end">
          <div>
            <h2 className="text-xl font-semibold text-on-surface mb-1">Laporan Laba Rugi</h2>
            <p className="text-sm text-on-surface-variant">Cetak laporan laba dan rugi usaha</p>
          </div>
          {submitted && !isLoading && (
            <button
              onClick={() => window.print()}
              className="no-print bg-primary text-on-primary h-10 px-4 rounded-lg text-xs font-medium flex items-center gap-2 active:scale-95 transition-transform shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">print</span> Cetak
            </button>
          )}
        </div>

        <section className="no-print bg-surface-container-lowest rounded-xl p-4 mb-6 shadow-sm border border-outline-variant/30 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-on-surface-variant" htmlFor="tanggal-awal-1">Tanggal Awal</label>
            <input
              id="tanggal-awal-1"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full h-12 bg-surface rounded-lg border border-outline-variant px-3 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-on-surface-variant" htmlFor="tanggal-akhir-2">Tanggal Akhir</label>
            <input
              id="tanggal-akhir-2"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full h-12 bg-surface rounded-lg border border-outline-variant px-3 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            />
          </div>
          <button
            onClick={handleHitung}
            className="w-full bg-primary text-on-primary h-12 rounded-lg text-sm font-medium flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm hover:bg-primary-fixed-dim"
          >
            <span className="material-symbols-outlined text-[18px]">calculate</span>
            Hitung
          </button>
        </section>

        {isError && (
          <div className="bg-error-container text-on-error-container border border-outline-variant/30 rounded-xl p-8 text-center">
            <span className="material-symbols-outlined text-[40px] block mb-2">cloud_off</span>
            <p className="text-sm font-medium mb-1">Gagal memuat laporan laba rugi</p>
            <p className="text-xs opacity-80 mb-4">
              {error?.response?.data?.message || error?.message || 'Terjadi kesalahan saat mengambil data.'}
            </p>
            <button
              onClick={() => refetch()}
              className="bg-primary text-on-primary px-5 py-2 rounded-lg text-xs font-medium"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {!isError && isLoading && (
          <div className="flex items-center justify-center h-40">
            <p className="text-on-surface-variant">Menghitung laporan...</p>
          </div>
        )}

        {!isError && !isLoading && submitted && (
          <div className="print-area">
            <PrintHeader
              title="Laporan Laba Rugi"
              subtitle="Rekapitulasi pendapatan, modal, dan biaya usaha"
              period={`${formatDate(startDate)} s/d ${formatDate(endDate)}`}
              summary={[
                { label: 'Omzet', value: formatCurrency(omzet) },
                { label: 'Laba Kotor', value: formatCurrency(labaKotor) },
                { label: 'Laba Bersih', value: formatCurrency(labaBersih) },
              ]}
            />
            <div className="bg-surface rounded-xl shadow-sm border border-outline-variant/30 overflow-hidden">
              <div className="no-print bg-primary text-on-primary px-6 py-5 text-center">
                <h2 className="text-lg font-bold tracking-wide">LAPORAN LABA RUGI</h2>
                <p className="text-on-primary/70 text-sm mt-1">BALARAJA</p>
                <p className="text-on-primary/70 text-sm">Periode: {formatDate(startDate)} s/d {formatDate(endDate)}</p>
              </div>

              <div className="py-2 space-y-6">
                <div className="flex justify-between items-center py-3 border-b border-outline-variant">
                  <span className="text-on-surface-variant font-medium">OMZET</span>
                  <span className="text-lg font-bold text-primary">{formatCurrency(omzet)}</span>
                </div>

                <div className="flex justify-between items-center py-3 border-b border-outline-variant">
                  <span className="text-on-surface-variant font-medium">MODAL</span>
                  <span className="text-lg font-bold text-on-surface">{formatCurrency(modal)}</span>
                </div>

                <div className="flex justify-between items-center py-3 border-b-2 border-outline-variant">
                  <span className="text-on-surface font-semibold">LABA KOTOR</span>
                  <span className="text-lg font-bold text-primary">{formatCurrency(labaKotor)}</span>
                </div>

                <div className="py-3">
                  <p className="text-on-surface font-semibold mb-3">BIAYA</p>
                  <div className="space-y-2 pl-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-on-surface-variant">Transportasi</span>
                      <span className="text-on-surface">{formatCurrency(transportasi)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-on-surface-variant">Ongkos Kirim</span>
                      <span className="text-on-surface">{formatCurrency(ongkos_kirim)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-on-surface-variant">Operasional</span>
                      <span className="text-on-surface">{formatCurrency(operasional)}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-outline-variant pt-2 mt-2">
                      <span className="text-on-surface font-semibold">Total Biaya</span>
                      <span className="text-on-surface font-semibold">{formatCurrency(totalBiaya)}</span>
                    </div>
                  </div>
                </div>

                <div className={`flex justify-between items-center py-4 border-t-2 ${isLaba ? 'border-success' : 'border-error'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-on-surface font-bold text-lg">LABA BERSIH</span>
                    {isLaba ? (
                      <span className="material-symbols-outlined text-success">trending_up</span>
                    ) : (
                      <span className="material-symbols-outlined text-error">trending_down</span>
                    )}
                  </div>
                  <span className={`text-2xl font-bold ${isLaba ? 'text-success' : 'text-error'}`}>
                    {formatCurrency(labaBersih)}
                  </span>
                </div>

                <div className="no-print text-center pt-2">
                  <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${isLaba ? 'bg-success-container text-success' : 'bg-error-container text-on-error-container'}`}>
                    {isLaba ? (
                      <span className="material-symbols-outlined text-[18px]">trending_up</span>
                    ) : (
                      <span className="material-symbols-outlined text-[18px]">trending_down</span>
                    )}
                    {isLaba ? 'LABA' : 'RUGI'}
                  </span>
                </div>
              </div>
            </div>
            <PrintFooter />
          </div>
        )}

        {!isError && !isLoading && submitted && !data && (
          <div className="text-center py-12 text-on-surface-variant">
            <span className="material-symbols-outlined text-[48px] opacity-50 block mb-3">receipt_long</span>
            <p>Data laporan tidak tersedia</p>
          </div>
        )}
      </main>
    </>
  );
}
