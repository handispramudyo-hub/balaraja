import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../../services/api';
import { formatCurrency } from '../../utils/format';
import Modal from '../../components/ui/Modal';
import ProductUnitEditor from '../../components/products/ProductUnitEditor';
import RebaseConfirmDialog from '../../components/products/RebaseConfirmDialog';
import {
  changesBaseUnit,
  currentBaseName,
  toUnitRows,
  validateUnits,
} from '../../components/products/unitRules';

const initialForm = { name: '', category_id: '', buy_price: '', sell_price: '', stock: '', min_stock: '', supplier_id: '' };

const tabs = [
  { label: 'Produk', path: '/produk' },
  { label: 'Kategori', path: '/kategori' },
  { label: 'Supplier', path: '/supplier' },
  { label: 'Toko', path: '/toko' },
];

export default function ProductsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [unitRows, setUnitRows] = useState(() => toUnitRows([]));
  const [search, setSearch] = useState('');

  // State khusus alur ganti satuan dasar: payload yang sudah siap, hasil
  // preview, dan dialognya. Dipisah dari `form` karena ini percakapan
  // dua-langkah, bukan bagian dari isi form.
  const [rebase, setRebase] = useState({ open: false, payload: null, preview: null });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await api.get('/products');
      return Array.isArray(res.data) ? res.data : (res.data.data || []);
    },
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get('/categories');
      return Array.isArray(res.data) ? res.data : (res.data.data || []);
    },
  });

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const res = await api.get('/suppliers');
      return Array.isArray(res.data) ? res.data : (res.data.data || []);
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/products', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Produk berhasil ditambahkan');
      closeModal();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal menambahkan produk'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => api.put(`/products/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Produk berhasil diperbarui');
      closeModal();
      cancelRebase();
    },
    onError: (err) => {
      // Server menolak permintaan yang menggabungkan ganti satuan dasar
      // dengan nilai stok. Frontend sudah menghindari itu, tapi kalau
      // ada versi yang tidak, errornya ditampilkan apa adanya.
      const data = err.response?.data;
      const firstError = data?.errors ? Object.values(data.errors).flat()[0] : null;
      toast.error(firstError || data?.message || 'Gagal memperbarui produk');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Produk berhasil dihapus');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal menghapus produk'),
  });

  /**
   * Angka dampak konversi dihitung server. Endpoint ini hanya membaca, jadi
   * aman dipanggil berkali-kali sambil user masih mengisi factor.
   */
  const previewMutation = useMutation({
    mutationFn: ({ id, units }) => api.post(`/products/${id}/units/rebase-preview`, { units }),
    onSuccess: (res) => setRebase((s) => ({ ...s, preview: res.data })),
    onError: (err) => {
      const data = err.response?.data;
      toast.error(data?.errors?.units?.[0] || data?.message || 'Gagal menghitung dampak satuan');
      setRebase({ open: false, payload: null, preview: null });
    },
  });

  function openCreate() {
    setEditing(null);
    setForm(initialForm);
    setUnitRows(toUnitRows([]));
    setShowModal(true);
  }

  function openEdit(item) {
    setEditing(item);
    setForm({
      name: item.name || '',
      category_id: item.category_id ?? '',
      buy_price: item.buy_price ?? '',
      sell_price: item.sell_price ?? '',
      stock: item.stock ?? '',
      min_stock: item.min_stock ?? '',
      supplier_id: item.supplier_id ?? '',
    });
    setUnitRows(toUnitRows(item.units));
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditing(null);
    setForm(initialForm);
    setUnitRows(toUnitRows([]));
  }

  function cancelRebase() {
    setRebase({ open: false, payload: null, preview: null });
  }

  function submitPayload(payload) {
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleSubmit(e) {
    e?.preventDefault();
    if (!form.name.trim()) return toast.error('Nama produk wajib diisi');

    const { units, errors } = validateUnits(unitRows);
    if (errors.length) return toast.error(errors[0]);

    const base = currentBaseName(editing);
    const isRebasing = Boolean(editing) && changesBaseUnit(units, base);

    const payload = {
      name: form.name,
      category_id: form.category_id || null,
      supplier_id: form.supplier_id || null,
      buy_price: form.buy_price !== '' ? Number(form.buy_price) : 0,
      sell_price: form.sell_price !== '' ? Number(form.sell_price) : 0,
      min_stock: form.min_stock !== '' ? Number(form.min_stock) : 0,
      units,
    };

    // Stok sengaja tidak ikut saat satuan dasar diganti. Nilainya dihitung
    // dari rasio isi satuan, dan server akan menolak request yang mengirim
    // keduanya sekaligus - jadi lebih baik form yang duluan tidak mengirim
    // angka basi.
    if (!isRebasing) {
      payload.stock = form.stock !== '' ? Number(form.stock) : 0;
    }

    if (isRebasing) {
      setRebase({ open: true, payload, preview: null });
      previewMutation.mutate({ id: editing.id, units });
      return;
    }

    submitPayload(payload);
  }

  function confirmRebase() {
    if (!rebase.payload) return;
    submitPayload({ ...rebase.payload, confirm_unit_rebase: true });
  }

  function handleDelete(item) {
    if (!window.confirm(`Hapus produk "${item.name}"?`)) return;
    deleteMutation.mutate(item.id);
  }

  /**
   * Ringkasan satuan turunan untuk kartu produk.
   *
   * Tidak menampilkan satuan dasar karena sudah ada di angka stok - yang
   * ditambahkan hanya satuan yang bisa dipakai user saat membeli/menjual.
   * "24 btl/dus" jauh lebih berguna daripada "btl, dus" terpisah, karena
   * angkanya langsung terbaca.
   */
  function unitSummary(item) {
    const packs = (item.units || []).filter((u) => !u.is_base && Number(u.factor) > 0);
    if (packs.length === 0) return null;

    return (
      <span className="text-xs text-on-surface-variant">
        {packs.map((u) => `${u.factor} ${item.base_unit || item.unit || ''}/${u.name}`).join(' Â· ')}
      </span>
    );
  }

  function getStockBadge(stock, minStock) {
    const s = Number(stock) || 0;
    const min = Number(minStock) || 0;
    if (s <= 0) {
      return { label: 'Habis', cls: 'bg-error-container text-on-error-container border border-error/20' };
    }
    if (s <= min) {
      return { label: 'Menipis', cls: 'bg-warning-container text-on-warning-container border border-warning-fixed' };
    }
    return { label: 'Aman', cls: 'bg-success-container text-on-success-container border border-success-fixed' };
  }

  const products = (data || []).filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name?.toLowerCase().includes(q) ||
      p.code?.toLowerCase().includes(q)
    );
  });

  // Turunannya dipakai form supaya tidak ada kondisi "sedang ganti satuan
  // dasar" yang dihitung dua kali dengan cara berbeda.
  const { units: cleanUnits } = validateUnits(unitRows);
  const baseLabel = cleanUnits.find((u) => u.is_base)?.name || '';
  const rebasing = Boolean(editing) && changesBaseUnit(cleanUnits, currentBaseName(editing));
  const busy = createMutation.isPending || updateMutation.isPending;

  return (
    <main className="flex-1 overflow-y-auto py-4 w-full space-y-6">
      {/* Sticky Search and Filter */}
      <div className="pt-2 pb-4 -mx-4 px-4 space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-12 pl-12 pr-4 rounded-xl border border-outline-variant bg-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm text-on-surface placeholder:text-outline transition-all duration-200 shadow-sm"
            placeholder="Cari produk..."
          />
        </div>
        {/* Horizontal Scrollable Tabs */}
        <div className="flex overflow-x-auto hide-scrollbar gap-2 pb-1 snap-x">
          {tabs.map((tab) => (
            <button
              key={tab.label}
              onClick={() => navigate(tab.path)}
              className={`snap-start shrink-0 px-4 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                tab.label === 'Produk'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface border border-outline-variant text-on-surface-variant hover:bg-surface-variant'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Product Cards */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant animate-pulse">hourglass_empty</span>
            <p className="text-on-surface-variant text-sm">Memuat data...</p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <span className="material-symbols-outlined text-4xl text-error">error</span>
            <p className="text-error text-sm">Gagal memuat data: {error?.message}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant">inventory_2</span>
            <p className="text-on-surface-variant text-sm">
              {search ? 'Produk tidak ditemukan' : 'Belum ada data produk'}
            </p>
          </div>
        ) : (
          products.map((item) => {
            const badge = getStockBadge(item.stock, item.min_stock);
            return (
              <div
                key={item.id}
                className="bg-surface rounded-xl p-4 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] border border-surface-container-high flex gap-4 items-center"
              >
                {/* Image */}
                <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-surface-variant relative">
                  {item.image ? (
                    <img className="w-full h-full object-cover" src={item.image} alt={item.name} />
                  ) : (
                    <span className="material-symbols-outlined absolute inset-0 flex items-center justify-center text-on-surface-variant">image</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-on-surface truncate">{item.name}</h3>
                  <p className="text-sm text-on-surface-variant truncate">{item.code || '-'}</p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <span className="text-lg font-semibold text-primary">{formatCurrency(item.sell_price)}</span>
                    <span className="text-sm text-on-surface-variant">
                      Stok: {Number(item.stock) || 0} {item.base_unit || item.unit || ''}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium leading-none ${badge.cls}`}>{badge.label}</span>
                    {unitSummary(item)}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => openEdit(item)}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:bg-surface-variant hover:text-primary transition-colors"
                  >
                    <span className="material-symbols-outlined text-[20px]">edit</span>
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:bg-error-container hover:text-error transition-colors"
                  >
                    <span className="material-symbols-outlined text-[20px]">delete</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* FAB */}
      <button
        onClick={openCreate}
        className="fixed bottom-24 right-4 md:bottom-8 md:right-8 w-14 h-14 bg-primary text-on-primary rounded-2xl shadow-[0_8px_12px_-4px_rgba(0,0,0,0.1)] flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-40"
      >
        <span className="material-symbols-outlined text-[28px]">add</span>
      </button>

      {/* Modal */}
      {showModal && (
        <Modal onClose={closeModal} title="Form produk" variant="sheet" zIndex={60} panelClassName="bg-surface w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[85vh]" initialFocus='input, select, textarea'>
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4">
              <h3 className="text-lg font-semibold text-on-surface">
                {editing ? 'Edit Produk' : 'Tambah Produk'}
              </h3>
              <button
                onClick={closeModal}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-variant transition-colors"
              >
                <span className="material-symbols-outlined text-on-surface-variant">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto flex-1 pb-20 px-6 space-y-4">
            <form onSubmit={handleSubmit}>
              {editing && (
                <div className="relative">
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="kode-1">Kode</label>
                  <input
                    id="kode-1"
                    type="text"
                    disabled
                    value={editing.code || ''}
                    className="w-full h-12 px-4 rounded-xl border border-outline-variant bg-surface-variant/50 text-on-surface-variant/60 cursor-not-allowed"
                  />
                </div>
              )}

              <div className="relative">
                <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="nama-2">Nama *</label>
                <input
                  id="nama-2"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full h-12 px-4 rounded-xl border border-outline-variant bg-surface text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
                  placeholder="Masukkan nama produk"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="kategori-3">Kategori</label>
                  <select
                    id="kategori-3"
                    value={form.category_id}
                    onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                    className="w-full h-12 px-4 rounded-xl border border-outline-variant bg-surface text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40 transition appearance-none"
                  >
                    <option value="">-- Pilih Kategori --</option>
                    {(categories || []).map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="harga-beli-rp-5">Harga Beli (Rp)</label>
                  <input
                    id="harga-beli-rp-5"
                    type="number"
                    min="0"
                    value={form.buy_price}
                    onChange={(e) => setForm({ ...form, buy_price: e.target.value })}
                    className="w-full h-12 px-4 rounded-xl border border-outline-variant bg-surface text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
                    placeholder="0"
                  />
                </div>
              </div>

              <ProductUnitEditor
                units={unitRows}
                onChange={setUnitRows}
                currentBaseName={currentBaseName(editing)}
              />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="harga-jual-rp-6">Harga Jual (Rp)</label>
                  <input
                    id="harga-jual-rp-6"
                    type="number"
                    min="0"
                    value={form.sell_price}
                    onChange={(e) => setForm({ ...form, sell_price: e.target.value })}
                    className="w-full h-12 px-4 rounded-xl border border-outline-variant bg-surface text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="stok-7">
                    Stok {baseLabel && <span className="font-normal">({baseLabel})</span>}
                  </label>
                  <input
                    id="stok-7"
                    type="number"
                    min="0"
                    value={rebasing ? '' : form.stock}
                    disabled={rebasing}
                    onChange={(e) => setForm({ ...form, stock: e.target.value })}
                    placeholder={rebasing ? 'otomatis' : '0'}
                    className="w-full h-12 px-4 rounded-xl border border-outline-variant bg-surface text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition disabled:bg-surface-variant/50 disabled:text-on-surface-variant/60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="stok-minimum-8">
                    Stok Minimum {baseLabel && <span className="font-normal">({baseLabel})</span>}
                  </label>
                  <input
                    id="stok-minimum-8"
                    type="number"
                    min="0"
                    value={form.min_stock}
                    onChange={(e) => setForm({ ...form, min_stock: e.target.value })}
                    className="w-full h-12 px-4 rounded-xl border border-outline-variant bg-surface text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="supplier-9">Supplier</label>
                <select
                  id="supplier-9"
                  value={form.supplier_id}
                  onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                  className="w-full h-12 px-4 rounded-xl border border-outline-variant bg-surface text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40 transition appearance-none"
                >
                  <option value="">-- Pilih Supplier --</option>
                  {(suppliers || []).map((sup) => (
                    <option key={sup.id} value={sup.id}>{sup.name}</option>
                  ))}
                </select>
              </div>

              {/* Modal Actions */}
            </form>
            </div>
            <div className="sticky bottom-0 bg-surface border-t border-outline-variant/30 px-6 py-3 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="px-6 h-10 text-sm font-medium text-on-surface-variant hover:bg-surface-variant rounded-full transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={busy}
                className="px-6 h-10 text-sm font-medium text-on-primary bg-primary hover:bg-primary/90 rounded-full transition-colors disabled:opacity-50"
              >
                {busy
                  ? 'Menyimpan...'
                  : rebasing
                  ? 'Lanjut...'
                  : editing
                  ? 'Simpan Perubahan'
                  : 'Simpan'}
              </button>
            </div>
        </Modal>
      )}

      {/* Dialog konfirmasi berada di luar modal form supaya tidak ikut
          terkunci scroll/body yang dikunci Modal. */}
      {rebase.open && (
        <RebaseConfirmDialog
          preview={rebase.preview}
          loading={previewMutation.isPending}
          pending={busy}
          onConfirm={confirmRebase}
          onCancel={cancelRebase}
        />
      )}
    </main>
  );
}
