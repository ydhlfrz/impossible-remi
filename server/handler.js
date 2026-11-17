// Router API yang tidak bergantung pada platform: handle({method,path,query,body,headers,ip}, {store, env, now}) -> {status, body}
import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword, signToken, verifyToken } from './auth.js';
import { ApiError, createRoom, joinRoom, startRoom, leaveRoom, syncRoom, actRoom, quickMatch, isEnded } from './rooms.js';
import { verifySupabaseJwt } from './jwt.js';
import { makeNotifier } from './realtime.js';

const E = (s, c, x) => new ApiError(s, c, x);
const TOKEN_TTL = 30 * 86400;
const userKey = u => 'user:' + u;
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const secret = ctx => {
  if (ctx.env.AUTH_SECRET) return ctx.env.AUTH_SECRET;
  if (ctx.env.VERCEL || ctx.env.NODE_ENV === 'production') throw E(500, 'server_misconfigured');
  return 'dev-secret-do-not-use-in-production';
};
async function hit(ctx, key, limit, windowSec) { // pembatas laju sederhana
  const k = 'rl:' + key, n = (await ctx.store.get(k)) || 0;
  if (n >= limit) throw E(429, 'too_many_requests');
  await ctx.store.set(k, n + 1, windowSec);
}
const authMode = ctx => (ctx.env.SUPABASE_URL ? 'supabase' : 'local');
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const publicUser = u => ({ uid: u.uid, username: u.username, email: u.email || null, name: u.name, avatar: u.avatar && u.avatar.img ? { img: true } : { i: u.avatar ? u.avatar.i : 0 }, chips: u.chips, activeRoom: u.activeRoom || null });
function parseAvatar(a) {
  if (a == null) return { i: 0 };
  if (Number.isInteger(a.i) && a.i >= 0 && a.i < 12) return { i: a.i };
  if (typeof a.img === 'string' && a.img.length <= 16000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(a.img)) return { img: a.img };
  throw E(400, 'bad_avatar');
}
// identitas dari token: Supabase (JWT diverifikasi lokal) atau token lokal (pengembangan tanpa Supabase)
async function identify(ctx, req) {
  const h = req.headers && (req.headers.authorization || req.headers.Authorization);
  const tok = String(h || '').replace(/^Bearer\s+/i, '');
  if (authMode(ctx) === 'supabase') {
    const c = await verifySupabaseJwt(tok, { secret: ctx.env.SUPABASE_JWT_SECRET, jwksUrl: ctx.env.SUPABASE_URL.replace(/\/+$/, '') + '/auth/v1/.well-known/jwks.json', fetchFn: ctx.fetch, now: ctx.now() });
    if (!c || !c.sub) throw E(401, 'unauthorized');
    return { uid: c.sub, email: c.email || null, meta: c.user_metadata || {} };
  }
  const p = verifyToken(tok, secret(ctx), ctx.now());
  if (!p || !p.uid) throw E(401, 'unauthorized');
  return { uid: p.uid };
}
const requireUid = async (ctx, req) => ({ uid: (await identify(ctx, req)).uid }); // polling: cukup token, tanpa baca database
async function requireUser(ctx, req) {
  const id = await identify(ctx, req);
  let u = await ctx.store.get(userKey(id.uid));
  if (!u && authMode(ctx) === 'supabase') { // profil dibuat otomatis saat pertama kali masuk
    const local = String(id.email || 'player').split('@')[0];
    u = { uid: id.uid, username: clean(local, 16) || 'player', email: id.email, name: clean(id.meta.name || id.meta.full_name || local, 14) || 'Player', avatar: { i: 0 }, chips: 0, createdAt: ctx.now(), activeRoom: null };
    await ctx.store.set(userKey(id.uid), u);
  }
  if (!u) throw E(401, 'unauthorized');
  return u;
}
async function register(ctx, req) {
  if (authMode(ctx) === 'supabase') throw E(404, 'use_supabase_auth');
  const b = req.body || {}, username = String(b.email || b.username || ''), pw = String(b.password || '');
  const isEmail = username.includes('@');
  if (isEmail ? !EMAIL.test(username) || username.length > 120 : !/^[A-Za-z0-9_]{3,16}$/.test(username)) throw E(400, isEmail ? 'bad_email' : 'bad_username');
  if (pw.length < 8 || pw.length > 128) throw E(400, 'weak_password');
  await hit(ctx, 'reg:' + (req.ip || '-'), 10, 600);
  const lower = username.toLowerCase();
  return ctx.store.withLock('lock:uname:' + lower, async () => {
    if (await ctx.store.get('uname:' + lower)) throw E(409, 'username_taken');
    const uid = randomBytes(8).toString('hex');
    const user = { uid, username: isEmail ? clean(username.split('@')[0], 16) : username, email: isEmail ? username : null, name: clean(b.name, 14) || (isEmail ? clean(username.split('@')[0], 14) : username), avatar: parseAvatar(b.avatar), pass: await hashPassword(pw), chips: 0, createdAt: ctx.now(), activeRoom: null };
    await ctx.store.set(userKey(uid), user); await ctx.store.set('uname:' + lower, uid);
    return { status: 201, body: { token: signToken({ uid }, secret(ctx), TOKEN_TTL, ctx.now()), user: publicUser(user) } };
  });
}
async function login(ctx, req) {
  if (authMode(ctx) === 'supabase') throw E(404, 'use_supabase_auth');
  const b = req.body || {}, lower = String(b.email || b.username || '').toLowerCase();
  await hit(ctx, 'login:' + lower + ':' + (req.ip || '-'), 10, 60);
  const uid = await ctx.store.get('uname:' + lower), user = uid && (await ctx.store.get(userKey(uid)));
  if (!user || !(await verifyPassword(String(b.password || ''), user.pass))) throw E(401, 'invalid_credentials');
  return { status: 200, body: { token: signToken({ uid }, secret(ctx), TOKEN_TTL, ctx.now()), user: publicUser(user) } };
}

