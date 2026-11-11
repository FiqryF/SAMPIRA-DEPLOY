# SAMPIRA Phase 6A — Laporan Backend

**Status — PASS WITH NOTES.** API edukasi, migrasi, dan regresi lulus di fixture. Database utama dan runtime lokal belum menerima Phase 6A. UI edukasi merupakan cakupan Phase 6B.

## Baseline dan audit

Checkout aktif `BE` pada `90ad4081b608e1895fbe0d5d062d2a75687a1565` dan working tree bersih saat mulai. Arsip kompatibilitas browser memakai `FE` pada `d9ae42665fd438e0188bd86625b18e59a6b3509c`. Skill **ponytail** dipakai untuk reuse sesi, RBAC, origin, envelope, migrasi tertanam, dan fixture existing. Baseline Go test, vet, build, serta API Phase 1–5A lulus sebelum implementasi.

Audit mencakup catatan Phase 1–5A, recovery login, registrasi rute, handler dan repository, skema migrasi, dan UI arsip FE. Database utama `ecorecycle` telah menjalani recovery 002–004 pada pekerjaan sebelumnya. Phase 6A memakai MariaDB 10.4.32 terisolasi. [Laporan recovery](BE_LOGIN_FACILITY_RECOVERY.md)

CMS `portal_announcements` menyimpan pesan singkat, target role, status aktif dan pembuat. Daftarnya memerlukan sesi, dan hanya Administrator yang dapat menerbitkan, toggle atau menghapus pengumuman. Tidak ada struktur artikel publik, slug, kategori, isi panjang, atau status draft/arsip. Reuse pola API dan otorisasi tetap dilakukan. Penyimpanan artikel dibuat terpisah agar perilaku pengumuman dan hak Administrator tetap sesuai kontraknya.

## Model dan keputusan

- `education_articles` menyimpan ID, slug unik, judul, ringkasan, isi teks biasa, kategori, daftar URL sumber, status, versi, pembuat, editor terakhir, serta waktu dibuat, diperbarui, dan terbit. Kedua ID aktor mengacu ke `users`. Audit mencatat pembuat dan editor terakhir, mengikuti kebutuhan modul tanpa tabel histori revisi baru.
- Tujuh kategori tetap memakai key pada kolom ENUM dan label dari API. Kategorinya Pemilahan Sampah, Pengurangan Sampah, Daur Ulang, Pengomposan, Bank Sampah, Sampah Elektronik, dan Panduan SAMPIRA.
- Admin membuat dan mengedit draft, menerbitkan draft, atau mengarsipkan draft maupun artikel terbit. Arsip terminal dan tetap memiliki slug. Perubahan versi dan status dijaga pada pembaruan SQL atomik. Publik membaca artikel terbit saja. Administrator tetap memegang CMS pengumuman. Hak pengelolaan artikel untuk Admin adalah keputusan Phase 6A mengikuti peran pengelola konten pada brief.
- API publik menggunakan `/api/ecorecycle/education/articles` dan detail slug. API Admin menggunakan `/api/ecorecycle/education/manage/articles`, detail ID, PUT edit, dan POST publication. Daftar mendukung kategori, pencarian literal, dan pagination. Daftar publik mengurutkan berdasarkan waktu publikasi terbaru dan Admin berdasarkan ID terbaru. [Kontrak API](PHASE_06_API_CONTRACT.md)
- Input memiliki batas body, panjang teks, format slug, kategori tetap, dan hanya menerima URL sumber HTTPS tanpa kredensial. Markup dan field tambahan ditolak. Pencarian parameterized dengan escape wildcard literal. API publik tidak mengirim aktor internal, status draf, dan versi. Handoff mewajibkan rendering node teks.
- Migrasi `005_education_content.sql` membuat satu tabel beserta indeks, FK dan constraint. Startup menerapkannya setelah 004. Konten awal menggunakan draft yang ditulis dan ditinjau Admin. Fixture membuat contoh panduan sintetis melalui API, tanpa seed otomatis.
- Sebelum penerapan pada database berisi data, buat backup dan buktikan restore. Bila diperlukan, rollback biner dapat memakai skema tambahan yang tetap terpasang. Untuk pemulihan database, pulihkan snapshot ke skema terpisah, validasi, lalu lakukan cutover dengan rekonsiliasi penulisan setelah backup. [Catatan integrasi](PHASE_06_BE_INTEGRATION_NOTES.md)

