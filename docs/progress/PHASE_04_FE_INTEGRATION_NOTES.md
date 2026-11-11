# SAMPIRA Phase 4B — Catatan Integrasi Frontend

## Baseline dan dependensi

UI Phase 4B berada di `FE` dari `19db878`. Acuan backend `BE` adalah `722f041fd2d074bd0889cf49275e7d7cceb4794d`. Sajikan view dan aset FE dari origin yang sama dengan server BE. Server memerlukan skema Phase 1–3A dan migrasi `003_facility_handling.sql`. Startup backend menerapkannya setelah 002. [Kontrak Phase 4A](https://github.com/azitriyadi/SAMPIRA/blob/722f041fd2d074bd0889cf49275e7d7cceb4794d/docs/progress/PHASE_04_API_CONTRACT.md)

Ketujuh operasi Phase 3 dipertahankan. Data penanganan dibaca dari namespace Phase 4. UI memakai cookie HttpOnly same-origin serta empat field status yang berbeda. Ketika API Phase 4A belum tersedia, panel menampilkan data tidak tersedia. Error 409 memuat ulang detail dan histori. Setiap mutasi berikutnya perlu ditinjau dan dikirim manual.

## Endpoint yang diintegrasikan

Base URL `/api/ecorecycle/facility-reports`.

| Method dan path relatif | Halaman |
|---|---|
| GET `/handling` | Antrean dan monitoring Admin, tugas Petugas. Filter `status`, `category`, cursor `before_id`. |
| GET `/handling/officers` | Pilihan Petugas aktif pada dialog Admin. Cursor `before_id`. |
| GET `/{id}/handling` | Ringkasan tiga role. |
| GET `/{id}/handling/history` | Histori sesuai role. Cursor `before_version`. |
| GET `/{id}/handling/history/{version}/photo` | Bukti privat di histori Admin/Petugas, foto pilihan Admin pada hasil publik. |
| POST `/{id}/handling/assignment` | JSON penugasan dan pengalihan oleh Admin. |
| POST `/{id}/handling/activity` | FormData asesmen, progres, dan hasil oleh Petugas. |
| POST `/{id}/handling/review` | JSON koreksi atau validasi hasil oleh Admin. |
| POST `/{id}/handling/coordination` | FormData pencatatan koordinasi oleh Admin. |

## Pengujian lintas branch

1. Ekspor source `BE` dengan `git archive BE` ke direktori sementara. Build server dan initializer di salinan itu. Set `SAMPIRA_TEST_BIN` dan `SAMPIRA_TEST_INIT` ke hasil build.
2. Siapkan MariaDB terisolasi di loopback. Set `SAMPIRA_TEST_MYSQL` dan `SAMPIRA_TEST_CHROME`. [Panduan fixture](../phase-01-operations.md#pengujian-terisolasi)
3. Jalankan harness dari working tree FE, sehingga view dan aset yang disalin berasal dari FE. Server dan migrasi berasal dari biner BE.

   ```powershell
   $env:SAMPIRA_TEST_PHASE3_FE = '1'
   $env:SAMPIRA_TEST_PHASE4_FE = '1'
   node scripts/check-phase1-migration.mjs
   ```

Jika port fixture standar terpakai, pakai salinan sementara skrip dengan port alternatif yang sama pada induk dan anak. Pengujian Phase 4B memakai akun sintetis di database fixture. File dan database utama tidak dipakai untuk mutasi pengujian.

Pengujian lintas branch lulus dengan BE `722f041`, MariaDB 10.4.32 dan Chromium. Tidak ditemukan perbedaan kontrak pada sembilan operasi yang diuji. UI tetap membutuhkan server gabungan pada deployment akhir.

## Risiko dan checklist hasil gabungan

- Gunakan `version` dari ringkasan handling pada mutasi, terpisah dari versi detail/verifikasi Phase 3.
- Publikasi foto membutuhkan event lapangan yang berasal dari assignment pengirim hasil. Jika bukti yang dicari belum terlihat pada dialog, muat halaman histori berikutnya sebelum membuka ulang dialog.
- Penutupan pekerjaan lapangan dan verifikasi eksternal memiliki indikator berbeda. `forwarded` hanya mencatat penerusan.
- [ ] Verifikasi login, role, sesi dan logout pada server hasil integrasi.
- [ ] Verifikasi daftar approved, pengalihan, akses Petugas, progres, koreksi dan penyelesaian.
- [ ] Verifikasi receipt/follow-up eksternal, 409, cursor dan tampilan di viewport target.
- [ ] Verifikasi User pemilik versus User lain, catatan privat, foto yang diizinkan, serta regresi pickup, reward dan Phase 3B.
- [ ] Verifikasi backup dan restore sebelum migrasi pada skema deployment.
