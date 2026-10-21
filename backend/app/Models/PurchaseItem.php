<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'purchase_id',
        'product_id',
        'unit_name',
        'unit_factor',
        'base_quantity',
        'quantity',
        'buy_price',
        'subtotal',
    ];

    protected $casts = [
        'unit_factor' => 'integer',
        'base_quantity' => 'integer',
        'quantity' => 'integer',
        'buy_price' => 'decimal:2',
        'subtotal' => 'decimal:2',
    ];

    /**
     * Jumlah dalam satuan dasar, dengan fallback ke `quantity`.
     *
     * Item yang dibuat sebelum fitur satuan ada belum punya `base_quantity`.
     * Waktu itu semua satuan bernilai 1, jadi `quantity` sudah benar dalam
     * satuan dasar - jadi fallback ini bukan tebakan, cuma melanjutkan
     * konvensi lama.
     */
    public function baseQuantity(): int
    {
        return (int) ($this->base_quantity ?? $this->quantity);
    }

    public function purchase(): BelongsTo
    {
        return $this->belongsTo(Purchase::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
