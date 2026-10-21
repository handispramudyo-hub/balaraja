import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { formatCurrency } from '../../utils/format';
import api from '../../services/api';
import { toast } from 'sonner';
import {
  availableIn,
  baseUnitOfProduct,
  factorOf,
  priceIn,
  sellableUnits,
} from '../../components/products/unitRules';

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
    <>
      <form onSubmit={handleSubmit}>
        <main className="pb-24 pt-2 max-w-md mx-auto space-y-6">
          {/* Section 1: Informasi Pembelian */}
          <section className="bg-surface-container-lowest p-4 rounded-xl shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] border border-surface-container-low">
            <h2 className="text-xl font-semibold text-on-surface mb-4">Informasi Pembelian</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Supplier</label>
                <div className="relative">
                  <select
                    value={form.supplier_id}
                    onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))}
                    className="w-full border border-outline-variant rounded-lg px-3 py-3 text-sm text-on-surface bg-transparent focus:border-primary focus:ring-1 focus:ring-primary appearance-none"
                    required
                  >
                    <option value="">Pilih Supplier</option>
                    {supplierList.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-3 text-on-surface-variant pointer-events-none">arrow_drop_down</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Tanggal</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full border border-outline-variant rounded-lg px-3 py-3 text-sm text-on-surface bg-transparent focus:border-primary focus:ring-1 focus:ring-primary"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Jatuh Tempo</label>
                <input
                  type="date"
                  value={form.due_date}
                  min={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                  className="w-full border border-outline-variant rounded-lg px-3 py-3 text-sm text-on-surface bg-transparent focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <p className="text-xs text-on-surface-variant mt-1">
                  Kosongkan kalau dibayar penuh. Sisa utang akan muncul di daftar pembelian.
                </p>
              </div>
              {!isEdit && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">Sisa Utang</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, installment_months: '' }))}
                        className={`h-11 rounded-lg text-xs font-semibold transition-colors ${
                          !form.installment_months
                            ? 'bg-primary text-on-primary'
                            : 'border border-outline-variant text-on-surface-variant'
                        }`}
                      >
                        Bayar Penuh
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) => ({ ...f, installment_months: f.installment_months || 3 }))
                        }
                        className={`h-11 rounded-lg text-xs font-semibold transition-colors ${
                          form.installment_months
                            ? 'bg-primary text-on-primary'
                            : 'border border-outline-variant text-on-surface-variant'
                        }`}
                      >
                        Cicilan
                      </button>
                    </div>
                  </div>
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
                        className="w-full border border-outline-variant rounded-lg px-3 py-3 text-sm text-on-surface bg-transparent focus:border-primary focus:ring-1 focus:ring-primary"
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
                            . Sisa pembulatan masuk ke angsuran terakhir.
                          </>
                        ) : (
                          'Total dibagi rata, sisa pembulatan masuk ke angsuran terakhir.'
                        )}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">
                        Pembayaran Awal (DP)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        max={total || undefined}
                        value={form.payment}
                        onChange={(e) => setForm((f) => ({ ...f, payment: e.target.value }))}
                        className="w-full border border-outline-variant rounded-lg px-3 py-3 text-sm text-on-surface bg-transparent focus:border-primary focus:ring-1 focus:ring-primary"
                        placeholder="0"
                      />
                      <p className="text-xs text-on-surface-variant mt-1">
                        Sisa yang belum dibayar akan menjadi utang ke supplier.
                      </p>
                    </div>
                  )}
                  {Number(form.payment) > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">Metode DP</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: 'cash', label: 'Tunai' },
                          { value: 'transfer', label: 'Transfer' },
                          { value: 'other', label: 'Lainnya' },
                        ].map((m) => (
                          <button
                            key={m.value}
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, payment_method: m.value }))}
                            className={`h-11 rounded-lg text-xs font-semibold transition-colors ${
                              form.payment_method === m.value
                                ? 'bg-primary text-on-primary'
                                : 'border border-outline-variant text-on-surface-variant'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Catatan</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-outline-variant rounded-lg px-3 py-3 text-sm text-on-surface bg-transparent focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder="Opsional"
                  rows={2}
                />
              </div>
            </div>
          </section>

          {/* Section 2: Items */}
          <section className="bg-surface-container-lowest p-4 rounded-xl shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] border border-surface-container-low">
            <h2 className="text-xl font-semibold text-on-surface mb-4">Daftar Item</h2>

            {form.items.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant text-sm">
                Belum ada item. Klik "Tambah Item" untuk menambahkan.
              </div>
            ) : (
              <div className="space-y-4 mb-4">
                {form.items.map((item, idx) => {
                  const product = productList.find((p) => p.id === Number(item.product_id));
                  const unitOptions = sellableUnits(product);
                  const selectedUnit =
                    unitOptions.find((u) => String(u.id) === String(item.unit_id)) ||
                    baseUnitOfProduct(product);
                  const subtotal = (Number(item.quantity) || 0) * (Number(item.buy_price) || 0);
                  return (
                    <div key={idx} className="border border-outline-variant rounded-lg p-3 space-y-3 relative">
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="absolute top-2 right-2 text-error hover:bg-error-container p-1 rounded-full transition-colors"
                      >
                        <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>delete</span>
                      </button>
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">Produk</label>
                        <select
                          value={item.product_id}
                          onChange={(e) => updateItem(idx, 'product_id', e.target.value)}
                          className="w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-transparent focus:border-primary focus:ring-1 focus:ring-primary"
                          required
                        >
                          <option value="">Pilih Produk</option>
                          {productList.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      {unitOptions.length > 1 && (
                        <div>
                          <label className="block text-xs font-medium text-on-surface-variant mb-1">
                            Satuan Beli
                          </label>
                          <select
                            value={item.unit_id === '' ? String(selectedUnit?.id ?? '') : item.unit_id}
                            onChange={(e) => updateItem(idx, 'unit_id', e.target.value)}
                            className="w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-transparent focus:border-primary focus:ring-1 focus:ring-primary"
                          >
                            {unitOptions.map((u) => (
                              <option key={u.id ?? 'base'} value={u.id ?? ''}>
                                {u.name}
                                {u.is_base
                                  ? ' (satuan dasar)'
                                  : ` (1 ${u.name} = ${u.factor} ${baseUnitOfProduct(product)?.name || ''})`}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="flex gap-3">
                        <div className="w-1/3">
                          <label className="block text-xs font-medium text-on-surface-variant mb-1">
                            Qty
                            {selectedUnit && !selectedUnit.is_base && (
                              <span className="font-normal"> ({selectedUnit.name})</span>
                            )}
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                            className="w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-transparent focus:border-primary focus:ring-1 focus:ring-primary"
                            required
                          />
                        </div>
                        <div className="w-2/3">
                          <label className="block text-xs font-medium text-on-surface-variant mb-1">
                            Harga per {selectedUnit?.name || 'satuan'}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={item.buy_price}
                            onChange={(e) => updateItem(idx, 'buy_price', e.target.value)}
                            className="w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-transparent focus:border-primary focus:ring-1 focus:ring-primary"
                            required
                          />
                        </div>
                      </div>
                      {product && (
                        <p className="text-[11px] text-on-surface-variant">
                          Stok saat ini {availableIn(product, item.unit_id)} {selectedUnit?.name || ''}
                          {factorOf(product, item.unit_id) > 1 && (
                            <> ({product.stock} {baseUnitOfProduct(product)?.name})</>
                          )}
                        </p>
                      )}
                      <div className="flex justify-between items-center pt-2 border-t border-surface-variant">
                        <span className="text-xs font-medium text-on-surface-variant">Subtotal</span>
                        <span className="text-lg font-semibold text-on-surface">{formatCurrency(subtotal)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={addItem}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-primary text-primary text-lg font-semibold hover:bg-surface-container-low transition-colors"
            >
              <span className="material-symbols-outlined">add</span> Tambah Item
            </button>
          </section>

          {/* Section 3: Ringkasan */}
          <section className="bg-surface-container-lowest p-4 rounded-xl shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] border border-surface-container-low">
            <h2 className="text-xl font-semibold text-on-surface mb-4">Ringkasan</h2>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-on-surface-variant">Total Item</span>
                <span className="text-lg font-semibold text-on-surface">{form.items.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-on-surface-variant">Subtotal</span>
                <span className="text-lg font-semibold text-on-surface">{formatCurrency(total)}</span>
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-outline-variant mt-2">
                <span className="text-lg font-semibold text-on-surface">Total Pembelian</span>
                <span className="text-3xl font-bold text-primary">{formatCurrency(total)}</span>
              </div>
            </div>
          </section>
        </main>

        {/* Sticky Bottom Bar */}
        <div className="fixed left-0 w-full bg-surface border-t border-outline-variant p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.06)] z-50 flex gap-3 create-bottom-bar">
          <button
            type="button"
            onClick={() => navigate('/pembelian')}
            className="w-1/3 py-3 rounded-xl border border-outline text-on-surface text-lg font-semibold hover:bg-surface-container-low transition-colors"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-2/3 py-3 rounded-xl bg-primary text-on-primary text-lg font-semibold hover:bg-primary-container hover:text-on-primary-container transition-colors shadow-sm disabled:opacity-50"
          >
            {mutation.isPending ? 'Menyimpan...' : (isEdit ? 'Update Pembelian' : 'Simpan Pembelian')}
          </button>
        </div>
      </form>
    </>
  );
}
