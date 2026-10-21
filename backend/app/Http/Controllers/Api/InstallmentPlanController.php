<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Installment;
use App\Models\InstallmentPlan;
use App\Services\InstallmentService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Plan dibuat BERSAMA transaksi induknya (lewat parameter `installment_months`
 * di SaleController/PurchaseController), bukan lewat endpoint terpisah.
 *
 * Endpoint di sini sengaja tidak punya `store`. Alasannya: satu transaksi =
 * satu plan, dan plan itu tidak bisa berdiri sendiri - kalau dibuat duluan,
 * ada transaksi yang ada plan-nya tanpa ada transaksinya, atau plan yang
 * menunjuk penjualan yang belum dibuat. Satu-satunya jalan untuk membuatnya
 * adalah menyertakannya saat transaksi dibuat, di dalam satu transaksi
 * database yang sama.
 */
class InstallmentPlanController extends Controller
{
    public function __construct(private readonly InstallmentService $installments)
    {
    }

    public function index(Request $request)
    {
        $query = InstallmentPlan::query()
            ->with(['sale.customer', 'purchase.supplier', 'installments']);

        if ($request->filled('direction')) {
            $query->where('direction', $request->query('direction'));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }

        // Filter "masih ada yang belum dibayar" dipakai layar pengingat
        // jatuh tempo. Tanpa ini, daftar akan didominasi plan yang sudah
        // selesai jauh-jauh hari.
        if ($request->boolean('has_outstanding')) {
            $query->where('status', 'active');
        }

        $perPage = (int) $request->query('per_page', 15);
        $plans = $query->latest()->paginate(max(1, min(200, $perPage)));

        $plans->getCollection()->transform(fn (InstallmentPlan $plan) => $this->present($plan));

        return response()->json($plans);
    }

    public function show($id)
    {
        $plan = InstallmentPlan::with(['sale.customer', 'purchase.supplier', 'installments'])
            ->findOrFail($id);

        return response()->json($this->present($plan));
    }

    /**
     * Ubah tenor. Jadwal dihitung ulang dari total transaksi yang saat ini,
     * dan riwayat pembayaran tidak hilang - `changeTenor` memutar ulang
     * alokasi setelah jadwal baru ditulis.
     */
    public function update(Request $request, $id)
    {
        $plan = InstallmentPlan::findOrFail($id);

        $validated = $request->validate([
            'months' => 'required|integer|min:1|max:'.InstallmentService::MAX_MONTHS,
        ]);

        $updated = DB::transaction(function () use ($plan, $validated) {
            $locked = InstallmentPlan::whereKey($plan->getKey())->lockForUpdate()->firstOrFail();

            return $this->installments->changeTenor($locked, (int) $validated['months']);
        });

        return response()->json($this->present($updated));
    }

    /**
     * Hapus plan. Angsuran yang sudah dibayar TIDAK dikembalikan ke
     * pelanggan/supplier - uang yang sudah masuk tetap tercatat sebagai
     * pembayaran di `payments`/`supplier_payments`, dan hanya jadwal yang
     * dibuang. Karena itu setelah plan dihapus, transaksi induknya tetap
     * dilaporkan sebagai "sisa = total - pembayaran", persis seperti sebelum
     * plannya ada. Itu perilaku yang benar: menghapus rencana bukan
     * membatalkan pembayaran.
     */
    public function destroy($id)
    {
        $plan = InstallmentPlan::findOrFail($id);

        DB::transaction(function () use ($plan) {
            $plan->installments()->delete();
            $plan->delete();
        });

        return response()->json(['message' => 'Jadwal cicilan dihapus.']);
    }

    /**
     * Bentuk jawaban API.
     *
     * `outstanding` sengaja ikut dikirim di setiap plan (bukan cuma di
     * detail) karena daftar di layar selalu menampilkan "sisa angsuran"
     * di kolom paling kanan; menghitungnya per baris di frontend berarti
     * N+1 ke endpoint lain.
     */
    private function present(InstallmentPlan $plan): array
    {
        $plan->loadMissing(['sale.customer', 'purchase.supplier', 'installments']);

        $transaction = $plan->transaction();
        $counterparty = $plan->direction === 'payable'
            ? $plan->purchase?->supplier
            : $plan->sale?->customer;

        $today = now()->toDateString();
        $nextDue = $plan->installments
            ->where('status', 'pending')
            ->sortBy('due_date')
            ->first();

        return [
            'id' => $plan->id,
            'direction' => $plan->direction,
            'status' => $plan->status,
            'months' => (int) $plan->months,
            'transaction_number' => $transaction?->sale_number ?? $transaction?->purchase_number,
            'transaction_date' => $transaction?->date?->toDateString(),
            'total' => $transaction ? round((float) $transaction->total, 2) : 0,
            'paid' => $this->installments->paidFor($plan),
            'outstanding' => $plan->outstanding(),
            'counterparty_name' => $counterparty?->name,
            'next_due_date' => $nextDue?->due_date?->toDateString(),
            'overdue' => $nextDue !== null && $nextDue->due_date->toDateString() < $today,
            'progress' => $plan->progress(),
            'installments' => $plan->installments->map(fn (Installment $row) => [
                'id' => $row->id,
                'seq' => (int) $row->seq,
                'due_date' => $row->due_date->toDateString(),
                'amount' => (float) $row->amount,
                'paid_amount' => (float) $row->paid_amount,
                'remaining' => $row->remaining(),
                'status' => $row->status,
                'overdue' => $row->status === 'pending'
                    && $row->due_date->toDateString() < $today,
            ])->values(),
        ];
    }
}
