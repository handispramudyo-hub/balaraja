import { Fragment } from 'react';

const alignClass = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

/**
 * Tabel yang berubah menjadi daftar kartu di layar sempit.
 * Kolom ditulis sekali sebagai `columns`, lalu dipakai ulang untuk
 * header tabel, sel tabel, dan baris kartu.
 *
 * `expandedRow` dan `cardDetail` opsional — dipakai laporan transaksi untuk
 * menampilkan baris barang di bawah tiap transaksi. Kalau tidak diberikan,
 * perilakunya persis seperti sebelumnya.
 */
export default function ResponsiveTable({
  columns,
  rows,
  rowKey = (r, i) => r.id ?? i,
  footer,
  minWidth = '640px',
  emptyState,
  cardTitle,
  cardMeta,
  cardFields = [],
  cardBadge,
  cardActions,
  cardFooter,
  expandedRow,
  cardDetail,
  theadClass = 'bg-surface-container-low border-b border-outline-variant/50 text-xs font-medium text-on-surface-variant',
  tbodyClass = 'text-sm divide-y divide-outline-variant/30',
  rowClass = 'hover:bg-surface-variant/30 transition-colors',
  cellClass = 'p-3',
  label = 'Tabel data',
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-surface rounded-xl shadow-sm border border-outline-variant/30 overflow-hidden">
        <div className="p-4">{emptyState}</div>
      </div>
    );
  }

  return (
    <>
      {/* Desktop: tabel penuh */}
      <div className="hidden md:block print-table-wrap bg-surface rounded-xl shadow-sm border border-outline-variant/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className={`w-full border-collapse ${minWidth ? `min-w-[${minWidth}]` : ''}`} style={{ minWidth }}>
            <thead className={theadClass}>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={`${cellClass} font-medium ${alignClass[c.align || 'left']} ${c.headClass || ''}`}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {rows.map((r, i) => (
                <Fragment key={rowKey(r, i)}>
                  <tr className={rowClass}>
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`${cellClass} ${alignClass[c.align || 'left']} ${c.cellClass || ''}`}
                      >
                        {c.render(r, i)}
                      </td>
                    ))}
                  </tr>
                  {expandedRow && (
                    <tr className="print-detail-row">
                      <td colSpan={columns.length} className="p-0 align-top">
                        {expandedRow(r, i)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            {footer && (
              <tfoot className="bg-surface-container border-t-2 border-outline-variant/50 text-sm font-semibold text-on-surface">
                {footer}
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Mobile: kartu */}
      <ul className="md:hidden print-card-list flex flex-col gap-2.5" aria-label={label}>
        {rows.map((r, i) => (
          <li
            key={rowKey(r, i)}
            className="bg-surface rounded-xl border border-surface-container-high shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] overflow-hidden"
          >
            <div className="p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {cardTitle && (
                    <p className="font-semibold text-on-surface text-sm truncate">{cardTitle(r, i)}</p>
                  )}
                  {cardMeta && <p className="text-xs text-on-surface-variant mt-0.5">{cardMeta(r, i)}</p>}
                </div>
                {cardBadge && <div className="shrink-0">{cardBadge(r, i)}</div>}
              </div>

              {cardFields.length > 0 && (
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                  {cardFields.map((f) => (
                    <div key={f.label} className={f.full ? 'col-span-2' : 'min-w-0'}>
                      <dt className="text-[10px] uppercase tracking-wide text-on-surface-variant/80">{f.label}</dt>
                      <dd className="text-sm text-on-surface font-medium truncate">{f.render(r, i)}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {cardFooter && <div className="mt-3 pt-3 border-t border-outline-variant/30">{cardFooter(r, i)}</div>}
            </div>
            {cardDetail && cardDetail(r, i)}
            {cardActions && (
              <div className="flex items-stretch border-t border-outline-variant/30 [&>*:not(:last-child)]:border-r [&>*:not(:last-child)]:border-outline-variant/30">
                {cardActions(r, i)}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
