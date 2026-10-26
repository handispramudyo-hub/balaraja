import cn from '../../lib/cn';

const TONES = {
  neutral: 'bg-surface-container text-on-surface-variant border-outline-variant',
  primary: 'bg-primary-fixed text-on-primary-fixed border-transparent',
  success: 'bg-success-container text-on-success-container border-transparent',
  warning: 'bg-warning-container text-on-warning-container border-transparent',
  danger: 'bg-danger-container text-on-danger-container border-transparent',
  info: 'bg-info-container text-on-info-container border-transparent',
  accent: 'bg-accent-container text-on-accent-container border-transparent',
  outline: 'bg-transparent text-on-surface-variant border-outline-variant',
};

const SIZES = {
  sm: 'text-2xs px-1.5 py-0.5 gap-1',
  md: 'text-xs px-2 py-0.5 gap-1',
};

/**
 * Badge status.
 *
 * `dot` menampilkan titik warna di depan teks — dipakai untuk status bayar
 * dan status stok supaya cepat dipindai di tabel padat.
 */
export default function Badge({ children, tone = 'neutral', size = 'md', icon, dot = false, className = '' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium whitespace-nowrap',
        TONES[tone] ?? TONES.neutral,
        SIZES[size] ?? SIZES.md,
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden="true" />}
      {icon && (
        <span className="material-symbols-outlined text-sm" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}

/**
 * Badge status pembayaran, stok, dan status aktif/nonaktif.
 *
 * Satu tempat supaya warna "Lunas" tidak berbeda antar halaman.
 */
export function StatusBadge({ kind, value, className = '' }) {
  if (kind === 'payment') {
    const map = {
      paid: { label: 'Lunas', tone: 'success', icon: 'check_circle' },
      partial: { label: 'Sebagian', tone: 'warning', icon: 'pending' },
      unpaid: { label: 'Belum Bayar', tone: 'danger', icon: 'cancel' },
    };
    const cfg = map[value] ?? { label: value || '-', tone: 'neutral', icon: null };
    return (
      <Badge tone={cfg.tone} icon={cfg.icon} className={className}>
        {cfg.label}
      </Badge>
    );
  }

  if (kind === 'stock') {
    const map = {
      habis: { label: 'Habis', tone: 'danger', icon: 'error' },
      menipis: { label: 'Menipis', tone: 'warning', icon: 'warning' },
      aman: { label: 'Aman', tone: 'success', icon: 'check_circle' },
    };
    const cfg = map[value] ?? { label: value || '-', tone: 'neutral', icon: null };
    return (
      <Badge tone={cfg.tone} icon={cfg.icon} className={className}>
        {cfg.label}
      </Badge>
    );
  }

  if (kind === 'active') {
    const active = value === 'active' || value === true || value === 'Aktif';
    return (
      <Badge tone={active ? 'success' : 'neutral'} dot className={className}>
        {active ? 'Aktif' : 'Nonaktif'}
      </Badge>
    );
  }

  return (
    <Badge tone="neutral" className={className}>
      {value || '-'}
    </Badge>
  );
}
