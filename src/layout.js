// Rumus tata letak kartu (murni, bisa diuji). Satuan = satuan dunia 3D.
export const DECK_X = -3.6;
// hand = skala kartu di tangan Anda, pool = kartu di tengah meja, meld = kartu seri
export const CARD_SIZES = [
  { name: 'S', hand: 1.15, pool: 1.0, meld: 0.7 },
  { name: 'M', hand: 1.45, pool: 1.25, meld: 0.85 },
  { name: 'L', hand: 1.75, pool: 1.5, meld: 1.0 }
];
// Meja menyesuaikan lebar layar: setengah lebar luar meja (termasuk rel), posisi kursi samping, dan posisi tumpukan.
export const tableHalfW = aspect => Math.min(17.5, Math.max(12.5, 8.9 * aspect - 0.7));
export const seatX = hw => hw - 5.3;
export const deckX = hw => -Math.min(5.2, 3.6 + (hw - 12.5) * 0.45);
// kartu seri milik bot ditampilkan lebih kecil daripada milik Anda
export const BOT_MELD_K = 0.62;
// wf = lebar kartu relatif terhadap bawaan (1.05). Pool dimulai di sebelah tumpukan dan berakhir sebelum kolom seri bot.
export function poolLayout(sz, wf, st, dx = DECK_X, sx = 7.2) {
  const pw = 1.05 * wf * sz.pool;
  const x0 = dx + pw + 0.2;
  const xEnd = sx - 1.9 - 0.2 - 0.725 * sz.meld * BOT_MELD_K - pw / 2;
  const psp = Math.min(0.5 * wf * sz.pool, (xEnd - x0) / Math.max(st - 1, 1));
  return { x0, xEnd, psp, pw };
}
export const handSpacing = (n, wf, sz) => Math.min(1.25 * wf * (sz.hand / 1.15), 9.8 / Math.max(n - 1, 1));
export const meldStep = (wf, sz) => 0.35 * wf * (sz.meld / 0.7);
