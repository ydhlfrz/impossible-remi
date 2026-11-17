import { createGame, begin, act, tick, viewFor, eventsFor, takeover, cardId, _test } from '../src/engine.js';
let n = 0, bad = 0;
const ok = (name, got, want = true) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log('GAGAL:', name, '| dapat', JSON.stringify(got), '| harusnya', JSON.stringify(want)); } };
const cfg = humans => [0, 1, 2, 3].map(i => (i < humans ? { uid: 'u' + i, name: 'P' + i } : { isBot: true, name: 'Bot' + i, level: 'medium' }));
const C = (s, r) => ({ s, r, id: cardId(s, r) });
const T0 = 1_000_000;
function invariants(st) {
  const ids = [], add = x => ids.push(x.id);
  st.deck.forEach(add); st.pool.forEach(add);
  st.seats.forEach(s => { s.hand.forEach(add); s.melds.flat().forEach(add); s.plucked.forEach(add); });
  return ids.length === 52 && new Set(ids).size === 52;
}
const collect = (o, out = []) => {
  if (Array.isArray(o)) o.forEach(x => collect(x, out));
  else if (o && typeof o === 'object') { if (Number.isInteger(o.s) && Number.isInteger(o.r) && Number.isInteger(o.id)) out.push(o.id); else Object.values(o).forEach(v => collect(v, out)); }
  return out;
};
const fresh = (humans = 1, seed = 11, extra = {}) => { const st = createGame({ seats: cfg(humans), seed, ...extra }); st.starter = 0; begin(st, T0); return st; };

// 1. pembagian deterministik & kartu utuh
{ const a = createGame({ seats: cfg(1), seed: 5 }), b = createGame({ seats: cfg(1), seed: 5 }); a.starter = b.starter = 0; begin(a, T0); begin(b, T0);
  ok('seed sama -> tangan sama', a.seats[0].hand.map(x => x.id), b.seats[0].hand.map(x => x.id));
  ok('52 kartu utuh setelah dibagi', invariants(a)); ok('tiap pemain 7 kartu saat menunggu giliran pertama', a.seats.map(s => s.hand.length), [7, 7, 7, 7]); }

// 2. permainan penuh antar bot: tidak error, kartu selalu utuh, berakhir dengan pemenang
for (const seed of [1, 2, 3, 4, 5, 6]) {
  const st = createGame({ seats: cfg(0), seed, target: 150, rules: { leftoverMult: 0.5 } });
  begin(st, T0, { maxSteps: 25 });
  let iters = 0, allOk = true;
  while (st.phase !== 'gameover' && iters++ < 20000) { tick(st, T0, { maxSteps: 25 }); if (!invariants(st)) { allOk = false; break; } }
  ok(`bot-only seed ${seed}: kartu selalu utuh`, allOk);
  ok(`bot-only seed ${seed}: game berakhir`, st.phase === 'gameover' && st.winner !== null);
}

// 3. timer 30 detik & autopilot
{ const st = fresh(1, 7);
  ok('giliran pemain: fase tarik', [st.cur, st.phase], [0, 'draw']);
  ok('batas waktu tarik = 30 dtk', st.deadline, T0 + 30000);
  ok('sebelum 30 dtk tidak ada perubahan', tick(st, T0 + 29000).length, 0);
  tick(st, T0 + 31000);
  ok('timeout tarik -> tarik otomatis', [st.phase, st.seats[0].hand.length, st.seats[0].timeouts], ['discard', 8, 1]);
  ok('batas waktu buang = 30 dtk', st.deadline, T0 + 31000 + 30000);
  tick(st, T0 + 62000);
  ok('timeout kedua -> autopilot aktif', st.seats[0].auto, true);
  ok('setelah autopilot, ronde berjalan sampai selesai (jeda antar ronde)', ['between', 'gameover'].includes(st.phase));
  ok('kartu utuh setelah autopilot', invariants(st));
  const r = st.round;
  tick(st, T0 + 62000 + 10000);
  ok('jeda antar ronde belum habis: ronde sama', st.round, r);
  tick(st, T0 + 62000 + 21000);
  ok('jeda 20 dtk habis: ronde baru dimulai', st.round > r || st.phase === 'gameover');
}
// pemain kembali: autopilot dimatikan saat bertindak
{ const st = fresh(1, 8); tick(st, T0 + 31000); tick(st, T0 + 62000); const s0 = st.seats[0];
  ok('autopilot menyala', s0.auto, true);
  tick(st, T0 + 62000 + 21000);
  st.phase = 'between'; s0.ready = false; const rr = act(st, 0, { type: 'ready' }, T0 + 90000);
  ok('ready diterima & autopilot mati', [rr.ok, s0.auto, s0.timeouts], [true, false, 0]); }

