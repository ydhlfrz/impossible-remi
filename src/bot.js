// Otak bot (murni). Bot memakai aturan & pilihan yang sama dengan pemain manusia.
import { val, cat, melds, eatMeld, canDiscCard } from './rules.js';
export const LEVEL_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const rnd = a => a[(Math.random() * a.length) | 0];
const sum = cs => cs.reduce((a, c) => a + val(c), 0);

// Semua cara makan yang valid; pendamping = bagian seri yang berasal dari tangan.
export function eatOptions(hand, hasMeld, pool) {
  const out = [];
  for (let k = 1; k <= Math.min(7, pool.length); k++) {
    const taken = pool.slice(-k), t = taken[0];
    if (t.closed) continue;
    const m = melds([...hand, ...taken], hasMeld).find(x => x.includes(t));
    if (!m) continue;
    const sel = m.filter(c => hand.includes(c));
    if (!eatMeld(hand, hasMeld, pool, k, sel)) continue;
    const rest = [...hand, ...taken].filter(c => !m.includes(c));
    const extra = melds(rest, true).flat();
    const left = rest.filter(c => !extra.includes(c));
    out.push({ k, sel, meld: m, taken, gain: sum(m) + sum(extra), left, plucks: Math.max(0, left.length - 8) });
  }
  return out;
}

export function chooseEat(hand, hasMeld, pool, level) {
  const opts = eatOptions(hand, hasMeld, pool);
  if (!opts.length) return null;
  if (level === 'easy') return Math.random() < 0.35 ? rnd(opts) : null;
  if (level === 'medium') {
    const best = opts.reduce((a, b) => (b.gain - b.k > a.gain - a.k ? b : a));
    return Math.random() < 0.85 ? best : null;
  }
  const sc = o => o.gain - 60 * o.plucks - 0.15 * sum(o.left) + (o.left.length === 0 ? 40 : o.left.length === 1 ? 15 : 0);
  const best = opts.reduce((a, b) => (sc(b) > sc(a) ? b : a));
  return sc(best) > 5 ? best : null;
}

// Seri mana yang diturunkan sekarang. Hard menahan 3 As bila As ke-4 belum terlihat (untuk set 4).
export function chooseMelds(hand, hasMeld, level, info) {
  const all = melds(hand, hasMeld);
  if (level !== 'hard') return all;
  const unseenAce = 4 - [0, 1, 2, 3].filter(s => info.seen.has(s * 13 + 1)).length;
  return all.filter(m => !(m[0].r === 1 && m.length === 3 && unseenAce >= 1 && info.deckN >= 12));
}

function outs(rest, hasMeld, seen) {
  let n = 0;
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) {
    if (seen.has(s * 13 + r)) continue;
    const x = { s, r };
    if (melds([...rest, x], hasMeld).some(m => m.includes(x))) n++;
  }
  return n;
}
const near = (c, hand) => hand.filter(x => x !== c && cat(x) === cat(c) && (c.r === 1 || (x.s === c.s && Math.abs(x.r - c.r) <= 2))).length;

export function chooseDiscard(hand, hasMeld, level, info) {
  const legal = hand.filter(c => canDiscCard(hand, hasMeld, c));
  if (!legal.length) return hand[0];
  if (level === 'easy') return rnd(legal);
  if (level === 'medium') {
    let bc = null, bu = 99;
    legal.forEach(c => { const u = near(c, hand) * 3 - val(c) / 20 + Math.random(); if (u < bu) { bu = u; bc = c; } });
    return bc;
  }
  let bc = null, bs = -1e9;
  legal.forEach(c => {
    const rest = hand.filter(x => x !== c);
    const s = outs(rest, hasMeld, info.seen) * 10 + rest.reduce((a, x) => a + near(x, rest), 0) * 2 + val(c) / 10 + Math.random();
    if (s > bs) { bs = s; bc = c; }
  });
  return bc;
}
