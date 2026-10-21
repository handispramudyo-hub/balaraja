<?php

namespace App\Services;

use App\Models\DocumentSequence;
use App\Models\Payment;
use App\Models\Purchase;
use App\Models\Sale;
use App\Models\SupplierPayment;
use Illuminate\Support\Facades\DB;

class DocumentNumberService
{
    /**
     * Prefix => [model, kolom nomor, kolom tanggal]
     */
    private const SOURCES = [
        'SJ' => [Sale::class, 'sale_number', 'date'],
        'PB' => [Purchase::class, 'purchase_number', 'date'],
        'BY' => [Payment::class, 'payment_number', 'date'],
        // Pelunasan utang ke supplier. Prefix T (transaksi) + B (borrowing/
        // beli) dipilih agar tidak bentrok dengan BY yang sudah dipakai untuk
        // pembayaran masuk dari pelanggan.
        'TB' => [SupplierPayment::class, 'payment_number', 'date'],
    ];

    /**
     * Nomor berikutnya untuk prefix & tanggal tertentu, mis. SJ-20260925-001.
     *
     * Row sequence dikunci dengan lockForUpdate sehingga dua request bersamaan
     * pada tanggal yang sama tidak pernah mendapat nomor yang sama.
     */
    public function next(string $prefix, string $date): string
    {
        if (! isset(self::SOURCES[$prefix])) {
            throw new \InvalidArgumentException("Prefix dokumen tidak dikenal: {$prefix}");
        }

        $timestamp = strtotime($date);
        $docDate = date('Y-m-d', $timestamp);
        $numberDate = date('Ymd', $timestamp);
        $seed = $this->currentLastNumber($prefix, $date);

        // Pastikan row sequence ada DI LUAR transaksi, agar lock insert langsung
        // dilepas. Kalau insertOrIgnore dilakukan di dalam transaksi bersama
        // SELECT ... FOR UPDATE, InnoDB bisa deadlock (1213) saat beberapa
        // request datang bersamaan pada tanggal yang sama.
        DB::table('document_sequences')->insertOrIgnore([
            'prefix' => $prefix,
            'doc_date' => $docDate,
            'last_number' => $seed,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Naikkan counter secara atomik. Satu UPDATE pada satu baris hanya
        // bermodus antrean lock, tanpa gap-lock, sehingga bebas deadlock.
        // $attempts tetap dipakai sebagai jaring pengaman error konkurensi.
        $number = DB::transaction(function () use ($prefix, $docDate, $date) {
            // Query Builder mutable: harus dipakai ulang lewat closure,
            // kalau tidak where dari update sebelumnya ikut terbawa.
            $sequenceQuery = fn () => DB::table('document_sequences')
                ->where('prefix', $prefix)
                ->where('doc_date', $docDate);

            // Jaring pengaman: kalau ada dokumen yang masuk lewat jalur lain
            // (seeder/SQL manual) dan nomornya lebih besar, samakan dulu.
            $actual = $this->currentLastNumber($prefix, $date);

            if ($actual > 0) {
                $sequenceQuery()
                    ->where('last_number', '<', $actual)
                    ->update(['last_number' => $actual, 'updated_at' => now()]);
            }

            $sequenceQuery()->update([
                'last_number' => DB::raw('last_number + 1'),
                'updated_at' => now(),
            ]);

            return DocumentSequence::where('prefix', $prefix)
                ->where('doc_date', $docDate)
                ->lockForUpdate()
                ->value('last_number');
        }, 5);

        return $prefix . '-' . $numberDate . '-' . str_pad($number, 3, '0', STR_PAD_LEFT);
    }

    /**
     * Nomor terakhir yang sudah terpakai pada tanggal tersebut, supaya
     * sequence baru dimulai setelah data lama dan tidak bentrok unique index.
     */
    private function currentLastNumber(string $prefix, string $date): int
    {
        [$model, $column, $dateColumn] = self::SOURCES[$prefix];

        $last = $model::whereDate($dateColumn, $date)
            ->orderByDesc('id')
            ->value($column);

        if (! $last) {
            return 0;
        }

        $position = strrpos($last, '-');
        $suffix = $position === false ? $last : substr($last, $position + 1);

        return is_numeric($suffix) ? (int) $suffix : 0;
    }
}
