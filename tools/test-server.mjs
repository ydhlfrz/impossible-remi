import { handle } from '../server/handler.js';
import { MemoryStore, UpstashStore } from '../server/store.js';
import { chooseEat, chooseMelds, chooseDiscard } from '../src/bot.js';
import { canDiscCard } from '../src/rules.js';

let n = 0, bad = 0;
const ok = (name, got, want = true) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log('GAGAL:', name, '| dapat', JSON.stringify(got), '| harusnya', JSON.stringify(want)); } };
const clock = { t: 1_700_000_000_000 };
const store = new MemoryStore();
const ctx = { store, env: { AUTH_SECRET: 'test-secret' }, now: () => clock.t, cfg: { rules: { leftoverMult: 0.5 }, timers: {} } };
let ipN = 0;
async function call(method, path, { body, query, token, ip, c = ctx } = {}) {
  return handle({ method, path, query: query || {}, body, headers: token ? { authorization: 'Bearer ' + token } : {}, ip: ip || '10.0.0.' + (++ipN) }, c);
}
const mkUser = async (name, extra = {}) => {
  const r = await call('POST', '/api/register', { body: { username: name, password: 'password-' + name, name, ...extra } });
  return { name, token: r.body.token, uid: r.body.user && r.body.user.uid, status: r.status };
};
const collect = (o, out = []) => {
  if (Array.isArray(o)) o.forEach(x => collect(x, out));
  else if (o && typeof o === 'object') { if (Number.isInteger(o.s) && Number.isInteger(o.r) && Number.isInteger(o.id)) out.push(o.id); else Object.values(o).forEach(v => collect(v, out)); }
  return out;
};

// ---------- A. akun & token ----------
const A = await mkUser('alice'), B = await mkUser('bobby'), Cc = await mkUser('carol');
ok('daftar berhasil', A.status, 201);
ok('username kembar ditolak', (await call('POST', '/api/register', { body: { username: 'ALICE', password: 'password-x1' } })).status, 409);
ok('username tidak valid ditolak', (await call('POST', '/api/register', { body: { username: 'a b', password: 'password-x1' } })).body.error, 'bad_username');
ok('password lemah ditolak', (await call('POST', '/api/register', { body: { username: 'dave1', password: '123' } })).body.error, 'weak_password');
ok('login salah ditolak', (await call('POST', '/api/login', { body: { username: 'alice', password: 'salah-salah' } })).status, 401);
const L = await call('POST', '/api/login', { body: { username: 'alice', password: 'password-alice' } });
ok('login benar', [L.status, !!L.body.token], [200, true]);
const me = await call('GET', '/api/me', { token: L.body.token });
ok('me', [me.status, me.body.user.username, me.body.user.chips], [200, 'alice', 0]);
ok('hash password tidak pernah dikirim', /salt|hash|pass/i.test(JSON.stringify(me.body)), false);
ok('tanpa token ditolak', (await call('GET', '/api/me')).status, 401);
ok('token dirusak ditolak', (await call('GET', '/api/me', { token: A.token.slice(0, -2) + 'xx' })).status, 401);
{ const saved = clock.t; clock.t += 31 * 86400 * 1000; ok('token kedaluwarsa ditolak', (await call('GET', '/api/me', { token: A.token })).status, 401); clock.t = saved; }
ok('tanpa AUTH_SECRET di produksi -> 500', (await call('GET', '/api/me', { token: A.token, c: { ...ctx, env: { VERCEL: '1' } } })).body.error, 'server_misconfigured');
ok('nama dibersihkan dari tag', (await call('POST', '/api/profile', { token: A.token, body: { name: '<b>Ali</b>' } })).body.user.name, 'bAli/b');
ok('avatar tidak valid ditolak', (await call('POST', '/api/profile', { token: A.token, body: { avatar: { img: 'javascript:alert(1)' } } })).body.error, 'bad_avatar');
ok('avatar emoji valid', (await call('POST', '/api/profile', { token: A.token, body: { avatar: { i: 3 } } })).body.user.avatar, { i: 3 });
{ let st = 0; for (let i = 0; i < 12; i++) st = (await call('POST', '/api/login', { body: { username: 'bobby', password: 'salah-salah' }, ip: '9.9.9.9' })).status; ok('percobaan login berlebihan -> 429', st, 429); }