// 4. validasi aksi
{ const st = fresh(1, 3);
  ok('bot tidak bisa dikendalikan klien lain (bukan giliran)', act(st, 1, { type: 'draw' }).error, 'not_your_turn');
  ok('buang di fase tarik ditolak', act(st, 0, { type: 'discard', id: st.seats[0].hand[0].id }).error, 'not_your_turn');
  ok('makan dari pool kosong ditolak', act(st, 0, { type: 'eat', k: 1, sel: [st.seats[0].hand[0].id, st.seats[0].hand[1].id] }).error, 'invalid_eat');
  ok('kartu milik orang lain ditolak', act(st, 0, { type: 'meld', cards: [st.seats[1].hand[0].id, st.seats[1].hand[1].id, st.seats[1].hand[2].id] }).error, 'bad_cards');
  ok('aksi tak dikenal', act(st, 0, { type: 'hack' }).error, 'unknown_action');
  ok('payload rusak', act(st, 0, null).error, 'bad_request');
  const before = JSON.stringify(st);
  act(st, 0, { type: 'eat', k: 99, sel: [] });
  ok('aksi gagal tidak mengubah state', JSON.stringify(st), before);
  const r = act(st, 0, { type: 'draw' }, T0 + 1000);
  ok('tarik valid', [r.ok, st.phase, st.seats[0].hand.length], [true, 'discard', 8]); }

// 5. aturan As
{ const st = fresh(1, 3); const s0 = st.seats[0];
  s0.hand = [C(0, 1), C(1, 1), C(2, 5), C(3, 9), C(0, 13), C(1, 4), C(1, 6), C(2, 8)]; st.phase = 'discard'; st.cur = 0;
  ok('buang As sebelum punya seri ditolak', act(st, 0, { type: 'discard', id: C(0, 1).id }).error, 'ace_locked');
  s0.hand = [C(0, 1), C(1, 1), C(2, 1), C(3, 9), C(0, 13), C(1, 4), C(1, 6), C(2, 8)];
  const r = act(st, 0, { type: 'meld', cards: [C(0, 1).id, C(1, 1).id, C(2, 1).id] });
  ok('3 As diserikan tanpa seri sebelumnya', [r.ok, s0.melds.length, s0.hand.length], [true, 1, 5]); }
{ const st = fresh(1, 3); const s0 = st.seats[0]; // punya 2 As, menarik As ketiga
  s0.hand = [C(0, 1), C(1, 1), C(3, 9), C(0, 13), C(1, 4), C(1, 6), C(2, 8)]; st.deck.push(C(2, 1)); st.cur = 0; st.phase = 'draw';
  ok('tarik As ketiga', act(st, 0, { type: 'draw' }).ok);
  ok('2 As + As ketiga dari tarikan bisa diserikan', act(st, 0, { type: 'meld', cards: [C(0, 1).id, C(1, 1).id, C(2, 1).id] }).ok); }
{ const st = fresh(1, 3); const s0 = st.seats[0]; // makan As dari pool tetap perlu seri jadi
  s0.hand = [C(0, 1), C(1, 1), C(3, 9), C(0, 13), C(1, 4), C(1, 6), C(2, 8)]; st.pool = [C(2, 1)]; st.cur = 0; st.phase = 'draw';
  ok('makan As tanpa seri jadi ditolak', act(st, 0, { type: 'eat', k: 1, sel: [C(0, 1).id, C(1, 1).id] }).error, 'invalid_eat'); }

