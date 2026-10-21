import { formatNumber } from '../../utils/format';
import { emptyUnit, rebaseRatio, validateUnits } from './unitRules';

const inputClass =
  'h-11 px-3 rounded-lg border border-outline-variant bg-surface text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition';

/**
 * Editor daftar satuan produk.
 *
 * Dua keputusan yang dipegang komponen ini:
 *
 * 1. Faktor selalu berarti "1 satuan ini = N satuan dasar", jadi angka di
 *    sebelahnya selalu bisa dibaca tanpa konteks tambahan. Kalau factor ditulis
 *    relatif ke satuan yang dipilih, angkanya berubah arti setiap kali user
 *    memindahkan radio - dan tidak ada yang ingat angkanya lama itu berapa.
 *
 * 2. Mengganti satuan dasar TIDAK diam-diam mengubah stok. Komponen hanya
 *    memberi tahu induknya lewat `onBaseChange`; keputusan untuk
 *    mengonversi tetap milik pengguna, lewat dialog konfirmasi.
 */
export default function ProductUnitEditor({ units, onChange, disabled = false, currentBaseName = '' }) {
  const rows = units.length ? units : [{ ...emptyUnit(), is_base: true }];

  function update(index, patch) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  /**
   * Memindahkan satuan dasar ke baris `index`.
   *
   * Faktor baris yang baru jadi dasar dipaksa 1 karena satuan terkecil selalu
   * bernilai 1 terhadap dirinya sendiri. Baris lain TIDAK ikut diubah: kalau
   * ikut, isi dus yang sudah 24 akan ter-reset ke 1 sehingga stok tidak
   * terkonversi tanpa alasan yang bisa dilihat.
   */
  function setBase(index) {
    onChange(
      rows.map((row, i) => {
        if (i === index) return { ...row, is_base: true, factor: 1 };
        return row.is_base ? { ...row, is_base: false } : row;
      })
    );
  }

  function addRow() {
    onChange([...rows, { ...emptyUnit(), is_base: false }]);
  }

  function removeRow(index) {
    if (rows.length <= 1) return;
    const next = rows.filter((_, i) => i !== index);

    // Baris dasar tidak boleh hilang diam-diam. Kalau yang dihapus adalah
    // satuan terkecil, satuan terkecil berikutnya naik jadi dasar.
    if (rows[index].is_base) {
      next[0] = { ...next[0], is_base: true, factor: 1 };
    }

    onChange(next);
  }

  const { units: clean, errors } = validateUnits(rows);
  const baseName = clean.find((u) => u.is_base)?.name;
  const ratio = rebaseRatio(clean, currentBaseName);
  const isRebasing = Boolean(
    baseName && currentBaseName && baseName.toLowerCase() !== currentBaseName.toLowerCase()
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-on-surface-variant">Satuan</span>
        <button
          type="button"
          onClick={addRow}
          disabled={disabled}
          className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1 disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Tambah satuan
        </button>
      </div>

      <div className="space-y-2">
        {rows.map((row, index) => {
          const otherNames = rows
            .filter((_, i) => i !== index)
            .map((r) => r.name.trim().toLowerCase())
            .filter(Boolean);
          const nameTaken = otherNames.includes((row.name || '').trim().toLowerCase());

          return (
            <div key={row.id ?? `new-${index}`} className="rounded-lg border border-outline-variant/60 bg-surface-container-low p-3 space-y-2">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-on-surface-variant shrink-0 cursor-pointer" title="Satuan terkecil, tempat stok disimpan">
                  <input
                    type="radio"
                    name="unit-base"
                    checked={row.is_base}
                    disabled={disabled}
                    onChange={() => setBase(index)}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="hidden sm:inline">Dasar</span>
                </label>

                <input
                  type="text"
                  value={row.name}
                  disabled={disabled}
                  onChange={(e) => update(index, { name: e.target.value })}
                  placeholder="btl"
                  aria-label="Nama satuan"
                  className={`${inputClass} flex-1 min-w-0 ${nameTaken ? 'border-error' : ''}`}
                />

                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  disabled={disabled || rows.length <= 1}
                  aria-label={`Hapus satuan ${row.name || 'ini'}`}
                  className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-outline hover:bg-error-container hover:text-error transition-colors disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="flex items-center gap-2 pl-6 sm:pl-[3.1rem]">
                <span className="text-xs text-on-surface-variant shrink-0">
                  {row.is_base ? '1' : `1 ${row.name || 'satuan'}`} =
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={row.factor}
                  disabled={disabled || row.is_base}
                  onChange={(e) => update(index, { factor: e.target.value })}
                  aria-label={`Isi 1 ${row.name || 'satuan'}`}
                  className={`${inputClass} w-20 text-center ${row.is_base ? 'opacity-60' : ''}`}
                />
                <span className="text-xs text-on-surface-variant truncate">
                  {row.is_base ? baseName || 'satuan dasar' : baseName ? baseName : 'satuan dasar'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {errors.length > 0 && (
        <ul className="space-y-0.5 text-xs text-error">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {!errors.length && isRebasing && ratio !== null && (
        <RebaseNotice currentBaseName={currentBaseName} nextBaseName={baseName} ratio={ratio} />
      )}
    </div>
  );
}

/**
 * Peringatan sebelum konfirmasi, bukan dialog. Muncul begitu daftar satuan
 * jadi tidak konsisten, supaya masalahnya terlihat di halaman yang sama -
 * bukan setelah user menekan Simpan lalu menunggu balasan server.
 */
function RebaseNotice({ currentBaseName, nextBaseName, ratio }) {
  const isRenameOnly = ratio === 1;

  return (
    <div
      className={`rounded-lg border px-3 py-2.5 text-xs space-y-1 ${
        isRenameOnly
          ? 'bg-warning-container border-warning-fixed text-on-warning-container'
          : 'bg-primary-container border-primary/20 text-on-primary-container'
      }`}
    >
      <p className="font-medium">Satuan dasar akan diganti: {currentBaseName} &rarr; {nextBaseName}</p>

      {isRenameOnly ? (
        <p>
          Isi 1 {currentBaseName} diisi <strong>1</strong> {nextBaseName}, jadi stok <strong>tidak
          berubah</strong> - ini hanya memperbaiki penamaan satuan. Kalau sebenarnya 1{' '}
          {currentBaseName} berisi lebih dari 1 {nextBaseName}, isi kolomnya dengan jumlah aslinya
          (misal 24), karena itulah yang mengkonversi stok.
        </p>
      ) : (
        <p>
          1 {nextBaseName} = <strong>{formatNumber(ratio)}</strong> {currentBaseName}. Stok akan
          dikali {formatNumber(ratio)} dan harga per satuan dibagi {formatNumber(ratio)}.
        </p>
      )}
    </div>
  );
}
