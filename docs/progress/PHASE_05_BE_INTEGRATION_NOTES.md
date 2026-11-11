# SAMPIRA Phase 5A — Catatan Integrasi Backend

## Prasyarat dan endpoint

Sajikan Phase 5B dari origin yang sama dengan server `BE` Phase 5A. Pastikan startup telah menerapkan `004_precise_locations.sql` pada skema Phase 1–4A. Gunakan sesi portal dan aturan origin yang berlaku. Buat peta dari respons API sesi yang sedang aktif. Bersihkan marker, asal navigasi, dan rute ketika sesi berakhir atau hak akses berubah.

| Layar | Endpoint di bawah `/api/ecorecycle` |
|---|---|
| User pickup | POST `/request_pickup`, POST `/update_pickup`, GET `/list_pickups?type=user`, GET `/pickup_status?tracking_number=…` |
| Petugas pickup | GET `/list_pickups?type=petugas`, POST `/assign_collector`, lalu GET `/pickup_status?tracking_number=…` |
| User laporan | POST `/facility-reports`, GET/PUT `/facility-reports/{id}`, GET `/facility-reports/{id}/handling` |
| Admin verifikasi dan peta | GET `/facility-reports`, GET `/facility-reports/{id}`, GET `/facility-reports/{id}/handling` |
| Petugas fasilitas | GET `/facility-reports/handling`, GET `/facility-reports/{id}/handling` |

Kirim koordinat pickup sampai tujuh desimal dan fasilitas sampai enam. Pertahankan nol dan cek kedua nilai dengan pemeriksaan eksplisit null serta angka finite dan rentang. Tampilkan alamat sebagai deskripsi. Ketika titik kosong, tampilkan keterangan titik belum tersedia. Pada antrean pickup yang belum diklaim, hanya tampilkan ringkasan yang diizinkan. Pada detail fasilitas yang menghasilkan 404 setelah pengalihan, hapus titik dan rute dari tampilan. Perlakukan status verifikasi, status lapangan, status penugasan, dan status koordinasi secara terpisah. [Kontrak Phase 5A](PHASE_05_API_CONTRACT.md)

## Peta dan routing

