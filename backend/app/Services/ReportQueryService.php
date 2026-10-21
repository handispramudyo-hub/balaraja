<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Purchase;
use App\Models\Sale;
use App\Models\Supplier;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Satu sumber data untuk seluruh laporan transaksi.
 *
 * Layar, cetak, Excel, dan PDF WAJIB memakai service ini — bukan membuat
 * query sendiri di masing-masing penyaji. Kalau ada dua jalur query, angka
 * pasti akan berbeda pada akhirnya (beda join, beda filter, beda timezone).
 *
 * Kontrak payload: setiap field yang dulu dikembalikan controller lama
 * HARUS tetap ada dengan format yang sama. Field baru hanya ditambahkan,
 * supaya addition frontend tidak pernah silent-drop kolom.
 */
class ReportQueryService
{
    /**
     * Bentuk item seragam untuk semua laporan transaksi.
     *
     * Catatan produk: HPP/laba per item SENGAJA tidak diekspos di sini
     * (keputusan pemilik laporan penjualan & pembelian). `buy_price` tetap
     * dipakai, tapi hanya untuk menjumlahkan HPP di level TOTAL laporan
     * supaya Laba Rugi masih bisa direkonsiliasi tanpa membuka margin per
     * barang di laporan ini.
     */
    private function itemRows(Collection $items, string $priceColumn): array
    {
        return $items->map(fn ($item) => [
            'kode' => $item->product?->code ?? '-',
            'nama' => $item->product?->name ?? '(produk dihapus)',
            // `satuan` WAJIB dari snapshot `unit_name` di baris item, bukan
            // dari `products.unit` sekarang. `products.unit` selalu satuan
            // dasar TERKINI: begitu owner ganti satuan dasar (dos -> btl),
            // laporan penjualan/pembelian lama, cetak PDF, dan Excel ikut
            // ikut berubah labelnya tanpa ada yang menyentuhnya. Qty di baris
            // item masih dalam satuan saat transaksi itu dibuat, jadi
            // memakainya bersama satuan sekarang menghasilkan angka yang
            // salah (2 dos dicetak sebagai "2 btl").
            // Snapshot null = baris legacy sebelum fitur satuan; produknya
            // masih punya satu satuan dasar, jadi `products.unit` adalah
            // jawaban yang benar untuk baris itu.
            'satuan' => $item->unit_name ?: ($item->product?->unit ?? '-'),
            'qty' => (float) $item->quantity,
            'harga' => (float) $item->{$priceColumn},
            'subtotal' => (float) $item->subtotal,
        ])->values()->all();
    }

    /**
     * HPP sebuah transaksi dari snapshot `buy_price` di baris item.
     * Memakai snapshot, bukan harga produk saat ini, supaya laporan lama
     * tidak berubah retroaktif ketika harga beli produk ikut diperbarui.
     */
    private function transactionHpp(Collection $items): float
    {
        return (float) $items->sum(
            fn ($item) => (float) $item->buy_price * (float) $item->quantity
        );
    }

    private function periodLabel(?string $start, ?string $end): string
    {
        if (! $start && ! $end) {
            return 'Semua periode';
        }

        if ($start && $end) {
            return Carbon::parse($start)->format('d/m/Y').' - '.Carbon::parse($end)->format('d/m/Y');
        }

        return $start
            ? 'Sejak '.Carbon::parse($start)->format('d/m/Y')
            : 'Sampai '.Carbon::parse($end)->format('d/m/Y');
    }

    /**
     * Ringkasan filter aktif, ditulis human-readable supaya bisa langsung
     * dicetak di kop laporan tanpa logika tambahan di Blade/Excel.
     *
     * @param  array<string, string>  $labels  request key => label Indonesia
     */
    private function activeFilters(Request $request, array $labels): array
    {
        $out = [];

        foreach ($labels as $key => $label) {
            $value = $request->input($key);

            if ($value === null || $value === '') {
                continue;
            }

            $out[] = $label.': '.$this->humanizeFilter($key, $value);
        }

        return $out;
    }

