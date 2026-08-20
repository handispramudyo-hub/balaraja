<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    public function index()
    {
        return response()->json(Customer::all());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'code'         => 'nullable|string|max:255|unique:customers,code',
            'name'         => 'required|string|max:255',
            'owner_name'   => 'nullable|string|max:255',
            'phone'        => 'nullable|string|max:255',
            'address'      => 'nullable|string',
            'credit_limit' => 'nullable|numeric|min:0',
            'note'         => 'nullable|string',
            'status'       => 'nullable|string|max:255',
        ]);

        if (empty($validated['code'])) {
            $last = Customer::orderBy('id', 'desc')->first();
            $next = 1;
            if ($last && $last->code) {
                $next = intval(substr($last->code, 1)) + 1;
            }
            $validated['code'] = 'C' . str_pad($next, 3, '0', STR_PAD_LEFT);
        }

        $customer = Customer::create($validated);

        return response()->json($customer, 201);
    }

    public function show($id)
    {
        $customer = Customer::findOrFail($id);

        $totalPurchases   = $customer->purchases()->sum('total') ?? 0;
        $totalPayments    = $customer->payments()->sum('amount') ?? 0;
        $totalReceivables = $totalPurchases - $totalPayments;

        return response()->json([
            'customer'        => $customer,
            'total_purchases' => $totalPurchases,
            'total_payments'  => $totalPayments,
            'receivables'     => $totalReceivables,
        ]);
    }

    public function update(Request $request, $id)
    {
        $customer = Customer::findOrFail($id);

        $validated = $request->validate([
            'code'         => 'nullable|string|max:255|unique:customers,code,' . $id,
            'name'         => 'required|string|max:255',
            'owner_name'   => 'nullable|string|max:255',
            'phone'        => 'nullable|string|max:255',
            'address'      => 'nullable|string',
            'credit_limit' => 'nullable|numeric|min:0',
            'note'         => 'nullable|string',
            'status'       => 'nullable|string|max:255',
        ]);

        $customer->update($validated);

        return response()->json($customer);
    }

    public function destroy($id)
    {
        $customer = Customer::findOrFail($id);
        $customer->delete();

        return response()->json(['message' => 'Customer deleted']);
    }
}
