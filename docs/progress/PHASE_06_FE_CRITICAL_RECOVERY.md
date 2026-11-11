# SAMPIRA Phase 6B — Implementasi dan pemulihan runtime lokal

## Penyebab dan perbaikan

Port 8080 dijalankan oleh PID `21708` dari `C:/Users/FIQRY FIRMANSYAH/AppData/Local/SAMPIRA-main/server.exe`. Launcher itu mencatat Backend `64be283` dan Frontend `d9ae426` dan menggunakan working directory `SAMPIRA-main/runtime`. Folder `app` dan `assets` di situ adalah salinan, sehingga perubahan di checkout aktif `FE` tidak sampai ke browser. Respons HTTP 200 sebelum perbaikan masih memiliki judul `EcoRecycle — Barang lama. Manfaat baru.` dan SHA-256 `59DD569B7D72BEB3A32D4C48D74763D3F0F4E153FC464F9FE736C917B75CD7AB`. Pemeriksaan awal dalam sandbox tidak melihat listener. Pemeriksaan pada host menemukan proses aktif dan mengonfirmasi isi yang disajikan.

Backend `42bfc3f8bb0c910cc76ddbce8095342a378028de` dibangun dari `git archive BE`. Kandidat diuji pada 18082, lalu PID lama dihentikan melalui launcher yang memverifikasi executable dan waktu mulai proses. Runtime pengganti aktif pada [http://localhost:8080](http://localhost:8080).

| Komponen | Runtime pengganti |
| --- | --- |
| Aplikasi Go | PID `30696` saat verifikasi. Executable `builds/42bfc3f8bb0c910cc76ddbce8095342a378028de/server.exe` di bawah direktori runtime lokal. |
| Working directory Go | `SAMPIRA-Phase6B-Live/runtime` di bawah direktori artefak. |
| View | Junction `runtime/app` menuju `C:/xampp/htdocs/tubes/app`. Go membaca file dari `app/Views`. |
| CSS, JS, gambar dan Edukasi | Junction `runtime/assets` menuju `C:/xampp/htdocs/tubes/assets`. |
| Database lokal aplikasi | `127.0.0.1:24369/ecorecycle`, MariaDB PID `14168` saat verifikasi. Snapshot logis dari database lokal. Backend menjalankan migrasi 005 pada salinan itu. |
| Database utama | MariaDB port `3306`, PID `6180` sebelum dan sesudah penggantian. Ekspor memakai transaksi baca-saja. |
| Upload | Salinan lokal di `runtime/uploads`. Operasi pada 8080 memakai database dan unggahan salinan. |

Chrome dan klien HTTP membuktikan `/`, `/home`, `/login`, `/register`, halaman Edukasi, CSS bersama, modul Edukasi dan Peta, serta logo dikirim dengan byte yang sama dengan FE. HTML landing setelah perbaikan berjudul `SAMPIRA | Kelola Sampah dari Rumah` dengan SHA-256 `CCD671F96D4BF9F68FCB4032BB3F8531AD2A8E4497F29EF3721D1B3BE46AA8A7`. CSS `sampira.css?v=phase6b-live` memakai SHA-256 `4DA30DE59C1B95A1BCEDBAA4430AF619D766A6437344D1591B8D5352664093B4`. HTML publik dan aset memberikan `Last-Modified`. Endpoint Edukasi mengirim `Cache-Control: no-store`. Endpoint fasilitas dan pengelolaan edukasi memberi 401 JSON tanpa sesi. Sesi Administrator asli membuka halaman terlindungi yang juga cocok byte demi byte dengan FE.

## Audit source dan tampilan

Branch aktif `FE` pada baseline `d9ae426`. Perubahan Phase 6B berada pada working tree. Penelusuran teks menemukan merek lama pada baseline landing, auth, profil dan portal. Sisa slogan lama pada login dan footer autentikasi serta label profil warga dibersihkan pada recovery. Path teknis `/api/ecorecycle` dipakai sesuai kontrak. Template `auth.html` adalah artefak legacy tanpa route Go. Halaman autentikasi yang disajikan adalah `login.html` dan `register.html`.

| Permukaan | Audit sebelum pemulihan | Tampilan FE aktif sekarang |
| --- | --- | --- |
| Landing `/`, `/home` | Source baru tersimpan. Runtime lama masih menampilkan merek dan hero EcoRecycle. | Hero bergambar, empat layanan, alur pickup dan fasilitas, estimasi reward, artikel, dan FAQ. |
| Login, registrasi | Source sudah berubah, runtime lama memakai salinan. Slogan lama masih ada pada source FE. | Judul, logo, tautan akun, status formulir, dan copy SAMPIRA. |
| Edukasi dan detail | Route aset baru hanya ada pada source FE terbaru. | Daftar, pencarian, kategori, pagination, detail dan sumber HTTPS. Keadaan kosong mengikuti API. |
| Warga `/dashboard` | Shell, navigasi dan akses cepat sudah berubah, tetapi runtime lama tidak membacanya. | Beranda, pengajuan dan edit pickup, tracking, reward dan laporan memakai komponen bersama. Form dan picker tetap memakai workflow Backend. |
| Profil `/profile` | Sebagian source berubah. Badge lama masih diisi oleh JavaScript. | Logo SVG, header profil ringkas, panel data, tab yang dapat dijangkau keyboard dan label Warga. |
| Petugas `/petugas` | Shell dan peta baru tersimpan. Runtime lama memakai salinan. | Header dan logo, antrean, misi dan detail, tugas fasilitas, asesmen, progres, bukti, peta, rute dan profil. |
| Admin `/admin` | Navigasi konsol dan editor baru tersimpan. Runtime lama memakai salinan. | Ringkasan, verifikasi, penugasan, penanganan, validasi hasil, koordinasi, monitoring peta, dan editor edukasi. Detail dan tindakan memakai state Backend. |
| Administrator `/administrator` | Source sudah berubah. Runtime lama tidak memuat ringkasan Phase 6B. | Agregat aktual, pengumuman dengan tindakan berlabel dan pencatatan pembayaran manual. |

Perbaikan source recovery ada di template login, registrasi, profil, Petugas, versi stylesheet di semua halaman aktif, serta `assets/css/sampira.css`. Fase sebelumnya juga menambahkan modul `education.js`, `operations.js` dan `sampira-navigation.js`. Pemeriksaan `git diff --check` lulus. Source Go dan SQL tidak berubah.

## Sistem desain dan integrasi

Kolase referensi menjadi arah untuk hero ilustratif, permukaan putih, aksen hijau, navigasi bawah dan peta dengan daftar. Ilustrasi penjemputan yang tersedia dipakai kembali. Warna utama `#174c3c`, judul `#103d2f`, teks `#182c23`, teks sekunder `#4b6459`, permukaan `#fff`, latar `#f5f8f4`, batas `#d4e1d8`, dan fokus `#a84d00`. Kontrol utama setinggi minimal 44 px. Radius 8 px pada kontrol, 16 px pada kartu, dan 24 px pada hero. Layout menumpuk pada layar kecil, tabel editor punya daerah gulir sendiri, dan `prefers-reduced-motion` dihormati. Skill yang digunakan adalah `frontend-design`, `ui-taste`, dan `ponytail`.

- Artikel publik memakai `GET /api/ecorecycle/education/articles` dan `GET /api/ecorecycle/education/articles/{slug}`. Pembaca memakai `/assets/education.html` dan parameter `artikel`, `q`, `category`, dan `page`.
- Admin memakai `GET/POST /api/ecorecycle/education/manage/articles`, `GET/PUT .../{id}` dan `POST .../{id}/publication`. Mutasi memakai versi. Konflik memuat versi terbaru. Isi artikel dirender sebagai teks dan URL sumber harus HTTPS. Administrator mengelola pengumuman dan payout sesuai kontrak existing.
- Peta memakai daftar pickup klaim Petugas, laporan fasilitas, serta penanganan yang diizinkan API. Lokasi memakai koordinat yang tersedia. Daftar fasilitas mengikuti `next_before_id`. Ringkasan Admin merupakan cuplikan antrean, bukan total lintas halaman. Titik awal Petugas tinggal di memori halaman, dan detail tugas memeriksa ulang akses sebelum rute. Ubin berasal dari OpenStreetMap. Google Maps tersedia sebagai fallback.
- Administrator memperoleh agregat dari `pickup_status?type=stats`. Kontrak itu tidak menyediakan data deret waktu, titik privat, atau pengelolaan akun umum. Antarmuka tidak menampilkan data rekaan untuk mengisi kolase.

## Bukti pengujian

| Lingkungan dan role | Hasil |
| --- | --- |
| 8080, publik | Chromium menampilkan landing SAMPIRA, login, registrasi, dan Edukasi dengan respons API aktual. Landing lulus tanpa overflow pada 320, 390, 768, 1280 dan 1440 px. Tidak ada exception atau error konsol aplikasi pada pemeriksaan ini. |
| 8080, Administrator | Login akun lama, agregat, pengumuman, panel reward, penolakan pengelolaan artikel dan logout berhasil. |
| Fixture, Warga | Login/logout, registrasi, profil, pickup, lokasi, riwayat, tracking, reward, buat laporan, detail dan revisi lulus. |
| Fixture, Petugas | Login/logout, antrean, klaim, detail, status, penimbangan, asesmen, bukti, reassignment, GPS, peta operasional dan titik awal manual lulus. |
| Fixture, Admin | Login/logout, antrean verifikasi, penugasan, koordinasi, validasi, marker fasilitas dan pengelolaan artikel lulus. |
| Fixture, Administrator | Login/logout, pembatasan akses, publikasi pengumuman, statistik, dan alur bukti pembayaran lulus. |
| Fixture, Backend | Migrasi 005 pada salinan pre-005, rollback skenario konflik, isolasi role dan cookie, API Edukasi, serta regresi Phase 1–5 lulus. |

Fixture mengompilasi arsip BE yang sama dan memakai salinan file FE yang sedang dikerjakan. Ia menggunakan HTTP 24934 dan MariaDB 24367. Mutasi pengujian dilakukan di sana agar situs 8080 tetap menampilkan data lokal yang disalin. Login langsung pada 8080 untuk Warga, Petugas dan Admin belum dicoba dengan akun lama. Screenshot ketiga role tersebut berasal dari fixture. Detail artikel diuji dengan artikel uji di fixture karena snapshot lokal belum punya artikel terbit. Provider rute produksi, pembaca layar dan perangkat fisik belum diuji. Detail lama yang dipertahankan menerima komponen bersama, tetapi matriks screenshot belum mencakup setiap modal dan kombinasi ukuran.

## Screenshot

| Diambil dari | Bukti |
| --- | --- |
| 8080 | [Landing desktop](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/screenshots/landing-8080-1440.png>) · [Landing mobile](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/screenshots/landing-8080-390.png>) · [Login](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/screenshots/login-8080-390.png>) · [Register](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/screenshots/register-8080-390.png>) · [Edukasi](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/screenshots/edukasi-8080-1440.png>) · [Administrator](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/screenshots/administrator-8080-1440.png>) |
| Fixture | [Warga desktop](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/regression-screenshots/warga-1440.png>) · [Warga mobile](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/regression-screenshots/warga-390.png>) · [Petugas desktop](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/regression-screenshots/petugas-1440.png>) · [Petugas mobile](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/regression-screenshots/petugas-390.png>) · [Peta Petugas](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/regression-screenshots/petugas-map-390.png>) |
| Fixture | [Admin dan editor](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/regression-screenshots/admin-education-1440.png>) · [Peta Admin](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/regression-screenshots/admin-map-1440.png>) · [Detail artikel](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/regression-screenshots/education-detail-390.png>) |

## Menjalankan dan menghentikan server

Launcher menyimpan identitas proses dan memeriksa pemilik port sebelum menghentikan layanan. Jalankan dari PowerShell menggunakan PowerShell 7 bawaan Codex pada laptop ini.

```powershell
$ps7 = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe'
$launcher = 'C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/sampira-live.ps1'
& $ps7 -NoProfile -File $launcher Status
& $ps7 -NoProfile -File $launcher Start
# Saat selesai menggunakan server lokal
& $ps7 -NoProfile -File $launcher Stop
```

Perintah fixture untuk mengulang pengujian adalah `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/check-phase6b-fixture.ps1` dari checkout FE. Parameter `-MySqlBin`, `-Chrome`, dan `-Screenshots` tersedia. Dependensinya Git, Go, Node.js dengan WebSocket, Chromium dan MariaDB XAMPP. Sebelum integrasi ke lingkungan lain, periksa migrasi 005, penyedia rute, serta izin dan integritas data tujuan.

**Status akhir:** situs lokal memakai BE Phase 6A dan FE live pada 8080. Regresi lulus. Perubahan Git tetap lokal pada FE dan laporan Phase 6B dikonsolidasikan ke dokumen ini.
