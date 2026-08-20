<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Expense;
use Illuminate\Http\Request;

class ExpenseController extends Controller
{
    public function index(Request $request)
    {
        $query = Expense::query();

        if ($request->filled('date_from')) {
            $query->where('date', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $query->where('date', '<=', $request->date_to);
        }
        if ($request->filled('category')) {
            $query->where('category', $request->category);
        }

        $expenses = $query->latest()->paginate(15);

        return response()->json($expenses);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'date' => 'required|date',
            'category' => 'required|in:transportasi,ongkos_kirim,operasional',
            'amount' => 'required|numeric|min:0.01',
            'description' => 'required|string',
            'related_transaction' => 'nullable|string',
        ]);

        $expense = Expense::create([
            ...$validated,
            'user_id' => $request->user()->id,
        ]);

        return response()->json($expense, 201);
    }

    public function update(Request $request, $id)
    {
        $expense = Expense::findOrFail($id);

        $validated = $request->validate([
            'date' => 'required|date',
            'category' => 'required|in:transportasi,ongkos_kirim,operasional',
            'amount' => 'required|numeric|min:0.01',
            'description' => 'required|string',
            'related_transaction' => 'nullable|string',
        ]);

        $expense->update($validated);

        return response()->json($expense);
    }

    public function destroy($id)
    {
        $expense = Expense::findOrFail($id);
        $expense->delete();

        return response()->json(['message' => 'Expense deleted']);
    }
}
