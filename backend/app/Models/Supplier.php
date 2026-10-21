<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Supplier extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'contact_name',
        'phone',
        'address',
        'note',
        'status',
    ];

    /**
     * Get the purchases for the supplier.
     */
    public function purchases(): HasMany
    {
        return $this->hasMany(Purchase::class);
    }

    public function supplierPayments(): HasMany
    {
        return $this->hasMany(SupplierPayment::class);
    }

    /**
     * Total utang ke supplier ini.
     *
     * Dijumlahkan langsung dari `purchases.payable`, bukan disimpan sebagai
     * kolom di tabel `suppliers` seperti `customers.total_receivable` di sisi
     * piutang.
     *
     * Alasannya: saldo yang disimpan harus disegarkan ulang di setiap
     * create/update/delete pembayaran, dan tidak ada mekanisme di Laravel
     * yang memaksa penyegaran itu terjadi. Satu jalur yang lupa = saldo
     * melenceng permanen tanpa jejak. Karena `payable` sudah ada di baris
     * pembelian, tidak ada angka yang terduplikasi, jadi tidak ada yang bisa
     * tidak sinkron.
     */
    public function totalPayable(): float
    {
        return round((float) $this->purchases()
            ->whereIn('payment_status', ['unpaid', 'partial'])
            ->sum('payable'), 2);
    }

    /**
     * Sisa utang per status, untuk ringkasan cepat di layar supplier.
     */
    public function payableBreakdown(): array
    {
        $rows = $this->purchases()
            ->whereIn('payment_status', ['unpaid', 'partial'])
            ->selectRaw('payment_status, COUNT(*) as jml, SUM(payable) as total')
            ->groupBy('payment_status')
            ->get();

        return [
            'unpaid' => (float) ($rows->firstWhere('payment_status', 'unpaid')?->total ?? 0),
            'partial' => (float) ($rows->firstWhere('payment_status', 'partial')?->total ?? 0),
            'count' => (int) $rows->sum('jml'),
        ];
    }
}
