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

        $totalReceivable = Customer::where('id', $id)
            ->whereHas('sales', function ($q) {
                $q->whereIn('payment_status', ['unpaid', 'partial']);
            })
            ->get()
            ->sum(fn ($c) => $c->sales->whereIn('payment_status', ['unpaid', 'partial'])->sum('receivable'));

        return response()->json([
            'customer'         => $customer,
            'total_receivable' => $totalReceivable,
            'sale_count'       => $customer->sales()->count(),
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

        // MySQL menolak delete ini lewat FK 1451 ketika customer masih terpakai.
        // Tanpa cek di sini, user melihat error 500 mentah tanpa penjelasan
        // (log produksi 2026-10-21 penuh dengan QueryException itu).
        $reasons = [];
        if ($customer->sales()->exists()) {
            $reasons[] = $customer->sales()->count() . ' penjualan';
        }
        if ($customer->payments()->exists()) {
            $reasons[] = $customer->payments()->count() . ' pembayaran';
        }
        if ($reasons) {
            return response()->json([
                'message' => 'Pelanggan tidak bisa dihapus karena masih punya '
                    . implode(' dan ', $reasons)
                    . '. Hapus transaksinya dulu.',
            ], 409);
        }

        $customer->delete();

        return response()->json(['message' => 'Customer deleted']);
    }
}
