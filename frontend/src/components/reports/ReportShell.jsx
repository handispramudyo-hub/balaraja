import { useState } from 'react';
import { toast } from 'sonner';
import PageHeader from '../ui/PageHeader';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import PrintHeader from '../ui/PrintHeader';
import PrintFooter from '../ui/PrintFooter';
import { ErrorState, EmptyState, LoadingState } from '../ui/States';

/**
 * Kerangka bersama untuk semua halaman laporan.
 *
 * Enam laporan lama (stok, pembelian, penjualan, piutang, pengeluaran, laba
 * rugi) tiap-tiap punya markup sendiri: judul digambar dua kali (sekali di
 * layar, sekali di kop cetak), panel filter punya gaya yang berbeda, dan
 * tombol cetak memakai `h-12` sementara design system memakai `h-8`/`h-10`.
 * Akibatnya laporan terlihat seperti produk yang berbeda dari halaman lain.
 *
 * Komponen ini menyatukan bagian yang selalu sama:
 *  - kepala halaman + kop cetak (isi identik, sumber satu)
 *  - toolbar (cetak / export / toggle tampilan)
 *  - panel filter terlipat
 *  - kondisi memuat / gagal / kosong
 *
 * Yang tetap milik masing-masing laporan: cara fetching, kolom tabel, dan
 * perhitungan total. Itu diteruskan lewat `children`.
 *
 * Catatan print: `print-area` + `PrintHeader`/`PrintFooter` tidak boleh
 * dihapus. Aturan `@media print` di `styles/print.css` bergantung pada
 * struktur itu, dan `print-only` dipakai supaya kop cetak tidak muncul di
 * layar.
 */
export default function ReportShell({
  title,
  subtitle,
  period,
  summary = [],
  breadcrumbLabel = 'Laporan',
  toolbar,
  exportError,
  onClearExportError,
  stats = [],
  filters = null,
  isLoading = false,
  isError = false,
  error = null,
  onRetry,
  loadingMessage = 'Memuat data laporan...',
  errorTitle = 'Gagal memuat laporan',
  empty = null,
  children,
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="space-y-4 print-area">
      <PrintHeader title={title} subtitle={subtitle} period={period} summary={summary} />

      <div className="no-print space-y-4">
        <PageHeader
          title={title}
          subtitle={subtitle}
          breadcrumbs={[{ label: breadcrumbLabel }, { label: title }]}
          actions={toolbar}
        />

        {exportError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-card bg-danger-container text-on-danger-container px-4 py-3 text-sm"
          >
            <span className="material-symbols-outlined text-lg shrink-0" aria-hidden="true">
              error
            </span>
            <p className="flex-1">{exportError}</p>
            {onClearExportError && (
              <button
                type="button"
                onClick={onClearExportError}
                className="shrink-0"
                aria-label="Tutup pesan"
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  close
                </span>
              </button>
            )}
          </div>
        )}

        {stats.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className={`rounded-card px-3.5 py-3 ${stat.className || 'bg-surface-container-lowest border border-outline-variant/70'}`}
              >
                <p className="text-2xs uppercase tracking-wide opacity-80">{stat.label}</p>
                <p className="text-base font-semibold mt-1 tabular-nums">{stat.value}</p>
                {stat.note && <p className="text-2xs opacity-75 mt-0.5">{stat.note}</p>}
              </div>
            ))}
          </div>
        )}

        {filters && (
          <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest">
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-on-surface hover:bg-surface-container rounded-card transition-colors"
            >
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-primary" aria-hidden="true">
                  tune
                </span>
                Filter
                {filters.activeCount > 0 && (
                  <Badge tone="primary" size="sm">
                    {filters.activeCount}
                  </Badge>
                )}
              </span>
              <span
                className="material-symbols-outlined text-on-surface-variant transition-transform"
                style={{ transform: filtersOpen ? 'rotate(180deg)' : 'none' }}
                aria-hidden="true"
              >
                expand_more
              </span>
            </button>

            {filtersOpen && (
              <div className="border-t border-outline-variant/50 px-4 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {filters.children}
                </div>
                {filters.onReset && (
                  <div className="mt-3 flex justify-end">
                    <Button variant="ghost" size="sm" icon="restart_alt" onClick={filters.onReset}>
                      Reset Filter
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <LoadingState message={loadingMessage} rows={4} />
      ) : isError ? (
        <ErrorState error={error} onRetry={onRetry} title={errorTitle} />
      ) : empty ? (
        empty
      ) : (
        children
      )}

      <PrintFooter />
    </div>
  );
}

/**
 * Tombol export untuk laporan yang belum punya backend export.
 *
 * Export spreadsheet/PDF belum tersedia di backend, jadi daripada diam-diam
 * melakukan apa-apa, tombol ini menjelaskan apa yang terjadi dan mengarahkan
 * ke jalur yang bisa dipakai: Cetak lalu simpan sebagai PDF.
 */
export function ExportPlaceholderButton({ label = 'Export Excel', format = 'excel' }) {
  return (
    <Button
      variant="outline"
      size="sm"
      icon={format === 'pdf' ? 'picture_as_pdf' : 'table_view'}
      onClick={() =>
        toast.info(
          `Export ${format === 'pdf' ? 'PDF' : 'Excel'} belum tersedia. Gunakan Cetak lalu simpan sebagai PDF.`
        )
      }
    >
      {label}
    </Button>
  );
}

/**
 * Keadaan kosong standar untuk laporan.
 */
export function ReportEmpty({ icon = 'inbox', title = 'Tidak ada data', description }) {
  return <EmptyState icon={icon} title={title} description={description} />;
}
