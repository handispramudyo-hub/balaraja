import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatCurrency, formatDate } from '../../utils/format';
import api from '../../services/api';
import { toast } from 'sonner';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import Modal from '../../components/ui/Modal';

const kategoriOptions = [
  { value: 'transportasi', label: 'Transportasi', icon: 'local_shipping' },
  { value: 'ongkos_kirim', label: 'Ongkos Kirim', icon: 'local_post_office' },
  { value: 'operasional', label: 'Operasional', icon: 'settings' },
];

const kategoriColors = {
  transportasi: 'bg-primary-container text-on-primary-container',
  ongkos_kirim: 'bg-secondary-container text-on-secondary-container',
  operasional: 'bg-surface-container-high text-on-surface-variant',
};

export default function ExpensesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    category: '',
  });

  const emptyForm = {
    date: new Date().toISOString().split('T')[0],
    category: '',
    amount: '',
    description: '',
  };

  const [form, setForm] = useState(emptyForm);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['expenses', filters],
    queryFn: async () => {
      const params = {};
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      if (filters.category) params.category = filters.category;
      const res = await api.get('/expenses', { params });
      return res.data;
    },
  });

  const expenses = data?.data || data || [];
  const hasFilter = !!(filters.start_date || filters.end_date || filters.category);

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const res = await api.post('/expenses', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Biaya berhasil ditambahkan');
      setShowForm(false);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Gagal menambahkan biaya');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const res = await api.put(`/expenses/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Biaya berhasil diperbarui');
      setShowForm(false);
      setEditItem(null);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Gagal memperbarui biaya');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const res = await api.delete(`/expenses/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Biaya berhasil dihapus');
      setDeleteConfirm(null);
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Gagal menghapus biaya');
    },
  });

  const openCreate = () => {
    setEditItem(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({
      date: item.date?.split('T')[0] || item.date,
      category: item.category,
      amount: String(item.amount ?? ''),
      description: item.description,
    });
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.category) {
      toast.error('Pilih kategori terlebih dahulu');
      return;
    }
    const amt = Number(form.amount) || 0;
    if (amt <= 0) {
      toast.error('Nominal harus lebih dari 0');
      return;
    }
    const payload = { ...form, amount: amt };
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <main className="px-4 py-6 max-w-4xl mx-auto space-y-4">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-primary">Biaya</h2>
        <p className="text-sm text-on-surface-variant mt-1">Daftar pengeluaran biaya</p>
      </div>

      <div className="bg-surface-container-lowest p-3 rounded-xl shadow-sm border border-outline-variant/30 flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="tanggal-mulai-1">Tanggal Mulai</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">calendar_today</span>
              <input
                id="tanggal-mulai-1"
                type="date"
                value={filters.start_date}
                onChange={(e) => setFilters((f) => ({ ...f, start_date: e.target.value }))}
                className="w-full h-10 pl-11 pr-3 bg-surface text-on-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="tanggal-akhir-2">Tanggal Akhir</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">calendar_today</span>
              <input
                id="tanggal-akhir-2"
                type="date"
                value={filters.end_date}
                onChange={(e) => setFilters((f) => ({ ...f, end_date: e.target.value }))}
                className="w-full h-10 pl-11 pr-3 bg-surface text-on-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="kategori-3">Kategori</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">label</span>
              <select
                id="kategori-3"
                value={filters.category}
                onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
                className="w-full h-10 pl-11 pr-3 bg-surface text-on-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition appearance-none"
              >
                <option value="">Semua Kategori</option>
                {kategoriOptions.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="bg-surface rounded-xl p-6 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] border border-surface-container-high">
            <LoadingState rows={3} />
          </div>
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} title="Gagal memuat data biaya" />
        ) : expenses.length === 0 ? (
          <EmptyState
            icon="receipt_long"
            title={hasFilter ? 'Tidak ada biaya yang cocok' : 'Belum ada biaya tercatat'}
            description={
              hasFilter
                ? 'Coba ubah atau kosongkan filter tanggal dan kategori.'
                : 'Catat pengeluaran seperti	ongkos kirim atau biaya operasional di sini.'
            }
          />
        ) : (
          expenses.map((item) => (
            <div key={item.id} className="bg-surface rounded-xl p-4 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] border border-surface-container-high flex gap-4 items-center">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${kategoriColors[item.category] || 'bg-surface-container-high text-on-surface-variant'}`}>
                    <span className="material-symbols-outlined text-[14px]">
                      {kategoriOptions.find(k => k.value === item.category)?.icon || 'label'}
                    </span>
                    {item.category?.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-outline">{formatDate(item.date)}</span>
                </div>
                <p className="text-sm text-on-surface-variant truncate">{item.description || '-'}</p>
                <p className="text-base font-semibold text-on-surface mt-1">{formatCurrency(item.amount)}</p>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button
                  onClick={() => openEdit(item)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:bg-surface-variant hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">edit</span>
                </button>
                <button
                  onClick={() => setDeleteConfirm(item)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:bg-error-container hover:text-error transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">delete</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <button
        onClick={openCreate}
        className="fixed bottom-24 right-4 md:bottom-8 md:right-8 w-14 h-14 bg-primary text-on-primary rounded-2xl shadow-[0_8px_12px_-4px_rgba(0,0,0,0.1)] flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-40"
      >
        <span className="material-symbols-outlined text-[28px]">add</span>
      </button>

      {showForm && (
        <Modal onClose={() => { setShowForm(false); setEditItem(null); }} title="Form biaya" variant="sheet" zIndex={60} panelClassName="bg-surface w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[85vh]" initialFocus='input, select, textarea'>
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <h3 className="text-on-surface text-lg font-semibold">{editItem ? 'Edit Biaya' : 'Tambah Biaya'}</h3>
              <button onClick={() => { setShowForm(false); setEditItem(null); }} className="p-2 rounded-xl text-outline hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1 overflow-hidden">
              <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="tanggal-4">Tanggal</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">calendar_today</span>
                    <input
                      id="tanggal-4"
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                      className="w-full h-12 pl-11 pr-3 bg-surface text-on-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="kategori-5">Kategori</label>
                  <select
                    id="kategori-5"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full h-12 px-4 bg-surface text-on-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition appearance-none"
                    required
                  >
                    <option value="">Pilih Kategori</option>
                    {kategoriOptions.map((k) => (
                      <option key={k.value} value={k.value}>{k.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="nominal-6">Nominal (Rp)</label>
                  <input
                    id="nominal-6"
                    type="number"
                    min="1"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    className="w-full h-12 px-4 bg-surface text-on-surface placeholder-outline rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="keterangan-7">Keterangan</label>
                  <textarea
                    id="keterangan-7"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    className="w-full px-4 py-3 bg-surface text-on-surface placeholder-outline rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition resize-none"
                    rows={3}
                    placeholder="Keterangan biaya..."
                  />
                </div>
              </div>
              <div className="shrink-0 bg-surface border-t border-outline-variant/30 px-6 py-3 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditItem(null); }}
                className="h-10 px-5 text-sm font-medium text-primary bg-transparent hover:bg-primary/10 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="h-10 px-5 text-sm font-medium text-on-primary bg-primary hover:bg-primary/90 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-base">receipt</span>
                {(createMutation.isPending || updateMutation.isPending) ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
            </form>
        </Modal>
      )}

      {deleteConfirm && (
        <Modal onClose={() => setDeleteConfirm(null)} title="Konfirmasi hapus biaya" variant="sheet" zIndex={60} panelClassName="bg-surface w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[85vh]">
            <div className="overflow-y-auto flex-1 pb-20">
              <div className="p-6 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-error-container flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-2xl text-on-error-container">delete</span>
                </div>
                <h3 className="text-on-surface text-lg font-semibold mb-2">Hapus Biaya?</h3>
                <p className="text-sm text-on-surface-variant mb-6">
                  Anda yakin ingin menghapus biaya <strong>{formatCurrency(deleteConfirm.amount)}</strong> pada {formatDate(deleteConfirm.date)}?
                </p>
              </div>
            </div>
            <div className="sticky bottom-0 bg-surface border-t border-outline-variant/30 px-6 py-3 flex justify-center gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="h-10 px-5 text-sm font-medium text-primary bg-transparent hover:bg-primary/10 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm.id)}
                disabled={deleteMutation.isPending}
                className="h-10 px-5 text-sm font-medium text-on-error bg-error hover:bg-error/90 rounded-xl transition-colors disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Menghapus...' : 'Hapus'}
              </button>
            </div>
        </Modal>
      )}
    </main>
  );
}
