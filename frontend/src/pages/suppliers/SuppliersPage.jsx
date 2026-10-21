import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { formatCurrency } from '../../utils/format';
import api from '../../services/api';
import Modal from '../../components/ui/Modal';

const initialForm = { name: '', contact_name: '', phone: '', address: '', note: '', status: 'active' };

// Array kosong di level modul agar referensinya stabil antar render.
const EMPTY_LIST = [];

export default function SuppliersPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const res = await api.get('/suppliers');
      return Array.isArray(res.data) ? res.data : (res.data.data || []);
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/suppliers', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Supplier berhasil ditambahkan');
      closeModal();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal menambahkan supplier'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => api.put(`/suppliers/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Supplier berhasil diperbarui');
      closeModal();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal memperbarui supplier'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/suppliers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Supplier berhasil dihapus');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal menghapus supplier'),
  });

  function openCreate() {
    setEditing(null);
    setForm(initialForm);
    setShowModal(true);
  }

  function openEdit(item) {
    setEditing(item);
    setForm({
      name: item.name || '',
      contact_name: item.contact_name || '',
      phone: item.phone || '',
      address: item.address || '',
      note: item.note || '',
      status: item.status || 'active',
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditing(null);
    setForm(initialForm);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Nama supplier wajib diisi');
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload: form });
    } else {
      createMutation.mutate(form);
    }
  }

  function handleDelete(item) {
    if (!window.confirm(`Hapus supplier "${item.name}"?`)) return;
    deleteMutation.mutate(item.id);
  }

  // Referensi stabil supaya useMemo di bawah benar-benar bekerja;
  // `data || []` akan membuat array baru setiap render.
  const suppliers = data || EMPTY_LIST;

  const filteredSuppliers = useMemo(() => {
    if (!search.trim()) return suppliers;
    const q = search.toLowerCase();
    return suppliers.filter(
      (item) =>
        item.name?.toLowerCase().includes(q) ||
        item.contact_name?.toLowerCase().includes(q) ||
        item.phone?.toLowerCase().includes(q) ||
        item.address?.toLowerCase().includes(q)
    );
  }, [suppliers, search]);

  function StatusBadge({ status }) {
    const isActive = status === 'active';
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${isActive ? 'bg-success-container text-on-success-container' : 'bg-error-container text-on-error-container'}`}>
        <span className="material-symbols-outlined text-[14px]">
          {isActive ? 'check_circle' : 'cancel'}
        </span>
        {isActive ? 'Aktif' : 'Nonaktif'}
      </span>
    );
  }

  return (
    <main className="px-4 py-6 max-w-4xl mx-auto space-y-4">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-primary">Supplier</h2>
        <p className="text-sm text-on-surface-variant mt-1">Kelola data supplier</p>
      </div>

      <div className="relative">
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">search</span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari supplier..."
          className="w-full h-12 pl-12 pr-4 rounded-xl border border-outline-variant bg-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm text-on-surface placeholder:text-outline transition-all duration-200 shadow-sm"
        />
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <span className="material-symbols-outlined text-outline animate-spin text-4xl">progress_activity</span>
          <p className="text-outline text-sm">Memuat data...</p>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <span className="material-symbols-outlined text-error text-4xl">error</span>
          <p className="text-error text-sm">Gagal memuat data: {error?.message}</p>
        </div>
      )}

      {!isLoading && !isError && filteredSuppliers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <span className="material-symbols-outlined text-outline text-5xl">local_shipping</span>
          <p className="text-outline text-sm">
            {search ? 'Tidak ada supplier ditemukan' : 'Belum ada data supplier'}
          </p>
        </div>
      )}

      {!isLoading && !isError && filteredSuppliers.map((item) => (
        <div
          key={item.id}
          className="bg-surface rounded-xl p-4 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] border border-surface-container-high flex gap-4 items-center"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-base font-semibold text-on-surface truncate">{item.name}</h3>
              <StatusBadge status={item.status} />
            </div>
            {Number(item.total_payable) > 0 && (
              <Link
                to="/pelunasan-utang"
                className="flex items-center gap-1.5 mb-1.5 inline-flex px-2 py-1 rounded-lg bg-error-container text-on-error-container text-xs font-medium hover:opacity-90 transition-opacity"
                title="Lihat daftar pelunasan utang supplier ini"
              >
                <span className="material-symbols-outlined text-base">price_change</span>
                Utang {formatCurrency(item.total_payable)}
              </Link>
            )}
            {item.contact_name && (
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-outline text-base">person</span>
                <p className="text-sm text-on-surface-variant truncate">{item.contact_name}</p>
              </div>
            )}
            {item.phone && (
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-outline text-base">phone</span>
                <p className="text-sm text-on-surface-variant">{item.phone}</p>
              </div>
            )}
            {item.address && (
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-outline text-base">location_on</span>
                <p className="text-sm text-on-surface-variant truncate max-w-xs">{item.address}</p>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={() => openEdit(item)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:bg-surface-variant hover:text-primary transition-colors"
              title="Edit"
            >
              <span className="material-symbols-outlined text-[20px]">edit</span>
            </button>
            <button
              onClick={() => handleDelete(item)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:bg-error-container hover:text-error transition-colors"
              title="Hapus"
            >
              <span className="material-symbols-outlined text-[20px]">delete</span>
            </button>
          </div>
        </div>
      ))}

      <button
        onClick={openCreate}
        className="fixed bottom-24 right-4 md:bottom-8 md:right-8 w-14 h-14 bg-primary text-on-primary rounded-2xl shadow-[0_8px_12px_-4px_rgba(0,0,0,0.1)] flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-40"
        title="Tambah Supplier"
      >
        <span className="material-symbols-outlined text-[28px]">add</span>
      </button>

      {showModal && (
        <Modal onClose={closeModal} title="Form pemasok" variant="sheet" zIndex={60} panelClassName="bg-surface w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[85vh]" initialFocus='input, select, textarea'>
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <h3 className="text-on-surface text-lg font-semibold">
                {editing ? 'Edit Supplier' : 'Tambah Supplier'}
              </h3>
              <button
                onClick={closeModal}
                className="p-2 rounded-xl text-outline hover:bg-surface-container-high transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 pb-20">
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="nama-1">Nama *</label>
                <input
                  id="nama-1"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full h-12 px-4 bg-surface text-on-surface placeholder-outline rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition"
                  placeholder="Masukkan nama supplier"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="nama-kontak-2">Nama Kontak</label>
                <input
                  id="nama-kontak-2"
                  type="text"
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                  className="w-full h-12 px-4 bg-surface text-on-surface placeholder-outline rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition"
                  placeholder="Masukkan nama kontak"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="no-hp-3">No. HP</label>
                  <input
                    id="no-hp-3"
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full h-12 px-4 bg-surface text-on-surface placeholder-outline rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition"
                    placeholder="08xxxxxxxxxx"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="status-4">Status</label>
                  <select
                    id="status-4"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full h-12 bg-surface text-on-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition"
                  >
                    <option value="active">Aktif</option>
                    <option value="inactive">Nonaktif</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="alamat-5">Alamat</label>
                <textarea
                  id="alamat-5"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 bg-surface text-on-surface placeholder-outline rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition resize-none"
                  placeholder="Masukkan alamat"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="catatan-6">Catatan</label>
                <textarea
                  id="catatan-6"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 bg-surface text-on-surface placeholder-outline rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition resize-none"
                  placeholder="Catatan tambahan (opsional)"
                />
              </div>
            </form>
            </div>
            <div className="sticky bottom-0 bg-surface border-t border-outline-variant/30 px-6 py-3 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="h-10 px-5 text-sm font-medium text-primary bg-transparent hover:bg-primary/10 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="h-10 px-5 text-sm font-medium text-on-primary bg-primary hover:bg-primary/90 rounded-xl transition-colors disabled:opacity-50"
              >
                {createMutation.isPending || updateMutation.isPending
                  ? 'Menyimpan...'
                  : editing
                  ? 'Simpan Perubahan'
                  : 'Simpan'}
              </button>
            </div>
        </Modal>
      )}
    </main>
  );
}
