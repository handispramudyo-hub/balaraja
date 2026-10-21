import { useCallback, useState } from 'react';
import { downloadErrorMessage, downloadReport, reportFilename } from '../services/download';

/**
 * Hook untuk trigger export Excel/PDF dari halaman laporan.
 *
 * Menyatukan tiga hal yang mudah salah kalau ditulis manual di tiap halaman:
 *  - status `exporting` per format (Excel & PDF tidak bisa diklik barengan)
 *  - error tidak ditelan diam-diam; pesan dari server diteruskan utuh
 *  - filter aktif ikut diteruskan, jadi file export sama dengan yang di layar
 *
 * Download selalu lewat `downloadReport` (axios + Bearer token), bukan
 * <a href>, supaya tidak kena 401.
 */
export function useReportExport(slug, params) {
  const [exporting, setExporting] = useState(null);
  const [error, setError] = useState(null);

  const run = useCallback(async (format) => {
    setExporting(format);
    setError(null);

    try {
      await downloadReport(
        `/reports/export/${slug}`,
        { ...params, format },
        reportFilename(slug, format)
      );
    } catch (e) {
      if (e?.response?.status === 401) {
        setError('Sesi Anda habis. Silakan login ulang.');
      } else {
        setError(
          (await downloadErrorMessage(e)) ||
            `Gagal membuat file ${format.toUpperCase()}.`
        );
      }
    } finally {
      setExporting(null);
    }
  }, [slug, params]);

  const clearError = useCallback(() => setError(null), []);

  return { exporting, error, exportReport: run, clearError };
}

/** Buang key filter yang kosong supaya tidak terkirim sebagai `?k=`. */
export function compactParams(params) {
  const out = {};

  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') {
      out[key] = value;
    }
  }

  return out;
}
