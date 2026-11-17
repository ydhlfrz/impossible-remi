# Deploy ke Vercel (repo GitHub: impossible-remi)

> Penting: bagian ini **belum diuji di Vercel/Upstash sungguhan** (lingkungan pengembangan tidak punya akses jaringan). Logikanya sudah diuji penuh dengan penyimpanan tiruan; konfigurasi platform di bawah perlu Anda verifikasi saat deploy pertama.

## 1. Repo
```
git init && git add . && git commit -m "IMPOSSIBLE REMI"
git remote add origin https://github.com/<akun-anda>/impossible-remi.git
git push -u origin main
```

## 2. Supabase (wajib)
Status game dan login disimpan di Supabase karena fungsi Vercel tidak berbagi memori. Ikuti **SUPABASE.md** (proyek, login email, `supabase/schema.sql`, kunci). Alternatif tanpa Supabase Auth: Upstash Redis (`UPSTASH_REDIS_REST_URL`/`..._TOKEN`) + mode akun lokal, hanya untuk uji coba.

## 3. Vercel
1. Import repo di Vercel (framework: Vite; build `npm run build`, output `dist`).
2. Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (+ `SUPABASE_JWT_SECRET` untuk proyek lama). Lihat `.env.example`. **Service key tidak boleh berawalan `VITE_`.**
3. `vercel.json` mengarahkan semua `/api/*` ke satu fungsi (`api/index.js`) agar tidak menghabiskan batas jumlah fungsi.

## 4. Pengembangan lokal
```
npm install
npm run dev:api     # API di :8787 (MemoryStore; data hilang saat dimatikan)
npm run dev         # Vite di :5173, /api diteruskan ke :8787
npm test            # semua tes (aturan, tata letak, bahasa, mesin, server, SDK)
```

## 5. Daftar periksa setelah deploy pertama
- `GET /api/health` -> `{"ok":true}` (membuktikan rewrite ke fungsi benar).
- Daftar, login, buat ruang, mulai: pastikan state bertahan antar permintaan (bukti Redis terhubung).
- Pantau penggunaan fungsi dan perintah Redis saat beberapa pemain polling.
