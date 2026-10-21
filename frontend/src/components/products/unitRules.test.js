import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  availableIn,
  baseUnitOfProduct,
  changesBaseUnit,
  currentBaseName,
  factorOf,
  priceIn,
  rebaseRatio,
  sellableUnits,
  toUnitRows,
  validateUnits,
} from './unitRules.js';

const PACKED = {
  id: 7,
  name: 'Teh Pucuk',
  unit: 'dus',
  stock: 792,
  sell_price: 12500,
  buy_price: 10000,
  units: [
    { id: 71, name: 'btl', factor: 1, is_base: true },
    { id: 72, name: 'dus', factor: 24, is_base: false },
  ],
};

test('daftar satuan harus punya tepat satu satuan dasar', () => {
  const none = validateUnits([
    { name: 'btl', factor: 1, is_base: false },
    { name: 'dus', factor: 24, is_base: false },
  ]);
  assert.equal(none.errors.length, 1);
  assert.match(none.errors[0], /tepat satu satuan dasar/);

  const two = validateUnits([
    { name: 'btl', factor: 1, is_base: true },
    { name: 'dus', factor: 24, is_base: true },
  ]);
  // Dua masalah sekaligus: dua satuan dasar, dan satuan dasar kedua
  // bernilai 24. Dua pesan lebih berguna daripada satu karena user harus
  // memperbaiki keduanya sebelum form bisa dikirim.
  assert.equal(two.errors.length, 2);
  assert.ok(two.errors.some((e) => /tepat satu satuan dasar/.test(e)));
  assert.ok(two.errors.some((e) => /harus bernilai 1/.test(e)));

  const good = validateUnits([
    { name: 'btl', factor: 1, is_base: true },
    { name: 'dus', factor: 24, is_base: false },
  ]);
  assert.deepEqual(good.errors, []);
});

test('satuan dasar selalu bernilai 1 karena stok disimpan dalam satuan itu', () => {
  const { errors } = validateUnits([{ name: 'btl', factor: 3, is_base: true }]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /harus bernilai 1/);
});

test('nama satuan tidak boleh sama, kecuali berbeda huruf besar-kecil', () => {
  const dup = validateUnits([
    { name: 'btl', factor: 1, is_base: true },
    { name: 'BTL', factor: 2, is_base: false },
  ]);
  assert.equal(dup.errors.length, 1);
  assert.match(dup.errors[0], /sama lebih dari sekali/);
});

test('faktor harus bilangan bulat dan tidak boleh negatif', () => {
  const { errors } = validateUnits([
    { name: 'btl', factor: 1, is_base: true },
    { name: 'dus', factor: -2, is_base: false },
  ]);
  assert.ok(errors.some((e) => /angka bulat/.test(e)));
});

test('faktor 0 berarti isi belum diisi, dan hanya sah untuk satuan non-dasar', () => {
  // Ini kondisi nyata saat user baru menukar satuan dasar tapi belum tahu
  // isi satuannya - harus lolos supaya bisa diketik, bukan ditolak.
  const notFilled = validateUnits([
    { name: 'btl', factor: 1, is_base: true },
    { name: 'dus', factor: 0, is_base: false },
  ]);
  assert.deepEqual(notFilled.errors, []);

  const baseZero = validateUnits([{ name: 'btl', factor: 0, is_base: true }]);
  assert.ok(baseZero.errors.some((e) => /harus bernilai 1/.test(e)));
});

test('baris dengan nama kosong dibuang, bukan ikut terkirim ke server', () => {
  const { units, errors } = validateUnits([
    { name: 'btl', factor: 1, is_base: true },
    { name: '   ', factor: 12, is_base: false },
  ]);
  assert.equal(units.length, 1);
  assert.deepEqual(errors, []);
});

test('daftar kosong ditolak dengan pesan yang jelas', () => {
  const { units, errors } = validateUnits([]);
  assert.equal(units.length, 0);
  assert.match(errors[0], /minimal satu satuan/);
});

test('baris dari API diubah jadi angka, bukan string', () => {
  const rows = toUnitRows(PACKED.units);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].factor, 24);
  assert.equal(typeof rows[1].factor, 'number');
  assert.equal(rows[0].is_base, true);
});

