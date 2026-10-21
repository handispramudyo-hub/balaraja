<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockMovement extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_id',
        'type',
        'quantity',
        'unit_name',
        'base_quantity',
        'stock_before',
        'stock_after',
        'reference_type',
        'reference_id',
        'note',
        'date',
        'user_id',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'base_quantity' => 'integer',
        'stock_before' => 'integer',
        'stock_after' => 'integer',
        'date' => 'date',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function reference()
    {
        return $this->morphTo();
    }
}
