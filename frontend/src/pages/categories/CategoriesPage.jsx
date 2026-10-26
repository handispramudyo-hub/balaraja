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
import FormField from '../../components/ui/FormField';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import Badge from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/States';

const initialForm = { name: '', description: '' };

// Array kosong di level modul agar referensinya stabil antar render.
const EMPTY_LIST = [];

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get('/categories');
      return Array.isArray(res.data) ? res.data : (res.data.data || []);
    },
  });

  // Dipakai untuk menghitung produk per kategori. Kategori yang masih punya
  // produk tidak boleh dihapus: di server, `products.category_id` memakai
  // cascade, jadi menghapus kategori ikut menghapus produknya - termasuk
  // produk yang sudah punya riwayat penjualan.
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await api.get('/products');
      return Array.isArray(res.data) ? res.data : (res.data.data || []);
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/categories', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Kategori berhasil ditambahkan');
      closeModal();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal menambahkan kategori'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => api.put(`/categories/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Kategori berhasil diperbarui');
      closeModal();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal memperbarui kategori'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Kategori berhasil dihapus');
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Gagal menghapus kategori');
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
    setForm({ name: item.name, description: item.description || '' });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditing(null);
    setForm(initialForm);
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!form.name.trim()) return toast.error('Nama kategori wajib diisi');
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const categories = data || EMPTY_LIST;

  const productCountByCategory = useMemo(() => {
    const map = new Map();
    (products || []).forEach((product) => {
      const key = String(product.category_id ?? '');
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [products]);

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories;
    const query = search.toLowerCase();
    return categories.filter(
      (item) =>
        item.name?.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query)
    );
  }, [categories, search]);

  const deleteProductCount = deleteTarget
    ? productCountByCategory.get(String(deleteTarget.id)) ?? 0
    : 0;

  const columns = [
    {
      key: 'name',
      header: 'Kategori',
      sortable: true,
      render: (item) => (
        <div className="min-w-0">
          <p className="font-medium text-on-surface truncate">{item.name}</p>
          <p className="text-2xs text-on-surface-variant truncate">
            {item.description || 'Tidak ada keterangan'}
          </p>
        </div>
      ),
    },
    {
      key: 'products',
      header: 'Produk',
      align: 'right',
      sortable: true,
      sortValue: (item) => productCountByCategory.get(String(item.id)) ?? 0,
      render: (item) => {
        const count = productCountByCategory.get(String(item.id)) ?? 0;
        return count > 0 ? (
          <Badge tone="info">{count} produk</Badge>
        ) : (
          <span className="text-on-surface-variant text-xs">Kosong</span>
        );
      },
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
        title="Kategori"
        subtitle="Kelompokkan produk agar mudah dicari dan dilaporkan"
        breadcrumbs={[{ label: 'Master Data', to: '/produk' }, { label: 'Kategori' }]}
        actions={
          <Button icon="add" size="sm" onClick={openCreate}>
            Tambah Kategori
          </Button>
        }
      />

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Cari kategori…"
        className="sm:max-w-xs"
      />

      <DataTable
        columns={columns}
        rows={filteredCategories}
        rowKey={(row) => row.id}
        loading={isLoading}
        minWidth="520px"
        emptyState={
          isError ? (
            <div role="alert" className="py-6 text-center">
              <p className="text-sm font-medium text-danger">Gagal memuat kategori</p>
              <p className="text-xs text-on-surface-variant mt-1">
                {error?.response?.status
                  ? `Server merespons dengan kesalahan (${error.response.status}).`
                  : 'Periksa koneksi internet Anda lalu coba lagi.'}
              </p>
            </div>
          ) : (
            <EmptyState
              icon="category"
              title={search ? 'Kategori tidak ditemukan' : 'Belum ada kategori'}
              description={
                search
                  ? 'Coba kata kunci lain.'
                  : 'Buat kategori agar produk lebih mudah dikelompokkan.'
              }
              action={
                <Button size="sm" icon="add" onClick={openCreate}>
                  Tambah Kategori
                </Button>
              }
            />
          )
        }
        cardTitle={(item) => item.name}
        cardMeta={(item) => item.description || 'Tidak ada keterangan'}
        cardBadge={(item) => {
          const count = productCountByCategory.get(String(item.id)) ?? 0;
          return count > 0 ? <Badge tone="info">{count} produk</Badge> : null;
        }}
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
          title={editing ? 'Edit Kategori' : 'Tambah Kategori'}
          variant="center"
          panelClassName="sm:max-w-sm"
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
            <FormField label="Nama kategori" required>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Masukkan nama kategori"
                required
                autoFocus
              />
            </FormField>
            <FormField label="Keterangan" hint="Opsional">
              <Textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Contoh: MATERIAL BANGUNAN"
              />
            </FormField>
          </form>
        </Modal>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteProductCount > 0) {
            throw new Error(
              `Kategori ini masih dipakai ${deleteProductCount} produk. Pindahkan produknya ke kategori lain sebelum menghapus.`
            );
          }
          deleteMutation.mutate(deleteTarget.id);
        }}
        title="Hapus kategori?"
        message={`Kategori "${deleteTarget?.name ?? ''}" akan dihapus.`}
        detail={
          deleteProductCount > 0
            ? `Kategori ini masih dipakai ${deleteProductCount} produk. Menghapusnya akan ikut menghapus produk tersebut.`
            : 'Tindakan ini tidak bisa dibatalkan.'
        }
        confirmLabel="Hapus"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
