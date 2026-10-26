import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Badge, { StatusBadge } from '../../components/ui/Badge';
import Money from '../../components/ui/Money';
import DateInput from '../../components/ui/DateInput';
import { EmptyState } from '../../components/ui/States';
import { formatDateShort, formatNumber, todayInput } from '../../lib/format';

function stockStatus(stock, minStock) {
  const value = Number(stock) || 0;
  const min = Number(minStock) || 0;
  if (value <= 0) return 'habis';
  if (value <= min) return 'menipis';
  return 'aman';
}

/**
 * Detail satu produk.
 *
 * Data diambil dari `/api/products/{id}`. Riwayat pergerakan stok diambil dari
 * `/api/reports/stock?product_id=...`, karena `stock_movements` tidak punya
 * endpoint per produk - jadi kartu stok di sini benar-benarmovemen, bukan
 *tebakan.
 */
export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [date, setDate] = useState(todayInput());

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => (await api.get(`/products/${id}`)).data,
    enabled: Boolean(id),
  });

  const { data: stockReport, isLoading: stockLoading } = useQuery({
    queryKey: ['product-stock', id, date],
    queryFn: async () =>
      (await api.get('/reports/stock', { params: { product_id: id, date } })).data,
    enabled: Boolean(id),
  });

  const movement = useMemo(() => {
    const rows = stockReport?.data || [];
    return rows.find((row) => String(row.id) === String(id)) || null;
  }, [stockReport, id]);

  const units = useMemo(() => data?.units || [], [data]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-16 rounded-card bg-surface-container animate-pulse" />
        <div className="h-40 rounded-card bg-surface-container animate-pulse" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Detail Produk"
          breadcrumbs={[{ label: 'Master Data', to: '/produk' }, { label: 'Produk' }]}
        />
        <div role="alert" className="rounded-card border border-danger/30 bg-danger-container px-4 py-6 text-center">
          <p className="text-sm font-medium text-on-danger-container">Produk tidak ditemukan</p>
          <p className="text-xs text-on-danger-container/80 mt-1">
            {error?.response?.status
              ? `Server merespons dengan kesalahan (${error.response.status}).`
              : 'Produk mungkin sudah dihapus.'}
          </p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <Button size="sm" variant="outline" icon="refresh" onClick={() => refetch()}>
              Coba Lagi
            </Button>
            <Button size="sm" onClick={() => navigate('/produk')}>
              Kembali ke Produk
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const status = data?.stock_status || stockStatus(data?.stock, data?.min_stock);
  const baseUnit = data?.base_unit || data?.unit || '';

  return (
    <div className="space-y-4">
      <PageHeader
        title={data?.name || 'Detail Produk'}
        subtitle={data?.code ? `Kode ${data.code}` : 'Ringkasan produk dan pergerakan stok'}
        breadcrumbs={[{ label: 'Master Data', to: '/produk' }, { label: 'Produk' }]}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              icon="arrow_back"
              onClick={() => navigate('/produk')}
            >
              Kembali
            </Button>
            <Button
              size="sm"
              icon="edit"
              onClick={() => navigate('/produk')}
            >
              Edit di Daftar
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest px-3.5 py-3">
          <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Stok</p>
          <p className="text-base font-semibold text-on-surface mt-1 tabular-nums">
            {formatNumber(data?.stock ?? 0)}{' '}
            <span className="text-xs font-normal text-on-surface-variant">{baseUnit}</span>
          </p>
        </div>
        <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest px-3.5 py-3">
          <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Harga Jual</p>
          <Money value={data?.sell_price ?? 0} variant="strong" className="text-base mt-1 block" />
        </div>
        <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest px-3.5 py-3">
          <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Harga Beli</p>
          <Money value={data?.buy_price ?? 0} variant="muted" className="text-base mt-1 block" />
        </div>
        <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest px-3.5 py-3">
          <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Status Stok</p>
          <div className="mt-1">
            <StatusBadge kind="stock" value={status} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest p-4">
          <h2 className="text-sm font-semibold text-on-surface">Informasi Produk</h2>
          <dl className="mt-3 divide-y divide-outline-variant/40 text-sm">
            {[
              { label: 'Kode', value: data?.code || '-' },
              { label: 'Kategori', value: data?.category?.name || 'Tanpa kategori' },
              { label: 'Supplier', value: data?.supplier?.name || 'Tanpa supplier' },
              { label: 'Stok Minimum', value: `${formatNumber(data?.min_stock ?? 0)} ${baseUnit}` },
              { label: 'Status', value: data?.status || 'active' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 py-2">
                <dt className="text-on-surface-variant">{row.label}</dt>
                <dd className="text-on-surface text-right truncate">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest p-4">
          <h2 className="text-sm font-semibold text-on-surface">Satuan</h2>
          {units.length === 0 ? (
            <p className="mt-3 text-sm text-on-surface-variant">
              Produk ini belum punya daftar satuan.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-outline-variant/40 text-sm">
              {units.map((unit) => (
                <li key={unit.id ?? unit.name} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-on-surface flex items-center gap-2">
                    {unit.name}
                    {unit.is_base && (
                      <Badge tone="primary" size="sm">
                        Dasar
                      </Badge>
                    )}
                  </span>
                  <span className="text-on-surface-variant tabular-nums">
                    {unit.is_base
                      ? 'Satuan acuan stok & harga'
                      : `1 ${unit.name} = ${formatNumber(unit.factor)} ${baseUnit}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-on-surface">Pergerakan Stok</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Rekapitulasi pada tanggal yang dipilih.
            </p>
          </div>
          <div className="w-full sm:w-48">
            <DateInput value={date} onChange={setDate} aria-label="Tanggal laporan stok" />
          </div>
        </div>

        {stockLoading ? (
          <div className="mt-4 h-24 rounded-field bg-surface-container animate-pulse" />
        ) : !movement ? (
          <div className="mt-4">
            <EmptyState
              icon="inventory"
              title="Tidak ada pergerakan stok"
              description={`Belum ada transaksi masuk atau keluar untuk produk ini per ${formatDateShort(date)}.`}
            />
          </div>
        ) : (
          <dl className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Stok Sebelum', value: formatNumber(movement.stok_sebelum), tone: 'muted' },
              { label: 'Stok Masuk', value: formatNumber(movement.stok_masuk), tone: 'success' },
              { label: 'Stok Keluar', value: formatNumber(movement.stok_keluar), tone: 'danger' },
              { label: 'Stok Sesudah', value: formatNumber(movement.stok_sesudah), tone: 'strong' },
            ].map((row) => (
              <div key={row.label} className="rounded-field bg-surface-container px-3 py-2.5">
                <dt className="text-2xs uppercase tracking-wide text-on-surface-variant">{row.label}</dt>
                <dd className="text-sm font-semibold text-on-surface mt-0.5 tabular-nums">
                  {row.value}{' '}
                  <span className="text-2xs font-normal text-on-surface-variant">
                    {movement.base_unit || baseUnit}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
