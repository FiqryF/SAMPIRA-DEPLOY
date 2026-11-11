# SAMPIRA Phase 5B — Laporan Frontend

**Status akhir — PASS WITH NOTES.** Alur lokasi, API, dan browser lulus dengan Backend Phase 5A. Provider rute produksi berstatus **NOT CONFIGURED / NOT TESTED**.

Baseline FE `023e08ba53b220588215167a15642f2333bcb6a5` dan BE `64be28329fee5be5d0f5db0f313509636fb9a022`. Branch FE aktif dan bersih sebelum implementasi. Baseline Chromium Phase 1–4B lulus memakai arsip kedua branch dan MariaDB 10.4.32 terisolasi.

## Audit dan desain

Audit mencakup README, laporan Phase 3B/4B, formulir dan detail pickup, halaman User, Petugas, Admin, modul verifikasi/penanganan fasilitas, serta kontrak Phase 5A dari arsip BE. Peta User lama hanya menunjukkan area Bandung. Petugas membuka alamat di Google Maps dan halaman dashboard memiliki peta area terpisah. Form fasilitas telah menerima koordinat manual dan memakai retry ber-UUID. Titik pickup dan laporan sekarang mengikuti data API yang diizinkan.

Skill **ponytail** dan **frontend-design** dipakai. Panel lokasi mengikuti warna dan tipografi portal. Grid, label A/B, angka berlebar tetap, serta warna berbeda untuk asal dan tujuan membantu membedakan peta tugas dari formulir. Pada layar kecil, tinggi peta dipadatkan, kontrol mudah dijangkau, dan sidebar desktop Petugas disembunyikan. Field manual berlabel, fokus terlihat, perubahan status diumumkan dengan teks, dan animasi peta dimatikan.

## Alur lokasi

| Layar | Perilaku |
|---|---|
| User pickup | Pin awal langsung terlihat pada peta dan bisa digeser. Pin awal hanya panduan. Geser atau pilih titik lewat klik, GPS berizin, atau isian manual, lalu konfirmasi. Pickup tetap dapat diajukan dengan alamat saja jika belum memilih titik. |
| Edit dan detail pickup | Edit membuka detail terbaru. Alamat saja mempertahankan titik, konfirmasi mengirim pasangan baru, dan **Hapus titik** mengirim pasangan kosong. Status 409 menutup alur edit dengan penjelasan serta memuat ulang data. Detail menampilkan marker bila ada dan alamat bila tersedia. |
| User fasilitas | Peta jalan langsung tampil dengan pin awal yang bisa digeser. FormData tetap mengirim foto dan UUID retry. Picker memakai enam desimal. Revisi memakai versi Phase 3 dan mengirim ulang titik tersimpan ketika alamat saja berubah. |
| Admin | Detail verifikasi dan penanganan menampilkan marker dan alamat dari API serta keterangan bahwa titik berasal dari pelapor. |
| Petugas pickup | Antrean menyembunyikan lokasi privat. Klaim memakai API existing, lalu detail pickup dimuat ulang sebelum marker dan navigasi tersedia. |
| Petugas fasilitas | Ringkasan handling menampilkan lokasi untuk assignment yang berwenang. Recheck saat fokus, interval detail, dan sebelum tindakan eksternal mendeteksi akses yang dicabut. 403/404 menutup detail, membersihkan marker/rute, dan memuat daftar terbaru. |

Koordinat pickup memakai maksimal tujuh desimal dan fasilitas enam. Nilai `null` menghasilkan tampilan tanpa marker. Nol adalah titik sah. Portal menyimpan state peta di memori. Tab tersembunyi, pergantian tujuan, logout, sesi berakhir, atau akses dicabut membersihkan asal/rute yang berlaku. Cookie tetap same-origin dan hak akses diperiksa Backend. [Endpoint dan konfigurasi](PHASE_05_FE_INTEGRATION_NOTES.md)

## Rute dan fallback

