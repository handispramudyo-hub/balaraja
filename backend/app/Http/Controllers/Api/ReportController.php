<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Expense;
use App\Models\Product;
use App\Models\SaleItem;
use App\Services\ReportQueryService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    public function stock(Request $request)
    {
        $request->validate([
            'date' => 'nullable|date',
            'category_id' => 'nullable|exists:categories,id',
            'product_id' => 'nullable|exists:products,id',
        ]);

        $date = $request->date ? Carbon::parse($request->date) : Carbon::today();

        $products = Product::with(['category', 'units'])
            ->when($request->category_id, fn ($q) => $q->where('category_id', $request->category_id))
            ->when($request->product_id, fn ($q) => $q->where('id', $request->product_id))
            ->get();

        $ids = $products->pluck('id')->all();
        $movement = $ids === [] ? collect() : $this->stockMovementSummary($ids, $date);

        $data = $products->map(function ($product) use ($date, $movement) {
            $row = $movement->get($product->id);

            $stokMasuk = $row ? (float) $row->masuk : 0.0;
            $stokKeluar = $row ? (float) $row->keluar : 0.0;
            $netAfter = $row ? (float) $row->net_after : 0.0;

            // Jangkar ke stok terkini lalu mundurkan movement yang terjadi
            // SETELAH tanggal laporan, supaya angka historis tetap konsisten
            // dengan stok sekarang (termasuk untuk data lama yang stoknya pernah
            // diubah langsung tanpa movement).
            $stokSesudah = (float) $product->stock - $netAfter;
            $stokSebelum = $stokSesudah - ($stokMasuk - $stokKeluar);

            return [
                'id' => $product->id,
                'kode' => $product->code,
                'nama' => $product->name,
                'category' => $product->category?->name,
                'unit' => $product->unit,
                // Angka stok di laporan ini selalu dalam satuan dasar, jadi
                // kolomnya perlu menyatakan satuan itu secara eksplisit. Kalau
                // hanya menampilkan "unit" (nama satuan yang sudah usang di
                // produk lama), angka 792 bisa dibaca sebagai 792 dus.
                'base_unit' => $product->units->firstWhere('is_base', true)?->name ?? $product->unit,
                'stok_sebelum' => $stokSebelum,
                'stok_masuk' => $stokMasuk,
                'stok_keluar' => $stokKeluar,
                'stok_sesudah' => $stokSesudah,
                'tanggal' => ($row && $row->last_date)
                    ? Carbon::parse($row->last_date)->toDateString()
                    : null,
            ];
        });

        return response()->json([
            'date' => $date->format('Y-m-d'),
            'data' => $data,
        ]);
    }

    /**
     * Agregasi seluruh movement stok per produk dalam SATU query.
     *
     * `delta` menerjemahkan tipe movement menjadi dampak bersih terhadap stok.
     * Kunci tanda: tipe pembatalan menyimpan `quantity` BERLAWANAN dengan
     * efeknya, jadi keduanya harus dibalik agar net-nya nol saat dibatalkan.
     *
     *   purchase                 → quantity  (+q, stok masuk)
     *   purchase_reverse (-q)    → quantity  (-q, stok keluar)
     *   sale (+q)                → -quantity (-q, stok keluar)
     *   sale_reverse (-q)        → -quantity (+q, stok masuk)
     *   adjustment               → quantity
     *   adjustment_reverse (-q)  → quantity
     *
     * Versi lama hanya menghitung `purchase` & `sale`, sehingga setiap
     * pembatalan penjualan/pembelian menggeser angka stok. `masuk`/`keluar`
     * sengaja dihitung BRUTO per sisi supaya penjualan dan pembelian pada
     * tanggal yang sama tidak saling menutup.
     */
    private function stockMovementSummary(array $productIds, Carbon $date): Collection
    {
        $delta = "CASE stock_movements.type"
            . ' WHEN \'purchase\' THEN stock_movements.quantity'
            . ' WHEN \'purchase_reverse\' THEN stock_movements.quantity'
            . ' WHEN \'adjustment\' THEN stock_movements.quantity'
            . ' WHEN \'adjustment_reverse\' THEN stock_movements.quantity'
            . ' WHEN \'sale\' THEN -stock_movements.quantity'
            . ' WHEN \'sale_reverse\' THEN -stock_movements.quantity'
            . ' ELSE 0 END';

        // Pakai rentang tanggal, BUKAN `date = $day`. Kolom `date` bisa berisi
        // 'Y-m-d' (MySQL memotong kolom DATE) maupun 'Y-m-d H:i:s' (SQLite
        // tidak memotong). Rentang '>= 01' dan '< 02' benar untuk keduanya,
        // sedangkan `= '2026-09-01'` tidak akan cocok dengan nilai bertime.
        $dayStart = $date->toDateString();
        $dayNext = $date->copy()->addDay()->toDateString();

        return DB::table('stock_movements')
            ->whereIn('product_id', $productIds)
            ->selectRaw('product_id')
            ->selectRaw("SUM(CASE WHEN stock_movements.date >= ? THEN ({$delta}) ELSE 0 END) AS net_after", [$dayNext])
            ->selectRaw("SUM(CASE WHEN stock_movements.date >= ? AND stock_movements.date < ? AND ({$delta}) > 0 THEN ({$delta}) ELSE 0 END) AS masuk", [$dayStart, $dayNext])
            ->selectRaw("SUM(CASE WHEN stock_movements.date >= ? AND stock_movements.date < ? AND ({$delta}) < 0 THEN -({$delta}) ELSE 0 END) AS keluar", [$dayStart, $dayNext])
            ->selectRaw('MAX(stock_movements.date) AS last_date')
            ->groupBy('product_id')
            ->get()
            ->keyBy('product_id');
    }

    public function purchases(Request $request, ReportQueryService $reports)
    {
        $report = $reports->purchases($request);

        return response()->json([
            'data' => $report['rows'],
            'meta' => $report['meta'],
            'summary' => $report['summary'],
        ]);
    }

    public function sales(Request $request, ReportQueryService $reports)
    {
        $report = $reports->sales($request);

        return response()->json([
            'data' => $report['rows'],
            'meta' => $report['meta'],
            'summary' => $report['summary'],
        ]);
    }

    public function receivables(Request $request, ReportQueryService $reports)
    {
        $report = $reports->receivables($request);

        return response()->json([
            'data' => $report['rows'],
            'meta' => $report['meta'],
            'summary' => $report['summary'],
        ]);
    }

    public function expenses(Request $request)
    {
        $request->validate([
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'category' => 'nullable|in:transportasi,ongkos_kirim,operasional',
        ]);

        $query = Expense::query()
            ->when($request->start_date, fn ($q) => $q->where('date', '>=', $request->start_date))
            ->when($request->end_date, fn ($q) => $q->where('date', '<=', $request->end_date))
            ->when($request->category, fn ($q) => $q->where('category', $request->category));

        $data = $query->clone()->orderByDesc('date')->get()
            ->map(function ($e) {
                return [
                    'id' => $e->id,
                    'tanggal' => $e->date,
                    'kategori' => $e->category,
                    'keterangan' => $e->description,
                    'nominal' => (float) $e->amount,
                ];
            });

        $summaryByCategory = (clone $query)
            ->select('category', DB::raw('SUM(amount) as total'))
            ->groupBy('category')
            ->get()
            ->map(fn ($s) => [
                'kategori' => $s->category,
                'total' => (float) $s->total,
            ]);

        $totalExpenses = (clone $query)->sum('amount');

        return response()->json([
            'data' => $data,
            'summary_by_category' => $summaryByCategory,
            'total_expenses' => (float) $totalExpenses,
        ]);
    }

    public function profitLoss(Request $request)
    {
        $request->validate([
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
        ]);

        $startDate = $request->start_date ? Carbon::parse($request->start_date) : Carbon::now()->startOfMonth();
        $endDate = $request->end_date ? Carbon::parse($request->end_date) : Carbon::now()->endOfMonth();

        $omzet = SaleItem::whereHas('sale', function ($q) use ($startDate, $endDate) {
            $q->whereBetween('date', [$startDate, $endDate]);
        })->sum('subtotal');

        $modal = SaleItem::whereHas('sale', function ($q) use ($startDate, $endDate) {
            $q->whereBetween('date', [$startDate, $endDate]);
        })->sum(DB::raw('quantity * buy_price'));

        $labaKotor = $omzet - $modal;

        $expensesByCategory = Expense::whereBetween('date', [$startDate, $endDate])
            ->select('category', DB::raw('SUM(amount) as total'))
            ->groupBy('category')
            ->get()
            ->keyBy('category');

        $transportasi = (float) ($expensesByCategory['transportasi']->total ?? 0);
        $ongkosKirim = (float) ($expensesByCategory['ongkos_kirim']->total ?? 0);
        $operasional = (float) ($expensesByCategory['operasional']->total ?? 0);

        $totalBiaya = $transportasi + $ongkosKirim + $operasional;
        $labaBersih = $labaKotor - $totalBiaya;

        return response()->json([
            'period' => [
                'start_date' => $startDate->format('Y-m-d'),
                'end_date' => $endDate->format('Y-m-d'),
            ],
            'omzet' => (float) $omzet,
            'modal' => (float) $modal,
            'laba_kotor' => (float) $labaKotor,
            'expenses' => [
                'transportasi' => $transportasi,
                'ongkos_kirim' => $ongkosKirim,
                'operasional' => $operasional,
            ],
            'total_biaya' => (float) $totalBiaya,
            'laba_bersih' => (float) $labaBersih,
            'status' => $labaBersih >= 0 ? 'laba' : 'rugi',
        ]);
    }
}
