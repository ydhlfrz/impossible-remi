import { DECK_X, CARD_SIZES, BOT_MELD_K, tableHalfW, seatX, deckX, poolLayout, handSpacing, meldStep } from '../src/layout.js';
let n = 0, bad = 0;
const ok = (name, cond) => { n++; if (!cond) { bad++; console.log('GAGAL:', name); } };
// lebar meja mengikuti rasio layar, dengan batas
ok('layar sempit -> meja minimum', tableHalfW(1.2) === 12.5);
ok('layar 16:9 -> meja melebar', tableHalfW(16 / 9) > 14.5);
ok('layar ultra lebar -> dibatasi', tableHalfW(3) === 17.5);
ok('lebar meja naik monoton', tableHalfW(1.4) <= tableHalfW(1.7) && tableHalfW(1.7) <= tableHalfW(2.0));
for (const hw of [12.5, 13.75, 15, 16.25, 17.5]) {
  const sx = seatX(hw), dx = deckX(hw);
  const felt = hw - 1.6;
  ok(`hw=${hw}: label kursi samping masih di atas felt`, sx + 1.4 + 1.35 <= felt);
  ok(`hw=${hw}: area kartu cabutan bot masih di atas felt`, sx + 1.7 + 0.4 <= felt);
  ok(`hw=${hw}: tumpukan di dalam meja dan tidak menabrak kursi`, dx - 1.0 > -(sx - 1.9) + 0.3);
  for (const sz of CARD_SIZES) for (const wf of [0.65, 0.8, 1.0]) {
    const tag = `hw=${hw} ${sz.name} wf=${wf}`;
    for (let st = 1; st <= 12; st++) {
      const { x0, psp, pw } = poolLayout(sz, wf, st, dx, sx);
      ok(`${tag} st=${st}: pool tidak menabrak tumpukan`, x0 - pw / 2 >= dx + pw / 2 + 0.19);
      ok(`${tag} st=${st}: pool tidak menabrak kolom seri bot`, x0 + (st - 1) * psp + pw / 2 <= sx - 1.9 - 0.2 - 0.725 * sz.meld * BOT_MELD_K + 0.001);
      ok(`${tag} st=${st}: sudut kartu pool terlihat`, st === 1 || psp >= 0.28);
    }
    for (let hn = 1; hn <= 9; hn++) {
      const ext = ((hn - 1) * handSpacing(hn, wf, sz)) / 2 + (1.05 * wf * sz.hand) / 2;
      ok(`${tag} tangan ${hn} kartu muat (<= 6.0)`, ext <= 6.0);
    }
    ok(`${tag} tinggi kartu tangan muat di meja`, 5.0 + (1.45 * sz.hand) / 2 <= 7.4);
    ok(`${tag} seri bot lebih kecil dari seri Anda`, sz.meld * BOT_MELD_K < sz.meld);
    ok(`${tag} langkah seri positif`, meldStep(wf, { meld: sz.meld * BOT_MELD_K }) > 0);
  }
}
ok('ukuran L >= 1.5x kartu tangan semula', CARD_SIZES[2].hand / 1.15 >= 1.5);
console.log(`${n - bad}/${n} tes tata letak lulus`);
process.exit(bad ? 1 : 0);
