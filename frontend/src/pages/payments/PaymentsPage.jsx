import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatCurrency, formatDate } from '../../utils/format';
import api from '../../services/api';
import { toast } from 'sonner';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import ResponsiveTable from '../../components/ui/ResponsiveTable';
import Modal from '../../components/ui/Modal';

// `value` WAJIB sama dengan enum di database (cash/transfer/other), bukan
// label Bahasa Indonesia. Column `method` di tabel `payments` dienum
// 'cash','transfer','other' dan PaymentController memvalidasi
// 'in:cash,transfer,other'. Kalau `value` diisi label Bahasa Indonesia
// ('tunai'/'lainnya'), setiap penyimpanan pembayaran ditolak 422 dan
// halaman ini praktis tidak bisa dipakai sama sekali - frontend tidak
// mengedit nilainya, jadi perbedaan dari enum selalu berarti 422.
const metodeOptions = [
  { value: 'cash', label: 'Tunai', icon: 'account_balance_wallet' },
  { value: 'transfer', label: 'Transfer', icon: 'swap_horiz' },
  { value: 'other', label: 'Lainnya', icon: 'description' },
];

// Nilai database ditampilkan lewat labelnya. Tanpa ini kolom Metode
// menampilkan "cash" dan "other" mentah ke user.
function metodeLabel(value) {
  return metodeOptions.find((m) => m.value === value)?.label || value || '-';
}

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
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
    method: 'cash',
    notes: '',
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
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

  // Tanpa `per_page`, dropdown ini hanya menampilkan 15 penjualan pertama -
  // penjualan yang lebih lama jadi tidak bisa dipilih padahal piutangnya
  // masih ada. 200 adalah batas server; kotak pencarian menutup sisanya.
  const [saleSearch, setSaleSearch] = useState('');
  const { data: salesData } = useQuery({
    queryKey: ['unpaid-sales', form.customer_id, saleSearch],
    queryFn: async () => {
      if (!form.customer_id) return { data: [] };
      const res = await api.get('/sales', {
        params: {
          customer_id: form.customer_id,
          payment_status: 'unpaid_or_partial',
          per_page: 200,
          ...(saleSearch.trim() ? { search: saleSearch.trim() } : {}),
        },
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
  const hasFilter = !!(filters.start_date || filters.end_date || filters.customer_id);

  const mutation = useMutation({
    mutationFn: async (data) => {
      if (data.id) {
        const res = await api.put(`/payments/${data.id}`, data);
        return res.data;
      }
      const res = await api.post('/payments', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success(editItem ? 'Pembayaran berhasil diperbarui' : 'Pembayaran berhasil disimpan');
      setShowForm(false);
      setEditItem(null);
      setForm({
        date: new Date().toISOString().split('T')[0],
        customer_id: '',
        sale_id: '',
        amount: '',
        method: 'cash',
        notes: '',
      });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Gagal menyimpan pembayaran');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const res = await api.delete(`/payments/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Pembayaran berhasil dihapus');
      setDeleteConfirm(null);
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Gagal menghapus pembayaran');
    },
  });

  const closeForm = () => {
    setShowForm(false);
    setEditItem(null);
  };

  const openCreate = () => {
    setEditItem(null);
    setForm({ date: new Date().toISOString().split('T')[0], customer_id: '', sale_id: '', amount: '', method: 'cash', notes: '' });
    setShowForm(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({
      date: item.date?.split('T')[0] || item.date,
      customer_id: item.customer_id || '',
      sale_id: item.sale_id || '',
      amount: String(item.amount || ''),
      method: item.method || 'cash',
      notes: item.note || '',
    });
    setShowForm(true);
  };

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
    const amt = Number(form.amount) || 0;
    if (amt <= 0) {
      toast.error('Nominal harus lebih dari 0');
      return;
    }
    if (!editItem && amt > maxAmount) {
      toast.error(`Nominal maksimal adalah ${formatCurrency(maxAmount)}`);
      return;
    }
    mutation.mutate({ ...form, id: editItem?.id, amount: amt });
  };

  return (
    <main className="px-4 py-6 max-w-4xl mx-auto space-y-4">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-primary">Pembayaran</h2>
        <p className="text-sm text-on-surface-variant mt-1">Daftar pembayaran masuk</p>
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
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="toko-3">Toko</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">store</span>
              <select
                id="toko-3"
                value={filters.customer_id}
                onChange={(e) => setFilters((f) => ({ ...f, customer_id: e.target.value }))}
                className="w-full h-10 pl-11 pr-3 bg-surface text-on-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition appearance-none"
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

      {isLoading ? (
        <div className="bg-surface rounded-xl border border-surface-container-high p-4">
          <LoadingState rows={4} />
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} title="Gagal memuat pembayaran" />
      ) : (
        <ResponsiveTable
          label="Daftar pembayaran"
          rows={payments}
          cellClass="px-4 py-3"
          theadClass=""
          tbodyClass="divide-y divide-surface-container-high"
          rowClass="hover:bg-surface-container-low transition-colors"
          emptyState={
            <EmptyState
              icon="payments"
              title={hasFilter ? 'Tidak ada pembayaran yang cocok' : 'Belum ada pembayaran'}
              description={
                hasFilter
                  ? 'Coba ubah atau kosongkan filter tanggal dan toko.'
                  : 'Catatan pembayaran piutang pelanggan akan muncul di sini.'
              }
            />
          }
          columns={[
            { key: 'no', header: 'No', render: (item, idx) => idx + 1, cellClass: 'text-on-surface-variant' },
            { key: 'no_pay', header: 'No Pembayaran', render: (item) => item.payment_number, cellClass: 'font-medium text-on-surface' },
            { key: 'tanggal', header: 'Tanggal', render: (item) => formatDate(item.date), cellClass: 'text-on-surface-variant' },
            { key: 'toko', header: 'Toko', render: (item) => item.customer?.name || '-', cellClass: 'text-on-surface-variant' },
            { key: 'trx', header: 'Transaksi', render: (item) => item.sale?.sale_number || '-', cellClass: 'text-on-surface-variant' },
            { key: 'nominal', header: 'Nominal', align: 'right', render: (item) => formatCurrency(item.amount), cellClass: 'font-medium text-on-surface tabular-nums' },
            {
              key: 'metode', header: 'Metode',
              render: (item) => (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-surface-container-high text-on-surface-variant capitalize">
                  <span className="material-symbols-outlined text-sm">{metodeOptions.find((m) => m.value === item.method)?.icon || 'help'}</span>
                  {metodeLabel(item.method)}
                </span>
              ),
            },
            {
              key: 'aksi', header: 'Aksi', align: 'center',
              render: (item) => (
                <div className="flex items-center justify-center gap-1">
                  <button onClick={() => openEdit(item)} className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:bg-surface-variant hover:text-primary transition-colors" title="Edit">
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                  <button onClick={() => setDeleteConfirm(item)} className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:bg-error-container hover:text-error transition-colors" title="Hapus">
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              ),
            },
          ]}
          cardTitle={(item) => item.payment_number}
          cardMeta={(item) => `${item.customer?.name || '-'} · ${formatDate(item.date)}`}
          cardBadge={(item) => (
            <span className="text-sm font-bold text-on-surface tabular-nums">{formatCurrency(item.amount)}</span>
          )}
          cardFields={[
            { label: 'Transaksi', render: (item) => item.sale?.sale_number || '-' },
            { label: 'Metode', render: (item) => <span className="capitalize">{metodeLabel(item.method)}</span> },
          ]}
          cardActions={(item) => (
            <>
              <button onClick={() => openEdit(item)} className="flex-1 py-2.5 text-xs font-medium text-primary hover:bg-surface-container-high transition-colors flex items-center justify-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">edit</span> Edit
              </button>
              <button onClick={() => setDeleteConfirm(item)} className="flex-1 py-2.5 text-xs font-medium text-error hover:bg-error-container transition-colors flex items-center justify-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">delete</span> Hapus
              </button>
            </>
          )}
        />
      )}

      <button
        onClick={openCreate}
        className="fixed bottom-24 right-4 md:bottom-8 md:right-8 w-14 h-14 bg-primary text-on-primary rounded-2xl shadow-[0_8px_12px_-4px_rgba(0,0,0,0.1)] flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-40"
      >
        <span className="material-symbols-outlined text-[28px]">add</span>
      </button>

      {showForm && (
        <Modal onClose={closeForm} title="Form pembayaran" variant="sheet" zIndex={60} panelClassName="bg-surface w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[85vh]" initialFocus='input, select, textarea'>
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <h3 className="text-on-surface text-lg font-semibold">{editItem ? 'Edit Pembayaran' : 'Tambah Pembayaran'}</h3>
              <button onClick={closeForm} className="p-2 rounded-xl text-outline hover:bg-surface-container-high transition-colors">
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
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="toko-5">Toko</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">store</span>
                    <select
                      id="toko-5"
                      value={form.customer_id}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, customer_id: e.target.value, sale_id: '' }));
                        setSaleSearch('');
                      }}
                      className="w-full h-12 pl-11 pr-3 bg-surface text-on-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition appearance-none"
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
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="transaksi-6">Transaksi</label>
                  <select
                    id="transaksi-6"
                    value={form.sale_id}
                    onChange={(e) => setForm((f) => ({ ...f, sale_id: e.target.value, amount: '' }))}
                    className="w-full h-12 px-4 bg-surface text-on-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition appearance-none"
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
                    <p className="text-xs text-on-surface-variant mt-1">Pilih toko terlebih dahulu</p>
                  )}
                  <input
                    type="search"
                    value={saleSearch}
                    onChange={(e) => setSaleSearch(e.target.value)}
                    placeholder="Cari nomor transaksi..."
                    aria-label="Cari nomor transaksi penjualan"
                    className="w-full h-10 px-3 mt-2 bg-surface text-on-surface rounded-lg border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition placeholder:text-outline"
                  />
                  {form.customer_id && saleList.length === 0 && (
                    <p className="text-xs text-on-surface-variant mt-1">
                      {saleSearch.trim()
                        ? 'Tidak ada transaksi yang cocok dengan pencarian itu.'
                        : 'Semua transaksi dari toko ini sudah lunas.'}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="nominal-7">Nominal (Rp)</label>
                  <input
                    id="nominal-7"
                    type="number"
                    min="1"
                    max={maxAmount || undefined}
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    className="w-full h-12 px-4 bg-surface text-on-surface placeholder-outline rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Metode Pembayaran</label>
                  <div className="grid grid-cols-3 gap-2">
                    {metodeOptions.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, method: m.value }))}
                        className={`flex items-center justify-center gap-1.5 h-12 rounded-xl text-xs font-semibold transition-colors ${
                          form.method === m.value
                            ? 'bg-primary text-on-primary'
                            : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
                        }`}
                      >
                        <span className="material-symbols-outlined text-base">{m.icon}</span>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="catatan-8">Catatan</label>
                  <textarea
                    id="catatan-8"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    className="w-full px-4 py-3 bg-surface text-on-surface placeholder-outline rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition resize-none"
                    rows={2}
                    placeholder="Catatan opsional..."
                  />
                </div>
              </div>
            <div className="shrink-0 bg-surface border-t border-outline-variant/30 px-6 py-3 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeForm}
                className="h-10 px-5 text-sm font-medium text-primary bg-transparent hover:bg-primary/10 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="h-10 px-5 text-sm font-medium text-on-primary bg-primary hover:bg-primary/90 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-base">credit_card</span>
                {mutation.isPending ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
            </form>
        </Modal>
      )}

      {deleteConfirm && (
        <Modal onClose={() => setDeleteConfirm(null)} title="Konfirmasi hapus pembayaran" variant="center" zIndex={70} panelClassName="bg-surface rounded-xl shadow-xl w-full max-w-sm p-6 mx-4">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-error text-2xl">delete</span>
              <h3 className="text-lg font-bold text-on-surface">Hapus Pembayaran?</h3>
            </div>
            <p className="text-sm text-on-surface-variant mb-6">
              Pembayaran <strong>{deleteConfirm.payment_number}</strong> akan dihapus. Piutang pelanggan akan disesuaikan.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 rounded-xl border border-outline-variant text-on-surface text-sm font-medium hover:bg-surface-container-high transition-colors">Batal</button>
              <button onClick={() => deleteMutation.mutate(deleteConfirm.id)} disabled={deleteMutation.isPending} className="px-4 py-2 rounded-xl bg-error text-on-error text-sm font-medium hover:bg-error/90 transition-colors disabled:opacity-50">
                {deleteMutation.isPending ? 'Menghapus...' : 'Hapus'}
              </button>
            </div>
        </Modal>
      )}
    </main>
  );
}
