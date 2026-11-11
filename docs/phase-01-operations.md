# Operasi SAMPIRA Phase 1

Untuk aturan pickup dan pembayaran yang berlaku setelah upgrade Phase 2, lihat [laporan Phase 2](progress/PHASE_02_PICKUP_WORKFLOW.md) dan [audit kumulatif](progress/SAMPIRA_PHASE_01_02_COMPREHENSIVE_REPORT.md). Kirim data login dan mutasi melalui body. URL hanya memuat parameter yang didokumentasikan untuk pembacaan.

## Role dan izin

| Role | Portal | Izin yang aktif pada Phase 1 |
|---|---|---|
| `user` | `/dashboard`, `/profile` | Profil sendiri, membuat pengajuan, mengedit atau membatalkan pengajuan sendiri selama pending, membaca status/riwayat/foto sendiri. |
| `petugas` | `/petugas` | Membaca ringkasan antrean, mengambil tugas untuk dirinya, membaca detail dan foto tugasnya, memperbarui progres, serta mencatat berat aktual satu kali setelah tiba di hub. |
| `admin` | `/admin` | Kerangka portal laporan fasilitas. Verifikasi, penugasan dan monitoring laporan menunggu Phase 2. |
| `administrator` | `/administrator` | CMS pengumuman, endpoint sesi, direktori Petugas aktif, statistik agregat dan validasi pencairan yang ditahan. Manajemen akun, tarif dan konfigurasi melalui UI menunggu phase lanjutan. |

Semua role dapat mengakses profil sendiri melalui API. Pengumuman umum dapat dibaca pengguna yang login. Pengajuan penjemputan langsung tersedia bagi Petugas tanpa persetujuan. `/collector`, `type=collector`, `/api/users/collectors`, dan `assign_collector` dipertahankan untuk kompatibilitas. Klaim hanya untuk Petugas sendiri dan nilai `collector_id` dari klien diabaikan. `type=all` ditolak untuk seluruh role. Detail dan foto pickup hanya untuk pemilik dan Petugas yang ditugaskan. Pemerintah adalah pihak eksternal.

## Migrasi database yang sudah ada

1. Hentikan server dan penulisan ke skema aplikasi. Catat `SHOW CREATE TABLE users`, `SHOW CREATE TABLE portal_announcements` jika tersedia, dan relasi dari `information_schema.KEY_COLUMN_USAGE`. Pastikan skema legacy menggunakan enum yang didukung dan tabel terkait memakai InnoDB.
2. Buat dump konsisten di luar document root, dengan akses terbatas. Contoh berikut memakai kredensial yang diminta oleh klien MySQL. Ganti `ecorecycle` dengan `DB_NAME` aktual.

   ```powershell
   mysqldump --single-transaction --skip-add-drop-table -h localhost -u db_operator -p --result-file="C:/secure/sampira-before-phase1.sql" ecorecycle
   ```

3. Dari root repository, buka `mysql -h localhost -u db_operator -p ecorecycle`, lalu jalankan perintah berikut. Jalankan pada klien yang menghentikan pemrosesan setelah error. Untuk batch gunakan redirection standar shell dan jangan pakai `--force`.

   ```sql
   SELECT DATABASE();
   SOURCE db_init/migrations/001_four_roles.sql
   SHOW CREATE TABLE users;
   SHOW CREATE TABLE portal_announcements;
   SELECT role, COUNT(*) FROM users GROUP BY role;
   SELECT target_role, COUNT(*) FROM portal_announcements GROUP BY target_role;
   ```

   Skrip memperluas kedua enum, memindahkan nilai lama dalam satu transaksi, lalu mempersempit enum ke nilai final. `pickups.collector_id` tetap mengacu pada ID akun yang sama. Bandingkan ID dan jumlah record akun, pickup, riwayat, transaksi, dan pengumuman terhadap dump. Periksa bahwa Admin lama tetap Admin dan uji login Petugas yang dimigrasikan. Jika tabel pengumuman belum ada, migrasi menyiapkannya.

