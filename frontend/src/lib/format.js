/**
 * Format angka, rupiah, tanggal, dan waktu.
 *
 * Semua nilai uang di aplikasi ini memakai format Indonesia tanpa desimal
 * ("Rp13.960.500") karena nominal dalam Rupiah tidak pernah pecah sen di
 * transaksi toko material. Kolom tabel memakai `tabular-nums` supaya kolom
 * tidak bergoyang.
 */

export function formatCurrency(number) {
  if (number == null || isNaN(number)) return 'Rp0';
  const rounded = Math.round(Number(number));
  return 'Rp' + rounded.toLocaleString('id-ID');
}

/** Rupiah tanpa simbol "Rp", untuk kolom tabel yang punya header "Total". */
export function formatNumberCurrency(number) {
  if (number == null || isNaN(number)) return '0';
  return Math.round(Number(number)).toLocaleString('id-ID');
}

export function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Tanggal pendek: 12 Mar 2026. */
export function formatDateShort(date) {
  if (!date) return '-';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Tanggal + jam: 12 Mar 2026 14:05. */
export function formatDateTime(date) {
  if (!date) return '-';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '-';
  return `${formatDateShort(date)} ${d.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function formatNumber(number) {
  if (number == null || isNaN(number)) return '0';
  return Number(number).toLocaleString('id-ID');
}

/** Bedakan hari ini, kemarin, dan tanggal biasa. */
export function formatRelativeDate(date) {
  if (!date) return '-';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '-';
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((startOfToday - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);

  if (diffDays === 0) return 'Hari ini';
  if (diffDays === 1) return 'Kemarin';
  if (diffDays === -1) return 'Besok';
  return formatDateShort(date);
}

/** Jumlah hari dari hari ini. Negatif = lewat jatuh tempo. */
export function daysUntil(date) {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((startOfTarget - startOfToday) / 86400000);
}

/** Tanggal hari ini dalam format YYYY-MM-DD (nilai input date). */
export function todayInput() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

/** Ubah tanggal apa pun (string/Date) menjadi YYYY-MM-DD. */
export function toDateInput(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

/** Jumlah item dari array apa pun. */
export function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : ''}`;
}
