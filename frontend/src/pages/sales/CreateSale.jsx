import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { formatCurrency } from '../../utils/format';
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
    <div className="min-h-screen bg-surface pb-28">
      <main className="py-4 max-w-md mx-auto space-y-6">
        {/* Customer & Date */}
        <section className="bg-surface-container-lowest rounded-xl p-4 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] border border-outline-variant space-y-4">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">Pelanggan</label>
            <div className="relative">
              <select
                className="w-full h-12 px-3 border border-outline-variant rounded-lg bg-surface focus:border-primary focus:ring-2 focus:ring-primary focus:outline-none appearance-none text-base text-on-surface"
                value={form.customer_id}
                onChange={(e) => setForm((f) => ({ ...f, customer_id: e.target.value }))}
                required
              >
                <option value="">Pilih Pelanggan</option>
                {customerList.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-3 text-on-surface-variant pointer-events-none">arrow_drop_down</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">Tanggal Transaksi</label>
            <input
              className="w-full h-12 px-3 border border-outline-variant rounded-lg bg-surface focus:border-primary focus:ring-2 focus:ring-primary focus:outline-none text-base text-on-surface"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">Jatuh Tempo (Opsional)</label>
            <input
              className="w-full h-12 px-3 border border-outline-variant rounded-lg bg-surface focus:border-primary focus:ring-2 focus:ring-primary focus:outline-none text-base text-on-surface"
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">Catatan</label>
            <textarea
              className="w-full px-3 py-3 border border-outline-variant rounded-lg bg-surface focus:border-primary focus:ring-2 focus:ring-primary focus:outline-none text-base text-on-surface"
              placeholder="Catatan opsional..."
              rows="2"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </section>

        {/* Items Section */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-primary">Detail Barang</h2>

          {form.items.length === 0 ? (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant/40 mb-2 block">inventory_2</span>
              <p className="text-sm text-on-surface-variant mb-4">Belum ada item ditambahkan</p>
              <button
                type="button"
                onClick={addItem}
                className="w-full h-12 border-2 border-dashed border-outline text-on-surface-variant rounded-xl text-xs font-medium flex items-center justify-center gap-2 hover:bg-surface-container-highest hover:border-primary hover:text-primary transition-all"
              >
                <span className="material-symbols-outlined">add_circle</span> Tambah Barang Lain
              </button>
            </div>
          ) : (
            <>
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
                    className={`bg-surface-container-lowest rounded-xl p-4 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] border ${isOverStock ? 'border-error rounded-lg bg-error-container/20' : 'border-outline-variant'}`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex gap-3 items-center">
                        <div className="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center overflow-hidden">
                          <span className="material-symbols-outlined text-on-surface-variant">
                            {product?.image_url ? 'image' : 'inventory_2'}
                          </span>
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-on-surface">
                            {product?.name || 'Pilih Produk'}
                          </h3>
                          <p className="text-sm text-on-surface-variant">
                            {product
                              ? `Stok: ${availableIn(product, item.unit_id)} ${selectedUnit?.name || ''}`
                              : 'Pilih produk untuk melihat stok'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="text-error p-1 hover:bg-error-container rounded-full transition-colors"
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>

                    {/* Product select */}
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">Produk</label>
                      <select
                        value={item.product_id}
                        onChange={(e) => updateItem(idx, 'product_id', e.target.value)}
                        className="w-full h-12 px-3 border border-outline-variant rounded-lg bg-surface focus:border-primary focus:ring-2 focus:ring-primary focus:outline-none text-base text-on-surface appearance-none"
                        required
                      >
                        <option value="">Pilih Produk</option>
                        {productList.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    {unitOptions.length > 1 && (
                      <div className="mb-3">
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">
                          Satuan Jual
                        </label>
                        <select
                          value={item.unit_id === '' ? String(selectedUnit?.id ?? '') : item.unit_id}
                          onChange={(e) => updateItem(idx, 'unit_id', e.target.value)}
                          className="w-full h-12 px-3 border border-outline-variant rounded-lg bg-surface focus:border-primary focus:ring-2 focus:ring-primary focus:outline-none text-base text-on-surface appearance-none"
                        >
                          {unitOptions.map((u) => (
                            <option key={u.id ?? 'base'} value={u.id ?? ''}>
                              {u.name}
                              {u.is_base ? ' (satuan dasar)' : ` (1 ${u.name} = ${u.factor} ${baseUnitOfProduct(product)?.name || ''})`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">
                          Kuantitas
                          {selectedUnit && !selectedUnit.is_base && (
                            <span className="font-normal"> ({selectedUnit.name})</span>
                          )}
                        </label>
                        <input
                          className={`w-full h-12 px-3 border rounded-lg bg-surface focus:ring-2 focus:outline-none text-base text-on-surface text-right ${isOverStock ? 'border-error focus:border-error focus:ring-error' : 'border-outline-variant focus:border-primary focus:ring-primary'}`}
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">
                          Harga per {selectedUnit?.name || 'satuan'}
                        </label>
                        <input
                          className="w-full h-12 px-3 border border-outline-variant rounded-lg bg-surface focus:border-primary focus:ring-2 focus:ring-primary focus:outline-none text-base text-on-surface text-right"
                          type="number"
                          min="0"
                          value={item.sell_price}
                          onChange={(e) => updateItem(idx, 'sell_price', e.target.value)}
                          required
                        />
                      </div>
                    </div>                    <div className="flex justify-between items-center border-t border-outline-variant pt-3">
                      <span className="text-xs font-medium text-on-surface-variant">Subtotal</span>
                      <span className="text-lg font-semibold text-on-surface">{formatCurrency(subtotal)}</span>
                    </div>
                  </div>
                );
              })}

              {/* Stock Warnings */}
              {stockWarnings.length > 0 && (
                <div className="bg-tertiary-fixed text-on-tertiary-fixed p-2 rounded-lg flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-tertiary-container" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                  <span className="text-xs font-medium">
                    Peringatan Stok: {stockWarnings.map((w) => `${w.name} (total ${w.requested} ${w.unitName}, tersedia ${w.available})`).join(', ')}
                  </span>
                </div>
              )}

              {/* Add Item Button */}
              <button
                type="button"
                onClick={addItem}
                className="w-full h-12 border-2 border-dashed border-outline text-on-surface-variant rounded-xl text-xs font-medium flex items-center justify-center gap-2 hover:bg-surface-container-highest hover:border-primary hover:text-primary transition-all"
              >
                <span className="material-symbols-outlined">add_circle</span> Tambah Barang Lain
              </button>
            </>
          )}
        </section>

        {/* Payment Section */}
        <section className="bg-surface-container-lowest rounded-xl p-4 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] border border-outline-variant space-y-4">
          <h2 className="text-xl font-semibold text-primary mb-2">Pembayaran</h2>

          {/* Summary */}
          <div className="bg-surface-container rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-sm text-on-surface-variant">
              <span>Total Barang ({form.items.length})</span>
              <span>{formatCurrency(total)}</span>
            </div>
            <div className="flex justify-between text-lg font-semibold text-primary border-t border-outline-variant pt-2">
              <span>Total Tagihan</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Cicilan / Tunai */}
          {!isEdit && (
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-2">Cara Bayar</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, installment_months: '' }))}
                  className={`h-10 rounded-lg text-xs font-medium transition-colors ${
                    !form.installment_months
                      ? 'border border-primary bg-primary text-on-primary'
                      : 'border border-outline-variant bg-surface text-on-surface'
                  }`}
                >
                  Bayar Penuh
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({ ...f, installment_months: f.installment_months || 3 }))
                  }
                  className={`h-10 rounded-lg text-xs font-medium transition-colors ${
                    form.installment_months
                      ? 'border border-primary bg-primary text-on-primary'
                      : 'border border-outline-variant bg-surface text-on-surface'
                  }`}
                >
                  Cicilan
                </button>
              </div>
            </div>
          )}

          {form.installment_months ? (
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">
                Jumlah Angsuran (bulan)
              </label>
              <input
                type="number"
                min="1"
                max="36"
                step="1"
                value={form.installment_months}
                onChange={(e) => setForm((f) => ({ ...f, installment_months: e.target.value }))}
                className="w-full h-12 px-3 border border-outline-variant rounded-lg bg-surface focus:border-primary focus:ring-2 focus:ring-primary focus:outline-none text-base text-on-surface"
              />
              <p className="text-xs text-on-surface-variant mt-1">
                {total > 0 && Number(form.installment_months) > 0 ? (
                  <>
                    Sekitar{' '}
                    <strong className="text-on-surface">
                      {formatCurrency(
                        Math.floor((total / Number(form.installment_months)) * 100) / 100,
                      )}{' '}
                      per bulan
                    </strong>
                    , angsuran pertama jatuh tempo 1 bulan dari tanggal transaksi. Sisa pembulatan
                    masuk ke angsuran terakhir.
                  </>
                ) : (
                  'Angsuran pertama jatuh tempo 1 bulan dari tanggal transaksi.'
                )}
              </p>
            </div>
          ) : (
            <>
              {/* Payment Method Toggle */}
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-2">
                  Metode Pembayaran
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {paymentMethods.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => {
                        setForm((f) => {
                          const updated = { ...f, payment_method: m.key };
                          if (m.key === 'tunai') updated.amount_paid = String(total);
                          return updated;
                        });
                      }}
                      className={`h-10 rounded-lg text-xs font-medium flex items-center justify-center transition-colors ${
                        form.payment_method === m.key
                          ? 'border border-primary bg-primary text-on-primary'
                          : 'border border-outline-variant bg-surface text-on-surface hover:bg-surface-container-high'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount Paid */}
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">
                  Jumlah Dibayar (Rp)
                </label>
                <input
                  className="w-full h-12 px-3 border border-outline-variant rounded-lg bg-surface focus:border-primary focus:ring-2 focus:ring-primary focus:outline-none text-xl font-semibold text-on-surface text-right"
                  type="number"
                  min="0"
                  value={form.amount_paid}
                  onChange={(e) => setForm((f) => ({ ...f, amount_paid: e.target.value }))}
                />
              </div>
            </>
          )}

          {/* Remaining Balance / Lunas */}
          {/* Sisa / Lunas. Saat cicilan aktif, "sisa" sudah punya
              jadwal sendiri - menampilkan sisa di sini akan
              mengulang angka yang sama dalam bentuk berbeda. */}
          {!form.installment_months &&
            (remainingBalance > 0 ? (
              <div className="flex justify-between items-center p-3 bg-error-container/20 rounded-lg border border-error-container">
                <span className="text-xs font-medium text-error">Sisa Kekurangan</span>
                <span className="text-lg font-semibold text-error">{formatCurrency(remainingBalance)}</span>
              </div>
            ) : (
              <div className="flex justify-between items-center p-3 bg-success-container rounded-lg border border-success-fixed">
                <span className="text-xs font-medium text-on-success-container">Lunas</span>
                <span className="text-lg font-semibold text-on-success-container">Rp 0</span>
              </div>
            ))}

          {/* Jatuh Tempo. Tidak relevan kalau sudah ada jadwal angsuran -
              setiap angsuran punya jatuh tempo sendiri. */}
          {remainingBalance > 0 && !form.installment_months && (
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">
                Jatuh Tempo Pembayaran
              </label>
              <input
                className="w-full h-12 px-3 border border-outline-variant rounded-lg bg-surface focus:border-primary focus:ring-2 focus:ring-primary focus:outline-none text-base text-on-surface"
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              />
            </div>
          )}

          {/* Ringkasan cicilan, menggantikan field di atas. */}
          {form.installment_months && total > 0 && Number(form.installment_months) > 0 && (
            <div className="p-3 bg-primary-container/20 rounded-lg border border-primary-container space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">Total dicicilkan</span>
                <span className="font-semibold text-on-surface">{formatCurrency(total)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">Jumlah angsuran</span>
                <span className="font-semibold text-on-surface">{form.installment_months} bulan</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">Angsuran pertama</span>
                <span className="font-semibold text-on-surface">
                  {formatCurrency(Math.floor((total / Number(form.installment_months)) * 100) / 100)}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant pt-1">
                Jadwal lengkap bisa dilihat di menu Angsuran setelah transaksi disimpan.
              </p>
            </div>
          )}
        </section>
      </main>

      {/* Fixed Bottom */}
      <div className="fixed w-full bg-surface border-t border-outline-variant p-4 z-40 create-bottom-bar">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={mutation.isPending}
          className="w-full h-12 bg-primary text-on-primary rounded-xl text-lg font-semibold shadow-sm hover:bg-primary-container hover:text-on-primary-container transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
            {mutation.isPending ? 'progress_activity' : 'save'}
          </span>
          {mutation.isPending ? 'Menyimpan...' : (isEdit ? 'Update Penjualan' : 'Simpan Penjualan')}
        </button>
      </div>
    </div>
  );
}
