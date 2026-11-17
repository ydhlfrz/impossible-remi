// Pemetaan murni: tampilan dari server (view/events) -> data yang dipakai renderer 3D. Mudah diuji tanpa DOM.
export const N = 4;
const RANKS = [0, 'A', 2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K'], SUITS = ['♠', '♥', '♦', '♣'];
export const cardStr = c => RANKS[c.r] + SUITS[c.s];
export const toLocal = (seat, you) => (seat - you + N) % N; // pemain sendiri selalu di bawah (indeks lokal 0)
export const toSeat = (loc, you) => (loc + you) % N;
// kartu pengganti untuk kartu yang tidak boleh diketahui (selalu tampil tertutup); id tidak bentrok dengan kartu asli 0..51
const ph = id => ({ s: 0, r: 2, id });
export const PH = { hand: (seat, j) => 100 + seat * 20 + j, plucked: (seat, j) => 300 + seat * 12 + j, myPluck: j => 400 + j, deck: j => 500 + j, closed: 900 };

export function mapView(view) {
  const you = view.you, reveal = !!view.result && (view.phase === 'between' || view.phase === 'gameover');
  const players = [];
  for (let loc = 0; loc < N; loc++) {
    const seat = toSeat(loc, you), s = view.seats[seat];
    let hand = loc === 0
      ? (view.pluckCount ? Array.from({ length: view.pluckCount }, (_, j) => ph(PH.myPluck(j))) : view.hand)
      : Array.from({ length: s.handCount }, (_, j) => ph(PH.hand(seat, j)));
    if (reveal) hand = view.result.hands[seat]; // akhir ronde: semua tangan terbuka
    players.push({ seat, name: s.name, avatar: s.avatar, uid: s.uid, isBot: s.isBot, auto: s.auto, score: s.score, hand, melds: s.melds, done: s.done, remi: s.remi, ready: s.ready,
      plucked: Array.from({ length: s.pluckedCount }, (_, j) => ph(PH.plucked(seat, j))) });
  }
  return {
    phase: view.phase === 'between' || view.phase === 'gameover' ? 'over' : view.phase, serverPhase: view.phase,
    cur: toLocal(view.cur, you), round: view.round, target: view.target, deckCount: view.deckCount,
    deck: Array.from({ length: view.deckCount }, (_, j) => ph(PH.deck(j))),
    pool: view.pool.map(c => (c.closed ? { ...ph(PH.closed), closed: true } : c)),
    plk: view.pluckCount ? players[0].hand : [], reveal, result: view.result, winner: view.winner, tie: view.tie,
    deadline: view.deadline, serverNow: view.serverNow, players
  };
}

// Satu event server -> efek UI (suara, log, banner, titik awal animasi). names = nama per kursi server.
export function eventToUi(e, { you, names, target }) {
  const loc = e.seat != null ? toLocal(e.seat, you) : null, name = e.seat != null ? names[e.seat] : '';
  switch (e.type) {
    case 'round': return { sound: 'deal', newRound: true, log: { sys: true, key: 'log.round', vars: { n: e.n, room: target, name: names[e.starter] } } };
    case 'draw': return { sound: 'draw', loc, drawn: e.own ? e.own.card : null, log: { loc, key: loc === 0 ? 'log.drawYou' : 'log.drawBot', vars: e.own ? { card: cardStr(e.own.card) } : {} } };
    case 'eat': return { sound: 'eat', loc, log: { loc, key: 'log.eat', vars: { k: e.k, cards: e.taken.map(cardStr).join(' ') } } };
    case 'meld': return { sound: 'meld', loc, log: { loc, key: 'log.meld', vars: { cards: e.cards.map(cardStr).join(' '), v: e.value } }, pop: { loc, text: '+' + e.value } };
    case 'discard': return e.closed
      ? { sound: 'closed', loc, log: { loc, key: 'log.closed' } }
      : { sound: 'discard', loc, spawn: { id: e.card.id, loc }, log: { loc, key: 'log.discard', vars: { card: cardStr(e.card) } } };
    case 'pluck': return { sound: 'pluck', loc, log: { loc, key: 'log.pluck' }, pop: { loc, text: '-' + e.value, neg: true } };
    case 'remi': return { sound: 'remi', loc, log: { loc, key: 'log.remi' }, banner: { key: 'banner.remi', vars: { name } } };
    case 'reshuffle': return { sound: 'shuffle', log: { sys: true, key: 'log.reshuffle' } };
    case 'timeout': return { log: { sys: true, key: 'online.timeout', vars: { name } } };
    case 'autopilot': return { log: { sys: true, key: 'online.autopilot', vars: { name } } };
    case 'takeover': return { log: { sys: true, key: 'online.takeover', vars: { name } } };
    case 'roundEnd': return e.winner != null ? { sound: 'win', log: { sys: true, key: 'log.win', vars: { name: names[e.winner], score: e.result.rows[e.winner].total } } }
      : { log: { sys: true, key: 'log.noWinner' } };
    default: return null; // phase, ready, gameOver: tidak perlu efek
  }
}
