import { createGame, begin, act, viewFor, cardId, _test } from '../src/engine.js';
import { mapView, eventToUi, toLocal, toSeat, cardStr } from '../src/viewmap.js';
import { mapAuthError, createSupabaseAuth, createLocalAuth } from '../src/auth.js';
import { Net, RoomClient } from '../src/net.js';
import { handle } from '../server/handler.js';
import { MemoryStore } from '../server/store.js';

let n = 0, bad = 0;
const ok = (name, got, want = true) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log('GAGAL:', name, '| dapat', JSON.stringify(got), '| harusnya', JSON.stringify(want)); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const C = (s, r) => ({ s, r, id: cardId(s, r) });
const cfg = [0, 1, 2, 3].map(i => ({ uid: 'u' + i, name: 'P' + i, avatar: i }));
const mkGame = (seed = 5) => { const st = createGame({ seats: cfg, seed }); st.starter = 0; begin(st, 1000); return st; };
const ids = (o, out = []) => { if (Array.isArray(o)) o.forEach(x => ids(x, out)); else if (o && typeof o === 'object') { if (Number.isInteger(o.id) && Number.isInteger(o.s) && Number.isInteger(o.r)) out.push(o.id); else Object.values(o).forEach(v => ids(v, out)); } return out; };

// ---------- A. pemetaan tampilan ----------
ok('toLocal/toSeat saling berbalik', [0, 1, 2, 3].every(you => [0, 1, 2, 3].every(s => toSeat(toLocal(s, you), you) === s)));
{ const st = mkGame();
  for (const you of [0, 1, 2, 3]) {
    const view = viewFor(st, you, 1000), m = mapView(view);
    ok(`kursi ${you}: pemain sendiri di indeks lokal 0`, [m.players[0].seat, m.players[0].name], [you, 'P' + you]);
    ok(`kursi ${you}: urutan searah jarum jam`, m.players.map(p => p.seat), [0, 1, 2, 3].map(l => (l + you) % 4));
    ok(`kursi ${you}: tangan sendiri asli`, m.players[0].hand.map(c => c.id), st.seats[you].hand.map(c => c.id));
    const hidden = new Set(st.seats.flatMap((s, i) => (i === you ? [] : s.hand.map(c => c.id))).concat(st.deck.map(c => c.id)));
    ok(`kursi ${you}: tidak ada kartu tersembunyi asli di hasil pemetaan`, ids(m).some(id => hidden.has(id)), false);
    ok(`kursi ${you}: jumlah tangan lawan sama`, m.players.slice(1).map(p => p.hand.length), m.players.slice(1).map(p => st.seats[p.seat].hand.length));
    const all = ids([m.players.map(p => [p.hand, p.plucked, p.melds]), m.pool, m.deck]);
    ok(`kursi ${you}: id kartu unik (mesh 3D memakai id)`, new Set(all).size, all.length);
    ok(`kursi ${you}: jumlah kartu di tumpukan`, m.deck.length, st.deck.length);
  } }
{ // kartu cabutan: tersembunyi & kartu tertutup
  const st = mkGame(9); st.seats[0].hand = [C(0, 2), C(0, 4), C(0, 6), C(1, 3), C(1, 5), C(1, 7), C(2, 9), C(2, 11), C(3, 12)]; st.cur = 0; st.phase = 'discard'; st.seats[1].plucked = [C(3, 5), C(3, 6)];
  act(st, 0, { type: 'discard', id: C(3, 12).id }, 2000);
  const view = viewFor(st, 0, 2000), m = mapView(view);
  ok('fase cabut: pemain melihat jumlah kartu tertutup saja', [m.phase, m.plk.length, m.players[0].hand.length], ['pluck', 8, 8]);
  ok('fase cabut: id pengganti tidak mengungkap kartu asli', m.plk.every(c => c.id >= 400));
  ok('kartu cabutan lawan hanya pengganti', [m.players[1].plucked.length, m.players[1].plucked.every(c => c.id >= 300)], [2, true]);
  const st2 = mkGame(9); st2.seats[0].melds = [[C(0, 3), C(0, 4), C(0, 5)]]; st2.seats[0].hand = [C(2, 12)]; st2.cur = 0; st2.phase = 'discard'; act(st2, 0, { type: 'close' }, 3000);
  const vc = viewFor(st2, 1, 3000), mc = mapView(vc);
  ok('akhir ronde: semua tangan terbuka', [mc.reveal, mc.phase, mc.players.every(p => p.hand.length === st2.seats[p.seat].hand.length)], [true, 'over', true]);
  ok('akhir ronde: kartu tutup terungkap di hasil', mc.result.closedCard.r, 12);
  const st3 = mkGame(9); st3.pool = [C(0, 2), { ...C(1, 9), closed: true }]; const mp = mapView(viewFor(st3, 0, 1));
  ok('kartu tutup di pool tidak mengungkap isi', [mp.pool[1].closed, mp.pool[1].id, mp.pool[1].r], [true, 900, 2]); }
{ const st = mkGame(); const m = mapView({ ...viewFor(st, 1, 1), phase: 'gameover', result: null });
  ok('fase gameover tanpa hasil tidak membuka tangan', m.reveal, false); }

