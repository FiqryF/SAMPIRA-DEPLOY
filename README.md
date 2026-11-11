# SAMPIRA

**Laporkan Sampah, Pantau Perubahannya.**

SAMPIRA adalah aplikasi web pengelolaan sampah untuk masyarakat, Petugas, Admin, dan Administrator. Layanannya mencakup penjemputan sampah terpilah, pelaporan fasilitas bermasalah, konfirmasi warga terdampak, edukasi lingkungan, serta pencatatan reward dan poin kontribusi.

README ini menjelaskan implementasi pada source repository. Server yang masih memakai executable lama perlu dibuild atau dijalankan ulang agar perubahan Backend berlaku.

## Fitur dan akses setiap role

| Role | Halaman | Fitur utama |
| --- | --- | --- |
| Masyarakat (`user`) | `/dashboard` | Pengajuan pickup, laporan fasilitas, konfirmasi terdampak, riwayat dan detail progres, Reward Saya, Poin & Voucher, edukasi, pengaturan akun. |
| Petugas (`petugas`) | `/petugas` | Klaim pickup, pickup aktif, lokasi penjemputan, pembaruan status, penimbangan, riwayat misi, komisi, dan tugas fasilitas dari Admin. |
| Admin (`admin`) | `/admin` | Ringkasan operasional, verifikasi dan penugasan fasilitas, pemeriksaan hasil Petugas, monitoring peta, statistik, serta CMS artikel edukasi. |
| Administrator (`administrator`) | `/administrator` | Dashboard sistem, status aktif akun, katalog dan stok voucher, monitoring penukaran, pencatatan pembayaran reward, statistik, sebaran fasilitas, dan pengumuman. |

Role Admin dan Administrator mempunyai kewenangan berbeda. Administrator tidak otomatis mendapat akses ke verifikasi fasilitas milik Admin. **Perubahan role akun melalui halaman Administrator dinonaktifkan**; pengelolaan status aktif akun tetap mengikuti validasi dan kewenangan Backend.

Halaman publik meliputi Landing Page, Login, Registrasi, dan [Pusat Edukasi](assets/education.html). Registrasi publik hanya membuat akun Masyarakat. Logout memakai popup konfirmasi; setelah login berhasil, popup selamat datang muncul sekali pada sesi tab tersebut.

## Alur layanan

### Penjemputan sampah

1. User memilih satu atau beberapa kategori dalam **satu permintaan**, lalu mengisi rincian berat masing-masing kategori.
2. User menentukan titik pada peta, memeriksa alamat, mengisi kontak, dan menambahkan foto jika diperlukan. Foto dapat dipilih dari perangkat atau diambil melalui kamera yang didukung browser.
3. Estimasi nilai sampah, biaya proses, dan reward dihitung berdasarkan kategori serta berat perkiraan.
4. Petugas mengambil tugas dan memperbarui perjalanan: **Menunggu → Petugas ditugaskan → Menuju hub → Tiba di hub**.
5. Petugas mencatat berat aktual. Penjemputan selesai dan kewajiban reward dicatat sesuai hasil verifikasi; poin kontribusi diberikan mengikuti aturan Backend.
6. Administrator mencatat pembayaran reward yang benar-benar sudah dilakukan di luar aplikasi, dengan nominal, referensi, dan bukti yang valid.

**Estimasi bukan nilai pembayaran final.** Pickup selesai tidak berarti reward sudah dibayar. User melihat status pembayaran berdasarkan transaksi Backend. SAMPIRA mencatat pembayaran manual, bukan mengirim uang melalui payment gateway.

Kategori tersedia: organik, plastik PET, kertas/kardus, besi, kaca, gadget kecil, komputer, elektronik besar, baterai, serta B3 rumah tangga. Tarif dan batas kategori dijelaskan pada [panduan kategori sampah](docs/waste-categories.md).

### Pelaporan fasilitas

