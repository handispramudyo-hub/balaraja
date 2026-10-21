<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use Illuminate\Http\Request;

class SupplierController extends Controller
{
    public function index()
    {
        // `total_payable` diambil sebagai agregat di SQL, bukan dengan
        // memanggil `totalPayable()` per supplier. Yang kedua berarti N+1:
        // satu query per supplier untuk jumlah yang sebenarnya bisa dijawab
        // sekali.
        //
        // Filter `payment_status` di dalam subquery HARUS sama persis dengan
        // yang dipakai `Supplier::totalPayable()`, kalau tidak angka di API
        // dan angka di model bisa berbeda. `SupplierDebtTest` mengunci
        // keduanya agar tidak bisa menyimpang diam-diam.
        return response()->json(
            Supplier::withSum([
                'purchases as total_payable' => fn ($q) => $q->whereIn('payment_status', ['unpaid', 'partial']),
            ], 'payable')->get()
        );
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name'         => 'required|string|max:255',
            'contact_name' => 'nullable|string|max:255',
            'phone'        => 'nullable|string|max:255',
            'address'      => 'nullable|string',
            'note'         => 'nullable|string',
            'status'       => 'nullable|string|max:255',
        ]);

        $supplier = Supplier::create($validated);

        return response()->json($supplier, 201);
    }

    public function show($id)
    {
        $supplier = Supplier::findOrFail($id);

        return response()->json($supplier);
    }

    public function update(Request $request, $id)
    {
        $supplier = Supplier::findOrFail($id);

        $validated = $request->validate([
            'name'         => 'required|string|max:255',
            'contact_name' => 'nullable|string|max:255',
            'phone'        => 'nullable|string|max:255',
            'address'      => 'nullable|string',
            'note'         => 'nullable|string',
            'status'       => 'nullable|string|max:255',
        ]);

        $supplier->update($validated);

        return response()->json($supplier);
    }

    public function destroy($id)
    {
        $supplier = Supplier::findOrFail($id);

        // Sama seperti CustomerController::destroy(): cegah FK 1451 jadi 500.
        $reasons = [];
        if ($supplier->purchases()->exists()) {
            $reasons[] = $supplier->purchases()->count() . ' pembelian';
        }
        if ($supplier->supplierPayments()->exists()) {
            $reasons[] = $supplier->supplierPayments()->count() . ' pembayaran';
        }
        if ($reasons) {
            return response()->json([
                'message' => 'Supplier tidak bisa dihapus karena masih punya '
                    . implode(' dan ', $reasons)
                    . '. Hapus transaksinya dulu.',
            ], 409);
        }

        $supplier->delete();

        return response()->json(['message' => 'Supplier deleted']);
    }
}
