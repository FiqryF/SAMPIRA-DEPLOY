# Progress SAMPIRA

Ringkasan sampai 9 November 2026.

## Fitur yang ditambahkan

- Login dan akses untuk User, Petugas, Admin, serta Administrator.
- Penjemputan sampah dengan beberapa kategori dalam satu permintaan, rincian berat, dan perhitungan estimasi reward per kategori.
- Form penjemputan dan laporan fasilitas bertahap dengan validasi sebelum lanjut.
- Pemilihan lokasi melalui peta, pin yang bisa digeser, lokasi perangkat, dan pengisian alamat otomatis.
- Upload foto atau mengambil foto melalui kamera perangkat yang mendukung.
- Laporan fasilitas, verifikasi Admin, penugasan Petugas, bukti pemeriksaan, dan progres penanganan.
- Laporan fasilitas warga dapat dilihat bersama; warga lain bisa mengonfirmasi ikut terdampak. Jumlah terdampak ditampilkan kepada Admin dan Petugas.
- Detail laporan bersama memuat deskripsi, alamat, titik peta, dan foto melalui akses yang dibatasi.
- Reward penjemputan, pencatatan pembayaran manual, riwayat pembayaran, poin kontribusi, dan penukaran voucher.
- CMS artikel edukasi dengan foto dari tautan internet atau upload, katalog, pencarian, kategori, dan pagination.
- Grafik kontribusi, statistik operasional, dan peta sebaran sesuai izin role.
- Dataset produksi dan penanganan sampah Kota Bandung. Dataset Coblong dihapus dari tampilan publik.

## Tampilan yang diperbarui

- Landing Page, Login/Register, serta portal empat role.
- Beranda User, penjemputan, laporan fasilitas, riwayat, reward, poin/voucher, edukasi, dan pengaturan.
- Halaman tugas Petugas, operasional Admin, dan menu Administrator.
- Halaman daftar dan pembaca artikel dibuat lebih konsisten; foto Beranda memakai gradasi.

## Perbaikan terakhir

- Validasi pembayaran reward diperjelas; transaksi gagal tidak ditandai sudah dibayar dan pembayaran ganda dicegah.
- Navigasi Lapor Fasilitas langsung membuka form; laporan warga hanya muncul pada langkah kategori.
- Perbaikan aksesibilitas HTML, selector CSS duplikat, kontras, serta sejumlah warning JavaScript dan Go.
- Pengujian Go, pickup multi-kategori, foto artikel, dan pembayaran reward lulus pada fixture terisolasi.

## Catatan status

- Pembayaran manual hanya mencatat transfer yang dilakukan di luar SAMPIRA.
- Perbaikan source terakhir belum diaktifkan melalui restart Backend utama.
- SonarQube IDE belum dipindai ulang secara penuh; belum dinyatakan seluruh repository bebas warning.
- Tidak ada commit atau push otomatis pada pekerjaan terakhir.

Laporan teknis terperinci tersedia di `docs/progress/PHASE_09.md` dan `docs/progress/PHASE_10.md`.