1. User mengisi kategori, judul, deskripsi, lokasi, alamat, dan foto opsional.
2. Warga lain dapat membuka **Laporan fasilitas warga**, melihat detail fasilitas, dan memilih **Saya juga terdampak** agar tidak perlu membuat laporan yang sama.
3. Admin memeriksa laporan, memilih Petugas, lalu menekan **Setujui dan tugaskan**. Jika belum layak, Admin dapat meminta perbaikan atau menolak dengan alasan.
4. Petugas memilih **Mulai menangani**, lalu **Kirim hasil pekerjaan** berisi penjelasan hasil dan foto opsional. Kendala serta pencatatan koordinasi tersedia melalui opsi tambahan.
5. Admin memeriksa hasil, meminta perbaikan bila diperlukan, atau memilih **Selesaikan laporan**. Ringkasan publik dan foto yang dipilih tersedia bagi pelapor.

Persetujuan dan penugasan gabungan disimpan dalam satu transaksi. Status verifikasi terpisah dari status penanganan: **disetujui belum berarti selesai**. Petugas hanya dapat mengubah tugas yang menjadi penugasannya.

Jumlah terdampak dihitung per akun, termasuk pelapor, dan tampil pada data Admin/Petugas. Konfirmasi warga tidak menggantikan pemeriksaan Admin. Revisi isi laporan mereset konfirmasi terdampak sebelumnya; laporan selesai tidak menerima konfirmasi baru.

Detail komunitas membagikan isi, alamat, koordinat, dan foto laporan kepada User lain, tanpa identitas pelapor atau catatan internal. Hindari memasukkan data pribadi ke deskripsi maupun foto yang dibagikan.

### Reward, poin, dan voucher

- **Reward Saya:** nilai berdasarkan berat terverifikasi, keterangan transaksi, serta status pencatatan pembayaran.
- **Poin & Voucher:** saldo poin, total kontribusi, level/badge, katalog, penukaran, Voucher Saya, dan riwayat.
- Penukaran memeriksa saldo, stok, masa berlaku, serta idempotency. Perubahan saldo dan stok mengikuti transaksi Backend.
- **Voucher masih simulasi dan tidak berlaku pada merchant nyata.** Poin bukan saldo uang dan tidak dapat dikonversi langsung menjadi uang.
- Estimasi kontribusi CO₂ merupakan simulasi; bukan pengukuran emisi lapangan.

### Edukasi dan statistik

Admin dapat membuat, mengedit, menerbitkan, dan mengarsipkan artikel melalui CMS Edukasi. Foto artikel dapat memakai upload perangkat atau tautan internet yang didukung. Artikel terbit tersedia pada halaman edukasi dan bagian artikel di Landing Page.

Dashboard menggabungkan statistik operasional dari API dengan dataset statis Bandung yang diberi konteks sumber, periode, dan satuan. UI dataset menampilkan produksi sampah serta capaian penanganan; data anggota bank sampah Coblong tidak ditampilkan pada UI saat ini. Sumber CSV/PDF tetap disimpan di `data/datasets/`, sedangkan frontend menggunakan `assets/data/bandung-waste.json`.

Dataset kota bukan data transaksi SAMPIRA dan tidak mempunyai koordinat fasilitas. Jangan menganggapnya sebagai lokasi/hotspot laporan. Perbedaan satuan pada metadata produksi dijelaskan pada [catatan dataset](data/datasets/README.md).

## Teknologi dan kebutuhan

| Bagian | Teknologi |
| --- | --- |
| Backend | Go 1.24.6, `net/http`, routing native |
| Database | MySQL/MariaDB; lingkungan lokal diuji dengan MariaDB XAMPP |
| Akses database | `github.com/go-sql-driver/mysql` |
| Autentikasi | Password bcrypt, token bertanda tangan HMAC-SHA256, sesi yang dapat dicabut, cookie HttpOnly |
| Frontend | HTML, CSS, JavaScript tanpa framework frontend |
| Visualisasi | Leaflet, Chart.js, serta grafik SVG pada komponen terkait |
| Dialog | Dialog HTML native dengan CSS SAMPIRA; SweetAlert2 pada fitur existing tertentu |

