import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/format';
import PrintHeader from '../../components/ui/PrintHeader';
import PrintFooter from '../../components/ui/PrintFooter';
import { EmptyState } from '../../components/ui/States';
import ReportToolbar from '../../components/reports/ReportToolbar';
import ItemDetail from '../../components/reports/ItemDetail';
import { useReportExport, compactParams } from '../../hooks/useReportExport';

const statusConfig = {
  belum_bayar: { label: 'Belum Bayar', color: 'bg-error-container text-on-error-container', icon: 'cancel' },
  partial: { label: 'Sebagian', color: 'bg-warning-container text-warning', icon: 'schedule' },
  overdue: { label: 'Jatuh Tempo', color: 'bg-error-container text-on-error-container', icon: 'warning' },
  lunas: { label: 'Lunas', color: 'bg-success-container text-success', icon: 'check_circle' },
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
  const [showFilters, setShowFilters] = useState(false);
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
    queryFn: async () => {
      const res = await api.get('/reports/receivables', { params: filterParams });
      return res.data;
    },
  });

  const items = data?.data || data || [];
  const filtered = items.filter((c) => !filterStatus || getStatus(c) === filterStatus);

  // `filtered` sudah identik dengan isi server (search & status pindah ke
  // server), jadi reduce lokal di sini sah — dan WAJIB tetap dipakai, bukan
  // summary server: kartu "Belum Bayar" dihitung dari subset status, sedangkan
  // summary server hanya mencakup seluruh pelanggan.
  const totalPiutang = filtered.reduce((s, c) => s + (c.sisa_piutang || 0), 0);
  const totalBelumBayar = filtered.filter((c) => getStatus(c) === 'belum_bayar').reduce((s, c) => s + (c.sisa_piutang || 0), 0);
  const jumlahBelumBayar = filtered.filter((c) => getStatus(c) === 'belum_bayar').length;

  return (
    <>
      <main className="flex-grow px-4 py-6 overflow-y-auto print-area">
      <PrintHeader
        title="Piutang Pelanggan"
        subtitle="Rekapitulasi piutang pelanggan"
        summary={[
          { label: 'Total Piutang', value: formatCurrency(totalPiutang) },
          { label: 'Pelanggan', value: `${filtered.length}` },
          { label: 'Belum Bayar', value: formatCurrency(totalBelumBayar) },
        ]}
      />
      <div className="no-print mb-6 flex flex-wrap justify-between items-end gap-3">
        <div>
          <h2 className="text-xl font-semibold text-on-surface mb-1">Piutang Pelanggan</h2>
          <p className="text-sm text-on-surface-variant">Rekapitulasi piutang pelanggan</p>
        </div>
        <ReportToolbar
          view={view}
          onViewChange={setView}
          onPrint={() => window.print()}
          onExport={exportReport}
          exporting={exporting}
          exportNote={view === 'ringkasan' ? 'Export tetap berisi rincian barang (sheet Detail / PDF lengkap)' : null}
        />
      </div>

      {exportError && (
        <div className="no-print mb-4 flex items-start gap-2 rounded-xl bg-error-container text-on-error-container px-4 py-3 text-sm">
          <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
          <div className="flex-1">
            <p>{exportError}</p>
          </div>
          <button type="button" onClick={clearError} className="shrink-0" aria-label="Tutup pesan">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      <section className="no-print grid grid-cols-2 gap-2 mb-6">
        <div className="bg-primary-container text-on-primary-container rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
          <p className="text-xs opacity-80 mb-1">Total Piutang</p>
          <p className="text-lg font-bold truncate">{formatCurrency(totalPiutang)}</p>
          <p className="text-[10px] opacity-70 mt-2">{filtered.length} Pelanggan</p>
        </div>
        <div className="bg-error-container text-on-error-container rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-error/10 rounded-full blur-xl"></div>
          <p className="text-xs opacity-80 mb-1">Belum Bayar</p>
          <p className="text-lg font-bold truncate">{formatCurrency(totalBelumBayar)}</p>
          <p className="text-[10px] opacity-70 mt-2">{jumlahBelumBayar} Tanpa Pembayaran</p>
        </div>
      </section>

      <button
        onClick={() => setShowFilters((v) => !v)}
        className="no-print w-full mb-6 flex items-center justify-between px-4 py-3 rounded-xl bg-surface border border-outline-variant/30 shadow-sm hover:bg-surface-container-high transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-on-surface">
          <span className="material-symbols-outlined text-[20px] text-primary">tune</span>
          Filter
          {activeFilterCount > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full bg-primary text-on-primary text-xs font-semibold">
              {activeFilterCount}
            </span>
          )}
        </span>
        <span className="material-symbols-outlined text-on-surface-variant transition-transform" style={{ transform: showFilters ? 'rotate(180deg)' : 'none' }}>
          expand_more
        </span>
      </button>

      {showFilters && (
        <section className="no-print bg-surface-container-lowest rounded-xl p-4 mb-6 shadow-sm border border-outline-variant/30 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-on-surface-variant" htmlFor="cari-toko-1">Cari Toko</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
              <input
                id="cari-toko-1"
                type="text"
                placeholder="Cari nama toko..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-12 bg-surface rounded-lg border border-outline-variant pl-10 pr-3 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-on-surface-variant" htmlFor="status-2">Status</label>
            <div className="relative">
              <select
                id="status-2"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full h-12 bg-surface rounded-lg border border-outline-variant px-3 appearance-none text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors pr-10"
              >
                <option value="">Semua Status</option>
                <option value="belum_bayar">Belum Bayar</option>
                <option value="partial">Sebagian</option>
                <option value="overdue">Jatuh Tempo</option>
                <option value="lunas">Lunas</option>
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">arrow_drop_down</span>
            </div>
          </div>
        </section>
      )}

      {isError ? (
        <div className="bg-error-container text-on-error-container border border-outline-variant/30 rounded-xl p-8 text-center">
          <span className="material-symbols-outlined text-[40px] block mb-2">cloud_off</span>
          <p className="text-sm font-medium mb-1">Gagal memuat data piutang</p>
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
      ) : isLoading ? (
        <div className="flex items-center justify-center h-40">
          <p className="text-on-surface-variant">Memuat data piutang...</p>
        </div>
      ) : (
        <>
        <div className="hidden md:block print-table-wrap bg-surface rounded-xl shadow-sm border border-outline-variant/30 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[600px]">
              <thead className="bg-surface-container-low border-b border-outline-variant/50 text-xs font-medium text-on-surface-variant">
                <tr>
                  <th className="p-3 font-medium">No</th>
                  <th className="p-3 font-medium">Toko</th>
                  <th className="p-3 font-medium text-right print-money">Total Transaksi</th>
                  <th className="p-3 font-medium text-right print-money">Pembayaran</th>
                  <th className="p-3 font-medium text-right print-money">Sisa Piutang</th>
                  <th className="p-3 font-medium">Jatuh Tempo</th>
                  <th className="p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-outline-variant/30">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-on-surface-variant">
                      <span className="material-symbols-outlined text-[40px] opacity-50 block mb-2">credit_card</span>
                      Tidak ada data piutang
                    </td>
                  </tr>
                ) : (
                  filtered.map((c, i) => {
                    const status = getStatus(c);
                    const cfg = statusConfig[status];
                    const isOpen = expanded === i;
                    const hasDetail = Array.isArray(c.detail) && c.detail.length > 0;

                    return (
                      <React.Fragment key={c.id || i}>
                        <tr
                          onClick={() => hasDetail && setExpanded(isOpen ? null : i)}
                          className={`hover:bg-surface-variant/30 transition-colors ${hasDetail ? 'cursor-pointer' : ''}`}
                        >
                          <td className="p-3 text-on-surface-variant">
                            <span className="inline-flex items-center gap-1">
                              {i + 1}
                              {hasDetail && (
                                <span className={`material-symbols-outlined text-[16px] text-on-surface-variant transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                                  expand_more
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="p-3 text-on-surface font-medium">{c.nama_toko || c.toko}</td>
                                                    <td className="p-3 text-right text-on-surface tabular-nums print-money">{formatCurrency(c.total_transaksi)}</td>
                          <td className="p-3 text-right text
-success tabular-nums print-money">{formatCurrency(c.pembayaran)}</td>
                          <td className="p-3 text-right font-bold text-danger tabular-nums print-money">{formatCurrency(c.sisa_piutang)}</td>
                          <td className="p-3 text-on-surface">{c.jatuh_tempo ? formatDate(c.jatuh_tempo) : '-'}</td>
                          <td className="p-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                              <span className="material-symbols-outlined text-[14px]">{cfg.icon}</span>
                              {cfg.label}
                            </span>
                          </td>
                        </tr>
                        {isOpen && hasDetail && (
                          <tr className="bg-surface-container-low">
                            <td colSpan={7} className="p-3">
                              <h4 className="text-[11px] font-medium text-on-surface-variant uppercase tracking-wider mb-2">
                                Detail Penjualan Belum Lunas
                              </h4>
                              <div className="overflow-x-auto">
                                <table className="w-full text-left min-w-[420px]">
                                  <thead>
                                    <tr className="text-[11px] font-medium text-on-surface-variant border-b border-outline-variant/30">
                                      <th className="pb-1.5">Tanggal</th>
                                      <th className="pb-1.5 text-right">Total</th>
                                      <th className="pb-1.5 text-right">Bayar</th>
                                      <th className="pb-1.5 text-right">Sisa</th>
                                      <th className="pb-1.5 text-right">Jatuh Tempo</th>
                                    </tr>
                                  </thead>
                                  <tbody className="text-xs text-on-surface">
                                    {c.detail.map((d, j) => (
                                      <React.Fragment key={d.id || j}>
                                        <tr className="border-b border-outline-variant/20 last:border-0">
                                          <td className="py-1.5">{formatDate(d.tanggal || d.tanggal_transaksi)}</td>
                                          <td className="py-1.5 text-right">{formatCurrency(d.total)}</td>
                                          <td className="py-1.5 text-right text-success">{formatCurrency(d.pembayaran || d.bayar)}</td>
                                          <td className="py-1.5 text-right font-bold text-danger">{formatCurrency(d.sisa_piutang || d.sisa)}</td>
                                          <td className="py-1.5 text-right text-danger">{d.jatuh_tempo ? formatDate(d.jatuh_tempo) : '-'}</td>
                                        </tr>
                                        {view === 'detail' && d.items?.length > 0 && (
                                          <tr className="print-detail-row">
                                            <td colSpan={5} className="p-0 align-top">
                                              <ItemDetail items={d.items} transactionTotal={d.total} />
                                            </td>
                                          </tr>
                                        )}
                                      </React.Fragment>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        <ul className="md:hidden print-card-list flex flex-col gap-2.5" aria-label="Daftar piutang pelanggan">
          {filtered.length === 0 ? (
            <li>
              <EmptyState icon="credit_card" title="Tidak ada piutang" description="Seluruh piutang pelanggan sudah lunas." />
            </li>
          ) : (
            filtered.map((c, i) => {
              const status = getStatus(c);
              const cfg = statusConfig[status];
              const isOpen = expanded === i;
              const hasDetail = Array.isArray(c.detail) && c.detail.length > 0;

              return (
                <li key={c.id || i} className="bg-surface rounded-xl border border-outline-variant/30 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => hasDetail && setExpanded(isOpen ? null : i)}
                    aria-expanded={hasDetail ? isOpen : undefined}
                    className={`w-full p-3.5 text-left ${hasDetail ? 'active:bg-surface-container-low' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-on-surface text-sm truncate">{c.nama_toko || c.toko}</p>
                        <p className="text-xs text-on-surface-variant mt-0.5">
                          {c.jatuh_tempo ? `Jatuh tempo ${formatDate(c.jatuh_tempo)}` : 'Tanpa jatuh tempo'}
                        </p>
                      </div>
                      <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium ${cfg.color}`}>
                        <span className="material-symbols-outlined text-[13px]">{cfg.icon}</span>
                        {cfg.label}
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-on-surface-variant/80">Sisa Piutang</dt>
                        <dd className="text-sm font-bold text-danger tabular-nums">{formatCurrency(c.sisa_piutang)}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-on-surface-variant/80">Sudah Dibayar</dt>
                        <dd className="text-sm font-medium text-success tabular-nums">{formatCurrency(c.pembayaran)}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-on-surface-variant/80">Total Transaksi</dt>
                        <dd className="text-sm text-on-surface tabular-nums">{formatCurrency(c.total_transaksi)}</dd>
                      </div>
                      <div className="flex items-end justify-end">
                        {hasDetail && (
                          <span className="text-[11px] text-primary font-medium inline-flex items-center gap-0.5">
                            {isOpen ? 'Tutup' : 'Detail'}
                            <span className={`material-symbols-outlined text-[14px] transition-transform ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
                          </span>
                        )}
                      </div>
                    </dl>
                  </button>

                  {isOpen && hasDetail && (
                    <div className="px-3.5 pb-3.5 border-t border-outline-variant/30 pt-3">
                      <h4 className="text-[10px] font-medium text-on-surface-variant uppercase tracking-wider mb-2">
                        Detail penjualan belum lunas
                      </h4>
                      <ul className="flex flex-col gap-2">
                        {c.detail.map((d, j) => (
                          <React.Fragment key={d.id || j}>
                            <li className="text-xs flex items-center justify-between gap-2">
                              <span className="text-on-surface-variant">{formatDate(d.tanggal || d.tanggal_transaksi)}</span>
                              <span className="font-semibold text-danger tabular-nums">{formatCurrency(d.sisa_piutang || d.sisa)}</span>
                            </li>
                            {view === 'detail' && d.items?.length > 0 && (
                              <li>
                                <ItemDetail items={d.items} variant="list" transactionTotal={d.total} />
                              </li>
                            )}
                          </React.Fragment>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })
          )}
        </ul>
        </>
      )}
      <PrintFooter />
    </main>
    </>
  );
}
