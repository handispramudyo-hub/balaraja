import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { formatCurrency } from '../../lib/format';
import api from '../../services/api';
import { toast } from 'sonner';
import {
  availableIn,
  baseUnitOfProduct,
  factorOf,
  priceIn,
  sellableUnits,
} from '../../components/products/unitRules';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import Badge from '../../components/ui/Badge';
import Money from '../../components/ui/Money';
import FormField from '../../components/ui/FormField';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import DateInput from '../../components/ui/DateInput';
import Textarea from '../../components/ui/Textarea';
import MoneyInput from '../../components/ui/MoneyInput';

export default function CreatePurchase() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    date: today,
    supplier_id: '',
    due_date: '',
    payment: '',
    payment_method: 'cash',
    installment_months: '',
    notes: '',
    items: [],
  });

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const res = await api.get('/suppliers');
      return res.data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await api.get('/products');
      return res.data;
    },
  });

  const { data: existingPurchase } = useQuery({
    queryKey: ['purchase-edit', id],
    queryFn: async () => {
      const res = await api.get(`/purchases/${id}`);
      return res.data;
    },
    enabled: isEdit,
  });

  // Isi form dari data yang dimuat, ditulis saat render (bukan useEffect)
  // supaya tidak ada render bertingkat dan edit user tidak tertimpa.
  const [hydratedFrom, setHydratedFrom] = useState(null);

  if (isEdit && existingPurchase && hydratedFrom !== existingPurchase.id) {
    setHydratedFrom(existingPurchase.id);
    setForm({
      date: existingPurchase.date?.split('T')[0] || today,
      supplier_id: existingPurchase.supplier_id || '',
      due_date: existingPurchase.due_date?.split('T')[0] || '',
      // DP TIDAK di-hydrate ke form. Saat edit, pembayaran awal sudah
      // tercatat sebagai baris di `supplier_payments`; mengisinya lagi di
      // sini akan terhitung dobel. Nominal pembayaran yang sudah ada diatur
      // dari halaman pelunasan.
      payment: '',
      payment_method: 'cash',
      installment_months: '',
      notes: existingPurchase.note || '',
      // `unit_id` disalin dari snapshot item. Transaksi lama tidak punya nilainya,
      // jadi dikosongkan agar form memakai satuan dasar produk.
      items: (existingPurchase.items || []).map((item) => ({
        product_id: String(item.product_id || ''),
        unit_id: item.unit_id == null ? '' : String(item.unit_id),
        quantity: String(item.quantity || '1'),
        buy_price: String(item.buy_price || '0'),
      })),
    });
  }

  const supplierList = suppliers?.data || suppliers || [];
  const productList = products?.data || products || [];

  const addItem = () => {
    setForm((f) => ({
      ...f,
      items: [...f.items, { product_id: '', unit_id: '', quantity: '1', buy_price: '0' }],
    }));
  };

  const removeItem = (index) => {
    setForm((f) => ({
      ...f,
      items: f.items.filter((_, i) => i !== index),
    }));
  };

  const updateItem = (index, field, value) => {
    setForm((f) => ({
      ...f,
      items: f.items.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, [field]: value };
        if (field === 'product_id') {
          // Ganti produk selalu kembali ke satuan dasar produk itu.
          updated.unit_id = '';
          const product = productList.find((p) => p.id === Number(value));
          updated.buy_price = String(product?.buy_price || 0);
        }
        if (field === 'unit_id') {
          // Harga di field ini per satuan yang dipilih, jadi harus ikut
          // dikali faktor. Kalau tidak, "beli 1 dus" dicatat dengan harga
          // per btl dan HPP-nya 24 kali terlalu kecil.
          const product = productList.find((p) => p.id === Number(item.product_id));
          if (product) {
            updated.buy_price = String(priceIn(product, value, Number(product.buy_price) || 0));
          }
        }
        return updated;
      }),
    }));
  };

  const total = form.items.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.buy_price) || 0)), 0);

  const mutation = useMutation({
    mutationFn: async (data) => {
      if (isEdit) {
        const res = await api.put(`/purchases/${id}`, data);
        return res.data;
      }
      const res = await api.post('/purchases', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(isEdit ? 'Pembelian berhasil diperbarui' : 'Pembelian berhasil disimpan');
      navigate('/pembelian');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Gagal menyimpan pembelian');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (form.items.length === 0) {
      toast.error('Tambahkan minimal satu item');
      return;
    }
    if (!form.supplier_id) {
      toast.error('Pilih supplier terlebih dahulu');
      return;
    }
    const dp = Number(form.payment) || 0;
    if (dp > total) {
      toast.error(`Pembayaran awal tidak boleh melebihi total (${formatCurrency(total)})`);
      return;
    }
    if (form.due_date && form.due_date < form.date) {
      toast.error('Jatuh tempo tidak boleh sebelum tanggal transaksi');
      return;
    }

    const { notes, ...rest } = form;
    const months = Number(form.installment_months) || 0;

    mutation.mutate({
      ...rest,
      // Saat edit, `payment` sengaja TIDAK dikirim. Pembayaran hanya boleh
      // dibuat saat transaksi pertama dibuat; kalau boleh diubah di form
      // edit, user bisa menambah pembayaran tanpa pernah menyentuhnya di
      // halaman pelunasan dan riwayat pembayarannya jadi tidak bisa ditelusuri.
      ...(isEdit
        ? {}
        : {
            // Cicilan dan DP adalah dua hal yang berbeda: kalau "Cicilan"
            // yang dipilih, tidak ada DP - seluruh total dibagi rata.
            // Mengirim keduanya sekaligus akan membuat user membayar
            // sebagian sekarang lalu ditagih lagi sesuai jadwal.
            payment: months ? undefined : dp || undefined,
            payment_method: form.payment_method,
          }),
      // Hanya saat create. Saat edit, tenor diubah lewat endpoint
      // /installment-plans/{id} supaya perhitungannya tetap di satu
      // tempat (InstallmentService), bukan menyalin logika di form.
      ...(isEdit || !months ? {} : { installment_months: months }),
      due_date: form.due_date || null,
      note: notes,
      items: form.items.map((item) => {
        const product = productList.find((p) => p.id === Number(item.product_id));
        const unit = sellableUnits(product).find((u) => String(u.id) === String(item.unit_id));

        return {
          product_id: Number(item.product_id) || 0,
          // Dikosongkan berarti "pakai satuan dasar". Dikirim eksplisit supaya
          // server tidak perlu menebak dari teks nama satuan.
          unit_id: item.unit_id === '' ? null : Number(item.unit_id),
          unit_name: unit?.name ?? null,
          quantity: Number(item.quantity) || 0,
          buy_price: Number(item.buy_price) || 0,
        };
      }),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-4 pb-28 md:pb-6">
      <PageHeader
        title={isEdit ? 'Edit Pembelian' : 'Pembelian Baru'}
        subtitle="Catat barang masuk dan pembayaran ke supplier"
        breadcrumbs={[
          { label: 'Pembelian', to: '/pembelian' },
          { label: isEdit ? 'Edit' : 'Tambah' },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          <section className="rounded-card border border-outline-variant/70 bg-surface-container-lowest p-4 space-y-3.5">
            <h2 className="text-sm font-semibold text-on-surface">Informasi Pembelian</h2>

            <FormField label="Supplier" required>
              <Select
                value={form.supplier_id}
                onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))}
                required
              >
                <option value="">Pilih supplier</option>
                {supplierList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Tanggal" required>
                <DateInput
                  value={form.date}
                  onChange={(value) => setForm((f) => ({ ...f, date: value }))}
                  required
                />
              </FormField>
              <FormField
                label="Jatuh Tempo"
                hint="Kosongkan kalau dibayar penuh. Sisa utang muncul di daftar pembelian."
              >
                <DateInput
                  value={form.due_date}
                  min={form.date}
                  onChange={(value) => setForm((f) => ({ ...f, due_date: value }))}
                />
              </FormField>
            </div>

            {!isEdit && (
              <>
                <FormField label="Sisa Utang">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={!form.installment_months ? 'primary' : 'outline'}
                      onClick={() => setForm((f) => ({ ...f, installment_months: '' }))}
                    >
                      Bayar Penuh
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={form.installment_months ? 'primary' : 'outline'}
                      onClick={() =>
                        setForm((f) => ({ ...f, installment_months: f.installment_months || 3 }))
                      }
                    >
                      Cicilan
                    </Button>
                  </div>
                </FormField>

                {form.installment_months ? (
                  <FormField
                    label="Jumlah Angsuran (bulan)"
                    hint={
                      total > 0 && Number(form.installment_months) > 0
                        ? `Sekitar ${formatCurrency(
                            Math.floor((total / Number(form.installment_months)) * 100) / 100
                          )} per bulan. Sisa pembulatan masuk ke angsuran terakhir.`
                        : 'Total dibagi rata, sisa pembulatan masuk ke angsuran terakhir.'
                    }
                  >
                    <Input
                      type="number"
                      min="1"
                      max="36"
                      step="1"
                      value={form.installment_months}
                      onChange={(e) => setForm((f) => ({ ...f, installment_months: e.target.value }))}
                    />
                  </FormField>
                ) : (
                  <FormField
                    label="Pembayaran Awal (DP)"
                    hint="Sisa yang belum dibayar akan menjadi utang ke supplier."
                  >
                    <MoneyInput
                      value={form.payment}
                      onChange={(value) => setForm((f) => ({ ...f, payment: value }))}
                    />
                  </FormField>
                )}

                {Number(form.payment) > 0 && (
                  <FormField label="Metode DP">
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'cash', label: 'Tunai' },
                        { value: 'transfer', label: 'Transfer' },
                        { value: 'other', label: 'Lainnya' },
                      ].map((m) => (
                        <Button
                          key={m.value}
                          type="button"
                          size="sm"
                          variant={form.payment_method === m.value ? 'primary' : 'outline'}
                          onClick={() => setForm((f) => ({ ...f, payment_method: m.value }))}
                        >
                          {m.label}
                        </Button>
                      ))}
                    </div>
                  </FormField>
                )}
              </>
            )}

            <FormField label="Catatan">
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Opsional"
                rows={2}
              />
            </FormField>
          </section>

          <section className="rounded-card border border-outline-variant/70 bg-surface-container-lowest p-4 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-on-surface">Daftar Item</h2>
              <Badge tone="neutral" size="sm">
                {form.items.length} item
              </Badge>
            </div>

            {form.items.length === 0 ? (
              <div className="rounded-field border border-dashed border-outline-variant bg-surface-container-low px-4 py-8 text-center">
                <span className="material-symbols-outlined text-2xl text-outline" aria-hidden="true">
                  inventory_2
                </span>
                <p className="mt-1 text-sm text-on-surface">Belum ada item</p>
                <p className="text-xs text-on-surface-variant">
                  Klik “Tambah Item” untuk menambahkan barang yang dibeli.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {form.items.map((item, idx) => {
                  const product = productList.find((p) => p.id === Number(item.product_id));
                  const unitOptions = sellableUnits(product);
                  const selectedUnit =
                    unitOptions.find((u) => String(u.id) === String(item.unit_id)) ||
                    baseUnitOfProduct(product);
                  const subtotal = (Number(item.quantity) || 0) * (Number(item.buy_price) || 0);

                  return (
                    <div
                      key={idx}
                      className="relative rounded-field border border-outline-variant/70 bg-surface-container-low/40 p-3 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-2xs font-medium uppercase tracking-wide text-on-surface-variant">
                          Item {idx + 1}
                        </span>
                        <IconButton
                          icon="delete"
                          label={`Hapus item ${idx + 1}`}
                          size="sm"
                          tone="danger"
                          onClick={() => removeItem(idx)}
                        />
                      </div>

                      <FormField label="Produk" required>
                        <Select
                          value={item.product_id}
                          onChange={(e) => updateItem(idx, 'product_id', e.target.value)}
                          required
                        >
                          <option value="">Pilih produk</option>
                          {productList.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </Select>
                      </FormField>

                      {unitOptions.length > 1 && (
                        <FormField label="Satuan Beli">
                          <Select
                            value={item.unit_id === '' ? String(selectedUnit?.id ?? '') : item.unit_id}
                            onChange={(e) => updateItem(idx, 'unit_id', e.target.value)}
                          >
                            {unitOptions.map((u) => (
                              <option key={u.id ?? 'base'} value={u.id ?? ''}>
                                {u.name}
                                {u.is_base
                                  ? ` (${baseUnitOfProduct(product)?.name || 'satuan dasar'})`
                                  : ` (1 ${u.name} = ${u.factor} ${baseUnitOfProduct(product)?.name || 'satuan dasar'})`}
                              </option>
                            ))}
                          </Select>
                        </FormField>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <FormField label={`Qty${selectedUnit && !selectedUnit.is_base ? ` (${selectedUnit.name})` : ''}`}>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                            required
                          />
                        </FormField>
                        <FormField label={`Harga per ${selectedUnit?.name || 'satuan'}`}>
                          <Input
                            type="number"
                            min="0"
                            value={item.buy_price}
                            onChange={(e) => updateItem(idx, 'buy_price', e.target.value)}
                            required
                          />
                        </FormField>
                      </div>

                      {product && (
                        <p className="text-2xs text-on-surface-variant">
                          Stok saat ini {availableIn(product, item.unit_id)} {selectedUnit?.name || ''}
                          {factorOf(product, item.unit_id) > 1 && (
                            <> ({product.stock} {baseUnitOfProduct(product)?.name})</>
                          )}
                        </p>
                      )}

                      <div className="flex items-center justify-between border-t border-outline-variant/50 pt-2">
                        <span className="text-xs font-medium text-on-surface-variant">Subtotal</span>
                        <Money value={subtotal} variant="strong" className="text-sm" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <Button type="button" variant="outline" icon="add" fullWidth onClick={addItem}>
              Tambah Item
            </Button>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4">
          <section className="rounded-card border border-outline-variant/70 bg-surface-container-lowest p-4">
            <h2 className="text-sm font-semibold text-on-surface">Ringkasan</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-on-surface-variant">Total Item</dt>
                <dd className="font-medium text-on-surface tabular-nums">{form.items.length}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-on-surface-variant">Subtotal</dt>
                <dd className="font-medium text-on-surface tabular-nums">{formatCurrency(total)}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-outline-variant/60 pt-3">
                <dt className="font-semibold text-on-surface">Total Pembelian</dt>
                <dd className="text-lg font-bold text-primary tabular-nums">{formatCurrency(total)}</dd>
              </div>
            </dl>
          </section>

          <div className="hidden lg:flex gap-2">
            <Button
              type="button"
              variant="outline"
              fullWidth
              onClick={() => navigate('/pembelian')}
            >
              Batal
            </Button>
            <Button type="submit" fullWidth loading={mutation.isPending}>
              {isEdit ? 'Update Pembelian' : 'Simpan Pembelian'}
            </Button>
          </div>
        </aside>
      </div>

      <div className="lg:hidden fixed left-0 w-full bg-surface border-t border-outline-variant/70 p-3 flex gap-2 create-bottom-bar z-40">
        <Button
          type="button"
          variant="outline"
          fullWidth
          onClick={() => navigate('/pembelian')}
        >
          Batal
        </Button>
        <Button type="submit" fullWidth loading={mutation.isPending}>
          {isEdit ? 'Update' : 'Simpan'}
        </Button>
      </div>
    </form>
  );
}