Siapkan Go sesuai `go.mod`, MySQL/MariaDB, Git, dan browser modern. Tidak ada langkah `npm install` untuk menjalankan aplikasi. XAMPP dapat digunakan untuk database; server web aplikasi dijalankan oleh Go, sehingga Apache tidak wajib.

Library CDN, tile peta OpenStreetMap, pencarian/reverse alamat Photon, dan gambar dari internet memerlukan koneksi jaringan. Akses lokasi/kamera memerlukan izin browser; gunakan localhost atau HTTPS. Peta menampilkan titik data yang tersedia, bukan pelacakan GPS Petugas secara langsung. Petunjuk arah eksternal dapat dibuka melalui Google Maps.

## Menjalankan di komputer baru

Jalankan perintah dari folder yang berisi `go.mod`.

### 1. Ambil source dan dependensi

```sh
git clone https://github.com/azitriyadi/SAMPIRA.git
cd SAMPIRA
go mod download
```

Jika folder proyek sudah tersedia, cukup buka terminal di folder tersebut dan unduh dependensi Go.

### 2. Jalankan database dan siapkan `.env`

Aktifkan MySQL/MariaDB. Pada PowerShell:

```powershell
Copy-Item .env.example .env
```

Untuk Git Bash/Linux/macOS, gunakan `cp .env.example .env`. Salin hanya jika `.env` belum ada agar konfigurasi lokal tidak tertimpa.

Isi konfigurasi database dan secret pada `.env`:

```env
DB_HOST=127.0.0.1:3306
DB_USER=root
DB_PASS=
DB_NAME=ecorecycle
JWT_SECRET=
PORT=8080
SAMPIRA_LISTEN_HOST=127.0.0.1
SAMPIRA_SECURE_COOKIE=false
SAMPIRA_INITIAL_USER_PASSWORD=
SAMPIRA_INITIAL_PETUGAS_PASSWORD=
SAMPIRA_INITIAL_ADMIN_PASSWORD=
SAMPIRA_INITIAL_ADMINISTRATOR_PASSWORD=
```

`JWT_SECRET` wajib berupa secret acak minimal 32 byte. Contoh membuat nilai acak melalui PowerShell, lalu salin hasilnya ke `.env` secara privat:

```powershell
$secretBytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($secretBytes)
[Convert]::ToBase64String($secretBytes)
$rng.Dispose()
```

Sesuaikan `DB_USER` dan `DB_PASS` dengan database setempat. Gunakan `SAMPIRA_SECURE_COOKIE=true` untuk aplikasi HTTPS. Jangan commit `.env`, secret, atau hasil terminal yang berisi password.

### 3. Inisialisasi khusus database baru

```sh
go run ./db_init
```

Initializer membuat database, tabel dasar, kategori sampah, serta akun demo untuk semua role:

| Role | Email | Password |
| --- | --- | --- |
| User | `user@eco.com` | Acak; ditampilkan setelah inisialisasi berhasil |
| Petugas | `petugas@eco.com` | Acak; ditampilkan setelah inisialisasi berhasil |
| Admin | `admin@eco.com` | Acak; ditampilkan setelah inisialisasi berhasil |
| Administrator | `administrator@eco.com` | Acak; ditampilkan setelah inisialisasi berhasil |

Password disimpan sebagai hash bcrypt. Jika ingin memilih password sendiri, isi variabel `SAMPIRA_INITIAL_USER_PASSWORD`, `SAMPIRA_INITIAL_PETUGAS_PASSWORD`, `SAMPIRA_INITIAL_ADMIN_PASSWORD`, dan `SAMPIRA_INITIAL_ADMINISTRATOR_PASSWORD` sebelum inisialisasi; panjang masing-masing 15–72 byte. Nilai kosong menghasilkan password acak yang berbeda untuk setiap akun dan password tersebut ditampilkan sekali di terminal.