// ---------- B. ruang pribadi bersandi ----------
const mk = await call('POST', '/api/rooms', { token: A.token, body: { target: 300, level: 'medium', password: 'rahasia' } });
const code = mk.body.code;
ok('buat ruang', [mk.status, code.length, mk.body.seat, mk.body.isHost], [201, 6, 0, true]);
ok('sandi tidak bocor di lobi', /salt|hash/.test(JSON.stringify(mk.body)), false);
ok('sudah di ruang -> tidak bisa buat lagi', (await call('POST', '/api/rooms', { token: A.token, body: { target: 300 } })).body.error, 'already_in_room');
ok('sandi salah ditolak', (await call('POST', '/api/rooms/join', { token: B.token, body: { code, password: 'salah' } })).body.error, 'wrong_password');
ok('kode tidak ada', (await call('POST', '/api/rooms/join', { token: B.token, body: { code: 'ZZZZZZ', password: 'x' } })).status, 404);
ok('masuk dengan sandi benar (kode tak peka huruf besar)', (await call('POST', '/api/rooms/join', { token: B.token, body: { code: code.toLowerCase(), password: 'rahasia' } })).body.seat, 1);
ok('tidak bisa mulai bila bukan host', (await call('POST', '/api/rooms/start', { token: B.token, body: { code } })).status, 403);
ok('pemain luar tidak bisa sync', (await call('GET', '/api/rooms/sync', { token: Cc.token, query: { code } })).status, 403);
const st1 = await call('POST', '/api/rooms/start', { token: A.token, body: { code } });
ok('host memulai: sisa kursi diisi bot', [st1.status, st1.body.status, st1.body.view.seats.filter(s => s.isBot).length], [200, 'playing', 2]);
ok('tidak bisa masuk ruang yang sudah jalan', (await call('POST', '/api/rooms/join', { token: Cc.token, body: { code, password: 'rahasia' } })).body.error, 'room_started');

// ---------- C. bermain lewat API (2 manusia) + keamanan informasi ----------
const users = [A, B];
const serverRoom = () => store.get('room:' + code);
async function sync(u, since = 0) { return (await call('GET', '/api/rooms/sync', { token: u.token, query: { code, since: String(since) } })); }
async function doAct(u, action) { return (await call('POST', '/api/rooms/action', { token: u.token, body: { code, action } })).body; }
async function drive(u, p) {
  const v = p.view; if (!v) return false;
  const me = v.seats[v.you], hasMeld = me.melds.length > 0;
  if (v.phase === 'between') { if (!me.ready) { await doAct(u, { type: 'ready' }); return true; } return false; }
  if (v.phase === 'gameover' || v.cur !== v.you) return false;
  const info = { deckN: v.deckCount, seen: new Set(v.hand.map(c => c.s * 13 + c.r)) };
  if (v.phase === 'pluck') { await doAct(u, { type: 'pluck', index: 0 }); return true; }
  if (v.phase === 'draw') {
    const opt = chooseEat(v.hand, hasMeld, v.pool, 'medium');
    await doAct(u, opt ? { type: 'eat', k: opt.k, sel: opt.sel.map(c => c.id) } : { type: 'draw' }); return true;
  }
  const ms = chooseMelds(v.hand, hasMeld, 'medium', info);
  if (ms.length) { const r = await doAct(u, { type: 'meld', cards: ms[0].map(c => c.id) }); if (r.ok) return true; }
  if (!v.hand.length) return false;
  if (v.hand.length === 1 && canDiscCard(v.hand, hasMeld, v.hand[0])) { await doAct(u, { type: 'close' }); return true; }
  await doAct(u, { type: 'discard', id: chooseDiscard(v.hand, hasMeld, 'medium', info).id }); return true;
}
let leaks = 0, checks = 0, round0 = 0, acted = 0, drawLeak = 0, pwLeak = 0;
for (let guard = 0; guard < 6000; guard++) {
  let any = false;
  for (const u of users) {
    const p = await sync(u);
    const room = await serverRoom(), seat = p.body.seat, g = room.game;
    const allowed = new Set([...g.seats[seat].hand.map(x => x.id), ...g.pool.filter(x => !x.closed).map(x => x.id), ...g.seats.flatMap(s => s.melds.flat().map(x => x.id)),
      ...(g.result ? g.result.hands.flat().map(x => x.id).concat(g.result.closedCard ? [g.result.closedCard.id] : []) : [])]);
    checks++; if (!collect(p.body.view).every(id => allowed.has(id) || id === -1)) leaks++;
    if (/salt|hash|"pw"/.test(JSON.stringify(p.body))) pwLeak++;
    if (await drive(u, p.body)) { any = true; acted++; }
  }
  const room = await serverRoom();
  if (room.game.round >= 4 || room.status === 'finished') break;
  if (!any) clock.t += 2000; // tak ada yang bisa bertindak: majukan jam (mis. antar ronde)
}
const roomEnd = await serverRoom();
ok('permainan 2 manusia lewat API berjalan beberapa ronde', roomEnd.game.round >= 4 || roomEnd.status === 'finished');
console.log('  (info) aksi manusia:', acted, '| ronde:', roomEnd.game.round, '| sync diperiksa:', checks);
ok('kedua manusia bertindak di setiap ronde (rata-rata >= 5 aksi per ronde)', acted / roomEnd.game.round >= 5);
ok('tidak ada kebocoran kartu lawan/tumpukan di tampilan', [leaks, checks > 100], [0, true]);
ok('hash sandi tidak pernah bocor', pwLeak, 0);
{ const ids = [], g = roomEnd.game; g.deck.concat(g.pool).forEach(x => ids.push(x.id)); g.seats.forEach(s => { s.hand.forEach(x => ids.push(x.id)); s.melds.flat().forEach(x => ids.push(x.id)); s.plucked.forEach(x => ids.push(x.id)); });
  ok('52 kartu utuh di server setelah banyak aksi', [ids.length, new Set(ids).size], [52, 52]); }