    private function humanizeFilter(string $key, $value): string
    {
        $statusLabels = [
            'unpaid' => 'Belum bayar',
            'partial' => 'Sebagian',
            'paid' => 'Lunas',
        ];

        if ($key === 'payment_status' || $key === 'status') {
            return $statusLabels[$value] ?? $value;
        }

        if ($key === 'customer_id' || $key === 'supplier_id') {
            $model = $key === 'customer_id' ? Customer::class : Supplier::class;

            return $model::whereKey($value)->value('name') ?? '#'.$value;
        }

        return (string) $value;
    }

    private function meta(string $title, string $slug, Request $request, array $labels, array $extra = []): array
    {
        return array_merge([
            'title' => $title,
            'slug' => $slug,
            'periode' => $this->periodLabel($request->input('start_date'), $request->input('end_date')),
            'filters' => $this->activeFilters($request, $labels),
            'generated_at' => Carbon::now()->toDateTimeString(),
        ], $extra);
    }

    public function sales(Request $request): array
    {
        $request->validate([
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'customer_id' => 'nullable|exists:customers,id',
            'payment_status' => 'nullable|in:unpaid,partial,paid',
        ]);

        $sales = Sale::query()
            ->with([
                'customer:id,name',
                'items.product:id,code,name,unit',
            ])
            ->when($request->start_date, fn ($q) => $q->where('date', '>=', $request->start_date))
            ->when($request->end_date, fn ($q) => $q->where('date', '<=', $request->end_date))
            ->when($request->customer_id, fn ($q) => $q->where('customer_id', $request->customer_id))
            ->when($request->payment_status, fn ($q) => $q->where('payment_status', $request->payment_status))
            ->orderByDesc('date')
            ->orderByDesc('id')
            ->get();

        $rows = $sales->map(function (Sale $sale) {
            $hpp = $this->transactionHpp($sale->items);

            return [
                // --- field lama, tidak diubah bentuknya ---
                'id' => $sale->id,
                'no_transaksi' => $sale->sale_number,
                'tanggal' => $sale->date,
                'nama_toko' => $sale->customer?->name ?? '-',
                'total' => (float) $sale->total,
                'pembayaran' => (float) $sale->payment,
                'sisa_piutang' => (float) $sale->receivable,
                'payment_status' => $sale->payment_status,
                // --- field baru ---
                'hpp' => $hpp,
                'laba_kotor' => (float) $sale->total - $hpp,
                'items' => $this->itemRows($sale->items, 'sell_price'),
            ];
        })->values();

        return [
            'meta' => $this->meta('Laporan Penjualan', 'penjualan', $request, [
                'customer_id' => 'Pelanggan',
                'payment_status' => 'Status Pembayaran',
            ]),
            'summary' => [
                'jumlah_transaksi' => $rows->count(),
                'omzet' => (float) $rows->sum('total'),
                'hpp' => (float) $rows->sum('hpp'),
                'laba_kotor' => (float) $rows->sum('laba_kotor'),
                'diterima' => (float) $rows->sum('pembayaran'),
                'piutang' => (float) $rows->sum('sisa_piutang'),
            ],
            'rows' => $rows->all(),
        ];
    }

    public function purchases(Request $request): array
    {
        $request->validate([
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'supplier_id' => 'nullable|exists:suppliers,id',
            'payment_status' => 'nullable|in:unpaid,partial,paid',
        ]);

        $purchases = Purchase::query()
            ->with([
                'supplier:id,name',
                'items.product:id,code,name,unit',
            ])
            ->when($request->start_date, fn ($q) => $q->where('date', '>=', $request->start_date))
            ->when($request->end_date, fn ($q) => $q->where('date', '<=', $request->end_date))
            ->when($request->supplier_id, fn ($q) => $q->where('supplier_id', $request->supplier_id))
            // Filter status pembayaran disamakan dengan filter di
            // PurchaseController::index, supaya yang tampil di layar dan
            // yang masuk file export selalu himpunan data yang sama.
            ->when($request->payment_status, fn ($q) => $q->where('payment_status', $request->payment_status))
            ->orderByDesc('date')
            ->orderByDesc('id')
            ->get();

        $rows = $purchases->map(function (Purchase $purchase) {
            return [
                // --- field lama, tidak diubah bentuknya ---
                'id' => $purchase->id,
                'no_pembelian' => $purchase->purchase_number,
                'tanggal' => $purchase->date,
                'nama_supplier' => $purchase->supplier?->name ?? '-',
                'total' => (float) $purchase->total,
                // Utang sisa. `payable` yang dibaca, bukan dihitung ulang di
                // sini, supaya angka di laporan sama persis dengan angka di
                // daftar transaksi - kalau dihitung ulang, setiap laporan
                // punya peluang melenceng sendiri.
                'sisa_utang' => (float) $purchase->payable,
                'jatuh_tempo' => $purchase->due_date,
                'status_pembayaran' => $purchase->payment_status,
                // --- field baru ---
                'items' => $this->itemRows($purchase->items, 'buy_price'),
            ];
        })->values();

        return [
            'meta' => $this->meta('Laporan Pembelian', 'pembelian', $request, [
                'supplier_id' => 'Supplier',
                'payment_status' => 'Status Pembayaran',
            ]),
            'summary' => [
                'jumlah_transaksi' => $rows->count(),
                'total' => (float) $rows->sum('total'),
                // Total utang tersisa di periode ini. Wajib ikut di
                // ringkasan: tanpa ini, laporan pembelian tetap terlihat
                // utuhnya padahal separuhnya masih berutang.
                'sisa_utang' => (float) $rows->sum('sisa_utang'),
            ],
            'rows' => $rows->all(),
        ];
    }

