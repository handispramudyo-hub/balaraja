/**
 * Aturan daftar satuan produk.
 *
 * Sengaja ditiru dari `ProductUnitService` di backend, bukan dibuat ulang
 * seenaknya. Bedanya hanya boleh soal pesan error - kalau aturannya berbeda,
 * user bisa lolos dari validasi di form lalu ditolak server dengan alasan yang
 * tidak akan dia kenali.
 *
 * Konsep dasarnya: satuan dasar adalah satuan TERKECIL, dan setiap faktor
 * menyatakan "1 satuan ini = N satuan dasar". Jadi `stock` di form selalu
 * dibaca dalam satuan dasar.
 */

/** Baris satuan kosong untuk form baru. */
export function emptyUnit() {
  return { name: '', factor: 1, is_base: false };
}

/**
 * Ubah satuan dari API menjadi baris form.
 *
 * `factor` selalu angka: kolomnya sudah bisa berisi 0 yang berarti "isi belum
 * diisi", jadi `''` di sini berarti user menghapus angkanya, bukan nol.
 */
export function toUnitRows(units) {
  if (!Array.isArray(units) || units.length === 0) {
    return [{ ...emptyUnit(), is_base: true }];
  }

  return units.map((u) => ({
    id: u.id ?? null,
    name: u.name ?? '',
    factor: u.factor === null || u.factor === undefined ? 0 : Number(u.factor),
    buy_price: u.buy_price === null || u.buy_price === undefined ? '' : Number(u.buy_price),
    sell_price: u.sell_price === null || u.sell_price === undefined ? '' : Number(u.sell_price),
    is_base: !!u.is_base,
  }));
}

/**
 * Bersihkan dan periksa daftar satuan sebelum dikirim.
 *
 * @returns {{units: Array, errors: string[]}} `units` sudah ternormalisasi
 *          (tanpa baris kosong) sehingga tidak perlu difilter lagi.
 */
export function validateUnits(rows) {
  const units = (rows || [])
    .map((u) => ({
      id: u.id ?? null,
      name: (u.name ?? '').trim(),
      factor: u.factor === '' || u.factor === null || u.factor === undefined ? 0 : Number(u.factor),
      buy_price: u.buy_price === '' || u.buy_price === null || u.buy_price === undefined ? null : Number(u.buy_price),
      sell_price: u.sell_price === '' || u.sell_price === null || u.sell_price === undefined ? null : Number(u.sell_price),
      is_base: !!u.is_base,
    }))
    .filter((u) => u.name !== '');

  if (units.length === 0) {
    return { units, errors: ['Isi minimal satu satuan.'] };
  }

  const errors = [];

  const bases = units.filter((u) => u.is_base);
  if (bases.length !== 1) {
    errors.push('Pilih tepat satu satuan dasar (yang paling kecil).');
  }

  for (const u of units) {
    if (!Number.isInteger(u.factor) || u.factor < 0) {
      errors.push(`Isi satuan "${u.name}" harus angka bulat.`);
    }
    if (u.is_base && u.factor !== 1) {
      errors.push(`Satuan dasar "${u.name}" harus bernilai 1.`);
    }
  }

  const names = units.map((u) => u.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    errors.push('Ada nama satuan yang sama lebih dari sekali.');
  }

  return { units, errors };
}

/**
 * Unit yang jadi dasar saat produk disimpan, atau null kalau belum ada.
 */
export function baseUnitOf(units) {
  return (units || []).find((u) => u.is_base) || null;
}

/**
 * Hitung total kebutuhan dalam satuan dasar per produk untuk item transaksi.
 * Berguna untuk validasi stok kumulatif (2 baris sama yang sah).
 *
 * @param {Array<{product_id: string|number, unit_id?: string|number, quantity: string|number}>} items
 * @param {Array} products
 * @returns {Array<{productId: number, requested: number, stock: number, productName: string, unitName: string, exceeded: boolean}>}
 */
export function cumulativeShortage(items, products) {
  const totals = new Map();
  const list = Array.isArray(items) ? items : [];
  const prodList = Array.isArray(products) ? products : [];

  for (const item of list) {
    if (!item?.product_id) continue;
    const pid = Number(item.product_id);
    const product = prodList.find((p) => p.id === pid);
    if (!product) continue;
    const factor = factorOf(product, item.unit_id);
    const qty = Number(item.quantity) || 0;
    if (qty <= 0) continue;
    const baseQty = qty * factor;
    const cur = totals.get(pid) || { requested: 0 };
    cur.requested += baseQty;
    totals.set(pid, cur);
  }

  const out = [];
  for (const [pid, t] of totals) {
    const product = prodList.find((p) => p.id === pid);
    if (!product) continue;
    const stock = Number(product.stock) || 0;
    const baseUnit = baseUnitOfProduct(product);
    const unitName = baseUnit?.name || product?.unit || '';
    out.push({
      productId: pid,
      requested: t.requested,
      stock,
      productName: product.name || '',
      unitName,
      exceeded: t.requested > stock,
    });
  }
  return out.filter((w) => w.exceeded);
}

