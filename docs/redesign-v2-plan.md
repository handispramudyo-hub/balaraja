# Rencana Redesign BALARAJA v2 — "Material Ledger"

Status: sedang dikerjakan di branch `redesign/v2` (base `18942f2`).

## 1. Keputusan yang dikunci

| Topik | Keputusan |
|---|---|
| Arah visual | Design language baru "Material Ledger" — bukan Material 3 default |
| Perangkat utama | Desktop/laptop admin; mobile tetap rapi dan terasa seperti aplikasi |
| Cakupan | **Frontend saja** — kontrak API `/api/*` tidak berubah, nol migrasi DB |
| Label "Toko" | Ganti jadi **"Pelanggan"** di seluruh UI (model backend tetap `customers`) |
| Ikon | Semua bentrok dihilangkan (lihat §4) |
| Struktur menu | Sama seperti sekarang: Master Data / Transaksi / Keuangan / Laporan. "Pelunasan Utang" dan "Utang" tetap dua entri terpisah, kini **berbeda halaman** |
| Rute | **Tetap rute lama** (`/produk`, `/toko`, `/piutang`, …). Hanya `/utang` yang baru untuk halaman Utang Supplier |
| Ikon aplikasi mobile | Material Symbols Outlined, sumbu FILL untuk status aktif |

## 2. Prinsip design

1. **Data dulu** — admin membuka aplikasi untuk angka, bukan untuk hiasan. denser, bukan dekorasi.
2. **Satu sumber navigasi** — `frontend/src/navigation/navConfig.js` adalah satu-satunya tempat yang tahu menu, rute, ikon, dan judul halaman.
3. **Desktop sebagai pusat** — tabel padat, filter di toolbar, aksi di baris. Mobile adalah adaptasi, bukan-versi-mini.
4. **Cetak adalah produk terpisah** — laporan dan nota kontan harus rapi di kertas, tema dipaksa terang saat print.
5. **Tidak ada perubahan Meaning data** — guard integritas, satuan, dan status pembayaran tetap punya arti yang sama.

## 3. Sistem & bug yang diketahui (tidak diubah di fase ini)

- `GET /api/expenses` membaca `date_from`/`date_to`; halaman Biaya dulu mengirim `start_date`/`end_date` sehingga filter tanggal diam-diam tidak bekerja → **diperbaiki di sisi frontend**.
- Hapus kategori tetap berisiko cascade ke produk di backend → mitigasi UI: hapus dinonaktifkan bila kategori masih punya produk.
- Hapus penjualan masih menghapus `payments` di backend → mitigasi UI: hapus diblokir bila penjualan sudah dibayar.
- `stock_movements` tidak punya endpoint per produk → halaman detail produk menampilkan ringkasan yang memang tersedia, sisanya menyusul.

## 4. Peta ikon final (tanpa duplikat)

| Menu | Rute | Ikon |
|---|---|---|
| Dashboard | `/` | `home` |
| Produk | `/produk` | `inventory_2` |
| Kategori | `/kategori` | `category` |
| Pelanggan | `/toko` | `store` |
| Supplier | `/supplier` | `local_shipping` |
| Pembelian | `/pembelian` | `add_shopping_cart` |
| Penjualan | `/penjualan` | `point_of_sale` |
| Pembayaran | `/pembayaran` | `payments` |
| Pelunasan Utang | `/pelunasan-utang` | `handshake` |
| Jadwal Angsuran | `/angsuran` | `calendar_month` |
| Biaya | `/biaya` | `receipt_long` |
| Piutang | `/piutang` | `account_balance_wallet` |
| Utang Supplier | `/utang` | `price_change` |
| Laba & Rugi | `/laba-rugi` | `trending_up` |
| Laporan · Stok | `/laporan/stok` | `inventory` |
| Laporan · Pembelian | `/laporan/pembelian` | `description` |
| Laporan · Penjualan | `/laporan/penjualan` | `sell` |
| Laporan · Pengeluaran | `/laporan/pengeluaran` | `money_off` |

Ikon pendukung: `menu`, `add`, `search`, `close`, `filter`, `more_horiz`, `edit`, `delete`, `print`, `download`, `check`, `warning`, `dark_mode`, `light_mode`, `chevron_right`, `arrow_back`, `assessment` (tab Laporan di mobile).

## 5. Struktur navigasi

```
Dashboard  home
Master Data: Produk, Kategori, Pelanggan, Supplier
Transaksi: Pembelian, Penjualan, Pembayaran, Pelunasan Utang, Jadwal Angsuran, Biaya
Keuangan: Piutang, Utang Supplier, Laba & Rugi
Laporan: Stok, Pembelian, Penjualan, Pengeluaran
Pengaturan: Profil, Kata Sandi
```

Mobile: 5 tab bawah (Beranda · Master · Transaksi · Keuangan · Laporan) + drawer layar penuh berisi seluruh menu dalam bentuk icon grid + tombol aksi cepat.

## 6. Fase pengerjaan

| Fase | Isi | Status |
|---|---|---|
| 0 | Dokumen + branch `redesign/v2` | selesai |
| 1 | Token, komponen inti, dark mode | selesai |
| 2 | `navConfig`, shell, sidebar desktop, tab bar + drawer + FAB mobile | selesai |
| 3 | Dashboard v2 | selesai |
| 4 | Transaksi harian: kasir, form pembelian, daftar dense | selesai |
| 5 | Keuangan: piutang, utang, angsuran, pembayaran, pelunasan | selesai |
| 6 | Master data + halaman detail produk | selesai |
| 7 | Laporan & print (enam laporan memakai `ReportShell`) | selesai |
| 8 | A11y, skeleton, PWA polish | selesai |
| 9 | Build, uji CRUD lokal, audit browser, deploy | sebagian — lint/build/test lulus; audit browser dan deploy menyusul |

### Catatan implementasi

- Form `CreatePurchase` dan `CreateSale` sudah memakai komponen UI v2 (`PageHeader`, `FormField`, `Select`, `DateInput`, `MoneyInput`, `Button`) dan tata letak dua kolom dengan ringkasan lengket di desktop.
- Halaman detail produk `/produk/:id` menampilkan stok, harga, satuan, status stok, dan pergerakan stok dari `/reports/stock`.
- `PageHeader` memakai `Link` react-router untuk remah roti, jadi navigasi tidak lagi memuat ulang halaman.
- Export laporan hanya tersedia untuk penjualan, pembelian, dan piutang. Laporan stok, pengeluaran, dan laba-rugi menampilkan tombol export nonaktif dengan penjelasan.

## 7. Verifikasi

- `npm run lint` (oxlint) · `npm run build` · `npm test`
- Uji CRUD terhadap backend dev lokal (SQLite) untuk create / edit / hapus di setiap modul
- `node ui_audit.mjs <token> <outdir>` — audit geometri di 390px (mobile), 1440px (desktop), 680px (print)
- Checklist manual: login → kasir → nota → penjualan tempo → catat pembayaran → aging piutang → laporan → export → dark mode → cetak

## 8. Rollback

Setiap fase satu commit. Rollback: `git revert <commit>` lalu deploy ulang frontend. Kontrak API tidak berubah, jadi tidak ada risiko data.
