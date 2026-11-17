# Memasang gambar kartu sendiri

1. Salin file gambar ke `public/cards/` (tanpa subfolder).
2. Nama file: `card_<suit>_<rank>.png`
   - suit: `spades`, `hearts`, `diamonds`, `clubs`
   - rank: `02`..`09`, `10`, `A`, `J`, `Q`, `K`
   - punggung kartu: `card_back.png`
3. Ekstensi `png`, `webp`, `jpg`, atau `jpeg` terdeteksi otomatis dari `card_back`.
4. `card_empty` dan `card_joker_*` belum dipakai.
5. Gambar yang tidak ditemukan otomatis diganti kartu bawaan (digambar kode), jadi boleh dipasang bertahap.

Penyesuaian di `src/main.js`: `CARD_TINT` (kecerahan kartu, 1 = warna asli).
Gambar dirender tajam (nearest-neighbour) agar pixel art tidak buram; rasio kartu mengikuti 1.05 x 1.45.

## Ukuran kartu
- Margin transparan di sekeliling gambar (termasuk bayangan semi-transparan) dipotong otomatis berdasarkan `card_back`, lalu bentuk kartu 3D dan jarak antar kartu mengikuti rasio gambar yang tersisa.
- Jika gambar Anda sudah pas tanpa margin, tidak ada yang berubah.
- Matikan dengan `CARD_AUTOCROP = false` di `src/main.js` bila ingin gambar ditarik penuh ke bentuk kartu bawaan (rasio 1.05 x 1.45).
- Ukuran kartu di meja: kartu tangan Anda `s: 1.15`, bot `0.85` (di fungsi `layout()`).