4. Audit akun Admin/Petugas sebelum aplikasi dibuka. Riwayat registrasi lama memungkinkan pembuatan akun istimewa oleh pengguna publik. Cabut role akun yang tidak sah dan rotasi kredensial akun demo/istimewa melalui prosedur internal. Tinjau transaksi historis terhadap bukti eksternal sebelum memperlakukannya sebagai pembayaran terkonfirmasi.
5. Isi `JWT_SECRET` dengan nilai acak baru, minimal 32 byte. Rotasi diperlukan untuk membatalkan sesi bertanda tangan secret lama. Gunakan HTTPS pada deployment publik. Jika TLS berakhir di reverse proxy, proxy harus menimpa `X-Forwarded-Proto` dan origin Go harus dibatasi dari akses langsung. Arahkan trafik aplikasi ke server Go. Hindari menyajikan repository sebagai document root publik.
6. Kompilasi dan jalankan biner dari kode terbaru, kemudian login ulang. Gunakan `go run ./db_init` khusus untuk skema baru. Installer berhenti jika nama database sudah ada. Biner lama yang tersimpan dalam repository berasal dari versi sebelumnya.

### Pemulihan

DDL MySQL/MariaDB melakukan implicit commit. Jika ada error, tahan penulisan, simpan output, periksa enum dan hitung role pada kedua tabel. Untuk kegagalan yang sudah diperbaiki, ulangi skrip dari awal. Jika perlu pulih ke snapshot, impor dump ke skema baru dengan nama berbeda dan bandingkan ID, relasi dan jumlah baris sebelum mengarahkan aplikasi yang kompatibel ke sana. Simpan skema asli untuk rekonsiliasi. Jika penulisan sempat dibuka kembali, rekonsiliasi perubahan setelah snapshot sebelum cutover. Mengembalikan versi aplikasi pra-Phase 1 akan membuka kembali kelemahan registrasi dan otorisasi yang tercatat dalam audit.

## Bootstrap Administrator

Jalankan hanya dari host tepercaya dengan koneksi ke database yang sudah dimigrasikan. Gunakan nama dan email baru yang dikuasai organisasi. Kirim password unik 15–72 byte melalui stdin dengan password manager atau prompt tersembunyi. Contoh untuk PowerShell 7:

```powershell
go build -o sampira.exe ./cmd/server
(Read-Host 'Password Administrator' -MaskInput) | .\sampira.exe -bootstrap-administrator 'Administrator SAMPIRA' 'admin-sistem@example.org'
```

CLI menyimpan hash bcrypt dan berhenti jika email sudah terdaftar. Login melalui `/login` dan pastikan akses ke `/administrator`. Provisioning Admin/Petugas tetap dilakukan oleh operator database yang berwenang. Hindari mempromosikan akun publik yang belum diverifikasi kepemilikannya.

## Autentikasi, sesi dan payout

API menerima `Authorization: Bearer <token>` untuk integrasi, atau cookie HttpOnly SameSite=Lax dari browser. Login portal menambahkan header `X-SAMPIRA-Portal: 1` dan hanya menerima identitas ringkas dalam JSON. Browser mengambil profil melalui API dan tidak menyimpan token atau profil di localStorage. Sesi HMAC memiliki nonce dan digest di tabel `auth_sessions`, berlaku hingga 24 jam. Startup menambah `users.is_active` dan tabel sesi jika diperlukan. Setelah upgrade, token lama yang belum memiliki record sesi memerlukan login ulang.

Backend memeriksa role dan status aktif dari database. Logout `POST /logout` menghapus digest sesi dan cookie. Untuk logout bearer, kirim header Authorization dari klien tanpa cookie portal. Cookie HTTPS memakai TLS langsung atau `SAMPIRA_SECURE_COOKIE=true` pada reverse proxy tepercaya yang mempertahankan host publik. `SAMPIRA_LISTEN_HOST=127.0.0.1` membatasi origin Go ke loopback. POST/DELETE lintas origin ditolak. Penulisan dengan cookie perlu Origin yang cocok atau metadata Fetch yang menyatakan same-origin. Respons sensitif memakai no-store.

