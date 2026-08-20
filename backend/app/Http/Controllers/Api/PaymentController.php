<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Payment;
use App\Models\Sale;
use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PaymentController extends Controller
{
    public function index(Request $request)
    {
        $query = Payment::with('customer', 'sale');

        if ($request->filled('date')) {
            $query->whereDate('date', $request->date);
        }
        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }

        $payments = $query->latest()->paginate(15);

        return response()->json($payments);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'date' => 'required|date',
            'customer_id' => 'required|exists:customers,id',
            'sale_id' => 'required|exists:sales,id',
            'amount' => 'required|numeric|min:0.01',
            'method' => 'required|in:cash,transfer,other',
            'note' => 'nullable|string',
        ]);

        $payment = DB::transaction(function () use ($validated, $request) {
            $sale = Sale::lockForUpdate()->find($validated['sale_id']);

            if ($sale->customer_id != $validated['customer_id']) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'sale_id' => 'Penjualan ini bukan milik pelanggan yang dipilih.',
                ]);
            }

            if ($validated['amount'] > $sale->receivable) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'amount' => 'Jumlah pembayaran melebihi sisa piutang.',
                ]);
            }

            $lastPayment = Payment::whereDate('date', $validated['date'])
                ->orderBy('id', 'desc')
                ->first();

            if ($lastPayment) {
                $lastNumber = (int) substr($lastPayment->payment_number, -3);
                $newNumber = $lastNumber + 1;
            } else {
                $newNumber = 1;
            }

            $paymentNumber = 'BY-' . date('Ymd', strtotime($validated['date'])) . '-' . str_pad($newNumber, 3, '0', STR_PAD_LEFT);

            $payment = Payment::create([
                'payment_number' => $paymentNumber,
                'date' => $validated['date'],
                'customer_id' => $validated['customer_id'],
                'sale_id' => $validated['sale_id'],
                'amount' => $validated['amount'],
                'method' => $validated['method'],
                'note' => $validated['note'] ?? null,
                'user_id' => $request->user()->id,
            ]);

            $newPayment = $sale->payment + $validated['amount'];
            $newReceivable = $sale->total - $newPayment;

            if ($newReceivable <= 0) {
                $paymentStatus = 'paid';
                $newReceivable = 0;
            } elseif ($newPayment > 0) {
                $paymentStatus = 'partial';
            } else {
                $paymentStatus = 'unpaid';
            }

            $sale->update([
                'payment' => $newPayment,
                'receivable' => $newReceivable,
                'payment_status' => $paymentStatus,
            ]);

            $customer = Customer::lockForUpdate()->find($validated['customer_id']);
            $totalReceivable = Sale::where('customer_id', $validated['customer_id'])
                ->whereIn('payment_status', ['unpaid', 'partial'])
                ->sum('receivable');
            $customer->update(['total_receivable' => $totalReceivable]);

            return $payment;
        });

        return response()->json($payment->load('customer', 'sale'), 201);
    }
}
