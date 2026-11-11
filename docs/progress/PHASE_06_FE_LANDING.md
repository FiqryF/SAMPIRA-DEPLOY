# SAMPIRA Phase 6B.1 — Redesain landing page dan verifikasi visual

## Baseline dan cakupan

Pekerjaan dilakukan di `FE` pada baseline Git `d9ae426`, dengan perubahan Phase 6B terdahulu sudah tersedia di working tree. Sebelum edit, Chromium membuka landing di port 8080 dan mencatat hero lama, konfigurasi navigasi, dan integrasi edukasi. Pemeriksaan sumber menemukan bahwa `/` dan `/home` memakai `app/Views/index.html`. CSS lama `assets/css/landing.css` dipakai hanya oleh landing, sedangkan modul edukasi dan kategori juga dipakai halaman lain. Perubahan modul bersama memakai opsi khusus landing dengan perilaku default yang sama.

Inventaris fitur sebelumnya mencakup logo, tautan Masuk dan Daftar, menu mobile, anchor, informasi empat kelompok sampah, kalkulator estimasi, FAQ, Edukasi, dan kontrol gerak. Ketiga layanan yang membutuhkan akun tetap mengarah ke halaman Masuk. CTA daftar memakai `/register` dan Pusat Edukasi memakai `/assets/education.html`. Tidak ada mekanisme navigasi berbasis sesi pada landing awal. Jenis sampah dan kalkulator kini berada di dua panel lipat di bawah kartu layanan.

Scope desain terbatas pada landing. Go, kontrak, migrasi, database utama, dan template portal berada di luar perubahan Phase 6B.1.

## Desain dan perbandingan referensi

| Bagian | Implementasi dan penyesuaian |
| --- | --- |
| Header | Logo kiri, lima tujuan di tengah, Masuk dan Daftar di kanan. Pada layar kecil, menu yang bisa dibuka dengan keyboard menampilkan kedua akses akun. |
| Hero | Headline “Laporkan Sampah, Pantau Perubahannya.”, copy dan CTA di kiri, ilustrasi penjemputan Bandung di kanan. Komposisi desktop sekitar 48:52 sebelum gambar diperpanjang ke tepi. Lebar judul dikoreksi setelah review pertama agar penekanan tetap dua baris pada 1280 dan 1440 px. Crop tablet digeser untuk memperlihatkan kedua subjek. Ponsel menempatkan gambar setelah CTA. |
| Layanan | Empat kartu ikon outline, label dan uraian ringkas. Alur layanan mengarah ke portal atau edukasi publik. Informasi kategori dan estimasi berada di panel lipat. |
| Cara kerja | Dua alur terpisah dengan empat langkah masing-masing. Penjemputan dapat diproses petugas setelah klaim, sedangkan laporan fasilitas melalui verifikasi dan validasi Admin. |
| Manfaat | Susunan editorial dengan empat kelompok manfaat, tanpa statistik atau preview dashboard. |
| Edukasi | Maksimal tiga artikel terbit dari `GET /api/ecorecycle/education/articles?limit=3`. Kartu menampilkan kategori, judul, ringkasan, tanggal, dan tautan detail. Respons loading, kosong dan error tampil di area ini. Kontrak belum menyediakan gambar artikel, jadi kartu menggunakan hierarki tipografi. |
| Closing CTA | Satu ajakan daftar di permukaan hijau gelap dengan bentuk perbukitan sederhana agar tombol tetap terbaca. |
| FAQ | Lima accordion native tentang pengajuan, laporan, tracking, peta, dan reward manual. |
| Footer | Empat kelompok informasi, navigasi, layanan, dan identitas. Informasi kontak hanya dapat ditambahkan saat tersedia. |

Sistem visual menggunakan Manrope untuk judul, Inter untuk isi, warna primer `#174c3c`, hijau gelap `#103d2f`, teks `#182c23`, teks sekunder `#4b6459`, latar `#f7f9f5`, kartu putih dan aksen `#eaf3eb`. Jarak tepi responsif 16–72 px, radius kartu 14 px dan kontrol utama minimum 44 px. Transisi singkat hanya untuk interaksi. Preferensi reduced motion dan kontrol jeda juga mengatur smooth scrolling. Penggunaan skill `frontend-design` dan `ui-taste` menghasilkan susunan dari referensi dan iterasi crop serta hierarki judul. `ponytail` diterapkan dengan mempertahankan komponen browser native dan fungsi API yang sudah ada.

## Aset dan performa

Ilustrasi dibuat dengan tool bawaan `imagegen`, lalu dikonversi menjadi dua WebP. [640 px](<C:/xampp/htdocs/tubes/assets/img/landing-bandung-640.webp>) · [1280 px](<C:/xampp/htdocs/tubes/assets/img/landing-bandung-1280.webp>).

Prompt ilustrasi

> Create a single landscape 3:2 image for the right half of a premium civic waste-services website for Bandung, Indonesia. Warm editorial photorealism, natural human proportions. Foreground center-right, a smiling Indonesian municipal sanitation worker in plain forest-green uniform and cap receives a tied charcoal refuse bag from an Indonesian adult woman in a cream linen shirt, both standing, framed thighs up; show an authentic simple exchange with realistic hands. A compact white and green waste collection truck parked at middle left with one simple recycling symbol only. In the background, Bandung's recognizable Gedung Sate roof and central spire behind leafy city trees and a well-maintained public verge, bright blue sky and soft clouds. Sunlit daylight, refined natural greens, credible documentary feeling. Keep worker and woman inside the central 75 percent so a mobile wide crop holds both faces. The left edge contains airy sky, park and truck, without a person near the edge, so that a website can softly fade that edge into an ivory background. Composition fills the frame. No words, no letters, no signage, no brand, no borders, no UI, no watermark.

