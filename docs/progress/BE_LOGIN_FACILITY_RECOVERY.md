# SAMPIRA — Recovery login dan Lapor Fasilitas

**Status akhir — PASS WITH NOTES. Migrasi database utama, login akun lama, dan tampilan daftar Lapor Fasilitas lulus. Pengujian tulis dilakukan pada fixture.**

## Baseline dan kondisi server

- Checkout aktif `BE` pada `64be28329fee5be5d0f5db0f313509636fb9a022`, sama dengan `origin/BE` lokal. Working tree bersih pada awal audit. Referensi Frontend `FE` pada `d9ae42665fd438e0188bd86625b18e59a6b3509c`. Audit memakai skill ponytail dan kontrak Phase 3A–5A.
- Pada pemeriksaan terdahulu, `go run ./cmd/server` dari checkout FE mengambil port 8080. Biner itu melayani HTML dan aset tetapi belum mendaftarkan rute fasilitas, sehingga daftar dan handling mengembalikan 404.
- Pada audit ini, port 8080 dilayani `server.exe` PID 6512 dari arsip BE di `%LOCALAPPDATA%\SAMPIRA-dev\builds\64be28329fee5be5d0f5db0f313509636fb9a022`. Working directory launcher adalah `%LOCALAPPDATA%\SAMPIRA-dev\runtime`. Konfigurasi child process mengarah ke MariaDB PID 744, `127.0.0.1:24353/sampira_dev_fe_be`. Pada status tersebut, API laporan sudah terdaftar dan melindungi akses tanpa sesi.
- Junction lama `runtime/app` dan `runtime/assets` menunjuk ke checkout aktif. Karena checkout kini BE, preview FE terbaru pada recovery ini disajikan dari arsip FE di fixture terpisah. Untuk cutover saat tetap di BE, gunakan view dan aset dari arsip FE pada direktori kerja terpisah.

## Penyebab login gagal

Database yang dipakai server 8080 hanya berisi dua akun User sintetis dan nol akun non-fixture. Backend mengembalikan 401 dengan pesan `Email atau password salah.` untuk akun yang tidak ada. Akun lama berada di database `ecorecycle` pada port 3306. Lima akun utama aktif dan format hash kelimanya konsisten dengan bcrypt. Pemeriksaan format hash tidak menguji kata sandi akun utama.

Alur `POST /api/auth/login` membaca email dan password dari body, mencari pengguna, memeriksa bcrypt dan role, lalu mencatat sesi di `auth_sessions` hanya untuk akun aktif. Cookie `sampira_session` bersifat host-only, ber-path `/`, HttpOnly, SameSite Lax dan Secure pada HTTPS atau konfigurasi yang mewajibkannya. Portal mengarahkan pengguna menurut role, lalu backend memeriksa kembali sesi dan role pada request portal. Mutasi browser tetap melalui pemeriksaan origin. Tidak ada bukti yang memerlukan perubahan autentikasi, cookie, CSRF, route, atau source. [Handler login](../../internal/handlers/auth_handler.go) · [Akses portal](../../internal/handlers/access.go) · [Repository sesi](../../internal/repositories/session_repository.go)

## Audit skema dan backup

MariaDB utama `127.0.0.1:3306/ecorecycle`, versi 10.4.32. Database mempunyai delapan tabel InnoDB.

| Tabel | Jumlah baris saat backup |
|---|---:|
| `users` | 5 |
| `auth_sessions` | 2 |
| `pickups` | 6 |
| `pickup_history` | 19 |
| `pickup_rewards` | 0 |
| `transactions` | 2 |
| `portal_announcements` | 1 |
| `waste_categories` | 10 |

Kelima akun aktif meliputi dua User, satu Petugas, satu Admin, dan satu Administrator. Audit membandingkan kolom, tipe, nilai default, indeks, constraint, foreign key, dan fingerprint SHA-256 data berurutan berdasarkan primary key. Isi baris sensitif dan kredensial tidak dicetak. Database utama belum memiliki tujuh tabel fasilitas serta dua kolom pickup dan constraint 004.

Backup lengkap `ecorecycle.sql` dibuat dengan snapshot transaksional di `%LOCALAPPDATA%\SAMPIRA-recovery\20261106-214652-abc26461`, di luar repository. Ukurannya 17.146 byte dan SHA-256 `32bbd1df7ea46de1d1e34282822ec25a33b75802b832f163629ea9ab74fce76c`. Backup memuat data privat, termasuk hash akun. Restore ke `sampira_recovery_restore` pada MariaDB loopback port 24356 lulus. Delapan tabel, fingerprint data, indeks dan relasi sama dengan sumber. Pemeriksaan ulang pada sumber setelah pengujian juga cocok dengan baseline.

## Migrasi yang diperlukan

| Migrasi | Dampak |
|---|---|
| `002_facility_reports.sql` | Menambah tiga tabel laporan, foto dan histori, beserta indeks, relasi akun, dan aturan pasangan koordinat fasilitas. |
| `003_facility_handling.sql` | Menambah empat tabel penanganan, penugasan, aktivitas dan foto, beserta relasi dan constraint penugasan. |
| `004_precise_locations.sql` | Menambah `latitude` dan `longitude` bertipe `DECIMAL(10,7) NULL` serta `chk_pickup_coordinates` pada pickup. Titik historis tetap null. |

