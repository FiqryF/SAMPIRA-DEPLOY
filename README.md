# SAMPIRA — Sampah, Informasi, Pelaporan, dan Respons Aksi

**Tagline:** *Laporkan Sampah, Pantau Perubahannya.*

SAMPIRA adalah aplikasi web untuk mengajukan dan melacak penjemputan sampah terpilah. Pengembangan selanjutnya mencakup pelaporan permasalahan sampah, pemantauan tindak lanjut, dan visualisasi data pengelolaan sampah.

Phase 1 mengamankan autentikasi dan akses ke portal Masyarakat, Petugas, Admin, serta Administrator. Lihat [panduan operasi](docs/phase-01-operations.md) dan [laporan verifikasi final](docs/progress/PHASE_01_FINAL_VERIFICATION.md).

Phase 2 mengintegrasikan pickup, timbang aktual, dan pencatatan pembayaran eksternal yang diverifikasi. Lihat [progres Phase 2](docs/progress/PHASE_02_PICKUP_WORKFLOW.md), [audit kumulatif](docs/progress/SAMPIRA_PHASE_01_02_COMPREHENSIVE_REPORT.md), dan [changelog](docs/progress/SAMPIRA_PHASE_01_02_CHANGELOG.md).

---

## 1. Tech Stack

Teknologi yang digunakan pada basis kode proyek saat ini adalah:

| Bagian | Teknologi | Kegunaan |
|---|---|---|
| Backend | Go (Golang) 1.24.6 | Menjalankan server HTTP, logika aplikasi, dan endpoint API. |
| API | Go `net/http` (routing native) | Menangani komunikasi request dan response antara frontend dan backend. |
| Database | MySQL / MariaDB | Menyimpan akun, kategori sampah, permintaan penjemputan, riwayat, transaksi, dan pengumuman. |
| Database Driver | `github.com/go-sql-driver/mysql` | Menghubungkan aplikasi Go dengan MySQL/MariaDB. |
| Password Security | `golang.org/x/crypto/bcrypt` | Melakukan hashing password pengguna. |
| Token Authentication | HMAC-SHA256 (implementasi internal proyek) | Menandatangani dan memvalidasi token autentikasi API. |
| Frontend | HTML5, CSS3, JavaScript (Vanilla) | Membangun halaman dan interaksi antarmuka tanpa framework frontend. |
| Charts | Chart.js | Menampilkan grafik pada dashboard. |
| Maps | Leaflet.js | Menampilkan peta pada halaman yang menggunakannya. |
| UI Notifications | SweetAlert2 | Menampilkan dialog konfirmasi, notifikasi, dan pesan interaksi. |

**Catatan:** Chart.js, Leaflet.js, dan SweetAlert2 dimuat melalui CDN dari halaman HTML. Proyek ini tidak menggunakan React, Vue, Laravel, Node.js, atau framework CSS seperti Bootstrap/Tailwind sebagai fondasi utama frontend.

---

## 2. Persyaratan Sistem

Pastikan perangkat pengembangan telah memiliki:

- Go versi **1.24.6** atau kompatibel dengan versi pada `go.mod`.
- MariaDB 10.4+ untuk lingkungan pengembangan yang dipakai dalam verifikasi Phase 1–2.
- Git untuk mengambil source code (jika proyek di-clone dari repository).
- Browser modern seperti Chrome, Firefox, atau Edge.

Contoh lingkungan lokal yang dapat digunakan adalah XAMPP untuk menjalankan MySQL/MariaDB.

---

## 3. Cara Menjalankan Project

Ikuti langkah berikut dari direktori utama repository SAMPIRA.

### 3.1. Clone Repository

Jika belum memiliki source code, clone repository:

```bash
git clone https://github.com/azitriyadi/SAMPIRA.git
cd SAMPIRA
```

Jika source code sudah tersedia di komputer, langsung buka terminal pada direktori utama proyek yang berisi `go.mod`.

### 3.2. Jalankan Database

1. Buka XAMPP Control Panel atau layanan database yang digunakan.
2. Jalankan MySQL/MariaDB.
3. Pastikan host dan port database sesuai konfigurasi lokal. Konfigurasi bawaan proyek menggunakan `localhost:3306`.

### 3.3. Konfigurasi Environment

Salin file `.env.example` menjadi `.env`.

Linux/macOS/Git Bash:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Sesuaikan isi `.env` dengan konfigurasi database lokal:

```env
DB_HOST=localhost
DB_USER=root
DB_PASS=
DB_NAME=ecorecycle

# Ganti dengan secret acak yang panjang dan jangan gunakan contoh ini untuk produksi.
JWT_SECRET=
SAMPIRA_LISTEN_HOST=127.0.0.1
SAMPIRA_SECURE_COOKIE=false
```