// ---------- D. timer 30 detik ditegakkan server ----------
{ const mk2 = await call('POST', '/api/rooms', { token: Cc.token, body: { target: 300 } }); const c2 = mk2.body.code;
  const D = await mkUser('dina'); await call('POST', '/api/rooms/join', { token: D.token, body: { code: c2 } });
  const sy = async (u, since = 0) => (await call('GET', '/api/rooms/sync', { token: u.token, query: { code: c2, since: String(since) } })).body;
  await call('POST', '/api/rooms/start', { token: Cc.token, body: { code: c2 } });
  let pc = await sy(Cc), pd = await sy(D);
  const turnUser = pc.view.cur === pc.seat ? Cc : D, other = turnUser === Cc ? D : Cc;
  let po = await sy(other); const seq0 = po.seq, phase0 = po.view.phase;
  ok('giliran manusia: ada batas waktu 30 dtk', po.view.deadline - po.serverNow <= 30000 && po.view.deadline - po.serverNow > 0);
  clock.t += 29000; po = await sy(other, seq0);
  ok('belum 30 dtk: tidak ada timeout', po.events.some(e => e.type === 'timeout'), false);
  clock.t += 2000; po = await sy(other, seq0);
  ok('lewat 30 dtk: server menarik otomatis (timeout)', po.events.some(e => e.type === 'timeout') && po.events.some(e => e.type === 'draw'));
  ok('event tarik pemain lain tidak membuka kartunya', po.events.filter(e => e.type === 'draw' && e.seat !== po.seat).every(e => e.own === undefined));
  // aksi setelah timer lewat ditolak sebagai bukan giliran
  const r = (await call('POST', '/api/rooms/action', { token: turnUser.token, body: { code: c2, action: { type: 'draw' } } })).body;
  ok('tarik lagi setelah timeout ditolak (sudah fase buang)', [r.ok, r.error], [false, 'not_your_turn']);
  // ---------- E. keluar saat main ----------
  const lv = await call('POST', '/api/rooms/leave', { token: D.token, body: { code: c2 } });
  ok('keluar saat main', lv.status, 200);
  ok('kursi pemain keluar menjadi bot', (await store.get('room:' + c2)).game.seats.some(s => s.isBot && s.name === 'dina'));
  ok('activeRoom dibersihkan', (await call('GET', '/api/me', { token: D.token })).body.user.activeRoom, null);
  ok('setelah keluar tidak bisa sync', (await call('GET', '/api/rooms/sync', { token: D.token, query: { code: c2 } })).status, 403);
}

