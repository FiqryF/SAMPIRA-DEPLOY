# SAMPIRA Phase 6B.2 — Login, Register, dan Visual QA

## Baseline dan kontrak

Pekerjaan berlangsung pada `FE` dengan perubahan Phase 6B yang sudah ada di working tree. Chrome pada 8080 mengonfirmasi bahwa baseline masih memakai panel ilustrasi dan formulir terpisah. Baseline berhasil memuat dua route tanpa exception. Audit kontrak memakai Backend `BE` commit `42bfc3f`, handler autentikasi, dan dokumen operasi Phase 1.

| Alur | Kontrak yang dipertahankan |
| --- | --- |
| Masuk | `POST /api/auth/login` dengan `email` dan `password`. Header portal `X-SAMPIRA-Portal: 1` meminta respons ringkas tanpa token Bearer. |
| Daftar | `POST /api/auth/register` dengan `name`, `email`, dan `password`. Role Warga ditetapkan Backend. Konfirmasi digunakan hanya untuk validasi di browser. |
| Kata sandi daftar | Backend memeriksa panjang UTF-8 6–72 byte. Formulir mencocokkan batas tersebut, termasuk masukan multibyte. Login tidak menerapkan batas pendaftaran pada akun lama. |
| Sesi | Backend mengatur cookie `sampira_session` HttpOnly dan SameSite=Lax, masa berlaku 24 jam, serta pemeriksaan origin. Frontend memakai request same-origin. Password, profil, dan token tidak ditulis ke penyimpanan browser oleh form. |
| Redirect | Role dari server mengarah ke `/dashboard`, `/petugas`, `/admin`, atau `/administrator`. Logout tetap lewat `POST /logout`. |

Referensi menampilkan nomor telepon, email opsional, Ingat Saya, lupa password, dan persetujuan ketentuan. Route dan handler yang diaudit memakai email wajib dan tidak menyediakan login telepon, opsi perpanjangan sesi, pemulihan sandi, atau halaman ketentuan. Kontrol tersebut tidak muncul di form. Tidak ada opsi Google OAuth pada dua route aktif.

## Desain dan perilaku

- Login dan Register memakai satu kartu putih di tengah dengan panel ilustrasi Bandung, tepian bergelombang, logo SAMPIRA, lalu formulir. Tombol **Kembali ke Beranda** di kiri atas mengarah ke `/home`. Tautan bantuan dan perpindahan antara Login dan Register tetap aktif.
- Form memakai label terhubung, autocomplete sesuai isi, target input dan tombol utama minimal 44 px, fokus terlihat, serta kontrol kata sandi yang dapat diaktifkan dengan keyboard. Transisi dihentikan pada reduced motion.
- Field kosong, email dengan format salah, panjang sandi, dan konfirmasi yang berbeda mendapat pesan inline. Respons kredensial salah atau akun tidak aktif memakai pesan umum. Kegagalan layanan, koneksi, serta penolakan request mempunyai pesan pemulihan yang berbeda. Pesan mentah server tidak diteruskan ke UI.
- Pengiriman menonaktifkan tombol, mengumumkan status, dan menahan pengiriman ganda. Register yang berhasil menampilkan konfirmasi dalam kartu dan tautan ke Login. Kata sandi pada form dihapus setelah sukses.
- `frontend-design` dan `ui-taste` diterapkan melalui komposisi kartu yang mengikuti referensi, keterbacaan input, dan pemeriksaan nyata. `ponytail` menjaga satu stylesheet, satu modul JavaScript, dan elemen browser native. Tool bawaan `imagegen` membuat ilustrasi terpisah dari UI, dikompresi menjadi WebP 960×320, 102.166 byte. [Aset ilustrasi](<C:/xampp/htdocs/tubes/assets/img/auth-bandung.webp>).

Prompt ilustrasi

> Wide landscape editorial digital illustration for the top banner of a Bandung waste-services sign-in card. Inspired by a warm, polished Indonesian civic website. Gedung Sate in Bandung recognizable by its white facade and characteristic central roof and spire, slightly right of center. A small green and white waste collection truck with one simple recycling symbol, left of center, and one green and one yellow bin on a clean park-side street. Lush well-defined trees, bright morning light, pale cyan sky, subtle urban skyline behind. Refined clean painterly illustration with a slightly stylized, dimensional editorial look, balanced natural forest and lime greens. Compose all three subjects in the central horizontal belt, with their important details within the middle 75% of the width, so the image can crop to a 3.2:1 header; tree foliage and sky above can be cut. No people needed. No UI, no lettering, no branding, no watermark. No text. The image fills the canvas.

## Verifikasi