Keterangan:

- `DB_HOST`: host database. Dapat berisi host dan port, misalnya `127.0.0.1:3306`.
- `DB_USER`: username database.
- `DB_PASS`: password database.
- `DB_NAME`: nama database aplikasi. Nilai bawaan adalah `ecorecycle`.
- `JWT_SECRET`: secret acak minimal 32 byte untuk penandatanganan token autentikasi. Isi sebelum menjalankan server.
- `SAMPIRA_LISTEN_HOST` membatasi alamat dengar server. Gunakan `127.0.0.1` untuk pengembangan lokal.
- `SAMPIRA_SECURE_COOKIE` disetel ke `true` saat HTTPS ditangani oleh reverse proxy tepercaya.

### 3.4. Unduh Dependensi Go

Jalankan:

```bash
go mod download
```

### 3.5. Inisialisasi Database (Khusus Instalasi Baru)

Untuk membuat database, tabel, dan kategori awal, jalankan:

```bash
go run ./db_init
```

Initializer memakai nama skema dari `DB_NAME` dan berhenti jika skema itu sudah ada. Untuk database lama, buat cadangan, ikuti [migrasi empat role](docs/phase-01-operations.md#migrasi-database-yang-sudah-ada), lalu [prosedur upgrade Phase 2](docs/progress/PHASE_02_PICKUP_WORKFLOW.md). Startup server menyiapkan skema sesi dan ledger pickup.

### 3.6. Jalankan Aplikasi

Dari direktori utama proyek, jalankan:

```bash
go run ./cmd/server
```

Jika server berhasil berjalan, buka browser pada:

- Halaman utama: `http://localhost:8080`
- Login: `http://localhost:8080/login`
- Registrasi: `http://localhost:8080/register`
- Dashboard pengguna: `http://localhost:8080/dashboard`
- Dashboard admin: `http://localhost:8080/admin`
- Dashboard petugas: `http://localhost:8080/petugas`
- Portal Administrator: `http://localhost:8080/administrator`
- Dokumentasi API Swagger: `http://localhost:8080/swagger`

Port bawaan adalah `8080`. Port dapat diubah dengan menambahkan variabel `PORT` pada `.env`, misalnya `PORT=8081`.

### 3.7. Akun Aplikasi

Registrasi publik membuat akun Masyarakat. Ikuti [prosedur bootstrap Administrator](docs/phase-01-operations.md#bootstrap-administrator) untuk membuat akun Administrator. Operator melakukan provisioning akun Admin dan Petugas.

---

## 4. Progress Pengembangan Saat Ini

Bagian ini menjelaskan kondisi implementasi berdasarkan source code repository saat ini. Fitur yang belum memiliki implementasi backend dan database tidak dinyatakan sebagai fitur yang sudah selesai.

### 4.1. Fitur yang Sudah Tersedia pada Basis Kode

- [x] Struktur aplikasi web dengan backend Go dan frontend HTML, CSS, serta JavaScript.
- [x] Registrasi dan login pengguna.
- [x] Autentikasi API dengan token HMAC-SHA256, sesi yang dapat dicabut, cookie HttpOnly untuk portal, dan perlindungan CSRF.
- [x] Pengelolaan profil pengguna.
- [x] Empat peran dengan portal terpisah: Masyarakat (`user`), `petugas`, `admin`, dan `administrator`.
- [x] Pengajuan permintaan penjemputan sampah.
- [x] Pemilihan kategori sampah dan estimasi reward.
- [x] Unggah foto untuk permintaan penjemputan.
- [x] Antrean dan klaim pickup oleh Petugas untuk dirinya sendiri. Detail dan foto hanya tersedia untuk pemilik dan Petugas yang ditugaskan.
- [x] Pelacakan dan riwayat penjemputan dengan alur `pending → pickup → transit → arrived → completed`.
- [x] Pencatatan berat aktual oleh Petugas setelah tiba di hub. Penutupan pickup dan pembuatan kewajiban reward berjalan dalam satu transaksi.
- [x] Pencatatan pembayaran eksternal oleh Administrator dengan nominal yang sesuai, referensi unik, dan bukti gambar. Status reward dilacak terpisah dari status pickup.
- [x] Dashboard dengan komponen grafik dan peta.
- [x] Pengelolaan pengumuman portal oleh Administrator.
- [x] Dokumentasi endpoint API melalui Swagger/OpenAPI.

### 4.2. Cakupan Kategori

Kategori pada alur penjemputan mencakup organik, anorganik, elektronik, dan B3 rumah tangga. Kategori baterai dikelompokkan ke B3. Anorganik dirinci menjadi PET bening, kertas/kardus, besi, dan kaca dengan tarif masing-masing.

Tarif anorganik memakai acuan awal Bank Sampah Indonesia; organik dan B3 rumah tangga umum adalah setoran tanpa reward awal. Biaya pemrosesan kategori baru belum diberlakukan. Tarif elektronik sebelumnya dipertahankan. Lihat [riset, asumsi tarif, dan batas kategori](docs/waste-categories.md).

**Database yang sudah ada:** jalankan `db_init/add_waste_categories.sql` pada database aplikasi. Migrasi ini hanya menambah kategori yang belum ada. Untuk migrasi empat role, ikuti [panduan operasi Phase 1](docs/phase-01-operations.md). Inisialisasi database baru mencakup seluruh kategori.

### 4.3. Pengembangan Lanjutan SAMPIRA

Fokus pengembangan berikutnya adalah mengarahkan fondasi aplikasi yang sudah tersedia menjadi platform pelaporan dan pemantauan permasalahan sampah. Pekerjaan lanjutan yang direncanakan meliputi:

- [ ] Modul laporan permasalahan sampah oleh masyarakat, terpisah dari permintaan penjemputan.
- [ ] Proses verifikasi laporan oleh admin, termasuk permintaan revisi atau penolakan dengan alasan.
- [ ] Penugasan laporan kepada petugas untuk ditindaklanjuti.
- [ ] Pembaruan status penanganan dan riwayat khusus laporan permasalahan.
- [ ] Dashboard ringkasan laporan berdasarkan status, kategori, dan wilayah sesuai data yang tersedia.
- [ ] Integrasi dataset persampahan dari sumber resmi, disertai validasi periode, satuan, dan cakupan wilayah.
- [ ] Visualisasi tren dan informasi dataset pada dashboard analitik.
- [ ] Penyempurnaan peta agar lokasi yang ditampilkan bersumber dari data yang valid.

### 4.4. Catatan Status dan Batasan

- Permintaan penjemputan sampah (`pickups`) merupakan alur layanan pengumpulan sampah, bukan modul pelaporan permasalahan sampah.
- Riwayat penjemputan (`pickup_history`) mencatat perubahan status penjemputan dan bukan riwayat status laporan permasalahan.
- Grafik yang sudah ada pada dashboard merupakan bagian dari fitur aplikasi saat ini; integrasi analisis dataset persampahan resmi masih menjadi pekerjaan pengembangan lanjutan.
- Informasi lokasi pada peta perlu diverifikasi sebelum digunakan sebagai representasi lokasi layanan atau laporan yang sebenarnya.
- Checklist di atas perlu diperbarui kembali setiap kali fitur selesai diimplementasikan dan diuji.

---

## 5. Struktur Direktori

```text
SAMPIRA/
├── app/
│   └── Views/                 # Halaman HTML aplikasi
├── assets/
│   ├── css/                   # Stylesheet frontend
│   ├── js/                    # JavaScript frontend
│   └── img/                   # Gambar dan aset visual
├── cmd/
│   └── server/
│       └── main.go            # Entry point server Go dan routing
├── db_init/
│   ├── db_init.go             # Inisialisasi skema baru dan kategori awal
│   ├── add_waste_categories.sql
│   └── migrations/            # Migrasi database yang sudah ada
├── docs/
│   ├── openapi.json           # Spesifikasi API
│   ├── swagger.html           # UI dokumentasi API
│   └── progress/              # Laporan Phase 1–2
├── internal/
│   ├── handlers/              # Handler HTTP/API
│   ├── middleware/            # Middleware HTTP dan autentikasi
│   ├── models/                # Model data
│   ├── repositories/          # Akses database
│   └── services/              # Logika layanan aplikasi
├── scripts/                   # Skrip pemeriksaan dan pengujian
├── .env.example               # Contoh konfigurasi environment
├── go.mod                     # Modul dan dependensi Go
├── go.sum                     # Checksum dependensi
└── README.md                  # Dokumentasi proyek
```

---

## 6. Keamanan dan Penggunaan

- Jangan mengunggah file `.env` atau kredensial database ke repository publik.
- Gunakan `JWT_SECRET` yang kuat dan berbeda dari nilai contoh.
- Audit akun lama dan buat cadangan sebelum migrasi.
- Gunakan HTTPS pada deployment publik.
- Validasi kembali data lokasi dan data statistik sebelum dipublikasikan.

---

## 7. Status Dokumen

README ini mendokumentasikan teknologi, cara menjalankan aplikasi, serta progress berdasarkan source code yang tersedia pada repository. Informasi progress harus disesuaikan secara berkala dengan implementasi dan hasil pengujian terbaru.
