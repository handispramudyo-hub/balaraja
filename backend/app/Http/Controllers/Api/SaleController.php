<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Sale;
use App\Models\Product;
use App\Models\Customer;
use App\Models\StockMovement;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SaleController extends Controller
{
    public function index(Request $request)
    {
        $query = Sale::with('customer');

        if ($request->filled('date_from')) {
            $query->where('date', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $query->where('date', '<=', $request->date_to);
        }
        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }
        if ($request->filled('payment_status')) {
            $query->where('payment_status', $request->payment_status);
        }

        $sales = $query->latest()->paginate(15);

        return response()->json($sales);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'date' => 'required|date',
            'customer_id' => 'required|exists:customers,id',
            'note' => 'nullable|string',
            'payment' => 'nullable|numeric|min:0',
            'due_date' => 'nullable|date|after_or_equal:date',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|exists:products,id',
            'items.*.quantity' => 'required|integer|min:1',
            'items.*.sell_price' => 'required|numeric|min:0',
        ]);

        $sale = DB::transaction(function () use ($validated, $request) {
            foreach ($validated['items'] as $item) {
                $product = Product::find($item['product_id']);
                if ($product->stock < $item['quantity']) {
                    throw \Illuminate\Validation\ValidationException::withMessages([
                        "items.{$item['product_id']}.quantity" => "Stok produk {$product->name} tidak mencukupi. Stok tersedia: {$product->stock}",
                    ]);
                }
            }

            $lastSale = Sale::whereDate('date', $validated['date'])
                ->orderBy('id', 'desc')
                ->first();

            if ($lastSale) {
                $lastNumber = (int) substr($lastSale->sale_number, -3);
                $newNumber = $lastNumber + 1;
            } else {
                $newNumber = 1;
            }

            $saleNumber = 'SJ-' . date('Ymd', strtotime($validated['date'])) . '-' . str_pad($newNumber, 3, '0', STR_PAD_LEFT);

            $total = 0;
            $itemsData = [];

            foreach ($validated['items'] as $item) {
                $product = Product::find($item['product_id']);
                $subtotal = $item['quantity'] * $item['sell_price'];
                $total += $subtotal;

                $itemsData[] = [
                    'product_id' => $item['product_id'],
                    'quantity' => $item['quantity'],
                    'sell_price' => $item['sell_price'],
                    'buy_price' => $product->buy_price,
                    'subtotal' => $subtotal,
                ];
            }

            $payment = $validated['payment'] ?? 0;
            $receivable = $total - $payment;

            if ($receivable > 0) {
                $paymentStatus = 'unpaid';
            } elseif ($receivable == 0 && $payment > 0) {
                $paymentStatus = 'paid';
            } else {
                $paymentStatus = 'unpaid';
            }

            if ($payment > 0 && $payment < $total) {
                $paymentStatus = 'partial';
            } elseif ($payment >= $total) {
                $paymentStatus = 'paid';
            }

            $sale = Sale::create([
                'sale_number' => $saleNumber,
                'date' => $validated['date'],
                'customer_id' => $validated['customer_id'],
                'total' => $total,
                'payment' => $payment,
                'receivable' => $receivable,
                'due_date' => $validated['due_date'] ?? null,
                'payment_status' => $paymentStatus,
                'note' => $validated['note'] ?? null,
                'user_id' => $request->user()->id,
            ]);

            $sale->items()->createMany($itemsData);

            foreach ($validated['items'] as $item) {
                $product = Product::lockForUpdate()->find($item['product_id']);
                $stockBefore = $product->stock;
                $product->decrement('stock', $item['quantity']);

                StockMovement::create([
                    'product_id' => $item['product_id'],
                    'type' => 'sale',
                    'quantity' => $item['quantity'],
                    'stock_before' => $stockBefore,
                    'stock_after' => $stockBefore - $item['quantity'],
                    'reference_type' => 'App\\Models\\Sale',
                    'reference_id' => $sale->id,
                    'date' => $validated['date'],
                    'user_id' => $request->user()->id,
                ]);
            }

            if ($receivable > 0) {
                $customer = Customer::lockForUpdate()->find($validated['customer_id']);
                $totalReceivable = Sale::where('customer_id', $validated['customer_id'])
                    ->whereIn('payment_status', ['unpaid', 'partial'])
                    ->sum('receivable');
                $customer->update(['total_receivable' => $totalReceivable]);
            }

            return $sale;
        });

        return response()->json($sale->load('customer', 'items.product', 'payments'), 201);
    }

    public function show($id)
    {
        $sale = Sale::with('customer', 'items.product', 'payments')->findOrFail($id);

        return response()->json($sale);
    }
}
