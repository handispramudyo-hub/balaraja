import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatCurrency, formatDate } from '../../utils/format';
import api from '../../services/api';
import { toast } from 'sonner';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import ResponsiveTable from '../../components/ui/ResponsiveTable';
import Modal from '../../components/ui/Modal';

// Sama seperti PaymentsPage: `value` harus sama persis dengan enum di
// database `supplier_payments.method` (cash/transfer/other).
const metodeOptions = [
  { value: 'cash', label: 'Tunai', icon: 'account_balance_wallet' },
  { value: 'transfer', label: 'Transfer', icon: 'swap_horiz' },
  { value: 'other', label: 'Lainnya', icon: 'description' },
];

function metodeLabel(value) {
  return metodeOptions.find((m) => m.value === value)?.label || value || '-';
}

const today = () => new Date().toISOString().split('T')[0];

const emptyForm = () => ({
  date: today(),
  supplier_id: '',
  purchase_id: '',
  amount: '',
  method: 'cash',
  note: '',
});

export default function SupplierPaymentsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    supplier_id: '',
  });
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['supplier-payments', filters],
    queryFn: async () => {
      const params = {};
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      if (filters.supplier_id) params.supplier_id = filters.supplier_id;
      const res = await api.get('/supplier-payments', { params });
      return res.data;
    },
  });

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const res = await api.get('/suppliers');
      return res.data;
    },
  });

  // Hanya transaksi yang masih punya utang. `has_debt=1` memfilter
  // payable > 0 di server, jadi daftar ini tidak pernah memuat transaksi
  // lunas yang tidak mungkin dilunasi lagi.
  //
  // `per_page` 200 adalah batas server, dan kotak pencarian di bawah menutup
  // sisanya: tanpa pencarian, transaksi urutan ke-201 benar-benar tidak bisa
  // dipilih.
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const { data: purchasesData, isFetching: isLoadingPurchases } = useQuery({
    queryKey: ['supplier-debt-purchases', form.supplier_id, purchaseSearch],
    queryFn: async () => {
      const res = await api.get('/purchases', {
        params: {
          supplier_id: form.supplier_id,
          has_debt: 1,
          per_page: 200,
          ...(purchaseSearch.trim() ? { search: purchaseSearch.trim() } : {}),
        },
      });
      return res.data;
    },
    enabled: !!form.supplier_id,
  });

  const supplierList = suppliers?.data || suppliers || [];
  const fetchedPurchases = purchasesData?.data || purchasesData || [];

  // Dropdown sengaja dibatasi ke transaksi yang masih punya utang, karena
  // listing semua pembelian akan membuat kasir memilih transaksi yang sudah
  // lunas lalu gagal saat disimpan. Tapi konsekuensinya, saat MENGEDIT
  // pembayaran pada transaksi yang kebetulan sudah lunas, transaksi itu
  // tidak ada di daftar - select akan kosong, sisa utangnya tidak terbaca,
  // dan batas nominal jadi nol. Jadi transaksi yang sedang diedit selalu
  // ditambahkan balik, dengan label yang jelas menandai kondisinya.
  const purchaseList = [...fetchedPurchases];
  if (editItem?.purchase && !fetchedPurchases.some((p) => p.id === editItem.purchase.id)) {
    const payable = Number(editItem.purchase.payable ?? 0);
    purchaseList.push({
      ...editItem.purchase,
      is_settled: payable <= 0,
    });
  }
  const selectedPurchase = purchaseList.find((p) => p.id === Number(form.purchase_id));

  // Saat menambah pembayaran baru, nominal maksimal adalah sisa utang.
  // Saat MENGEDIT, pembayaran lama sudah mengurangi sisa utang itu, jadi
  // batasnya harus ditambah kembali dengan nominal yang sedang diedit -
  // kalau tidak, user tidak akan bisa menambah nominal pembayaran yang sudah
  // ada tanpa menurunkannya dulu.
  const ownAmount = editItem ? Number(editItem.amount) || 0 : 0;
  const maxAmount = (selectedPurchase?.payable ?? 0) + ownAmount;

  const payments = data?.data || data || [];
  const hasFilter = !!(filters.start_date || filters.end_date || filters.supplier_id);

  const mutation = useMutation({
    mutationFn: async (payload) => {
      if (payload.id) {
        const res = await api.put(`/supplier-payments/${payload.id}`, payload);
        return res.data;
      }
      const res = await api.post('/supplier-payments', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success(editItem ? 'Pelunasan berhasil diperbarui' : 'Pelunasan berhasil disimpan');
      setShowForm(false);
      setEditItem(null);
      setForm(emptyForm());
      // Sisa utang ada di purchases DAN di kartu supplier, jadi keduanya
      // harus disegarkan. Kalau tidak, daftar pelunasan yang baru saja
      // diperbarui masih menampilkan sisa utang lama.
      queryClient.invalidateQueries({ queryKey: ['supplier-payments'] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['supplier-debt-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
    onError: (err) => {
      const fields = err.response?.data?.errors;
      const firstField = fields ? Object.values(fields)[0]?.[0] : null;
      toast.error(firstField || err.response?.data?.message || 'Gagal menyimpan pelunasan');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const res = await api.delete(`/supplier-payments/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Pelunasan berhasil dihapus');
      setDeleteConfirm(null);
      queryClient.invalidateQueries({ queryKey: ['supplier-payments'] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['supplier-debt-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Gagal menghapus pelunasan');
    },
  });

  const closeForm = () => {
    setShowForm(false);
    setEditItem(null);
  };

  const openCreate = () => {
    setEditItem(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({
      date: item.date?.split('T')[0] || item.date,
      supplier_id: item.supplier_id || '',
      purchase_id: item.purchase_id || '',
      amount: String(item.amount || ''),
      method: item.method || 'cash',
      note: item.note || '',
    });
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.supplier_id) {
      toast.error('Pilih supplier terlebih dahulu');
      return;
    }
    if (!form.purchase_id) {
      toast.error('Pilih transaksi pembelian terlebih dahulu');
      return;
    }
    const amt = Number(form.amount) || 0;
    if (amt <= 0) {
      toast.error('Nominal harus lebih dari 0');
      return;
    }
    // Penjaga di frontend supaya user dapat pesan langsung; server tetap
    // memvalidasi ulang karena angka di form bisa saja usang.
    if (amt > maxAmount + 0.005) {
      toast.error(`Nominal maksimal adalah ${formatCurrency(maxAmount)}`);
      return;
    }
    mutation.mutate({ ...form, id: editItem?.id, amount: amt });
  };

  return (
    <main className="px-4 py-6 max-w-4xl mx-auto space-y-4">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-primary">Pelunasan Utang</h2>
        <p className="text-sm text-on-surface-variant mt-1">Pembayaran ke supplier untuk pembelian yang belum lunas</p>
      </div>

      <div className="bg-surface-container-lowest p-3 rounded-xl shadow-sm border border-outline-variant/30 flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="sp-mulai">Tanggal Mulai</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">calendar_today</span>
              <input
                id="sp-mulai"
                type="date"
                value={filters.start_date}
                onChange={(e) => setFilters((f) => ({ ...f, start_date: e.target.value }))}
                className="w-full h-10 pl-11 pr-3 bg-surface text-on-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="sp-akhir">Tanggal Akhir</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">calendar_today</span>
              <input
                id="sp-akhir"
                type="date"
                value={filters.end_date}
                onChange={(e) => setFilters((f) => ({ ...f, end_date: e.target.value }))}
                className="w-full h-10 pl-11 pr-3 bg-surface text-on-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="sp-supplier">Supplier</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">local_shipping</span>
              <select
                id="sp-supplier"
                value={filters.supplier_id}
                onChange={(e) => setFilters((f) => ({ ...f, supplier_id: e.target.value }))}
                className="w-full h-10 pl-11 pr-3 bg-surface text-on-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition appearance-none"
              >
                <option value="">Semua Supplier</option>
                {supplierList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
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
        <ErrorState error={error} onRetry={() => refetch()} title="Gagal memuat pelunasan" />
      ) : (
        <ResponsiveTable
          label="Daftar pelunasan utang supplier"
          rows={payments}
          cellClass="px-4 py-3"
          theadClass=""
          tbodyClass="divide-y divide-surface-container-high"
          rowClass="hover:bg-surface-container-low transition-colors"
          emptyState={
            <EmptyState
              icon="local_shipping"
              title={hasFilter ? 'Tidak ada pelunasan yang cocok' : 'Belum ada pelunasan'}
              description={
                hasFilter
                  ? 'Coba ubah atau kosongkan filter tanggal dan supplier.'
                  : 'Catatan pembayaran ke supplier akan muncul di sini.'
              }
            />
          }
          columns={[
            { key: 'no', header: 'No', render: (item, idx) => idx + 1, cellClass: 'text-on-surface-variant' },
            { key: 'no_pay', header: 'No Pelunasan', render: (item) => item.payment_number, cellClass: 'font-medium text-on-surface' },
            { key: 'tanggal', header: 'Tanggal', render: (item) => formatDate(item.date), cellClass: 'text-on-surface-variant' },
            { key: 'supplier', header: 'Supplier', render: (item) => item.supplier?.name || '-', cellClass: 'text-on-surface-variant' },
            { key: 'trx', header: 'Transaksi', render: (item) => item.purchase?.purchase_number || '-', cellClass: 'text-on-surface-variant' },
            { key: 'nominal', header: 'Nominal', align: 'right', render: (item) => formatCurrency(item.amount), cellClass: 'font-medium text-on-surface tabular-nums' },
            {
              key: 'sisa', header: 'Sisa Utang', align: 'right',
              render: (item) => (
                <span className={`tabular-nums ${Number(item.purchase?.payable) > 0 ? 'text-error font-medium' : 'text-success'}`}>
                  {formatCurrency(item.purchase?.payable ?? 0)}
                </span>
              ),
            },
            {
              key: 'metode', header: 'Metode',
              render: (item) => (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-surface-container-high text-on-surface-variant">
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
          cardMeta={(item) => `${item.supplier?.name || '-'} · ${formatDate(item.date)}`}
          cardBadge={(item) => (
            <span className="text-sm font-bold text-on-surface tabular-nums">{formatCurrency(item.amount)}</span>
          )}
          cardFields={[
            { label: 'Transaksi', render: (item) => item.purchase?.purchase_number || '-' },
            { label: 'Metode', render: (item) => <span>{metodeLabel(item.method)}</span> },
            {
              label: 'Sisa Utang',
              render: (item) => (
                <span className={Number(item.purchase?.payable) > 0 ? 'text-error font-medium tabular-nums' : 'text-success tabular-nums'}>
                  {formatCurrency(item.purchase?.payable ?? 0)}
                </span>
              ),
            },
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
        title="Tambah pelunasan"
      >
        <span className="material-symbols-outlined text-[28px]">add</span>
      </button>

      {showForm && (
        <Modal onClose={closeForm} title="Form pelunasan utang" variant="sheet" zIndex={60} panelClassName="bg-surface w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[85vh]" initialFocus='input, select, textarea'>
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <h3 className="text-on-surface text-lg font-semibold">{editItem ? 'Edit Pelunasan' : 'Tambah Pelunasan'}</h3>
              <button onClick={closeForm} className="p-2 rounded-xl text-outline hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1 overflow-hidden">
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="sp-tanggal">Tanggal</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">calendar_today</span>
                    <input
                      id="sp-tanggal"
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                      className="w-full h-12 pl-11 pr-3 bg-surface text-on-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="sp-form-supplier">Supplier</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">local_shipping</span>
                    <select
                      id="sp-form-supplier"
                      value={form.supplier_id}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, supplier_id: e.target.value, purchase_id: '', amount: '' }));
                        setPurchaseSearch('');
                      }}
                      className="w-full h-12 pl-11 pr-3 bg-surface text-on-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition appearance-none"
                      required
                      disabled={!!editItem}
                    >
                      <option value="">Pilih Supplier</option>
                      {supplierList.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  {editItem && (
                    <p className="text-xs text-on-surface-variant mt-1">
                      Supplier tidak bisa diubah. Hapus pelunasan ini lalu buat yang baru jika salah supplier.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="sp-trx">Transaksi Pembelian</label>
                  <select
                    id="sp-trx"
                    value={form.purchase_id}
                    onChange={(e) => setForm((f) => ({ ...f, purchase_id: e.target.value, amount: '' }))}
                    className="w-full h-12 px-4 bg-surface text-on-surface rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition appearance-none"
                    required
                    disabled={!form.supplier_id}
                  >
                    <option value="">
                      {form.supplier_id
                        ? 'Pilih Transaksi'
                        : 'Pilih supplier terlebih dahulu'}
                    </option>
                    {purchaseList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.purchase_number} — sisa {formatCurrency(p.payable)}
                        {p.is_settled ? ' (sudah lunas)' : ''}
                      </option>
                    ))}
                  </select>
                  <input
                    type="search"
                    value={purchaseSearch}
                    onChange={(e) => setPurchaseSearch(e.target.value)}
                    placeholder="Cari nomor transaksi..."
                    aria-label="Cari nomor transaksi pembelian"
                    className="w-full h-10 px-3 mt-2 bg-surface text-on-surface rounded-lg border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition placeholder:text-outline"
                  />
                  {form.supplier_id && !isLoadingPurchases && purchaseList.length === 0 && (
                    <p className="text-xs text-on-surface-variant mt-1">
                      {purchaseSearch.trim()
                        ? 'Tidak ada transaksi yang cocok dengan pencarian itu.'
                        : 'Semua transaksi dari supplier ini sudah lunas.'}
                    </p>
                  )}
                  {selectedPurchase?.is_settled && (
                    <p className="text-xs text-warning mt-1">
                      Transaksi ini sudah lunas. Nominal hanya bisa dikurangi atau tetap,
                      tidak boleh ditambah.
                    </p>
                  )}
                </div>
                {selectedPurchase && (
                  <div className="bg-surface-container-low rounded-xl px-4 py-3 flex items-center justify-between">
                    <span className="text-xs text-on-surface-variant">Sisa utang transaksi ini</span>
                    <span className="text-sm font-semibold text-on-surface tabular-nums">
                      {formatCurrency(selectedPurchase.payable)}
                    </span>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="sp-nominal">Nominal (Rp)</label>
                  <input
                    id="sp-nominal"
                    type="number"
                    min="1"
                    step="0.01"
                    max={maxAmount || undefined}
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    className="w-full h-12 px-4 bg-surface text-on-surface placeholder-outline rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition"
                    required
                  />
                  {selectedPurchase && (
                    <p className="text-xs text-on-surface-variant mt-1">
                      Maksimal {formatCurrency(maxAmount)}
                    </p>
                  )}
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
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5" htmlFor="sp-catatan">Catatan</label>
                  <textarea
                    id="sp-catatan"
                    value={form.note}
                    onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
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
        <Modal onClose={() => setDeleteConfirm(null)} title="Konfirmasi hapus pelunasan" variant="center" zIndex={70} panelClassName="bg-surface rounded-xl shadow-xl w-full max-w-sm p-6 mx-4">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-error text-2xl">delete</span>
              <h3 className="text-lg font-bold text-on-surface">Hapus Pelunasan?</h3>
            </div>
            <p className="text-sm text-on-surface-variant mb-6">
              Pelunasan <strong>{deleteConfirm.payment_number}</strong> sebesar{' '}
              <strong>{formatCurrency(deleteConfirm.amount)}</strong> akan dihapus dan sisa utang{' '}
              {deleteConfirm.purchase?.purchase_number} bertambah kembali.
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
