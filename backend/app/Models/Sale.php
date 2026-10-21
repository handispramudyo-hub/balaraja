<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Sale extends Model
{
    use HasFactory;

    protected $fillable = [
        'sale_number',
        'date',
        'customer_id',
        'total',
        'payment',
        'receivable',
        'due_date',
        'payment_status',
        'note',
        'user_id',
    ];

    protected $casts = [
        'date' => 'date',
        'due_date' => 'date',
        'total' => 'decimal:2',
        'payment' => 'decimal:2',
        'receivable' => 'decimal:2',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(SaleItem::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    /**
     * Rencana cicilan, kalau penjualan ini dicicilkan. `HasOne` bukan
     * `HasMany` karena satu transaksi hanya boleh punya satu tenor; batas itu
     * dijamin unique index di `installment_plans.sale_id`.
     */
    public function installmentPlan(): HasOne
    {
        return $this->hasOne(InstallmentPlan::class, 'sale_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
