import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Select from '../../components/ui/Select';
import DateInput from '../../components/ui/DateInput';
import Textarea from '../../components/ui/Textarea';
import MoneyInput from '../../components/ui/MoneyInput';
import FormField from '../../components/ui/FormField';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import Badge from '../../components/ui/Badge';
import Money from '../../components/ui/Money';
import { EmptyState } from '../../components/ui/States';
import { formatDate, formatDateShort, todayInput } from '../../lib/format';

// `value` WAJIB sama dengan enum yang diterima ExpenseController
// ('in:transportasi,ongkos_kirim,operasional'). Label Bahasa Indonesia hanya
// untuk ditampilkan.
const KATEGORI_OPTIONS = [
  { value: 'transportasi', label: 'Transportasi', icon: 'local_shipping', tone: 'primary' },
  { value: 'ongkos_kirim', label: 'Ongkos Kirim', icon: 'local_post_office', tone: 'info' },
  { value: 'operasional', label: 'Operasional', icon: 'settings', tone: 'neutral' },
];

function kategoriMeta(value) {
  return KATEGORI_OPTIONS.find((option) => option.value === value) ?? {
    label: value || '-',
    icon: 'label',
    tone: 'neutral',
  };
}

const initialForm = {
  date: todayInput(),
  category: '',
  amount: '',
  description: '',
};

