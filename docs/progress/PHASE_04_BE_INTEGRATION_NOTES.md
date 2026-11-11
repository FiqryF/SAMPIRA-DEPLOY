# SAMPIRA Phase 4A — Catatan Integrasi Backend

## Prasyarat Phase 4B

- Server Go dari `BE` yang memuat Phase 4A, skema Phase 1–3A yang telah dimigrasikan, dan empat tabel tambahan dari `003_facility_handling.sql`. Startup BE menerapkan SQL yang sama setelah migrasi 002. Pengujian memakai MariaDB 10.4.32.
- Sajikan UI dan API dari origin yang sama. Gunakan cookie sesi portal dengan `credentials: "same-origin"`. Integrasi non-browser dapat memakai Bearer. Administrator tidak memiliki hak operasional Phase 4.
- Gunakan `verification_status` untuk hasil Phase 3A, `status` untuk progres lapangan, `assignment_status` untuk penugasan, dan `coordination_status` untuk komunikasi. Keempatnya punya makna berbeda.
- Gunakan `version` dari **ringkasan penanganan** dalam semua mutasi Phase 4. Pada 409, muat ulang detail dan histori, lalu minta pengguna meninjau aksi sebelum mengirim lagi.

## Pemetaan layar ke API

Semua path relatif terhadap `/api/ecorecycle/facility-reports`.

| Layar | Operasi |
|---|---|
| Admin, antrean | GET `/handling?status=approved`, GET `/handling/officers`, POST `/{id}/handling/assignment`. Untuk monitoring, gunakan filter status lain atau hapus filter. |
| Admin, validasi | GET `/{id}/handling`, GET `/{id}/handling/history`, GET bukti pada versi event, POST `/{id}/handling/review`. |
| Admin, koordinasi | POST `/{id}/handling/coordination` dan histori untuk detail komunikasi. Catat informasi yang diketahui pada setiap tahap. |
| Petugas | GET `/handling`, GET detail, histori dan foto yang diizinkan, POST `/{id}/handling/activity`. |
| User | GET detail dan histori Phase 4, serta GET foto pada versi yang dipublikasikan Admin. Temukan ID laporan melalui operasi Phase 3A. |

Bentuk data, status, foto, pagination, dan contoh payload tersedia di kontrak dan OpenAPI. [Kontrak Phase 4A](PHASE_04_API_CONTRACT.md) · [OpenAPI](../openapi.json)

## Kompatibilitas Phase 3

Ketujuh operasi lama tetap mempunyai struktur, status, versi dan izin Phase 3A. Field `status: "approved"` di detail lama tetap berarti laporan lolos verifikasi. Kondisi lapangan dan hasil akhir berasal dari endpoint baru. Teks status approved di UI Phase 3B perlu ditautkan ke progres Phase 4 pada pengerjaan Phase 4B. UI harus memakai field publik Phase 4 untuk User, terutama `public_result`, `public_note`, `public_evidence_version`, dan status yang diizinkan.

## Migrasi dan lingkungan

Pada skema berisi data, buat backup dan verifikasi restore di instance terpisah sebelum upgrade. Terapkan `002_facility_reports.sql` melalui startup Phase 3A bila belum ada, lalu `003_facility_handling.sql` melalui startup Phase 4A atau klien SQL. DDL menambah tabel dan dapat diulang. Bila startup terhenti di tengah migrasi, periksa pesan dan tabel yang sudah terbentuk, perbaiki penyebabnya, lalu jalankan ulang. Pemulihan sebelum cutover memakai backup yang telah dipulihkan ke skema terpisah.

## Uji pada fixture terisolasi

Ikuti konfigurasi `SAMPIRA_TEST_MYSQL`, `SAMPIRA_TEST_BIN`, `SAMPIRA_TEST_INIT`, dan opsi Chromium pada panduan Phase 1. Bangun biner dari working tree backend terbaru. Instance MariaDB dan server fixture harus berada di loopback, memakai datadir dan working directory khusus pengujian. [Panduan fixture](../phase-01-operations.md#pengujian-terisolasi)

```powershell
$env:SAMPIRA_TEST_PHASE3 = '1'
$env:SAMPIRA_TEST_PHASE4 = '1'
node scripts/check-phase1-migration.mjs
```

Harness Phase 4A memulihkan dump data Phase 3A ke skema tambahan di instance fixture, menerapkan migrasi 003 dua kali, lalu menguji workflow melalui API nyata. Kegagalan yang sengaja disuntikkan terbatas pada fixture. Bila port default digunakan proses lain, jalankan salinan sementara skrip dengan port alternatif yang konsisten pada harness dan skrip anak.

## Uji lintas branch tanpa merge

Bangun biner backend dari `BE`. Ambil view, aset dan suite Chromium dari arsip `FE` ke direktori sementara. Pakai biner backend untuk menyajikan file arsip tersebut pada instance fixture. Jalankan suite browser dari arsip FE dengan opsi `SAMPIRA_TEST_PHASE3_FE=1`. Gunakan fixture segar untuk UI agar data dari suite API Phase 4 tidak mengubah hasil filter skenario Phase 3B. Metode ini juga dapat digunakan ketika UI Phase 4B tersedia.

Rehearsal dengan arsip FE `19db878` dan backend Phase 4A lulus pada fixture terisolasi. Checklist berikut digunakan kembali setelah UI Phase 4B tersedia.

- [ ] Jalankan login empat role dan pastikan setiap portal menampilkan tindakan yang sesuai.
- [ ] Jalankan ulang pengajuan, revisi dan verifikasi Phase 3B terhadap BE.
- [ ] Verifikasi daftar approved, daftar Petugas aktif, penugasan, pengalihan dan hilangnya akses Petugas lama.
- [ ] Jalankan asesmen, unggah bukti, perkembangan, penyampaian hasil, revisi hasil dan validasi.
- [ ] Uji pemilik versus User lain pada detail dan foto, termasuk foto internal dan foto yang dipublikasikan.
- [ ] Uji koordinasi bertahap dan pemisahannya dari penyelesaian lapangan.
- [ ] Uji versi basi, pagination dan akses UI di viewport yang didukung.
- [ ] Pastikan pickup, tracking, timbang, reward dan bukti pembayaran lulus regresi.

Risiko integrasi utama adalah menyamakan status atau versi dari kedua fase, mengasumsikan histori lama berisi peristiwa lapangan, dan memakai detail internal pada layar User. Kontrak menyediakan endpoint dan field terpisah untuk setiap kebutuhan itu.
