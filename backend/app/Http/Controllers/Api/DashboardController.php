<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\Sale;
use App\Models\SaleItem;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function index()
    {
        $today = Carbon::today();
        $startOfMonth = Carbon::now()->startOfMonth();
        $endOfMonth = Carbon::now()->endOfMonth();
        $startOfYear = Carbon::now()->startOfYear();

        $omzetToday = SaleItem::whereHas('sale', fn ($q) => $q->where('date', $today))
            ->sum('subtotal');

        $omzetMonth = SaleItem::whereHas('sale', function ($q) use ($startOfMonth, $endOfMonth) {
            $q->whereBetween('date', [$startOfMonth, $endOfMonth]);
        })->sum('subtotal');

        $totalModal = SaleItem::whereHas('sale', function ($q) use ($startOfMonth, $endOfMonth) {
            $q->whereBetween('date', [$startOfMonth, $endOfMonth]);
        })->sum(DB::raw('quantity * buy_price'));

        $labaKotor = $omzetMonth - $totalModal;

        $totalBiaya = Expense::whereBetween('date', [$startOfMonth, $endOfMonth])->sum('amount');

        $labaBersih = $labaKotor - $totalBiaya;

        $totalPiutang = Customer::sum('total_receivable');

        $totalProducts = Product::count();
        $totalStock = Product::sum('stock');
        $lowStock = Product::whereColumn('stock', '<=', 'min_stock')
            ->where('stock', '>', 0)
            ->count();
        $outOfStock = Product::where('stock', 0)->count();

        $totalPurchasesMonth = Purchase::whereBetween('date', [$startOfMonth, $endOfMonth])->count();
        $totalSalesMonth = Sale::whereBetween('date', [$startOfMonth, $endOfMonth])->count();
        $paymentsReceivedMonth = DB::table('payments')
            ->whereBetween('date', [$startOfMonth, $endOfMonth])
            ->sum('amount');
        $unpaidReceivable = Sale::where('payment_status', '!=', 'paid')->sum('receivable');

        $months = collect(range(1, 12))->map(function ($m) use ($startOfYear) {
            return Carbon::now()->year($startOfYear->year)->month($m);
        });

        $omzetChart = $months->map(function ($m) {
            $start = $m->copy()->startOfMonth();
            $end = $m->copy()->endOfMonth();
            return [
                'month' => $m->format('M'),
                'value' => (float) SaleItem::whereHas('sale', function ($q) use ($start, $end) {
                    $q->whereBetween('date', [$start, $end]);
                })->sum('subtotal'),
            ];
        })->values();

        $labaChart = $months->map(function ($m) {
            $start = $m->copy()->startOfMonth();
            $end = $m->copy()->endOfMonth();
            $omzet = SaleItem::whereHas('sale', function ($q) use ($start, $end) {
                $q->whereBetween('date', [$start, $end]);
            })->sum('subtotal');
            $modal = SaleItem::whereHas('sale', function ($q) use ($start, $end) {
                $q->whereBetween('date', [$start, $end]);
            })->sum(DB::raw('quantity * buy_price'));
            return [
                'month' => $m->format('M'),
                'value' => (float) ($omzet - $modal),
            ];
        })->values();

        $salesChart = $months->map(function ($m) {
            $start = $m->copy()->startOfMonth();
            $end = $m->copy()->endOfMonth();
            return [
                'month' => $m->format('M'),
                'value' => Sale::whereBetween('date', [$start, $end])->count(),
            ];
        })->values();

        $expenseChart = $months->map(function ($m) {
            $start = $m->copy()->startOfMonth();
            $end = $m->copy()->endOfMonth();
            return [
                'month' => $m->format('M'),
                'value' => (float) Expense::whereBetween('date', [$start, $end])->sum('amount'),
            ];
        })->values();

        return response()->json([
            'financial_summary' => [
                'omzet_today' => (float) $omzetToday,
                'omzet_month' => (float) $omzetMonth,
                'total_modal' => (float) $totalModal,
                'laba_kotor' => (float) $labaKotor,
                'total_biaya' => (float) $totalBiaya,
                'laba_bersih' => (float) $labaBersih,
                'total_piutang' => (float) $totalPiutang,
            ],
            'inventory_summary' => [
                'total_products' => $totalProducts,
                'total_stock' => (int) $totalStock,
                'low_stock' => $lowStock,
                'out_of_stock' => $outOfStock,
            ],
            'transaction_summary' => [
                'total_purchases_month' => $totalPurchasesMonth,
                'total_sales_month' => $totalSalesMonth,
                'payments_received_month' => (float) $paymentsReceivedMonth,
                'unpaid_receivable' => (float) $unpaidReceivable,
            ],
            'charts' => [
                'omzet_chart' => $omzetChart,
                'laba_chart' => $labaChart,
                'sales_chart' => $salesChart,
                'expense_chart' => $expenseChart,
            ],
        ]);
    }
}
