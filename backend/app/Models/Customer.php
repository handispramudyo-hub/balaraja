<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Customer extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'code',
        'name',
        'owner_name',
        'phone',
        'address',
        'credit_limit',
        'total_receivable',
        'status',
        'note',
    ];

    /**
     * Kolom DECIMAL di MySQL dikembalikan driver sebagai string. Tanpa cast
     * ini, `total_receivable` ikut ter-serialize sebagai string sehingga
     * penjumlahan di frontend bisa gagal dan angka tampil tanpa formatting.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'credit_limit' => 'float',
        'total_receivable' => 'float',
    ];

    /**
     * Get the sales for the customer.
     */
    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class);
    }

    /**
     * Get the payments for the customer.
     */
    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }
}