// 6. makan dari pool (pendamping berurutan satu sisi)
{ const st = fresh(1, 3); const s0 = st.seats[0];
  s0.hand = [C(0, 7), C(0, 8), C(0, 10), C(3, 2), C(1, 4), C(1, 6), C(2, 8)]; st.pool = [C(0, 9)]; st.cur = 0; st.phase = 'draw';
  ok('9 dengan 8,10 ditolak', act(st, 0, { type: 'eat', k: 1, sel: [C(0, 8).id, C(0, 10).id] }).error, 'invalid_eat');
  const r = act(st, 0, { type: 'eat', k: 1, sel: [C(0, 7).id, C(0, 8).id, C(0, 10).id] });
  ok('9 dengan 7,8,10 diterima -> seri 4 kartu', [r.ok, s0.melds[0] && s0.melds[0].length, st.phase], [true, 4, 'discard']);
  ok('event makan terkirim', r.events.some(e => e.type === 'eat' && e.k === 1)); }

// 7. REMI hanya untuk pemain itu; yang lain lanjut sampai tumpukan habis
{ const st = fresh(1, 21); const s0 = st.seats[0];
  s0.hand = [C(0, 7), C(0, 8), C(0, 9)]; st.deck = [C(1, 2), C(1, 3), C(2, 12)]; st.pool = []; st.cur = 0; st.phase = 'draw';
  const r = act(st, 0, { type: 'meld', cards: [C(0, 7).id, C(0, 8).id, C(0, 9).id] }, T0 + 5000);
  ok('manual meld habis -> REMI', [r.ok, s0.remi, s0.done], [true, true, true]);
  ok('ronde berlanjut untuk pemain lain lalu berakhir saat tumpukan habis', st.phase, 'between');
  const row = st.result.rows[0];
  ok('skor REMI = seri 15 + bonus 25', [row.gain, row.round, s0.score], [40, 40, 40]);
  ok('REMI tercatat di hasil', st.result.rows[0].remi && !st.result.rows[1].remi); }
{ const st = fresh(1, 22); const s0 = st.seats[0]; // semua seat REMI -> ronde langsung selesai
  st.seats.forEach(s => { if (s !== s0) { s.done = true; s.remi = true; } });
  s0.hand = [C(0, 7), C(0, 8), C(0, 9)]; st.cur = 0; st.phase = 'draw';
  act(st, 0, { type: 'meld', cards: [C(0, 7).id, C(0, 8).id, C(0, 9).id] });
  ok('semua pemain selesai -> ronde berakhir', st.phase, 'between'); }

