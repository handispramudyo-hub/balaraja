<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class InstallmentPlan extends Model
{
    use HasFactory;

    protected $fillable = [
        'direction',
        'sale_id',
        'purchase_id',
        'months',
        'status',
        'user_id',
    ];

    protected $casts = [
        'months' => 'integer',
    ];

    public function installments(): HasMany
    {
        return $this->hasMany(Installment::class)->orderBy('seq');
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function purchase(): BelongsTo
    {
        return $this->belongsTo(Purchase::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Transaksi induk, sesuai arah plan. Lebih aman dipakai di service dan
     * display daripada accessed langsung `plan->sale` / `plan->purchase`,
     * karena pemanggil tidak perlu tahu kolom mana yang terisi.
     */
    public function transaction(): ?Model
    {
        return $this->direction === 'payable' ? $this->purchase : $this->sale;
    }

    /**
     * Sisa yang harus dicicilkan = total transaksi dikurangi semua yang
     * sudah dibayar. Menyalin rumus `total - SUM(payments)` yang dipakai
     * `PurchasePayableService`, supaya angka "sisa" di dua sisi tidak
     * berbeda definisi.
     */
    public function outstanding(): float
    {
        $transaction = $this->transaction();

        if ($transaction === null) {
            return 0.0;
        }

        $total = round((float) $transaction->total, 2);
        $paid = $this->direction === 'payable'
            ? round((float) $transaction->supplierPayments()->sum('amount'), 2)
            : round((float) $transaction->payments()->sum('amount'), 2);

        return max(0.0, round($total - $paid, 2));
    }

    /**
     * Dipakai laporan dan ringkasan di layar: berapa angsuran yang sudah
     * lunas dari total bulan yang disepakati.
     *
     * @return array{paid:int,total:int,remaining:int}
     */
    public function progress(): array
    {
        $rows = $this->installments()->get(['status']);

        $paid = $rows->where('status', 'paid')->count();

        return [
            'paid' => $paid,
            'total' => (int) $this->months,
            'remaining' => max(0, (int) $this->months - $paid),
        ];
    }
}
