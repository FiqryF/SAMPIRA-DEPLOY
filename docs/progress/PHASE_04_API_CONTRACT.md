# SAMPIRA Phase 4A — Kontrak API Penanganan Fasilitas

Base URL `/api/ecorecycle/facility-reports`. Rute di bawah ini menambahkan Phase 4A. Tujuh operasi Phase 3A, payload, status verifikasi, versi dan histori pengajuan tetap sesuai [kontrak Phase 3A](PHASE_03_API_CONTRACT.md). `approved` pada Phase 3A adalah izin memulai tindak lanjut. Baca status lapangan dari API ini.

## Akses dan rute

Sesi cookie same-origin atau Bearer berlaku seperti Phase 3A. Administrator mendapat 403. User hanya mendapat laporan sendiri. Petugas hanya mendapat tugas aktif miliknya atau tugas yang ditutup melalui penyelesaian miliknya. Setelah pengalihan, Petugas lama kehilangan akses. Akun Petugas nonaktif kehilangan sesi, dan Admin dapat mengalihkan tugasnya.

| Method dan path relatif | Role | Input dan output |
|---|---|---|
| GET `/handling` | Admin, Petugas | Halaman laporan Phase 4. Admin melihat seluruh laporan approved, Petugas melihat tugasnya. Filter eksak `status`, `category`, cursor `before_id`. |
| GET `/handling/officers` | Admin | Halaman Petugas aktif dengan `id`, `name`, cursor `before_id`. |
| GET `/{id}/handling` | Admin, pemilik, Petugas yang berwenang | Ringkasan laporan dan penanganan. |
| GET `/{id}/handling/history` | Admin, pemilik, Petugas yang berwenang | Halaman histori penanganan, cursor `before_version`. |
| GET `/{id}/handling/history/{version}/photo` | Admin, pemilik, Petugas yang berwenang | Byte JPEG atau PNG sesuai izin bukti. |
| POST `/{id}/handling/assignment` | Admin | JSON penugasan atau pengalihan. Mengembalikan ringkasan baru. |
| POST `/{id}/handling/activity` | Petugas aktif yang ditugaskan | Multipart aktivitas lapangan. Mengembalikan ringkasan baru. |
| POST `/{id}/handling/review` | Admin | JSON validasi hasil. Mengembalikan ringkasan baru. |
| POST `/{id}/handling/coordination` | Admin | Multipart pencatatan komunikasi eksternal. Mengembalikan ringkasan baru. |

Semua respons sukses HTTP 200. JSON memakai envelope `{"status":"success","message":"...","data":...}`. Halaman mengembalikan `items` dan `next_before_id` atau `next_before_version`. Cursor null berarti selesai. Urutan ID/versi menurun. `limit` default 20, rentang 1–100. Simpan filter ketika memakai cursor. ID dan versi path adalah integer positif. Semua mutasi menerima `version` wajib dari ringkasan penanganan, mulai 0 untuk laporan tanpa aktivitas. Setiap mutasi menaikkannya satu kali. Retry dengan versi lama menghasilkan 409. Ambil ulang detail dan histori sebelum melakukan aksi baru.

## State machine penanganan

| Operasi atau aksi | Dari | Ke |
|---|---|---|
| Penugasan pertama | `approved` | `assigned` |
| Pengalihan ke Petugas lain | Semua status dengan tugas aktif, termasuk hasil yang sedang diperiksa | `assigned` |
| `start_assessment` | `assigned` | `assessment_in_progress` |
| `record_assessment` | `assessment_in_progress` | `handling_in_progress` |
| `record_progress` | `handling_in_progress`, `resolution_revision_required` | `handling_in_progress` |
| `submit_resolution` | `handling_in_progress` | `resolution_submitted` |
| `request_revision` | `resolution_submitted` | `resolution_revision_required` |
| `complete` | `resolution_submitted` | `completed` |

Pengalihan menutup assignment lama sebagai `reassigned`, mempertahankan histori dan foto, lalu memulai siklus asesmen baru. Review selesai menutup assignment aktif sebagai `completed`. Catat hasil faktual, termasuk jika pemeriksaan tidak menghasilkan perbaikan fisik. Laporan yang belum disetujui mengembalikan status penanganan, assignment, koordinasi dan waktu perubahan sebagai null. Laporan approved tanpa aktivitas mempunyai `status: "approved"`, `assignment_status: "unassigned"` dan `version: 0`. Koordinasi awal `not_forwarded`.

## Input mutasi

Field teks dipangkas. Catatan, kondisi, hasil asesmen, tindakan dan hasil dibatasi 1.000 karakter bila diisi. Field di luar kontrak, field multipart ganda, nilai mutasi di URL, serta ID aktor dari klien ditolak. Gunakan `application/json` untuk assignment/review dan `FormData` untuk activity/coordination. Jangan memasang boundary sendiri. Body maksimum 16 KiB JSON dan 6 MiB multipart.

