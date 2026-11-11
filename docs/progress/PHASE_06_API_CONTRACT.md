# SAMPIRA Phase 6A — Kontrak API Pusat Edukasi

Semua path di bawah berada pada origin aplikasi. API publik dapat dipakai tanpa login. Pengelolaan memerlukan role `admin`, dengan cookie portal `sampira_session` atau Bearer token. Pada browser, gunakan `credentials: "same-origin"`. Kirim mutasi dari origin portal. Role `user`, `petugas`, dan `administrator` dapat membaca artikel publik.

## Endpoint

| Method dan path | Akses | Hasil |
|---|---|---|
| GET `/api/ecorecycle/education/articles` | Publik | 200 halaman ringkasan artikel terbit |
| GET `/api/ecorecycle/education/articles/{slug}` | Publik | 200 detail artikel terbit |
| GET `/api/ecorecycle/education/manage/articles` | Admin | 200 halaman ringkasan dengan status dan audit |
| GET `/api/ecorecycle/education/manage/articles/{id}` | Admin | 200 detail lengkap dengan status dan audit |
| POST `/api/ecorecycle/education/manage/articles` | Admin | 201 draft dan header `Location` menuju detail Admin |
| PUT `/api/ecorecycle/education/manage/articles/{id}` | Admin | 200 draft dengan data dan versi terbaru |
| POST `/api/ecorecycle/education/manage/articles/{id}/publication` | Admin | 200 artikel yang diterbitkan atau diarsipkan |

`id` Admin adalah bilangan bulat positif 32-bit. `slug` publik berasal dari daftar atau URL artikel. Slug invalid, draft, arsip, dan slug yang tidak ditemukan semuanya mendapat 404 di detail publik. Artikel yang diarsipkan tetap tersedia bagi Admin.

## Filter dan halaman

| Parameter daftar | Ketentuan |
|---|---|
| `category` | Key kategori persis dari `data.categories`. |
| `q` | 1–100 karakter setelah trim. Pencarian literal pada judul dan ringkasan, tidak peka huruf besar/kecil. Karakter `%` dan `_` dianggap bagian dari teks. |
| `page` | 1–1000, default 1. |
| `limit` | 1–50, default 20. |
| `status` | Hanya daftar Admin. `draft`, `published`, atau `archived`. Jika kosong, hilangkan parameter untuk melihat semua status. |

Parameter opsional yang tidak dipakai sebaiknya dihilangkan. Nilai kosong, key tak dikenal, dan parameter berulang ditolak. Daftar publik diurutkan berdasarkan waktu publikasi terbaru, lalu ID menurun. Daftar Admin diurutkan berdasarkan ID menurun. Ambil halaman berikutnya dari `data.next_page` dengan filter dan limit yang sama. Nilai `null` berarti tidak ada halaman yang bisa diambil dalam batas pagination. Perubahan publikasi di antara dua request dapat menggeser isi halaman. Saat filter berubah, mulai kembali dari halaman 1.

Contoh `GET /api/ecorecycle/education/articles?category=panduan-sampira&limit=3`. Daftar mengembalikan seluruh tujuh kategori, termasuk saat `items` kosong.

```json
{
  "status": "success",
  "message": "Daftar artikel edukasi.",
  "data": {
    "items": [{
      "id": 18,
      "slug": "cara-mengajukan-penjemputan",
      "title": "Cara mengajukan penjemputan",
      "summary": "Siapkan alamat sebelum membuat pengajuan melalui portal User.",
      "category": "panduan-sampira",
      "published_at": "2026-11-06T12:30:00Z"
    }],
    "page": 1,
    "limit": 3,
    "next_page": null,
    "categories": [
      {"key":"pemilahan-sampah","label":"Pemilahan Sampah"},
      {"key":"pengurangan-sampah","label":"Pengurangan Sampah"},
      {"key":"daur-ulang","label":"Daur Ulang"},
      {"key":"pengomposan","label":"Pengomposan"},
      {"key":"bank-sampah","label":"Bank Sampah"},
      {"key":"sampah-elektronik","label":"Sampah Elektronik"},
      {"key":"panduan-sampira","label":"Panduan SAMPIRA"}
    ]
  }
}
```

