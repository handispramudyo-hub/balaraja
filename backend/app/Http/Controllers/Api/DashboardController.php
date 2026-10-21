<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\Sale;
use App\Models\SaleItem;
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
        $endOfYear = Carbon::now()->endOfYear();

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

        $year = (int) $startOfYear->year;

        // Chart memakai 3 query agregat untuk setahun penuh. Versi lama
        // menjalankan 60 query (12 omzet + 24 laba + 12 penjualan + 12 biaya),
        // semuanya korelasi `whereHas` per bulan.
        $saleItemYear = SaleItem::query()
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->whereBetween('sales.date', [$startOfYear, $endOfYear])
            ->selectRaw($this->monthExpression('sales.date') . ' AS m')
            ->selectRaw('SUM(sale_items.subtotal) AS omzet')
            ->selectRaw('SUM(sale_items.quantity * sale_items.buy_price) AS modal')
            ->groupBy('m')
            ->get()
            ->keyBy('m');

        $salesYear = Sale::query()
            ->whereBetween('date', [$startOfYear, $endOfYear])
            ->selectRaw($this->monthExpression('date') . ' AS m')
            ->selectRaw('COUNT(*) AS c')
            ->groupBy('m')
            ->get()
            ->keyBy('m');

        $expenseYear = Expense::query()
            ->whereBetween('date', [$startOfYear, $endOfYear])
            ->selectRaw($this->monthExpression('date') . ' AS m')
            ->selectRaw('SUM(amount) AS a')
            ->groupBy('m')
            ->get()
            ->keyBy('m');

        // Key = nomor bulan (1-12). `map` biasa mengirim key sebagai argumen
        // kedua, sedangkan key `range(1,12)` bernilai 0-11 — harus dihindari.
        $months = collect(range(1, 12))->mapWithKeys(fn ($m) => [
            $m => Carbon::createFromDate($year, $m, 1)->format('M'),
        ]);

        $omzetChart = $months
            ->map(fn ($label, $m) => [
                'month' => $label,
                'value' => (float) ($saleItemYear->get($m)->omzet ?? 0),
            ])->values();

        $labaChart = $months
            ->map(fn ($label, $m) => [
                'month' => $label,
                'value' => (float) (($saleItemYear->get($m)->omzet ?? 0) - ($saleItemYear->get($m)->modal ?? 0)),
            ])->values();

        $salesChart = $months
            ->map(fn ($label, $m) => [
                'month' => $label,
                'value' => (int) ($salesYear->get($m)->c ?? 0),
            ])->values();

        $expenseChart = $months
            ->map(fn ($label, $m) => [
                'month' => $label,
                'value' => (float) ($expenseYear->get($m)->a ?? 0),
            ])->values();

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

    /**
     * Ekspresi SQL untuk mengambil nomor bulan dari sebuah kolom tanggal.
     * Produksi memakai MySQL, sedangkan test PHPUnit berjalan di SQLite
     * (phpunit.xml), jadi keduanya harus ditangani.
     */
    private function monthExpression(string $column): string
    {
        return DB::connection()->getDriverName() === 'sqlite'
            ? "CAST(STRFTIME('%m', {$column}) AS UNSIGNED)"
            : "MONTH({$column})";
    }
}