Ketiganya lulus dua kali pada salinan ecorecycle. Fingerprint kolom lama, jumlah baris, indeks lama, dan constraint lama tetap cocok, serta pemeriksaan orphan lulus. Startup BE pada salinan yang sudah dimigrasikan juga lulus dan kembali memverifikasi skema serta data. DDL dapat menunggu metadata lock dan dapat melakukan implicit commit. Terapkan saat penulisan berhenti. Jika cutover gagal, periksa skema dan gunakan cadangan yang sudah diuji untuk pemulihan ke skema terpisah. [002](../../db_init/migrations/002_facility_reports.sql) · [003](../../db_init/migrations/003_facility_handling.sql) · [004](../../db_init/migrations/004_precise_locations.sql)

## Hasil pengujian dan perubahan

| Lingkungan | Hasil |
|---|---|
| Checkout BE | `go test -count=1 ./...`, `go vet ./...`, dan build server/initializer lulus. Initializer tidak digunakan pada database utama atau restore data pengguna. |
| Fixture sintetis API Phase 1–5A | Login empat role, kredensial salah, sesi, logout/replay, penolakan lintas role/origin, pickup, reward dan bukti privat lulus. Laporan create, list, detail, revisi, verifikasi Admin, assignment, akses dan pengalihan Petugas lulus. |
| Fixture Chromium BE + arsip FE | Portal empat role, cookie dan logout, alur laporan User dan verifikasi Admin, penanganan Phase 4B, serta koordinat Phase 5B lulus. Provider rute diuji dengan simulasi. |
| Salinan backup asli | Restore, migrasi ulang, integritas tabel, data akun, histori, pickup, reward dan transaksi lulus. Startup BE memberi 200 pada `/login` serta 401 tanpa sesi pada laporan dan handling. Tidak menggunakan kata sandi akun lama untuk pengujian. |
| Server lokal 8080 sebelum cutover | Backend BE dan route terverifikasi. Login akun tidak terdaftar memberi 401. Database saat itu `sampira_dev_fe_be`. |
| Server lokal 8080 setelah cutover | Backend BE dan arsip FE disajikan dari origin yang sama. `/login` memberi 200, route laporan dan handling memberi 401 tanpa sesi. Pemilik akun mengonfirmasi login akun lama dan tampilan daftar Lapor Fasilitas berhasil di browser. |
| Database utama | Backup dan restore terbaru lulus. Migrasi 002–004 diterapkan setelah persetujuan. Fingerprint delapan tabel lama, struktur, indeks, constraint dan pemeriksaan orphan cocok setelah migrasi dan startup BE. |

Tidak ada perubahan pada source Backend atau Frontend dan tidak ada perpindahan branch, merge, commit, atau push dalam audit ini. Perubahan repository terbatas pada laporan ini. Recovery tidak membutuhkan perubahan handler. Biner BE tambahan dipakai pada fixture dan dihentikan setelah pengujian.

## Menjalankan runtime yang tepat

Untuk pengembangan dengan akun terpisah, gunakan [panduan launcher lokal](<C:/Users/FIQRY FIRMANSYAH/AppData/Local/SAMPIRA-dev/README.md>). Launcher lama memerlukan checkout FE untuk menyajikan view dari working tree FE. Terminal Windows PowerShell dapat memanggil executable PowerShell 7 yang tersedia melalui jalur absolut jika `pwsh` tidak ada di PATH.

### Runtime akun lama setelah cutover

Server utama memakai biner BE `64be283`, arsip FE `d9ae426`, dan `127.0.0.1:3306/ecorecycle`. Working directory ada di `%LOCALAPPDATA%\SAMPIRA-main\runtime`. Folder unggahan lama tetap dilayani melalui junction. Hash aset JavaScript yang disajikan cocok dengan arsip FE. Biner dan launcher ada di `%LOCALAPPDATA%\SAMPIRA-main`. Launcher membaca konfigurasi lokal dari `.env` yang sudah ada dan menyuntikkannya ke proses. Source dan kredensial akun tidak berubah.

Backup tepat sebelum cutover ada di `%LOCALAPPDATA%\SAMPIRA-recovery\20261106-215029-54446a2a\ecorecycle.sql`. Ukurannya 17.146 byte dan SHA-256 `d93c95b4e7ed47a83919a45d2529d7531deedeab1b7db98eecda67ff0d0a2bd7`. Backup ini direstorasi terpisah dan diuji dengan migrasi ulang sebelum perubahan utama.

Gunakan PowerShell 7 untuk start, status, atau stop. Jika `pwsh` belum ada di PATH, jalankan executable yang sudah diverifikasi di laptop ini.

```powershell
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe" -NoProfile -File "$env:LOCALAPPDATA\SAMPIRA-main\sampira-main.ps1" Start
```

Ganti `Start` dengan `Status` untuk memeriksa PID atau `Stop` untuk menghentikan server Go yang tercatat. MariaDB utama dikelola oleh XAMPP. Login dan API memakai [origin localhost](http://localhost:8080/login). Data sintetis pengujian hanya dibuat di fixture.
