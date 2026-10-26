import { Fragment, useMemo, useState } from 'react';
import cn from '../../lib/cn';

const alignClass = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

/**
 * Tabel data desktop yang berubah menjadi daftar kartu di layar sempit.
 *
 * Kolom ditulis sekali sebagai `columns`, lalu dipakai ulang untuk header
 * tabel, sel tabel, dan baris kartu, supaya tampilan mobile tidak memakai
 * daftar kolom terpisah yang bisa berbeda dari desktop.
 *
 * Properti `cardTitle`, `cardMeta`, `cardFields`, `cardBadge`, `cardActions`,
 * `cardFooter`, `cardDetail`, dan `expandedRow` dipakai untuk mode kartu.
 */
export default function DataTable({
  columns,
  rows,
  rowKey = (r, i) => r.id ?? i,
  footer,
  minWidth = '640px',
  emptyState,
  loading = false,
  skeletonRows = 6,
  cardTitle,
  cardMeta,
  cardFields = [],
  cardBadge,
  cardActions,
  cardFooter,
  expandedRow,
  cardDetail,
  selectable = false,
  selectedIds,
  onSelectionChange,
  onRowClick,
  density = 'default',
  zebra = false,
  label = 'Tabel data',
  className = '',
}) {
  const [sort, setSort] = useState(null);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column) return rows;
    const value = column.sortValue || ((row) => row[column.key]);
    const direction = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction;
      return String(av).localeCompare(String(bv), 'id-ID', { numeric: true }) * direction;
    });
  }, [rows, sort, columns]);

  const ids = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);
  const allSelected = sortedRows.length > 0 && sortedRows.every((row) => ids.has(rowKey(row)));

  const toggleAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange([]);
      return;
    }
    onSelectionChange(sortedRows.map((row, index) => rowKey(row, index)));
  };

  const toggleOne = (id) => {
    if (!onSelectionChange) return;
    const next = new Set(ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange([...next]);
  };

  const toggleSort = (column) => {
    if (!column.sortable) return;
    setSort((current) => {
      if (!current || current.key !== column.key) return { key: column.key, dir: 'asc' };
      if (current.dir === 'asc') return { key: column.key, dir: 'desc' };
      return null;
    });
  };

  const cellPadding = density === 'compact' ? 'px-3 py-2' : 'px-3.5 py-2.5';

  if (loading) {
    return (
      <div className={cn('rounded-card border border-outline-variant/70 bg-surface-container-lowest', className)}>
        <div className="p-4 space-y-3" aria-busy="true" aria-live="polite">
          <span className="sr-only">Memuat data</span>
          {Array.from({ length: skeletonRows }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="h-3 w-3/5 rounded bg-surface-container-high animate-pulse" />
              <div className="h-3 w-1/5 rounded bg-surface-container-high animate-pulse ml-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div
        className={cn(
          'rounded-card border border-outline-variant/70 bg-surface-container-lowest',
          className
        )}
      >
        <div className="p-4">{emptyState}</div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Desktop: tabel penuh */}
      <div className="hidden md:block print-table-wrap rounded-card border border-outline-variant/70 bg-surface-container-lowest overflow-hidden">
        <div className="overflow-x-auto">
          <table className={cn('w-full border-collapse', zebra && 'zebra')} style={{ minWidth }}>
            <thead className="sticky-head bg-surface-container border-b border-outline-variant text-xs font-medium text-on-surface-variant">
              <tr>
                {selectable && (
                  <th scope="col" className={cn(cellPadding, 'w-10')}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Pilih semua baris"
                      className="h-4 w-4 rounded border-outline-variant accent-primary cursor-pointer"
                    />
                  </th>
                )}
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    style={column.width ? { width: column.width } : undefined}
                    aria-sort={
                      sort?.key === column.key
                        ? sort.dir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : undefined
                    }
                    className={cn(
                      cellPadding,
                      'font-medium whitespace-nowrap',
                      alignClass[column.align || 'left'],
                      column.sortable && 'cursor-pointer select-none hover:text-on-surface',
                      column.headClass
                    )}
                    onClick={() => toggleSort(column)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {column.header}
                      {column.sortable && (
                        <span
                          className={cn(
                            'material-symbols-outlined text-sm',
                            sort?.key === column.key ? 'opacity-100' : 'opacity-25'
                          )}
                          aria-hidden="true"
                        >
                          {sort?.key === column.key && sort.dir === 'desc'
                            ? 'arrow_downward'
                            : 'arrow_upward'}
                        </span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={cn('text-sm divide-y divide-outline-variant/40', zebra && '')}>
              {sortedRows.map((row, index) => {
                const id = rowKey(row, index);
                return (
                  <Fragment key={id}>
                    <tr
                      className={cn(
                        'transition-colors',
                        onRowClick && 'row-clickable',
                        ids.has(id) && 'bg-primary-fixed/30'
                      )}
                      onClick={onRowClick ? (event) => {
                        if (event.target.closest('button, a, input, select, textarea')) return;
                        onRowClick(row);
                      } : undefined}
                    >
                      {selectable && (
                        <td className={cellPadding}>
                          <input
                            type="checkbox"
                            checked={ids.has(id)}
                            onChange={() => toggleOne(id)}
                            aria-label="Pilih baris"
                            className="h-4 w-4 rounded border-outline-variant accent-primary cursor-pointer"
                          />
                        </td>
                      )}
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={cn(
                            cellPadding,
                            alignClass[column.align || 'left'],
                            column.cellClass
                          )}
                        >
                          {column.render(row, index)}
                        </td>
                      ))}
                    </tr>
                    {expandedRow && (
                      <tr className="print-detail-row">
                        <td colSpan={columns.length + (selectable ? 1 : 0)} className="p-0 align-top">
                          {expandedRow(row, index)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            {footer && (
              <tfoot className="bg-surface-container border-t-2 border-outline-variant text-sm font-semibold text-on-surface">
                {footer}
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Mobile: kartu */}
      <ul className="md:hidden print-card-list flex flex-col gap-2.5" aria-label={label}>
        {sortedRows.map((row, index) => {
          const id = rowKey(row, index);
          return (
            <li
              key={id}
              className={cn(
                'rounded-card border border-outline-variant/70 bg-surface-container-lowest overflow-hidden',
                ids.has(id) && 'ring-2 ring-primary/40'
              )}
            >
              <div className="p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {cardTitle && (
                      <p className="font-semibold text-on-surface text-sm truncate">{cardTitle(row, index)}</p>
                    )}
                    {cardMeta && <p className="text-xs text-on-surface-variant mt-0.5">{cardMeta(row, index)}</p>}
                  </div>
                  {cardBadge && <div className="shrink-0">{cardBadge(row, index)}</div>}
                </div>

                {cardFields.length > 0 && (
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                    {cardFields.map((field) => (
                      <div key={field.label} className={field.full ? 'col-span-2' : 'min-w-0'}>
                        <dt className="text-[10px] uppercase tracking-wide text-on-surface-variant/80">
                          {field.label}
                        </dt>
                        <dd className="text-sm text-on-surface font-medium truncate">{field.render(row, index)}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {cardFooter && (
                  <div className="mt-3 pt-3 border-t border-outline-variant/50">{cardFooter(row, index)}</div>
                )}
              </div>
              {cardDetail && cardDetail(row, index)}
              {cardActions && (
                <div className="flex items-stretch border-t border-outline-variant/50 [&>*:not(:last-child)]:border-r [&>*:not(:last-child)]:border-outline-variant/50">
                  {cardActions(row, index)}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