Gambar hero lama berukuran 1.789.556 byte. Varian baru berukuran 180.518 byte pada desktop dan 72.764 byte pada ponsel. Chrome mengukur ukuran resource desktop 180.518 byte dan memilih varian 640 px saat membuka halaman pada 390 px dengan DPR 1. Elemen gambar menyertakan dimensi, prioritas tinggi dan `srcset`. Edukasi dimuat terpisah dari render utama. Pemeriksaan ini tidak menghasilkan skor Lighthouse atau pengukuran jaringan lapangan.

## Runtime dan fungsi

Server yang dilihat pengguna tetap [localhost:8080](http://localhost:8080), Go PID `30696`, Backend arsip `BE` commit `42bfc3f8bb0c910cc76ddbce8095342a378028de`. Working directory `SAMPIRA-Phase6B-Live/runtime` memakai junction `app` dan `assets` langsung ke `C:/xampp/htdocs/tubes`. Backend membaca salinan database lokal di port 24369. Pemeriksaan HTTP pada `/`, `/home`, CSS, modul JavaScript dan WebP mendapatkan 200 serta byte yang sama dengan source FE. URL CSS dan JS landing memakai versi Phase 6B.1 dan server mengirim `Last-Modified`. Tidak perlu mengganti proses server untuk perubahan view atau aset.

- Estimasi tetap memakai `POST /api/ecorecycle/estimate_reward`. Nilai bersih UI dibandingkan dengan respons server untuk input yang sama. Dropdown landing menampilkan nama kategori saja agar tidak menampilkan tarif katalog sebelum perhitungan. Nilai final tetap mengikuti penimbangan dan verifikasi.
- Chromium lokal memeriksa 320, 360, 390, 430, 768, 1024, 1280 dan 1440 px tanpa overflow dokumen. Menu diuji dengan Enter dan Escape, termasuk fokus ke anchor. FAQ diuji dengan Enter. Tautan Masuk, Daftar dan Pusat Edukasi dibuka dari UI. Tidak ada exception, error konsol aplikasi, atau kegagalan jaringan satu origin dalam uji tersebut.
- Edukasi publik lokal merespons 200 dengan daftar kosong. Keadaan kosong diperiksa di 8080. Daftar berisi dan klik ke detail artikel diuji dengan API asli di fixture yang memakai data terisolasi.
- Kontras pasangan token yang dihitung adalah 13,93:1 untuk teks utama dan latar, 6,07:1 untuk teks sekunder dan latar, 9,83:1 untuk CTA, serta 9,89:1 untuk teks footer. Pemeriksaan keyboard, label, alt dan heading mendukung target aksesibilitas. Kepatuhan penuh WCAG, pembaca layar, browser lain dan perangkat fisik belum diuji.
- Fixture lintas branch memakai origin 24934 dan database 24367. Smoke test login, registrasi dan portal Warga, Petugas, Admin dan Administrator memakai data uji. Pengujian tidak menambahkan artikel atau melakukan mutasi workflow pada data lokal pengguna.

## Screenshot dan pemeriksaan visual

| Bukti | Gambar |
| --- | --- |
| Baseline sebelum perubahan | [Desktop](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/landing-6b1-baseline/landing-8080-1440.png>) · [Mobile](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/landing-6b1-baseline/landing-8080-390.png>) |
| 8080 desktop | [1440 px](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/landing-6b1-live/landing-1440.png>) · [1280 px](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/landing-6b1-live/landing-1280.png>) |
| 8080 tablet | [768 px](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/landing-6b1-live/landing-768.png>) |
| 8080 mobile | [390 px](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/landing-6b1-live/landing-390.png>) · [320 px](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/landing-6b1-live/landing-320.png>) |
| 8080 area hero | [Desktop](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/landing-6b1-live/hero-1440.png>) · [Mobile](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/landing-6b1-live/hero-390.png>) |
| Fixture edukasi | [Landing dengan artikel terbit](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/landing-6b1-fixture/landing-1440.png>) |

## File yang disentuh

- `app/Views/index.html`, `assets/css/landing.css` dan `assets/js/home.js` untuk struktur, styling, navigasi, estimator dan interaksi.
- `assets/js/education.js` dan `assets/js/waste-categories.js` untuk keadaan kosong dan opsi label kategori landing.
- `assets/img/landing-bandung-640.webp` dan `assets/img/landing-bandung-1280.webp` untuk gambar hero.
- `scripts/check-landing-frontend.mjs`, `scripts/check-phase1-browser.mjs`, `scripts/check-phase6-frontend.mjs` dan `scripts/check-phase6b-fixture.ps1` untuk pengujian dan tangkapan ulang.

Verifikasi dapat diulang dengan `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/check-phase6b-fixture.ps1`. Uji landing di 8080 dan regresi fixture Phase 1–6B lulus. Temuan utama yang dikoreksi adalah headline desktop yang semula menjadi tiga baris dan framing tablet yang semula memotong wajah warga. Bagian visual dan hasil pengujian disimpan dalam dokumen yang sama.
