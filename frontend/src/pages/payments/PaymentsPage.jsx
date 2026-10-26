import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

// `value` WAJIB sama dengan enum di database (cash/transfer/other), bukan
// label Bahasa Indonesia. Kolom `method` di tabel `payments` dienum
// 'cash','transfer','other' dan PaymentController memvalidasi
// 'in:cash,transfer,other'. Kalau `value` diisi label Bahasa Indonesia
// ('tunai'/'lainnya'), setiap penyimpanan pembayaran ditolak 422 dan
// halaman ini praktis tidak bisa dipakai sama sekali.
const METODE_OPTIONS = [
  { value: 'cash', label: 'Tunai', icon: 'account_balance_wallet' },
  { value: 'transfer', label: 'Transfer', icon: 'swap_horiz' },
  { value: 'other', label: 'Lainnya', icon: 'description' },
];

function metodeLabel(value) {
  return METODE_OPTIONS.find((m) => m.value === value)?.label || value || '-';
}

const initialForm = {
  date: todayInput(),
  customer_id: '',
  sale_id: '',
  amount: '',
  method: 'cash',
  note: '',
};

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    customer_id: '',
  });
  const [form, setForm] = useState(initialForm);
  const [saleSearch, setSaleSearch] = useState('');

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
    queryFn: async () => (await api.get('/customers')).data,
  });

  // Tanpa `per_page`, dropdown ini hanya menampilkan 15 penjualan pertama -
  // penjualan yang lebih lama jadi tidak bisa dipilih padahal piutangnya
  // masih ada. 200 adalah batas server; kotak pencarian menutup sisanya.
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

  const customerList = useMemo(() => customers?.data || customers || [], [customers]);
  const saleList = useMemo(() => salesData?.data || salesData || [], [salesData]);

  // Saat edit, transaksinya bisa saja sudah lunas, jadi tidak muncul di
  // daftar "belum lunas". Tanpa ambil satu baris itu, dropdown yang sedang
  // dipakai tidak punya pilihan terpilih dan nominal maksimum kosong.
  const { data: editingSale } = useQuery({
    queryKey: ['payment-sale', editing?.sale_id],
    queryFn: async () => {
      if (!editing?.sale_id) return null;
      const res = await api.get(`/sales/${editing.sale_id}`);
      return res.data;
    },
    enabled: Boolean(editing?.sale_id),
  });

  const saleOptions = useMemo(() => {
    if (!editingSale) return saleList;
    if (saleList.some((sale) => sale.id === editingSale.id)) return saleList;
    return [editingSale, ...saleList];
  }, [saleList, editingSale]);

  const selectedSale = saleOptions.find((sale) => sale.id === Number(form.sale_id));
  const maxAmount = Number(selectedSale?.remaining_balance ?? selectedSale?.receivable ?? 0);

  const payments = useMemo(() => data?.data || data || [], [data]);
  const hasFilter = Boolean(filters.start_date || filters.end_date || filters.customer_id);

  const summary = useMemo(() => {
    const total = payments.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
    const byMethod = METODE_OPTIONS.map((method) => ({
      ...method,
      total: payments
        .filter((item) => item.method === method.value)
        .reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
    }));
    return { total, count: payments.length, byMethod };
  }, [payments]);

  const mutation = useMutation({
    mutationFn: async (payload) => {
      if (payload.id) {
        const res = await api.put(`/payments/${payload.id}`, payload);
        return res.data;
      }
      const res = await api.post('/payments', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success(editing ? 'Pembayaran berhasil diperbarui' : 'Pembayaran berhasil disimpan');
      closeForm();
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err) => {
      const data = err.response?.data;
      const firstError = data?.errors ? Object.values(data.errors).flat()[0] : null;
      toast.error(firstError || data?.message || 'Gagal menyimpan pembayaran');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const res = await api.delete(`/payments/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Pembayaran berhasil dihapus');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Gagal menghapus pembayaran');
      setDeleteTarget(null);
    },
  });

  function openCreate() {
    setEditing(null);
    setForm(initialForm);
    setSaleSearch('');
    setShowForm(true);
  }

  function openEdit(item) {
    setEditing(item);
    setForm({
      date: item.date ? String(item.date).slice(0, 10) : todayInput(),
      customer_id: item.customer_id || '',
      sale_id: item.sale_id || '',
      amount: Number(item.amount || 0),
      method: item.method || 'cash',
      note: item.note || '',
    });
    setSaleSearch('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm(initialForm);
    setSaleSearch('');
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!form.customer_id) {
      toast.error('Pilih pelanggan terlebih dahulu');
      return;
    }
    if (!form.sale_id) {
      toast.error('Pilih transaksi terlebih dahulu');
      return;
    }
    const amount = Number(form.amount) || 0;
    if (amount <= 0) {
      toast.error('Nominal harus lebih dari 0');
      return;
    }
    // Saat edit, batas sisa dihitung dari nilai tersimpan, bukan dari
    // transaksi sekarang - kalau tidak, pembayaran yang diedit selalu
    // dianggap melebihi sisa karena sisa itu sudah ikut berkurang.
    if (!editing && maxAmount > 0 && amount > maxAmount) {
      toast.error(`Nominal maksimal adalah ${formatCurrency(maxAmount)}`);
      return;
    }
    mutation.mutate({
      id: editing?.id,
      date: form.date,
      customer_id: form.customer_id,
      sale_id: form.sale_id,
      amount,
      method: form.method,
      note: form.note || null,
    });
  }

  const columns = [
    {
      key: 'payment_number',
      header: 'No. Pembayaran',
      sortable: true,
      render: (item) => (
        <div className="min-w-0">
          <p className="font-medium text-on-surface truncate">{item.payment_number}</p>
          <p className="text-2xs text-on-surface-variant truncate">{formatDateShort(item.date)}</p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Pelanggan',
      render: (item) => (
        <span className="text-on-surface-variant truncate">{item.customer?.name || '-'}</span>
      ),
    },
    {
      key: 'sale',
      header: 'Transaksi',
      render: (item) => (
        <span className="text-on-surface-variant truncate">{item.sale?.sale_number || '-'}</span>
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
        title="Pembayaran"
        subtitle="Penerimaan pembayaran piutang dari pelanggan"
        breadcrumbs={[{ label: 'Keuangan', to: '/piutang' }, { label: 'Pembayaran' }]}
        actions={
          <Button icon="add" size="sm" onClick={openCreate}>
            Catat Pembayaran
          </Button>
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
          value={filters.customer_id}
          onChange={(event) => setFilters((f) => ({ ...f, customer_id: event.target.value }))}
          aria-label="Filter pelanggan"
        >
          <option value="">Semua pelanggan</option>
          {customerList.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </Select>
      </div>

      {summary.count > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest px-3.5 py-3">
            <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Total Diterima</p>
            <Money value={summary.total} variant="strong" className="text-base mt-1 block" />
          </div>
          <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest px-3.5 py-3">
            <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Jumlah Transaksi</p>
            <p className="text-base font-semibold text-on-surface mt-1">{summary.count}</p>
          </div>
          {summary.byMethod.slice(0, 2).map((method) => (
            <div
              key={method.value}
              className="rounded-card border border-outline-variant/70 bg-surface-container-lowest px-3.5 py-3"
            >
              <p className="text-2xs uppercase tracking-wide text-on-surface-variant">{method.label}</p>
              <Money value={method.total} variant="muted" className="text-sm mt-1 block" />
            </div>
          ))}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={payments}
        rowKey={(row) => row.id}
        loading={isLoading}
        minWidth="820px"
        emptyState={
          isError ? (
            <div role="alert" className="py-6 text-center">
              <p className="text-sm font-medium text-danger">Gagal memuat pembayaran</p>
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
              icon="payments"
              title={hasFilter ? 'Pembayaran tidak ditemukan' : 'Belum ada pembayaran'}
              description={
                hasFilter
                  ? 'Coba ubah atau kosongkan filter tanggal dan pelanggan.'
                  : 'Catatan pembayaran piutang pelanggan akan muncul di sini.'
              }
              action={
                <Button size="sm" icon="add" onClick={openCreate}>
                  Catat Pembayaran
                </Button>
              }
            />
          )
        }
        cardTitle={(item) => item.payment_number}
        cardMeta={(item) => `${item.customer?.name || '-'} · ${formatDate(item.date)}`}
        cardBadge={(item) => <Money value={item.amount} variant="strong" />}
        cardFields={[
          { label: 'Transaksi', render: (item) => item.sale?.sale_number || '-' },
          { label: 'Metode', render: (item) => metodeLabel(item.method) },
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
          title={editing ? 'Edit Pembayaran' : 'Catat Pembayaran'}
          subtitle="Pembayaran dicatat terhadap satu transaksi penjualan"
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

            <FormField label="Pelanggan" required>
              <Select
                value={form.customer_id}
                onChange={(event) => {
                  setForm({ ...form, customer_id: event.target.value, sale_id: '', amount: '' });
                  setSaleSearch('');
                }}
                required
              >
                <option value="">Pilih pelanggan</option>
                {customerList.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField
              label="Transaksi"
              required
              hint={
                !form.customer_id
                  ? 'Pilih pelanggan dulu untuk melihat transaksi yang belum lunas.'
                  : saleOptions.length === 0
                    ? 'Semua transaksi pelanggan ini sudah lunas.'
                    : undefined
              }
            >
              <Select
                value={form.sale_id}
                onChange={(event) => setForm({ ...form, sale_id: event.target.value, amount: '' })}
                disabled={!form.customer_id}
                required
              >
                <option value="">Pilih transaksi</option>
                {saleOptions.map((sale) => (
                  <option key={sale.id} value={sale.id}>
                    {sale.sale_number} — {formatCurrency(sale.remaining_balance ?? sale.receivable)}
                  </option>
                ))}
              </Select>
              {form.customer_id && (
                <div className="mt-2">
                  <SearchInput
                    value={saleSearch}
                    onChange={setSaleSearch}
                    placeholder="Cari nomor transaksi…"
                    aria-label="Cari nomor transaksi penjualan"
                  />
                </div>
              )}
            </FormField>

            <FormField
              label="Nominal"
              required
              hint={
                maxAmount > 0 && !editing
                  ? `Sisa piutang transaksi ini ${formatCurrency(maxAmount)}.`
                  : undefined
              }
            >
              <MoneyInput
                value={form.amount}
                onChange={(value) => setForm({ ...form, amount: value })}
                disabled={!form.sale_id}
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
        title="Hapus pembayaran?"
        message={`Pembayaran ${deleteTarget?.payment_number ?? ''} akan dihapus.`}
        detail="Sisa piutang pelanggan dan transaksi terkait akan dihitung ulang."
        confirmLabel="Hapus"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
