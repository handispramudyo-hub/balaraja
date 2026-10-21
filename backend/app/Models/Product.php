<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Product extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'category_id',
        'unit',
        'buy_price',
        'sell_price',
        'stock',
        'min_stock',
        'supplier_id',
        'status',
    ];

    protected $casts = [
        'buy_price' => 'decimal:2',
        'sell_price' => 'decimal:2',
        'stock' => 'integer',
        'min_stock' => 'integer',
    ];

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    /**
     * Semua satuan produk ini, satuan dasar lebih dulu supaya form selalu
     * membuka daftar dari satuan yang paling sering dipakai kasir.
     */
    public function units(): HasMany
    {
        return $this->hasMany(ProductUnit::class)
            ->orderByDesc('is_base')
            ->orderBy('name');
    }

    /**
     * Satuan dasar produk - satuan terkecil, tempat `stock` disimpan.
     *
     * `is_base` di `product_units` yang otoritatif. `products.unit` hanya
     * cerminan yang disinkronkan (dipakai laporan & PDF lama), jadi
     * keduanya dicek ikut gerak di `ProductUnitService::syncBaseUnitName()`.
     */
    public function baseUnit(): HasOne
    {
        return $this->hasOne(ProductUnit::class)->where('is_base', true);
    }
}
