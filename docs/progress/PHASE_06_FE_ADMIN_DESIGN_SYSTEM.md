# Sistem desain Admin · Phase 6B.4

Sidebar hijau gelap, permukaan putih, dan kanvas sage mengikuti identitas SAMPIRA. Breadcrumb menjelaskan ruang aktif. Ringkasan menempatkan angka antrean dan daftar pekerjaan di awal, diikuti akses langsung ke tindakan yang relevan.

| Elemen | Penerapan |
| --- | --- |
| Warna | Hijau utama `#174c3c`, sidebar `#103d2f`, kanvas `#f7f9f5`, teks `#182c23`, teks pendukung `#4b6459`, garis `#d4e1d8`. |
| Tipografi | Inter dengan fallback Segoe UI dan system UI. Judul panel diskalakan dengan `clamp()`. |
| Navigasi | Sidebar 238 px pada desktop lebar, 203 px pada desktop sedang. Mulai 900 px, navigasi dilipat di bawah tombol Menu. |
| Tabel | Header semantik, status dalam badge dengan label teks, nomor laporan dapat membungkus. Tabel panjang dapat digulir di dalam panel. Ringkasan menampilkan tombol Detail dalam baris yang sama di ponsel. |
| Form dan dialog | Label dan masukan asli, batas tinggi dialog mengikuti viewport, area aksi berbeda secara visual, dan status jaringan muncul dekat konteks operasi. |
| Peta | Kanvas responsif, daftar alamat di sisi peta pada desktop dan di bawahnya pada ponsel. |
| Aksesibilitas | Bahasa dokumen Indonesia, tautan lewati navigasi, fokus terlihat, tombol navigasi menyatakan pilihan, tombol Menu menyatakan kondisi buka, dan Escape menutup menu ponsel. Status tersedia sebagai teks. |
| Kinerja | Satu stylesheet dan satu modul ringan untuk shell. Ringkasan meminta dua daftar berhalaman secara paralel. Tabel, peta, dan CMS memuat datanya ketika dibuka. |

Pola visual dan perubahan CSS dibatasi ke `.sp-admin`. Pemrosesan data, dialog konfirmasi, penanganan konflik versi, dan konfigurasi Leaflet menggunakan fondasi portal yang sudah ada. Ilustrasi konsep dipakai sebagai acuan desain internal. UI memakai ikon vektor yang ringan.