1. **Pemilihan tujuan.** Pakai Leaflet yang sudah ada. Pada formulir User, tampilkan posisi marker yang dapat dipindah dan alamat, lalu minta konfirmasi sebelum mengirim pasangan. Saat edit pickup, hilangkan kedua field untuk mempertahankan titik atau kirim keduanya kosong untuk menghapusnya. Pada revisi fasilitas, kirim kembali pasangan untuk mempertahankan titik. Jika tile gagal, sediakan alamat dan input/konfirmasi koordinat manual. Kebijakan atribusi, caching, dan kapasitas tile berlaku tersendiri dari routing. Untuk deployment yang perlu kapasitas terjamin atau membatasi paparan area peta, gunakan penyedia tile yang disetujui operator. [Kebijakan tile OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/)
2. **Asal Petugas.** Beri pilihan untuk menaruh titik awal manual atau menekan “Gunakan lokasi saya”. Panggil `navigator.geolocation.getCurrentPosition` satu kali setelah tindakan itu. Gunakan HTTPS atau localhost yang diperlakukan browser sebagai secure context dan periksa izin geolocation. Tangani penolakan, timeout, dan perangkat yang tidak dapat menentukan posisi dengan pilihan manual. Simpan asal hanya dalam state layar selama dibutuhkan. [W3C Geolocation](https://www.w3.org/TR/geolocation/)
3. **Rute jalan dalam peta.** Untuk provider tanpa kredensial rahasia yang memang mengizinkan panggilan browser, gunakan base URL HTTPS dan profil perjalanan yang ditentukan operator. Contoh yang sesuai adalah OSRM yang dikelola operator dengan jaringan jalan wilayah layanan dan profil kendaraan operasional. Contoh path `/route/v1/{profile}/{originLon},{originLat};{destLon},{destLat}?overview=full&geometries=geojson&steps=false`. Validasi asal dan tujuan sebelum request. Setelah Petugas menekan “Hitung rute” dan mengetahui bahwa kedua titik dikirim ke provider, terima rute hanya untuk HTTP sukses, `code: "Ok"`, dan `routes[0].geometry` berupa GeoJSON LineString valid dengan setidaknya dua titik finite dalam rentang. GeoJSON dan OSRM memakai urutan bujur, lintang. Gunakan `L.geoJSON` atau konversi ke urutan lintang, bujur jika memakai `L.polyline`. Marker tujuan tetap pada titik yang dikonfirmasi walau mesin routing menempatkan ujung rute di jalan terdekat. [OSRM Route API](https://project-osrm.org/docs/v5.24.0/api/#route-service)
4. **Kegagalan dan navigasi eksternal.** Batalkan request lama bila asal, tujuan, atau sesi berubah. Tangani timeout, HTTP 429, provider mati, `NoRoute`, dan geometri tidak valid dengan menghapus garis rute serta mempertahankan marker/alamat. Jika provider belum dikonfigurasi, tampilkan opsi navigasi eksternal. Gunakan `https://www.google.com/maps/dir/?api=1&destination=…` dengan `destination` URL-encoded sebagai `latitude,longitude`, atau alamat bila titik kosong dan alamat tersedia. Beri tahu bahwa klik membuka layanan luar dan mengirim tujuan. Kirim tujuan saja agar layanan luar mengelola asalnya. Jika tujuan dan alamat keduanya tidak tersedia, tampilkan pesan dan nonaktifkan navigasi. [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
5. **Konfigurasi deployment.** Izinkan host routing hanya dari konfigurasi operator. Provider browser memerlukan TLS, izin CORS untuk origin portal, dan izin `connect-src` bila CSP digunakan. Terapkan kuota atau pembatasan request di ingress/provider sesuai kapasitas, cegah klik ganda, dan tangani `Retry-After` bila tersedia. Jangan simpan koordinat di telemetry, riwayat aplikasi, atau access log rute yang memuat dua titik pada path. Penyedia demo publik tidak menjadi dependensi deployment. Jika provider mensyaratkan rahasia, kontrak yang melarang akses browser, atau autentikasi server, pilih integrasi server tersendiri sebelum mengaktifkannya. Phase 5A tidak menetapkan env var atau kredensial provider.

## Migrasi dan pemulihan

Backup basis data berisi data sebelum cutover dan buktikan pemulihan ke skema terisolasi. Startup server menjalankan DDL 004 setelah 002 dan 003. Untuk instance produksi, jadwalkan penerapan dengan operator karena ALTER dapat menunggu metadata lock. Pastikan akun migrasi berhak menjalankan ALTER. Kolom opsional dan constraint dapat dipasang melalui klien SQL sebelum startup, memakai file migrasi yang sama. Verifikasi kedua kolom, constraint, jumlah record, dan akses data lama.

Jika perlu rollback aplikasi, jalankan biner Phase 4A dengan skema aditif tetap terpasang agar titik yang sudah tersimpan tetap tersedia untuk upgrade ulang. Untuk pemulihan basis data, validasi backup di skema terpisah sebelum cutover dan rekonsiliasi penulisan yang terjadi sejak backup. Hindari drop kolom untuk rollback aplikasi. [MariaDB ALTER TABLE](https://mariadb.com/docs/server/reference/sql-statements/data-definition/alter/alter-table)

## Uji fixture

Gunakan MariaDB 10.4.32 pada datadir dan port fixture. Panduan Phase 1 menjelaskan konfigurasi `SAMPIRA_TEST_MYSQL`, `SAMPIRA_TEST_BIN`, `SAMPIRA_TEST_INIT`, dan opsi Chromium. Biner harus dibangun dari working tree backend yang diuji. [Panduan fixture Phase 1](../phase-01-operations.md#pengujian-terisolasi)

```powershell
$env:SAMPIRA_TEST_PHASE3 = '1'
$env:SAMPIRA_TEST_PHASE4 = '1'
$env:SAMPIRA_TEST_PHASE5 = '1'
node scripts/check-phase1-migration.mjs
```

Skrip Phase 5A merekonstruksi bentuk dump sebelum 004 dari fixture sintetis yang sudah berisi data Phase 4, memulihkannya ke `sampira_phase5_upgrade`, lalu memeriksa replay, data lama, relasi, indeks, dan constraint. Untuk uji lintas branch, pakai fixture baru, build BE, lalu sajikan `app` dan `assets` dari arsip FE. Jalankan `check-phase1-browser.mjs` dan dua skrip browser dari arsip yang sama dengan `SAMPIRA_TEST_PHASE3_FE=1` dan `SAMPIRA_TEST_PHASE4_FE=1`. Kosongkan flag mutasi backend Phase 3/4/5 pada fixture browser lintas branch supaya jumlah data awal sesuai skenario UI.

## Risiko integrasi

Perbedaan enam dan tujuh desimal, urutan koordinat Leaflet versus GeoJSON, titik nol, dan semantik pengosongan saat revisi perlu dites di UI. Phase 5B juga perlu menguji izin perangkat, asal manual, pengalihan tugas saat detail terbuka, route snapping, hasil tanpa rute, kuota provider, dan kondisi tile offline. Pengujian routing nyata dan E2E antarmuka peta baru merupakan bagian Phase 5B.