// ---------- B. event -> efek UI ----------
{ const info = { you: 1, names: ['A', 'B', 'C', 'D'], target: 300 };
  const e1 = eventToUi({ type: 'draw', seat: 1, own: { card: C(0, 13) } }, info), e2 = eventToUi({ type: 'draw', seat: 2 }, info);
  ok('tarik sendiri: kartu terlihat', [e1.sound, e1.drawn.r, e1.log.key, e1.log.vars.card], ['draw', 13, 'log.drawYou', 'K♠']);
  ok('tarik lawan: tanpa kartu', [e2.drawn, e2.log.key, e2.loc], [null, 'log.drawBot', 1]);
  const d = eventToUi({ type: 'discard', seat: 3, card: C(2, 7) }, info);
  ok('buang: kartu muncul dari kursi pembuang', [d.sound, d.spawn, d.log.vars.card], ['discard', { id: C(2, 7).id, loc: 2 }, '7♦']);
  ok('buang tertutup', eventToUi({ type: 'discard', seat: 0, closed: true }, info).sound, 'closed');
  const mld = eventToUi({ type: 'meld', seat: 1, cards: [C(0, 3), C(0, 4), C(0, 5)], value: 15 }, info);
  ok('seri: suara, log, skor melayang', [mld.sound, mld.log.vars.cards, mld.pop], ['meld', '3♠ 4♠ 5♠', { loc: 0, text: '+15' }]);
  ok('cabut: skor negatif melayang', eventToUi({ type: 'pluck', seat: 2, value: 50 }, info).pop, { loc: 1, text: '-50', neg: true });
  ok('REMI: banner memuat nama pemain', eventToUi({ type: 'remi', seat: 3 }, info).banner, { key: 'banner.remi', vars: { name: 'D' } });
  ok('timeout memakai nama kursi', eventToUi({ type: 'timeout', seat: 2 }, info).log.vars.name, 'C');
  ok('event fase/siap diabaikan', [eventToUi({ type: 'phase' }, info), eventToUi({ type: 'ready' }, info)], [null, null]);
  ok('babak baru: suara bagi kartu', eventToUi({ type: 'round', n: 2, starter: 3 }, info).log.vars, { n: 2, room: 300, name: 'D' });
  ok('menang: nama & skor', eventToUi({ type: 'roundEnd', winner: 2, result: { rows: [{ total: 1 }, { total: 2 }, { total: 305 }, { total: 4 }] } }, info).log.vars, { name: 'C', score: 305 }); }