/**
 * Nama satuan dasar yang tersimpan di server.
 *
 * Objek produk dari daftar produk tidak selalu menyertakan `units` (hanya
 * form edit yang memanggil detailnya), jadi `product.unit` dipakai sebagai
 * cadangan.
 */
export function currentBaseName(product) {
  const fromList = baseUnitOf(product?.units);
  if (fromList?.name) return fromList.name.trim();
  return (product?.unit ?? '').trim();
}

/**
 * Apakah daftar yang sedang diedit mengganti satuan dasar?
 *
 * Ini menentukan dua hal sekaligus: stok di form harus dikosongkan (server
 * menolaknya kalau diisi bareng), dan konfirmasi konversi harus muncul
 * sebelum disimpan.
 */
export function changesBaseUnit(units, currentName) {
  const next = baseUnitOf(units);
  if (!next) return false;
  if (!currentName) return false;
  return next.name.trim().toLowerCase() !== currentName.trim().toLowerCase();
}

/**
 * Faktor satuan lama menurut daftar baru: berapa satuan dasar baru per 1 satuan
 * lama. Ini rasio yang dipakai backend untuk mengonversi stok.
 */
export function rebaseRatio(units, currentName) {
  if (!currentName) return null;
  const old = (units || []).find(
    (u) => u.name.trim().toLowerCase() === currentName.trim().toLowerCase()
  );
  return old ? Number(old.factor) : null;
}

/**
 * Daftar satuan yang bisa dipilih user untuk satu produk.
 *
 * Produk yang belum punya baris `product_units` (misalnya produk lama yang
 * belum pernah disentuh form) tetap harus bisa dijual. Untuk itu `unit` yang
 * lama dipakai sebagai satuan dasar tunggal dengan faktor 1, supaya form
 * tidak ikut kosong - pilihan user tidak boleh hilang hanya karena datanya
 * belum dimigrasi.
 */
export function sellableUnits(product) {
  const units = (product?.units || []).filter((u) => u.name);

  if (units.length > 0) {
    return units;
  }

  const name = (product?.unit ?? '').trim() || 'pcs';

  return [{ id: null, name, factor: 1, is_base: true, synthetic: true }];
}

/** Satuan dasar produk: baris bertanda dasar, atau satuan yang dipakai stocking. */
export function baseUnitOfProduct(product) {
  return sellableUnits(product).find((u) => u.is_base) || sellableUnits(product)[0];
}

/**
 * Faktor suatu pilihan satuan terhadap satuan dasar.
 *
 * `unitId` yang tidak ditemukan (atau produk tanpa daftar satuan) jatuh ke 1,
 * karena itulah yang membuat form tidak gagal diam-diam untuk data lama.
 */
export function factorOf(product, unitId) {
  if (unitId === '' || unitId === null || unitId === undefined) {
    return Number(baseUnitOfProduct(product)?.factor) || 1;
  }

  const found = sellableUnits(product).find((u) => String(u.id) === String(unitId));

  return found ? Number(found.factor) || 1 : 1;
}

/**
 * Berapa satuan yang tersedia dalam satuan yang dipilih.
 *
 * `product.stock` disimpan dalam satuan dasar, jadi harus dibagi faktor dulu.
 * Pembulatan ke bawah penting: 33 dus tidak boleh dibaca sebagai 33 dus penuh
 * kalau isinya 792 btl.
 */
export function availableIn(product, unitId) {
  const stock = Number(product?.stock) || 0;
  const factor = factorOf(product, unitId);

  return factor > 0 ? Math.floor(stock / factor) : 0;
}

/**
 * Harga per satuan yang dipilih.
 *
 * `product.sell_price`/`buy_price` disimpan per satuan dasar, jadi dikali
 * faktor. Ini yang membuat "beli 1 dus" tidak dihitung memakai harga per
 * btl.
 */
export function priceIn(product, unitId, basePrice) {
  const found = sellableUnits(product).find((u) => String(u.id) === String(unitId));
  if (found && found.sell_price !== null && found.sell_price !== undefined && found.sell_price !== '') {
    return Number(found.sell_price);
  }
  return basePrice * factorOf(product, unitId);
}
