import { toast as sonnerToast } from 'sonner';

/**
 * Pembungkus notifikasi.
 *
 * Semua mutasi (simpan, hapus, gagal) melapor lewat sini supaya pesan
 * konsisten dan tidak ada lagi error API mentah yang tampil di layar.
 */
export const toast = {
  success: (message, options) => sonnerToast.success(message, options),
  error: (message, options) => sonnerToast.error(message, options),
  info: (message, options) => sonnerToast(message, options),
  warning: (message, options) => sonnerToast.warning(message, options),
  promise: (promise, messages) => sonnerToast.promise(promise, messages),
};

/**
 * Ambil pesan error yang layak dibaca user dari respons API.
 *
 * Laravel mengirim bentuk `{ message, errors }`. `errors` berisi detail
 * validasi per field, jadi dipakai untuk pesan yang lebih spesifik.
 */
export function apiErrorMessage(error, fallback = 'Terjadi kesalahan. Coba lagi.') {
  const data = error?.response?.data;

  if (data?.errors && typeof data.errors === 'object') {
    const first = Object.values(data.errors)[0];
    const text = Array.isArray(first) ? first[0] : first;
    if (text) return String(text);
  }

  if (data?.message) return String(data.message);
  if (error?.message && error.message !== 'Network Error') return error.message;

  return fallback;
}

/** Field error pertama dari validasi Laravel, untuk ditempel ke input. */
export function apiFieldError(error, field) {
  const errors = error?.response?.data?.errors;
  if (!errors) return null;
  const value = errors[field];
  if (!value) return null;
  return Array.isArray(value) ? value[0] : String(value);
}
