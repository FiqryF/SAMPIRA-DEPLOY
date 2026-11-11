# SAMPIRA Phase 5B — Catatan Integrasi Frontend

## Backend dan data

Sajikan view serta aset Phase 5B dari origin yang sama dengan server `BE` Phase 5A. Acuan pengujian adalah BE `64be283`. Startup BE menerapkan `004_precise_locations.sql` setelah migrasi fasilitas 002 dan 003. Untuk data riil, siapkan backup dan verifikasi restore sebelum cutover. Gunakan cookie portal HttpOnly. Mutasi harus melalui origin yang diizinkan dan otorisasi tetap ditentukan Backend. [Kontrak Phase 5A pada BE](https://github.com/azitriyadi/SAMPIRA/blob/64be283/docs/progress/PHASE_05_API_CONTRACT.md)

| Layar | Endpoint di bawah `/api/ecorecycle` |
|---|---|
| Pickup User | POST `/request_pickup` multipart, POST `/update_pickup` JSON, GET `/list_pickups?type=user`, GET `/pickup_status?tracking_number=…` |
| Pickup Petugas | GET `/list_pickups?type=petugas`, POST `/assign_collector`, GET `/pickup_status?tracking_number=…` setelah klaim |
| Laporan User | POST `/facility-reports` multipart dengan `Idempotency-Key`, PUT `/facility-reports/{id}` multipart dengan versi laporan |
| Verifikasi Admin | GET `/facility-reports`, GET `/facility-reports/{id}`, POST `/facility-reports/{id}/verification` |
| Tugas fasilitas | GET `/facility-reports/handling` dan GET `/facility-reports/{id}/handling` untuk marker tugas berizin |

Pickup memakai pasangan desimal hingga tujuh digit pecahan. Edit tanpa perubahan titik menghilangkan kedua field, hapus eksplisit mengirim kedua field kosong. Fasilitas memakai enam digit dan revisi menyertakan ulang titik tersimpan bila masih dipertahankan. Data historis tanpa titik hanya menampilkan alamat bila tersedia. Kedua field diperiksa secara eksplisit, sehingga `0,0` tetap valid. Penanganan membaca `version` Phase 4 dari ringkasan handling. Revisi laporan membaca `version` Phase 3 dari detail laporan.

## Konfigurasi rute jalan

Pada deployment Petugas, isi dua meta di view `app/Views/collector.html` dari konfigurasi operator. Contoh bentuk konfigurasi berikut memakai domain contoh.

```html
<meta name="sampira-routing-url" content="https://routes.example.org/osrm">
<meta name="sampira-routing-profile" content="driving">
```

Base URL harus absolut HTTPS, tanpa kredensial, query, atau fragmen. Profil harus sesuai jaringan dan moda yang disiapkan operator. Adapter menambahkan `/route/v1/{profile}/{lonA},{latA};{lonB},{latB}` dan meminta `geometries=geojson`. A dan B dikirim hanya setelah Petugas meminta rute dan API mengonfirmasi akses tugas. Browser mengirim request tanpa cookie dan tanpa referrer ke provider. Tetapkan CORS untuk origin portal, batas kapasitas, serta `connect-src` bila ada CSP di deployment. Hindari log akses yang mencatat URL dengan koordinat. Provider yang membutuhkan rahasia atau menolak akses browser membutuhkan integrasi server tersendiri. [OSRM Route API](https://project-osrm.org/docs/v5.24.0/api/#route-service)

Jika URL kosong, Petugas tetap dapat melihat marker dan memilih navigasi eksternal. Respons `NoRoute`, HTTP 429, timeout 10 detik, kegagalan layanan, atau geometri tidak valid menghapus garis sebelumnya dan mempertahankan tujuan. Garis berasal dari GeoJSON provider yang lolos validasi. Marker B tetap menggunakan titik asli walau provider memilih ruas jalan terdekat. Google Maps menerima tujuan saja setelah tindakan Petugas. Alamat digunakan jika titik presisi kosong dan alamat tersedia. [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)

## Geolocation, tile, dan privasi

- `getCurrentPosition` dipanggil satu kali per klik **Gunakan Lokasi Saya**. Gunakan HTTPS atau loopback untuk pengembangan. Pastikan kebijakan browser atau `Permissions-Policy` mengizinkan geolocation. Penolakan, timeout, dan GPS tidak tersedia tetap mengizinkan titik manual. Akurasi rendah ditampilkan sebagai perkiraan. [W3C Geolocation](https://www.w3.org/TR/geolocation/)
- Peta lokasi menggunakan Leaflet 1.9.4. Formulir pickup/laporan dan detail berkoordinat Admin/Petugas memuat tile OpenStreetMap ketika terlihat. Area viewport dikirim ke OpenStreetMap. Detail pickup dan tugas fasilitas Petugas memeriksa ulang akses sebelum memuat tile. Detail User tetap memakai tombol **Muat peta jalan OpenStreetMap**. Jika tile gagal, marker dan input manual tetap tersedia dengan opsi coba lagi. Atribusi tampil saat tile aktif. [Leaflet](https://leafletjs.com/reference-1.9.4.html) · [Kebijakan tile OSM](https://operations.osmfoundation.org/policies/tiles/)
- Panel menyimpan asal dan rute dalam memori layar. Pergantian tugas, keluar dari panel, logout, sesi 401, dan pencabutan akses membatalkan rute serta membersihkan data. Pada detail fasilitas Petugas, akses diperiksa kembali sebelum tindakan eksternal, saat jendela kembali fokus, dan setiap 20 detik selama detail terlihat. Saat Backend melaporkan 403/404, detail ditutup dan daftar diperbarui. Akses yang dicabut di server dapat baru tampak pada pemeriksaan berikutnya.
- API pickup pada antrean hanya menampilkan data ringkas. Admin melihat lokasi fasilitas dari verifikasi dan penanganan. Administrator menggunakan portal agregat yang sudah ada.

## Fixture lintas branch

1. Dari `FE`, ekspor BE dengan `git archive BE` ke direktori sementara. Build `./cmd/server` dan `./db_init` dari arsip, lalu set `SAMPIRA_TEST_BIN` dan `SAMPIRA_TEST_INIT`. Siapkan MariaDB 10.4.32 terisolasi pada port 13316 dan `SAMPIRA_TEST_MYSQL`. Server fixture memakai port 18081. Port alternatif memerlukan penggantian port yang konsisten pada salinan sementara skrip induk dan anak. [Panduan fixture](../phase-01-operations.md#pengujian-terisolasi)
2. Tetap di working tree FE. Harness menyalin `app` dan `assets` dari direktori aktif untuk disajikan oleh biner BE. Isi `SAMPIRA_TEST_CHROME` dengan executable Chromium.

   ```powershell
   $env:SAMPIRA_TEST_PHASE3_FE = '1'
   $env:SAMPIRA_TEST_PHASE4_FE = '1'
   $env:SAMPIRA_TEST_PHASE5_FE = '1'
   node scripts/check-phase1-migration.mjs
   node scripts/check-phase5-routing.mjs
   ```

3. Browser memakai akun sintetis dan API nyata untuk penyimpanan dan izin lokasi. Skenario provider menyuntikkan respons OSRM simulasi ke browser fixture. Provider produksi berstatus **NOT CONFIGURED / NOT TESTED**.

## Checklist deployment gabungan

- [ ] Validasi backup/restore dan startup migrasi 004 pada lingkungan staging.
- [ ] Cek pickup lama, edit alamat tanpa menggeser titik, serta revisi fasilitas dengan titik lama.
- [ ] Cek antrean Petugas, pembacaan setelah klaim, pengalihan fasilitas, dan data bersih setelah logout.
- [ ] Uji izin GPS, rute dan fallback di perangkat lapangan dengan viewport kecil.
- [ ] Uji penyedia rute resmi melalui HTTPS/CORS, cakupan jalan, profil kendaraan, batas kuota dan privasi log.
- [ ] Verifikasi atribusi tile dan pemberitahuan sebelum mengirim area, asal, atau tujuan ke layanan eksternal.
