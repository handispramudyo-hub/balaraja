/**
 * Toolbar laporan: toggle Ringkasan/Detail + Cetak/Excel/PDF.
 *
 * Aturan yang sengaja dibuat eksplisit supaya tidak ada salah paham:
 *  - Toggle mengatur apa yang TAMPIL dan apa yang DICETAK. Kalau user di mode
 *    Ringkasan lalu klik Cetak, yang keluar memang ringkasan saja.
 *  - Export TIDAK mengikuti toggle — Excel selalu berisi sheet Ringkasan +
 *    sheet Detail, PDF selalu grouped lengkap. Jadi meng-export tidak pernah
 *    menghasilkan file yang lebih sedikit dari yang di layar.
 *
 * كلها `no-print` supaya tidak ikut tercetak.
 */
export default function ReportToolbar({
  view = 'ringkasan',
  onViewChange,
  onPrint,
  onExport,
  exporting = null,
  showViewToggle = true,
  exportDisabled = false,
  exportNote = null,
}) {
  const modes = [
    { key: 'ringkasan', label: 'Ringkasan', icon: 'view_agenda' },
    { key: 'detail', label: 'Detail', icon: 'receipt_long' },
  ];

  const btn =
    'h-10 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-50 disabled:pointer-events-none';

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      {showViewToggle && onViewChange && (
        <div
          role="group"
          aria-label="Tampilan laporan"
          className="flex items-center gap-1 h-10 px-1 rounded-lg bg-surface-container-high border border-outline-variant/40"
        >
          {modes.map((m) => {
            const active = view === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => onViewChange(m.key)}
                aria-pressed={active}
                className={`h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  active
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-on-surface-variant hover:bg-surface-variant'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{m.icon}</span>
                {m.label}
              </button>
            );
          })}
        </div>
      )}

      {onPrint && (
        <button type="button" onClick={onPrint} className={`${btn} bg-primary text-on-primary shadow-sm`}>
          <span className="material-symbols-outlined text-[18px]">print</span> Cetak
        </button>
      )}

      {onExport && (
        <>
          <button
            type="button"
            onClick={() => onExport('excel')}
            disabled={exportDisabled || exporting !== null}
            className={`${btn} bg-surface text-on-surface border border-outline-variant/60 hover:bg-surface-container-high`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {exporting === 'excel' ? 'progress_activity' : 'table_view'}
            </span>
            {exporting === 'excel' ? 'Menyiapkan...' : 'Excel'}
          </button>
          <button
            type="button"
            onClick={() => onExport('pdf')}
            disabled={exportDisabled || exporting !== null}
            className={`${btn} bg-surface text-on-surface border border-outline-variant/60 hover:bg-surface-container-high`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {exporting === 'pdf' ? 'progress_activity' : 'picture_as_pdf'}
            </span>
            {exporting === 'pdf' ? 'Menyiapkan...' : 'PDF'}
          </button>
        </>
      )}

      {exportNote && <span className="text-[11px] text-on-surface-variant w-full sm:w-auto">{exportNote}</span>}
    </div>
  );
}
