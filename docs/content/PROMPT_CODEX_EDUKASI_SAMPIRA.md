# Codex — Tambah 10 Materi Edukasi SAMPIRA (Content-Only)

Tugas: Tambahkan 10 artikel edukasi Bahasa Indonesia yang TELAH ditulis dan dikurasi di file `SAMPIRA_KONTEN_EDUKASI_TERVERIFIKASI.md` ke modul Edukasi SAMPIRA. File tersebut adalah sumber konten final; jangan browsing, jangan mencari ulang jurnal/berita, jangan menulis ulang substansi, jangan membuat artikel baru, dan jangan mengarang URL, gambar atau data.

Langkah:
1. Periksa `git status` dan struktur konten Edukasi/CMS existing secara terarah (model DB, endpoint, CRUD Admin, tampilan User, seed/import bila ada). Pertahankan perubahan saat ini pada branch `main`.
2. Petakan 10 artikel ke field nyata (judul, slug, kategori, ringkasan, body, daftar sumber/tautan, status publikasi). Gunakan workflow existing, tanpa membuat sistem CMS baru. Pertahankan paragraf, panduan aksi, tahun data, dan atribusi sumber; jika DB tidak punya field sumber, gunakan format konsisten di body yang aman, tanpa migrasi kecuali mutlak diperlukan.
3. Buat mekanisme import/seed idempotent: cek slug atau identifier unik, tidak menduplikasi artikel jika dijalankan lagi, tidak menimpa konten editorial pengguna yang sudah ada. Jangan menghapus artikel lama.
4. Uji insert dan hasil render dengan fixture/clone terisolasi, lalu browser sebagai User dan Admin: 10 judul, kategori, isi, sumber klik, karakter Unicode, navigasi, mobile, escaping/XSS, status draft/published dan tidak ada duplikat setelah import dua kali. Periksa tautan eksternal `rel="noopener noreferrer"` jika `target="_blank"`.
5. Jangan mengubah Login/Register, Landing, reward, voucher, pickup, fasilitas, API transaksi, atau business rules. Jangan redesign. Jangan commit/push/switch/reset. Jangan restart server utama. Jangan mengubah database utama `ecorecycle` otomatis.
6. Setelah konten terverifikasi pada fixture, tampilkan metode aktivasi/import ke database utama yang aman dan minta persetujuan eksplisit jika aksi tersebut belum diberikan; jangan mengklaim konten telah tayang di server utama jika baru diuji pada clone.
7. Dokumentasi singkat di file progress yang relevan: jumlah artikel, sumber konten, metode import, hasil test, status publikasi dan hambatan. Tidak perlu full log.

Output singkat: jumlah berhasil, bagaimana dimuat, hasil tes, file berubah, status database utama, dan langkah selanjutnya. Fokus konten saja, hemat token.
