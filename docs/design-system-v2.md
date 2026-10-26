# Design System BALARAJA v2 — "Material Ledger"

Dokumen ini menjelaskan token, komponen, dan pola yang dipakai frontend v2.
Semua halaman baru wajib memakai komponen di `frontend/src/components/ui`
sebelum membuat markup sendiri.

## 1. Prinsip

1. Data dulu: tabel padat, angka rata kanan, aksi dekat dengan baris.
2. Satu sumber navigasi: `frontend/src/navigation/navConfig.js`.
3. Desktop pusat, mobile adaptif (bukan versi mini).
4. Cetak adalah tampilan terpisah: latar dipaksa terang, navigasi disembunyikan.
5. Tidak ada perubahan arti data: status bayar, satuan, dan guard integritas tetap.

## 2. Token

Token didefinisikan di `frontend/src/styles/tokens.css` sebagai CSS variable
dan dipetakan ke utility Tailwind v4 di `frontend/src/index.css`.

| Kelompok | Contoh | Pemakaian |
|---|---|---|
| Warna merek | `primary` `#0e2a47`, `accent` `#c2410c` | Aksi utama, penekanan |
| Permukaan | `surface`, `surface-container`, `surface-container-lowest` | Latar halaman, kartu, input |
| Teks | `on-surface`, `on-surface-variant`, `outline` | Teks utama, sekunder, garis |
| Status | `success`, `warning`, `danger`, `info` + varian `-container` | Badge, peringatan, sisa bayar |
| Radius | `rounded-field`, `rounded-card` | Input/tombol, kartu |
| Tipografi | `text-2xs`, `text-xs`, `text-sm`, `text-lg` | Skala kecil yang konsisten |

Aturan:

- Jangan memakai nilai warna mentah (`bg-white`, `text-gray-500`) di halaman baru.
- Gunakan `bg-surface-container-lowest` untuk kartu di atas `bg-surface`.
- `text-2xs` hanya untuk metadata, bukan isi utama.

## 3. Mode gelap

- Kelas `dark` dipasang di `document.documentElement` oleh `lib/theme.js`.
- Token otomatis berubah; komponen tidak perlu logika `dark:` sendiri.
- Preferensi disimpan di `localStorage` dan mengikuti `prefers-color-scheme`
  saat belum ada pilihan.

## 4. Komponen inti

| Komponen | Kegunaan | Catatan |
|---|---|---|
| `PageHeader` | Judul, subjudul, remah roti, aksi | Remah roti memakai `Link` |
| `Card` | Wadah konten | Varian padding dan elevasi |
| `Button` | Aksi | `variant`, `size`, `icon`, `loading`, `fullWidth` |
| `IconButton` | Aksi ikon | `label` wajib untuk screen reader |
| `Badge` / `StatusBadge` | Status bayar, stok, aktif | `tone` semantik |
| `Input` | Teks, angka, kata sandi | `invalid`, `icon`, `suffix` |
| `MoneyInput` | Nominal rupiah | `onChange` mengembalikan angka |
| `Select` | Dropdown native | `onChange` menerima event |
| `DateInput` | Tanggal | `onChange` menerima event (bukan string) |
| `Textarea` | Catatan | `rows`, `invalid` |
| `FormField` | Label + hint + error | `id` dibuat otomatis |
| `Money` | Nominal | `variant`: default, strong, muted, danger, success |
| `DataTable` | Tabel desktop + kartu mobile | `cardBadge` harus fungsi |
| `ResponsiveTable` | Tabel dengan kartu mobile | Dipakai laporan |
| `Modal` / `ConfirmDialog` | Dialog | Fokus, Escape, klik luar |
| `EmptyState` / `LoadingState` | Keadaan kosong dan memuat | Satu gaya di seluruh app |
| `SearchInput` | Pencarian | `onChange` menerima string |
| `Toast` | Notifikasi | Lewat `lib/toast` |

## 5. Pola halaman

### Halaman daftar

```
PageHeader (judul + aksi)
Filter/toolbar (SearchInput, Select, DateInput)
DataTable (kolom desktop, kartu mobile, print)
EmptyState saat kosong
```

### Halaman form

- Dua kolom di `lg`: isi di kiri, ringkasan lengket di kanan.
- Bar aksi bawah di mobile memakai `create-bottom-bar` agar tidak tertutup
  tab bar.
- Validasi di `handleSubmit`; pesan lewat toast.
- `FormField` membungkus setiap kontrol, termasuk `required` dan `hint`.

### Halaman laporan

Semua laporan memakai `frontend/src/components/reports/ReportShell.jsx`:

- `PageHeader` + `ReportToolbar` (cetak, export, toggle filter).
- Panel filter terlipat dengan hitungan filter aktif dan tombol reset.
- `stats` untuk ringkasan angka.
- `PrintHeader` / `PrintFooter` untuk kop dan tanda tangan.
- Keadaan memuat, error, dan kosong ditangani shell.
- `ExportPlaceholderButton` untuk laporan yang belum punya endpoint export.

## 6. Cetak

- Area cetak ditandai `print-area`; elemen lain disembunyikan oleh `print.css`.
- Nominal memakai `print-money` agar tidak terpotong.
- Daftar kartu mobile memakai `print-card-list`.
- `create-bottom-bar`, sidebar, dan navigasi mobile selalu disembunyikan saat print.
- Tema dipaksa terang saat print, termasuk saat mode gelap aktif.

## 7. Aksesibilitas

- Setiap kontrol punya label; `IconButton` wajib `label`.
- Fokus terlihat (`focus-visible:outline-primary`).
- Dialog menangani Escape dan mengembalikan fokus.
- Status tidak hanya dibedakan lewat warna: badge memakai ikon dan teks.
- Target sentuh minimal 32px (`size="sm"`), aksi utama 40–44px.

## 8. Konvensi kode

- Import komponen dari `components/ui`, format dari `lib/format`.
- Jangan memakai `utils/format` di halaman baru.
- `formatCurrency` untuk teks, `Money` untuk JSX nominal.
- Jangan menambahkan komentar dekoratif; komentar hanya untuk keputusan
  non-obvious.
- Jalankan `npm run lint` dan `npm run build` sebelum menyatakan selesai.
