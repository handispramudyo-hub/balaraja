import api from './api';

/**
 * Ambil nama file dari header Content-Disposition.
 *
 * Dua varian yang harus ditangani:
 *  - filename="laporan.xlsx"      (ASCII, format lama)
 *  - filename*=UTF-8''laporan.xlsx (RFC 5987, dipakai kalau nama mengandung
 *                                    karakter non-ASCII seperti nama pelanggan)
 */
function filenameFromDisposition(disposition, fallback) {
  if (!disposition) return fallback;

  const extended = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (extended) {
    try {
      return decodeURIComponent(extended[1].trim().replace(/^"|"$/g, ''));
    } catch {
      return extended[1].trim();
    }
  }

  const plain = disposition.match(/filename\s*=\s*"?([^";]+)"?/i);
  return plain ? plain[1].trim() : fallback;
}

/**
 * Unduh file laporan dengan membawa header auth.
 *
 * Sengaja pakai axios `api` dan BUKAN <a href> / window.open: exporter memakai
 * Bearer token, dan request tanpa header Authorization akan balik 401 — yang
 * di browser muncul sebagai tab kosong atau JSON error, bukan file.
 *
 * responseType blob + object URL juga menghindari masalah popup blocker
 * yang biasa muncul kalau membuka tab baru dari klik.
 */
export async function downloadReport(path, params = {}, fallbackName = 'laporan') {
  const response = await api.get(path, {
    params,
    responseType: 'blob',
  });

  const name = filenameFromDisposition(
    response.headers?.['content-disposition'],
    fallbackName
  );

  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Beri event loop kesempatan menyelesaikan click sebelum URL dicabut.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Nama file yang wajar kalau server tidak mengirim Content-Disposition. */
export function reportFilename(slug, format, stamp) {
  const today = stamp || new Date().toISOString().slice(0, 10);
  return `laporan-${slug}-${today}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
}

/**
 * Ambil pesan error dari request download.
 *
 * Karena `downloadReport` memakai `responseType: 'blob'`, `error.response.data`
 * adalah Blob, bukan objek JSON. `data.message` selalu `undefined`, sehingga
 * pesan helpful dari server (mis. "ekstensi PHP [xmlwriter] tidak aktif")
 * tidak pernah sampai ke user.
 *
 * @returns {Promise<string|null>} pesan dari server, atau null kalau tidak ada.
 */
export async function downloadErrorMessage(err) {
  const data = err?.response?.data;

  if (data && typeof data.text === 'function') {
    try {
      const parsed = JSON.parse(await data.text());
      if (parsed?.message) return parsed.message;
    } catch {
      // Body bukan JSON (mis. halaman error HTML) -> pakai fallback.
    }
  }

  return data?.message || null;
}