// ---------- F. cari lawan otomatis ----------
{ const [X, Y, Z, W, V] = [await mkUser('xena'), await mkUser('yuri'), await mkUser('zack'), await mkUser('wina'), await mkUser('vera')];
  const m = u => call('POST', '/api/match', { token: u.token, body: { target: 500 } });
  const mx = await m(X), my = await m(Y), mz = await m(Z);
  ok('pencari lawan masuk lobi yang sama', [mx.body.code === my.body.code, my.body.code === mz.body.code, mx.body.status], [true, true, 'lobby']);
  ok('lobi publik menunggu 20 dtk', mx.body.lobby.startAt - mx.body.serverNow, 20000);
  ok('mencari lagi saat sudah di lobi -> lobi yang sama', (await m(X)).body.code, mx.body.code);
  const mw = await m(W);
  ok('4 pemain nyata -> langsung main', [mw.body.code === mx.body.code, mw.body.status, mw.body.view.seats.filter(s => !s.isBot).length], [true, 'playing', 4]);
  const mv = await m(V);
  ok('pemain berikutnya membuka lobi baru', [mv.body.code !== mx.body.code, mv.body.status], [true, 'lobby']);
  clock.t += 21000;
  const sv = await call('GET', '/api/rooms/sync', { token: V.token, query: { code: mv.body.code } });
  ok('lewat 20 dtk: sisa kursi diisi bot & mulai', [sv.body.status, sv.body.view.seats.filter(s => s.isBot).length], ['playing', 3]);
  ok('target yang tidak sah ditolak', (await call('POST', '/api/match', { token: (await mkUser('uma1')).token, body: { target: 123 } })).body.error, 'bad_target');
}

// ---------- G. dua aksi bersamaan dari pemain yang sama: hanya satu berhasil ----------
{ const [P, Q] = [await mkUser('pia1'), await mkUser('qui1')];
  const r0 = await call('POST', '/api/rooms', { token: P.token, body: { target: 300 } }); const c3 = r0.body.code;
  await call('POST', '/api/rooms/join', { token: Q.token, body: { code: c3 } }); await call('POST', '/api/rooms/start', { token: P.token, body: { code: c3 } });
  const sy = async u => (await call('GET', '/api/rooms/sync', { token: u.token, query: { code: c3 } })).body;
  const pp = await sy(P), tu = pp.view.cur === pp.seat ? P : Q;
  const res = await Promise.all([1, 2, 3].map(() => call('POST', '/api/rooms/action', { token: tu.token, body: { code: c3, action: { type: 'draw' } } })));
  ok('3 permintaan tarik bersamaan: tepat satu berhasil', res.filter(r => r.body.ok).length, 1);
  ok('sisanya ditolak sebagai bukan giliran/fase', res.filter(r => !r.body.ok).every(r => ['not_your_turn'].includes(r.body.error)));
  const room = await store.get('room:' + c3);
  ok('state tetap konsisten (tangan 8 kartu, tarik sekali)', room.game.seats[room.members.findIndex(m => m && m.uid === tu.uid)].hand.length, 8);
}

