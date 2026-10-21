import useAuthStore from '../../stores/authStore';

const formatTanggal = () =>
  new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) +
  ' ' +
  new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

export default function PrintHeader({ title, subtitle, period, summary = [] }) {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="print-only print-header">
      <div className="flex items-start justify-between gap-4 pb-3 border-b-2 border-print-ink">
        <div className="flex items-center gap-3">
          <img src="/bj.png" alt="" className="print-logo w-11 h-11 rounded-lg object-cover" />
          <div>
            <p className="print-company text-[15px] font-bold tracking-wide">BALARAJA</p>
            <p className="print-muted text-[10px]">Sistem Manajemen Inventaris</p>
          </div>
        </div>
        <div className="text-right">
          <h1 className="print-title text-[15px] font-bold uppercase">{title}</h1>
          {subtitle && <p className="print-muted text-[10px] mt-0.5">{subtitle}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 py-2 text-[10px] border-b border-print-muted">
        {period && (
          <span>
            <span className="print-muted">Periode: </span>
            <span className="font-semibold">{period}</span>
          </span>
        )}
        <span>
          <span className="print-muted">Dicetak: </span>
          <span className="font-semibold">{formatTanggal()}</span>
        </span>
        {user?.name && (
          <span>
            <span className="print-muted">Oleh: </span>
            <span className="font-semibold">{user.name}</span>
          </span>
        )}
      </div>

      {summary.length > 0 && (
        <div className="grid grid-cols-3 gap-3 py-3">
          {summary.map((s) => (
            <div key={s.label} className="print-summary">
              <p className="print-muted text-[9px] uppercase tracking-wide">{s.label}</p>
              <p className="text-[13px] font-bold mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
