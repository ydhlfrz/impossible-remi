# Multiplayer Online (IMPOSSIBLE REMI)

## Keputusan
- Ruang pribadi (kode + sandi opsional) **dan** cari lawan otomatis. Maks. 4 kursi; sisa kursi diisi bot.
- Timer: tarik/makan 30 dtk, buang 30 dtk, cabut 30 dtk (`DEFAULTS.timers` di `src/engine.js`). Waktu habis = aksi otomatis; 2 timeout beruntun = autopilot.
- **Game ditinggalkan:** tanpa aktivitas 10 menit game dibatalkan (pemain dibebaskan); lobi menganggur 30 menit dihapus.
- Akun: **Supabase Auth** (email + sandi, konfirmasi email). Kolom `chips` ada di profil (0) untuk sistem chip nanti.
- Hosting: Vercel (situs + API) + Supabase (Auth, Postgres, Realtime).

## Arsitektur
```
Klien (Vite) --supabase-js--> Supabase Auth (login email)
     |  fetch + Bearer JWT                      ^ notifikasi versi (Broadcast, room:KODE)
     v                                          |
Vercel Function api/index.js -> server/handler.js -> server/rooms.js -> src/engine.js (aturan: rules.js, bot: bot.js)
                                     |                      |
                              verifikasi JWT lokal    Supabase Postgres (tabel kv, lewat service key)
```
- **Server otoritatif**: klien hanya mengirim niat; `engine.js` memvalidasi. `viewFor` tidak memuat tumpukan, tangan lawan, atau isi kartu cabutan; event privat per kursi.
- **Push + cadangan**: setiap perubahan ruang memicu notifikasi; klien memanggil `sync`. Pewaktu klien bangun tepat setelah batas waktu giliran (server menegakkan timer saat `sync`). Polling cadangan 6 dtk (atau 1,2 dtk jika realtime tidak tersambung). `sync` tanpa perubahan = 1 pembacaan database.
- **Kunci per ruang** lewat fungsi SQL `kv_setnx` mencegah dua aksi bersamaan merusak state.
- Tanpa Supabase, server/klien otomatis memakai mode lokal (pengembangan).

## API (JSON; token di `Authorization: Bearer ...`)
| Metode & jalur | Fungsi |
|---|---|
| GET /api/me, POST /api/profile, GET /api/avatar?uid= | profil (dibuat otomatis saat pertama masuk) |
| POST /api/match `{target, level}` | cari lawan otomatis |
| POST /api/rooms `{target, level, password?}` | buat ruang pribadi |
| POST /api/rooms/join `{code, password?}` | masuk ruang |
| POST /api/rooms/start `{code}` | host memulai (isi bot) |
| GET /api/rooms/sync | lobi + tampilan game + event baru |
| POST /api/rooms/action `{code, action}` | `draw`, `eat{k,sel}`, `meld{cards}`, `discard{id}`, `close`, `pluck{index}`, `ready` |
| POST /api/rooms/leave | keluar (kursi diambil bot) |
| POST /api/register, /api/login | hanya mode lokal (di mode Supabase: 404 `use_supabase_auth`) |

## Batasan
1. **Vercel Functions tidak mendukung WebSocket**; realtime memakai notifikasi + sync. Jika perlu lebih cepat, pindahkan lapisan transport ke server WebSocket tanpa mengubah `engine.js`/`rooms.js`.
2. **Biaya**: tiap perubahan = 1 notifikasi + beberapa panggilan database per pemain. Periksa kuota Vercel dan Supabase sebelum dibuka untuk umum.
3. **Chip & hukum**: jika chip bisa dibeli atau diuangkan, itu bisa masuk regulasi perjudian di banyak negara. Mulai dengan chip virtual yang tidak dapat diuangkan. Saldo harus disimpan di buku besar (ledger) yang hanya bisa diubah server (tabel baru + fungsi SQL), bukan di `kv`.
4. Belum ada: pembatas laju untuk sync/action, chat, peringkat, pelaporan, verifikasi bahwa `sync` dari akun yang sudah dihapus ditolak sebelum token habis.

## Status tahap
- T0 selesai: mesin + tes. T1 selesai (belum diuji di browser/Supabase sungguhan): login, lobi, ruang, game online.
- T2: deploy + uji beban. T3: chat/emote, peringkat, chip (ledger). T4: Android (PWA + Capacitor).