const ROUTES = {
  'POST /api/register': register,
  'POST /api/login': login,
  'GET /api/health': async () => ({ status: 200, body: { ok: true } }),
  'GET /api/me': async (ctx, req) => {
    const u = await requireUser(ctx, req);
    if (u.activeRoom) { // bersihkan penunjuk ruang yang sudah berakhir / tidak ada
      const r = await ctx.store.get('room:' + u.activeRoom);
      if (!r || isEnded(r.status) || !r.members.some(m => m && m.uid === u.uid)) { u.activeRoom = null; await ctx.store.set(userKey(u.uid), u); }
    }
    return { status: 200, body: { user: publicUser(u) } };
  },
  'POST /api/profile': async (ctx, req) => {
    const u = await requireUser(ctx, req), b = req.body || {};
    if (b.name != null) u.name = clean(b.name, 14) || u.username;
    if (b.avatar != null) u.avatar = parseAvatar(b.avatar);
    await ctx.store.set(userKey(u.uid), u);
    return { status: 200, body: { user: publicUser(u) } };
  },
  'GET /api/avatar': async (ctx, req) => {
    const u = await ctx.store.get(userKey(String(req.query.uid || '')));
    if (!u || !u.avatar || !u.avatar.img) throw E(404, 'no_avatar');
    return { status: 200, body: { img: u.avatar.img } };
  },
  'POST /api/match': async (ctx, req) => { const u = await requireUser(ctx, req); await hit(ctx, 'mm:' + u.uid, 20, 60); return { status: 200, body: await quickMatch(ctx, u, req.body || {}) }; },
  'POST /api/rooms': async (ctx, req) => { const u = await requireUser(ctx, req); await hit(ctx, 'mk:' + u.uid, 20, 60); return { status: 201, body: await createRoom(ctx, u, req.body || {}) }; },
  'POST /api/rooms/join': async (ctx, req) => { const u = await requireUser(ctx, req); await hit(ctx, 'jn:' + u.uid, 20, 60); const b = req.body || {}; return { status: 200, body: await joinRoom(ctx, u, b.code, b.password) }; },
  'POST /api/rooms/start': async (ctx, req) => ({ status: 200, body: await startRoom(ctx, await requireUser(ctx, req), (req.body || {}).code) }),
  'POST /api/rooms/leave': async (ctx, req) => ({ status: 200, body: await leaveRoom(ctx, await requireUser(ctx, req), (req.body || {}).code) }),
  'GET /api/rooms/sync': async (ctx, req) => ({ status: 200, body: await syncRoom(ctx, await requireUid(ctx, req), req.query.code, Number(req.query.since) || 0) }),
  'POST /api/rooms/action': async (ctx, req) => { const b = req.body || {}; return { status: 200, body: await actRoom(ctx, await requireUser(ctx, req), b.code, b.action, Number(b.since) || 0) }; }
};

export async function handle(req, ctxIn) {
  const ctx = { cfg: { rules: {}, timers: {} }, fetch: globalThis.fetch, ...ctxIn };
  if (ctx.notify === undefined) ctx.notify = makeNotifier(ctx.env, ctx.fetch);
  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { throw E(400, 'bad_json'); } }
    const route = ROUTES[req.method + ' ' + req.path.replace(/\/+$/, '')];
    if (!route) throw E(404, 'not_found');
    return await route(ctx, { ...req, body });
  } catch (e) {
    if (e instanceof ApiError) return { status: e.status, body: { error: e.code, ...(e.extra || {}) } };
    if (e && e.code === 'busy') return { status: 503, body: { error: 'busy' } };
    console.error('server_error', e);
    return { status: 500, body: { error: 'server_error' } };
  }
}
