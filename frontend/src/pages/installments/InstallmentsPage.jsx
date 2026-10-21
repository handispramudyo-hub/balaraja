import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/format';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import { toast } from 'sonner';

const DIRECTIONS = [
  { value: '', label: 'Semua Arah' },
  { value: 'receivable', label: 'Piutang Pelanggan' },
  { value: 'payable', label: 'Utang Supplier' },
];

/**
 * Halaman daftar jadwal angsuran.
 *
 * Dua arah (piutang pelanggan + utang supplier) sengaja ditampilkan dalam
 * satu daftar, bukan dua halaman terpisah. Keduanya dibiayai aturan yang
 * identik - bagi rata, tanpa bunga, sisa pembulatan di angsuran terakhir -
 * jadi memisahkan hanya menambah tempat untuk mencari tanpa menambah
 * informasi apa pun.
 */
export default function InstallmentsPage() {
  const qc = useQueryClient();
  const [direction, setDirection] = useState('');
  const [onlyOutstanding, setOnlyOutstanding] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null);
  const [months, setMonths] = useState('');

  const params = new URLSearchParams({ per_page: '50' });
  if (direction) params.set('direction', direction);
  if (onlyOutstanding) params.set('has_outstanding', '1');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['installment-plans', direction, onlyOutstanding],
    queryFn: async () => {
      const res = await api.get(`/installment-plans?${params.toString()}`);
      return res.data;
    },
  });

  const tenorMutation = useMutation({
    mutationFn: async ({ id, value }) => {
      const res = await api.put(`/installment-plans/${id}`, { months: value });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['installment-plans'] });
      setEditing(null);
      setMonths('');
      toast.success('Jadwal angsuran diperbarui');
    },
    onError: (e) => {
      const first = e.response?.data?.errors
        ? Object.values(e.response.data.errors)[0][0]
        : e.response?.data?.message;
      toast.error(first || 'Gagal memperbarui jadwal');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/installment-plans/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['installment-plans'] });
      toast.success('Jadwal angsuran dihapus');
    },
    onError: () => toast.error('Gagal menghapus jadwal'),
  });

  const rows = data?.data || [];

  return (
    <div className="p-4 space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-on-surface">Jadwal Angsuran</h1>
        <p className="text-xs text-on-surface-variant mt-1">
          Cicilan tanpa bunga. Sisa pembulatan masuk ke angsuran terakhir.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          className="border border-outline-variant rounded-lg px-3 py-2 text-sm bg-surface text-on-surface"
        >
          {DIRECTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs text-on-surface-variant">
          <input
            type="checkbox"
            checked={onlyOutstanding}
            onChange={(e) => setOnlyOutstanding(e.target.checked)}
          />
          Belum lunas saja
        </label>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Belum ada jadwal angsuran"
          description="Buat penjualan atau pembelian dengan memilih 'Cicilan' untuk membuat jadwal."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((plan) => {
            const open = expanded === plan.id;
            const isPayable = plan.direction === 'payable';
            return (
              <div
                key={plan.id}
                className="bg-surface-container-lowest rounded-xl border border-surface-container shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : plan.id)}
                  className="w-full text-left p-4 space-y-2"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-on-surface text-sm">
                          {plan.counterparty_name || '-'}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            isPayable
                              ? 'bg-error-container text-on-error-container'
                              : 'bg-primary-container text-on-primary-container'
                          }`}
                        >
                          {isPayable ? 'Utang Supplier' : 'Piutang Pelanggan'}
                        </span>
                      </div>
                      <div className="text-xs text-on-surface-variant mt-0.5">
                        {plan.transaction_number} &middot; {formatDate(plan.transaction_date)}
                      </div>
                    </div>
                    <span className="text-xs text-on-surface-variant">{open ? 'Tutup' : 'Lihat'}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-on-surface-variant">Total</div>
                      <div className="font-semibold text-on-surface">
                        {formatCurrency(plan.total)}
                      </div>
                    </div>
                    <div>
                      <div className="text-on-surface-variant">Terbayar</div>
                      <div className="font-semibold text-on-surface">
                        {formatCurrency(plan.paid)}
                      </div>
                    </div>
                    <div>
                      <div className="text-on-surface-variant">Sisa</div>
                      <div className="font-semibold text-error">
                        {formatCurrency(plan.outstanding)}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-on-surface-variant">
                    {plan.progress.paid}/{plan.progress.total} angsuran
                    {plan.next_due_date && (
                      <>
                        {' '}
                        &middot; berikutnya{' '}
                        <span className={plan.overdue ? 'text-error font-medium' : ''}>
                          {formatDate(plan.next_due_date)}
                        </span>
                      </>
                    )}
                  </div>
                </button>

                {open && (
                  <div className="border-t border-surface-container p-4 space-y-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-on-surface-variant">
                          <th className="text-left py-1">#</th>
                          <th className="text-left py-1">Jatuh Tempo</th>
                          <th className="text-right py-1">Nominal</th>
                          <th className="text-right py-1">Dibayar</th>
                          <th className="text-right py-1">Sisa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.installments.map((row) => (
                          <tr
                            key={row.id}
                            className={row.overdue ? 'text-error' : 'text-on-surface'}
                          >
                            <td className="py-1">{row.seq}</td>
                            <td className="py-1">
                              {formatDate(row.due_date)}
                              {row.overdue && ' (lewat tempo)'}
                            </td>
                            <td className="py-1 text-right">{formatCurrency(row.amount)}</td>
                            <td className="py-1 text-right">{formatCurrency(row.paid_amount)}</td>
                            <td className="py-1 text-right">
                              {row.status === 'paid' ? 'Lunas' : formatCurrency(row.remaining)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(plan.id);
                          setMonths(String(plan.months));
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-outline-variant text-on-surface"
                      >
                        Ubah Tenor
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              'Hapus jadwal angsuran? Pembayaran yang sudah tercatat tidak ikut terhapus.',
                            )
                          ) {
                            deleteMutation.mutate(plan.id);
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-error-container text-error"
                      >
                        Hapus Jadwal
                      </button>
                    </div>

                    {editing === plan.id && (
                      <div className="flex flex-wrap items-end gap-2 pt-2">
                        <div>
                          <label className="block text-xs text-on-surface-variant mb-1">
                            Jumlah bulan (1-36)
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="36"
                            value={months}
                            onChange={(e) => setMonths(e.target.value)}
                            className="w-28 border border-outline-variant rounded-lg px-3 py-2 text-sm bg-surface text-on-surface"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={tenorMutation.isPending}
                          onClick={() =>
                            tenorMutation.mutate({ id: plan.id, value: Number(months) })
                          }
                          className="h-9 px-3 rounded-lg text-xs font-semibold bg-primary text-on-primary disabled:opacity-50"
                        >
                          Simpan
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          className="h-9 px-3 rounded-lg text-xs font-semibold border border-outline-variant text-on-surface"
                        >
                          Batal
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
