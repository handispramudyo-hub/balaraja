import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatNumber } from '../../utils/format';
import { toast } from 'sonner';
import { Printer, FileSpreadsheet, Package } from 'lucide-react';

export default function StockReport() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('');
  const [product, setProduct] = useState('');

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

  const { data, isLoading } = useQuery({
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

  const totalStokAwal = items.reduce((s, r) => s + (r.stok_awal || 0), 0);
  const totalStokMasuk = items.reduce((s, r) => s + (r.stok_masuk || 0), 0);
  const totalStokKeluar = items.reduce((s, r) => s + (r.stok_keluar || 0), 0);
  const totalStokAkhir = items.reduce((s, r) => s + (r.stok_akhir || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Laporan Stok</h1>
          <p className="text-gray-500 text-sm">Rekapitulasi pergerakan stok barang</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition"
          >
            <Printer className="w-4 h-4" />
            Cetak
          </button>
          <button
            onClick={() => toast.info('Export Excel belum tersedia')}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export Excel
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white min-w-[180px]"
            >
              <option value="">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.nama || c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Produk</label>
            <select
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white min-w-[180px]"
            >
              <option value="">Semua Produk</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.nama || p.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <p className="text-gray-500">Memuat data stok...</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600 bg-gray-50">
                  <th className="px-4 py-3 font-medium w-10">No</th>
                  <th className="px-4 py-3 font-medium">Kode</th>
                  <th className="px-4 py-3 font-medium">Nama Produk</th>
                  <th className="px-4 py-3 font-medium text-right">Stok Awal</th>
                  <th className="px-4 py-3 font-medium text-right">Stok Masuk</th>
                  <th className="px-4 py-3 font-medium text-right">Stok Keluar</th>
                  <th className="px-4 py-3 font-medium text-right">Stok Akhir</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400">
                      <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      Tidak ada data stok
                    </td>
                  </tr>
                ) : (
                  items.map((r, i) => (
                    <tr key={r.id || i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.kode || r.kode_produk}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{r.nama || r.nama_produk || r.name}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(r.stok_awal)}</td>
                      <td className="px-4 py-3 text-right text-green-600">{formatNumber(r.stok_masuk)}</td>
                      <td className="px-4 py-3 text-right text-red-600">{formatNumber(r.stok_keluar)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatNumber(r.stok_akhir)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {items.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                    <td colSpan={3} className="px-4 py-3 text-gray-900">Total</td>
                    <td className="px-4 py-3 text-right">{formatNumber(totalStokAwal)}</td>
                    <td className="px-4 py-3 text-right text-green-600">{formatNumber(totalStokMasuk)}</td>
                    <td className="px-4 py-3 text-right text-red-600">{formatNumber(totalStokKeluar)}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(totalStokAkhir)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
