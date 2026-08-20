export function formatCurrency(number) {
  if (number == null || isNaN(number)) return 'Rp0';
  const rounded = Math.round(Number(number));
  return 'Rp' + rounded.toLocaleString('id-ID');
}

export function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatNumber(number) {
  if (number == null || isNaN(number)) return '0';
  return Number(number).toLocaleString('id-ID');
}
