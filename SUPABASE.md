# Setup Supabase (login email, database, realtime)

> Semua kode sisi Supabase sudah diuji dengan peniru (JWT bertanda tangan sungguhan, PostgREST tiruan). **Belum pernah dijalankan terhadap proyek Supabase sungguhan**; ikuti daftar periksa di bawah saat pertama kali.

## 1. Buat proyek
supabase.com -> New project (paket gratis cukup untuk mulai).

## 2. Login email
- Authentication -> Providers -> **Email**: aktif.
- **Confirm email**: aktifkan untuk produksi (pemain harus mengonfirmasi lewat email sebelum bisa masuk). Matikan sementara jika ingin mencoba lebih cepat.
- Authentication -> URL Configuration: **Site URL** = alamat Vercel Anda; tambahkan `http://localhost:5173` ke Redirect URLs (dipakai tautan reset sandi).
- Email bawaan Supabase dibatasi jumlahnya; untuk produksi pasang SMTP sendiri (Authentication -> SMTP).

## 3. Database
SQL Editor -> New query -> tempel isi `supabase/schema.sql` -> Run. Ini membuat tabel `kv` (status ruang/game) dan dua fungsi kunci. Tabel dilindungi RLS tanpa policy, jadi hanya server (service key) yang bisa mengaksesnya, tidak bisa dari browser.

## 4. Kunci (Project Settings -> API)
| Variabel | Dari | Tempat |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Project URL, anon/publishable key | `.env.local` dan Vercel (aman dipublikasikan) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Project URL, **service_role/secret key** | **Hanya** Vercel / server. Jangan pernah diberi awalan `VITE_` |
| `SUPABASE_JWT_SECRET` | JWT Secret | Hanya untuk proyek lama (token HS256). Proyek dengan kunci asimetris memakai JWKS otomatis dan tidak memerlukannya |

## 5. Realtime
Tidak perlu membuat tabel. Server mengirim notifikasi "ada perubahan" (hanya nomor versi, tanpa data game) ke kanal `room:KODE` lewat Broadcast; klien lalu mengambil keadaannya lewat `/api/rooms/sync` yang berotorisasi. Jika kanal gagal tersambung, klien otomatis memakai polling.

## 6. Menjalankan lokal
```
npm install
cp .env.example .env        # isi SUPABASE_URL, SUPABASE_SERVICE_KEY (+ VITE_*)
node --env-file=.env server/dev.mjs     # API di :8787 (Node >= 20.6)
npm run dev                              # Vite di :5173
```
Tanpa variabel Supabase, server dan klien otomatis memakai mode lokal (akun email di memori, data hilang saat dimatikan).

## 7. Daftar periksa pertama kali
1. Daftar dengan email -> terima email konfirmasi -> masuk. 2. `GET /api/health` di Vercel -> `{"ok":true}`.
3. Buat ruang, buka di dua browser, mulai: kedua sisi melihat game yang sama.
4. Cek tabel `kv` di Table Editor: ada baris `room:...`.
5. Tutup satu tab saat main: dalam ~30 dtk server mengambil alih giliran (timeout).
