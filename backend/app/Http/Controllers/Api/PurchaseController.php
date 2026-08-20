<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Purchase;
use App\Models\Product;
use App\Models\StockMovement;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PurchaseController extends Controller
{
    public function index(Request $request)
    {
        $query = Purchase::with('supplier');

        if ($request->filled('date_from')) {
            $query->where('date', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $query->where('date', '<=', $request->date_to);
        }
        if ($request->filled('supplier_id')) {
            $query->where('supplier_id', $request->supplier_id);
        }

        $purchases = $query->latest()->paginate(15);

        return response()->json($purchases);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'date' => 'required|date',
            'supplier_id' => 'required|exists:suppliers,id',
            'note' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|exists:products,id',
            'items.*.quantity' => 'required|integer|min:1',
            'items.*.buy_price' => 'required|numeric|min:0',
        ]);

        $purchase = DB::transaction(function () use ($validated, $request) {
            $lastPurchase = Purchase::whereDate('date', $validated['date'])
                ->orderBy('id', 'desc')
                ->first();

            if ($lastPurchase) {
                $lastNumber = (int) substr($lastPurchase->purchase_number, -3);
                $newNumber = $lastNumber + 1;
            } else {
                $newNumber = 1;
            }

            $purchaseNumber = 'PB-' . date('Ymd', strtotime($validated['date'])) . '-' . str_pad($newNumber, 3, '0', STR_PAD_LEFT);

            $total = 0;
            $itemsData = [];

            foreach ($validated['items'] as $item) {
                $subtotal = $item['quantity'] * $item['buy_price'];
                $total += $subtotal;

                $itemsData[] = [
                    'product_id' => $item['product_id'],
                    'quantity' => $item['quantity'],
                    'buy_price' => $item['buy_price'],
                    'subtotal' => $subtotal,
                ];
            }

            $purchase = Purchase::create([
                'purchase_number' => $purchaseNumber,
                'date' => $validated['date'],
                'supplier_id' => $validated['supplier_id'],
                'total' => $total,
                'note' => $validated['note'] ?? null,
                'user_id' => $request->user()->id,
            ]);

            $purchase->items()->createMany($itemsData);

            foreach ($validated['items'] as $item) {
                $product = Product::lockForUpdate()->find($item['product_id']);
                $stockBefore = $product->stock;
                $product->increment('stock', $item['quantity']);

                StockMovement::create([
                    'product_id' => $item['product_id'],
                    'type' => 'purchase',
                    'quantity' => $item['quantity'],
                    'stock_before' => $stockBefore,
                    'stock_after' => $stockBefore + $item['quantity'],
                    'reference_type' => 'App\\Models\\Purchase',
                    'reference_id' => $purchase->id,
                    'date' => $validated['date'],
                    'user_id' => $request->user()->id,
                ]);
            }

            return $purchase;
        });

        return response()->json($purchase->load('supplier', 'items.product'), 201);
    }

    public function show($id)
    {
        $purchase = Purchase::with('supplier', 'items.product')->findOrFail($id);

        return response()->json($purchase);
    }
}