Operator menonaktifkan akun dengan perubahan status dan pencabutan sesi dalam satu transaksi. Ganti `ID_TERVERIFIKASI` dengan ID yang sudah disetujui operator.

```sql
START TRANSACTION;
UPDATE users SET is_active = FALSE WHERE id = ID_TERVERIFIKASI;
DELETE FROM auth_sessions WHERE user_id = ID_TERVERIFIKASI;
COMMIT;
```

Sebelum mengaktifkan kembali akun seed, ganti kredensial melalui prosedur internal menggunakan hash bcrypt atas password unik, pastikan pemilik sah, lalu cabut seluruh sesi sebelum reaktivasi. Akun baru menggunakan prosedur bootstrap yang sesuai.

Data tujuan pembayaran hanya tersedia pada profil pemilik. Field kompatibilitas pada daftar pickup dikosongkan. Verifikasi berat oleh Petugas tidak mengonfirmasi pencairan. Pencairan yang lolos validasi merespons `409`. Field `is_processed` adalah penanda historis. Gunakan `payment_status` untuk membedakan `requires_reconciliation`, `pending`, dan `not_due`. Statistik memisahkan nilai historis dari pembayaran terkonfirmasi.

## Pengujian terisolasi

Gunakan instance MariaDB 10.4 baru dengan direktori data sementara, bind `127.0.0.1`, port `13316`, dan akun root lokal tanpa password khusus untuk fixture. Hentikan instance uji setelah selesai. Skrip membuat dua skema bernama `sampira_phase1_fresh` dan `sampira_phase1_test` dan berhenti jika skema tersebut sudah ada. Server uji memakai port `18081`, working directory sementara, password fixture acak, dan tidak membaca file `.env` proyek. Skrip mengambil hanya deklarasi DDL dari commit baseline `e648496`. Jika `SAMPIRA_TEST_CHROME` diisi, skrip juga membuka browser Chromium nyata pada port uji dan memeriksa empat role, desktop/mobile, logout dan kedaluwarsa.

```powershell
go test ./...
go build -o "$env:TEMP/sampira-phase1-server.exe" ./cmd/server
go build -o "$env:TEMP/sampira-phase1-init.exe" ./db_init
$env:SAMPIRA_TEST_MYSQL = 'C:/xampp/mysql/bin/mysql.exe'
$env:SAMPIRA_TEST_BIN = "$env:TEMP/sampira-phase1-server.exe"
$env:SAMPIRA_TEST_INIT = "$env:TEMP/sampira-phase1-init.exe"
$env:SAMPIRA_TEST_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node scripts/check-phase1-migration.mjs
node scripts/check-admin-ui.cjs
node scripts/check-ui-quality.cjs
```

## Rehearsal backup dan restore

Skrip `check-phase1-restore.mjs` membaca sumber lokal `ecorecycle` di port 3306. Jalankan saat sumber tenang. Gunakan instance MariaDB terisolasi di port 13316 dan jalur file baru pada direktori privat operator. Skrip membuat dump dan memulihkannya ke `sampira_phase1_restore` yang baru. Klien membandingkan struktur kolom, ID akun, seluruh baris tabel dengan fingerprint SHA-256, foreign key, dan pemeriksaan orphan. Jika sumber berubah selama capture, ulangi dengan jalur backup baru setelah penulisan berhenti.

```powershell
$env:SAMPIRA_MYSQL_BIN = 'C:/xampp/mysql/bin'
$env:SAMPIRA_BACKUP_PATH = 'C:/secure/sampira-verified-backup.sql'
node scripts/check-phase1-restore.mjs
```

Untuk pemulihan manual, siapkan skema kosong pada instance terpisah, lalu impor dump dengan klien MySQL yang menunjuk skema tersebut. Bandingkan data dan relasi sebelum cutover. Untuk snapshot yang sudah menyertakan `auth_sessions`, cabut sesi pada hasil pemulihan dan rotasi secret sebelum mengalihkan trafik, agar sesi lama dari snapshot tidak aktif kembali.
