<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Satu satuan dari sebuah produk, beserta faktor konversinya ke satuan dasar.
 *
 * Lihat `2026_09_30_000003_create_product_units_table.php` untuk konvensi
 * faktor. Ringkasnya: `factor` = berapa satuan dasar yang setara dengan 1
 * satuan ini, dan satuan dasar selalu bernilai 1.
 *
 * @property int $id
 * @property int $product_id
 * @property string $name
 * @property int $factor
 * @property bool $is_base
 */
class ProductUnit extends Model
{
    protected $fillable = [
        'product_id',
        'name',
        'factor',
        'is_base',
    ];

    protected $casts = [
        'factor' => 'integer',
        'is_base' => 'boolean',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * Berapa satuan dasar yang setara dengan jumlah satuan ini.
     *
     * Ini satu-satunya tempat konversi dihitung, supaya tidak ada dua bagian
     * kode yang keliru mengali dengan cara berbeda dan menghasilkan stok yang
     * salah tanpa jejak. Factor 0 berarti satuan ini belum dikonfigurasi, dan
     * sengaja melempar exception - lebih baik transaksi ditolak daripada
     * tersimpan dengan konversi nol yang diam-diam menggeser seluruh stok.
     */
    public function toBaseQuantity(int $quantity): int
    {
        if ($this->factor < 1) {
            throw new \InvalidArgumentException(
                "Satuan '{$this->name}' belum punya faktor konversi yang valid. "
                .'Isi di form produk sebelum memakai satuan ini.'
            );
        }

        return $quantity * $this->factor;
    }

    /**
     * Sisa stok yang bisa diekspresikan dalam satuan ini, untuk ditampilkan.
     * Mengembalikan sisa dalam satuan terkecil supaya tidak ada pecahan yang
     * hilang diam-diam: 787 btl jadi 32 dus + 19 btl, bukan 32 dus.
     */
    public function decompose(int $baseQuantity): array
    {
        return [
            'whole' => intdiv($baseQuantity, $this->factor),
            'remainder' => $baseQuantity % $this->factor,
        ];
    }
}
