import { melds, eatMeld, eatTargets, canManualMeldCards, canDiscCard } from '../src/rules.js';
import { chooseEat, chooseMelds, chooseDiscard, eatOptions } from '../src/bot.js';
let n = 0, bad = 0;
const ok = (name, got, want) => { n++; if (got !== want) { bad++; console.log('GAGAL:', name, 'dapat', got, 'harusnya', want); } };
const C = (r, s = 0) => ({ r, s, id: r + s * 20 });
// makan: 9 dengan 7,8 / 8,10 / 7,8,10
let pool = [C(9)];
let hand = [C(7), C(8), C(10), C(3, 1)];
ok('9 + 7,8', !!eatMeld(hand, false, pool, 1, [hand[0], hand[1]]), true);
ok('9 + 8,10', !!eatMeld(hand, false, pool, 1, [hand[1], hand[2]]), false);
ok('9 + 7,8,10', !!eatMeld(hand, false, pool, 1, [hand[0], hand[1], hand[2]]), true);
ok('pendamping nyasar ditolak', !!eatMeld(hand, false, pool, 1, [hand[0], hand[1], hand[3]]), false);
ok('targets 7,8 -> k=1', eatTargets(hand, false, pool, [hand[0], hand[1]]).join(), '1');
ok('targets tanpa pilihan', eatTargets(hand, false, pool, []).length, 0);
// pool 7 dalam, hanya 7 teratas
pool = [C(9, 2), C(2), C(3), C(4), C(5), C(6), C(12), C(13), C(1, 3)];
const h2 = [C(10, 2), C(11, 2), C(5, 1)];
ok('9d + 10d,Jd (k=9 >7)', !!eatMeld(h2, false, pool, 9, [h2[0], h2[1]]), false);
// kartu gambar
const hq = [C(11), C(13)];
ok('Q + J,K ditolak', !!eatMeld(hq, false, [C(12)], 1, hq), false);
const hjk = [C(12), C(13)];
ok('J + Q,K', !!eatMeld(hjk, false, [C(11)], 1, hjk), true);
// As
const ha = [C(1, 0), C(1, 1), C(1, 2)];
ok('As pool tanpa seri jadi', !!eatMeld(ha, false, [C(1, 3)], 1, ha), false);
ok('As pool + 3 As tangan (punya seri)', eatMeld(ha, true, [C(1, 3)], 1, ha)?.length, 4);
ok('manual 4 As', canManualMeldCards([...ha, C(1, 3)], true), true);
// bot: easy/medium/hard mengembalikan hasil valid
const hb = [C(7), C(8), C(2, 1), C(5, 2), C(12, 3), C(1, 1), C(13, 3)];
const info = { deckN: 20, seen: new Set() };
for (const lv of ['easy', 'medium', 'hard']) {
  const d = chooseDiscard(hb, false, lv, info);
  ok('discard ' + lv + ' dari tangan', hb.includes(d), true);
  ok('discard ' + lv + ' bukan As (belum punya seri)', d.r !== 1, true);
}
const o = eatOptions(hb, false, [C(9)]);
ok('eatOptions menemukan 9', o.length, 1);
ok('hard makan 9', chooseEat(hb, false, [C(9)], 'hard')?.k, 1);
// hard menahan 3 As bila As ke-4 belum terlihat
const tri = [C(1, 0), C(1, 1), C(1, 2), C(5)];
ok('hard menahan 3 As', chooseMelds(tri, true, 'hard', { deckN: 30, seen: new Set([1, 14, 27]) }).length, 0);
ok('medium langsung turunkan 3 As', chooseMelds(tri, true, 'medium', { deckN: 30, seen: new Set() }).length, 1);
ok('hard turunkan 3 As jika 4 As sudah terlihat', chooseMelds(tri, true, 'hard', { deckN: 30, seen: new Set([1, 14, 27, 40]) }).length, 1);
// aturan As baru: 3/4 As boleh diserikan tanpa seri sebelumnya
const A3 = [C(1, 0), C(1, 1), C(1, 2)];
ok('3 As boleh diserikan tanpa seri sebelumnya', canManualMeldCards(A3, false), true);
ok('4 As boleh diserikan tanpa seri sebelumnya', canManualMeldCards([...A3, C(1, 3)], false), true);
ok('2 As belum cukup', canManualMeldCards(A3.slice(0, 2), false), false);
ok('melds() menemukan 3 As tanpa seri sebelumnya', melds([...A3, C(5)], false).length, 1);
ok('makan As dari pool tetap perlu seri jadi', !!eatMeld(A3, false, [C(1, 3)], 1, A3), false);
{ const hh = [C(1, 0), C(5), C(6)]; ok('buang As tetap perlu seri jadi', canDiscCard(hh, false, hh[0]), false); }
console.log(`${n - bad}/${n} tes lulus`);
process.exit(bad ? 1 : 0);