// ---------- C. lapisan login ----------
ok('galat: kredensial salah', mapAuthError({ message: 'Invalid login credentials' }), 'invalid_credentials');
ok('galat: email belum dikonfirmasi', mapAuthError({ code: 'email_not_confirmed' }), 'email_not_confirmed');
ok('galat: sudah terdaftar', [mapAuthError({ message: 'User already registered' }), mapAuthError({ code: 'user_already_exists' })], ['user_already_exists', 'user_already_exists']);
ok('galat: sandi lemah', mapAuthError({ code: 'weak_password' }), 'weak_password');
ok('galat: batas laju', [mapAuthError({ status: 429 }), mapAuthError({ code: 'over_request_rate_limit' })], ['rate', 'rate']);
ok('galat: jaringan', mapAuthError(new TypeError('Failed to fetch')), 'network');
ok('galat tak dikenal', mapAuthError({ message: 'aneh' }), 'generic');
{ const calls = []; let session = null, listener = null;
  const client = { auth: {
    signUp: async a => { calls.push(['signUp', a]); return a.email === 'dup@x.co' ? { data: {}, error: { message: 'User already registered' } } : { data: { user: { email: a.email }, session }, error: null }; },
    signInWithPassword: async a => (a.password === 'benar123' ? { data: { user: { email: a.email }, session: { access_token: 'AT' } }, error: null } : { data: {}, error: { message: 'Invalid login credentials' } }),
    signOut: async () => { calls.push(['signOut']); return { error: null }; },
    resetPasswordForEmail: async (e, o) => { calls.push(['reset', e, o]); return { data: {}, error: null }; },
    getSession: async () => ({ data: { session } }),
    onAuthStateChange: cb => { listener = cb; return { data: { subscription: { unsubscribe: () => { listener = null; calls.push(['unsub']); } } } }; } } };
  const a = createSupabaseAuth(client);
  const r1 = await a.signUp({ email: 'ok@x.co', password: 'password1', name: 'Ok' });
  ok('daftar: perlu konfirmasi email bila belum ada sesi', [r1.needsConfirm, calls[0][1].options.data.name], [true, 'Ok']);
  session = { access_token: 'AT' }; ok('daftar: langsung masuk bila konfirmasi dimatikan', (await a.signUp({ email: 'o2@x.co', password: 'password1', name: 'x' })).needsConfirm, false);
  let e = null; try { await a.signUp({ email: 'dup@x.co', password: 'password1' }); } catch (x) { e = x; } ok('daftar ganda -> kode terpetakan', e && e.code, 'user_already_exists');
  e = null; try { await a.signIn({ email: 'a@x.co', password: 'salah' }); } catch (x) { e = x; } ok('masuk salah -> kode terpetakan', e && e.code, 'invalid_credentials');
  ok('masuk benar', (await a.signIn({ email: 'a@x.co', password: 'benar123' })).email, 'a@x.co');
  ok('token diambil dari sesi', await a.getToken(), 'AT'); session = null; ok('tanpa sesi -> token null', await a.getToken(), null);
  await a.resetPassword('a@x.co', 'https://app/x'); ok('reset sandi meneruskan redirectTo', calls.find(c => c[0] === 'reset').slice(1), ['a@x.co', { redirectTo: 'https://app/x' }]);
  const seen = []; const off = a.onChange(s => seen.push(s)); listener('SIGNED_IN', { user: { email: 'z@x.co' } }); listener('SIGNED_OUT', null); off();
  ok('perubahan sesi diteruskan & bisa berhenti', [seen, listener], [[{ email: 'z@x.co' }, null], null]); }
{ const ctx = { store: new MemoryStore(), env: { AUTH_SECRET: 's' }, now: () => Date.now(), cfg: { rules: {}, timers: {} }, notify: null }; let ip = 0;
  const fetchFn = async (url, o) => { const u = new URL(url, 'http://x'); const out = await handle({ method: o.method, path: u.pathname, query: Object.fromEntries(u.searchParams), body: o.body, headers: Object.fromEntries(Object.entries(o.headers || {}).map(([k, v]) => [k.toLowerCase(), v])), ip: '4.4.4.' + (++ip) }, ctx); return { ok: out.status < 400, status: out.status, json: async () => out.body }; };
  const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };
  const net = new Net({ fetchFn, storage: mem() }), a = createLocalAuth(net);
  const r = await a.signUp({ email: 'lokal@mail.co', password: 'password-lokal', name: 'Lokal' });
  ok('lokal: daftar dengan email', [r.needsConfirm, r.user.email], [false, 'lokal@mail.co']);
  ok('lokal: token tersedia', !!(await a.getToken()));
  await a.signOut(); ok('lokal: keluar menghapus token', await a.getToken(), null);
  ok('lokal: masuk', (await a.signIn({ email: 'LOKAL@mail.co', password: 'password-lokal' })).name, 'Lokal');
  let e = null; try { await a.signUp({ email: 'lokal@mail.co', password: 'password-lokal' }); } catch (x) { e = x; } ok('lokal: email ganda', e && e.code, 'user_already_exists');
  e = null; try { await a.signIn({ email: 'lokal@mail.co', password: 'salah-salah' }); } catch (x) { e = x; } ok('lokal: sandi salah', e && e.code, 'invalid_credentials');
  e = null; try { await a.signUp({ email: 'bukan-email', password: 'password-lokal' }); } catch (x) { e = x; } ok('lokal: email tidak valid', e && e.code, 'email');
  const netG = new Net({ fetchFn, getToken: async () => 'dari-supabase' });
  let hdr = null; await new Net({ fetchFn: async (u, o) => { hdr = o.headers.Authorization; return { ok: true, json: async () => ({}) }; }, getToken: async () => 'dari-supabase' }).me();
  ok('Net memakai getToken (Supabase) untuk header Authorization', hdr, 'Bearer dari-supabase'); }

// ---------- D. RoomClient ----------
const mkNet = (script, opt = {}) => { const calls = { sync: [], action: [] }; let i = 0;
  return { calls, sync: async (code, since) => { calls.sync.push(since); if (opt.fail && calls.sync.length <= opt.fail) throw Object.assign(new Error('net'), { status: 500 }); if (opt.status) throw Object.assign(new Error('x'), { status: opt.status, code: 'not_member' }); const p = typeof script === 'function' ? script(calls.sync.length) : script[Math.min(i++, script.length - 1)]; return p; },
    action: async (code, a, since) => { calls.action.push([a, since]); return opt.actionPayload || { seq: 5, events: [{ seq: 4, type: 'draw' }, { seq: 5, type: 'discard' }], status: 'playing', serverNow: 0 }; } }; };