Petugas memilih A lewat peta, input manual, atau GPS setelah klik. B berasal dari tujuan Backend. Adapter OSRM memakai urutan bujur, lintang. Leaflet menampilkan marker dalam urutan lintang, bujur dan merender garis dari GeoJSON yang valid. Tombol rute menampilkan status proses, membatalkan request lama, dan memakai jarak serta durasi provider jika tersedia. Ketika ukuran peta berubah, bounds rute dihitung ulang agar marker tetap terlihat. [Leaflet](https://leafletjs.com/reference-1.9.4.html) · [OSRM Route API](https://project-osrm.org/docs/v5.24.0/api/#route-service)

Jika jaringan rute gagal, muncul pesan dan opsi **Buka di Google Maps**. Tombol mengirim tujuan saja setelah izin tugas diperiksa, memakai alamat jika titik kosong. Formulir pickup dan fasilitas serta detail berkoordinat Admin/Petugas memuat peta jalan OpenStreetMap saat terlihat. Pada tugas Petugas, akses diperiksa kembali sebelum tile diminta. Jika tile gagal, pin dan input manual tetap bisa dipakai, dengan opsi coba lagi. Detail User tetap menyediakan tombol muat peta. [Perbaikan peta Admin dan Petugas](PHASE_05_FE_MAPS_FIX.md) · [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)

## Perubahan file

| Area | File |
|---|---|
| View | `app/Views/dashboard.html`, `app/Views/collector.html`, `app/Views/admin.html` |
| Peta dan rute | `assets/js/location-map.js`, `assets/js/location-routing.js`, `assets/css/location-map.css`, `assets/css/portal-system.css` |
| Pickup | `assets/js/dashboard.js`, `assets/js/user-map.js`, `assets/js/collector.js` |
| Fasilitas dan sesi | `assets/js/facility-report-form.js`, `assets/js/facility-reports.js`, `assets/js/facility-handling.js`, `assets/js/facility-api.js`, `assets/js/portal-session.js` |
| Uji | `scripts/check-phase1-browser.mjs`, `scripts/check-phase3-frontend.mjs`, `scripts/check-phase5-frontend.mjs`, `scripts/check-phase5-routing.mjs` |
| Dokumentasi | `docs/progress/PHASE_05_FE.md`, `docs/progress/PHASE_05_FE_INTEGRATION_NOTES.md` |

## Hasil verifikasi

| Uji | Hasil |
|---|---|
| Baseline dan regresi Phase 1–4B | PASS. API dan Chromium menguji autentikasi empat role, pickup, tracking, timbang, reward/pembayaran, laporan/revisi, verifikasi, tugas, bukti privat, histori, konflik, dan koordinasi. |
| Chromium Phase 5B dengan API nyata | PASS. Pemilihan dan drag, konfirmasi ulang, gagal kirim, create, detail, edit mempertahankan/mengganti/menghapus titik, koordinat nol, konflik setelah klaim, foto fasilitas, revisi dan marker Admin/Petugas dibandingkan dengan data API. |
| Izin dan fallback browser | PASS. GPS lewat tindakan eksplisit, izin ditolak, akurasi rendah, tile diblokir, alamat cadangan, dan navigasi nonaktif saat tujuan serta alamat kosong. |
| Adapter rute simulasi | PASS. Validasi bentuk dan urutan OSRM/GeoJSON, batas koordinat, geometri rusak/kosong, timeout, pembatalan, HTTP 429, `NoRoute`, dan URL tujuan eksternal. |
| Chromium rute simulasi | PASS. Status proses, A/B, garis dan estimasi provider, pembatalan akibat perubahan asal atau tugas, tanpa garis saat gagal, URL eksternal, dan pembersihan saat akses fasilitas dicabut. |
| Viewport 1280, 768, 390, 320 px | PASS. Panel pickup, dialog edit, form fasilitas dan detail tugas diuji untuk lebar dan overflow. Screenshot mobile diperiksa. Marker A/B diuji setelah resize rute ke 390 px. |
| Pemeriksaan tambahan | PASS. Pemeriksaan kualitas HTML/CSS, UI CMS Administrator mock, sepuluh tarif kategori dan lima kategori invalid pada skema fixture. |
| Provider nyata | **NOT CONFIGURED / NOT TESTED.** Deployment perlu memilih dan menguji provider resmi dengan cakupan jalan, profil, TLS, CORS, kuota, dan aturan privasi log yang sesuai. |

## Checklist penerimaan

- [x] Picker pickup dan fasilitas, marker drag, koordinat manual, GPS berizin, dan konfirmasi.
- [x] API nyata menyimpan titik dan menampilkan data yang sama saat detail dibuka kembali.
- [x] Edit pickup menjaga semantik pertahankan/ganti/hapus. Revisi fasilitas mempertahankan titik, foto, dan versi yang benar.
- [x] Admin dan Petugas memakai titik yang diizinkan. Antrean pickup tersamarkan dan peta dibersihkan setelah pengalihan.
- [x] Adapter rute, render GeoJSON simulasi, fallback provider kosong/gagal, dan URL navigasi eksternal.
- [x] Viewport target, regresi Phase 1–4B, dan E2E lintas branch dengan Backend Phase 5A.
- [x] Konfigurasi, batasan, privasi, dan pengujian didokumentasikan.
- [ ] Validasi provider rute produksi pada deployment terkonfigurasi.

Perubahan disimpan lokal pada working tree FE. Build Backend berasal dari arsip BE. Database pengujian memakai fixture. Pengerjaan Phase 5B selesai tanpa merge, commit, push, atau perubahan source Backend dan migrasi.
