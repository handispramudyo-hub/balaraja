<?php

namespace App\Services;

use App\Models\Product;
use App\Models\ProductUnit;
use App\Models\StockMovement;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Pusat aturan satuan produk.
 *
 * Semua perkalian konversi dan perubahan satuan dasar harus lewat kelas ini.
 * Menyebar konversi ke controller akan cepat menghasilkan dua versi
 * perkalian yang berbeda - dan karena `stock` cuma satu integer, satu versi
 * yang salah langsung menghancurkan angka stok tanpa ada yang gagal diam-diam.
 *
 * Batasan yang tidak bisa dinegosiasikan: `stock` adalah INTEGER jumlah
 * satuan terkecil. Artinya satuan dasar hanya boleh turun ke satuan yang lebih
 * kecil. Menaikkan satuan dasar (btl -> dus) tidak pernah bisa tepat: 792 btl
 * adalah 33 dus, bukan 792 dus. Sistem menolaknya, bukan membulatkan, karena
 * pembulatan di sini berarti selisih fisik barang yang tidak ketahuan.
 */
class ProductUnitService
{
    /**
     * Simpan daftar satuan produk.
     *
     * Aturan yang tidak boleh dilanggar:
     *
     * - tepat satu satuan dasar
     * - satuan dasar bernilai 1 (satuan terkecil adalah acuan semua faktor)
     * - nama satuan unik per produk
     *
     * Faktor SELALU relatif terhadap satuan terkecil, bukan terhadap satuan
     * dasar yang sedang aktif. Ini yang membuat daftar satuan tetap konsisten
     * saat satuan dasarnya nanti diganti: 1 dus = 24 btl tetap bernilai 24
     * baik saat `dus` yang dasar maupun saat `btl` yang dasar.
     *
     * Faktor 0 berarti "belum diisi" dan hanya sah untuk satuan yang BUKAN
     * satuan terkecil - karena 0 berarti satuan itu tidak lebih besar dari
     * satuan dasar, jadi isinya belum diketahui.
     *
     * Kalau daftar ini mengganti satuan dasar, satuan lama WAJIB masih ada di
     * dalam daftar dengan faktor isi menuju satuan dasar baru. Tanpa itu
     * ukuran satuan lama tidak diketahui dan konversinya cuma bisa ditebak.
     * Case-nya nyata di data lama: produk yang tadinya "doss" lalu diperbaiki
     * jadi "dus" harus menyertakan `doss` sebagai satuan non-dasar supaya
     * rasionya 1, bukan kehilangan acuan diam-diam.
     *
     * @param  array<int, array{name: string, factor: int, is_base?: bool}>  $units
     * @param  bool  $confirmed  true = izinkan pergantian satuan dasar (dipakai
     *                          setelah user mengonfirmasi hasil preview)
     * @param  int|null  $userId  penulis baris adjustment hasil rebase
     *
     * @throws ValidationException
     */
    public function changesBaseUnit(Product $product, array $units): bool
    {
        $incomingBase = collect($units)->first(fn ($u) => ! empty($u['is_base']));

        if (! $incomingBase) {
            return false;
        }

        $currentBase = $product->units()->where('is_base', true)->first();

        return ! $currentBase
            || mb_strtolower(trim($currentBase->name)) !== mb_strtolower(trim((string) $incomingBase['name']));
    }

    /**
     * @param  array<int, array{name: string, factor: int, is_base?: bool}>  $units
     * @param  bool  $confirmed  true = izinkan pergantian satuan dasar (dipakai
     *                          setelah user mengonfirmasi hasil preview)
     * @param  int|null  $userId  penulis baris adjustment hasil rebase
     *
     * @throws ValidationException
     */
    public function syncUnits(Product $product, array $units, bool $confirmed = false, ?int $userId = null): void
    {
        $clean = $this->validateUnits($units);
        $currentBase = $product->units()->where('is_base', true)->first();

        // Produk yang belum punya baris satuan (data impor atau produk lama
        // sebelum migration) tidak punya "basis lama" untuk dibandingkan, jadi
        // tidak ada konversi yang perlu diputuskan di sini.
        if ($currentBase && $this->changesBaseUnit($product, $clean)) {
            $this->applyRebase($product, $currentBase, $clean, $confirmed, $userId);

            return;
        }

        $this->persistUnits($product, $clean);
    }

