// Aturan murni (tanpa DOM / three.js) - dipakai game, bot, dan simulator.
export const val = c => (c && c.r ? (c.r == 1 ? 15 : c.r > 10 ? 10 : 5) : 0);
export const cat = c => (c && c.r ? (c.r == 1 ? 0 : c.r <= 10 ? 1 : 2) : 0);

// Semua seri yang bisa dibentuk dari kumpulan kartu. 3 atau 4 As selalu boleh diserikan (tanpa perlu seri sebelumnya).
// Parameter kedua tidak lagi dipakai (dipertahankan agar pemanggil lama tetap berjalan).
export function melds(cs) {
  const out = [];
  for (let s = 0; s < 4; s++) {
    const h = cs.filter(c => c.s == s);
    const has = r => h.find(c => c.r == r);
    let run = [];
    for (let r = 2; r <= 11; r++) {
      const c = r <= 10 && has(r);
      if (c) run.push(c);
      else { if (run.length >= 3) out.push(run); run = []; }
    }
    if (has(11) && has(12) && has(13)) out.push([has(11), has(12), has(13)]);
  }
  const a = cs.filter(c => c.r == 1);
  if (a.length >= 3) out.push(a);
  return out;
}

// Pendamping (h) untuk kartu pool ch: harus 2 kartu berurutan di SATU sisi (9 -> 7,8). Q tidak pernah bisa dimakan.
export function support(h, hasMeld, ch) {
  if (ch.r == 1) return hasMeld && h.filter(c => c.r == 1).length >= 2;
  const has = r => h.some(c => c.s == ch.s && c.r == r);
  const lo = ch.r <= 10 ? 2 : 11, hi = ch.r <= 10 ? 10 : 13;
  return (ch.r + 2 <= hi && has(ch.r + 1) && has(ch.r + 2)) || (ch.r - 2 >= lo && has(ch.r - 1) && has(ch.r - 2));
}

// Makan k kartu teratas pool (k<=7) dengan pendamping sel dari tangan. Mengembalikan seri yang terbentuk atau null.
export function eatMeld(hand, hasMeld, pool, k, sel) {
  if (!(k >= 1 && k <= 7 && k <= pool.length) || sel.length < 2) return null;
  if (!sel.every(c => hand.includes(c))) return null;
  const taken = pool.slice(-k), t = taken[0];
  if (t.closed || !support(sel, hasMeld, t)) return null;
  const m = melds([...taken, ...sel], hasMeld).find(x => x.includes(t));
  return m && sel.every(c => m.includes(c)) ? m : null;
}

// Posisi k (1 = paling atas) pada pool yang bisa dimakan dengan pendamping terpilih.
export function eatTargets(hand, hasMeld, pool, sel) {
  const out = [];
  if (sel.length < 2) return out;
  for (let k = 1; k <= Math.min(7, pool.length); k++) if (eatMeld(hand, hasMeld, pool, k, sel)) out.push(k);
  return out;
}

export function canManualMeldCards(sel, hasMeld) {
  if (sel.length < 3) return false;
  const cov = new Set(melds(sel, hasMeld).flat());
  return sel.every(c => cov.has(c));
}

export function canDiscCard(hand, hasMeld, c) {
  return !(c.r == 1 && !hasMeld && hand.some(x => x.r != 1));
}
