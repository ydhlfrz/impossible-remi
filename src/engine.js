// Mesin permainan murni & otoritatif (tanpa DOM / jaringan). State = objek JSON biasa, aman disimpan di Redis.
// Dipakai server (online) dan nantinya klien (offline). Aturan ada di rules.js, otak bot di bot.js.
import { val, melds, eatMeld, canManualMeldCards, canDiscCard } from './rules.js';
import { chooseEat, chooseMelds, chooseDiscard } from './bot.js';

export const DEFAULTS = Object.freeze({
  target: 300,
  timers: { draw: 30, discard: 30, pluck: 30, between: 20 }, // detik (draw = tarik ATAU makan)
  rules: { reshuffleAlways: false, leftoverMult: 1 },
  autoAfter: 2 // timeout beruntun sebelum autopilot
});
const PLAY = ['draw', 'discard', 'pluck'];

// ---------- util ----------
function rnd(st) { // mulberry32 yang bisa diserialisasi (st.rng maju tiap panggilan)
  let t = (st.rng = (st.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(st, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd(st) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const mkDeck = () => { const a = []; for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) a.push({ s, r, id: s * 13 + r - 1 }); return a; };
const pub = x => ({ id: x.id, s: x.s, r: x.r });
const hm = s => s.melds.length > 0;
const push = (c, type, data) => c.E.push({ type, ...data });
export const cardId = (s, r) => s * 13 + r - 1;

export function createGame({ seats, target = DEFAULTS.target, seed, timers, rules }) {
  const st = {
    v: 0, rng: (seed ?? (Math.random() * 4294967296)) >>> 0, target,
    timers: { ...DEFAULTS.timers, ...timers }, rules: { ...DEFAULTS.rules, ...rules },
    seats: seats.map(s => ({
      uid: s.uid || null, name: s.name || 'Bot', avatar: s.avatar ?? null, isBot: !!s.isBot, level: s.level || 'medium',
      score: 0, hand: [], melds: [], plucked: [], pen: 0, cv: 0, done: false, remi: false, auto: false, timeouts: 0, ready: false
    })),
    deck: [], pool: [], cur: 0, starter: 0, phase: 'init', round: 0, reshuffled: false, deadline: null,
    pluckOrder: [], result: null, winner: null, tie: false
  };
  st.starter = Math.floor(rnd(st) * st.seats.length);
  return st;
}

// ---------- alur ----------
function setPhase(c, phase) {
  const st = c.st, s = st.seats[st.cur];
  st.phase = phase;
  st.deadline = s && !s.isBot && !s.auto && st.timers[phase] ? c.now + st.timers[phase] * 1000 : null;
  push(c, 'phase', { seat: st.cur, phase, deadline: st.deadline });
}
function startRound(c) {
  const st = c.st;
  st.round++; st.deck = shuffle(st, mkDeck()); st.pool = []; st.reshuffled = false; st.result = null; st.pluckOrder = [];
  st.seats.forEach(s => { s.hand = st.deck.splice(0, 7); s.melds = []; s.plucked = []; s.pen = 0; s.cv = 0; s.done = false; s.remi = false; s.ready = false; });
  st.cur = st.starter;
  push(c, 'round', { n: st.round, starter: st.cur, ownBySeat: st.seats.map(s => ({ hand: s.hand.map(pub) })) });
  beginTurn(c);
}
function beginTurn(c) {
  const st = c.st, n = st.seats.length;
  if (st.seats.every(s => s.done)) return endRound(c, null, '');
  for (let g = 0; st.seats[st.cur].done && g < n; g++) st.cur = (st.cur + 1) % n;
  if (!st.deck.length) { // tumpukan habis: ada seri -> ronde selesai; belum ada -> kocok ulang SEKALI
    const anyMeld = st.seats.some(s => s.melds.length > 0);
    if (!st.rules.reshuffleAlways && (anyMeld || st.reshuffled)) return endRound(c, null, '');
    if (!st.pool.length) return endRound(c, null, '');
    const top = st.pool.pop();
    st.deck = shuffle(st, st.pool.map(x => { x.closed = false; return x; }));
    st.pool = [top]; st.reshuffled = true;
    push(c, 'reshuffle', {});
    if (!st.deck.length) return endRound(c, null, '');
    return doDraw(c, st.cur); // setelah kocok ulang: tarik otomatis
  }
  setPhase(c, 'draw');
}
const nextTurn = c => { c.st.cur = (c.st.cur + 1) % c.st.seats.length; beginTurn(c); };
function afterGain(c, i) { if (!c.st.seats[i].hand.length) return declareRemi(c, i); setPhase(c, 'discard'); }
function doDraw(c, i) {
  const card = c.st.deck.pop();
  c.st.seats[i].hand.push(card);
  push(c, 'draw', { seat: i, own: { card: pub(card) } });
  afterGain(c, i);
}
function layMelds(c, i, ms) {
  const s = c.st.seats[i];
  for (const m of ms) {
    s.melds.push(m);
    s.hand = s.hand.filter(x => !m.includes(x));
    push(c, 'meld', { seat: i, cards: m.map(pub), value: m.reduce((a, x) => a + val(x), 0) });
  }
}
function takePool(c, i, k) {
  const taken = c.st.pool.splice(-k);
  c.st.seats[i].hand.push(...taken);
  push(c, 'eat', { seat: i, k, taken: taken.map(pub) });
}
function doEat(c, i, k, m) { takePool(c, i, k); layMelds(c, i, [m]); afterGain(c, i); }
function doDiscard(c, i, card, closed) {
  const st = c.st, s = st.seats[i];
  s.hand = s.hand.filter(x => x !== card);
  card.closed = closed; st.pool.push(card);
  push(c, 'discard', closed ? { seat: i, closed: true } : { seat: i, card: pub(card) });
  if (closed) { s.cv = val(card) * 10; return endRound(c, i, 'closed'); }
  if (s.hand.length > 7) { st.pluckOrder = shuffle(st, s.hand.map(x => x.id)); setPhase(c, 'pluck'); }
  else nextTurn(c);
}
function doPluck(c, i, id) {
  const st = c.st, s = st.seats[i];
  const card = s.hand.find(x => x.id === id);
  s.hand = s.hand.filter(x => x !== card);
  s.plucked.push(card);
  const v = val(card) * 10;
  s.pen += v;
  push(c, 'pluck', { seat: i, value: v });
  if (s.hand.length > 7) { st.pluckOrder = shuffle(st, s.hand.map(x => x.id)); setPhase(c, 'pluck'); }
  else nextTurn(c);
}
function declareRemi(c, i) { // REMI: selesai untuk pemain ini saja, yang lain lanjut
  const s = c.st.seats[i];
  s.remi = true; s.done = true;
  push(c, 'remi', { seat: i });
  nextTurn(c);
}
function endRound(c, closer, kind) {
  const st = c.st, n = st.seats.length;
  const rows = st.seats.map((s, i) => {
    const gain = s.melds.flat().reduce((a, x) => a + val(x), 0) + s.cv + (s.remi ? 25 : 0);
    const left = Math.round(s.hand.reduce((a, x) => a + val(x), 0) * st.rules.leftoverMult);
    const round = gain - left - s.pen;
    s.score += round;
    return { seat: i, gain, minus: left + s.pen, round, total: s.score, remi: s.remi };
  });
  const closedCard = kind === 'closed' ? st.pool[st.pool.length - 1] : null;
  st.result = { round: st.round, kind, closer, rows, hands: st.seats.map(s => s.hand.map(pub)), closedCard: closedCard ? pub(closedCard) : null };
  st.starter = ((closer != null ? closer : st.cur) + 1) % n;
  const reached = st.seats.filter(s => s.score >= st.target);
  const top = reached.length ? Math.max(...reached.map(s => s.score)) : 0;
  const tops = reached.filter(s => s.score === top);
  st.tie = tops.length > 1;
  st.winner = tops.length === 1 ? st.seats.indexOf(tops[0]) : null;
  push(c, 'roundEnd', { result: st.result, winner: st.winner, tie: st.tie });
  if (st.winner != null) { st.phase = 'gameover'; st.deadline = null; push(c, 'gameOver', { winner: st.winner }); }
  else { st.phase = 'between'; st.deadline = c.now + st.timers.between * 1000; st.seats.forEach(s => { s.ready = s.isBot; }); }
}

// ---------- bot / autopilot (aturan & pilihan sama dengan manusia) ----------
function botInfo(st, i) {
  const seen = new Set(), add = x => seen.add(x.s * 13 + x.r);
  st.seats[i].hand.forEach(add);
  st.pool.forEach(x => { if (!x.closed) add(x); });
  st.seats.forEach(q => q.melds.forEach(m => m.forEach(add)));
  return { deckN: st.deck.length, seen };
}
function layBot(c, i, lvl) {
  const s = c.st.seats[i];
  const ms = chooseMelds(s.hand, hm(s), lvl, botInfo(c.st, i));
  if (ms.length) layMelds(c, i, ms);
}
function botMove(c, i) {
  const st = c.st, s = st.seats[i], lvl = s.auto ? 'medium' : s.level;
  if (st.phase === 'draw') {
    layBot(c, i, lvl);
    if (!s.hand.length) return declareRemi(c, i);
    const opt = chooseEat(s.hand, hm(s), st.pool, lvl);
    if (opt) { takePool(c, i, opt.k); layMelds(c, i, [opt.meld]); layBot(c, i, lvl); afterGain(c, i); }
    else { const card = st.deck.pop(); s.hand.push(card); push(c, 'draw', { seat: i, own: { card: pub(card) } }); layBot(c, i, lvl); afterGain(c, i); }
  } else if (st.phase === 'discard') {
    layBot(c, i, lvl);
    if (!s.hand.length) return declareRemi(c, i);
    if (s.hand.length === 1 && canDiscCard(s.hand, hm(s), s.hand[0])) return doDiscard(c, i, s.hand[0], true);
    doDiscard(c, i, chooseDiscard(s.hand, hm(s), lvl, botInfo(st, i)), false);
  } else if (st.phase === 'pluck') {
    doPluck(c, i, st.pluckOrder[Math.floor(rnd(st) * st.pluckOrder.length)]);
  }
}
function runBots(c, max = 5000) {
  const st = c.st;
  for (let g = 0; g < max; g++) {
    if (st.phase === 'between') {
      if (st.seats.every(s => s.isBot || s.ready)) { startRound(c); continue; } // pemain autopilot tetap diberi jeda ronde
      break;
    }
    if (!PLAY.includes(st.phase)) break;
    const s = st.seats[st.cur];
    if (!(s.isBot || s.auto)) break;
    botMove(c, st.cur);
  }
}

// ---------- API publik ----------
export function begin(st, now = Date.now(), o = {}) {
  const c = { st, now, E: [] };
  startRound(c); runBots(c, o.maxSteps); st.v++;
  return c.E;
}
export function act(st, seat, a, now = Date.now(), o = {}) {
  const c = { st, now, E: [] };
  const fail = error => ({ ok: false, error });
  const s = st.seats[seat];
  if (!s || !a || typeof a.type !== 'string') return fail('bad_request');
  if (st.phase === 'gameover') return fail('game_over');
  const myTurn = st.cur === seat && PLAY.includes(st.phase);
  const ids = x => (Array.isArray(x) && x.length <= 12 && x.every(Number.isInteger) && new Set(x).size === x.length ? x : null);
  const pick = list => { const out = list.map(id => s.hand.find(x => x.id === id)); return out.some(x => !x) ? null : out; };
  switch (a.type) {
    case 'ready':
      if (st.phase !== 'between') return fail('bad_phase');
      s.ready = true; push(c, 'ready', { seat }); break;
    case 'draw':
      if (!myTurn || st.phase !== 'draw') return fail('not_your_turn');
      if (!st.deck.length) return fail('deck_empty');
      doDraw(c, seat); break;
    case 'eat': {
      if (!myTurn || st.phase !== 'draw') return fail('not_your_turn');
      const sid = ids(a.sel), sel = sid && pick(sid);
      if (!Number.isInteger(a.k) || !sel) return fail('bad_cards');
      const m = eatMeld(s.hand, hm(s), st.pool, a.k, sel);
      if (!m) return fail('invalid_eat');
      doEat(c, seat, a.k, m); break;
    }
    case 'meld': {
      if (!myTurn || !(st.phase === 'draw' || st.phase === 'discard')) return fail('not_your_turn');
      const sid = ids(a.cards), sel = sid && pick(sid);
      if (!sel) return fail('bad_cards');
      if (!canManualMeldCards(sel, hm(s))) return fail('invalid_meld');
      layMelds(c, seat, melds(sel, hm(s)));
      if (!s.hand.length) declareRemi(c, seat);
      break;
    }
    case 'discard': {
      if (!myTurn || st.phase !== 'discard') return fail('not_your_turn');
      const card = s.hand.find(x => x.id === a.id);
      if (!card) return fail('bad_cards');
      if (!canDiscCard(s.hand, hm(s), card)) return fail('ace_locked');
      doDiscard(c, seat, card, false); break;
    }
    case 'close':
      if (!myTurn || st.phase !== 'discard') return fail('not_your_turn');
      if (s.hand.length !== 1 || !canDiscCard(s.hand, hm(s), s.hand[0])) return fail('cannot_close');
      doDiscard(c, seat, s.hand[0], true); break;
    case 'pluck': {
      if (!myTurn || st.phase !== 'pluck') return fail('not_your_turn');
      const id = Number.isInteger(a.index) ? st.pluckOrder[a.index] : undefined;
      if (id === undefined) return fail('bad_cards');
      doPluck(c, seat, id); break;
    }
    default: return fail('unknown_action');
  }
  s.timeouts = 0; s.auto = false; // pemain aktif kembali
  runBots(c, o.maxSteps); st.v++;
  return { ok: true, events: c.E };
}
// true bila tick() akan mengubah sesuatu (batas waktu lewat). Dipakai server agar sync biasa tidak perlu mengunci.
export const needsTick = (st, now) => !!st.deadline && now >= st.deadline && (PLAY.includes(st.phase) || st.phase === 'between');
// dipanggil berkala (tiap sync): menegakkan timer giliran & menjalankan bot
export function tick(st, now = Date.now(), o = {}) {
  const c = { st, now, E: [] };
  if (st.phase === 'between' && st.deadline && now >= st.deadline) startRound(c);
  else if (PLAY.includes(st.phase) && st.deadline && now >= st.deadline) {
    const i = st.cur, s = st.seats[i];
    s.timeouts++;
    push(c, 'timeout', { seat: i, phase: st.phase });
    if (s.timeouts >= DEFAULTS.autoAfter) { s.auto = true; push(c, 'autopilot', { seat: i }); }
    if (st.phase === 'draw') doDraw(c, i); // waktu habis: tarik dari tumpukan
    else botMove(c, i);                      // buang / cabut otomatis
  }
  runBots(c, o.maxSteps);
  if (c.E.length) st.v++;
  return c.E;
}
// pemain keluar saat game berjalan: kursinya diambil alih bot
export function takeover(st, seat, now = Date.now(), o = {}) {
  const c = { st, now, E: [] }, s = st.seats[seat];
  if (!s || s.isBot) return c.E;
  s.isBot = true; s.auto = false; s.level = 'medium'; s.uid = null; s.ready = true;
  push(c, 'takeover', { seat });
  if (st.cur === seat && PLAY.includes(st.phase)) st.deadline = null;
  runBots(c, o.maxSteps); st.v++;
  return c.E;
}

// ---------- tampilan per pemain (tanpa informasi tersembunyi) ----------
export function viewFor(st, seat, now = Date.now()) {
  const me = st.seats[seat];
  const plucking = st.phase === 'pluck' && st.cur === seat;
  return {
    v: st.v, serverNow: now, you: seat, round: st.round, target: st.target, phase: st.phase, cur: st.cur,
    deadline: st.deadline, timers: st.timers, rules: st.rules, deckCount: st.deck.length, reshuffled: st.reshuffled,
    pool: st.pool.map(x => (x.closed ? { id: -1, closed: true } : pub(x))),
    seats: st.seats.map(s => ({
      name: s.name, avatar: s.avatar, uid: s.uid, isBot: s.isBot, auto: s.auto, level: s.level, score: s.score,
      handCount: s.hand.length, melds: s.melds.map(m => m.map(pub)), pluckedCount: s.plucked.length,
      done: s.done, remi: s.remi, ready: s.ready
    })),
    hand: me && !plucking ? me.hand.map(pub) : [],
    pluckCount: plucking ? me.hand.length : 0, // kartu cabutan tidak boleh diketahui: pilih lewat indeks
    result: st.phase === 'between' || st.phase === 'gameover' ? st.result : null,
    winner: st.winner, tie: st.tie
  };
}
export function eventsFor(events, seat) {
  return events.map(e => {
    const { own, ownBySeat, ...open } = e;
    const mine = ownBySeat ? ownBySeat[seat] : e.seat === seat ? own : undefined;
    return mine ? { ...open, own: mine } : open;
  });
}
export const _test = { endRound, startRound, beginTurn, botMove, runBots, doDiscard };
