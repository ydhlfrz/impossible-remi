# Aturan IMPOSSIBLE REMI (versi beku)

**Pemain:** 4 (1 manusia + 3 bot). **Kartu:** 52, masing-masing pemain 7 kartu.
**Room:** 300 / 500 / 1000 (pilih di menu awal). **Bot:** Easy / Medium / Hard.

## Seri
- Angka 2-10: min. 3 berurutan, satu simbol. Gambar: hanya J-Q-K satu simbol. Tidak ada seri campuran.
- As: 3 atau 4 As (simbol bebas) boleh diserikan kapan saja (mis. punya 2 As lalu menarik As ketiga). Namun As baru boleh dibuang atau dimakan dari pool setelah pemain punya seri jadi (makan As: min. 2 As di tangan). 1-2 As yang tidak jadi seri dihitung minus.
- Seri yang sudah turun tidak bisa ditambah.

## Giliran
1. **Tarik** 1 kartu dari tumpukan (boleh langsung diserikan atau disimpan di tangan), **atau makan dari pool**.
2. **Makan:** dari 7 kartu teratas pool; semua kartu di atas kartu pilihan ikut terambil. Pendamping di tangan harus berurutan di satu sisi (9 dengan 7+8; 8+10 tidak bisa; Q tidak bisa dimakan). Kartu yang tidak jadi seri tetap di tangan.
3. **Susun seri manual** dari tangan kapan saja saat giliran.
4. **Buang** 1 kartu ke pool. Maks. 7 kartu di tangan; kelebihan dicabut tertutup acak, nilai minus x10 (angka -50, gambar -100, As -150).

## Akhir ronde & skor
- Kartu seri: angka +5, gambar +10, As +15 per kartu. Kartu sisa di tangan: angka -5, gambar -10, As -15.
- **REMI:** tangan kosong (setelah tarik, makan, atau susun manual): bonus +25. Ronde selesai untuk pemain itu saja; pemain lain terus bermain sampai ronde berakhir (tumpukan habis atau ada yang CLOSED).
- **CLOSED:** sisa 1 kartu dibuang tertutup: angka +50, gambar +100, As +150.
- **Tumpukan habis:** jika sudah ada seri milik siapa pun, ronde selesai dan skor dihitung. Jika belum ada seri sama sekali, pool (kecuali kartu teratas) dikocok ulang SEKALI; bila tumpukan habis lagi dan tetap belum ada seri, ronde selesai.
- Menang: pertama mencapai target room di akhir ronde; jika skor puncak sama persis, lanjut ronde sampai ada yang unggul. Skor boleh negatif.

## Pengaturan keseimbangan (src/main.js -> RULES)
Simulasi bot-vs-bot (`node tools/sim.mjs`, medium x4, target 300):

| Varian | Selesai dalam 400 ronde | Rata-rata ronde |
|---|---|---|
| Aturan saat ini | 1 dari 20 | tidak tercapai |
| Minus sisa kartu x0.5 (`leftoverMult: 0.5`) | 18 dari 20 | 84 |
| Minus sisa kartu x0 | 20 dari 20 | 13 |
| Pool selalu dikocok ulang (`reshuffleAlways: true`) | 20 dari 20 | 5 |

Dengan aturan saat ini rata-rata skor per ronde negatif untuk semua bot, sehingga target sulit tercapai.

## Tes
- `node tools/test-rules.mjs` : uji aturan makan / seri / bot.
- `node tools/sim.mjs [jumlah]` : simulasi bot-vs-bot. Variabel: `ALWAYS=1`, `LEFT=0.5`, `REMI=100`, `EXPERIMENT=1 TARGET=500 LEVELS=hard,medium,medium,medium`.

## Tampilan & bahasa
- Layout landscape: header (skor pemain), area 3D, bar bawah (status, pesan, tombol). Log aksi adalah kolom samping.
- Meja poker low poly dibuat dengan kode (tanpa file meja eksternal).
- Profil pemain (nama + avatar emoji/foto) diisi setelah menekan Main. Bahasa Indonesia/Inggris lewat tombol 🌐 (kamus: `src/i18n.js`).

## Online (multiplayer)
- Batas waktu: tarik/makan 30 dtk, buang 30 dtk, cabut 30 dtk. Waktu habis: tarik otomatis / buang & cabut otomatis. 2 timeout beruntun = autopilot sampai pemain bertindak lagi.
- Pemain keluar saat main: kursi diambil alih bot. Jeda antar ronde 20 dtk (atau semua siap).
- Tanpa aktivitas 10 menit: game dibatalkan. Lobi menganggur 30 menit: dihapus.
- Ruang pribadi (kode + sandi opsional) dan cari lawan otomatis (lobi menunggu 20 dtk, sisa kursi diisi bot).
