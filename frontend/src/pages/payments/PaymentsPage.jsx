import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatCurrency, formatDate } from '../../utils/format';
import api from '../../services/api';
import { toast } from 'sonner';
import {
  CreditCard,
  Plus,
  X,
  Calendar,
  Store,
  Filter,
  Banknote,
  Wallet,
  FileText,
} from 'lucide-react';

const metodeOptions = [
  { value: 'tunai', label: 'Tunai', icon: Banknote },
  { value: 'transfer', label: 'Transfer', icon: Wallet },
  { value: 'lainnya', label: 'Lainnya', icon: FileText },
];

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    customer_id: '',
  });

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    customer_id: '',
    sale_id: '',
    amount: 0,
    method: 'tunai',
    notes: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['payments', filters],
    queryFn: async () => {
      const params = {};
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      if (filters.customer_id) params.customer_id = filters.customer_id;
      const res = await api.get('/payments', { params });
      return res.data;
    },
  });

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const res = await api.get('/customers');
      return res.data;
    },
  });

  const { data: salesData } = useQuery({
    queryKey: ['unpaid-sales', form.customer_id],
    queryFn: async () => {
      if (!form.customer_id) return { data: [] };
      const res = await api.get('/sales', {
        params: { customer_id: form.customer_id, payment_status: 'unpaid_or_partial' },
      });
      return res.data;
    },
    enabled: !!form.customer_id,
  });

  const customerList = customers?.data || customers || [];
  const saleList = salesData?.data || salesData || [];
  const selectedSale = saleList.find((s) => s.id === Number(form.sale_id));
  const maxAmount = selectedSale?.remaining_balance || 0;

  const payments = data?.data || data || [];

  const mutation = useMutation({
    mutationFn: async (data) => {
      const res = await api.post('/payments', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Pembayaran berhasil disimpan');
      setShowForm(false);
      setForm({
        date: new Date().toISOString().split('T')[0],
        customer_id: '',
        sale_id: '',
        amount: 0,
        method: 'tunai',
        notes: '',
      });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Gagal menyimpan pembayaran');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.customer_id) {
      toast.error('Pilih toko terlebih dahulu');
      return;
    }
    if (!form.sale_id) {
      toast.error('Pilih transaksi terlebih dahulu');
      return;
    }
    if (form.amount <= 0) {
      toast.error('Nominal harus lebih dari 0');
      return;
    }
    if (form.amount > maxAmount) {
      toast.error(`Nominal maksimal adalah ${formatCurrency(maxAmount)}`);
      return;
    }
    mutation.mutate(form);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pembayaran</h1>
          <p className="text-gray-500">Daftar pembayaran masuk</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow transition-colors"
        >
          <Plus className="w-4 h-4" />
          Tambah Pembayaran
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Tambah Pembayaran</h3>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Toko</label>
                <div className="relative">
                  <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <select
                    value={form.customer_id}
                    onChange={(e) => setForm((f) => ({ ...f, customer_id: e.target.value, sale_id: '' }))}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                    required
                  >
                    <option value="">Pilih Toko</option>
                    {customerList.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Transaksi</label>
                <select
                  value={form.sale_id}
                  onChange={(e) => setForm((f) => ({ ...f, sale_id: e.target.value, amount: 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                  required
                  disabled={!form.customer_id}
                >
                  <option value="">Pilih Transaksi</option>
                  {saleList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.sale_number} — {formatCurrency(s.remaining_balance)}
                    </option>
                  ))}
                </select>
                {!form.customer_id && (
                  <p className="text-xs text-gray-400 mt-1">Pilih toko terlebih dahulu</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Nominal {form.sale_id && `(Maks: ${formatCurrency(maxAmount)})`}
                </label>
                <input
                  type="number"
                  min="1"
                  max={maxAmount || undefined}
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Metode Pembayaran</label>
                <div className="grid grid-cols-3 gap-2">
                  {metodeOptions.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, method: m.value }))}
                      className={`flex items-center justify-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-semibold transition-colors ${
                        form.method === m.value
                          ? 'border-teal-500 bg-teal-50 text-teal-700'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <m.icon className="w-3.5 h-3.5" />
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Catatan</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={2}
                  placeholder="Catatan opsional..."
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 disabled:bg-teal-300 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow transition-colors"
                >
                  <CreditCard className="w-4 h-4" />
                  {mutation.isPending ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Filter</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal Mulai</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) => setFilters((f) => ({ ...f, start_date: e.target.value }))}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal Akhir</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) => setFilters((f) => ({ ...f, end_date: e.target.value }))}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Toko</label>
            <div className="relative">
              <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={filters.customer_id}
                onChange={(e) => setFilters((f) => ({ ...f, customer_id: e.target.value }))}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
              >
                <option value="">Semua Toko</option>
                {customerList.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-semibold text-gray-600">No</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">No Pembayaran</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Tanggal</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Toko</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Transaksi</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Nominal</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Metode</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">Memuat data...</td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">Tidak ada data pembayaran</td>
                </tr>
              ) : (
                payments.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-700">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{item.payment_number}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(item.date)}</td>
                    <td className="px-4 py-3 text-gray-600">{item.customer?.name || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{item.sale?.sale_number || '-'}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">{formatCurrency(item.amount)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 capitalize">
                        {item.method}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500 text-xs">-</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
