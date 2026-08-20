import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../../utils/format';
import api from '../../services/api';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Plus,
  Trash2,
  ShoppingBag,
  AlertTriangle,
} from 'lucide-react';

export default function CreateSale() {
  const navigate = useNavigate();
  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    date: today,
    customer_id: '',
    due_date: '',
    notes: '',
    amount_paid: 0,
    items: [],
  });

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const res = await api.get('/customers');
      return res.data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await api.get('/products');
      return res.data;
    },
  });

  const customerList = customers?.data || customers || [];
  const productList = products?.data || products || [];

  const addItem = () => {
    setForm((f) => ({
      ...f,
      items: [...f.items, { product_id: '', quantity: 1, sell_price: 0 }],
    }));
  };

  const removeItem = (index) => {
    setForm((f) => ({
      ...f,
      items: f.items.filter((_, i) => i !== index),
    }));
  };

  const updateItem = (index, field, value) => {
    setForm((f) => ({
      ...f,
      items: f.items.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, [field]: value };
        if (field === 'product_id') {
          const product = productList.find((p) => p.id === Number(value));
          updated.sell_price = product?.sell_price || 0;
        }
        return updated;
      }),
    }));
  };

  const total = form.items.reduce((sum, item) => sum + (item.quantity * item.sell_price), 0);
  const remainingBalance = total - form.amount_paid;

  const stockWarnings = form.items.reduce((warnings, item, idx) => {
    if (!item.product_id) return warnings;
    const product = productList.find((p) => p.id === Number(item.product_id));
    if (product && item.quantity > (product.stock || 0)) {
      warnings.push({
        index: idx,
        name: product.name,
        requested: item.quantity,
        available: product.stock || 0,
      });
    }
    return warnings;
  }, []);

  const mutation = useMutation({
    mutationFn: async (data) => {
      const res = await api.post('/sales', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Penjualan berhasil disimpan');
      navigate('/penjualan');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Gagal menyimpan penjualan');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (form.items.length === 0) {
      toast.error('Tambahkan minimal satu item');
      return;
    }
    if (!form.customer_id) {
      toast.error('Pilih toko terlebih dahulu');
      return;
    }
    if (stockWarnings.length > 0) {
      toast.error('Ada item dengan jumlah melebihi stok yang tersedia');
      return;
    }
    mutation.mutate(form);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/penjualan')}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tambah Penjualan</h1>
          <p className="text-gray-500">Formulir penjualan baru</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Informasi Penjualan</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Toko</label>
              <select
                value={form.customer_id}
                onChange={(e) => setForm((f) => ({ ...f, customer_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                required
              >
                <option value="">Pilih Toko</option>
                {customerList.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Jatuh Tempo (Opsional)</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Catatan</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={2}
              placeholder="Catatan opsional..."
            />
          </div>
        </div>

        {/* Stock Warnings */}
        {stockWarnings.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
              <span className="text-sm font-semibold text-yellow-800">Peringatan Stok</span>
            </div>
            <ul className="space-y-1">
              {stockWarnings.map((w) => (
                <li key={w.index} className="text-sm text-yellow-700">
                  <strong>{w.name}</strong>: jumlah dipesan ({w.requested}) melebihi stok tersedia ({w.available})
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Items */}
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Item Penjualan</h2>
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-1 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Item
            </button>
          </div>

          {form.items.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              Belum ada item. Klik "Tambah Item" untuk menambahkan.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Produk</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Qty</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Harga Jual</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Subtotal</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {form.items.map((item, idx) => {
                    const product = productList.find((p) => p.id === Number(item.product_id));
                    const isOverStock = product && item.quantity > (product.stock || 0);
                    return (
                      <tr key={idx} className={isOverStock ? 'bg-yellow-50' : ''}>
                        <td className="px-3 py-2">
                          <select
                            value={item.product_id}
                            onChange={(e) => updateItem(idx, 'product_id', e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          >
                            <option value="">Pilih Produk</option>
                            {productList.map((p) => (
                              <option key={p.id} value={p.id}>{p.name} (Stok: {p.stock || 0})</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                            className={`w-full px-2 py-1.5 border rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 ${isOverStock ? 'border-yellow-400' : 'border-gray-300'}`}
                            required
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            value={item.sell_price}
                            onChange={(e) => updateItem(idx, 'sell_price', Number(e.target.value))}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-800">
                          {formatCurrency(item.quantity * item.sell_price)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="p-1.5 rounded hover:bg-red-50 text-red-500 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Payment & Submit */}
        <div className="bg-white rounded-xl shadow p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Bayar</label>
              <input
                type="number"
                min="0"
                value={form.amount_paid}
                onChange={(e) => setForm((f) => ({ ...f, amount_paid: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Total</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-900">
                {formatCurrency(total)}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sisa Piutang</label>
              <div className={`px-3 py-2 border border-gray-200 rounded-lg text-sm font-bold ${remainingBalance > 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {formatCurrency(remainingBalance > 0 ? remainingBalance : 0)}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate('/penjualan')}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex items-center gap-2 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow transition-colors"
            >
              <ShoppingBag className="w-4 h-4" />
              {mutation.isPending ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
