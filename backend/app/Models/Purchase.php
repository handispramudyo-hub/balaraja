<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Purchase extends Model
{
    use HasFactory;

    protected $fillable = [
        'purchase_number',
        'date',
        'supplier_id',
        'total',
        'payable',
        'due_date',
        'payment_status',
        'note',
        'user_id',
    ];

    protected $casts = [
        'date' => 'date',
        'due_date' => 'date',
        'total' => 'decimal:2',
        'payable' => 'decimal:2',
    ];

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(PurchaseItem::class);
    }

    public function supplierPayments(): HasMany
    {
        return $this->hasMany(SupplierPayment::class);
    }

    /**
     * Rencana cicilan, kalau pembelian ini dicicilkan. `HasOne` bukan
     * `HasMany` karena satu transaksi hanya boleh punya satu tenor; batas itu
     * dijamin unique index di `installment_plans.purchase_id`.
     */
    public function installmentPlan(): HasOne
    {
        return $this->hasOne(InstallmentPlan::class, 'purchase_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Sisa utang yang masih harus dibayar, dihitung ulang dari tabel
     * supplier_payments.
     *
     * Dipakai oleh daftar transaksi. `payable` di database adalah denormalisasi
     * dari total - total terbayar supaya baris bisa difilter dan diurutkan
     * lewat SQL; accessor ini adalah pembandingnya, dipakai supaya test bisa
     * membuktikan keduanya tidak pernah berbeda jauh.
     */
    public function remainingPayable(): float
    {
        $paid = (float) $this->supplierPayments()->sum('amount');

        return max(0.0, round((float) $this->total - $paid, 2));
    }

    public function isFullyPaid(): bool
    {
        return $this->payment_status === 'paid';
    }
}