test('produk tanpa daftar satuan tetap bisa dijual memakai satuan lamanya', () => {
  // Produk lama yang belum pernah disentuh form tidak punya baris
  // product_units. Kalau form-nya jadi kosong, user tidak bisa menjualnya.
  const legacy = { id: 1, name: 'Gula', unit: 'kg', stock: 5 };
  const units = sellableUnits(legacy);

  assert.equal(units.length, 1);
  assert.equal(units[0].name, 'kg');
  assert.equal(units[0].factor, 1);
  assert.equal(units[0].is_base, true);
  assert.equal(units[0].synthetic, true);
});

test('produk yang satuan lamanya kosong pun tetap punya satuan dasar', () => {
  const units = sellableUnits({ id: 2, name: 'Tanpa satuan', stock: 3 });
  assert.equal(units[0].name, 'pcs');
  assert.equal(units[0].factor, 1);
});

test('faktor pilihan satuan dipakai untuk mengonversi stok', () => {
  assert.equal(factorOf(PACKED, 72), 24);
  assert.equal(factorOf(PACKED, 71), 1);
  assert.equal(factorOf(PACKED, ''), 1);
  assert.equal(factorOf(PACKED, null), 1);
  // Id yang tidak dikenal harus jatuh ke 1, bukan NaN. NaN akan membuat
  // perbandingan stok selalu false sehingga form mengizinkan jual tanpa batas.
  assert.equal(factorOf(PACKED, 999), 1);
});

test('stok yang ditampilkan mengikuti satuan yang dipilih', () => {
  assert.equal(availableIn(PACKED, 72), 33); // 792 btl = 33 dus
  assert.equal(availableIn(PACKED, 71), 792);
  assert.equal(availableIn({ stock: 0 }, 1), 0);
});

test('stok tidak boleh diubah jadi 33 dus penuh kalau isinya cuma 791 btl', () => {
  // Pembulatan ke bawah: 791 btl adalah 32 dus penuh, sisa 23 btl tidak
  // boleh ikut terjual sebagai dus.
  const almost = { ...PACKED, stock: 791 };
  assert.equal(availableIn(almost, 72), 32);
});

test('harga per satuan dikali faktor satuan yang dipilih', () => {
  assert.equal(priceIn(PACKED, 72, 12500), 300000); // per dus
  assert.equal(priceIn(PACKED, 71, 12500), 12500); // per btl
});

test('perubahan satuan dasar terdeteksi dari daftar yang sedang diedit', () => {
  const toBottles = [
    { name: 'btl', factor: 1, is_base: true },
    { name: 'dus', factor: 24, is_base: false },
  ];

  assert.equal(changesBaseUnit(toBottles, 'dus'), true);
  assert.equal(changesBaseUnit(toBottles, 'DUS'), true);
  assert.equal(changesBaseUnit(toBottles, 'btl'), false);
  assert.equal(changesBaseUnit(toUnitRows(PACKED.units), 'btl'), false);
});

test('daftar tanpa satuan dasar dianggap tidak mengubah apa pun', () => {
  assert.equal(changesBaseUnit([{ name: 'dus', factor: 24, is_base: false }], 'dus'), false);
});

test('satuan dasar saat ini dibaca dari daftar, lalu dari kolom unit', () => {
  assert.equal(currentBaseName(PACKED), 'btl');
  assert.equal(currentBaseName({ unit: 'doss' }), 'doss');
  assert.equal(currentBaseName({ units: [], unit: 'dos' }), 'dos');
  assert.equal(currentBaseName({}), '');
});

test('rasio rebase diambil dari faktor satuan lama di daftar baru', () => {
  const toBottles = [
    { name: 'btl', factor: 1, is_base: true },
    { name: 'dus', factor: 24, is_base: false },
  ];
  assert.equal(rebaseRatio(toBottles, 'dus'), 24);
  assert.equal(rebaseRatio(toBottles, 'btl'), 1);
  // Satuan lama yang hilang dari daftar tidak boleh dianggap rasio 1,
  // karena itu akan diam-diam melabeli ulang tanpa mengonversi apa pun.
  assert.equal(rebaseRatio(toBottles, 'doss'), null);
});

test('satuan dasar produk diambil dari baris bertanda dasar', () => {
  assert.equal(baseUnitOfProduct(PACKED).name, 'btl');
  assert.equal(baseUnitOfProduct({ unit: 'kg' }).name, 'kg');
});

test('baris kosong dari form tidak dianggap daftar satuan kosong', () => {
  const rows = toUnitRows([]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].is_base, true);
  assert.equal(rows[0].factor, 1);
});
