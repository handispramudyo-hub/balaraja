import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import DataTable from '../../components/ui/DataTable';
import Sheet from '../../components/ui/Sheet';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Select from '../../components/ui/Select';
import Input from '../../components/ui/Input';
import FormField from '../../components/ui/FormField';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import Badge from '../../components/ui/Badge';
import Money from '../../components/ui/Money';
import { EmptyState } from '../../components/ui/States';
import { formatDateShort, daysUntil } from '../../lib/format';

const DIRECTIONS = [
  { value: 'receivable', label: 'Piutang Pelanggan', icon: 'account_balance_wallet', tone: 'primary' },
  { value: 'payable', label: 'Utang Supplier', icon: 'price_change', tone: 'warning' },
];

const MAX_MONTHS = 36;

function directionMeta(direction) {
  return DIRECTIONS.find((item) => item.value === direction) ?? {
    label: direction || '-',
    icon: 'calendar_month',
    tone: 'neutral',
  };
}

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
  const queryClient = useQueryClient();
  const [direction, setDirection] = useState('');
  const [onlyOutstanding, setOnlyOutstanding] = useState(true);
  const [detail, setDetail] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [tenorTarget, setTenorTarget] = useState(null);
  const [months, setMonths] = useState('');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['installment-plans', direction, onlyOutstanding],
    queryFn: async () => {
      const params = { per_page: 200 };
      if (direction) params.direction = direction;
      if (onlyOutstanding) params.has_outstanding = 1;
      const res = await api.get('/installment-plans', { params });
      return res.data;
    },
  });

  const tenorMutation = useMutation({
    mutationFn: async ({ id, value }) => {
      const res = await api.put(`/installment-plans/${id}`, { months: value });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Jadwal angsuran diperbarui');
      setTenorTarget(null);
      setMonths('');
      queryClient.invalidateQueries({ queryKey: ['installment-plans'] });
    },
    onError: (err) => {
      const fields = err.response?.data?.errors;
      const firstError = fields ? Object.values(fields).flat()[0] : null;
      toast.error(firstError || err.response?.data?.message || 'Gagal memperbarui jadwal');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => api.delete(`/installment-plans/${id}`),
    onSuccess: () => {
      toast.success('Jadwal angsuran dihapus');
      setDeleteTarget(null);
      setDetail(null);
      queryClient.invalidateQueries({ queryKey: ['installment-plans'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Gagal menghapus jadwal');
      setDeleteTarget(null);
    },
  });

  const plans = useMemo(() => data?.data || data || [], [data]);

  const summary = useMemo(() => {
    const total = plans.reduce((sum, plan) => sum + Number(plan.total ?? 0), 0);
    const outstanding = plans.reduce((sum, plan) => sum + Number(plan.outstanding ?? 0), 0);
    const overdue = plans.filter((plan) => plan.overdue).length;
    return { total, outstanding, overdue, count: plans.length };
  }, [plans]);

  const columns = [
    {
      key: 'counterparty_name',
      header: 'Pihak',
      sortable: true,
      render: (plan) => (
        <div className="min-w-0">
          <p className="font-medium text-on-surface truncate">
            {plan.counterparty_name || '-'}
          </p>
          <p className="text-2xs text-on-surface-variant truncate">
            {plan.transaction_number || '-'} · {formatDateShort(plan.transaction_date)}
          </p>
        </div>
      ),
    },
    {
      key: 'direction',
      header: 'Arah',
      sortable: true,
      render: (plan) => {
        const meta = directionMeta(plan.direction);
        return (
          <Badge tone={meta.tone} size="sm" icon={meta.icon}>
            {meta.label}
          </Badge>
        );
      },
    },
    {
      key: 'months',
      header: 'Tenor',
      align: 'right',
      sortable: true,
      render: (plan) => (
        <span className="text-on-surface-variant tabular-nums">{plan.months} bulan</span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      sortable: true,
      render: (plan) => <Money value={plan.total} variant="strong" />,
    },
    {
      key: 'paid',
      header: 'Terbayar',
      align: 'right',
      sortable: true,
      render: (plan) => <Money value={plan.paid} variant="muted" />,
    },
    {
      key: 'outstanding',
      header: 'Sisa',
      align: 'right',
      sortable: true,
      render: (plan) => (
        <Money value={plan.outstanding} variant={Number(plan.outstanding) > 0 ? 'danger' : 'default'} />
      ),
    },
    {
      key: 'progress',
      header: 'Progres',
      render: (plan) => {
        const paid = plan.progress?.paid ?? 0;
        const total = plan.progress?.total ?? plan.months ?? 0;
        const percent = total > 0 ? Math.round((paid / total) * 100) : 0;
        return (
          <div className="min-w-[110px]">
            <div className="flex items-center justify-between text-2xs text-on-surface-variant">
              <span className="tabular-nums">{paid}/{total} angsuran</span>
              <span className="tabular-nums">{percent}%</span>
            </div>
            <div className="h-1.5 mt-1 rounded-full bg-surface-container-high overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'next_due_date',
      header: 'Jatuh Tempo',
      sortable: true,
      render: (plan) => {
        if (!plan.next_due_date) {
          return <span className="text-on-surface-variant text-xs">-</span>;
        }
        const remaining = daysUntil(plan.next_due_date);
        return (
          <div className="min-w-0">
            <p className="text-on-surface whitespace-nowrap">{formatDateShort(plan.next_due_date)}</p>
            {plan.overdue ? (
              <p className="text-2xs text-danger font-medium">Lewat tempo</p>
            ) : remaining !== null && remaining <= 7 ? (
              <p className="text-2xs text-on-surface-variant">{remaining} hari lagi</p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'aksi',
      header: 'Aksi',
      align: 'right',
      render: (plan) => (
        <div className="flex items-center justify-end gap-0.5">
          <IconButton
            icon="visibility"
            label={`Lihat jadwal ${plan.counterparty_name ?? ''}`}
            size="sm"
            tone="primary"
            onClick={() => setDetail(plan)}
          />
          <IconButton
            icon="edit"
            label={`Ubah tenor ${plan.counterparty_name ?? ''}`}
            size="sm"
            tone="primary"
            onClick={() => {
              setTenorTarget(plan);
              setMonths(String(plan.months));
            }}
          />
          <IconButton
            icon="delete"
            label={`Hapus jadwal ${plan.counterparty_name ?? ''}`}
            size="sm"
            tone="danger"
            onClick={() => setDeleteTarget(plan)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Jadwal Angsuran"
        subtitle="Cicilan tanpa bunga. Sisa pembulatan masuk ke angsuran terakhir."
        breadcrumbs={[{ label: 'Transaksi', to: '/penjualan' }, { label: 'Jadwal Angsuran' }]}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={direction}
          onChange={(event) => setDirection(event.target.value)}
          aria-label="Filter arah angsuran"
          className="max-w-[220px]"
        >
          <option value="">Semua arah</option>
          {DIRECTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>

        <label className="inline-flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyOutstanding}
            onChange={(event) => setOnlyOutstanding(event.target.checked)}
            className="h-4 w-4 rounded border-outline-variant accent-primary cursor-pointer"
          />
          Belum lunas saja
        </label>
      </div>

      {summary.count > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest px-3.5 py-3">
            <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Total Tercicil</p>
            <Money value={summary.total} variant="strong" className="text-base mt-1 block" />
          </div>
          <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest px-3.5 py-3">
            <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Sisa Tagihan</p>
            <Money value={summary.outstanding} variant="danger" className="text-base mt-1 block" />
          </div>
          <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest px-3.5 py-3">
            <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Jadwal Aktif</p>
            <p className="text-base font-semibold text-on-surface mt-1">{summary.count}</p>
          </div>
          <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest px-3.5 py-3">
            <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Lewat Tempo</p>
            <p
              className={`text-base font-semibold mt-1 ${summary.overdue > 0 ? 'text-danger' : 'text-on-surface'}`}
            >
              {summary.overdue}
            </p>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={plans}
        rowKey={(row) => row.id}
        loading={isLoading}
        minWidth="1000px"
        onRowClick={(row) => setDetail(row)}
        emptyState={
          isError ? (
            <div role="alert" className="py-6 text-center">
              <p className="text-sm font-medium text-danger">Gagal memuat jadwal angsuran</p>
              <p className="text-xs text-on-surface-variant mt-1">
                {error?.response?.status
                  ? `Server merespons dengan kesalahan (${error.response.status}).`
                  : 'Periksa koneksi internet Anda lalu coba lagi.'}
              </p>
              <Button size="sm" variant="outline" icon="refresh" className="mt-3" onClick={() => refetch()}>
                Coba Laki
              </Button>
            </div>
          ) : (
            <EmptyState
              icon="calendar_month"
              title="Belum ada jadwal angsuran"
              description="Buat penjualan atau pembelian dengan memilih 'Cicilan' untuk membuat jadwal."
            />
          )
        }
        cardTitle={(plan) => plan.counterparty_name || plan.transaction_number || '-'}
        cardMeta={(plan) =>
          `${directionMeta(plan.direction).label} · ${plan.transaction_number || '-'} · ${plan.months} bulan`
        }
        cardBadge={(plan) => (
          <Money value={plan.outstanding} variant={Number(plan.outstanding) > 0 ? 'danger' : 'muted'} />
        )}
        cardFields={[
          { label: 'Total', render: (plan) => <Money value={plan.total} variant="strong" /> },
          { label: 'Terbayar', render: (plan) => <Money value={plan.paid} variant="muted" /> },
          {
            label: 'Jatuh Tempo',
            render: (plan) => (plan.next_due_date ? formatDateShort(plan.next_due_date) : '-'),
          },
          {
            label: 'Progres',
            render: (plan) => `${plan.progress?.paid ?? 0}/${plan.progress?.total ?? plan.months}`,
          },
        ]}
        cardActions={(plan) => (
          <>
            <button
              type="button"
              onClick={() => setDetail(plan)}
              className="flex-1 py-3 text-xs font-medium text-primary hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                visibility
              </span>
              Detail
            </button>
            <button
              type="button"
              onClick={() => {
                setTenorTarget(plan);
                setMonths(String(plan.months));
              }}
              className="flex-1 py-3 text-xs font-medium text-primary hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                edit
              </span>
              Tenor
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(plan)}
              className="flex-1 py-3 text-xs font-medium text-danger hover:bg-danger-container transition-colors flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                delete
              </span>
              Hapus
            </button>
          </>
        )}
      />

      {/* Detail jadwal angsuran */}
      <Sheet
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="Detail Angsuran"
        description={detail?.transaction_number || ''}
        icon="calendar_month"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              icon="edit"
              onClick={() => {
                setTenorTarget(detail);
                setMonths(String(detail?.months ?? ''));
              }}
            >
              Ubah Tenor
            </Button>
            <Button
              size="sm"
              icon="delete"
              variant="danger"
              onClick={() => setDeleteTarget(detail)}
            >
              Hapus
            </Button>
          </>
        }
      >
        {detail && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-field bg-surface-container px-3 py-2.5">
                <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Pihak</p>
                <p className="text-sm font-medium text-on-surface mt-0.5 truncate">
                  {detail.counterparty_name || '-'}
                </p>
              </div>
              <div className="rounded-field bg-surface-container px-3 py-2.5">
                <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Arah</p>
                <div className="mt-1">
                  <Badge tone={directionMeta(detail.direction).tone} size="sm" icon={directionMeta(detail.direction).icon}>
                    {directionMeta(detail.direction).label}
                  </Badge>
                </div>
              </div>
              <div className="rounded-field bg-surface-container px-3 py-2.5">
                <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Total</p>
                <Money value={detail.total} variant="strong" className="text-sm mt-0.5 block" />
              </div>
              <div className="rounded-field bg-surface-container px-3 py-2.5">
                <p className="text-2xs uppercase tracking-wide text-on-surface-variant">Sisa</p>
                <Money
                  value={detail.outstanding}
                  variant={Number(detail.outstanding) > 0 ? 'danger' : 'default'}
                  className="text-sm mt-0.5 block"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-on-surface">Rincian Angsuran</h3>
                <span className="text-2xs text-on-surface-variant tabular-nums">
                  {detail.progress?.paid ?? 0}/{detail.progress?.total ?? detail.months} terbayar
                </span>
              </div>
              <ul className="divide-y divide-outline-variant/50 rounded-field border border-outline-variant/70 overflow-hidden">
                {(detail.installments || []).map((row) => (
                  <li
                    key={row.id}
                    className={`flex items-center justify-between gap-3 px-3 py-2.5 ${row.overdue ? 'bg-danger-container/40' : ''}`}
                  >
                    <div className="min-w-0">
                      <p className={`text-sm ${row.overdue ? 'text-danger font-medium' : 'text-on-surface'}`}>
                        #{row.seq} · {formatDateShort(row.due_date)}
                      </p>
                      {row.overdue && (
                        <p className="text-2xs text-danger">Lewat tempo</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <Money value={row.amount} variant="strong" className="text-sm block" />
                      <p className="text-2xs text-on-surface-variant">
                        {row.status === 'paid'
                          ? 'Lunas'
                          : `Sisa ${Number(row.remaining ?? 0).toLocaleString('id-ID')}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Sheet>

      {tenorTarget && (
        <Modal
          onClose={() => setTenorTarget(null)}
          title="Ubah Tenor"
          subtitle={`${tenorTarget.counterparty_name || '-'} · ${tenorTarget.transaction_number || ''}`}
          variant="center"
          panelClassName="sm:max-w-sm"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setTenorTarget(null)}>
                Batal
              </Button>
              <Button
                size="sm"
                loading={tenorMutation.isPending}
                onClick={() => {
                  const value = Number(months);
                  if (!value || value < 1 || value > MAX_MONTHS) {
                    toast.error(`Jumlah bulan harus antara 1 dan ${MAX_MONTHS}`);
                    return;
                  }
                  tenorMutation.mutate({ id: tenorTarget.id, value });
                }}
              >
                Simpan
              </Button>
            </>
          }
        >
          <FormField
            label={`Jumlah bulan (1-${MAX_MONTHS})`}
            hint="Mengubah tenor menghitung ulang jadwal. Pembayaran yang sudah tercatat tidak hilang."
          >
            <Input
              type="number"
              min="1"
              max={MAX_MONTHS}
              value={months}
              onChange={(event) => setMonths(event.target.value)}
            />
          </FormField>
        </Modal>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        title="Hapus jadwal angsuran?"
        message={`Jadwal ${deleteTarget?.counterparty_name || ''} (${
          deleteTarget?.transaction_number || ''
        }) akan dihapus.`}
        detail="Pembayaran yang sudah tercatat tetap ada. Menghapus rencana bukan membatalkan pembayaran."
        confirmLabel="Hapus"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
