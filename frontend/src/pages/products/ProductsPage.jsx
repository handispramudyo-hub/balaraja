import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import SearchInput from '../../components/ui/SearchInput';
import Select from '../../components/ui/Select';
import Input from '../../components/ui/Input';
import MoneyInput from '../../components/ui/MoneyInput';
import FormField from '../../components/ui/FormField';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import { StatusBadge } from '../../components/ui/Badge';
import Money from '../../components/ui/Money';
import { EmptyState } from '../../components/ui/States';
import ProductUnitEditor from '../../components/products/ProductUnitEditor';
import RebaseConfirmDialog from '../../components/products/RebaseConfirmDialog';
import {
  changesBaseUnit,
  currentBaseName,
  toUnitRows,
  validateUnits,
} from '../../components/products/unitRules';

const initialForm = {
  name: '',
  category_id: '',
  buy_price: '',
  sell_price: '',
  stock: '',
  min_stock: '',
  supplier_id: '',
};

function stockStatus(stock, minStock) {
  const value = Number(stock) || 0;
  const min = Number(minStock) || 0;
  if (value <= 0) return 'habis';
  if (value <= min) return 'menipis';
  return 'aman';
}

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [unitRows, setUnitRows] = useState(() => toUnitRows([]));
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

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
      setDeleteTarget(null);
    },
    onError: (err) => {
      const msg =
        err.response?.data?.message ||
        (err.response?.status === 409
          ? 'Produk tidak bisa dihapus karena masih punya riwayat transaksi/stok.'
          : 'Gagal menghapus produk');
      toast.error(msg);
      setDeleteTarget(null);
    },
  });

  /**
   * Angka dampak konversi dihitung server. Endpoint ini hanya membaca, jadi
   * aman dipanggil berkali-kali sambil user masih mengisi factor.
   */
  const previewMutation = useMutation({
    mutationFn: ({ id, units }) => api.post(`/products/${id}/units/rebase-preview`, { units }),
    onSuccess: (res) => setRebase((state) => ({ ...state, preview: res.data })),
    onError: (err) => {
      const data = err.response?.data;
      toast.error(data?.errors?.units?.[0] || data?.message || 'Gagal menghitung dampak satuan');
      setRebase({ open: false, payload: null, preview: null });
    },
  });

  function openCreate() {
    setEditing(null);
    setForm(initialForm);
    setUnitRows([{ ...toUnitRows([])[0], name: 'botol', is_base: true, factor: 1 }, { name: 'dos', factor: 24, is_base: false, buy_price: '', sell_price: '' }]);
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
    const normalized = toUnitRows(item.units);
    const base = normalized.find((u) => u.is_base) || { ...normalized[0], is_base: true, factor: 1 };
    const pack = normalized.find((u) => !u.is_base) || { name: 'dos', factor: 24, is_base: false, buy_price: '', sell_price: '' };
    setUnitRows([
      { ...base, is_base: true, factor: 1 },
      { ...pack, is_base: false },
    ]);
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

  function handleSubmit(event) {
    event?.preventDefault();
    if (!form.name.trim()) return toast.error('Nama produk wajib diisi');

    const { units, errors } = validateUnits(unitRows);
    if (errors.length) return toast.error(errors[0]);

    const base = currentBaseName(editing);
    const isRebasing = Boolean(editing) && changesBaseUnit(units, base);

    const baseRow = units.find((u) => u.is_base) || units[0];
    const packRow = units.find((u) => !u.is_base) || units[1];
    const retailBuy = baseRow?.buy_price !== '' && baseRow?.buy_price != null ? Number(baseRow.buy_price) : 0;
    const packBuy = packRow?.buy_price !== '' && packRow?.buy_price != null ? Number(packRow.buy_price) : 0;
    const packSize = Number(packRow?.factor) || 1;
    const retailPrice = baseRow?.sell_price !== '' && baseRow?.sell_price != null ? Number(baseRow.sell_price) : 0;

    const payload = {
      name: form.name,
      category_id: form.category_id || null,
      supplier_id: form.supplier_id || null,
      buy_price: retailBuy || (packSize > 0 ? packBuy / packSize : 0),
      sell_price: retailPrice,
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

  /**
   * Ringkasan satuan turunan untuk kartu produk.
   *
   * Tidak menampilkan satuan dasar karena sudah ada di angka stok - yang
   * ditambahkan hanya satuan yang bisa dipakai user saat membeli/menjual.
   */
  function unitSummary(item) {
    const packs = (item.units || []).filter((unit) => !unit.is_base && Number(unit.factor) > 0);
    if (packs.length === 0) return null;
    return packs
      .map((unit) => `${unit.factor} ${item.base_unit || item.unit || ''}/${unit.name}`)
      .join(' · ');
  }

  const products = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data || []).filter((item) => {
      if (categoryId && String(item.category_id) !== String(categoryId)) return false;
      if (stockFilter) {
        const status = stockStatus(item.stock, item.min_stock);
        if (stockFilter === 'low' && status === 'aman') return false;
        if (stockFilter === 'habis' && status !== 'habis') return false;
      }
      if (!term) return true;
      return (
        `${item.name ?? ''} ${item.code ?? ''} ${item.category?.name ?? ''}`
          .toLowerCase()
          .includes(term)
      );
    });
  }, [data, search, categoryId, stockFilter]);

  // Turunannya dipakai form supaya tidak ada kondisi "sedang ganti satuan
  // dasar" yang dihitung dua kali dengan cara berbeda.
  const { units: cleanUnits } = validateUnits(unitRows);
  const baseLabel = cleanUnits.find((unit) => unit.is_base)?.name || '';
  const rebasing = Boolean(editing) && changesBaseUnit(cleanUnits, currentBaseName(editing));
  const busy = createMutation.isPending || updateMutation.isPending;

  const columns = [
    {
      key: 'name',
      header: 'Produk',
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-2.5 min-w-0">
          {item.image ? (
            <img
              src={item.image}
              alt=""
              className="w-8 h-8 rounded-lg object-cover shrink-0"
            />
          ) : (
            <span className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-base text-on-surface-variant" aria-hidden="true">
                inventory_2
              </span>
            </span>
          )}
          <div className="min-w-0">
            <p className="font-medium text-on-surface truncate">{item.name}</p>
            <p className="text-2xs text-on-surface-variant truncate">{item.code || '-'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Kategori',
      render: (item) => (
        <span className="text-on-surface-variant truncate">{item.category?.name || '-'}</span>
      ),
    },
    {
      key: 'buy_price',
      header: 'Harga Beli',
      align: 'right',
      sortable: true,
      render: (item) => <Money value={item.buy_price} variant="muted" className="text-xs" />,
    },
    {
      key: 'sell_price',
      header: 'Harga Jual',
      align: 'right',
      sortable: true,
      render: (item) => <Money value={item.sell_price} variant="strong" />,
    },
    {
      key: 'stock',
      header: 'Stok',
      align: 'right',
      sortable: true,
      render: (item) => (
        <span className="tabular-nums text-on-surface">
          {(function(){const st=Number(item.stock)||0;const base=item.base_unit||item.unit||'';const pack=(item.units||[]).find(u=>!u.is_base);if(pack&&Number(pack.factor)>1){const d=Math.floor(st/Number(pack.factor));const r=st%Number(pack.factor);return d+' '+pack.name+(r? ' + '+r+' '+base:'')+' ('+st+' '+base+')';}return st+' '+base;})()}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => (
        <StatusBadge kind="stock" value={stockStatus(item.stock, item.min_stock)} />
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
        title="Produk"
        subtitle="Katalog barang, satuan, dan harga jual"
        breadcrumbs={[{ label: 'Master Data', to: '/produk' }, { label: 'Produk' }]}
        actions={
          <Button icon="add" size="sm" onClick={openCreate}>
            Tambah Produk
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Cari nama atau kode produk…"
          className="sm:max-w-xs"
        />
        <Select
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          aria-label="Filter kategori"
          className="sm:max-w-[200px]"
        >
          <option value="">Semua kategori</option>
          {(categories || []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <Select
          value={stockFilter}
          onChange={(event) => setStockFilter(event.target.value)}
          aria-label="Filter stok"
          className="sm:max-w-[180px]"
        >
          <option value="">Semua stok</option>
          <option value="low">Stok menipis</option>
          <option value="habis">Stok habis</option>
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={products}
        rowKey={(row) => row.id}
        loading={isLoading}
        minWidth="820px"
        onRowClick={(row) => navigate(`/produk/${row.id}`)}
        emptyState={
          isError ? (
            <div role="alert" className="py-6 text-center">
              <p className="text-sm font-medium text-danger">Gagal memuat produk</p>
              <p className="text-xs text-on-surface-variant mt-1">
                {error?.response?.status
                  ? `Server merespons dengan kesalahan (${error.response.status}).`
                  : 'Periksa koneksi internet Anda lalu coba lagi.'}
              </p>
            </div>
          ) : (
            <EmptyState
              icon="inventory_2"
              title={search || categoryId || stockFilter ? 'Produk tidak ditemukan' : 'Belum ada produk'}
              description={
                search || categoryId || stockFilter
                  ? 'Coba ubah kata kunci atau kosongkan filter.'
                  : 'Tambahkan produk pertama Anda untuk mulai mencatat penjualan.'
              }
              action={
                <Button size="sm" icon="add" onClick={openCreate}>
                  Tambah Produk
                </Button>
              }
            />
          )
        }
        cardTitle={(item) => item.name}
        cardMeta={(item) => `${item.code || '-'} · ${item.category?.name || 'Tanpa kategori'}`}
        cardBadge={(item) => <Money value={item.sell_price} variant="strong" />}
        cardFields={[
          { label: 'Harga Beli', render: (item) => <Money value={item.buy_price} variant="muted" /> },
          {
            label: 'Stok',
            render: (item) => (
              <span className="tabular-nums">
                {(function(){const st=Number(item.stock)||0;const base=item.base_unit||item.unit||'';const pack=(item.units||[]).find(u=>!u.is_base);if(pack&&Number(pack.factor)>1){const d=Math.floor(st/Number(pack.factor));const r=st%Number(pack.factor);return d+' '+pack.name+(r? ' + '+r+' '+base:'')+' ('+st+' '+base+')';}return st+' '+base;})()}
              </span>
            ),
          },
          {
            label: 'Status',
            render: (item) => (
              <StatusBadge kind="stock" value={stockStatus(item.stock, item.min_stock)} />
            ),
          },
          {
            label: 'Satuan Turunan',
            render: (item) => unitSummary(item) || '-',
          },
        ]}
        cardActions={(item) => (
          <>
            <button
              type="button"
              onClick={() => navigate(`/produk/${item.id}`)}
              className="flex-1 py-3 text-xs font-medium text-primary hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                visibility
              </span>
              Detail
            </button>
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
          title={editing ? 'Edit Produk' : 'Tambah Produk'}
          subtitle={editing ? editing.code || undefined : 'Isi data produk baru'}
          variant="sheet"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={closeModal}>
                Batal
              </Button>
              <Button size="sm" onClick={handleSubmit} loading={busy}>
                {rebasing ? 'Lanjut…' : editing ? 'Simpan Perubahan' : 'Simpan'}
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

            <FormField label="Nama produk" required>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Masukkan nama produk"
                required
                autoFocus
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Kategori">
                <Select
                  value={form.category_id}
                  onChange={(event) => setForm({ ...form, category_id: event.target.value })}
                >
                  <option value="">Tanpa kategori</option>
                  {(categories || []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </FormField>

            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Satuan dasar">
                <Input
                  value={unitRows[0]?.name || ''}
                  onChange={(e) => setUnitRows((rows) => {
                    const next = [...rows];
                    next[0] = { ...(next[0] || {}), name: e.target.value, is_base: true, factor: 1 };
                    return next;
                  })}
                  placeholder="botol"
                />
              </FormField>
              <FormField label="Satuan kemasan">
                <Input
                  value={unitRows[1]?.name || ''}
                  onChange={(e) => setUnitRows((rows) => {
                    const next = [...rows];
                    next[1] = { ...(next[1] || {}), name: e.target.value, is_base: false };
                    return next;
                  })}
                  placeholder="dos"
                />
              </FormField>
            </div>

            <FormField label="Isi per dos (botol)">
              <Input
                type="number"
                min="1"
                value={unitRows[1]?.factor ?? ''}
                onChange={(e) => setUnitRows((rows) => {
                  const next = [...rows];
                  next[1] = { ...(next[1] || {}), factor: e.target.value, is_base: false };
                  return next;
                })}
                placeholder="24"
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Harga beli per dos">
                <MoneyInput
                  value={unitRows[1]?.buy_price ?? ''}
                  onChange={(value) => setUnitRows((rows) => {
                    const next = [...rows];
                    next[1] = { ...(next[1] || {}), buy_price: value, is_base: false };
                    return next;
                  })}
                />
              </FormField>
              <FormField label="Harga grosir per dos">
                <MoneyInput
                  value={unitRows[1]?.sell_price ?? ''}
                  onChange={(value) => setUnitRows((rows) => {
                    const next = [...rows];
                    next[1] = { ...(next[1] || {}), sell_price: value, is_base: false };
                    return next;
                  })}
                />
              </FormField>
            </div>

            <FormField label="Harga eceran per botol">
              <MoneyInput
                value={unitRows[0]?.sell_price ?? ''}
                onChange={(value) => setUnitRows((rows) => {
                  const next = [...rows];
                  next[0] = { ...(next[0] || {}), sell_price: value, is_base: true, factor: 1 };
                  return next;
                })}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">

              <FormField
                label={`Stok${baseLabel ? ` (${baseLabel})` : ''}`}
                hint={rebasing ? 'Dihitung otomatis dari rasio satuan' : undefined}
              >
                <Input
                  type="number"
                  min="0"
                  value={rebasing ? '' : form.stock}
                  disabled={rebasing}
                  onChange={(event) => setForm({ ...form, stock: event.target.value })}
                  placeholder={rebasing ? 'otomatis' : '0'}
                />
              </FormField>
            </div>

            <FormField label={`Stok minimum${baseLabel ? ` (${baseLabel})` : ''}`}>
              <Input
                type="number"
                min="0"
                value={form.min_stock}
                onChange={(event) => setForm({ ...form, min_stock: event.target.value })}
                placeholder="0"
              />
            </FormField>

            <FormField label="Supplier">
              <Select
                value={form.supplier_id}
                onChange={(event) => setForm({ ...form, supplier_id: event.target.value })}
              >
                <option value="">Tanpa supplier</option>
                {(suppliers || []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </form>
        </Modal>
      )}

        <ConfirmDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          title="Hapus produk?"
          message={`Produk "${deleteTarget?.name ?? ''}" akan dihapus dari katalog beserta riwayat stok & item transaksinya.`}
          detail="Tindakan ini tidak bisa dibatalkan."
          confirmLabel="Hapus"
          loading={deleteMutation.isPending}
        />

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
    </div>
  );
}
