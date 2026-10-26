import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import SearchInput from '../../components/ui/SearchInput';
import Select from '../../components/ui/Select';
import DateInput from '../../components/ui/DateInput';
import Input from '../../components/ui/Input';
import MoneyInput from '../../components/ui/MoneyInput';
import FormField from '../../components/ui/FormField';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import Badge from '../../components/ui/Badge';
import Money from '../../components/ui/Money';
import { EmptyState } from '../../components/ui/States';
import { formatCurrency, formatDate, formatDateShort, todayInput } from '../../lib/format';

// Sama seperti PaymentsPage: `value` harus sama persis dengan enum di
// database `supplier_payments.method` (cash/transfer/other).
const METODE_OPTIONS = [
  { value: 'cash', label: 'Tunai', icon: 'account_balance_wallet' },
  { value: 'transfer', label: 'Transfer', icon: 'swap_horiz' },
  { value: 'other', label: 'Lainnya', icon: 'description' },
];

function metodeLabel(value) {
  return METODE_OPTIONS.find((m) => m.value === value)?.label || value || '-';
}

const emptyForm = () => ({
  date: todayInput(),
  supplier_id: '',
  purchase_id: '',
  amount: '',
  method: 'cash',
  note: '',
});

export default function SupplierPaymentsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    supplier_id: '',
  });
  const [form, setForm] = useState(emptyForm);
  const [purchaseSearch, setPurchaseSearch] = useState('');

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
    queryFn: async () => (await api.get('/suppliers')).data,
  });

  // Hanya transaksi yang masih punya utang. `has_debt=1` memfilter
  // payable > 0 di server, jadi daftar ini tidak pernah memuat transaksi
  // lunas yang tidak mungkin dilunasi lagi.
  //
  // `per_page` 200 adalah batas server, dan kotak pencarian di bawah menutup
  // sisanya: tanpa pencarian, transaksi urutan ke-201 benar-benar tidak bisa
  // dipilih.
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

  const supplierList = useMemo(() => suppliers?.data || suppliers || [], [suppliers]);
  const fetchedPurchases = useMemo(
    () => purchasesData?.data || purchasesData || [],
    [purchasesData]
  );

  // Dropdown sengaja dibatasi ke transaksi yang masih punya utang, karena
  // listing semua pembelian akan membuat kasir memilih transaksi yang sudah
  // lunas lalu gagal saat disimpan. Tapi konsekuensinya, saat MENGEDIT
  // pembayaran pada transaksi yang kebetulan sudah lunas, transaksi itu
  // tidak ada di daftar - select akan kosong, sisa utangnya tidak terbaca,
  // dan batas nominal jadi nol. Jadi transaksi yang sedang diedit selalu
  // ditambahkan balik, dengan label yang jelas menandai kondisinya.
  const purchaseList = useMemo(() => {
    const list = [...fetchedPurchases];
    if (editItem?.purchase && !list.some((purchase) => purchase.id === editItem.purchase.id)) {
      list.push({
        ...editItem.purchase,
        is_settled: Number(editItem.purchase.payable ?? 0) <= 0,
      });
    }
    return list;
  }, [fetchedPurchases, editItem]);

  const selectedPurchase = purchaseList.find((purchase) => purchase.id === Number(form.purchase_id));

  // Saat menambah pembayaran baru, nominal maksimal adalah sisa utang.
  // Saat MENGEDIT, pembayaran lama sudah mengurangi sisa utang itu, jadi
  // batasnya harus ditambah kembali dengan nominal yang sedang diedit -
  // kalau tidak, user tidak akan bisa menambah nominal pembayaran yang sudah
  // ada tanpa menurunkannya dulu.
  const ownAmount = editItem ? Number(editItem.amount) || 0 : 0;
  const maxAmount = (Number(selectedPurchase?.payable ?? 0) || 0) + ownAmount;

  const payments = useMemo(() => data?.data || data || [], [data]);
  const hasFilter = Boolean(filters.start_date || filters.end_date || filters.supplier_id);

  const summary = useMemo(() => {
    const total = payments.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
    const supplierCount = new Set(payments.map((item) => item.supplier_id)).size;
    return { total, count: payments.length, supplierCount };
  }, [payments]);

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
      closeForm();
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
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['supplier-payments'] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['supplier-debt-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Gagal menghapus pelunasan');
      setDeleteTarget(null);
    },
  });

  function closeForm() {
    setShowForm(false);
    setEditItem(null);
    setForm(emptyForm());
    setPurchaseSearch('');
  }

  function openCreate() {
    setEditItem(null);
    setForm(emptyForm());
    setPurchaseSearch('');
    setShowForm(true);
  }

  function openEdit(item) {
    setEditItem(item);
    setForm({
      date: item.date ? String(item.date).slice(0, 10) : todayInput(),
      supplier_id: item.supplier_id || '',
      purchase_id: item.purchase_id || '',
      amount: Number(item.amount || 0),
      method: item.method || 'cash',
      note: item.note || '',
    });
    setPurchaseSearch('');
    setShowForm(true);
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!form.supplier_id) {
      toast.error('Pilih supplier terlebih dahulu');
      return;
    }
    if (!form.purchase_id) {
      toast.error('Pilih transaksi pembelian terlebih dahulu');
      return;
    }
    const amount = Number(form.amount) || 0;
    if (amount <= 0) {
      toast.error('Nominal harus lebih dari 0');
      return;
    }
    // Penjaga di frontend supaya user dapat pesan langsung; server tetap
    // memvalidasi ulang karena angka di form bisa saja usang.
    if (amount > maxAmount + 0.005) {
      toast.error(`Nominal maksimal adalah ${formatCurrency(maxAmount)}`);
      return;
    }
    mutation.mutate({
      id: editItem?.id,
      date: form.date,
      supplier_id: form.supplier_id,
      purchase_id: form.purchase_id,
      amount,
      method: form.method,
      note: form.note || null,
    });
  }

  // Halaman "Utang Supplier" mengarahkan ke sini dengan ?purchase=<id> agar
  // transaksi yang mau dilunasi langsung terpilih. Parameter itu dibersihkan
  // supaya me-refresh halaman tidak membuka form lagi.
  useEffect(() => {
    const purchaseId = searchParams.get('purchase');
    if (!purchaseId) return;

    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('purchase');
      return next;
    }, { replace: true });

    const fetchPurchase = async () => {
      try {
        const res = await api.get(`/purchases/${purchaseId}`);
        const purchase = res.data;
        setEditItem(null);
        setForm({
          date: todayInput(),
          supplier_id: purchase.supplier_id || '',
          purchase_id: purchase.id,
          amount: '',
          method: 'cash',
          note: '',
        });
        setPurchaseSearch('');
        setShowForm(true);
      } catch {
        toast.error('Transaksi pembelian tidak bisa dimuat');
      }
    };

    fetchPurchase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = [
    {
      key: 'payment_number',
      header: 'No. Pelunasan',
      sortable: true,
      render: (item) => (
        <div className="min-w-0">
          <p className="font-medium text-on-surface truncate">{item.payment_number}</p>
          <p className="text-2xs text-on-surface-variant truncate">{formatDateShort(item.date)}</p>
        </div>
      ),
    },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (item) => (
        <span className="text-on-surface-variant truncate">{item.supplier?.name || '-'}</span>
      ),
    },
    {
      key: 'purchase',
      header: 'Transaksi',
      render: (item) => (
        <span className="text-on-surface-variant truncate">{item.purchase?.purchase_number || '-'}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Nominal',
      align: 'right',
      sortable: true,
      render: (item) => <Money value={item.amount} variant="strong" />,
    },
    {
      key: 'payable',
      header: 'Sisa Utang',
      align: 'right',
      sortable: true,
      sortValue: (item) => Number(item.purchase?.payable ?? 0),
      render: (item) =>
        Number(item.purchase?.payable ?? 0) > 0 ? (
          <Money value={item.purchase.payable} variant="danger" />
        ) : (
          <span className="text-success text-xs font-medium">Lunas</span>
        ),
    },
    {
      key: 'method',
      header: 'Metode',
      render: (item) => (
        <Badge tone="neutral" size="sm" icon={METODE_OPTIONS.find((m) => m.value === item.method)?.icon}>
          {metodeLabel(item.method)}
        </Badge>
      ),
    },
    {
      key: 'aksi',
      header: 'Aksi',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-0.5">
          <IconButton
            icon="edit"
            label={`Edit ${item.payment_number}`}
            size="sm"
            tone="primary"
            onClick={() => openEdit(item)}
          />
          <IconButton
            icon="delete"
            label={`Hapus ${item.payment_number}`}
            size="sm"
            tone="danger"
            onClick={() => setDeleteTarget(item)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pelunasan Utang"
        subtitle="Riwayat pembayaran kepada supplier untuk pembelian yang belum lunas"
        breadcrumbs={[{ label: 'Keuangan', to: '/piutang' }, { label: 'Pelunasan Utang' }]}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              icon="price_change"
              onClick={() => navigate('/utang')}
            >
              Lihat Utang
            </Button>
            <Button icon="add" size="sm" onClick={openCreate}>
              Tambah Pelunasan
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <DateInput
          value={filters.start_date}
          onChange={(value) => setFilters((f) => ({ ...f, start_date: value }))}
          aria-label="Tanggal mulai"
          placeholder="Mulai"
        />
        <DateInput
          value={filters.end_date}
          onChange={(value) => setFilters((f) => ({ ...f, end_date: value }))}
          aria-label="Tanggal akhir"
          placeholder="Akhir"
        />
        <Select
          value={filters.supplier_id}
          onChange={(event) => setFilters((f) => ({ ...f, supplier_id: event.target.value }))}
          aria-label="Filter supplier"
        >
          <option value="">Semua supplier</option>
          {supplierList.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </Select>
      </div>

      {summary.count > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest px-3.5 py-3">
            <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Total Dibayar</p>
            <Money value={summary.total} variant="strong" className="text-base mt-1 block" />
          </div>
          <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest px-3.5 py-3">
            <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Pelunasan</p>
            <p className="text-base font-semibold text-on-surface mt-1">{summary.count}</p>
          </div>
          <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest px-3.5 py-3">
            <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Supplier</p>
            <p className="text-base font-semibold text-on-surface mt-1">{summary.supplierCount}</p>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={payments}
        rowKey={(row) => row.id}
        loading={isLoading}
        minWidth="900px"
        emptyState={
          isError ? (
            <div role="alert" className="py-6 text-center">
              <p className="text-sm font-medium text-danger">Gagal memuat pelunasan</p>
              <p className="text-xs text-on-surface-variant mt-1">
                {error?.response?.status
                  ? `Server merespons dengan kesalahan (${error.response.status}).`
                  : 'Periksa koneksi internet Anda lalu coba lagi.'}
              </p>
              <Button size="sm" variant="outline" icon="refresh" className="mt-3" onClick={() => refetch()}>
                Coba Lagi
              </Button>
            </div>
          ) : (
            <EmptyState
              icon="handshake"
              title={hasFilter ? 'Pelunasan tidak ditemukan' : 'Belum ada pelunasan'}
              description={
                hasFilter
                  ? 'Coba ubah atau kosongkan filter tanggal dan supplier.'
                  : 'Catatan pembayaran ke supplier akan muncul di sini.'
              }
              action={
                <Button size="sm" icon="add" onClick={openCreate}>
                  Tambah Pelunasan
                </Button>
              }
            />
          )
        }
        cardTitle={(item) => item.payment_number}
        cardMeta={(item) => `${item.supplier?.name || '-'} · ${formatDate(item.date)}`}
        cardBadge={(item) => <Money value={item.amount} variant="strong" />}
        cardFields={[
          { label: 'Transaksi', render: (item) => item.purchase?.purchase_number || '-' },
          { label: 'Metode', render: (item) => metodeLabel(item.method) },
          {
            label: 'Sisa Utang',
            render: (item) =>
              Number(item.purchase?.payable ?? 0) > 0 ? (
                <Money value={item.purchase.payable} variant="danger" />
              ) : (
                <span className="text-success text-xs font-medium">Lunas</span>
              ),
          },
        ]}
        cardActions={(item) => (
          <>
            <button
              type="button"
              onClick={() => openEdit(item)}
              className="flex-1 py-3 text-xs font-medium text-primary hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                edit
              </span>
              Edit
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(item)}
              className="flex-1 py-3 text-xs font-medium text-danger hover:bg-danger-container transition-colors flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                delete
              </span>
              Hapus
            </button>
          </>
        )}
      />

      {showForm && (
        <Modal
          onClose={closeForm}
          title={editItem ? 'Edit Pelunasan' : 'Tambah Pelunasan'}
          subtitle="Pembayaran dicatat terhadap satu transaksi pembelian"
          variant="sheet"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={closeForm}>
                Batal
              </Button>
              <Button size="sm" onClick={handleSubmit} loading={mutation.isPending}>
                Simpan
              </Button>
            </>
          }
        >
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <FormField label="Tanggal" required>
              <DateInput
                value={form.date}
                onChange={(value) => setForm({ ...form, date: value })}
                required
              />
            </FormField>

            <FormField
              label="Supplier"
              required
              hint={
                editItem
                  ? 'Supplier tidak bisa diubah. Hapus pelunasan ini lalu buat yang baru jika salah supplier.'
                  : undefined
              }
            >
              <Select
                value={form.supplier_id}
                onChange={(event) => {
                  setForm({ ...form, supplier_id: event.target.value, purchase_id: '', amount: '' });
                  setPurchaseSearch('');
                }}
                disabled={Boolean(editItem)}
                required
              >
                <option value="">Pilih supplier</option>
                {supplierList.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField
              label="Transaksi pembelian"
              required
              hint={
                !form.supplier_id
                  ? 'Pilih supplier dulu untuk melihat transaksi yang masih berutang.'
                  : purchaseList.length === 0 && !isLoadingPurchases
                    ? purchaseSearch.trim()
                      ? 'Tidak ada transaksi yang cocok dengan pencarian itu.'
                      : 'Semua transaksi dari supplier ini sudah lunas.'
                    : undefined
              }
            >
              <Select
                value={form.purchase_id}
                onChange={(event) => setForm({ ...form, purchase_id: event.target.value, amount: '' })}
                disabled={!form.supplier_id}
                required
              >
                <option value="">
                  {form.supplier_id ? 'Pilih transaksi' : 'Pilih supplier terlebih dahulu'}
                </option>
                {purchaseList.map((purchase) => (
                  <option key={purchase.id} value={purchase.id}>
                    {purchase.purchase_number} — sisa {formatCurrency(purchase.payable)}
                    {purchase.is_settled ? ' (sudah lunas)' : ''}
                  </option>
                ))}
              </Select>
              {form.supplier_id && (
                <div className="mt-2">
                  <SearchInput
                    value={purchaseSearch}
                    onChange={setPurchaseSearch}
                    placeholder="Cari nomor transaksi…"
                    aria-label="Cari nomor transaksi pembelian"
                  />
                </div>
              )}
            </FormField>

            {selectedPurchase && (
              <div className="rounded-field bg-surface-container px-3.5 py-3 flex items-center justify-between">
                <span className="text-xs text-on-surface-variant">Sisa utang transaksi ini</span>
                <Money value={selectedPurchase.payable} variant="strong" className="text-sm" />
              </div>
            )}

            <FormField
              label="Nominal"
              required
              hint={selectedPurchase ? `Maksimal ${formatCurrency(maxAmount)}` : undefined}
            >
              <MoneyInput
                value={form.amount}
                onChange={(value) => setForm({ ...form, amount: value })}
                disabled={!form.purchase_id}
              />
            </FormField>

            <FormField label="Metode pembayaran" required>
              <div className="grid grid-cols-3 gap-2">
                {METODE_OPTIONS.map((method) => (
                  <button
                    key={method.value}
                    type="button"
                    onClick={() => setForm({ ...form, method: method.value })}
                    aria-pressed={form.method === method.value}
                    className={`flex items-center justify-center gap-1.5 h-11 rounded-field text-xs font-semibold transition-colors ${
                      form.method === method.value
                        ? 'bg-primary text-on-primary'
                        : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base" aria-hidden="true">
                      {method.icon}
                    </span>
                    {method.label}
                  </button>
                ))}
              </div>
            </FormField>

            <FormField label="Catatan">
              <Input
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
                placeholder="Catatan opsional"
              />
            </FormField>
          </form>
        </Modal>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        title="Hapus pelunasan?"
        message={`Pelunasan ${deleteTarget?.payment_number ?? ''} sebesar ${formatCurrency(deleteTarget?.amount ?? 0)} akan dihapus.`}
        detail={`Sisa utang transaksi ${deleteTarget?.purchase?.purchase_number ?? ''} bertambah kembali.`}
        confirmLabel="Hapus"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
