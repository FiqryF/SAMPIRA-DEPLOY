# SAMPIRA Phase 6B.3 — Portal Warga

## Pemetaan referensi sebelum implementasi

Penomoran mengikuti brief. Gambar 1 berarti kolase alur inti (`…12_13_11 AM-1.png`), sedangkan Gambar 2 berarti kolase layar pendukung (`…12_13_13 AM-2.png`).

| Gambar / layar | Permukaan | Source awal | Kontrak yang tersedia |
| --- | --- | --- | --- |
| 1 / 1 | Beranda dan peta | `dashboard.html`, `dashboard.js`, `user-map.js` | `GET /list_pickups?type=user`, `GET /facility-reports`, profil |
| 1 / 2 | Ajukan penjemputan | Form pickup dan picker Phase 5B | `POST /request_pickup`, `POST /update_pickup`, estimasi reward |
| 1 / 3 | Lapor fasilitas | `facility-report-form.js`, `facility-reports.js` | Multipart `POST /facility-reports`, revisi `PUT /facility-reports/{id}` |
| 1 / 4 | Detail dan progres | `facility-report-ui.js`, `facility-handling.js`, pelacakan pickup | Detail, histori, penanganan publik dan bukti sesuai izin |
| 2 / 1 | Riwayat | Tabel pickup dan daftar fasilitas terpisah | Array pickup lengkap, cursor laporan dan filter eksak |
| 2 / 2 | Pelacakan pickup | `dashboard.js`, `user-map.js` | `GET /pickup_status?tracking_number=…`, titik tujuan dan histori |
| 2 / 3 | Edukasi | `education.js`, `assets/education.html` | Daftar publik dengan kategori, pencarian, halaman dan detail slug |
| 2 / 4 | Feedback | Audit rute dan handler Go | Endpoint feedback tidak ditemukan |
| 2 / 5 | Pengaturan | Form dashboard dan `profile.html` | `GET /api/user/profile`, `POST /api/user/profile` |
| Tambahan | Edit/batal, reward, revisi, bukti dan navigasi | Form, dialog dan modul Phase 3–5 | Izin pemilik, status pending, versi, koordinat dan sesi yang sudah berlaku |

Path pickup, laporan dan edukasi pada tabel berada di bawah `/api/ecorecycle`.

## Implementasi dan integrasi

- Branch `FE` digunakan untuk tampilan. Aset dan template portal lain dari pekerjaan sebelumnya tetap berada di working tree. Integrasi menggunakan executable Go dari `BE` Phase 6A dan API lama pada origin yang sama. Perubahan fase ini tidak memerlukan Go, konfigurasi produksi, migrasi, atau perubahan skema.
- `app/Views/dashboard.html`, `assets/css/user-workspace.css`, dan `assets/js/sampira-navigation.js` membentuk shell Warga. Sidebar, top bar kontekstual, drawer, navigasi bawah dan tombol cepat membuka tampilan yang sama. Hero menggunakan ilustrasi Bandung yang sudah dipakai pada autentikasi. Gaya visual merujuk palet, kepadatan, dan hierarki dari kedua gambar.
- `assets/js/user-activity.js` menampilkan penjemputan dari daftar milik Warga dan laporan dari endpoint pemilik. Leaflet memuat peta jalan OpenStreetMap dan memperlihatkan koordinat tersimpan dengan marker truk hijau dan peringatan jingga. Titik yang berdekatan pada skala peta saat ini berbagi popup dan dipecah lagi saat zoom memungkinkan. Peta menyesuaikan batas titik saat layout berubah. Daftar alamat dan detail tetap dapat dibuka saat koordinat atau tile tidak tersedia. Daftar laporan memakai cursor. Tanda `+` pada ringkasan menandai masih ada halaman laporan. Peta dan daftar privat dibersihkan ketika sesi berakhir.
- `assets/js/dashboard.js` membagi penjemputan menjadi data permintaan, lokasi, dan konfirmasi. Field request, kategori, tarif, validasi, simpan titik yang dikonfirmasi, foto opsional, edit dan pembatalan tetap memakai alur API yang ada. Riwayat penjemputan menyediakan filter status dan kategori serta paginasi lokal dari daftar yang sudah diotorisasi. Perhitungan ringkasan menggunakan data yang sama.
- `assets/js/facility-reports.js` dan `facility-report-form.js` menata alur buat laporan, daftar terfilter, detail dan revisi. Histori verifikasi, penanganan publik dan bukti mengikuti respons API yang sudah tersaring. Pelacakan penjemputan menampilkan tujuan dan timeline status tersimpan.
- `assets/js/education.js` menyediakan daftar, pencarian, kategori dan paginasi dari API Phase 6A. Tautan detail menuju halaman publik yang dapat dibuka tanpa login. Pengaturan memakai endpoint `GET /api/user/profile` dan `POST /api/user/profile` untuk profil, kontak, alamat dan payout.
- Skill `frontend-design`, `ui-taste` dan `ponytail` diterapkan pada hierarki peta dan aktivitas, desain responsif dan penggunaan ulang komponen. Verifikasi memakai Chromium serta pemeriksaan runtime lokal.

## Batas kontrak yang memengaruhi tampilan