    /**
     * Hitung dulu apa yang terjadi pada stok kalau satuan dasar diganti,
     * tanpa menyentuh data. Ini yang ditampilkan di UI sebelum user
     * mengonfirmasi - supaya "33 dos jadi 792 btl" terlihat, bukan terjadi
     * diam-diam.
     *
     * @param  array<int, array{name: string, factor: int, is_base?: bool}>  $incoming
     * @return array{from: string, to: string, factor: int, before: int, after: int,
     *               buy_price_before: float, buy_price_after: float,
     *               sell_price_before: float, sell_price_after: float}
     */
    public function previewRebase(Product $product, array $incoming): array
    {
        [$currentBase, $ratio] = $this->resolveRebaseRatio($product, $incoming);
        $incomingBase = collect($this->validateUnits($incoming))->firstWhere('is_base', true);
        $before = (int) $product->stock;

        return [
            'from' => $currentBase->name,
            'to' => $incomingBase['name'],
            'factor' => $ratio,
            'before' => $before,
            'after' => $before * $ratio,
            'min_stock_before' => (int) $product->min_stock,
            'min_stock_after' => (int) $product->min_stock * $ratio,
            'buy_price_before' => round((float) $product->buy_price, 2),
            'buy_price_after' => round((float) $product->buy_price / $ratio, 2),
            'sell_price_before' => round((float) $product->sell_price, 2),
            'sell_price_after' => round((float) $product->sell_price / $ratio, 2),
        ];
    }

    /**
     * `products.unit` adalah cerminan dari satuan dasar. Laporan, PDF, dan
     * form lama masih membacanya, jadi harus selalu ikut berubah. Yang
     * otoritatif tetap `product_units.is_base`; kolom ini cuma cache.
     */
    public function syncBaseUnitName(Product $product): void
    {
        $base = $product->units()->where('is_base', true)->first();
        $product->forceFill(['unit' => $base?->name ?? 'pcs'])->save();
    }

    /**
     * Ambil satuan yang dipilih dari item transaksi.
     *
     * Item boleh bawa `unit_id`. Kalau tidak, cari berdasarkan nama - supaya
     * request lama yang cuma mengirim `unit_name` tetap jalan.
     */
    public function resolveUnit(Product $product, ?int $unitId, ?string $unitName): ProductUnit
    {
        $units = $product->relationLoaded('units')
            ? $product->units
            : $product->units()->get();

        $unit = null;

        if ($unitId) {
            $unit = $units->firstWhere('id', $unitId);
        } elseif ($unitName !== null && $unitName !== '') {
            $wanted = mb_strtolower(trim($unitName));
            $unit = $units->first(fn (ProductUnit $u) => mb_strtolower($u->name) === $wanted);
        }

        if ($unit) {
            if ($unit->factor < 1) {
                throw ValidationException::withMessages([
                    'items' => "Satuan '{$unit->name}' belum punya faktor konversi. Isi di form produk dulu.",
                ]);
            }

            return $unit;
        }

        // Satuan tidak ditemukan. Kalau pemanggil tidak menunjuk satuan apa pun
        // (form lama), pakai satuan dasar. Kalau pun menunjuk satuan tapi
        // tidak ketemu, itu kesalahan input yang harus kelihatan.
        if ($unitId !== null || ($unitName !== null && $unitName !== '')) {
            throw ValidationException::withMessages([
                'items' => "Satuan tidak dikenal untuk produk '{$product->name}'.",
            ]);
        }

        $base = $units->firstWhere('is_base', true);

        if ($base) {
            return $base;
        }

        // Produk tanpa baris satuan sama sekali. Perlakukan satuan yang
        // tertulis di produk sebagai satuan dasar faktor 1 supaya transaksi
        // tetap jalan, alih-alih gagal total.
        return new ProductUnit([
            'product_id' => $product->id,
            'name' => $product->unit ?: 'pcs',
            'factor' => 1,
            'is_base' => true,
        ]);
    }

