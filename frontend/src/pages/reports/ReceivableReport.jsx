import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../lib/format';
import SearchInput from '../../components/ui/SearchInput';
import Select from '../../components/ui/Select';
import Money from '../../components/ui/Money';
import Badge from '../../components/ui/Badge';
import ReportShell from '../../components/reports/ReportShell';
import ReportToolbar from '../../components/reports/ReportToolbar';
import ItemDetail from '../../components/reports/ItemDetail';
import { EmptyState } from '../../components/ui/States';
import { useReportExport, compactParams } from '../../hooks/useReportExport';

const STATUS_META = {
  belum_bayar: { label: 'Belum Bayar', tone: 'danger', icon: 'cancel' },
  partial: { label: 'Sebagian', tone: 'warning', icon: 'schedule' },
  overdue: { label: 'Jatuh Tempo', tone: 'danger', icon: 'warning' },
  lunas: { label: 'Lunas', tone: 'success', icon: 'check_circle' },
};

function getStatus(c) {
  if (c.status_lunas === 'lunas') return 'lunas';
  const today = new Date().toISOString().split('T')[0];
  if (c.jatuh_tempo && c.jatuh_tempo < today && c.sisa_piutang > 0) return 'overdue';
  if (c.sisa_piutang === 0) return 'lunas';
  if (c.pembayaran > 0 && c.pembayaran < c.total_transaksi) return 'partial';
  return 'belum_bayar';
}

function StatusPill({ status }) {
  const cfg = STATUS_META[status] || STATUS_META.belum_bayar;
  return (
    <Badge tone={cfg.tone} icon={cfg.icon} size="sm">
      {cfg.label}
    </Badge>
  );
}