export default function ExpensesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    category: '',
  });
  const [form, setForm] = useState(initialForm);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['expenses', filters],
    queryFn: async () => {
      const params = {};
      // Endpoint `/api/expenses` membaca `date_from`/`date_to`. Mengirim
      // `start_date`/`end_date` seperti di halaman lain membuat filter tanggal
      // di sini diam-diam tidak bekerja.
      if (filters.start_date) params.date_from = filters.start_date;
      if (filters.end_date) params.date_to = filters.end_date;
      if (filters.category) params.category = filters.category;
      const res = await api.get('/expenses', { params });
      return res.data;
    },
  });

  const expenses = useMemo(() => data?.data || data || [], [data]);
  const hasFilter = Boolean(filters.start_date || filters.end_date || filters.category);

  const summary = useMemo(() => {
    const total = expenses.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
    const byCategory = KATEGORI_OPTIONS.map((option) => ({
      ...option,
      total: expenses
        .filter((item) => item.category === option.value)
        .reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
    }));
    return { total, count: expenses.length, byCategory };
  }, [expenses]);

  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/expenses', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Biaya berhasil ditambahkan');
      closeForm();
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
    onError: (err) => {
      const fields = err.response?.data?.errors;
      const firstError = fields ? Object.values(fields).flat()[0] : null;
      toast.error(firstError || err.response?.data?.message || 'Gagal menambahkan biaya');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      const res = await api.put(`/expenses/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Biaya berhasil diperbarui');
      closeForm();
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
    onError: (err) => {
      const fields = err.response?.data?.errors;
      const firstError = fields ? Object.values(fields).flat()[0] : null;
      toast.error(firstError || err.response?.data?.message || 'Gagal memperbarui biaya');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const res = await api.delete(`/expenses/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Biaya berhasil dihapus');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Gagal menghapus biaya');
      setDeleteTarget(null);
    },
  });

  function openCreate() {
    setEditing(null);
    setForm(initialForm);
    setShowForm(true);
  }

  function openEdit(item) {
    setEditing(item);
    setForm({
      date: item.date ? String(item.date).slice(0, 10) : todayInput(),
      category: item.category || '',
      amount: Number(item.amount || 0),
      description: item.description || '',
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm(initialForm);
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!form.category) {
      toast.error('Pilih kategori terlebih dahulu');
      return;
    }
    const amount = Number(form.amount) || 0;
    if (amount <= 0) {
      toast.error('Nominal harus lebih dari 0');
      return;
    }
    if (!form.description.trim()) {
      toast.error('Keterangan wajib diisi');
      return;
    }
    const payload = {
      date: form.date,
      category: form.category,
      amount,
      description: form.description.trim(),
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const columns = [
    {
      key: 'date',
      header: 'Tanggal',
      sortable: true,
      render: (item) => (
        <span className="text-on-surface-variant whitespace-nowrap">
          {formatDateShort(item.date)}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Kategori',
      sortable: true,
      render: (item) => {
        const meta = kategoriMeta(item.category);
        return (
          <Badge tone={meta.tone} size="sm" icon={meta.icon}>
            {meta.label}
          </Badge>
        );
      },
    },
    {
      key: 'description',
      header: 'Keterangan',
      render: (item) => (
        <span className="text-on-surface-variant truncate">{item.description || '-'}</span>
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
      key: 'aksi',
      header: 'Aksi',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-0.5">
          <IconButton
            icon="edit"
            label={`Edit biaya ${item.description ?? ''}`}
            size="sm"
            tone="primary"
            onClick={() => openEdit(item)}
          />
          <IconButton
            icon="delete"
            label={`Hapus biaya ${item.description ?? ''}`}
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
        title="Biaya"
        subtitle="Catatan pengeluaran operasional seperti ongkos kirim dan transportasi"
        breadcrumbs={[{ label: 'Transaksi', to: '/penjualan' }, { label: 'Biaya' }]}
        actions={
          <Button icon="add" size="sm" onClick={openCreate}>
            Catat Biaya
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
          value={filters.category}
          onChange={(event) => setFilters((f) => ({ ...f, category: event.target.value }))}
          aria-label="Filter kategori"
        >
          <option value="">Semua kategori</option>
          {KATEGORI_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      {summary.count > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest px-3.5 py-3">
            <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Total Biaya</p>
            <Money value={summary.total} variant="strong" className="text-base mt-1 block" />
          </div>
          <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest px-3.5 py-3">
            <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Catatan</p>
            <p className="text-base font-semibold text-on-surface mt-1">{summary.count}</p>
          </div>
          {summary.byCategory.slice(0, 2).map((category) => (
            <div
              key={category.value}
              className="rounded-card border border-outline-variant/70 bg-surface-container-lowest px-3.5 py-3"
            >
              <p className="text-2xs uppercase tracking-wide text-on-surface-variant">{category.label}</p>
              <Money value={category.total} variant="muted" className="text-sm mt-1 block" />
            </div>
          ))}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={expenses}
        rowKey={(row) => row.id}
        loading={isLoading}
        minWidth="720px"
        emptyState={
          isError ? (
            <div role="alert" className="py-6 text-center">
              <p className="text-sm font-medium text-danger">Gagal memuat data biaya</p>
              <p className="text-xs text-on-surface-variant mt-1">
                {error?.response?.status
                  ? `Server merespons dengan kesalahan (${error.response.status}).`
                  : 'Periksa koneksi internet Anda lalu coba lagi.'}
              </p>
              <Button size="sm" variant="outline" icon="refresh" className="mt-3" onClick={() => refetch()}>
                Coba Laki
              </Button>
            </div>
          ) : (
            <EmptyState
              icon="receipt_long"
              title={hasFilter ? 'Biaya tidak ditemukan' : 'Belum ada biaya tercatat'}
              description={
                hasFilter
                  ? 'Coba ubah atau kosongkan filter tanggal dan kategori.'
                  : 'Catat pengeluaran seperti ongkos kirim atau biaya operasional di sini.'
              }
              action={
                <Button size="sm" icon="add" onClick={openCreate}>
                  Catat Biaya
                </Button>
              }
            />
          )
        }
        cardTitle={(item) => item.description || kategoriMeta(item.category).label}
        cardMeta={(item) => `${kategoriMeta(item.category).label} · ${formatDate(item.date)}`}
        cardBadge={(item) => <Money value={item.amount} variant="strong" />}
        cardFields={[
          { label: 'Kategori', render: (item) => kategoriMeta(item.category).label },
          { label: 'Tanggal', render: (item) => formatDateShort(item.date) },
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
          title={editing ? 'Edit Biaya' : 'Catat Biaya'}
          variant="sheet"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={closeForm}>
                Batal
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                loading={createMutation.isPending || updateMutation.isPending}
              >
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

            <FormField label="Kategori" required>
              <Select
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                required
              >
                <option value="">Pilih kategori</option>
                {KATEGORI_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Nominal" required>
              <MoneyInput
                value={form.amount}
                onChange={(value) => setForm({ ...form, amount: value })}
              />
            </FormField>

            <FormField label="Keterangan" required>
              <Textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                rows={3}
                placeholder="Contoh: ongkos kirim 3 karung ke Padang"
                required
              />
            </FormField>
          </form>
        </Modal>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        title="Hapus biaya?"
        message={`Biaya ${deleteTarget?.description ?? ''} sebesar ${deleteTarget?.amount ?? 0} akan dihapus.`}
        detail={`Tanggal ${deleteTarget?.date ? formatDate(deleteTarget.date) : '-'}. Tindakan ini tidak bisa dibatalkan.`}
        confirmLabel="Hapus"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