    /**
     * Normalisasi & validasi input daftar satuan.
     *
     * @return array<int, array{name: string, factor: int, is_base: bool}>
     */
    private function validateUnits(array $units): array
    {
        $clean = [];

        foreach (array_values($units) as $index => $unit) {
            $name = trim((string) ($unit['name'] ?? ''));

            if ($name === '') {
                throw ValidationException::withMessages([
                    "units.$index.name" => 'Nama satuan tidak boleh kosong.',
                ]);
            }

            $clean[] = [
                'name' => mb_substr($name, 0, 32),
                'factor' => max(0, (int) ($unit['factor'] ?? 0)),
                'buy_price' => isset($unit['buy_price']) && $unit['buy_price'] !== '' && $unit['buy_price'] !== null ? round((float) $unit['buy_price'], 2) : null,
                'sell_price' => isset($unit['sell_price']) && $unit['sell_price'] !== '' && $unit['sell_price'] !== null ? round((float) $unit['sell_price'], 2) : null,
                'is_base' => (bool) ($unit['is_base'] ?? false),
            ];
        }

        if ($clean === []) {
            throw ValidationException::withMessages([
                'units' => 'Produk minimal harus punya satu satuan.',
            ]);
        }

        if (count(array_filter($clean, fn ($u) => $u['is_base'])) !== 1) {
            throw ValidationException::withMessages([
                'units' => 'Pilih tepat satu satuan dasar untuk produk ini.',
            ]);
        }

        foreach ($clean as $unit) {
            if ($unit['is_base'] && $unit['factor'] !== 1) {
                throw ValidationException::withMessages([
                    'units' => "Satuan dasar '{$unit['name']}' harus bernilai 1, karena stok disimpan dalam satuan ini.",
                ]);
            }
        }

        $names = array_map(fn ($u) => mb_strtolower($u['name']), $clean);
        if (count($names) !== count(array_unique($names))) {
            throw ValidationException::withMessages([
                'units' => 'Ada nama satuan yang sama lebih dari sekali.',
            ]);
        }

        return $clean;
    }

    /**
     * Tentukan berapa kali jumlah satuan dasar lama harus dikali saat basis
     * pindah ke satuan terkecil yang baru.
     *
     * Rasionya diambil dari daftar satuan yang sedang di-usulkan, bukan dari
     * nilai yang tersimpan: daftar baru inilah yang menyatakan "1 dus = 24 btl".
     * Kalau diambil dari data lama, faktor satuan yang baru saja diperbarui
     * tidak akan pernah terbaca.
     *
     * @return array{0: ProductUnit, 1: int} satuan dasar lama + faktor konversi
     */
    private function resolveRebaseRatio(Product $product, array $incoming): array
    {
        $currentBase = $product->units()->where('is_base', true)->firstOrFail();

        if (! $currentBase) {
            throw ValidationException::withMessages([
                'units' => 'Produk ini belum punya satuan dasar.',
            ]);
        }

        $incomingBase = collect($incoming)->firstWhere('is_base', true);

        $oldSize = collect($incoming)->first(
            fn ($u) => mb_strtolower(trim((string) $u['name'])) === mb_strtolower($currentBase->name)
        );

        if (! $oldSize) {
            throw ValidationException::withMessages([
                'units' => "Satuan lama '{$currentBase->name}' harus tetap ada di daftar satuan, "
                    ."supaya isi satuannya diketahui dan stok bisa dikonversi.",
            ]);
        }

        $ratio = (int) $oldSize['factor'];

        if ($ratio < 1) {
            throw ValidationException::withMessages([
                'units' => "Isi satuan '{$currentBase->name}' belum diisi. "
                    .'Isi dulu berapa satuan dasar yang ada di dalamnya '
                    ."(misal 1 dus = {$incomingBase['name']} 24), baru ganti satuan dasarnya.",
            ]);
        }

        return [$currentBase, $ratio];
    }