// 8. tumpukan habis
const mkC = st => ({ st, now: T0, E: [] });
{ const st = fresh(1, 31); st.deck = []; st.pool = [C(0, 2), C(0, 3), C(0, 4)]; st.seats.forEach(s => (s.melds = [])); st.cur = 0; st.reshuffled = false;
  _test.beginTurn(mkC(st));
  ok('belum ada seri -> kocok ulang sekali', [st.reshuffled, st.pool.length, st.deck.length, st.phase], [true, 1, 1, 'discard']);
  ok('tarik otomatis setelah kocok', st.seats[0].hand.length, 8); }
{ const st = fresh(1, 31); st.deck = []; st.pool = [C(0, 2), C(0, 3)]; st.seats.forEach(s => (s.melds = [])); st.cur = 0; st.reshuffled = true;
  _test.beginTurn(mkC(st)); ok('sudah dikocok & tetap tanpa seri -> ronde selesai', st.phase, 'between'); }
{ const st = fresh(1, 31); st.deck = []; st.pool = [C(0, 2), C(0, 3)]; st.seats.forEach(s => (s.melds = [])); st.seats[2].melds = [[C(1, 5), C(1, 6), C(1, 7)]]; st.cur = 0;
  _test.beginTurn(mkC(st)); ok('sudah ada seri -> ronde selesai tanpa kocok', [st.phase, st.reshuffled], ['between', false]); }
{ const st = fresh(1, 31, { rules: { reshuffleAlways: true } }); st.deck = []; st.pool = [C(0, 2), C(0, 3), C(0, 4)]; st.seats[2].melds = [[C(1, 5), C(1, 6), C(1, 7)]]; st.cur = 0; st.reshuffled = true;
  _test.beginTurn(mkC(st)); ok('reshuffleAlways: tetap kocok walau ada seri', st.reshuffled && st.phase === 'discard'); }
{ const st = fresh(1, 31); st.deck = []; st.pool = [C(0, 2)]; st.seats.forEach(s => (s.melds = [])); st.cur = 0;
  _test.beginTurn(mkC(st)); ok('pool 1 kartu: setelah kocok tak ada kartu -> selesai', st.phase, 'between'); }

// 9. cabut kartu lewat indeks; pemain tidak tahu isi kartu
{ const st = fresh(1, 41); const s0 = st.seats[0];
  s0.hand = [C(0, 2), C(0, 4), C(0, 6), C(1, 3), C(1, 5), C(1, 7), C(2, 9), C(2, 11), C(3, 12)]; st.cur = 0; st.phase = 'discard';
  act(st, 0, { type: 'discard', id: C(3, 12).id });
  ok('lebih dari 7 -> fase cabut', [st.phase, st.pluckOrder.length], ['pluck', 8]);
  const v = viewFor(st, 0, T0);
  ok('tampilan cabut: tangan disembunyikan, hanya jumlah', [v.hand.length, v.pluckCount], [0, 8]);
  ok('cabut oleh pemain lain ditolak', act(st, 1, { type: 'pluck', index: 0 }).error, 'not_your_turn');
  ok('indeks di luar batas ditolak', act(st, 0, { type: 'pluck', index: 99 }).error, 'bad_cards');
  const r = act(st, 0, { type: 'pluck', index: 0 });
  ok('cabut valid: denda tercatat, tangan 7', [r.ok, s0.hand.length, s0.pen > 0, s0.plucked.length], [true, 7, true, 1]); }

// 10. tutup ronde (CLOSED): kartu tertutup tersembunyi sampai ronde berakhir
{ const st = fresh(1, 51); const s0 = st.seats[0];
  s0.melds = [[C(0, 3), C(0, 4), C(0, 5)]]; s0.hand = [C(2, 12)]; st.cur = 0; st.phase = 'discard';
  ok('tutup dengan 1 kartu diterima', act(st, 0, { type: 'close' }).ok);
  ok('CLOSED: ronde selesai', st.phase, 'between');
  ok('nilai CLOSED gambar +100', st.seats[0].cv, 100);
  const vOther = viewFor(st, 1, T0);
  ok('kartu tutup terungkap di hasil akhir ronde', vOther.result.closedCard && vOther.result.closedCard.r, 12); }
{ const st = fresh(1, 52); const s0 = st.seats[0]; s0.hand = [C(2, 12)]; s0.melds = [[C(0, 3), C(0, 4), C(0, 5)]]; st.cur = 0; st.phase = 'discard';
  st.seats[0].hand = [C(2, 12), C(1, 2)]; ok('tutup dengan 2 kartu ditolak', act(st, 0, { type: 'close' }).error, 'cannot_close'); }

