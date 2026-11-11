# SAMPIRA Phase 5B — Perbaikan peta Admin dan Petugas

## Diagnosis

Baseline FE `d9ae426` diuji dengan Backend BE `90ad408` yang memuat Phase 5A. Pekerjaan dilakukan pada checkout FE terpisah dengan checkout utama tetap di BE.

- Chromium pada baseline Admin memuat Leaflet 1.9.4, menerima koordinat fasilitas dari API, dan membuat marker dengan pasangan yang tepat. Pengujian kemudian berhenti karena tidak ada tile jalan yang berhasil dimuat. Pemanggilan komponen detail belum mengaktifkan pemuatan tile otomatis, sehingga grid bertahan sampai tombol muat ditekan.
- Detail pickup dan tugas fasilitas Petugas sudah memanggil komponen bersama. Komponen membuat marker hanya jika kedua koordinat berisi angka finite dalam rentang. Audit baca saja pada database lokal menemukan satu laporan berkoordinat, tiga pickup aktif tanpa pasangan koordinat, dan nol tugas fasilitas aktif. Record tanpa titik memakai fallback alamat. Tugas fasilitas hanya tersedia setelah penugasan Admin sesuai izin.

## Perbaikan

| File | Perubahan |
|---|---|
| `assets/js/location-map.js` | Mengaktifkan opsi tile otomatis pada komponen detail bersama, mencegah permintaan lapisan tumpang tindih saat pemeriksaan akses, dan menyediakan coba lagi saat pemeriksaan atau tile gagal. Marker tetap tersedia saat tile gagal. |
| `assets/js/facility-reports.js` | Memuat peta pada detail verifikasi Admin. |
| `assets/js/facility-handling.js` | Memuat peta pada detail penanganan Admin dan tugas fasilitas Petugas. |
| `assets/js/collector.js` | Memuat peta pada detail pickup yang sudah diklaim. |
| `scripts/check-phase5-frontend.mjs` | Memeriksa tile aktual, marker, ukuran dan visibilitas panel, perpindahan menu, kegagalan tile, dan data tanpa titik. |

Komponen Leaflet, navigasi, dan fallback yang sudah ada dipakai kembali. Lokasi berasal dari `GET /api/ecorecycle/pickup_status?tracking_number=…`, `GET /api/ecorecycle/facility-reports/{id}`, dan `GET /api/ecorecycle/facility-reports/{id}/handling` sesuai role. Pickup menerima tujuh desimal dan fasilitas enam. Nol tetap valid. Saat detail berizin dibuka, viewport peta dasar dimuat dari OpenStreetMap. Petugas tetap memilih titik awal secara manual atau melalui geolocation yang dipicu tombol.

Provider rute produksi belum dikonfigurasi. Adapter OSRM tetap memakai geometri GeoJSON dari provider yang valid. Google Maps menerima tujuan setelah tindakan pengguna dan pemeriksaan akses. [Konfigurasi routing](PHASE_05_FE_INTEGRATION_NOTES.md#konfigurasi-rute-jalan)

## Verifikasi dan status

**PASS WITH NOTES.** Pengujian Chromium memakai Backend BE nyata, akun sintetis, dan MariaDB terisolasi.

| Skenario | Hasil |
|---|---|
| Admin | Tile OpenStreetMap berhasil dimuat pada verifikasi dan penanganan. Koordinat marker verifikasi cocok dengan pasangan dari API. Peta kembali tampil setelah berganti menu. Tile yang diblokir memunculkan coba lagi dan mempertahankan marker. Laporan tanpa koordinat memakai alamat dan pesan fallback. |
| Petugas pickup | Antrean tersamarkan. Setelah klaim, detail menampilkan tile dan marker. Titik awal manual dan GPS bekerja. Alamat menjadi fallback ketika koordinat kosong. |
| Petugas fasilitas | Penugasan berizin menampilkan tile, marker dan navigasi. Petugas lama kehilangan akses, marker, dan permintaan rute saat tugas dialihkan. |
| Routing | Unit adapter dan Chromium dengan respons simulasi lulus untuk GeoJSON, titik A/B, pembatalan, kegagalan dan URL Google Maps. Provider rute produksi berstatus **NOT CONFIGURED / NOT TESTED**. |
| Viewport | 1280, 768, 390, dan 320 px lulus pemeriksaan ukuran dan overflow panel. Screenshot Petugas pada 390 px menampilkan tile, atribusi, dan marker A/B. |
| Regresi | API Phase 1–2 dan Chromium Phase 1–5B lulus, mencakup empat role, pickup, timbang dan reward, laporan, verifikasi, penugasan, asesmen, unggahan bukti dan validasi hasil. |

Keempat aset JavaScript yang diuji juga dipasang pada salinan runtime lokal `localhost:8080`. Isi yang disajikan cocok dengan file di checkout FE. Pengujian mutasi hanya dilakukan di fixture. Record lama di database utama tetap memakai data asalnya. Checkout utama tetap BE dan perubahan FE tersedia di worktree terpisah.
