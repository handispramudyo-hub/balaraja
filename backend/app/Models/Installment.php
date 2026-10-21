<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Installment extends Model
{
    use HasFactory;

    protected $fillable = [
        'installment_plan_id',
        'seq',
        'due_date',
        'amount',
        'paid_amount',
        'status',
    ];

    protected $casts = [
        'seq' => 'integer',
        'due_date' => 'date',
        'amount' => 'decimal:2',
        'paid_amount' => 'decimal:2',
    ];

    public function plan(): BelongsTo
    {
        return $this->belongsTo(InstallmentPlan::class, 'installment_plan_id');
    }

    /**
     * Sisa angsuran ini saja. `max(0)` menjaga supaya selisih pembulatan
     * sen yang tidak bisa dihindari tidak berubah menjadi sisa negatif -
     * yang di layar akan tampil sebagai "-Rp0,50", lebih membingungkan
     * daripada "Rp0".
     */
    public function remaining(): float
    {
        return max(0.0, round((float) $this->amount - (float) $this->paid_amount, 2));
    }
}