// 11. menang & seri di puncak
{ const st = fresh(1, 61); st.target = 300;
  st.seats.forEach(s => { s.hand = []; s.melds = []; s.pen = 0; s.cv = 0; s.remi = false; s.score = 0; });
  st.seats[0].score = 290; st.seats[1].score = 290; st.seats[0].melds = [[C(0, 3), C(0, 4), C(0, 5)]]; st.seats[1].melds = [[C(1, 3), C(1, 4), C(1, 5)]];
  _test.endRound(mkC(st), null, '');
  ok('skor puncak sama -> tanpa pemenang, lanjut', [st.tie, st.winner, st.phase], [true, null, 'between']);
  st.seats.forEach(s => { s.hand = []; s.melds = []; }); st.seats[0].melds = [[C(0, 3), C(0, 4), C(0, 5)], [C(0, 6), C(0, 7), C(0, 8)]]; st.seats[1].melds = [[C(1, 3), C(1, 4), C(1, 5)]];
  _test.endRound(mkC(st), null, '');
  ok('skor tertinggi menang', [st.winner, st.phase], [0, 'gameover']);
  ok('aksi setelah game selesai ditolak', act(st, 0, { type: 'draw' }).error, 'game_over'); }

// 12. tidak ada kebocoran informasi pada tampilan & event
{ const st = createGame({ seats: cfg(1), seed: 77 }); st.starter = 0; const E = begin(st, T0);
  const allowed = s => new Set([...st.seats[s].hand.map(x => x.id), ...st.pool.filter(x => !x.closed).map(x => x.id), ...st.seats.flatMap(q => q.melds.flat().map(x => x.id))]);
  for (const seat of [0, 1, 2, 3]) {
    const v = viewFor(st, seat, T0), got = collect(v), ok2 = allowed(seat);
    ok(`tampilan kursi ${seat}: hanya kartu yang boleh dilihat`, got.every(id => ok2.has(id)));
    ok(`tampilan kursi ${seat}: tidak memuat isi tumpukan`, 'deck' in v, false);
  }
  const e1 = eventsFor(E, 1).find(e => e.type === 'round');
  ok('event pembagian: tangan sendiri persis', e1.own.hand.map(x => x.id), st.seats[1].hand.map(x => x.id));
  const hs0 = new Set(st.seats[0].hand.map(x => x.id));
  ok('event pembagian kursi 1 tidak memuat satu pun kartu kursi 0', collect(eventsFor(E, 1)).some(id => hs0.has(id)), false);
  ok('kursi 0 melihat tangannya sendiri di event', collect(eventsFor(E, 0)).filter(id => hs0.has(id)).length, 7);
  ok('event pembagian tidak menyertakan ownBySeat', 'ownBySeat' in e1, false);
  const d = []; act(st, 0, { type: 'draw' }, T0 + 1).events.forEach(e => d.push(e));
  ok('event tarik: kartu hanya untuk pemilik', [eventsFor(d, 0).find(e => e.type === 'draw').own !== undefined, eventsFor(d, 1).find(e => e.type === 'draw').own], [true, undefined]); }

// 13. pemain keluar -> bot mengambil alih
{ const st = fresh(1, 91); takeover(st, 0, T0 + 1000);
  ok('kursi menjadi bot tanpa akun', [st.seats[0].isBot, st.seats[0].uid], [true, null]);
  ok('permainan lanjut tanpa menunggu pemain yang pergi', st.phase !== 'draw' || st.cur !== 0);
  ok('kartu utuh setelah takeover', invariants(st)); }

// 14. antar ronde: ready memulai ronde baru
{ const st = fresh(1, 101); st.seats.forEach(s => { s.hand = []; }); st.seats[0].melds = [[C(0, 3), C(0, 4), C(0, 5)]];
  _test.endRound(mkC(st), null, ''); const r0 = st.round;
  ok('fase antar ronde: bot siap, manusia belum', st.seats.map(s => s.ready), [false, true, true, true]);
  act(st, 0, { type: 'ready' }, T0 + 2000); ok('semua siap -> ronde baru', st.round, r0 + 1); }

console.log(`${n - bad}/${n} tes mesin lulus`);
process.exit(bad ? 1 : 0);