| Referensi | Penyesuaian |
| --- | --- |
| Gambar 1 / 2 | Satu kategori sesuai kontrak, estimasi dalam kg, lokasi presisi opsional setelah pengguna memilih titik. |
| Gambar 1 / 3 | Satu foto opsional dan alamat wajib sesuai kontrak. Aksi simpan draf dan unggahan banyak foto memerlukan dukungan Backend. |
| Gambar 2 / 2 | Peta memakai tujuan penjemputan. GPS kendaraan, ETA langsung dan kontak petugas seperti pada mockup belum tersedia melalui API Warga. |
| Gambar 2 / 3 | Daftar memakai metadata artikel terbit. Jumlah pembaca dan gambar sampul per artikel belum tersedia. |
| Gambar 2 / 4 | Feedback terpisah belum memiliki endpoint. Menu dan formulir pengiriman ditunda sampai kontrak tersedia. |
| Gambar 2 / 5 | Profil dan payout didukung. Unggah avatar, preferensi privasi, notifikasi dan kata sandi belum tersedia pada pengaturan Warga. |
| Shell | Top bar memakai judul konteks dan profil. Pencarian tersedia pada Edukasi dan Pelacakan. |

## Runtime lokal

- `http://localhost:8080/dashboard` memakai proses PID 30696 dari `BE 42bfc3f` dengan clone pengembangan MariaDB `127.0.0.1:24369/ecorecycle`. Junction `app` dan `assets` menunjuk ke working tree `FE`.
- HTTP 200 dan SHA-256 cocok untuk `user-workspace.css`, `user-activity.js`, dan `dashboard.js`. Tanpa sesi, `/dashboard` mengembalikan 303 menuju `/login`, dan API fasilitas mengembalikan 401.
- Pemeriksaan tab Chrome di sesi lokal terhenti karena alat browser tidak dapat menentukan URL tab Windows. Validasi layar terautentikasi dan screenshot memakai data sintetis pada fixture terisolasi. Tidak ada penulisan ke database runtime lokal.

## Verifikasi dan screenshot

Uji baseline dijalankan sebelum perubahan. Fixture mengekspor `BE` Phase 6A dan menyajikan aset dan tampilan `FE` pada origin yang sama di port 24934. Database MariaDB pengujian berjalan terpisah di port 24367 dan mencakup migrasi sampai 005. Login dan pengujian tulis memakai akun sintetis.

- **Lulus** regresi migrasi, autentikasi, pembatasan akses antar-role, reward dan pembayaran, penanganan fasilitas dan edukasi dari Phase 1–6. Pengujian Browser Phase 3–5 mencakup pembuatan, edit dan revisi, persistensi koordinat pickup dan laporan, serta akses bukti.
- **Lulus** Phase 6B.3 di Chromium. Marker milik akun uji membuka detail fasilitas dan penjemputan. Form mencegah maju ketika data wajib kosong. Kedua riwayat, timeline, pencarian artikel dan detail publik, simpan profil, logout dan pembersihan data peta berjalan. Suite selesai tanpa exception JavaScript atau error console aplikasi.
- Delapan lebar diuji pada tiap layar yang tersedia, dari 320 hingga 1440 px. QA visual menemukan marker berdekatan yang menutup satu sama lain dan tabel riwayat sempit yang memerlukan geser horizontal. Hasil akhir memakai marker gabungan sesuai skala dan kartu riwayat pada layar sempit.
- 18 screenshot desktop dan mobile diambil dari fixture. Gambar membandingkan hierarki, kepadatan dan posisi komponen dengan kolase. Isi screenshot mengikuti data yang tersedia dari API.

| Gambar / layar | Elemen yang diperiksa | Screenshot Chromium |
| --- | --- | --- |
| 1 / 1 | Hero personal, empat ringkasan, aksi cepat, dua jenis titik dan detail melalui popup | `01-beranda-1440.png`, `01-beranda-390.png` |
| 1 / 2 | Indikator tiga langkah, kategori dan panduan, validasi serta simpan koordinat | `02-penjemputan-1440.png`, `02-penjemputan-390.png` |
| 1 / 3 | Field laporan, kotak foto tunggal, alamat dan pemilih titik | `03-lapor-fasilitas-1440.png`, `03-lapor-fasilitas-390.png` |
| 1 / 4 | Nomor, status, detail, alamat, foto dan bagian perkembangan yang diizinkan | `04-detail-laporan-1440.png`, `04-detail-laporan-390.png` |
| 2 / 1 | Dua riwayat, filter, status, detail dan kartu penjemputan untuk layar sempit | `05-riwayat-penjemputan-{1440,390}.png`, `05-riwayat-fasilitas-{1440,390}.png` |
| 2 / 2 | Peta tujuan dan riwayat status berwaktu | `06-pelacakan-1440.png`, `06-pelacakan-390.png` |
| 2 / 3 | Pencarian, kategori, kartu artikel terbit dan detail publik | `07-edukasi-1440.png`, `07-edukasi-390.png` |
| 2 / 4 | Feedback menunggu kontrak Backend | Tidak berlaku |
| 2 / 5 | Profil, email hanya baca, kontak, payout, alamat dan simpan | `08-pengaturan-1440.png`, `08-pengaturan-390.png` |

Folder hasil pada mesin ini

```text
C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/user-6b3-fixture
```

Untuk mereproduksi pada PowerShell dari working tree `FE`

```powershell
$env:SAMPIRA_USER_SCREENSHOTS = Join-Path $env:TEMP 'sampira-user-6b3'
& ./scripts/check-phase6b-fixture.ps1
```
