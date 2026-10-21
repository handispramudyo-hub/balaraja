// Kaki halaman pada laporan.
//
// Elemen ini SENGAJA tidak lagi memuat teks apa pun. Isinya dipindah ke
// @bottom-left / @bottom-right di dalam blok @page pada index.css, karena
// elemen position: fixed tidak memesan ruang di flow - baris tabel terakhir
// selalu bisa mengalir tepat di atas kaki halaman, dan menggesernya ke
// margin dengan offset negatif justru membuat Chrome menaruhnya di bagian
// atas halaman berikutnya.
//
// Karena teksnya sudah tidak lagi diperlukan di sini, komponen ini tidak boleh
// menerima prop `note`: kalau masih ada, teksnya akan ada di dua tempat
// dan cepat tidak sinkron dengan yang benar-benar tercetak.
export default function PrintFooter() {
  return <div className="print-only print-footer" aria-hidden="true" />;
}