export default function ReceivableReport() {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [view, setView] = useState('ringkasan');

  const activeFilterCount = [search, filterStatus].filter(Boolean).length;

  // `search` diteruskan ke server supaya file export tidak berisi pelanggan
  // yang sedang tersembunyi oleh pencarian di layar.
  const statusParam =
    filterStatus === 'belum_bayar' ? 'unpaid' : filterStatus === 'partial' ? 'partial' : '';

  const filterParams = useMemo(
    () => compactParams({ status: statusParam, search }),
    [statusParam, search]
  );

  const { exporting, error: exportError, exportReport, clearError } = useReportExport('receivables', filterParams);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['receivables', statusParam, search],
    queryFn: async () => (await api.get('/reports/receivables', { params: filterParams })).data,
  });

  const items = data?.data || data || [];
  const filtered = items.filter((c) => !filterStatus || getStatus(c) === filterStatus);

  // `filtered` sudah identik dengan isi server (search & status pindah ke
  // server), jadi reduce lokal di sini sah — dan WAJIB tetap dipakai, bukan
  // summary server: kartu "Belum Bayar" dihitung dari subset status,
  // sedangkan summary server hanya mencakup seluruh pelanggan.
  const totalPiutang = filtered.reduce((s, c) => s + (c.sisa_piutang || 0), 0);
  const totalBelumBayar = filtered
    .filter((c) => getStatus(c) === 'belum_bayar')
    .reduce((s, c) => s + (c.sisa_piutang || 0), 0);
  const jumlahBelumBayar = filtered.filter((c) => getStatus(c) === 'belum_bayar').length;

  return (
    <ReportShell
      title="Piutang Pelanggan"
      subtitle="Rekapitulasi piutang pelanggan"
      breadcrumbLabel="Laporan"
      summary={[
        { label: 'Total Piutang', value: formatCurrency(totalPiutang) },
        { label: 'Pelanggan', value: `${filtered.length}` },
        { label: 'Belum Bayar', value: formatCurrency(totalBelumBayar) },
      ]}
      toolbar={
        <ReportToolbar
          view={view}
          onViewChange={setView}
          onPrint={() => window.print()}
          onExport={exportReport}
          exporting={exporting}
          exportNote={
            view === 'ringkasan'
              ? 'Export tetap berisi rincian barang (sheet Detail / PDF lengkap)'
              : null
          }
        />
      }
      exportError={exportError}
      onClearExportError={clearError}
      stats={[
        {
          label: 'Total Piutang',
          value: formatCurrency(totalPiutang),
          note: `${filtered.length} pelanggan`,
          className: 'bg-primary-container text-on-primary-container',
        },
        {
          label: 'Belum Bayar',
          value: formatCurrency(totalBelumBayar),
          note: `${jumlahBelumBayar} tanpa pembayaran`,
          className: 'bg-danger-container text-on-danger-container',
        },
        {
          label: 'Sudah Dibayar',
          value: formatCurrency(
            Math.max(
              filtered.reduce((s, c) => s + (c.pembayaran || 0), 0),
              0
            )
          ),
          note: 'Akumulasi pembayaran',
        },
        {
          label: 'Rata-rata Piutang',
          value: formatCurrency(filtered.length ? totalPiutang / filtered.length : 0),
          note: 'Per pelanggan',
        },
      ]}
      filters={{
        activeCount: activeFilterCount,
        onReset: () => {
          setSearch('');
          setFilterStatus('');
        },
        children: (
          <>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Cari nama pelanggan..."
              aria-label="Cari pelanggan"
            />
            <Select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
              aria-label="Filter status piutang"
            >
              <option value="">Semua status</option>
              <option value="belum_bayar">Belum Bayar</option>
              <option value="partial">Sebagian</option>
              <option value="overdue">Jatuh Tempo</option>
              <option value="lunas">Lunas</option>
            </Select>
          </>
        ),
      }}
      isLoading={isLoading}
      isError={isError}
      error={error}
      onRetry={() => refetch()}
      loadingMessage="Memuat data piutang..."
      errorTitle="Gagal memuat data piutang"
    >
      {filtered.length === 0 ? (
        <EmptyState
          icon="credit_card"
          title="Tidak ada piutang"
          description="Seluruh piutang pelanggan sudah lunas atau tidak ada yang cocok dengan filter."
        />
      ) : (
        <>
          <div className="hidden md:block print-table-wrap rounded-card border border-outline-variant/70 bg-surface-container-lowest overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap min-w-[600px]">
                <thead className="bg-surface-container-low border-b border-outline-variant/50 text-xs font-medium text-on-surface-variant">
                  <tr>
                    <th className="p-3 font-medium">No</th>
                    <th className="p-3 font-medium">Pelanggan</th>
                    <th className="p-3 font-medium text-right print-money">Total Transaksi</th>
                    <th className="p-3 font-medium text-right print-money">Pembayaran</th>
                    <th className="p-3 font-medium text-right print-money">Sisa Piutang</th>
                    <th className="p-3 font-medium">Jatuh Tempo</th>
                    <th className="p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-outline-variant/30">
                  {filtered.map((c, i) => {
                    const status = getStatus(c);
                    const isOpen = expanded === i;
                    const hasDetail = Array.isArray(c.detail) && c.detail.length > 0;

                    return (
                      <Fragment key={c.id || i}>
                        <tr
                          onClick={() => hasDetail && setExpanded(isOpen ? null : i)}
                          className={`hover:bg-surface-variant/30 transition-colors ${hasDetail ? 'cursor-pointer' : ''}`}
                        >
                          <td className="p-3 text-on-surface-variant">
                            <span className="inline-flex items-center gap-1">
                              {i + 1}
                              {hasDetail && (
                                <span
                                  className={`material-symbols-outlined text-base text-on-surface-variant transition-transform ${isOpen ? 'rotate-180' : ''}`}
                                  aria-hidden="true"
                                >
                                  expand_more
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="p-3 text-on-surface font-medium">{c.nama_toko || c.toko}</td>
                          <td className="p-3 text-right tabular-nums print-money">
                            {formatCurrency(c.total_transaksi)}
                          </td>
                          <td className="p-3 text-right text-success tabular-nums print-money">
                            {formatCurrency(c.pembayaran)}
                          </td>
                          <td className="p-3 text-right font-bold text-danger tabular-nums print-money">
                            {formatCurrency(c.sisa_piutang)}
                          </td>
                          <td className="p-3 text-on-surface">
                            {c.jatuh_tempo ? formatDate(c.jatuh_tempo) : '-'}
                          </td>
                          <td className="p-3">
                            <StatusPill status={status} />
                          </td>
                        </tr>
                        {isOpen && hasDetail && (
                          <tr className="bg-surface-container-low">
                            <td colSpan={7} className="p-3">
                              <h4 className="text-2xs font-medium text-on-surface-variant uppercase tracking-wider mb-2">
                                Detail penjualan belum lunas
                              </h4>
                              <div className="overflow-x-auto">
                                <table className="w-full text-left min-w-[420px]">
                                  <thead>
                                    <tr className="text-2xs font-medium text-on-surface-variant border-b border-outline-variant/30">
                                      <th className="pb-1.5">Tanggal</th>
                                      <th className="pb-1.5 text-right">Total</th>
                                      <th className="pb-1.5 text-right">Bayar</th>
                                      <th className="pb-1.5 text-right">Sisa</th>
                                      <th className="pb-1.5 text-right">Jatuh Tempo</th>
                                    </tr>
                                  </thead>
                                  <tbody className="text-xs text-on-surface">
                                    {c.detail.map((d, j) => (
                                      <Fragment key={d.id || j}>
                                        <tr className="border-b border-outline-variant/20 last:border-0">
                                          <td className="py-1.5">
                                            {formatDate(d.tanggal || d.tanggal_transaksi)}
                                          </td>
                                          <td className="py-1.5 text-right">{formatCurrency(d.total)}</td>
                                          <td className="py-1.5 text-right text-success">
                                            {formatCurrency(d.pembayaran || d.bayar)}
                                          </td>
                                          <td className="py-1.5 text-right font-bold text-danger">
                                            {formatCurrency(d.sisa_piutang || d.sisa)}
                                          </td>
                                          <td className="py-1.5 text-right text-danger">
                                            {d.jatuh_tempo ? formatDate(d.jatuh_tempo) : '-'}
                                          </td>
                                        </tr>
                                        {view === 'detail' && d.items?.length > 0 && (
                                          <tr className="print-detail-row">
                                            <td colSpan={5} className="p-0 align-top">
                                              <ItemDetail items={d.items} transactionTotal={d.total} />
                                            </td>
                                          </tr>
                                        )}
                                      </Fragment>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <ul className="md:hidden print-card-list flex flex-col gap-2.5" aria-label="Daftar piutang pelanggan">
            {filtered.map((c, i) => {
              const status = getStatus(c);
              const isOpen = expanded === i;
              const hasDetail = Array.isArray(c.detail) && c.detail.length > 0;

              return (
                <li
                  key={c.id || i}
                  className="bg-surface-container-lowest rounded-card border border-outline-variant/70 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => hasDetail && setExpanded(isOpen ? null : i)}
                    aria-expanded={hasDetail ? isOpen : undefined}
                    className={`w-full p-3.5 text-left ${hasDetail ? 'active:bg-surface-container-low' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-on-surface text-sm truncate">
                          {c.nama_toko || c.toko}
                        </p>
                        <p className="text-xs text-on-surface-variant mt-0.5">
                          {c.jatuh_tempo
                            ? `Jatuh tempo ${formatDate(c.jatuh_tempo)}`
                            : 'Tanpa jatuh tempo'}
                        </p>
                      </div>
                      <StatusPill status={status} />
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                      <div>
                        <dt className="text-2xs uppercase tracking-wide text-on-surface-variant/80">
                          Sisa Piutang
                        </dt>
                        <dd className="text-sm font-bold text-danger tabular-nums">
                          {formatCurrency(c.sisa_piutang)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-2xs uppercase tracking-wide text-on-surface-variant/80">
                          Sudah Dibayar
                        </dt>
                        <dd className="text-sm font-medium text-success tabular-nums">
                          {formatCurrency(c.pembayaran)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-2xs uppercase tracking-wide text-on-surface-variant/80">
                          Total Transaksi
                        </dt>
                        <dd className="text-sm text-on-surface tabular-nums">
                          {formatCurrency(c.total_transaksi)}
                        </dd>
                      </div>
                      <div className="flex items-end justify-end">
                        {hasDetail && (
                          <span className="text-2xs text-primary font-medium inline-flex items-center gap-0.5">
                            {isOpen ? 'Tutup' : 'Detail'}
                            <span
                              className={`material-symbols-outlined text-sm transition-transform ${isOpen ? 'rotate-180' : ''}`}
                              aria-hidden="true"
                            >
                              expand_more
                            </span>
                          </span>
                        )}
                      </div>
                    </dl>
                  </button>

                  {isOpen && hasDetail && (
                    <div className="px-3.5 pb-3.5 border-t border-outline-variant/30 pt-3">
                      <h4 className="text-2xs font-medium text-on-surface-variant uppercase tracking-wider mb-2">
                        Detail penjualan belum lunas
                      </h4>
                      <ul className="flex flex-col gap-2">
                        {c.detail.map((d, j) => (
                          <Fragment key={d.id || j}>
                            <li className="text-xs flex items-center justify-between gap-2">
                              <span className="text-on-surface-variant">
                                {formatDate(d.tanggal || d.tanggal_transaksi)}
                              </span>
                              <Money
                                value={d.sisa_piutang || d.sisa}
                                variant="danger"
                                className="text-xs"
                              />
                            </li>
                            {view === 'detail' && d.items?.length > 0 && (
                              <li>
                                <ItemDetail
                                  items={d.items}
                                  variant="list"
                                  transactionTotal={d.total}
                                />
                              </li>
                            )}
                          </Fragment>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </ReportShell>
  );
}