// ---------- H. adaptor Redis (Upstash) dengan fetch tiruan ----------
function fakeUpstash() {
  const m = new Map(), exp = new Map();
  const live = k => { const e = exp.get(k); if (e && e <= Date.now()) { m.delete(k); exp.delete(k); } return m.has(k); };
  return async (url, opts) => {
    const a = JSON.parse(opts.body), cmd = a[0], k = a[1]; let result = null;
    if (opts.headers.Authorization !== 'Bearer tok') return { ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) };
    if (cmd === 'GET') result = live(k) ? m.get(k) : null;
    else if (cmd === 'SET') {
      if (a.includes('NX') && live(k)) result = null;
      else { m.set(k, a[2]); const ex = a.indexOf('EX'), px = a.indexOf('PX'); if (ex > 0) exp.set(k, Date.now() + +a[ex + 1] * 1000); else if (px > 0) exp.set(k, Date.now() + +a[px + 1]); else exp.delete(k); result = 'OK'; }
    } else if (cmd === 'DEL') { m.delete(k); exp.delete(k); result = 1; }
    else if (cmd === 'EVAL') { const key = a[3]; if (live(key) && m.get(key) === a[4]) { m.delete(key); exp.delete(key); result = 1; } else result = 0; }
    else return { ok: false, status: 400, json: async () => ({ error: 'unknown ' + cmd }) };
    return { ok: true, status: 200, json: async () => ({ result }) };
  };
}
for (const [label, mkStore] of [['Memory', () => new MemoryStore()], ['Upstash(fake)', () => new UpstashStore('http://x', 'tok', fakeUpstash())]]) {
  const s = mkStore();
  await s.set('k', { a: [1, 2], b: 'x' });
  ok(`${label}: simpan & baca objek`, await s.get('k'), { a: [1, 2], b: 'x' });
  ok(`${label}: kunci tidak ada -> null`, await s.get('nope'), null);
  await s.del('k'); ok(`${label}: hapus`, await s.get('k'), null);
  ok(`${label}: setnx eksklusif`, [await s.setnx('l', 'a', 1000), await s.setnx('l', 'b', 1000)], [true, false]);
  await s.delIf('l', 'b'); ok(`${label}: delIf bukan pemilik tidak menghapus`, await s.setnx('l', 'c', 1000), false);
  await s.delIf('l', 'a'); ok(`${label}: delIf pemilik menghapus`, await s.setnx('l', 'c', 1000), true);
  await s.set('t', 1, 1); await new Promise(r => setTimeout(r, 1100)); ok(`${label}: TTL kedaluwarsa`, await s.get('t'), null);
  await s.set('ctr', 0);
  await Promise.all(Array.from({ length: 25 }, () => s.withLock('lock:ctr', async () => { const v = await s.get('ctr'); await new Promise(r => setTimeout(r, 2)); await s.set('ctr', v + 1); })));
  ok(`${label}: kunci mencegah tabrakan (25 penambahan)`, await s.get('ctr'), 25);
}
{ const bad = new UpstashStore('http://x', 'salah', fakeUpstash()); let threw = false; try { await bad.get('k'); } catch (e) { threw = true; } ok('Upstash: token salah -> error, bukan data kosong', threw); }
{ const c2 = { ...ctx, store: new UpstashStore('http://x', 'tok', fakeUpstash()) };
  const r = await handle({ method: 'POST', path: '/api/register', query: {}, body: { username: 'redis_user', password: 'password-redis' }, headers: {}, ip: '5.5.5.5' }, c2);
  const l = await handle({ method: 'POST', path: '/api/login', query: {}, body: { username: 'redis_user', password: 'password-redis' }, headers: {}, ip: '5.5.5.5' }, c2);
  ok('alur akun penuh di atas adaptor Redis', [r.status, l.status], [201, 200]); }

// ---------- H2. biaya polling: sync tanpa perubahan tidak mengunci dan tidak menulis ----------
{ const calls = { get: 0, set: 0, withLock: 0, del: 0 };
  const counting = new Proxy(store, { get(t, k, rcv) { const v = Reflect.get(t, k, rcv); if (typeof v !== 'function') return v; return (...a) => { if (k in calls) calls[k]++; return v.apply(t, a); }; } });
  const cx = { ...ctx, store: counting };
  const sy = () => handle({ method: 'GET', path: '/api/rooms/sync', query: { code, since: '0' }, headers: { authorization: 'Bearer ' + A.token }, ip: '7.7.7.7' }, cx);
  const live = (await store.get('room:' + code));
  if (live.status === 'playing' && live.game.deadline) clock.t = live.game.deadline - 5000; // jauh dari batas waktu
  const before = { ...calls }; const r = await sy();
  ok('sync steady-state: hanya 1 pembacaan, tanpa kunci/tulis', [r.status, calls.get - before.get, calls.set - before.set, calls.withLock - before.withLock], [200, 1, 0, 0]);
  ok('sync steady-state tetap mengembalikan tampilan', !!r.body.view || r.body.status === 'finished'); }

// ---------- I. rute ----------
ok('rute tidak dikenal', (await call('GET', '/api/tidak-ada')).status, 404);
ok('JSON rusak', (await handle({ method: 'POST', path: '/api/login', query: {}, body: '{rusak', headers: {}, ip: '1' }, ctx)).body.error, 'bad_json');
ok('health', (await call('GET', '/api/health')).body.ok);

console.log(`${n - bad}/${n} tes server lulus`);
process.exit(bad ? 1 : 0);
