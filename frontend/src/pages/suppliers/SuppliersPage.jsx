import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import SearchInput from '../../components/ui/SearchInput';
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';
import Select from '../../components/ui/Select';
import FormField from '../../components/ui/FormField';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import { StatusBadge } from '../../components/ui/Badge';
import Money from '../../components/ui/Money';
import { EmptyState } from '../../components/ui/States';

const initialForm = { name: '', contact_name: '', phone: '', address: '', note: '', status: 'active' };

// Array kosong di level modul agar referensinya stabil antar render.
const EMPTY_LIST = [];

export default function SuppliersPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

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
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Gagal menghapus supplier');
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

  function handleSubmit(event) {
    event.preventDefault();
    if (!form.name.trim()) return toast.error('Nama supplier wajib diisi');
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const suppliers = data || EMPTY_LIST;

  const filteredSuppliers = useMemo(() => {
    if (!search.trim()) return suppliers;
    const query = search.toLowerCase();
    return suppliers.filter(
      (item) =>
        item.name?.toLowerCase().includes(query) ||
        item.contact_name?.toLowerCase().includes(query) ||
        item.phone?.toLowerCase().includes(query) ||
        item.address?.toLowerCase().includes(query)
    );
  }, [suppliers, search]);

  const totalPayable = useMemo(
    () => suppliers.reduce((sum, item) => sum + Number(item.total_payable ?? 0), 0),
    [suppliers]
  );

  const columns = [
    {
      key: 'name',
      header: 'Supplier',
      sortable: true,
      render: (item) => (
        <div className="min-w-0">
          <p className="font-medium text-on-surface truncate">{item.name}</p>
          <p className="text-2xs text-on-surface-variant truncate">
            {item.contact_name || '-'}
          </p>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Kontak',
      render: (item) => (
        <div className="min-w-0">
          <p className="text-on-surface-variant truncate tabular-nums">{item.phone || '-'}</p>
          <p className="text-2xs text-on-surface-variant/80 truncate">{item.address || '-'}</p>
        </div>
      ),
    },
    {
      key: 'total_payable',
      header: 'Utang',
      align: 'right',
      sortable: true,
      render: (item) =>
        Number(item.total_payable) > 0 ? (
          <Money value={item.total_payable} variant="danger" />
        ) : (
          <span className="text-on-surface-variant text-xs">Lunas</span>
        ),
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
        title="Supplier"
        subtitle="Pemasok barang dan posisi utang ke supplier"
        breadcrumbs={[{ label: 'Master Data', to: '/produk' }, { label: 'Supplier' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon="price_change" onClick={() => navigate('/utang')}>
              Lihat Utang
            </Button>
            <Button icon="add" size="sm" onClick={openCreate}>
              Tambah Supplier
            </Button>
          </>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Cari nama supplier atau kontak…"
          className="sm:max-w-xs"
        />
        {totalPayable > 0 && (
          <p className="text-xs text-on-surface-variant">
            Total utang supplier:{' '}
            <Money value={totalPayable} variant="danger" className="text-xs" />
          </p>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={filteredSuppliers}
        rowKey={(row) => row.id}
        loading={isLoading}
        minWidth="700px"
        emptyState={
          isError ? (
            <div role="alert" className="py-6 text-center">
              <p className="text-sm font-medium text-danger">Gagal memuat supplier</p>
              <p className="text-xs text-on-surface-variant mt-1">
                {error?.response?.status
                  ? `Server merespons dengan kesalahan (${error.response.status}).`
                  : 'Periksa koneksi internet Anda lalu coba lagi.'}
              </p>
            </div>
          ) : (
            <EmptyState
              icon="local_shipping"
              title={search ? 'Supplier tidak ditemukan' : 'Belum ada supplier'}
              description={
                search
                  ? 'Coba kata kunci lain.'
                  : 'Tambahkan supplier untuk mulai mencatat pembelian.'
              }
              action={
                <Button size="sm" icon="add" onClick={openCreate}>
                  Tambah Supplier
                </Button>
              }
            />
          )
        }
        cardTitle={(item) => item.name}
        cardMeta={(item) => `${item.contact_name || '-'} · ${item.phone || '-'}`}
        cardBadge={(item) => <StatusBadge kind="active" value={item.status} />}
        cardFields={[
          {
            label: 'Utang',
            render: (item) =>
              Number(item.total_payable) > 0 ? (
                <Money value={item.total_payable} variant="danger" />
              ) : (
                'Lunas'
              ),
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
          title={editing ? 'Edit Supplier' : 'Tambah Supplier'}
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
            <FormField label="Nama supplier" required>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Contoh: CV Sumber Material"
                required
                autoFocus
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Narahubung">
                <Input
                  value={form.contact_name}
                  onChange={(event) => setForm({ ...form, contact_name: event.target.value })}
                  placeholder="Nama kontak"
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
                placeholder="Alamat lengkap supplier"
                rows={2}
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
        title="Hapus supplier?"
        message={`Supplier "${deleteTarget?.name ?? ''}" akan dihapus.`}
        detail="Supplier yang sudah punya transaksi pembelian atau utang tidak bisa dihapus karena riwayatnya dibutuhkan untuk laporan."
        confirmLabel="Hapus"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
