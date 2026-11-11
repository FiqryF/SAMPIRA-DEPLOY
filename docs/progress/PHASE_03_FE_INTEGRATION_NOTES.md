# SAMPIRA Phase 3B — Catatan Integrasi Frontend

## Komponen dan endpoint

Semua rute berawalan `/api/ecorecycle/facility-reports`. Halaman laporan memakai Fetch same-origin dan cookie HttpOnly portal yang dibuat oleh login. API menentukan role dan kepemilikan. Rute koleksi dipanggil tanpa trailing slash. [Kontrak Phase 3A](https://github.com/azitriyadi/SAMPIRA/blob/77e19da25de4162b306cf4be9250af184c5b00e6/docs/progress/PHASE_03_API_CONTRACT.md)

| Method dan path relatif | Portal | Pemakaian |
|---|---|---|
| `GET` koleksi | User dan Admin | Daftar dengan `limit`, `status`, `category` dan `before_id`. |
| `POST` koleksi | User | FormData dengan UUID v4 pada `Idempotency-Key`. |
| `GET /{id}` | User dan Admin | Detail serta versi untuk mutasi. |
| `PUT /{id}` | User | Kirim ulang field lengkap, foto pengganti opsional dan `version` lewat FormData. |
| `GET /{id}/history` | User dan Admin | Histori terbaru dengan `limit` dan `before_version`. |
| `GET /{id}/photo` | User dan Admin | Foto privat pada `img` same-origin. |
| `POST /{id}/verification` | Admin | JSON berisi `status`, `version`, dan `note`. |

FE menggunakan `id` untuk rute, `tracking_number` untuk tampilan, dan `reporter_id` untuk identitas numerik di antrean Admin. HTTP 409 memuat detail dan histori terbaru. HTTP 401 menampilkan pemberitahuan dan mengarahkan ke `/login`. Balasan 404 koleksi pada build FE saja ditampilkan sebagai layanan belum tersedia.

## Prasyarat saat Phase 3C

- Server Phase 3A yang menyediakan ketujuh operasi dengan envelope `status`, `message` dan `data`.
- Database Phase 1–2 yang sudah menjalankan `002_facility_reports.sql`. Tabel laporan, foto, dan histori dipakai oleh API.
- View dan aset Phase 3B disajikan server yang sama dengan API. `/dashboard` diproteksi untuk User dan `/admin` untuk Admin. Proxy harus mempertahankan origin dan konfigurasi cookie yang sesuai.
- Data uji dengan akun berbeda untuk User pemilik, User lain, Admin, Petugas, dan Administrator. Siapkan fixture sintetis.

Frontend telah diuji dengan biner dari `origin/BE` di instance terisolasi. Ketujuh operasi yang diuji cocok dengan kontrak. Endpoint laporan memerlukan biner Phase 3A atau hasil integrasi saat menjalankan source branch `FE`.

## Cara mengulang uji terisolasi

1. Gunakan salinan source `origin/BE` pada direktori sementara, misalnya melalui `git archive`, lalu build server dan initializer dari direktori itu. Letakkan biner pada path sementara dan set `SAMPIRA_TEST_BIN` serta `SAMPIRA_TEST_INIT` sesuai hasil build.
2. Siapkan MariaDB fixture dan variabel `SAMPIRA_TEST_MYSQL` serta `SAMPIRA_TEST_CHROME` sesuai [panduan pengujian Phase 1](../phase-01-operations.md#pengujian-terisolasi). Harness hanya boleh diarahkan ke instance fixture.
3. Dari root `FE`, jalankan berikut. Harness menyalin view dan aset dari working tree FE serta menjalankan API dari biner backend yang disiapkan.

   ```powershell
   $env:SAMPIRA_TEST_PHASE3_FE = '1'
   node scripts/check-phase1-migration.mjs
   ```

4. Untuk pemeriksaan statis, jalankan `node scripts/check-ui-quality.cjs` dan `node scripts/check-admin-ui.cjs`.

Bila port fixture standar dipakai proses lain, gunakan salinan sementara skrip harness dengan port MariaDB dan HTTP yang berbeda. Sesuaikan port pada skrip induk, regresi API, dan Chromium. Jaga agar instance database utama dan server yang sedang aktif berada di luar pengujian.

## Checklist uji ulang Phase 3C

- [ ] Startup server dari source hasil integrasi dan verifikasi tiga tabel baru di fixture.
- [ ] User membuat laporan dengan dan tanpa foto. Retry atas respons yang hilang mengembalikan ID yang sama.
- [ ] User membaca daftar miliknya, detail, foto, dan histori. User lain mendapat 404 dari API.
- [ ] Admin memfilter antrean, meminta revisi, menyetujui dan menolak. Alasan tersimpan sesuai kontrak.
- [ ] User mengirim revisi dengan versi terbaru dan foto lama tetap tersedia jika tidak diganti.
- [ ] Mutasi versi basi mendapat 409 dan halaman menampilkan kondisi terbaru.
- [ ] Petugas dan Administrator tidak mendapat UI laporan dan API menolak akses mereka.
- [ ] Login, registrasi, logout, pickup, tracking, timbang, CMS dan reward lulus regresi.
- [ ] Cek keyboard, dialog, pratinjau, dan layout desktop/mobile pada lingkungan integrasi.