| Cakupan | Bukti |
| --- | --- |
| Runtime 8080 | `/login`, `/register`, CSS dan JavaScript Phase 6B.2, dan WebP mengembalikan HTTP 200 dengan byte yang sama dengan file FE. |
| Chrome pada 8080 | Kedua halaman diuji pada 320, 360, 390, 430, 768, 1024, 1280 dan 1440 px tanpa overflow horizontal. Pemeriksaan mencakup posisi tombol kembali, label, validasi inline, toggle keyboard, error login dari API asli, loading, deduplikasi submit, HTTP 503 simulasi, perpindahan halaman, dan reduced motion. Tidak ada exception JavaScript atau kegagalan pemuatan satu origin dalam pengujian. |
| Regresi dengan database fixture | Login dan redirect keempat role, cookie sesi, logout, dan pendaftaran Warga diuji dengan akun sintetis. Alur landing, edukasi, laporan fasilitas, penugasan, peta dan reward ikut diperiksa oleh suite Phase 1–6B. |

Kontras pasangan warna yang dihitung adalah 14,75:1 untuk teks utama, 5,51:1 untuk placeholder, 9,83:1 untuk tombol utama, dan 7,52:1 untuk pesan gagal. Tidak ada registrasi atau perubahan akun pengguna pada database utama. Pengujian viewport menggunakan emulasi Chrome. Pembaca layar, perangkat fisik, dan kepatuhan penuh WCAG belum diperiksa.

## Screenshot

| Tampilan | Bukti dari Chrome di localhost:8080 |
| --- | --- |
| Login | [1440 px](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/auth-6b2-live/login-1440.png>) · [390 px](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/auth-6b2-live/login-390.png>) · [320 px](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/auth-6b2-live/login-320.png>) |
| Register | [1440 px](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/auth-6b2-live/register-1440.png>) · [390 px](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/auth-6b2-live/register-390.png>) · [320 px](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/auth-6b2-live/register-320.png>) |
| Validasi | [Kredensial salah](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/auth-6b2-live/login-error-390.png>) · [Konfirmasi tidak cocok](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/auth-6b2-live/register-mismatch-390.png>) |
| Baseline sebelum perubahan | [Login](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/auth-6b2-baseline/login-1440.png>) · [Register](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/auth-6b2-baseline/register-1440.png>) |

Pada layar lebar kartu dipusatkan, sementara ponsel tetap mengikuti aliran halaman agar formulir dapat digulir. Ilustrasi, tombol kembali, logo dan formulir terpisah sebagai elemen HTML. Kartu Register mengikuti tinggi alami isian. Tautan bantuan dipertahankan di bawah tautan perpindahan akun.

## File

- `app/Views/login.html`, `app/Views/register.html`, `assets/css/auth-flat.css`, `assets/js/auth.js`, dan `assets/img/auth-bandung.webp`.
- `scripts/check-auth-frontend.mjs`, `scripts/check-phase1-browser.mjs`, `scripts/check-phase3-frontend.mjs`, `scripts/check-landing-frontend.mjs`, dan `scripts/check-phase6b-fixture.ps1` untuk bukti dan regresi.

Uji Chrome pada 8080 dan regresi fixture Phase 1–6B lulus. Skrip registrasi menunggu panel sukses benar-benar terlihat sebelum menekan tautan masuk. Pengujian fixture dapat diulang dari FE dengan `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/check-phase6b-fixture.ps1`. Source Go, migrasi, dan tampilan landing atau portal tidak diubah dalam pekerjaan ini. Dokumen ini menggabungkan laporan implementasi dan Visual QA.

## Penyesuaian latar dan tombol kembali

Login dan Register berbagi ilustrasi latar baru dari tool bawaan `imagegen`, berukuran 44.966 byte dalam format WebP. Lapisan blur berada di belakang kartu. Tombol kembali memakai ikon panah dengan area klik 44×44 px dan label aksesibel “Kembali ke Beranda”. Chrome pada 8080 memverifikasi kedua halaman pada delapan viewport dan mengaktifkan tombol kembali dengan Enter. [Aset latar](<C:/xampp/htdocs/tubes/assets/img/auth-bandung-background.webp>) · [Login desktop](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/auth-6b2-background/login-1440.png>) · [Register mobile](<C:/Users/FIQRY FIRMANSYAH/.codex/visualizations/2026/11/05/01a1ad5d-f300-7af2-8431-4d188d8eeb81/SAMPIRA-Phase6B-Live/auth-6b2-background/register-390.png>).

Prompt ilustrasi latar

> Generate one wide landscape 16:9 background-only image for a Bandung civic recycling website login screen. Match a polished colorful semi-realistic editorial digital landscape illustration of green Bandung, soft turquoise sky, distant silhouette of Gedung Sate roof and spire, lush trees and public park, pale morning sunlight. Make it deliberately softly defocused across the ENTIRE frame, subtle bokeh, blurred enough that the landscape is atmospheric but is visibly an image and won't compete with a sharp white form in front. Place large green tree shapes and foliage framing the left and right edges where they will stay visible around the form, quiet center. Bright light mint atmosphere with more saturated green at corners, moderate contrast. No people, no vehicles needed, no text, no interface, no border, no logo, no watermark. Wide landscape edge to edge.
