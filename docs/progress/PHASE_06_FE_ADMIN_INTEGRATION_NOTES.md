# Integrasi Admin · Phase 6B.4

| Fitur | Rute existing |
| --- | --- |
| Ringkasan | `GET /api/ecorecycle/facility-reports?limit=20` dan `GET /api/ecorecycle/facility-reports/handling?limit=20`. |
| Verifikasi | Base `/api/ecorecycle/facility-reports`. `GET` daftar, `/{id}`, `/{id}/history`, `/{id}/photo`. `POST /{id}/verification`. |
| Penanganan dan penugasan | Base yang sama. `GET /handling`, `/handling/officers`, `/{id}/handling`, `/{id}/handling/history`, dan bukti di `/{id}/handling/history/{version}/photo`. `POST /{id}/handling/assignment` juga dipakai untuk pengalihan. |
| Validasi dan koordinasi | `POST /{id}/handling/review` dan `POST /{id}/handling/coordination`. |
| Peta | Daftar verifikasi dan penanganan dengan filter dan cursor. Detail penanganan yang diizinkan dimuat saat diperlukan. |
| Artikel | Base `/api/ecorecycle/education/manage/articles`. `GET` daftar dan detail, `POST` draf, `PUT /{id}` draf, `POST /{id}/publication` untuk terbit atau arsip. |
| Profil dan sesi | `GET /api/user/profile` dan `POST /logout`, sesuai sesi cookie yang sama. |

Cuplikan dashboard menghitung nilai dari maksimal 20 item per respons. Total global akan memerlukan dukungan agregasi dari Backend. Verifikasi (`pending`, `revision_required`, `approved`, `rejected`), penanganan, penugasan, dan koordinasi ditampilkan sesuai sumber status masing-masing. Koordinasi memakai status `forwarded`, `receipt_confirmed`, `follow_up_reported`, dan `resolution_verified`. Pengiriman yang mengubah data tetap memakai versi dari API. Konflik 409 meminta Admin meninjau data terbaru. Akses foto dan aksi mengikuti otorisasi Backend.

Peta membuat marker dari pasangan koordinat valid yang dikembalikan API. Laporan historis tanpa titik tetap muncul dalam daftar alamat. Peta membutuhkan Leaflet dan tile OpenStreetMap, sehingga daftar alamat tetap tersedia jika pemuatan peta gagal. Cakupan status, kategori, dan pengguliran data mengikuti API yang berhalaman.

## Runtime pengembangan

URL yang dipakai untuk smoke test lokal adalah [http://localhost:8082/admin](http://localhost:8082/admin). Backend berasal dari `BE 42bfc3f` dan membaca view serta aset dari working tree `FE` melalui junction runtime. MariaDB klon berada di `127.0.0.1:24369/ecorecycle`. Pada pemeriksaan, PID aplikasi 4852 dan PID MariaDB 20508. Smoke test anonim menghasilkan HTTP 303 untuk halaman Admin, 401 untuk API laporan fasilitas, dan 200 untuk login, API edukasi publik, CSS, serta modul Admin. Hash template melalui junction dan hash aset dari respons HTTP cocok dengan file di working tree. Render Admin terautentikasi diuji di fixture Chromium terpisah. Pada port 8080, API laporan mengembalikan 404 ketika diaudit.

Dari direktori `SAMPIRA-Phase6B-Live`, jalankan `.\sampira-live.ps1 Start -Port 8082`. Gunakan `.\sampira-live.ps1 Status` untuk memeriksa proses dan `.\sampira-live.ps1 Stop` untuk menghentikan instance yang dikelola skrip tersebut.
