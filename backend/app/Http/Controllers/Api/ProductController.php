<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    public function index(Request $request)
    {
        $query = Product::with(['category', 'supplier']);

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('code', 'like', "%{$search}%");
            });
        }

        return response()->json($query->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'code'         => 'nullable|string|max:255|unique:products,code',
            'name'         => 'required|string|max:255',
            'category_id'  => 'required|exists:categories,id',
            'unit'         => 'nullable|string|max:255',
            'buy_price'    => 'nullable|numeric|min:0',
            'sell_price'   => 'nullable|numeric|min:0',
            'stock'        => 'nullable|integer|min:0',
            'min_stock'    => 'nullable|integer|min:0',
            'supplier_id'  => 'nullable|exists:suppliers,id',
            'status'       => 'nullable|string|max:255',
        ]);

        if (empty($validated['code'])) {
            $last = Product::orderBy('id', 'desc')->first();
            $next = 1;
            if ($last && $last->code) {
                $next = intval(substr($last->code, 1)) + 1;
            }
            $validated['code'] = 'P' . str_pad($next, 3, '0', STR_PAD_LEFT);
        }

        $product = Product::create($validated);

        return response()->json($product, 201);
    }

    public function show($id)
    {
        $product = Product::with(['category', 'supplier'])->findOrFail($id);

        $data = $product->toArray();
        $data['stock_status'] = $this->getStockStatus($product);

        return response()->json($data);
    }

    public function update(Request $request, $id)
    {
        $product = Product::findOrFail($id);

        $validated = $request->validate([
            'code'         => 'nullable|string|max:255|unique:products,code,' . $id,
            'name'         => 'required|string|max:255',
            'category_id'  => 'required|exists:categories,id',
            'unit'         => 'nullable|string|max:255',
            'buy_price'    => 'nullable|numeric|min:0',
            'sell_price'   => 'nullable|numeric|min:0',
            'stock'        => 'nullable|integer|min:0',
            'min_stock'    => 'nullable|integer|min:0',
            'supplier_id'  => 'nullable|exists:suppliers,id',
            'status'       => 'nullable|string|max:255',
        ]);

        $product->update($validated);

        return response()->json($product);
    }

    public function destroy($id)
    {
        $product = Product::findOrFail($id);
        $product->delete();

        return response()->json(['message' => 'Product deleted']);
    }

    protected function getStockStatus(Product $product): string
    {
        if ($product->stock == 0) {
            return 'habis';
        }

        if ($product->stock <= $product->min_stock) {
            return 'menipis';
        }

        return 'aman';
    }
}
