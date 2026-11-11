# Phase 6B.4 · Portal Admin SAMPIRA

Implementasi dilakukan pada working tree `FE` di atas `d863b74`. Baseline dan pengujian browser menggunakan executable `BE` pada `42bfc3f8bb0c910cc76ddbce8095342a378028de` dengan MariaDB terisolasi. Perubahan Portal Warga yang sudah ada dipertahankan. Fase ini terbatas pada Frontend Admin, pengujian, dan dokumentasi.

| Area yang diaudit | Hasil implementasi |
| --- | --- |
| Login, sesi, profil, dan keluar | Sesi dan akses Admin mengikuti server. Profil singkat menggunakan data akun yang sudah tersedia. |
| Ringkasan | Empat indikator antrean, maksimal delapan laporan terbaru, serta pintasan ke verifikasi, peta, dan penanganan. Semua nilai berasal dari respons API. |
| Verifikasi | Tabel dengan filter status dan kategori, detail, foto, histori, serta tindakan setujui, minta revisi, dan tolak. |
| Penugasan dan pengalihan | Dibuka dari detail penanganan. Form memuat petugas aktif dan tetap meminta alasan internal untuk pengalihan. |
| Monitoring dan validasi | Tabel penanganan, detail tugas, timeline, bukti, serta konfirmasi persetujuan atau permintaan perbaikan hasil. |
| Koordinasi eksternal | Tindakan dan riwayat berada pada detail yang sama dengan status koordinasi terpisah. |
| Monitoring Peta | Leaflet, filter, titik yang diizinkan, daftar alamat cadangan, dan akses ke detail laporan atau penanganan. |
| Artikel Edukasi | Daftar dengan pencarian dan filter, editor draf, pratinjau teks, penerbitan, serta arsip. |

Navigasi utama terdiri atas Ringkasan, Verifikasi Laporan, Penanganan Laporan, Monitoring Peta, dan Artikel Edukasi. Penugasan, validasi, dan koordinasi menggunakan konteks laporan dari detail penanganan agar Admin dapat meninjau status dan bukti sebelum bertindak.

Baseline sebelum redesign lulus. Suite Chromium setelah redesign mencakup regresi Admin, Warga, Petugas, Administrator, landing, login, registrasi, dan pembaca edukasi. Skenario Admin memakai data uji yang ditulis melalui API ke database fixture. Lihat [QA visual](PHASE_06_FE_ADMIN_VISUAL_QA.md) untuk cakupan, bukti, dan batas verifikasi.

Skill yang dipakai adalah `frontend-design` untuk arah visual, `ui-taste` untuk komposisi dan pemeriksaan visual, `ponytail` untuk memanfaatkan komponen serta API yang ada, dan `imagegen` untuk acuan visual internal.

- [Sistem desain](PHASE_06_FE_ADMIN_DESIGN_SYSTEM.md)
- [QA visual dan regresi](PHASE_06_FE_ADMIN_VISUAL_QA.md)
- [Integrasi API dan runtime lokal](PHASE_06_FE_ADMIN_INTEGRATION_NOTES.md)