**Jangan membuat database kosong secara manual sebelum menjalankan initializer.** Initializer menggunakan `CREATE DATABASE` dan menolak nama database yang sudah ada. Simpan password awal secara privat; jangan menjalankannya pada database utama yang telah berisi data.

Akun Petugas tidak dibuat otomatis. Provisioning akun Petugas dilakukan operator database yang berwenang sesuai [panduan operasi](docs/phase-01-operations.md). Registrasi User tidak dapat digunakan untuk membuat role istimewa.

### 4. Jalankan server

```sh
go run ./cmd/server
```

Startup menyiapkan/memeriksa skema sesi dan fitur lanjutan, termasuk fasilitas, edukasi, lokasi, pickup, reward, poin, serta voucher. Akun database perlu izin DDL yang sesuai pada skema aplikasi.

| Halaman | URL lokal |
| --- | --- |
| Landing Page | http://localhost:8080/ |
| Login | http://localhost:8080/login |
| Registrasi | http://localhost:8080/register |
| Masyarakat | http://localhost:8080/dashboard |
| Petugas | http://localhost:8080/petugas |
| Admin | http://localhost:8080/admin |
| Administrator | http://localhost:8080/administrator |
| Edukasi publik | http://localhost:8080/assets/education.html |
| Swagger | http://localhost:8080/swagger |

Portal memerlukan login sesuai role. Ubah `PORT` jika 8080 sudah digunakan; seluruh view, aset, dan API harus diakses melalui satu origin yang sama agar sesi cookie bekerja.

### 5. Hentikan, perbarui, atau build

Tekan **Ctrl+C** pada terminal server untuk menghentikannya. Perubahan Go membutuhkan server dijalankan ulang; perubahan HTML/CSS/JS dapat dimuat dengan **Ctrl+F5**. Pastikan file yang diedit berasal dari checkout yang sedang disajikan server.

Untuk membuat executable Windows dari source saat ini:

```powershell
go build -o sampira.exe ./cmd/server
.\sampira.exe
```

Jalankan executable dari root proyek agar folder view, aset, dan `.env` terbaca. Jangan menjalankan `go run` dan executable bersamaan pada port yang sama. Tidak perlu memakai executable lama dari komputer lain.

## Database existing dan keamanan data

