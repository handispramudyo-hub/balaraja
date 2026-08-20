<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\StockMovement;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
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

        $products = Product::with('category')
            ->when($request->category_id, fn ($q) => $q->where('category_id', $request->category_id))
            ->when($request->product_id, fn ($q) => $q->where('id', $request->product_id))
            ->get()
            ->map(function ($product) use ($date) {
                $movements = StockMovement::where('product_id', $product->id)
                    ->where('date', '<=', $date);

                $stockAwal = (clone $movements)->where('date', '<', $date)->latest('id')->value('stock_after') ?? 0;
                $stokMasuk = (clone $movements)->where('type', 'purchase')->sum('quantity');
                $stokKeluar = (clone $movements)->where('type', 'sale')->sum('quantity');

                return [
                    'product_id' => $product->id,
                    'product_code' => $product->code,
                    'product_name' => $product->name,
                    'category' => $product->category->name,
                    'unit' => $product->unit,
                    'stock_awal' => $stockAwal,
                    'stok_masuk' => $stokMasuk,
                    'stok_keluar' => $stokKeluar,
                    'stok_akhir' => $stockAwal + $stokMasuk - $stokKeluar,
                ];
            });

        return response()->json([
            'date' => $date->format('Y-m-d'),
            'data' => $products,
        ]);
    }

    public function purchases(Request $request)
    {
        $request->validate([
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'supplier_id' => 'nullable|exists:suppliers,id',
        ]);

        $purchases = Purchase::with('supplier')
            ->when($request->start_date, fn ($q) => $q->where('date', '>=', $request->start_date))
            ->when($request->end_date, fn ($q) => $q->where('date', '<=', $request->end_date))
            ->when($request->supplier_id, fn ($q) => $q->where('supplier_id', $request->supplier_id))
            ->orderByDesc('date')
            ->get();

        return response()->json(['data' => $purchases]);
    }

    public function sales(Request $request)
    {
        $request->validate([
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'customer_id' => 'nullable|exists:customers,id',
            'payment_status' => 'nullable|in:unpaid,partial,paid',
        ]);

        $sales = Sale::with('customer')
            ->when($request->start_date, fn ($q) => $q->where('date', '>=', $request->start_date))
            ->when($request->end_date, fn ($q) => $q->where('date', '<=', $request->end_date))
            ->when($request->customer_id, fn ($q) => $q->where('customer_id', $request->customer_id))
            ->when($request->payment_status, fn ($q) => $q->where('payment_status', $request->payment_status))
            ->orderByDesc('date')
            ->get()
            ->map(function ($sale) {
                return [
                    'id' => $sale->id,
                    'sale_number' => $sale->sale_number,
                    'date' => $sale->date,
                    'customer' => $sale->customer->name,
                    'total' => (float) $sale->total,
                    'payment' => (float) $sale->payment,
                    'receivable' => (float) $sale->receivable,
                    'payment_status' => $sale->payment_status,
                ];
            });

        return response()->json(['data' => $sales]);
    }

    public function receivables(Request $request)
    {
        $request->validate([
            'customer_id' => 'nullable|exists:customers,id',
            'status' => 'nullable|in:unpaid,partial',
        ]);

        $customers = Customer::where('total_receivable', '>', 0)
            ->when($request->customer_id, fn ($q) => $q->where('id', $request->customer_id))
            ->with(['sales' => function ($q) use ($request) {
                $q->where('payment_status', '!=', 'paid')
                    ->when($request->status, fn ($sq) => $sq->where('payment_status', $request->status))
                    ->orderByDesc('date');
            }])
            ->get()
            ->map(function ($customer) {
                return [
                    'id' => $customer->id,
                    'code' => $customer->code,
                    'name' => $customer->name,
                    'total_receivable' => (float) $customer->total_receivable,
                    'sales' => $customer->sales->map(fn ($s) => [
                        'id' => $s->id,
                        'sale_number' => $s->sale_number,
                        'date' => $s->date,
                        'total' => (float) $s->total,
                        'payment' => (float) $s->payment,
                        'receivable' => (float) $s->receivable,
                        'due_date' => $s->due_date,
                        'payment_status' => $s->payment_status,
                    ]),
                ];
            });

        return response()->json(['data' => $customers]);
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

        $data = $query->clone()->orderByDesc('date')->get();

        $summaryByCategory = (clone $query)
            ->select('category', DB::raw('SUM(amount) as total'))
            ->groupBy('category')
            ->get();

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
