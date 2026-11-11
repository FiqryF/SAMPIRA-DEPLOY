# SAMPIRA Development Changelog

## Phase 1

### Added
- Role Administrator, CLI bootstrap, portal, CMS Administrator, dan pemeriksaan sesi.
- Harness API, Chromium, backup dan restore.

### Changed
- Collector menjadi Petugas dengan ID yang sama. Admin dipisahkan dari alur pickup.
- Browser memakai cookie HttpOnly dan role dari sesi server.

### Fixed
- Hak registrasi publik, tracking tanpa kepemilikan, dan klaim yang berisiko konflik.

### Security
- Role aktual dan akun aktif diperiksa pada setiap sesi. Logout mencabut digest. Penulisan browser lintas origin ditolak.
- Akun seed lokal dinonaktifkan setelah persetujuan operator.

### Database
- Migrasi empat role, sesi, dan status akun aktif. Snapshot lama serta relasi dipertahankan.

### Testing
- Go, RBAC, sesi, Chromium empat role, dan restore terisolasi.

## Phase 2

### Added
- Aktor histori, ledger kewajiban, bukti pembayaran manual, dan form Administrator.

### Changed
- Penimbangan aktual menutup pickup dan mencatat kewajiban secara atomik. Pembayaran memiliki status tersendiri.
- Portal User menampilkan estimasi, berat aktual, status bayar, dan riwayat.

### Fixed
- Validasi alamat, kontak, berat dan unggahan di backend. Penghitungan reward memakai data aktual.

### Security
- Hak timbang terbatas pada Petugas yang ditugaskan. Administrator berwenang mencatat pembayaran eksternal.
- Nominal yang berbeda, referensi berulang, dan digest bukti berulang ditolak.

### Database
- Tabel `pickup_rewards` dengan satu baris per pickup dan FK audit. Histori transaksi lama disimpan.

### Testing
- Klaim, timbang dan pembayaran serentak, isolasi bukti, nominal nol, serta alur browser.

## Post-Phase Audit

### Added
- Laporan kumulatif, tes parser body-only, serta verifikasi ledger dan aktor pada restore.

### Changed
- Landing menghitung estimasi dari API. Metrik kontribusi menghitung berat aktual pickup selesai dengan ledger.
- Tracking membaca detail dan histori dari snapshot yang sama.

### Fixed
- Parameter URL tak lagi diterima sebagai kredensial atau nilai body form.
- Histori yang gagal dibaca menghasilkan error.
- Pickup dengan transaksi lama tanpa ledger baru ditandai perlu rekonsiliasi.

### Remaining Issues
- Kredensial Administrator lokal perlu dirotasi sebelum publik. Akun operasional User dan Petugas perlu diprovisikan.
- Bukti manual memerlukan verifikasi operator. Transfer riil dan HTTPS publik belum diuji.
- Temuan gaya dan audit a11y yang lebih luas direncanakan untuk Phase 5.

[Laporan kumulatif dan bukti](SAMPIRA_PHASE_01_02_COMPREHENSIVE_REPORT.md)
