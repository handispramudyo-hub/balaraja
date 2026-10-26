import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { formatCurrency } from '../../lib/format';
import api from '../../services/api';
import { toast } from 'sonner';
import {
  availableIn,
  baseUnitOfProduct,
  cumulativeShortage,
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

const paymentMethods = [
  { key: 'tunai', label: 'Tunai' },
  { key: 'transfer', label: 'Transfer' },
  { key: 'tempo', label: 'Tempo' },
];

export default function CreateSale() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    date: today,
    customer_id: '',
    due_date: '',
    notes: '',
    amount_paid: 0,
    payment_method: 'tunai',
    installment_months: '',
    items: [],
  });

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const res = await api.get('/customers');
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

  const { data: existingSale } = useQuery({
    queryKey: ['sale-edit', id],
    queryFn: async () => {
      const res = await api.get(`/sales/${id}`);
      return res.data;
    },
    enabled: isEdit,
  });

  // Isi form dari data yang dimuat, ditulis saat render (bukan useEffect)
  // supaya tidak ada render bertingkat dan edit user tidak tertimpa.
  const [hydratedFrom, setHydratedFrom] = useState(null);

  if (isEdit && existingSale && hydratedFrom !== existingSale.id) {
    setHydratedFrom(existingSale.id);
    setForm({
      date: existingSale.date?.split('T')[0] || today,
      customer_id: existingSale.customer_id || '',
      due_date: existingSale.due_date?.split('T')[0] || '',
      notes: existingSale.note || '',
      amount_paid: String(existingSale.payment || ''),
      payment_method: 'tunai',
      // Disalin dari transaksi induk supaya form edit tahu penjualan ini
      // memang dicicilkan. Menyetel `payment_method`/DP di form edit tidak
      // ada efek ke jadwal - tenor diubah dari halaman daftar angsuran.
      installment_months: existingSale.installment_plan?.months
        ? String(existingSale.installment_plan.months)
        : '',
      // `unit_id` disalin dari snapshot item. Kalau tidak ada (transaksi lama
      // sebelum fitur satuan), dikosongkan supaya form memilih satuan dasar
      // produk - bukan satuan acak yang kebetulan ada di urutan pertama.
      items: (existingSale.items || []).map((item) => ({
        product_id: String(item.product_id || ''),
        unit_id: item.unit_id == null ? '' : String(item.unit_id),
        quantity: String(item.quantity || '1'),
        sell_price: String(item.sell_price || '0'),
      })),
    });
  }

  const customerList = customers?.data || customers || [];
  const productList = products?.data || products || [];

  const addItem = () => {
    setForm((f) => ({
      ...f,
      items: [...f.items, { product_id: '', unit_id: '', quantity: '1', sell_price: '0' }],
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
          // Ganti produk selalu kembali ke satuan dasar. Satuan dasar produk
          // lain tidak punya arti untuk produk ini.
          updated.unit_id = '';
          const product = productList.find((p) => p.id === Number(value));
          updated.sell_price = String(product?.sell_price || 0);
        }

        if (field === 'unit_id') {
          // Harga di field ini per satuan yang dipilih. Menukar satuan tanpa
          // ikut menukar harga akan meninggalkan harga per btl di kolom yang
          // informasinya "per dus" - dan totalnya langsung salah.
          const product = productList.find((p) => p.id === Number(item.product_id));
          if (product) {
            updated.sell_price = String(priceIn(product, value, Number(product.sell_price) || 0));
          }
        }

        return updated;
      }),
    }));
  };

  const total = form.items.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.sell_price) || 0)), 0);
  const amountPaid = Number(form.amount_paid) || 0;
  const remainingBalance = total - amountPaid;

  /**
   * Peringatan stok harus dihitung dalam satuan dasar.
   *
   * `product.stock` disimpan dalam satuan dasar, sedangkan yang diketik user
   * bisa "1 dus". Membandingkan 1 > 792 akan lolos padahal 1 dus = 24 btl
   * dan stoknya benar-benar 33 dus. Perbandingan salah di sini membuat form
   * mengizinkan penjualan yang pasti ditolak server.
   */
  const stockWarnings = (() => {
    const cum = cumulativeShortage(form.items, productList);
    return cum.map((w) => {
      const product = productList.find((p) => p.id === w.productId);
      if (!product) return w;
      const factor = factorOf(product, '');
      const unitName = baseUnitOfProduct(product)?.name || product?.unit || '';
      const available = factor > 0 ? Math.floor(w.stock / factor) : 0;
      return {
        index: 0,
        name: w.productName,
        requested: factor > 0 ? Math.floor(w.requested / factor) : w.requested,
        available,
        unitName,
      };
    });
  })();

  const mutation = useMutation({
    mutationFn: async (data) => {
      if (isEdit) {
        const res = await api.put(`/sales/${id}`, data);
        return res.data;
      }
      const res = await api.post('/sales', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['sale-detail'] });
      toast.success(isEdit ? 'Penjualan berhasil diperbarui' : 'Penjualan berhasil disimpan');
      navigate('/penjualan');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Gagal menyimpan penjualan');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (form.items.length === 0) {
      toast.error('Tambahkan minimal satu item');
      return;
    }
    if (!form.customer_id) {
      toast.error('Pilih toko terlebih dahulu');
      return;
    }
    if (stockWarnings.length > 0 && !isEdit) {
      toast.error('Ada item dengan jumlah melebihi stok yang tersedia');
      return;
    }
    const months = Number(form.installment_months) || 0;

    mutation.mutate({
      date: form.date,
      customer_id: form.customer_id,
      due_date: form.due_date || null,
      note: form.notes,
      // Cicilan berarti seluruh total dibagi rata, jadi tidak ada pembayaran
      // di muka. Mengirim `amount_paid` bersamaan dengan
      // `installment_months` akan membuat pelanggan ditagih dua kali untuk
      // nominal yang sama: sekali sekarang, sekali lagi sesuai jadwal.
      payment: months ? 0 : Number(form.amount_paid) || 0,
      // Hanya saat create. Saat edit, tenor diubah lewat endpoint
      // /installment-plans/{id} supaya perhitungannya tetap di satu tempat.
      ...(isEdit || !months ? {} : { installment_months: months }),
      items: form.items.map((item) => {
        const product = productList.find((p) => p.id === Number(item.product_id));
        const unit = sellableUnits(product).find((u) => String(u.id) === String(item.unit_id));

        return {
          product_id: Number(item.product_id) || 0,
          // Dikosongkan berarti "pakai satuan dasar". Dikirim eksplisit
          // supaya server tidak perlu menebak dari teks nama satuan yang
          // bisa saja berubah karena ejaan.
          unit_id: item.unit_id === '' ? null : Number(item.unit_id),
          unit_name: unit?.name ?? null,
          quantity: Number(item.quantity) || 0,
          sell_price: Number(item.sell_price) || 0,
        };
      }),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-4 pb-28 md:pb-6">
      <PageHeader
        title={isEdit ? 'Edit Penjualan' : 'Penjualan Baru'}
        subtitle="Catat barang keluar dan pembayaran dari pelanggan"
        breadcrumbs={[
          { label: 'Penjualan', to: '/penjualan' },
          { label: isEdit ? 'Edit' : 'Tambah' },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          <section className="rounded-card border border-outline-variant/70 bg-surface-container-lowest p-4 space-y-3.5">
            <h2 className="text-sm font-semibold text-on-surface">Informasi Transaksi</h2>

            <FormField label="Pelanggan" required>
              <Select
                value={form.customer_id}
                onChange={(e) => setForm((f) => ({ ...f, customer_id: e.target.value }))}
                required
              >
                <option value="">Pilih pelanggan</option>
                {customerList.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Tanggal Transaksi" required>
                <DateInput
                  value={form.date}
                  onChange={(value) => setForm((f) => ({ ...f, date: value }))}
                  required
                />
              </FormField>
              <FormField
                label="Jatuh Tempo"
                hint="Kosongkan kalau dibayar lunas sekarang."
              >
                <DateInput
                  value={form.due_date}
                  onChange={(value) => setForm((f) => ({ ...f, due_date: value }))}
                />
              </FormField>
            </div>

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
              <h2 className="text-sm font-semibold text-on-surface">Detail Barang</h2>
              <Badge tone="neutral" size="sm">
                {form.items.length} item
              </Badge>
            </div>

            {stockWarnings.length > 0 && (
              <div className="flex items-start gap-2 rounded-field border border-warning-container bg-warning-container/40 px-3 py-2">
                <span className="material-symbols-outlined text-base text-on-warning-container" aria-hidden="true">
                  warning
                </span>
                <p className="text-xs text-on-warning-container">
                  Stok tidak cukup: {stockWarnings.map((w) => `${w.name} (butuh ${w.requested} ${w.unitName}, tersedia ${w.available})`).join(', ')}
                </p>
              </div>
            )}

            {form.items.length === 0 ? (
              <div className="rounded-field border border-dashed border-outline-variant bg-surface-container-low px-4 py-8 text-center">
                <span className="material-symbols-outlined text-2xl text-outline" aria-hidden="true">
                  inventory_2
                </span>
                <p className="mt-1 text-sm text-on-surface">Belum ada item</p>
                <p className="text-xs text-on-surface-variant">
                  Klik “Tambah Item” untuk menambahkan barang yang dijual.
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
                  const factor = factorOf(product, item.unit_id);
                  const isOverStock =
                    product && (Number(item.quantity) || 0) * factor > (Number(product.stock) || 0);
                  const subtotal = (Number(item.quantity) || 0) * (Number(item.sell_price) || 0);

                  return (
                    <div
                      key={idx}
                      className={`relative rounded-field border p-3 space-y-3 ${
                        isOverStock
                          ? 'border-danger/50 bg-danger-container/20'
                          : 'border-outline-variant/70 bg-surface-container-low/40'
                      }`}
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
                        <FormField label="Satuan Jual">
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
                        <FormField
                          label={`Qty${selectedUnit && !selectedUnit.is_base ? ` (${selectedUnit.name})` : ''}`}
                          error={isOverStock ? 'Melebihi stok' : undefined}
                        >
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                            invalid={isOverStock}
                            required
                          />
                        </FormField>
                        <FormField label={`Harga per ${selectedUnit?.name || 'satuan'}`}>
                          <Input
                            type="number"
                            min="0"
                            value={item.sell_price}
                            onChange={(e) => updateItem(idx, 'sell_price', e.target.value)}
                            required
                          />
                        </FormField>
                      </div>

                      {product && (
                        <p className="text-2xs text-on-surface-variant">
                          Stok tersedia {availableIn(product, item.unit_id)} {selectedUnit?.name || ''}
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
          <section className="rounded-card border border-outline-variant/70 bg-surface-container-lowest p-4 space-y-3.5">
            <h2 className="text-sm font-semibold text-on-surface">Pembayaran</h2>

            <div className="rounded-field bg-surface-container px-3 py-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-on-surface-variant">
                <span>Total barang ({form.items.length})</span>
                <span className="tabular-nums">{formatCurrency(total)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-outline-variant/60 pt-2">
                <span className="text-sm font-semibold text-on-surface">Total Tagihan</span>
                <Money value={total} variant="strong" className="text-base text-primary" />
              </div>
            </div>

            {!isEdit && (
              <FormField label="Cara Bayar">
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
            )}

            {form.installment_months ? (
              <>
                <FormField
                  label="Jumlah Angsuran (bulan)"
                  hint={
                    total > 0 && Number(form.installment_months) > 0
                      ? `Sekitar ${formatCurrency(
                          Math.floor((total / Number(form.installment_months)) * 100) / 100
                        )} per bulan. Angsuran pertama jatuh tempo 1 bulan dari tanggal transaksi.`
                      : 'Angsuran pertama jatuh tempo 1 bulan dari tanggal transaksi.'
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

                {total > 0 && Number(form.installment_months) > 0 && (
                  <div className="rounded-field border border-primary-container/60 bg-primary-container/20 px-3 py-2.5 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Total dicicilkan</span>
                      <Money value={total} variant="strong" />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Jumlah angsuran</span>
                      <span className="font-semibold text-on-surface">{form.installment_months} bulan</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Angsuran pertama</span>
                      <Money
                        value={Math.floor((total / Number(form.installment_months)) * 100) / 100}
                        variant="strong"
                      />
                    </div>
                    <p className="pt-1 text-on-surface-variant">
                      Jadwal lengkap tersedia di menu Angsuran setelah transaksi disimpan.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                {!isEdit && (
                  <>
                    <FormField label="Metode Pembayaran">
                      <div className="grid grid-cols-3 gap-2">
                        {paymentMethods.map((m) => (
                          <Button
                            key={m.key}
                            type="button"
                            size="sm"
                            variant={form.payment_method === m.key ? 'primary' : 'outline'}
                            onClick={() => {
                              setForm((f) => {
                                const updated = { ...f, payment_method: m.key };
                                if (m.key === 'tunai') updated.amount_paid = String(total);
                                return updated;
                              });
                            }}
                          >
                            {m.label}
                          </Button>
                        ))}
                      </div>
                    </FormField>

                    <FormField label="Jumlah Dibayar">
                      <MoneyInput
                        value={form.amount_paid}
                        onChange={(value) => setForm((f) => ({ ...f, amount_paid: value }))}
                      />
                    </FormField>
                  </>
                )}

                {remainingBalance > 0 ? (
                  <div className="flex items-center justify-between rounded-field border border-danger-container bg-danger-container/30 px-3 py-2.5">
                    <span className="text-xs font-medium text-danger">Sisa Kekurangan</span>
                    <Money value={remainingBalance} variant="danger" className="text-sm" />
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-field border border-success-container bg-success-container px-3 py-2.5">
                    <span className="text-xs font-medium text-on-success-container">Lunas</span>
                    <span className="text-sm font-semibold text-on-success-container">Rp0</span>
                  </div>
                )}
              </>
            )}
          </section>

          <div className="hidden lg:flex gap-2">
            <Button
              type="button"
              variant="outline"
              fullWidth
              onClick={() => navigate('/penjualan')}
            >
              Batal
            </Button>
            <Button type="submit" fullWidth loading={mutation.isPending}>
              {isEdit ? 'Update Penjualan' : 'Simpan Penjualan'}
            </Button>
          </div>
        </aside>
      </div>

      <div className="lg:hidden fixed left-0 w-full bg-surface border-t border-outline-variant/70 p-3 flex gap-2 create-bottom-bar z-40">
        <Button
          type="button"
          variant="outline"
          fullWidth
          onClick={() => navigate('/penjualan')}
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
