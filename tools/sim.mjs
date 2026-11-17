// Simulasi bot-vs-bot: mencerminkan alur main.js (tanpa tampilan). Pakai: node tools/sim.mjs
import { val, melds, canDiscCard } from '../src/rules.js';
import { chooseEat, chooseMelds, chooseDiscard } from '../src/bot.js';
const shuf = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const mkDeck = () => { const a = []; for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) a.push({ s, r }); return a; };
const sum = cs => cs.reduce((a, c) => a + val(c), 0);
// Varian aturan untuk eksperimen keseimbangan: LEFT = pengali minus kartu sisa di tangan, ALWAYS=1 = pool selalu dikocok ulang saat tumpukan habis
const LEFT = +(process.env.LEFT ?? 1), ALWAYS = process.env.ALWAYS === '1', REMI = +(process.env.REMI ?? 25);
function playRound(P, starter) {
  let deck = shuf(mkDeck()), pool = [], cur = starter, turns = 0, end = null, reshuffled = false;
  P.forEach(p => { p.hand = deck.splice(0, 7); p.melds = []; p.pen = 0; p.cv = 0; p.done = false; p.remi = false; });
  const hm = p => p.melds.length > 0;
  const nextAlive = c => { do { c = (c + 1) % 4; } while (P[c].done); return c; };
  const info = p => { const seen = new Set(), add = c => seen.add(c.s * 13 + c.r); p.hand.forEach(add); pool.forEach(c => !c.closed && add(c)); P.forEach(q => q.melds.forEach(m => m.forEach(add))); return { deckN: deck.length, seen }; };
  const lay = (p, ms) => ms.forEach(m => { p.melds.push(m); p.hand = p.hand.filter(c => !m.includes(c)); });
  const layB = p => lay(p, chooseMelds(p.hand, hm(p), p.level, info(p)));
  while (!end) {
    if (++turns > 800) { end = { w: null, kind: '' }; break; }
    const p = P[cur];
    let forced = !deck.length;
    if (forced) {
      if ((!ALWAYS && (P.some(q => q.melds.length) || reshuffled)) || !pool.length) { end = { w: null, kind: '' }; break; }
      reshuffled = true; const top = pool.pop(); deck = shuf(pool.map(c => ((c.closed = false), c))); pool = [top];
    }
    layB(p);
    if (!p.hand.length) { p.done = p.remi = true; if (P.every(q => q.done)) { end = { w: null, kind: '' }; break; } cur = nextAlive(cur); continue; }
    const opt = forced ? null : chooseEat(p.hand, hm(p), pool, p.level);
    if (opt) { const t = pool.splice(-opt.k); p.hand.push(...t); lay(p, [opt.meld]); layB(p); }
    else { p.hand.push(deck.pop()); layB(p); }
    if (!p.hand.length) { p.done = p.remi = true; if (P.every(q => q.done)) { end = { w: null, kind: '' }; break; } cur = nextAlive(cur); continue; }
    layB(p);
    if (!p.hand.length) { p.done = p.remi = true; if (P.every(q => q.done)) { end = { w: null, kind: '' }; break; } cur = nextAlive(cur); continue; }
    if (p.hand.length === 1 && canDiscCard(p.hand, hm(p), p.hand[0])) { const c = p.hand.pop(); c.closed = true; pool.push(c); p.cv = val(c) * 10; end = { w: p, kind: 'closed' }; break; }
    const d = chooseDiscard(p.hand, hm(p), p.level, info(p));
    p.hand = p.hand.filter(c => c !== d); pool.push(d);
    while (p.hand.length > 7) { const c = p.hand.splice((Math.random() * p.hand.length) | 0, 1)[0]; p.pen += val(c) * 10; }
    cur = nextAlive(cur);
  }
  P.forEach(p => { p.score += sum(p.melds.flat()) + p.cv + (p.remi ? REMI : 0) - LEFT * sum(p.hand) - p.pen; });
  return { next: ((end.w ? end.w.id : cur) + 1) % 4, kind: end.kind || (P.some(q => q.remi) ? 'remi' : '') };
}
function match(levels, target) {
  const P = levels.map((level, id) => ({ id, level, score: 0 }));
  let st = (Math.random() * 4) | 0, rounds = 0, kinds = { remi: 0, closed: 0, '': 0 };
  for (;;) {
    const r = playRound(P, st); st = r.next; rounds++; kinds[r.kind]++;
    const top = Math.max(...P.map(p => p.score));
    if (top >= target) { const w = P.filter(p => p.score === top); if (w.length === 1) return { win: w[0].id, rounds, kinds }; }
    if (rounds > 400) return { win: -1, rounds, kinds };
  }
}
function run(name, levels, target, N) {
  const wins = [0, 0, 0, 0]; let rounds = 0, none = 0; const kinds = { remi: 0, closed: 0, '': 0 };
  for (let i = 0; i < N; i++) { const m = match(levels, target); if (m.win < 0) none++; else wins[m.win]++; rounds += m.rounds; for (const k in m.kinds) kinds[k] += m.kinds[k]; }
  const tot = rounds;
  console.log(`${name.padEnd(30)} target ${String(target).padEnd(4)} menang kursi0: ${(wins[0] / N * 100).toFixed(0).padStart(3)}% | rata2 ronde: ${(rounds / N).toFixed(1)} | REMI ${(kinds.remi / tot * 100).toFixed(0)}% CLOSED ${(kinds.closed / tot * 100).toFixed(0)}% habis ${(kinds[''] / tot * 100).toFixed(0)}%${none ? ' | tak selesai: ' + none : ''}`);
}
const N = +process.argv[2] || 150;
if (process.env.EXPERIMENT) {
  const lv = process.env.LEVELS ? process.env.LEVELS.split(',') : ['medium', 'medium', 'medium', 'medium'];
  const T = +(process.env.TARGET || 300);
  let fin = 0, rounds = 0, none = 0;
  for (let i = 0; i < N; i++) { const m = match(lv, T); if (m.win < 0) none++; else { fin++; rounds += m.rounds; } }
  console.log(`LEFT=${LEFT} ALWAYS=${+ALWAYS} REMI=${REMI} target ${T}: selesai ${fin}/${N}, rata-rata ${fin ? (rounds / fin).toFixed(0) : '-'} ronde`);
} else {
run('medium vs 3 medium (basis 25%)', ['medium', 'medium', 'medium', 'medium'], 300, N);
run('hard vs 3 medium', ['hard', 'medium', 'medium', 'medium'], 300, N);
run('hard vs 3 easy', ['hard', 'easy', 'easy', 'easy'], 300, N);
run('medium vs 3 easy', ['medium', 'easy', 'easy', 'easy'], 300, N);
run('easy vs 3 hard', ['easy', 'hard', 'hard', 'hard'], 300, N);
}
