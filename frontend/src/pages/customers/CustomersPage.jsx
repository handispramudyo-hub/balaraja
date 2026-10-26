import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import SearchInput from '../../components/ui/SearchInput';
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';
import MoneyInput from '../../components/ui/MoneyInput';
import Select from '../../components/ui/Select';
import FormField from '../../components/ui/FormField';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import { StatusBadge } from '../../components/ui/Badge';
import Money from '../../components/ui/Money';
import { EmptyState } from '../../components/ui/States';

const initialForm = {
  name: '',
  owner_name: '',
  phone: '',
  address: '',
  credit_limit: '',
  note: '',
  status: 'active',
};

// Array kosong di level modul agar referensinya stabil antar render.
const EMPTY_LIST = [];

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const res = await api.get('/customers');
      return Array.isArray(res.data) ? res.data : (res.data.data || []);
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/customers', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Pelanggan berhasil ditambahkan');
      closeModal();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal menambahkan pelanggan'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => api.put(`/customers/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Pelanggan berhasil diperbarui');
      closeModal();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal memperbarui pelanggan'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/customers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Pelanggan berhasil dihapus');
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Gagal menghapus pelanggan');
      setDeleteTarget(null);
    },
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
      owner_name: item.owner_name || '',
      phone: item.phone || '',
      address: item.address || '',
      credit_limit: item.credit_limit ?? '',
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

  function handleSubmit(event) {
    event.preventDefault();
    if (!form.name.trim()) return toast.error('Nama pelanggan wajib diisi');
    const payload = { ...form };
    if (payload.credit_limit !== '') payload.credit_limit = Number(payload.credit_limit);
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  // Referensi stabil supaya useMemo di bawah benar-benar bekerja;
  // `data || []` akan membuat array baru setiap render.
  const customers = data || EMPTY_LIST;

  const filteredCustomers = useMemo(() => {
    if (!search.trim()) return customers;
    const query = search.toLowerCase();
    return customers.filter(
      (item) =>
        item.name?.toLowerCase().includes(query) ||
        item.code?.toLowerCase().includes(query) ||
        item.owner_name?.toLowerCase().includes(query) ||
        item.phone?.toLowerCase().includes(query) ||
        item.address?.toLowerCase().includes(query)
    );
  }, [customers, search]);

  const totalReceivable = useMemo(
    () => customers.reduce((sum, item) => sum + Number(item.total_receivable ?? 0), 0),
    [customers]
  );

  const columns = [
    {
      key: 'name',
      header: 'Pelanggan',
      sortable: true,
      render: (item) => (
        <div className="min-w-0">
          <p className="font-medium text-on-surface truncate">{item.name}</p>
          <p className="text-2xs text-on-surface-variant truncate">
            {item.code ? `${item.code} · ` : ''}
            {item.owner_name || '-'}
          </p>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Kontak',
      render: (item) => (
        <div className="min-w-0">
          <p className="text-on-surface-variant truncate tabular-nums">{item.phone || '-'}</p>
          <p className="text-2xs text-on-surface-variant/80 truncate">{item.address || '-'}</p>
        </div>
      ),
    },
    {
      key: 'total_receivable',
      header: 'Piutang',
      align: 'right',
      sortable: true,
      render: (item) =>
        Number(item.total_receivable ?? 0) > 0 ? (
          <Money value={item.total_receivable} variant="danger" />
        ) : (
          <span className="text-on-surface-variant text-xs">Lunas</span>
        ),
    },
    {
      key: 'credit_limit',
      header: 'Batas Kredit',
      align: 'right',
      sortable: true,
      render: (item) => <Money value={item.credit_limit ?? 0} variant="muted" className="text-xs" />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => <StatusBadge kind="active" value={item.status} />,
    },
    {
      key: 'aksi',
      header: 'Aksi',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-0.5">
          <IconButton
            icon="edit"
            label={`Edit ${item.name}`}
            size="sm"
            tone="primary"
            onClick={() => openEdit(item)}
          />
          <IconButton
            icon="delete"
            label={`Hapus ${item.name}`}
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
        title="Pelanggan"
        subtitle="Data pelanggan, batas kredit, dan outstanding piutang"
        breadcrumbs={[{ label: 'Master Data', to: '/produk' }, { label: 'Pelanggan' }]}
        actions={
          <Button icon="add" size="sm" onClick={openCreate}>
            Tambah Pelanggan
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Cari nama, kode, atau nomor HP…"
          className="sm:max-w-xs"
        />
        {totalReceivable > 0 && (
          <p className="text-xs text-on-surface-variant">
            Total piutang pelanggan:{' '}
            <Money value={totalReceivable} variant="danger" className="text-xs" />
          </p>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={filteredCustomers}
        rowKey={(row) => row.id}
        loading={isLoading}
        minWidth="760px"
        emptyState={
          isError ? (
            <div role="alert" className="py-6 text-center">
              <p className="text-sm font-medium text-danger">Gagal memuat pelanggan</p>
              <p className="text-xs text-on-surface-variant mt-1">
                {error?.response?.status
                  ? `Server merespons dengan kesalahan (${error.response.status}).`
                  : 'Periksa koneksi internet Anda lalu coba lagi.'}
              </p>
            </div>
          ) : (
            <EmptyState
              icon="store"
              title={search ? 'Pelanggan tidak ditemukan' : 'Belum ada pelanggan'}
              description={
                search
                  ? 'Coba kata kunci lain.'
                  : 'Tambahkan pelanggan pertama untuk mulai mencatat penjualan.'
              }
              action={
                <Button size="sm" icon="add" onClick={openCreate}>
                  Tambah Pelanggan
                </Button>
              }
            />
          )
        }
        cardTitle={(item) => item.name}
        cardMeta={(item) => `${item.code || '-'} · ${item.owner_name || '-'}`}
        cardBadge={(item) => <StatusBadge kind="active" value={item.status} />}
        cardFields={[
          { label: 'No. HP', render: (item) => item.phone || '-' },
          {
            label: 'Piutang',
            render: (item) =>
              Number(item.total_receivable ?? 0) > 0 ? (
                <Money value={item.total_receivable} variant="danger" />
              ) : (
                'Lunas'
              ),
          },
          {
            label: 'Batas Kredit',
            render: (item) => <Money value={item.credit_limit ?? 0} variant="muted" />,
          },
          { label: 'Alamat', render: (item) => item.address || '-', full: true },
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

      {showModal && (
        <Modal
          onClose={closeModal}
          title={editing ? 'Edit Pelanggan' : 'Tambah Pelanggan'}
          variant="sheet"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={closeModal}>
                Batal
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                loading={createMutation.isPending || updateMutation.isPending}
              >
                {editing ? 'Simpan Perubahan' : 'Simpan'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {editing && (
              <FormField label="Kode">
                <Input value={editing.code || ''} disabled readOnly />
              </FormField>
            )}

            <FormField label="Nama pelanggan" required>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Contoh: CV Berkah Jaya"
                required
                autoFocus
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Pemilik">
                <Input
                  value={form.owner_name}
                  onChange={(event) => setForm({ ...form, owner_name: event.target.value })}
                  placeholder="Nama pemilik"
                />
              </FormField>
              <FormField label="No. HP">
                <Input
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  placeholder="08xxxxxxxxxx"
                  inputMode="tel"
                />
              </FormField>
            </div>

            <FormField label="Alamat">
              <Textarea
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
                placeholder="Alamat lengkap pelanggan"
                rows={2}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Batas kredit">
                <MoneyInput
                  value={form.credit_limit}
                  onChange={(value) => setForm({ ...form, credit_limit: value })}
                />
              </FormField>
              <FormField label="Status">
                <Select
                  value={form.status}
                  onChange={(event) => setForm({ ...form, status: event.target.value })}
                >
                  <option value="active">Aktif</option>
                  <option value="inactive">Nonaktif</option>
                </Select>
              </FormField>
            </div>

            <FormField label="Catatan" hint="Opsional">
              <Textarea
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
                placeholder="Catatan tambahan"
                rows={2}
              />
            </FormField>
          </form>
        </Modal>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        title="Hapus pelanggan?"
        message={`Pelanggan "${deleteTarget?.name ?? ''}" akan dihapus.`}
        detail="Pelanggan yang sudah punya transaksi penjualan atau piutang tidak bisa dihapus karena riwayatnya dibutuhkan untuk laporan."
        confirmLabel="Hapus"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