## Branding dan kesiapan dashboard

| Area | Keputusan |
|---|---|
| Banner startup Go | Berubah dari EcoRecycle ke SAMPIRA. |
| Judul dokumentasi Swagger | Berubah ke Dokumentasi API SAMPIRA. OpenAPI menambah Education dan naik ke versi dokumen 4.1.0. |
| Identitas visual dan persona lama | View, aset, istilah portal seperti Eco Warrior dan Eco Collector, serta riwayat yang sudah tersimpan diserahkan ke scope rebranding Phase 6B sesuai kompatibilitas. |
| Technical legacy | `ecorecycle` sebagai database default dan modul Go, `/api/ecorecycle/`, role, nama tabel/kolom, cookie `sampira_session`, `ECR-` tracking dan identitas lama tetap kompatibel. Nama pada penolakan secret legacy dan label template konfigurasi tidak mengubah kontrak. |
| User | Profil, daftar/pengajuan pickup, tracking, status reward, laporan, progres dan lokasi tersedia melalui API existing. Edukasi memakai API publik. |
| Petugas | Pickup, klaim, progres, timbang, tujuan berizin, tugas fasilitas, asesmen dan bukti tersedia melalui API existing. |
| Admin | Verifikasi, assignment, monitoring, review, histori dan koordinasi existing. Pengelolaan artikel ditambahkan pada namespace baru. |
| Administrator | Statistik agregat, CMS pengumuman, dan pencatatan pembayaran reward existing. Bootstrap Administrator tetap lewat CLI. Scope ini tidak menambah API manajemen akun umum. |

## File

- Migrasi dan startup di `db_init/migrations/005_education_content.sql`, `db_init/migrations/facility_reports.go`, dan `cmd/server/main.go`.
- Model, repository, validasi, dan handler edukasi di `internal/models/education.go`, `internal/repositories/education.go`, `internal/handlers/education.go`, `internal/handlers/education_validation.go`, dan registrasi repository di `internal/handlers/auth_handler.go`.
- Fixture di `scripts/check-phase6-education.mjs` dan hook `scripts/check-phase1-migration.mjs`.
- Dokumentasi di `docs/openapi.json`, `docs/swagger.html`, laporan ini, kontrak, dan catatan integrasi.

## Pengujian

| Uji | Hasil |
|---|---|
| Go unit, vet, build server/initializer | PASS. |
| Migrasi 005 dan replay | PASS pada restore fixture berisi Phase 1–5. Checksum, kolom, indeks dan FK lama sama sebelum dan sesudah migrasi. Tabel artikel awal kosong. |
| API edukasi | PASS untuk empat role, sesi cookie/origin, buat/edit/publish/archive, draft dan arsip 404 publik, pagination, filter, pencarian literal, slug unik, audit, validasi body, markup/URL berbahaya, input injeksi, dan dua publikasi bersamaan yang menghasilkan 200 dan 409. |
| API Phase 1–5A | PASS untuk login, pickup/reward/payout, laporan dan verifikasi, penanganan dan koordinasi, foto privat, serta presisi dan akses koordinat. |
| Chromium dengan BE Phase 6A dan arsip FE | PASS untuk empat portal, Phase 3B, 4B, dan 5B existing. Skenario peta meliputi penyimpanan koordinat, marker berizin, GPS, fallback dan pencabutan akses. Rute jalan memakai respons simulasi. Perbaikan peta dari worktree FE yang belum di-commit tidak termasuk arsip ini. |
| Deployment utama | Belum dijalankan. Provider routing produksi dan UI edukasi Phase 6B berada di luar verifikasi fixture. |

## Penerimaan

- [x] CMS existing diaudit dan kebijakan role dipertahankan.
- [x] Artikel publik, pengelolaan Admin, kategori, filter, pencarian, dan pagination tersedia.
- [x] Draft/arsip privat, validasi konten, dan konflik versi diuji.
- [x] Identitas Backend dan technical legacy diaudit.
- [x] Regresi empat dashboard, workflow dan lokasi lulus pada fixture.
- [x] Migrasi aditif dan restore fixture lulus.
- [x] OpenAPI dan handoff Phase 6B lengkap.
- [x] Perubahan tinggal lokal pada BE dan terbatas pada Backend, fixture serta dokumentasi. View dan aset Frontend tidak berubah.