- **Jangan hapus/reset database lama dan jangan gunakan `db_init` untuk menambah akun ke database existing.**
- Buat backup database dan `uploads/` sebelum upgrade. Uji perubahan pada fixture/clone terlebih dahulu.
- Tinjau migrasi dalam `db_init/migrations/` sebelum menjalankan versi Backend baru, karena startup dapat mengubah skema. Migrasi empat role untuk instalasi lama dijelaskan pada [panduan operasi](docs/phase-01-operations.md#migrasi-database-yang-sudah-ada).
- Seed akun awal hanya untuk database baru. Untuk database lama yang belum memiliki Administrator, gunakan [bootstrap Administrator](docs/phase-01-operations.md#bootstrap-administrator); bukan menjalankan ulang initializer.
- Dokumen phase lama merekam kondisi saat fase tersebut dikerjakan. Gunakan source dan kontrak terbaru untuk menilai perilaku saat ini.
- Backup data tidak otomatis menyertakan gambar lokal yang hanya tersedia melalui `uploads/`. Simpan keduanya.

## Pengujian dan troubleshooting

Tes Go dapat dijalankan dari root:

```sh
go test ./...
```

Gunakan database fixture terisolasi untuk pengujian transaksi, migrasi, upload, dan alur lintas role. Jangan menguji pembayaran atau perubahan data palsu pada database utama. Tes Go saja tidak membuktikan seluruh UI telah lulus pengujian browser.

| Kendala | Pemeriksaan |
| --- | --- |
| Gagal terhubung ke database | Pastikan layanan database aktif serta host, port, user, password, dan nama database benar. |
| Secret tidak valid | Isi `JWT_SECRET` acak minimal 32 byte; jangan membiarkannya kosong. |
| Database sudah ada saat init | Jangan menghapusnya. Gunakan database baru yang berbeda, atau ikuti prosedur upgrade database existing. |
| Halaman berubah tetapi API menolak field baru | Periksa apakah executable/`go run` yang aktif sudah memakai Backend terbaru. |
| Port sudah digunakan | Identifikasi proses pemilik port sebelum menghentikannya, atau gunakan `PORT` lain. |
| Foto gagal dikirim | Periksa pesan validasi, ukuran/format foto, dan kapasitas `max_allowed_packet` MariaDB; jangan mengubah status transaksi secara manual. |
| Peta/alamat tidak termuat | Periksa koneksi internet, layanan tile/Photon, izin browser, dan pesan error halaman. |
| Login tertolak | Pastikan akun aktif, role sesuai portal, dan kredensial berasal dari instalasi/database yang benar. |

## Struktur proyek

```text
SAMPIRA/
├── app/Views/          # Halaman publik dan portal empat role
├── assets/
│   ├── css/            # Tema dan komponen UI
│   ├── js/             # Interaksi form, peta, CMS, reward, dan dashboard
│   ├── img/            # Gambar, ikon, dan ilustrasi
│   ├── data/           # Agregat dataset untuk frontend
│   └── education.html  # Daftar/detail artikel publik
├── cmd/server/         # Entry point HTTP dan bootstrap Administrator
├── db_init/
│   ├── db_init.go      # Inisialisasi database baru dan akun awal
│   └── migrations/     # Migrasi fitur aplikasi
├── data/datasets/      # Sumber CSV dan metadata dataset
├── docs/
│   ├── content/        # Konten dan instruksi integrasi edukasi
│   ├── progress/       # Laporan pengembangan dan pengujian
│   ├── openapi.json    # Dokumentasi endpoint
│   └── swagger.html    # Swagger UI
├── internal/           # Handler, middleware, model, repository, service
├── uploads/            # Media lokal; tidak dipush
├── .env.example        # Template konfigurasi tanpa secret
├── .gitignore
├── go.mod
├── go.sum
└── README.md
```

Folder `scripts/` sudah tidak menjadi bagian repository. Jangan mengikuti perintah `scripts/...` dari laporan historis tanpa memeriksa keberadaan alatnya.

## Berkas yang dibagikan

Push source, migrasi, aset aplikasi, dokumentasi, `.env.example`, `go.mod`, dan `go.sum`. Jangan push `.env`, password/secret, upload pengguna, backup database, log runtime, atau executable hasil build.

`.gitignore` tidak menghentikan pelacakan file yang sudah terlanjur masuk Git. Jika log masih dilacak, periksa lalu keluarkan dari index tanpa menghapus file lokal:

```sh
git rm --cached -- server.out.log server.err.log
```

Jangan menghapus `uploads/` atau gambar yang masih dirujuk data aplikasi hanya untuk membersihkan folder.

## Dokumentasi lanjutan

- [Panduan operasi, role, dan bootstrap](docs/phase-01-operations.md)
- [Kategori dan asumsi tarif sampah](docs/waste-categories.md)
- [Kontrak API fasilitas](docs/progress/PHASE_04_API_CONTRACT.md)
- [Kontrak API lokasi dan peta](docs/progress/PHASE_05_API_CONTRACT.md)
- [Kontrak API edukasi](docs/progress/PHASE_06_API_CONTRACT.md)
- [Reward, poin, voucher, dan integrasi Phase 9](docs/progress/PHASE_09.md)
- [Audit dan pengujian Phase 10](docs/progress/PHASE_10.md)
- [Sumber serta keterbatasan dataset](data/datasets/README.md)
