import { createHmac, generateKeyPairSync, sign } from 'node:crypto';
import { handle } from '../server/handler.js';
import { MemoryStore, SupabaseStore, getStore } from '../server/store.js';
import { makeNotifier } from '../server/realtime.js';
import { PLAY_IDLE_MS, LOBBY_IDLE_MS } from '../server/rooms.js';
import { _clearJwksCache } from '../server/jwt.js';

let n = 0, bad = 0;
const ok = (name, got, want = true) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log('GAGAL:', name, '| dapat', JSON.stringify(got), '| harusnya', JSON.stringify(want)); } };

// ---------- peniru PostgREST (sesuai pemahaman API: filter eq., upsert merge-duplicates, RPC) ----------
const KEY = 'service-key';
function fakePostgrest() {
  const rows = new Map(); const log = [];
  const f = async (url, o = {}) => {
    const u = new URL(url), method = o.method || 'GET', body = o.body ? JSON.parse(o.body) : undefined; log.push(method + ' ' + u.pathname);
    const res = (status, data) => ({ ok: status < 400, status, text: async () => (data === undefined ? '' : JSON.stringify(data)) });
    if (o.headers.apikey !== KEY || o.headers.Authorization !== 'Bearer ' + KEY) return res(401, { message: 'Invalid API key' });
    const live = k => { const r = rows.get(k); if (r && r.exp && Date.parse(r.exp) <= Date.now()) { rows.delete(k); return null; } return r || null; };
    const kq = () => { const q = u.searchParams.get('k'); return q && q.startsWith('eq.') ? q.slice(3) : null; };
    if (u.pathname === '/rest/v1/kv' && method === 'GET') { const k = kq(), r = k && live(k); return res(200, r ? [{ v: r.v, exp: r.exp }] : []); }
    if (u.pathname === '/rest/v1/kv' && method === 'POST') {
      if (u.searchParams.get('on_conflict') !== 'k' || !String(o.headers.Prefer).includes('merge-duplicates')) return res(409, { message: 'duplicate key' });
      for (const r of body) rows.set(r.k, { v: r.v, tok: r.tok, exp: r.exp }); return res(201);
    }
    if (u.pathname === '/rest/v1/kv' && method === 'DELETE') { const k = kq(); if (!k) return res(400, { message: 'filter required' }); rows.delete(k); return res(204); }
    if (u.pathname === '/rest/v1/rpc/kv_setnx') { if (live(body.p_k)) return res(200, false); rows.set(body.p_k, { v: body.p_tok, tok: body.p_tok, exp: new Date(Date.now() + body.p_ttl_ms).toISOString() }); return res(200, true); }
    if (u.pathname === '/rest/v1/rpc/kv_del_if') { const r = live(body.p_k); if (r && r.tok === body.p_tok) rows.delete(body.p_k); return res(204); }
    return res(404, { message: 'no route ' + u.pathname });
  };
  f.rows = rows; f.log = log; return f;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- A. SupabaseStore ----------
{ const f = fakePostgrest(), s = new SupabaseStore('https://p.supabase.co/', KEY, f);
  await s.set('room:ABC', { a: [1, 2], b: 'x' }); ok('simpan & baca objek', await s.get('room:ABC'), { a: [1, 2], b: 'x' });
  await s.set('room:ABC', { a: 9 }); ok('set menimpa (upsert)', await s.get('room:ABC'), { a: 9 });
  ok('kunci tidak ada -> null', await s.get('nope'), null);
  await s.set('n', 0); ok('nilai angka 0 tidak dianggap kosong', await s.get('n'), 0);
  await s.del('room:ABC'); ok('hapus', await s.get('room:ABC'), null);
  await s.set('k:with space&sym=1', 5); ok('kunci dengan karakter khusus di-encode', await s.get('k:with space&sym=1'), 5);
  await s.set('t', 1, 1); await sleep(1100); ok('TTL kedaluwarsa', await s.get('t'), null);
  ok('setnx eksklusif', [await s.setnx('l', 'a', 1000), await s.setnx('l', 'b', 1000)], [true, false]);
  await s.delIf('l', 'b'); ok('delIf bukan pemilik tidak menghapus', await s.setnx('l', 'c', 1000), false);
  await s.delIf('l', 'a'); ok('delIf pemilik menghapus', await s.setnx('l', 'c', 1000), true);
  await s.delIf('l', 'c'); await s.setnx('x', 'a', 50); await sleep(80); ok('kunci kedaluwarsa bisa diambil lagi', await s.setnx('x', 'b', 1000), true);
  await s.set('ctr', 0);
  await Promise.all(Array.from({ length: 20 }, () => s.withLock('lock:ctr', async () => { const v = await s.get('ctr'); await sleep(2); await s.set('ctr', v + 1); })));
  ok('kunci mencegah tabrakan (20 penambahan)', await s.get('ctr'), 20);
  let threw = false; try { await new SupabaseStore('https://p.supabase.co', 'salah', f).get('k'); } catch (e) { threw = /401/.test(e.message); }
  ok('service key salah -> error jelas, bukan data kosong', threw);
  ok('getStore memilih Supabase bila env lengkap', getStore({ SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_KEY: 'k' }) instanceof SupabaseStore);
  ok('getStore: Supabase diprioritaskan atas Redis', getStore({ SUPABASE_URL: 'https://p', SUPABASE_SERVICE_KEY: 'k', UPSTASH_REDIS_REST_URL: 'u', UPSTASH_REDIS_REST_TOKEN: 't' }) instanceof SupabaseStore);
  ok('getStore tanpa service key tidak memakai Supabase', getStore({ SUPABASE_URL: 'https://p' }) instanceof MemoryStore);
}

// ---------- B. notifikasi realtime ----------
{ const calls = [];
  const nf = makeNotifier({ SUPABASE_URL: 'https://p.supabase.co/', SUPABASE_SERVICE_KEY: KEY }, async (url, o) => { calls.push({ url, o }); return { ok: true }; });
  await nf('ABC123', 7);
  const b = JSON.parse(calls[0].o.body);
  ok('notifikasi: URL & header', [calls[0].url, calls[0].o.headers.apikey, calls[0].o.headers.Authorization], ['https://p.supabase.co/realtime/v1/api/broadcast', KEY, 'Bearer ' + KEY]);
  ok('notifikasi: topik & isi hanya versi (tanpa data game)', [b.messages[0].topic, b.messages[0].event, b.messages[0].payload], ['room:ABC123', 'v', { v: 7 }]);
  ok('tanpa konfigurasi -> tidak ada notifier', makeNotifier({}), null);
  const boom = makeNotifier({ SUPABASE_URL: 'https://p', SUPABASE_SERVICE_KEY: KEY }, async () => { throw new Error('jaringan putus'); });
  let threw = false; try { await boom('A', 1); } catch (e) { threw = true; } ok('kegagalan notifikasi tidak melempar error', threw, false); }

// ---------- C. mode auth Supabase di handler ----------
const clock = { t: 1_800_000_000_000 };
const SECRET = 'sb-jwt-secret', URLP = 'https://p.supabase.co';
const b64u = x => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
const jwt = (sub, o = {}, secret = SECRET) => { const d = b64u({ alg: 'HS256', typ: 'JWT' }) + '.' + b64u({ sub, email: sub + '@mail.co', aud: 'authenticated', role: 'authenticated', exp: Math.floor(clock.t / 1000) + 3600, user_metadata: { name: 'Nama ' + sub }, ...o }); return d + '.' + createHmac('sha256', secret).update(d).digest('base64url'); };
const notes = [];
const store = new MemoryStore();
const ctx = { store, env: { SUPABASE_URL: URLP, SUPABASE_JWT_SECRET: SECRET }, now: () => clock.t, cfg: { rules: { leftoverMult: 0.5 }, timers: {} }, notify: async (code, v) => notes.push([code, v]) };
let ip = 0;
const call = (method, path, { body, query, token, c = ctx } = {}) => handle({ method, path, query: query || {}, body, headers: token ? { authorization: 'Bearer ' + token } : {}, ip: '8.8.8.' + (++ip) }, c);

const ta = jwt('ana1');
const me = await call('GET', '/api/me', { token: ta });
ok('profil dibuat otomatis dari token Supabase', [me.status, me.body.user.name, me.body.user.email, me.body.user.chips], [200, 'Nama ana1', 'ana1@mail.co', 0]);
await call('POST', '/api/profile', { token: ta, body: { name: 'Anita' } });
ok('profil bertahan & tidak ditimpa saat masuk lagi', (await call('GET', '/api/me', { token: ta })).body.user.name, 'Anita');
ok('register lokal dinonaktifkan di mode Supabase', (await call('POST', '/api/register', { body: { email: 'a@b.co', password: 'password-1' } })).body.error, 'use_supabase_auth');
ok('login lokal dinonaktifkan di mode Supabase', (await call('POST', '/api/login', { body: { email: 'a@b.co', password: 'password-1' } })).status, 404);
ok('tanpa token ditolak', (await call('GET', '/api/me')).status, 401);
ok('token secret salah ditolak', (await call('GET', '/api/me', { token: jwt('ana1', {}, 'lain') })).status, 401);
ok('token kedaluwarsa ditolak', (await call('GET', '/api/me', { token: jwt('ana1', { exp: Math.floor(clock.t / 1000) - 5 }) })).status, 401);
ok('token anon (bukan pengguna masuk) ditolak', (await call('GET', '/api/me', { token: jwt('ana1', { aud: 'anon' }) })).status, 401);
ok('nama dari metadata dibersihkan dari tag', (await call('GET', '/api/me', { token: jwt('xss1', { user_metadata: { name: '<img onerror=1>' } }) })).body.user.name, 'img onerror=1');
ok('sync tidak membaca database pengguna (hanya token)', (await call('GET', '/api/rooms/sync', { token: jwt('ghost'), query: { code: 'ZZZZZZ' } })).status, 404);

// ruang + notifikasi
const tb = jwt('bob22');
const mk = await call('POST', '/api/rooms', { token: ta, body: { target: 300 } }); const code = mk.body.code;
await call('POST', '/api/rooms/join', { token: tb, body: { code } });
await call('POST', '/api/rooms/start', { token: ta, body: { code } });
const sy = await call('GET', '/api/rooms/sync', { token: tb, query: { code } });
ok('permainan berjalan dengan token Supabase', [sy.status, sy.body.status, sy.body.view.seats.filter(s => !s.isBot).length], [200, 'playing', 2]);
ok('notifikasi dikirim tiap perubahan ruang, versi naik', [notes.length >= 3, notes.every(x => x[0] === code), notes.every((x, i) => i === 0 || x[1] >= notes[i - 1][1])], [true, true, true]);
ok('notifikasi tidak memuat data game', notes.every(x => x.length === 2 && typeof x[1] === 'number'));
const nBefore = notes.length; await call('GET', '/api/rooms/sync', { token: tb, query: { code } });
ok('sync tanpa perubahan tidak memicu notifikasi', notes.length, nBefore);

// ---------- D. kebijakan game ditinggalkan ----------
{ clock.t += PLAY_IDLE_MS + 1000;
  const r = await call('GET', '/api/rooms/sync', { token: ta, query: { code } });
  ok('10 menit tanpa aktivitas: game dibatalkan', r.body.status, 'abandoned');
  ok('abandon langsung membebaskan semua pemain di penyimpanan (bukan hanya lewat /me)', [(await store.get('user:ana1')).activeRoom, (await store.get('user:bob22')).activeRoom], [null, null]);
  ok('/me juga tetap bersih', (await call('GET', '/api/me', { token: ta })).body.user.activeRoom, null);
  ok('aksi pada game yang dibatalkan ditolak', (await call('POST', '/api/rooms/action', { token: ta, body: { code, action: { type: 'draw' } } })).body.error, 'not_playing');
  const m = await call('POST', '/api/match', { token: ta, body: { target: 300 } });
  ok('setelah dibatalkan bisa cari lawan lagi', [m.status, m.body.status], [200, 'lobby']);
  await call('POST', '/api/rooms/leave', { token: ta, body: { code: m.body.code } });
  const lb = await call('POST', '/api/rooms', { token: ta, body: { target: 300, password: 'abcd' } });
  clock.t += LOBBY_IDLE_MS + 1000;
  ok('lobi menganggur 30 menit dihapus (dibatalkan)', (await call('GET', '/api/rooms/sync', { token: ta, query: { code: lb.body.code } })).body.status, 'abandoned'); }

// ---------- E. JWKS (kunci asimetris) lewat handler ----------
{ _clearJwksCache();
  const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = { ...ec.publicKey.export({ format: 'jwk' }), kid: 'kid1', alg: 'ES256' };
  let jwksFetches = 0;
  const c2 = { ...ctx, env: { SUPABASE_URL: 'https://asym.supabase.co' }, store: new MemoryStore(), fetch: async url => { jwksFetches++; return { ok: url === 'https://asym.supabase.co/auth/v1/.well-known/jwks.json', status: 200, json: async () => ({ keys: [jwk] }) }; } };
  const d = b64u({ alg: 'ES256', typ: 'JWT', kid: 'kid1' }) + '.' + b64u({ sub: 'es-user', email: 'e@s.co', aud: 'authenticated', exp: Math.floor(clock.t / 1000) + 600 });
  const tok = d + '.' + sign('sha256', Buffer.from(d), { key: ec.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  const r1 = await call('GET', '/api/me', { token: tok, c: c2 }), r2 = await call('GET', '/api/me', { token: tok, c: c2 });
  ok('token ES256 diverifikasi lewat JWKS proyek', [r1.status, r1.body.user.email], [200, 'e@s.co']);
  ok('JWKS di-cache antar permintaan', jwksFetches, 1); }

// ---------- F. mode lokal: daftar & masuk dengan email ----------
{ const c3 = { store: new MemoryStore(), env: { AUTH_SECRET: 's' }, now: () => clock.t, cfg: { rules: {}, timers: {} }, notify: null };
  const reg = await call('POST', '/api/register', { body: { email: 'Budi@Example.com', password: 'password-ok1', name: 'Budi' }, c: c3 });
  ok('daftar dengan email (mode lokal)', [reg.status, reg.body.user.email, reg.body.user.name], [201, 'Budi@Example.com', 'Budi']);
  ok('email tidak valid ditolak', (await call('POST', '/api/register', { body: { email: 'bukan@email', password: 'password-ok1' }, c: c3 })).body.error, 'bad_email');
  ok('email kembar (beda huruf) ditolak', (await call('POST', '/api/register', { body: { email: 'budi@example.com', password: 'password-ok1' }, c: c3 })).status, 409);
  ok('masuk dengan email tak peka huruf besar', (await call('POST', '/api/login', { body: { email: 'BUDI@example.com', password: 'password-ok1' }, c: c3 })).status, 200);
  ok('kata sandi salah ditolak', (await call('POST', '/api/login', { body: { email: 'budi@example.com', password: 'salah-salah1' }, c: c3 })).status, 401); }

console.log(`${n - bad}/${n} tes Supabase lulus`);
process.exit(bad ? 1 : 0);
