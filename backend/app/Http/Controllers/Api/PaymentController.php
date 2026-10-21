<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Payment;
use App\Models\Sale;
use App\Models\Customer;
use App\Services\DocumentNumberService;
use App\Services\InstallmentService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PaymentController extends Controller
{
    public function index(Request $request)
    {
        $query = Payment::with('customer', 'sale');

        // `date` (tunggal) tetap dipertahankan. Ditambahkan start_date/end_date
        // karena frontend mengirim keduanya: tanpa ini kedua filter tanggal di
        // halaman pembayaran tidak pernah memfilter apa pun - terlihat bekerja,
        // diam. Rentang dihitung dari kolom date, bukan created_at, supaya
        // payments yang di-backfill tetap ikut terfilter.
        if ($request->filled('date')) {
            $query->whereDate('date', $request->date);
        }
        if ($request->filled('start_date')) {
            $query->whereDate('date', '>=', $request->start_date);
        }
        if ($request->filled('end_date')) {
            $query->whereDate('date', '<=', $request->end_date);
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

            $paymentNumber = app(DocumentNumberService::class)->next('BY', $validated['date']);

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

            // Kalau penjualan ini dicicilkan, alokasi angsuran harus ikut
            // dihitung ulang. Ditaruh DI DALAM transaksi yang sama supaya
            // tidak ada jendela waktu di mana pembayaran sudah tercatat tapi
            // angsuran masih menampilkan nominal lama.
            $installments = app(InstallmentService::class);
            $plan = $installments->planFor($sale);
            if ($plan !== null) {
                $installments->recalculate($plan);
            }

            return $payment;
        });

        return response()->json($payment->load('customer', 'sale'), 201);
    }

    public function show($id)
    {
        $payment = Payment::with('customer', 'sale')->findOrFail($id);
        return response()->json($payment);
    }

    public function update(Request $request, $id)
    {
        $payment = Payment::findOrFail($id);

        $validated = $request->validate([
            'date' => 'required|date',
            'customer_id' => 'required|exists:customers,id',
            'sale_id' => 'required|exists:sales,id',
            'amount' => 'required|numeric|min:0.01',
            'method' => 'required|in:cash,transfer,other',
            'note' => 'nullable|string',
        ]);

        $newPayment = DB::transaction(function () use ($validated, $payment, $request) {
            // Disimpan SEBELUM `$payment->update()` di bawah, karena setelah
            // update `$payment->sale_id` sudah menunjuk sale yang baru. Plan
            // dari sale LAMA tetap harus dihitung ulang: pembayarannya
            // dipindah, jadi angsuran yang tadinya lunas di sale lama
            // sekarang harus terbuka lagi.
            $oldSaleId = $payment->sale_id;

            if ($payment->sale_id != $validated['sale_id']) {
                $oldSale = Sale::lockForUpdate()->find($payment->sale_id);
                if ($oldSale) {
                    $oldSale->update([
                        'payment' => $oldSale->payment - $payment->amount,
                        'receivable' => $oldSale->total - ($oldSale->payment - $payment->amount),
                    ]);
                    $oldReceivable = $oldSale->total - ($oldSale->payment - $payment->amount);
                    if ($oldReceivable <= 0) {
                        $oldSale->update(['payment_status' => 'paid', 'receivable' => 0]);
                    } elseif ($oldSale->payment - $payment->amount > 0) {
                        $oldSale->update(['payment_status' => 'partial']);
                    } else {
                        $oldSale->update(['payment_status' => 'unpaid']);
                    }
                }
            }

            $sale = Sale::lockForUpdate()->find($validated['sale_id']);

            if ($sale->customer_id != $validated['customer_id']) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'sale_id' => 'Penjualan ini bukan milik pelanggan yang dipilih.',
                ]);
            }

            $totalPaidForSale = Payment::where('sale_id', $sale->id)->where('id', '!=', $payment->id)->sum('amount');
            $newTotalPaid = $totalPaidForSale + $validated['amount'];

            if ($newTotalPaid > $sale->total) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'amount' => 'Jumlah pembayaran melebihi total transaksi.',
                ]);
            }

            $payment->update([
                'date' => $validated['date'],
                'customer_id' => $validated['customer_id'],
                'sale_id' => $validated['sale_id'],
                'amount' => $validated['amount'],
                'method' => $validated['method'],
                'note' => $validated['note'] ?? null,
            ]);

            $newReceivable = $sale->total - $newTotalPaid;

            if ($newReceivable <= 0) {
                $paymentStatus = 'paid';
                $newReceivable = 0;
            } elseif ($newTotalPaid > 0) {
                $paymentStatus = 'partial';
            } else {
                $paymentStatus = 'unpaid';
            }

            $sale->update([
                'payment' => $newTotalPaid,
                'receivable' => $newReceivable,
                'payment_status' => $paymentStatus,
            ]);

            $customer = Customer::lockForUpdate()->find($validated['customer_id']);
            $totalReceivable = Sale::where('customer_id', $validated['customer_id'])
                ->whereIn('payment_status', ['unpaid', 'partial'])
                ->sum('receivable');
            $customer->update(['total_receivable' => $totalReceivable]);

            // Kedua sisi dihitung ulang: sale tujuan (menerima pembayaran)
            // dan sale asal (melepaskannya). Kalau sale asal == tujuan,
            // `recalculate` kedua jalan idempoten dan tidak merusak apa pun.
            $installments = app(InstallmentService::class);

            $installments->recalculate($installments->planFor($sale));

            if ($oldSaleId != $validated['sale_id']) {
                $oldSale = Sale::find($oldSaleId);
                if ($oldSale !== null) {
                    $installments->recalculate($installments->planFor($oldSale));
                }
            }

            return $payment;
        });

        return response()->json($newPayment->load('customer', 'sale'));
    }

    public function destroy($id)
    {
        $payment = Payment::findOrFail($id);

        DB::transaction(function () use ($payment) {
            $sale = Sale::lockForUpdate()->find($payment->sale_id);

            if ($sale) {
                $newPayment = $sale->payment - $payment->amount;
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

                $customer = Customer::lockForUpdate()->find($sale->customer_id);
                if ($customer) {
                    $totalReceivable = Sale::where('customer_id', $sale->customer_id)
                        ->whereIn('payment_status', ['unpaid', 'partial'])
                        ->sum('receivable');
                    $customer->update(['total_receivable' => $totalReceivable]);
                }
            }

            $payment->delete();

            // WAJIB setelah delete, bukan sebelum: kalau dihitung lebih dulu,
            // `recalculate` masih membaca pembayaran yang sebentar lagi
            // dihapus, jadi angsuran yang tadinya lunas tetap tampil lunas.
            app(InstallmentService::class)->recalculate(
                app(InstallmentService::class)->planFor($sale)
            );
        });

        return response()->json(['message' => 'Pembayaran berhasil dihapus']);
    }
}
