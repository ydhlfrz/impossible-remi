# Memasang musik & efek suara sendiri

1. Salin file audio (mp3 / ogg / wav) ke folder `public/audio/`.
2. Daftarkan di `public/audio/manifest.json`, contoh:

```json
{
  "bgm": ["musik-santai.mp3", "musik-2.mp3"],
  "sfx": {
    "draw": "draw.wav",
    "shuffle": "shuffle.wav",
    "remi": "remi.mp3"
  },
  "volume": { "bgm": 0.5, "sfx": 1 }
}
```

- `bgm`: satu atau beberapa lagu. Satu lagu diulang terus, beberapa lagu diputar bergantian.
- `sfx`: hanya isi yang ingin diganti. Yang tidak didaftarkan tetap memakai suara bawaan.
- `volume`: 0 sampai 1 (bgm = musik, sfx = efek).

Nama efek suara yang tersedia:

| Nama | Kapan berbunyi |
|---|---|
| draw | tarik kartu dari tumpukan |
| shuffle | kocok kartu |
| deal | membagi kartu (±2,8 detik, satu klik per kartu) |
| eat | makan kartu pool |
| discard | buang (muntahkan) kartu |
| meld | seri turun |
| pluck | cabut kartu denda |
| closed | tutup ronde (CLOSED) |
| remi | REMI |
| drawGame | ronde selesai tanpa pemenang (imbang) |
| win | pemain mencapai 1000 |
| turn | giliran Anda |
| click | memilih kartu |

Muat ulang halaman setelah mengubah manifest. Pastikan Anda punya hak pakai atas audio tersebut.
