<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Purchase;
use App\Models\Supplier;
use App\Models\SupplierPayment;
use App\Services\DocumentNumberService;
use App\Services\InstallmentService;
use App\Services\PurchasePayableService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Pelunasan utang ke supplier.
 *
 * Tabel terpisah dari `payments` (piutang pelanggan) dengan sengaja: satu
 * tabel polymorphic berarti setiap pembacaan harus memeriksa apakah `customer_id`
 * atau `supplier_id` yang terisi, dan baris yang salah isi akan lolos semua
 * perhitungan tanpa error.
 */
class SupplierPaymentController extends Controller
{
    public function index(Request $request)
    {
        $query = SupplierPayment::with('supplier', 'purchase');

        if ($request->filled('date')) {
            $query->whereDate('date', $request->date);
        }
        if ($request->filled('start_date')) {
            $query->whereDate('date', '>=', $request->start_date);
        }
        if ($request->filled('end_date')) {
            $query->whereDate('date', '<=', $request->end_date);
        }
        if ($request->filled('supplier_id')) {
            $query->where('supplier_id', $request->supplier_id);
        }
        if ($request->filled('purchase_id')) {
            $query->where('purchase_id', $request->purchase_id);
        }

        return response()->json($query->latest()->paginate(15));
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'date' => 'required|date',
            'supplier_id' => 'required|exists:suppliers,id',
            'purchase_id' => 'required|exists:purchases,id',
            'amount' => 'required|numeric|min:0.01',
            'method' => 'required|in:cash,transfer,other',
            'note' => 'nullable|string',
        ]);

        $payment = DB::transaction(function () use ($validated, $request) {
            $purchase = Purchase::lockForUpdate()->find($validated['purchase_id']);

            if ($purchase->supplier_id != $validated['supplier_id']) {
                throw ValidationException::withMessages([
                    'purchase_id' => 'Transaksi pembelian ini bukan milik supplier yang dipilih.',
                ]);
            }

            // Overpay dicek terhadap `payable` yang sudah ada di baris, bukan
            // dihitung ulang di sini. Kalau dihitung ulang, ada jendela di
            // mana dua request bersamaan sama-sama lolos dan membayar lebih
            // dari sisa utang.
            $this->guardOverpay($validated['amount'], (float) $purchase->payable);

            $payment = SupplierPayment::create([
                'payment_number' => app(DocumentNumberService::class)->next('TB', $validated['date']),
                'date' => $validated['date'],
                'supplier_id' => $validated['supplier_id'],
                'purchase_id' => $validated['purchase_id'],
                'amount' => $validated['amount'],
                'method' => $validated['method'],
                'note' => $validated['note'] ?? null,
                'user_id' => $request->user()->id,
            ]);

            app(PurchasePayableService::class)->recalculate($purchase);

            // Kalau pembelian ini dicicilkan, alokasi angsuran ikut
            // dihitung ulang di transaksi yang sama.
            $installments = app(InstallmentService::class);
            $installments->recalculate($installments->planFor($purchase));

            return $payment;
        });

        return response()->json($payment->load('supplier', 'purchase'), 201);
    }

    public function show($id)
    {
        $payment = SupplierPayment::with('supplier', 'purchase')->findOrFail($id);

        return response()->json($payment);
    }

    public function update(Request $request, $id)
    {
        $payment = SupplierPayment::findOrFail($id);

        $validated = $request->validate([
            'date' => 'required|date',
            'supplier_id' => 'required|exists:suppliers,id',
            'purchase_id' => 'required|exists:purchases,id',
            'amount' => 'required|numeric|min:0.01',
            'method' => 'required|in:cash,transfer,other',
            'note' => 'nullable|string',
        ]);

        $updated = DB::transaction(function () use ($validated, $payment) {
            $oldPurchase = Purchase::lockForUpdate()->find($payment->purchase_id);
            $newPurchase = Purchase::lockForUpdate()->find($validated['purchase_id']);

            if ($newPurchase->supplier_id != $validated['supplier_id']) {
                throw ValidationException::withMessages([
                    'purchase_id' => 'Transaksi pembelian ini bukan milik supplier yang dipilih.',
                ]);
            }

            // Kalau pembayaran pindah ke transaksi lain, sisa utang transaksi
            // LAMA harus diperiksa juga - kalau tidak, pembayaran bisa
            // dipindah ke transaksi yang lebih besar dan transaksi lama
            // jadi lebih utang dari sebelumnya tanpa pernah dicek.
            if ($oldPurchase->id !== $newPurchase->id) {
                $this->guardOverpay(
                    $validated['amount'],
                    (float) $oldPurchase->payable + (float) $payment->amount,
                    'Jumlah pembayaran melebihi sisa utang transaksi asal.'
                );
            }

            $this->guardOverpay($validated['amount'], (float) $newPurchase->payable);

            $payment->update($validated);

            $service = app(PurchasePayableService::class);
            $service->recalculate($oldPurchase);

            if ($newPurchase->id !== $oldPurchase->id) {
                $service->recalculate($newPurchase);
            }

            // Sama seperti payable: alokasi angsuran kedua transaksi harus
            // dihitung ulang, karena pembayaran bisa pindah transaksi.
            $installments = app(InstallmentService::class);
            $installments->recalculate($installments->planFor($oldPurchase));

            if ($newPurchase->id !== $oldPurchase->id) {
                $installments->recalculate($installments->planFor($newPurchase));
            }

            return $payment;
        });

        return response()->json($updated->load('supplier', 'purchase'));
    }

    public function destroy($id)
    {
        $payment = SupplierPayment::findOrFail($id);

        DB::transaction(function () use ($payment) {
            $purchase = Purchase::lockForUpdate()->find($payment->purchase_id);
            $payment->delete();

            app(PurchasePayableService::class)->recalculate($purchase);

            $installments = app(InstallmentService::class);
            $installments->recalculate($installments->planFor($purchase));
        });

        return response()->json(['message' => 'Pembayaran dihapus.']);
    }

    /**
     * Tolak pembayaran yang melebihi sisa utang.
     *
     * Toleransi 0.005 karena sisa utang di database sudah dibulatkan dua
     * desimal; tanpa itu, membayar tepat sisa yang tercatat akan ditolak
     * karena perbandingan floating point.
     */
    private function guardOverpay(float $amount, float $remaining, ?string $message = null): void
    {
        if ($amount - $remaining > 0.005) {
            throw ValidationException::withMessages([
                'amount' => $message ?? 'Jumlah pembayaran melebihi sisa utang.',
            ]);
        }
    }
}
