import { formatCurrency as fmtCurrency, formatDate as fmtDate, formatNumber as fmtNumber } from './format';

/**
 * Titik masuk lama untuk utilitas format.
 *
 * Halaman yang sudah ada mengimpor dari `utils/format`. Isi modul ini
 * sekarang berasal dari `lib/format` supaya hanya ada satu implementasi.
 */
export function formatCurrency(number) {
  return fmtCurrency(number);
}

export function formatDate(date) {
  return fmtDate(date);
}

export function formatNumber(number) {
  return fmtNumber(number);
}

export * from '../lib/format';
