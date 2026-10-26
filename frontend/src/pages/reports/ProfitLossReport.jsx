import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../lib/format';
import DateInput from '../../components/ui/DateInput';
import Button from '../../components/ui/Button';
import Money from '../../components/ui/Money';
import Badge from '../../components/ui/Badge';
import ReportShell, { ExportPlaceholderButton } from '../../components/reports/ReportShell';

function monthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
}

function Row({ label, value, strong = false, tone = 'default', indent = false }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 py-2 ${indent ? 'pl-4' : ''}`}
    >
      <span
        className={
          strong
            ? 'text-sm font-semibold text-on-surface'
            : 'text-sm text-on-surface-variant'
        }
      >
        {label}
      </span>
      <Money
        value={value}
        variant={tone}
        className={strong ? 'text-sm font-semibold' : 'text-sm'}
      />
    </div>
  );
}

/**
 * Laporan laba rugi.
 *
 * Berbeda dari laporan transaksi lain yang berupa tabel, laporan ini adalah
 * satu ringkasan bertingkat (omzet - modal - biaya = laba bersih). Karena itu
 * isinya sengaja dibuat sebagai daftar baris, bukan tabel, supaya hubungan
 * antar angka terbaca dari atas ke bawah dan tetap rapi saat dicetak.
 */
export default function ProfitLossReport() {
  const firstDay = monthStart();
  const todayStr = new Date().toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(todayStr);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['profit-loss', startDate, endDate],
    queryFn: async () =>
      (
        await api.get('/reports/profit-loss', {
          params: { start_date: startDate, end_date: endDate },
        })
      ).data,
  });

  const d = data?.data || data || {};
  const omzet = d.omzet || 0;
  const modal = d.modal || d.total_modal || 0;
  const labaKotor = d.laba_kotor ?? omzet - modal;
  const biaya = d.expenses || d.biaya || {};
  const transportasi = biaya.transportasi || 0;
  const ongkosKirim = biaya.ongkos_kirim || biaya.ongkir || 0;
  const operasional = biaya.operasional || 0;
  const totalBiaya = d.total_biaya ?? transportasi + ongkosKirim + operasional;
  const labaBersih = d.laba_bersih ?? labaKotor - totalBiaya;
  const isLaba = labaBersih >= 0;

  return (
    <ReportShell
      title="Laporan Laba Rugi"
      subtitle="Rekapitulasi pendapatan, modal, dan biaya usaha"
      breadcrumbLabel="Laporan"
      period={`${formatDate(startDate)} s/d ${formatDate(endDate)}`}
      summary={[
        { label: 'Omzet', value: formatCurrency(omzet) },
        { label: 'Laba Kotor', value: formatCurrency(labaKotor) },
        { label: 'Laba Bersih', value: formatCurrency(labaBersih) },
      ]}
      toolbar={
        <>
          <Button
            variant="outline"
            size="sm"
            icon="refresh"
            loading={isFetching && !isLoading}
            onClick={() => refetch()}
          >
            Hitung Ulang
          </Button>
          <Button size="sm" icon="print" onClick={() => window.print()} disabled={isLoading || isError}>
            Cetak
          </Button>
          <ExportPlaceholderButton label="Export Excel" />
        </>
      }
      filters={{
        activeCount: [startDate !== firstDay, endDate !== todayStr].filter(Boolean).length,
        onReset: () => {
          setStartDate(firstDay);
          setEndDate(todayStr);
        },
        children: (
          <>
            <DateInput value={startDate} onChange={setStartDate} aria-label="Tanggal awal" />
            <DateInput value={endDate} onChange={setEndDate} aria-label="Tanggal akhir" />
          </>
        ),
      }}
      isLoading={isLoading || isFetching}
      isError={isError}
      error={error}
      onRetry={() => refetch()}
      loadingMessage="Menghitung laporan..."
      errorTitle="Gagal memuat laporan laba rugi"
    >
      <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest overflow-hidden">
        <div className="no-print bg-primary text-on-primary px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-2xs uppercase tracking-wider opacity-80">Laporan Laba Rugi</p>
              <p className="text-sm font-semibold mt-0.5">
                {formatDate(startDate)} s/d {formatDate(endDate)}
              </p>
            </div>
            <Badge
              tone={isLaba ? 'success' : 'danger'}
              icon={isLaba ? 'trending_up' : 'trending_down'}
            >
              {isLaba ? 'Laba' : 'Rugi'}
            </Badge>
          </div>
        </div>

        <div className="px-4 py-2 divide-y divide-outline-variant/40">
          <Row label="Omzet" value={omzet} tone="default" />
          <Row label="Modal" value={modal} />
          <Row label="Laba Kotor" value={labaKotor} strong tone="strong" />

          <div className="py-2">
            <p className="text-sm font-semibold text-on-surface mb-1">Biaya</p>
            <div className="divide-y divide-outline-variant/30">
              <Row label="Transportasi" value={transportasi} indent />
              <Row label="Ongkos Kirim" value={ongkosKirim} indent />
              <Row label="Operasional" value={operasional} indent />
              <Row label="Total Biaya" value={totalBiaya} strong indent />
            </div>
          </div>

          <div
            className={`flex items-center justify-between gap-3 py-3 ${isLaba ? 'text-success' : 'text-danger'}`}
          >
            <span className="text-base font-bold">Laba Bersih</span>
            <span className="text-xl font-bold tabular-nums">{formatCurrency(labaBersih)}</span>
          </div>
        </div>
      </div>
    </ReportShell>
  );
}