    public function receivables(Request $request): array
    {
        $request->validate([
            'customer_id' => 'nullable|exists:customers,id',
            'status' => 'nullable|in:unpaid,partial',
            // `search` dulu hanya difilter di sisi browser. Kalau begitu,
            // file export akan berisi pelanggan yang justru tersembunyi di
            // layar — angka layar dan file tidak akan sama. Karena itu
            // pencarian ikut ditangani di server.
            'search' => 'nullable|string|max:120',
        ]);

        $customers = Customer::query()
            ->where('total_receivable', '>', 0)
            ->when($request->customer_id, fn ($q) => $q->where('id', $request->customer_id))
            ->when(
                $request->search,
                fn ($q) => $q->where('name', 'like', '%'.$request->search.'%')
            )
            ->with(['sales' => function ($q) use ($request) {
                $q->where('payment_status', '!=', 'paid')
                    ->when($request->status, fn ($sq) => $sq->where('payment_status', $request->status))
                    ->with('items.product:id,code,name,unit')
                    ->orderByDesc('date');
            }])
            ->get()
            ->filter(fn ($customer) => $customer->sales->isNotEmpty());

        $rows = $customers->map(function (Customer $customer) {
            $sales = $customer->sales;
            $sisaPiutang = (float) $sales->sum('receivable');
            $pembayaran = (float) $sales->sum('payment');

            return [
                // --- field lama, tidak diubah bentuknya ---
                'id' => $customer->id,
                'nama_toko' => $customer->name,
                'total_transaksi' => (float) $sales->sum('total'),
                'pembayaran' => $pembayaran,
                'sisa_piutang' => $sisaPiutang,
                'jatuh_tempo' => $sales->sortBy('due_date')->first()?->due_date,
                'status_lunas' => $sisaPiutang <= 0 ? 'lunas' : ($pembayaran > 0 ? 'partial' : 'unpaid'),
                'detail' => $sales->map(fn (Sale $sale) => [
                    'id' => $sale->id,
                    'no_transaksi' => $sale->sale_number,
                    'tanggal' => $sale->date,
                    'total' => (float) $sale->total,
                    'pembayaran' => (float) $sale->payment,
                    'sisa_piutang' => (float) $sale->receivable,
                    'jatuh_tempo' => $sale->due_date,
                    // --- field baru ---
                    'items' => $this->itemRows($sale->items, 'sell_price'),
                ])->values(),
            ];
        })->values();

        return [
            'meta' => $this->meta('Laporan Piutang', 'piutang', $request, [
                'customer_id' => 'Pelanggan',
                'status' => 'Status',
                'search' => 'Cari Nama',
            ]),
            'summary' => [
                'jumlah_pelanggan' => $rows->count(),
                'total_transaksi' => (float) $rows->sum('total_transaksi'),
                'pembayaran' => (float) $rows->sum('pembayaran'),
                'sisa_piutang' => (float) $rows->sum('sisa_piutang'),
            ],
            'rows' => $rows->all(),
        ];
    }
}