const mkRealtime = () => { const r = { handlers: [], removed: 0, subCb: null, channel() { return { on: (t, f, cb) => { r.handlers.push(cb); return this.chan; }, subscribe: cb => { r.subCb = cb; } }; }, removeChannel() { r.removed++; } }; return r; };
{ const net = mkNet(() => ({ seq: 1, events: [], status: 'playing', serverNow: 0, view: { cur: 1, you: 0 } })), got = [], rt = mkRealtime();
  const c = new RoomClient({ net, code: 'ABC', onUpdate: p => got.push(p), realtime: rt, fallbackMs: 5000, pollMs: 5000, fastMs: 5000 }).start();
  await sleep(30); ok('start: sinkronisasi pertama langsung', [net.calls.sync.length, got.length], [1, 1]);
  await sleep(60); ok('sebelum kanal terkonfirmasi tidak ada sync berulang cepat (pollMs besar)', net.calls.sync.length, 1);
  rt.subCb('SUBSCRIBED'); await sleep(40); ok('realtime terhubung: sync tambahan saat tersambung', net.calls.sync.length, 2);
  const before = net.calls.sync.length; rt.handlers[0](); await sleep(40); ok('notifikasi push memicu sync segera (tanpa menunggu polling)', net.calls.sync.length, before + 1);
  const b2 = net.calls.sync.length; for (let k = 0; k < 10; k++) rt.handlers[0](); await sleep(120); ok('10 notifikasi beruntun digabung (maks. 2-3 sync)', net.calls.sync.length - b2 <= 3, true);
  const b3 = net.calls.sync.length; await sleep(300); ok('saat realtime hidup polling cadangan jarang', net.calls.sync.length - b3, 0);
  c.stop(); ok('stop: kanal dilepas', rt.removed, 1); const b4 = net.calls.sync.length; rt.handlers[0](); await sleep(60); ok('setelah stop tidak ada sync', net.calls.sync.length, b4); }
{ const net = mkNet(() => ({ seq: 1, events: [], status: 'playing', serverNow: 0, view: { cur: 1, you: 0 } })), got = [];
  const c = new RoomClient({ net, code: 'A', onUpdate: p => got.push(p), pollMs: 40 }).start(); await sleep(190); c.stop();
  ok('tanpa realtime: polling berkala', net.calls.sync.length >= 3, true); }
{ const net = mkNet(() => ({ seq: 1, events: [], status: 'playing', serverNow: 1000, view: { cur: 1, you: 0, deadline: 1100 } }));
  const c = new RoomClient({ net, code: 'A', onUpdate() {}, pollMs: 5000 }).start(); await sleep(120);
  ok('batas waktu giliran: bangun lebih cepat dari polling (>=300 ms)', net.calls.sync.length, 1); await sleep(450); c.stop();
  ok('batas waktu giliran: sync dipicu setelah deadline', net.calls.sync.length, 2); }
{ const net = mkNet(() => ({ seq: 5, events: [{ seq: 4, type: 'draw' }, { seq: 5, type: 'discard' }], status: 'playing', serverNow: 0 })), got = [];
  const c = new RoomClient({ net, code: 'A', onUpdate: p => got.push(p), pollMs: 5000 }).start(); await sleep(40);
  await c.send({ type: 'draw' });
  ok('event yang sama dari sync & action hanya diteruskan sekali', got.flatMap(p => p.events).map(e => e.seq), [4, 5]);
  ok('aksi membawa nomor event terakhir', net.calls.action[0][1], 5); c.stop(); }
{ const got = [], net = mkNet([], { status: 403 }); new RoomClient({ net, code: 'A', onUpdate: p => got.push(p), pollMs: 20 }).start(); await sleep(80);
  ok('tidak lagi anggota (403): berhenti & melapor', [got[0].error, net.calls.sync.length], ['not_member', 1]); }
{ const got = [], net = mkNet(() => ({ seq: 1, events: [], status: 'playing', serverNow: 0 }), { fail: 2 });
  const c = new RoomClient({ net, code: 'A', onUpdate: p => got.push(p), pollMs: 20, backoffMs: 15 }).start(); await sleep(250); c.stop();
  ok('galat jaringan: mencoba lagi dengan backoff lalu pulih', [net.calls.sync.length >= 3, got.length >= 1], [true, true]); }
{ const net = mkNet(() => ({ seq: 9, events: [], status: 'finished', serverNow: 0 })); const c = new RoomClient({ net, code: 'A', onUpdate() {}, pollMs: 20 }).start(); await sleep(120);
  ok('game selesai: polling berhenti', net.calls.sync.length, 1); c.stop(); }

console.log(`${n - bad}/${n} tes klien lulus`);
process.exit(bad ? 1 : 0);
