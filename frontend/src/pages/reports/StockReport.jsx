import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatNumber, formatDate } from '../../utils/format';
import { toast } from 'sonner';
import PrintHeader from '../../components/ui/PrintHeader';
import PrintFooter from '../../components/ui/PrintFooter';
import { ErrorState, EmptyState } from '../../components/ui/States';
import ResponsiveTable from '../../components/ui/ResponsiveTable';

export default function StockReport() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('');
  const [product, setProduct] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const activeFilterCount = [date, category, product].filter(Boolean).length;

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get('/categories');
      return res.data;
    },
  });

  const { data: productsData } = useQuery({
    queryKey: ['products-list'],
    queryFn: async () => {
      const res = await api.get('/products', { params: { per_page: 1000 } });
      return res.data;
    },
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['stock-report', date, category, product],
    queryFn: async () => {
      const params = {};
      if (date) params.date = date;
      if (category) params.category_id = category;
      if (product) params.product_id = product;
      const res = await api.get('/reports/stock', { params });
      return res.data;
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
  // jujur ditulis "2 produk" daripada "841 dus".
  const baseUnits = [...new Set(items.map((r) => (r.base_unit || r.unit || '').trim()))];
  const sharedUnit = baseUnits.length === 1 ? baseUnits[0] : null;
  const sumLabel = (value) => (sharedUnit ? `${formatNumber(value)} ${sharedUnit}` : `${formatNumber(value)}`);

  return (
    <main className="flex-grow px-4 py-6 overflow-y-auto print-area">
      <PrintHeader
        title="Laporan Stok"
        subtitle="Rekapitulasi pergerakan stok barang"
        period={formatDate(date)}
        summary={[
          { label: 'Stok Masuk', value: sumLabel(totalStokMasuk) },
          { label: 'Stok Keluar', value: sumLabel(totalStokKeluar) },
          { label: 'Stok Akhir', value: sumLabel(totalStokSesudah) },
        ]}
      />
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h2 className="text-xl font-semibold text-on-surface mb-1">Laporan Stok</h2>
          <p className="text-sm text-on-surface-variant">Rekapitulasi pergerakan stok barang</p>
        </div>
      </div>

      <div className="no-print flex gap-2 mb-6">
        <button
          onClick={() => window.print()}
          className="flex-1 bg-surface-container text-on-surface text-xs font-medium h-12 rounded-lg flex items-center justify-center gap-2 shadow-sm border border-outline-variant hover:bg-surface-variant active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">print</span> Cetak
        </button>
        <button
          onClick={() => toast.info('Export Excel belum tersedia')}
          className="flex-1 bg-primary text-on-primary text-xs font-medium h-12 rounded-lg flex items-center justify-center gap-2 shadow-sm hover:bg-primary-fixed-dim active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">download</span> Export Excel
        </button>
      </div>

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
        <div className="no-print grid grid-cols-2 gap-3 mb-6 bg-surface-container-low p-4 rounded-xl border border-outline-variant/30">
          <div className="col-span-2">
            <label className="text-xs font-medium text-on-surface-variant mb-1 block" htmlFor="tanggal-1">Tanggal</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">calendar_today</span>
              <input
                id="tanggal-1"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-12 pl-10 pr-3 rounded-lg border border-outline-variant bg-surface text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-on-surface-variant mb-1 block" htmlFor="kategori-2">Kategori</label>
            <div className="relative">
              <select
                id="kategori-2"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-12 bg-surface rounded-lg border border-outline-variant px-3 appearance-none text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors pr-10"
              >
                <option value="">Semua Kategori</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.nama || c.name}</option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">arrow_drop_down</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-on-surface-variant mb-1 block" htmlFor="produk-3">Produk</label>
            <div className="relative">
              <select
                id="produk-3"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                className="w-full h-12 bg-surface rounded-lg border border-outline-variant px-3 appearance-none text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors pr-10"
              >
                <option value="">Semua Produk</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.nama || p.name}</option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">arrow_drop_down</span>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="no-print flex items-center justify-center h-40">
          <p className="text-on-surface-variant">Memuat data stok...</p>
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} title="Gagal memuat laporan stok" />
      ) : (
        <ResponsiveTable
          label="Laporan pergerakan stok"
          rows={items}
          minWidth="720px"
          emptyState={
            <EmptyState icon="inventory_2" title="Tidak ada pergerakan stok" description="Belum ada transaksi masuk atau keluar pada tanggal ini." />
          }
          columns={[
            { key: 'no', header: 'No', render: (r, i) => i + 1, cellClass: 'text-on-surface-variant' },
            { key: 'kode', header: 'Kode Produk', render: (r) => r.kode || r.kode_produk || '—', cellClass: 'text-secondary font-medium' },
            { key: 'nama', header: 'Nama Produk', render: (r) => r.nama || r.nama_produk || r.name || '—' },
            // Satuan ditulis di header kolom, bukan di dalam sel angka. Kalau
            // satuan ikut di dalam angka, setiap sel jadi lebih panjang dan
            // penjumlahan di footer jadi ambigu saat satuannya berbeda.
            { key: 'sebelum', header: 'Stok Sebelum', align: 'right', headClass: 'print-num', render: (r) => formatNumber(r.stok_sebelum), cellClass: 'text-on-surface-variant tabular-nums print-num' },
            { key: 'masuk', header: 'Masuk', align: 'right', headClass: 'print-num', render: (r) => formatNumber(r.stok_masuk), cellClass: 'text-success bg-success-container/30 tabular-nums print-num' },
            { key: 'keluar', header: 'Keluar', align: 'right', headClass: 'print-num', render: (r) => formatNumber(r.stok_keluar), cellClass: 'text-danger bg-danger-container/30 tabular-nums print-num' },
            { key: 'sesudah', header: 'Stok Sesudah', align: 'right', render: (r) => formatNumber(r.stok_sesudah), headClass: 'font-bold text-on-surface print-num', cellClass: 'font-bold text-on-surface tabular-nums print-num' },
            { key: 'satuan', header: 'Satuan', render: (r) => r.base_unit || r.unit || '—', cellClass: 'text-on-surface-variant' },
            { key: 'tanggal', header: 'Tanggal', render: (r) => formatDate(r.tanggal), cellClass: 'text-on-surface-variant' },
          ]}
          footer={
            <tr>
              <td className="p-3" colSpan="2"></td>
              <td className="p-3 uppercase">TOTAL</td>
              <td className="p-3 text-right tabular-nums">{formatNumber(totalStokSebelum)}</td>
              <td className="p-3 text-right tabular-nums">{formatNumber(totalStokMasuk)}</td>
              <td className="p-3 text-right tabular-nums">{formatNumber(totalStokKeluar)}</td>
              <td className="p-3 text-right tabular-nums">{formatNumber(totalStokSesudah)}</td>
              {/* Kolom satuan ikut diberi label supaya footer tidak menyiratkan
                  bahwa totalnya satu satuan padahal bisa campur. */}
              <td className="p-3 text-xs uppercase text-on-surface-variant">{sharedUnit || 'campuran'}</td>
              <td className="p-3"></td>
            </tr>
          }
          cardTitle={(r) => r.nama || r.nama_produk || r.name || '—'}
          cardMeta={(r) => `${r.kode || r.kode_produk || 'Tanpa kode'} · ${formatDate(r.tanggal)}`}
          cardBadge={(r) => (
            <span className="inline-flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-wide text-on-surface-variant/80">Stok akhir</span>
              <span className="text-base font-bold text-on-surface tabular-nums">
                {formatNumber(r.stok_sesudah)}{' '}
                <span className="text-xs font-normal text-on-surface-variant">{r.base_unit || r.unit || ''}</span>
              </span>
            </span>
          )}
          cardFields={[
            { label: 'Satuan', render: (r) => r.base_unit || r.unit || '—' },
            { label: 'Stok sebelum', render: (r) => formatNumber(r.stok_sebelum) },
            { label: 'Stok sesudah', render: (r) => formatNumber(r.stok_sesudah) },
            { label: 'Masuk', render: (r) => <span className="text-success">+{formatNumber(r.stok_masuk)}</span> },
            { label: 'Keluar', render: (r) => <span className="text-danger">−{formatNumber(r.stok_keluar)}</span> },
          ]}
        />
      )}
      <PrintFooter />
    </main>
  );
}