- **Assignment**. `{"version":0,"petugas_id":102,"internal_note":"Periksa kondisi pintu."}`. Alasan internal wajib jika sudah ada tugas aktif. Akun target harus aktif dan role Petugas. Pengalihan ke Petugas yang sama menghasilkan 409.
- **Activity**. Selalu kirim `version` dan `action`. `start_assessment` menerima catatan saja. `record_assessment` memerlukan `condition` dan `assessment`. `record_progress` memerlukan `action_taken`. `submit_resolution` memerlukan `result`. Tiap aksi dapat menyertakan `internal_note` dan `public_note`. Satu `photo` opsional untuk semua aksi selain `start_assessment`. Contoh field multipart `version=2`, `action=record_assessment`, `condition=Pintu tidak bisa ditutup`, `assessment=Engsel macet`, `photo=<berkas PNG>`.
- **Review**. `{"version":6,"decision":"request_revision","internal_note":"Cek ulang pengunci."}` memerlukan alasan internal. Untuk `complete`, `public_note` wajib sebagai ringkasan hasil publik. `public_evidence_version` opsional menunjuk satu versi berfoto dari kegiatan lapangan pada assignment yang menyampaikan hasil. Foto hanya dipublikasikan ke pemilik setelah validasi selesai. Contoh `{"version":8,"decision":"complete","public_note":"Pengunci sudah diuji dan berfungsi.","public_evidence_version":8}`.
- **Coordination**. Selalu kirim `version`, `status` dan `internal_note`. `forwarded` memerlukan `agency` maksimal 160 karakter, `channel` maksimal 80 karakter, dan `forwarded_at` RFC 3339 yang tidak lebih dari waktu server sekarang. Tahap berikutnya tidak menerima field tersebut. `reference` opsional maksimal 120 karakter, `photo` opsional. Konfirmasi penerimaan dan verifikasi penyelesaian eksternal membutuhkan referensi atau foto sebagai bukti. `follow_up_reported` mencatat isi respons nyata pada `internal_note`. Satu jalur koordinasi per laporan dengan urutan `not_forwarded → forwarded → receipt_confirmed → follow_up_reported → resolution_verified`. Tahap terakhir membutuhkan status lapangan `completed` dan bukti verifikasi. Pencatatan komunikasi tidak mengubah status lapangan. Contoh field multipart `version=4`, `status=forwarded`, `agency=Dinas Lingkungan Hidup`, `channel=Surat resmi`, `forwarded_at=2026-11-05T03:00:00Z`, `internal_note=Surat dikirim melalui kanal resmi`.

Foto wajib lolos validasi ekstensi, signature dan decode. Gunakan JPEG/PNG hingga 5 MiB dan 16 megapiksel, satu per event. Foto komunikasi hanya untuk Admin. Foto lapangan dapat dilihat Admin dan Petugas yang saat ini berwenang atas laporan. User hanya dapat membaca foto yang dipilih secara eksplisit oleh Admin saat penyelesaian. Rute foto memberi `no-store`, `nosniff` dan kebijakan same-origin.

## Bentuk data

Contoh ringkasan untuk User pemilik.

```json
{
  "status": "success",
  "message": "Penanganan fasilitas.",
  "data": {
    "report_id": 41, "tracking_number": "FAC-20A17EBA1186EF3E77661C57",
    "title": "Pintu TPS rusak", "description": "Pintu macet", "category": "tps",
    "address": "Jalan Sukaraja 10", "latitude": null, "longitude": null,
    "verification_status": "approved", "status": "completed", "version": 9,
    "assignment_status": "completed", "coordination_status": "forwarded",
    "public_result": "Pengunci sudah diuji dan berfungsi.",
    "public_evidence_version": 8,
    "updated_at": "2026-11-06T02:15:00Z"
  }
}
```

Admin/Petugas yang berwenang memperoleh objek `assignment` bila ada. Field-nya `id`, `petugas_id`, `assigned_by`, `status`, `assigned_at`, `ended_at`. User hanya memperoleh status assignment. Histori berisi `version`, `action`, `from_status`, `to_status`, `created_at`, `public_note`, `coordination_status` dan `has_photo` sesuai izin. Aksi histori Admin mencakup `assign`, `reassign`, `request_revision`, `complete`, dan `coordinate` ditambah empat aksi Petugas. Histori internal menyediakan `actor_id`, `assignment_id`, `petugas_id`, `internal_note`, `condition`, `assessment`, `action_taken` dan `result` bila ada. Histori koordinasi menampilkan `agency`, `channel`, `forwarded_at`, `reference` dan catatan internal khusus Admin. Field internal yang tidak berizin dihilangkan dari JSON.

Contoh entri histori publik.

```json
{"version":9,"action":"complete","from_status":"resolution_submitted","to_status":"completed","created_at":"2026-11-06T02:15:00Z","public_note":"Pengunci sudah diuji dan berfungsi.","coordination_status":null,"has_photo":false}
```

Status error `400` untuk input, filter atau foto invalid, `401` untuk sesi invalid, `403` untuk role/origin ditolak, `404` untuk resource di luar akses atau foto tidak tersedia, `409` untuk versi/transisi/target assignment yang tidak sesuai, `413` untuk body terlalu besar, `415` untuk media type yang salah, dan `500` untuk kegagalan penyimpanan. Body error memakai `status: "error"` dan `message`. FE dapat mengambil koordinat langsung dari ringkasan, memuat histori dengan cursor, dan merender foto melalui rute relatif yang dibangun dari ID serta versi. Tampilkan penugasan/koordinasi dan hasil validasi sebagai indikator berbeda.
