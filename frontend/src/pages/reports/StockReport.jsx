import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatNumber, formatDate, todayInput } from '../../lib/format';
import DateInput from '../../components/ui/DateInput';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import ReportShell from '../../components/reports/ReportShell';
import ReportToolbar from '../../components/reports/ReportToolbar';
import ResponsiveTable from '../../components/ui/ResponsiveTable';
import { EmptyState } from '../../components/ui/States';

export default function StockReport() {
  const [date, setDate] = useState(todayInput());
  const [category, setCategory] = useState('');
  const [product, setProduct] = useState('');

  const activeFilterCount = [category, product].filter(Boolean).length;

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/categories')).data,
  });

  const { data: productsData } = useQuery({
    queryKey: ['products-list'],
    queryFn: async () => (await api.get('/products', { params: { per_page: 1000 } })).data,
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['stock-report', date, category, product],
    queryFn: async () => {
      const params = {};
      if (date) params.date = date;
      if (category) params.category_id = category;
      if (product) params.product_id = product;
      return (await api.get('/reports/stock', { params })).data;
    },
  });

  const items = data?.data || data || [];
  const categories = categoriesData?.data || categoriesData || [];
  const products = productsData?.data || productsData || [];

  const totalStokSebelum = items.reduce((s, r) => s + (Number(r.stok_sebelum) || 0), 0);
  const totalStokMasuk = items.reduce((s, r) => s + (Number(r.stok_masuk) || 0), 0);
  const totalStokKeluar = items.reduce((s, r) => s + (Number(r.stok_keluar) || 0), 0);
  const totalStokSesudah = items.reduce((s, r) => s + (Number(r.stok_sesudah) || 0), 0);

  // Angka di bawah dijumlahkan lintas produk, jadi satuan hanya bermakna kalau
  // semua produk memang memakai satuan dasar yang sama. Menjumlahkan 792 btl
  // dengan 49 dus menghasilkan angka yang tidak menyatakan apa pun - lebih
  // jujur ditulis "campuran" daripada "841 dus".
  const baseUnits = [...new Set(items.map((r) => (r.base_unit || r.unit || '').trim()))];
  const sharedUnit = baseUnits.length === 1 ? baseUnits[0] : null;
  const sumLabel = (value) =>
    sharedUnit ? `${formatNumber(value)} ${sharedUnit}` : `${formatNumber(value)}`;

  return (
    <ReportShell
      title="Laporan Stok"
      subtitle="Rekapitulasi pergerakan stok barang"
      breadcrumbLabel="Laporan"
      period={formatDate(date)}
      summary={[
        { label: 'Stok Masuk', value: sumLabel(totalStokMasuk) },
        { label: 'Stok Keluar', value: sumLabel(totalStokKeluar) },
        { label: 'Stok Akhir', value: sumLabel(totalStokSesudah) },
      ]}
      toolbar={
        <ReportToolbar
          showViewToggle={false}
          onPrint={() => window.print()}
        />
      }
      filters={{
        activeCount: activeFilterCount,
        onReset: () => {
          setCategory('');
          setProduct('');
        },
        children: (
          <>
            <DateInput
              value={date}
              onChange={setDate}
              aria-label="Tanggal laporan stok"
            />
            <Select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              aria-label="Filter kategori"
            >
              <option value="">Semua kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nama || c.name}
                </option>
              ))}
            </Select>
            <Select
              value={product}
              onChange={(event) => setProduct(event.target.value)}
              aria-label="Filter produk"
            >
              <option value="">Semua produk</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama || p.name}
                </option>
              ))}
            </Select>
          </>
        ),
      }}
      isLoading={isLoading}
      isError={isError}
      error={error}
      onRetry={() => refetch()}
      loadingMessage="Memuat data stok..."
      errorTitle="Gagal memuat laporan stok"
      empty={
        items.length === 0 ? (
          <EmptyState
            icon="inventory_2"
            title="Tidak ada pergerakan stok"
            description="Belum ada transaksi masuk atau keluar pada tanggal ini."
          />
        ) : null
      }
    >
      <ResponsiveTable
        label="Laporan pergerakan stok"
        rows={items}
        minWidth="720px"
        columns={[
          { key: 'no', header: 'No', render: (r, i) => i + 1, cellClass: 'text-on-surface-variant' },
          {
            key: 'kode',
            header: 'Kode Produk',
            render: (r) => r.kode || r.kode_produk || '—',
            cellClass: 'text-secondary font-medium',
          },
          { key: 'nama', header: 'Nama Produk', render: (r) => r.nama || r.nama_produk || r.name || '—' },
          {
            key: 'sebelum',
            header: 'Stok Sebelum',
            align: 'right',
            headClass: 'print-num',
            render: (r) => formatNumber(r.stok_sebelum),
            cellClass: 'text-on-surface-variant tabular-nums print-num',
          },
          {
            key: 'masuk',
            header: 'Masuk',
            align: 'right',
            headClass: 'print-num',
            render: (r) => formatNumber(r.stok_masuk),
            cellClass: 'text-success bg-success-container/30 tabular-nums print-num',
          },
          {
            key: 'keluar',
            header: 'Keluar',
            align: 'right',
            headClass: 'print-num',
            render: (r) => formatNumber(r.stok_keluar),
            cellClass: 'text-danger bg-danger-container/30 tabular-nums print-num',
          },
          {
            key: 'sesudah',
            header: 'Stok Sesudah',
            align: 'right',
            render: (r) => formatNumber(r.stok_sesudah),
            headClass: 'font-bold text-on-surface print-num',
            cellClass: 'font-bold text-on-surface tabular-nums print-num',
          },
          {
            key: 'satuan',
            header: 'Satuan',
            render: (r) => r.base_unit || r.unit || '—',
            cellClass: 'text-on-surface-variant',
          },
          {
            key: 'tanggal',
            header: 'Tanggal',
            render: (r) => formatDate(r.tanggal),
            cellClass: 'text-on-surface-variant',
          },
        ]}
        footer={
          <tr>
            <td className="p-3" colSpan="2"></td>
            <td className="p-3 uppercase">Total</td>
            <td className="p-3 text-right tabular-nums">{formatNumber(totalStokSebelum)}</td>
            <td className="p-3 text-right tabular-nums">{formatNumber(totalStokMasuk)}</td>
            <td className="p-3 text-right tabular-nums">{formatNumber(totalStokKeluar)}</td>
            <td className="p-3 text-right tabular-nums">{formatNumber(totalStokSesudah)}</td>
            <td className="p-3 text-xs uppercase text-on-surface-variant">
              {sharedUnit || 'campuran'}
            </td>
            <td className="p-3"></td>
          </tr>
        }
        cardTitle={(r) => r.nama || r.nama_produk || r.name || '—'}
        cardMeta={(r) => `${r.kode || r.kode_produk || 'Tanpa kode'} · ${formatDate(r.tanggal)}`}
        cardBadge={(r) => (
          <Badge tone={r.stok_sesudah <= 0 ? 'danger' : 'neutral'} size="sm">
            {formatNumber(r.stok_sesudah)} {r.base_unit || r.unit || ''}
          </Badge>
        )}
        cardFields={[
          { label: 'Satuan', render: (r) => r.base_unit || r.unit || '—' },
          { label: 'Stok sebelum', render: (r) => formatNumber(r.stok_sebelum) },
          { label: 'Masuk', render: (r) => <span className="text-success">+{formatNumber(r.stok_masuk)}</span> },
          { label: 'Keluar', render: (r) => <span className="text-danger">−{formatNumber(r.stok_keluar)}</span> },
        ]}
      />
    </ReportShell>
  );
}