Detail publik menambahkan `body` dan `sources`. Daftar dan detail Admin menambahkan `status`, `version`, `created_by`, `updated_by`, `created_at`, dan `updated_at`. Detail Admin juga memuat `body` dan `sources`. Tanggal dikirim sebagai RFC 3339 UTC. `published_at` adalah `null` pada draft dan arsip yang belum pernah terbit. Field audit, isi, dan sumber tidak ada pada daftar publik. Isi dan sumber juga tidak ada pada daftar Admin.

## Mutasi Admin

Gunakan `Content-Type: application/json` dengan objek JSON tunggal pada body, tanpa query string. Batas body adalah 192 KiB. Field tak dikenal seperti `created_by`, `updated_by`, atau `published_at` ditolak. Server mengambil identitas aktor dari sesi dan mengisi timestamp.

| Field draft | Aturan setelah trim |
|---|---|
| `slug` | 3–120 karakter ASCII. Huruf kecil dan angka, tanda hubung tunggal di antara bagian. Unik di semua status. |
| `title` | 3–120 karakter teks satu baris. |
| `summary` | 10–320 karakter teks satu baris. |
| `body` | 20–12.000 karakter teks biasa. Boleh memuat baris baru dan tab. |
| `category` | Salah satu key kategori dari respons daftar. |
| `sources` | Opsional, paling banyak delapan URL HTTPS absolut tanpa kredensial, maksimum 2.048 karakter per URL. Hilang atau `null` dinormalisasi menjadi `[]`. |
| `version` | Wajib pada edit dan perubahan publikasi. Ambil dari respons Admin terbaru. |

Judul, ringkasan, isi, dan sumber menolak tanda sudut literal serta karakter kontrol yang tidak diizinkan. Sumber ditampilkan sebagai tautan terpisah. Admin memeriksa referensi dan isi sebelum menerbitkan.

Contoh body `POST /api/ecorecycle/education/manage/articles`.

```json
{
  "slug": "cara-mengajukan-penjemputan",
  "title": "Cara mengajukan penjemputan",
  "summary": "Siapkan alamat sebelum membuat pengajuan melalui portal User.",
  "body": "Buka formulir penjemputan. Periksa alamat dan konfirmasi titik jika tersedia.",
  "category": "panduan-sampira",
  "sources": []
}
```

Draft baru mendapat `status: "draft"`, `version: 1`, dan `published_at: null` di `data`. Untuk `PUT /manage/articles/{id}`, kirim ulang seluruh field draft ditambah `version`. Jika URL sumber ingin dipertahankan, kirim ulang daftar sumber. Artikel terbit dan arsip tidak dapat diedit. Slug dapat berubah selama draft.

Body `POST /manage/articles/{id}/publication` untuk menerbitkan draft dengan versi 2.

```json
{"version": 2, "status": "published"}
```

| Aksi | Transisi |
|---|---|
| Buat | Belum ada → `draft` |
| Edit | `draft` → `draft` |
| Publikasikan | `draft` → `published` |
| Arsipkan | `draft` atau `published` → `archived` |

Mutasi sukses menaikkan versi dan mencatat editor terakhir. Waktu publikasi disetel saat terbit dan dipertahankan ketika diarsipkan. Arsip terminal dan tetap memegang slug. Bila versi basi atau terjadi konflik status, muat ulang detail sebelum mengulangi tindakan.

## Error dan rendering

Respons JSON memakai `status`, `message`, dan `data` pada sukses. Respons gagal dari handler memakai `status: "error"` dan `message`. Semua respons handler memakai `Cache-Control: no-store`.

| HTTP | Arti |
|---|---|
| 400 | ID, filter, pagination, JSON, field, atau versi input invalid. |
| 401 | Sesi pengelolaan hilang atau invalid. |
| 403 | Role atau origin ditolak. |
| 404 | Artikel tidak ditemukan atau tidak tersedia secara publik. |
| 405 | Metode HTTP tidak terdaftar. |
| 409 | Slug telah dipakai, versi basi, atau status melarang aksi. |
| 413 | Body melebihi batas. |
| 415 | Media type mutasi salah. |
| 500 | Penyimpanan atau pembacaan gagal. |

Render judul, ringkasan, dan isi melalui `textContent` atau node teks. Untuk menjaga paragraf gunakan CSS `white-space: pre-wrap`. Hindari `innerHTML`, auto-link body, dan parser Markdown. Render sumber sebagai tautan hanya jika URL hasil parsing berprotokol HTTPS. Gunakan `rel="noopener noreferrer"` jika membuka tab baru. [OpenAPI](../openapi.json)