    /**
     * Konversi stok ke satuan terkecil yang baru, lalu simpan daftar satuan.
     *
     * Tanpa `$confirmed`, operasi ini berhenti sebelum menyentuh apa pun dan
     * melempar detail konversinya supaya UI bisa meminta konfirmasi. Ini yang
     * mencegah "33 dus diam-diam dilabeli btl".
     *
     * @param  array<int, array{name: string, factor: int, is_base: bool}>  $clean
     */
    private function applyRebase(
        Product $product,
        ProductUnit $currentBase,
        array $clean,
        bool $confirmed,
        ?int $userId
    ): void {
        [$currentBase, $ratio] = $this->resolveRebaseRatio($product, $clean);
        $before = (int) $product->stock;
        $after = $before * $ratio;
        $incomingBase = collect($clean)->firstWhere('is_base', true);

        // Harga SEBELUM dibagi harus ditangkap di sini. Setelah `save()`,
        // `getOriginal()` sudah mengembalikan nilai baru, sehingga catatan
        // movement akan tertulis "10000 -> 10000" dan jejaknya tidak berguna.
        $buyBefore = round((float) $product->buy_price, 2);
        $sellBefore = round((float) $product->sell_price, 2);

        // `buy_price`/`sell_price` produk dibaca sebagai harga per SATUAN
        // DASAR, jadi harus ikut dibagi. Kalau dilewati, harga per dus
        // 703.000 akan tetap utuh setelah stok jadi 792 btl, dan HPP ikut
        // terhitung 24 kali lipat - angka yang di form masih terlihat
        // masuk akal, tapi laba runtuh.
        $buyAfter = round($buyBefore / $ratio, 2);
        $sellAfter = round($sellBefore / $ratio, 2);

        if (! $confirmed) {
            // Tidak perlu melampirkan detail konversi lewat exception.
            // Form memanggil endpoint `rebase-preview` lebih dulu untuk
            // mendapatkan angka terstruktur, jadi di sini cukup jelaskan
            // konsekuensinya. (ValidationException tidak punya tempat untuk
            // metadata, dan mengarangnya hanya memindahkan masalah ke
            // frontend.)
            throw ValidationException::withMessages([
                'units' => "Mengganti satuan dasar akan mengubah stok produk ini dari "
                    ."{$before} {$currentBase->name} menjadi {$after} {$incomingBase['name']}. "
                    .'Harga beli dan harga jual ikut dibagi '.$ratio.'. '
                    .'Konfirmasi dulu untuk melanjutkan.',
            ]);
        }

        // `stock_movements.user_id` NOT NULL. Penulisnya harus ada, jadi jangan
        // diam-diam menulis 0 - lebih baik gagal dengan pesan yang jelas.
        $userId ??= auth()->id();
        if (! $userId) {
            throw new \LogicException('Pergantian satuan dasar harus tahu siapa yang melakukannya.');
        }

        DB::transaction(function () use ($product, $clean, $currentBase, $ratio, $before, $after, $incomingBase, $buyBefore, $buyAfter, $sellBefore, $sellAfter, $userId) {
            $minBefore = (int) $product->min_stock;
            $minAfter = $minBefore * $ratio;

            $product->forceFill([
                'stock' => $after,
                'min_stock' => $minAfter,
                'unit' => $incomingBase['name'],
                'buy_price' => $buyAfter,
                'sell_price' => $sellAfter,
            ])->save();

            $this->persistUnits($product, $clean);

            // Selalu ada jejak. Stok yang berubah satuan tanpa baris movement
            // berarti kartu stok dan laporan laba-rugi melenceng tanpa
            // alasan yang bisa dicari.
            StockMovement::create([
                'product_id' => $product->id,
                'type' => 'adjustment',
                'quantity' => $after - $before,
                'unit_name' => $incomingBase['name'],
                'base_quantity' => $after,
                'stock_before' => $before,
                'stock_after' => $after,
                'reference_type' => 'App\\Models\\Product',
                'reference_id' => $product->id,
                'note' => "Satuan dasar diubah dari {$currentBase->name} ke {$incomingBase['name']} "
                    ."(1 {$incomingBase['name']} = {$ratio} {$currentBase->name}). "
                    ."Harga per satuan ikut dibagi {$ratio}: "
                    ."beli {$buyBefore} -> {$buyAfter}, jual {$sellBefore} -> {$sellAfter}. "
                    ."Stok minimum: {$minBefore} -> {$minAfter}.",
                'date' => now()->toDateString(),
                'user_id' => $userId,
            ]);
        });
    }

    /**
     * Tulis daftar satuan ke database.
     *
     * Baris lama diperbarui in-place, bukan dihapus lalu dibuat ulang. Kalau
     * id berubah setiap simpan, form yang sedang dibuka akan menunjuk satuan
     * yang sudah tidak ada, dan `unit_id` yang tersimpan di draft transaksi
     * ikut jadi tidak terpakai.
     *
     * @param  array<int, array{name: string, factor: int, is_base: bool}>  $clean
     */
    private function persistUnits(Product $product, array $clean): void
    {
        DB::transaction(function () use ($product, $clean) {
            $keep = [];

            foreach ($clean as $unit) {
                $existing = $product->units()
                    ->whereRaw('LOWER(name) = ?', [mb_strtolower($unit['name'])])
                    ->first();

                if ($existing) {
                    $existing->update([
                        'factor' => $unit['factor'],
                        'buy_price' => $unit['buy_price'],
                        'sell_price' => $unit['sell_price'],
                        'is_base' => $unit['is_base'],
                    ]);
                    $keep[] = $existing->id;
                } else {
                    $keep[] = $product->units()->create($unit)->id;
                }
            }

            // Satuan yang dibuang user boleh hilang: item transaksi menyimpan
            // snapshot (unit_name/unit_factor), bukan foreign key, jadi
            // dokumen lama tetap tercetak dengan arti yang sama.
            $product->units()->whereNotIn('id', $keep)->delete();

            $this->syncBaseUnitName($product->refresh());
        });
    }
}
