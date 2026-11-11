# QA Admin · Phase 6B.4

Baseline dan regresi menggunakan Chrome/Chromium dan server Go yang dibangun dari `BE 42bfc3f`. Database serta akun uji dibuat oleh `scripts/check-phase6b-fixture.ps1`. Cakupan pengujian browser meliputi verifikasi, revisi dan penolakan, penugasan dan pengalihan, aktivitas lapangan, review, koordinasi, foto, histori, kontrol peran, dan akses lokasi. Pengujian edukasi membuat dan mengedit draf, memeriksa pratinjau, menerbitkan, menelusuri artikel publik, serta mengarsipkannya. Smoke test juga berjalan untuk role lain.

Ringkasan diuji pada lebar 320, 360, 390, 430, 768, 1024, 1280, dan 1440 px. Cakupan ini memeriksa lebar halaman dan navigasi menu ponsel. Daftar artikel diperiksa pada 390 dan 1440 px. Verifikasi, penanganan, dialog, editor, dan peta diperiksa melalui tangkapan layar desktop. QA menemukan tombol Detail terpecah di desktop dan memerlukan gulir horizontal di ponsel. Setelah iterasi, tanggal digabung dengan identitas laporan, tombol dipertahankan satu baris, dan ikon antrean diberi bentuk sesuai tindakan.

| Layar | Nama bukti PNG |
| --- | --- |
| Ringkasan desktop dan ponsel | `admin-overview-1440.png`, `admin-overview-390.png` |
| Verifikasi | `03-verifikasi-daftar.png`, `04-verifikasi-detail.png` |
| Penanganan | `05-penanganan-monitor.png`, `06-penanganan-detail.png` |
| Dialog operasional | `07-penugasan.png`, `08-validasi-hasil.png`, `09-koordinasi.png` |
| Peta dengan marker dan popup | `admin-map-1440.png` |
| Daftar CMS dan editor | `admin-education-1440.png`, `admin-education-390.png`, `admin-editor-1440.png` |

Pengujian ulang setelah iterasi selesai dengan exit code 0. Pemeriksaan exception JavaScript dan error konsol dalam suite lulus. Tiga belas bukti Admin berada di direktori `SAMPIRA-Phase6B-Live/admin-6b4` di workspace visualisasi Codex. Jalankan suite dari root repo dengan `.\scripts\check-phase6b-fixture.ps1 -Screenshots <direktori>`. Untuk bukti dialog fase 3–4, isi juga variabel `SAMPIRA_ADMIN_SCREENSHOTS` dengan direktori yang sama.

Status belum terverifikasi mencakup browser terautentikasi pada URL lokal 8082, pengujian pembaca layar, matriks seluruh dialog di delapan lebar, dan deployment produksi. Pemeriksaan aksesibilitas fase ini mencakup elemen semantik, status teks, serta navigasi keyboard yang diuji di fixture.
