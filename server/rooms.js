// Ruang, lobi, pencarian lawan otomatis, dan penghubung ke mesin game (src/engine.js).
import { randomBytes } from 'node:crypto';
import { createGame, begin, act, tick, viewFor, eventsFor, takeover, needsTick } from '../src/engine.js';
import { hashPassword, verifyPassword } from './auth.js';

export class ApiError extends Error { constructor(status, code, extra) { super(code); this.status = status; this.code = code; this.extra = extra; } }
const E = (s, c, x) => new ApiError(s, c, x);
export const TARGETS = [300, 500, 1000];
export const LEVELS = ['easy', 'medium', 'hard'];
const ROOM_TTL = 6 * 3600, MATCH_WAIT_MS = 20000, LOBBY_MAX_AGE = 120000;
export const PLAY_IDLE_MS = 10 * 60000, LOBBY_IDLE_MS = 30 * 60000; // tanpa aktivitas: game dibatalkan / lobi dihapus
export const isEnded = s => s === 'finished' || s === 'abandoned';
const roomKey = c => 'room:' + c, userKey = u => 'user:' + u;
const locked = (ctx, code, fn) => ctx.store.withLock('lock:room:' + code, fn);

const newCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return [...randomBytes(6)].map(x => A[x % A.length]).join(''); };
async function uniqueCode(ctx) { for (let i = 0; i < 10; i++) { const c = newCode(); if (!(await ctx.store.get(roomKey(c)))) return c; } throw E(500, 'code_collision'); }
export const normCode = c => String(c || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const avatarOf = u => (u.avatar && u.avatar.img ? 'img' : u.avatar && Number.isInteger(u.avatar.i) ? u.avatar.i : 0);
const member = u => ({ uid: u.uid, name: u.name, avatar: avatarOf(u) });
const seatOf = (room, uid) => room.members.findIndex(m => m && m.uid === uid);
const pickTarget = t => { t = Number(t); if (!TARGETS.includes(t)) throw E(400, 'bad_target'); return t; };
const pickLevel = l => (LEVELS.includes(l) ? l : 'medium');

async function setActive(ctx, uid, code) { const u = await ctx.store.get(userKey(uid)); if (u) { u.activeRoom = code; await ctx.store.set(userKey(uid), u); } }
const loadRoom = (ctx, code) => ctx.store.get(roomKey(code));
async function saveRoom(ctx, room) {
  room.v++; room.lastAct = ctx.now();
  await ctx.store.set(roomKey(room.code), room, ROOM_TTL);
  if (ctx.notify) await ctx.notify(room.code, room.v); // dorong "ada perubahan" ke klien (isi game tetap lewat sync berotorisasi)
}
function pushEvents(room, list) { for (const e of list) room.events.push({ seq: ++room.seq, e }); if (room.events.length > 300) room.events.splice(0, room.events.length - 300); }

function startGame(ctx, room) {
  const seats = room.members.map((m, i) => (m ? { uid: m.uid, name: m.name, avatar: m.avatar } : { isBot: true, name: 'Bot ' + (i + 1), level: room.level }));
  room.game = createGame({ seats, target: room.target, rules: ctx.cfg.rules, timers: ctx.cfg.timers });
  room.status = 'playing';
  pushEvents(room, begin(room.game, ctx.now()));
}
async function afterEngine(ctx, room) {
  if (room.status === 'playing' && room.game.phase === 'gameover') {
    room.status = 'finished';
    for (const s of room.game.seats) if (s.uid) await setActive(ctx, s.uid, null);
  }
}
function payloadFor(ctx, room, user, since = 0) {
  const seat = seatOf(room, user.uid), now = ctx.now();
  const out = {
    code: room.code, status: room.status, v: room.v, seq: room.seq, seat, isHost: room.hostUid === user.uid, serverNow: now,
    lobby: { public: room.public, target: room.target, level: room.level, hasPassword: !!room.pw, startAt: room.startAt, members: room.members.map(m => m && { uid: m.uid, name: m.name, avatar: m.avatar }) }
  };
  if (room.game && seat >= 0) {
    out.view = viewFor(room.game, seat, now);
    out.events = since > 0 ? room.events.filter(x => x.seq > since).map(x => ({ seq: x.seq, ...eventsFor([x.e], seat)[0] })) : [];
  }
  return out;
}
async function addMember(ctx, room, user) {
  const i = room.members.findIndex(m => !m);
  if (i < 0) throw E(409, 'room_full');
  room.members[i] = member(user);
  await setActive(ctx, user.uid, room.code);
  if (room.members.every(Boolean)) startGame(ctx, room);
  await saveRoom(ctx, room);
}
function assertFree(user) { if (user.activeRoom) throw E(409, 'already_in_room', { code: user.activeRoom }); }

export async function createRoom(ctx, user, o = {}) {
  assertFree(user);
  const target = pickTarget(o.target), level = pickLevel(o.level);
  if (o.password != null && o.password !== '' && (typeof o.password !== 'string' || o.password.length < 4 || o.password.length > 32)) throw E(400, 'bad_password');
  const code = await uniqueCode(ctx);
  const room = { code, public: false, pw: o.password ? await hashPassword(o.password) : null, hostUid: user.uid, target, level, createdAt: ctx.now(), startAt: null, status: 'lobby', members: [member(user), null, null, null], game: null, events: [], seq: 0, v: 0 };
  await saveRoom(ctx, room); await setActive(ctx, user.uid, code);
  return payloadFor(ctx, room, user);
}
export async function joinRoom(ctx, user, codeIn, password) {
  const code = normCode(codeIn);
  return locked(ctx, code, async () => {
    const room = await loadRoom(ctx, code);
    if (!room) throw E(404, 'room_not_found');
    if (seatOf(room, user.uid) >= 0) return payloadFor(ctx, room, user); // sambung ulang
    assertFree(user);
    if (room.status !== 'lobby') throw E(409, 'room_started');
    if (room.pw && !(await verifyPassword(String(password || ''), room.pw))) throw E(403, 'wrong_password');
    await addMember(ctx, room, user);
    return payloadFor(ctx, room, user);
  });
}
export async function startRoom(ctx, user, codeIn) {
  const code = normCode(codeIn);
  return locked(ctx, code, async () => {
    const room = await loadRoom(ctx, code);
    if (!room) throw E(404, 'room_not_found');
    if (room.hostUid !== user.uid) throw E(403, 'not_host');
    if (room.status !== 'lobby') throw E(409, 'room_started');
    startGame(ctx, room); await saveRoom(ctx, room);
    return payloadFor(ctx, room, user);
  });
}
export async function leaveRoom(ctx, user, codeIn) {
  const code = normCode(codeIn);
  return locked(ctx, code, async () => {
    const room = await loadRoom(ctx, code), seat = room ? seatOf(room, user.uid) : -1;
    await setActive(ctx, user.uid, null);
    if (!room || seat < 0) return { ok: true };
    if (room.status === 'lobby') {
      room.members[seat] = null;
      if (!room.members.some(Boolean)) { await ctx.store.del(roomKey(code)); return { ok: true }; }
      if (room.hostUid === user.uid) room.hostUid = room.members.find(Boolean).uid;
    } else if (room.status === 'playing') {
      room.members[seat] = null;
      pushEvents(room, takeover(room.game, seat, ctx.now()));
      if (!room.members.some(Boolean)) room.status = 'finished'; // tak ada manusia tersisa
      await afterEngine(ctx, room);
    }
    await saveRoom(ctx, room);
    return { ok: true };
  });
}
export async function syncRoom(ctx, user, codeIn, since = 0) {
  const code = normCode(codeIn);
  // jalur cepat: tanpa kunci & tanpa tulis bila tidak ada yang perlu diubah (hemat perintah Redis saat polling)
  const peek = await loadRoom(ctx, code);
  if (!peek) throw E(404, 'room_not_found');
  if (seatOf(peek, user.uid) < 0) throw E(403, 'not_member');
  const idle = ctx.now() - (peek.lastAct || peek.createdAt);
  const stale = (peek.status === 'playing' && idle > PLAY_IDLE_MS) || (peek.status === 'lobby' && idle > LOBBY_IDLE_MS);
  const due = stale || (peek.status === 'lobby' && peek.public && peek.startAt && ctx.now() >= peek.startAt) || (peek.status === 'playing' && needsTick(peek.game, ctx.now()));
  if (!due) return payloadFor(ctx, peek, user, since);
  return locked(ctx, code, async () => {
    const room = await loadRoom(ctx, code);
    if (!room) throw E(404, 'room_not_found');
    if (seatOf(room, user.uid) < 0) throw E(403, 'not_member');
    let changed = false;
    const idle2 = ctx.now() - (room.lastAct || room.createdAt);
    if ((room.status === 'playing' && idle2 > PLAY_IDLE_MS) || (room.status === 'lobby' && idle2 > LOBBY_IDLE_MS)) {
      room.status = 'abandoned'; changed = true; // tidak ada aktivitas: batalkan & bebaskan pemain
      for (const m of room.members) if (m) await setActive(ctx, m.uid, null);
    } else if (room.status === 'lobby' && room.public && room.startAt && ctx.now() >= room.startAt) { startGame(ctx, room); changed = true; } // pencarian lawan: isi bot
    else if (room.status === 'playing') {
      const ev = tick(room.game, ctx.now());
      if (ev.length) { pushEvents(room, ev); changed = true; await afterEngine(ctx, room); }
    }
    if (changed) await saveRoom(ctx, room);
    return payloadFor(ctx, room, user, since);
  });
}
export async function actRoom(ctx, user, codeIn, action, since = 0) {
  const code = normCode(codeIn);
  return locked(ctx, code, async () => {
    const room = await loadRoom(ctx, code), seat = room ? seatOf(room, user.uid) : -1;
    if (!room) throw E(404, 'room_not_found');
    if (seat < 0) throw E(403, 'not_member');
    if (room.status !== 'playing') throw E(409, 'not_playing');
    pushEvents(room, tick(room.game, ctx.now())); // timer yang sudah lewat diselesaikan lebih dulu
    const r = act(room.game, seat, action, ctx.now());
    if (r.ok) pushEvents(room, r.events);
    await afterEngine(ctx, room); await saveRoom(ctx, room);
    return { ok: r.ok, error: r.error, ...payloadFor(ctx, room, user, since) };
  });
}
// pencarian lawan otomatis: masuk lobi publik yang masih ada kursi, atau buat baru. Penuh -> main; 20 dtk -> sisa kursi diisi bot.
export async function quickMatch(ctx, user, o = {}) {
  const target = pickTarget(o.target ?? 300), level = pickLevel(o.level);
  if (user.activeRoom) {
    const r = await loadRoom(ctx, user.activeRoom);
    if (r && !isEnded(r.status) && seatOf(r, user.uid) >= 0) return payloadFor(ctx, r, user);
    await setActive(ctx, user.uid, null); user.activeRoom = null;
  }
  return ctx.store.withLock('lock:mm:' + target, async () => {
    const key = 'open:' + target, list = (await ctx.store.get(key)) || [], keep = [];
    let result = null;
    for (const code of list) {
      const room = await loadRoom(ctx, code);
      if (!room || room.status !== 'lobby' || !room.public || ctx.now() - room.createdAt > LOBBY_MAX_AGE || room.members.every(Boolean)) continue;
      keep.push(code);
      if (!result) result = await locked(ctx, code, async () => {
        const fresh = await loadRoom(ctx, code);
        if (!fresh || fresh.status !== 'lobby' || fresh.members.every(Boolean)) return null;
        await addMember(ctx, fresh, user);
        return payloadFor(ctx, fresh, user);
      });
    }
    if (result) { await ctx.store.set(key, keep, 3600); return result; }
    const code = await uniqueCode(ctx);
    const room = { code, public: true, pw: null, hostUid: user.uid, target, level, createdAt: ctx.now(), startAt: ctx.now() + MATCH_WAIT_MS, status: 'lobby', members: [member(user), null, null, null], game: null, events: [], seq: 0, v: 0 };
    await saveRoom(ctx, room); await setActive(ctx, user.uid, code);
    await ctx.store.set(key, [...keep, code], 3600);
    return payloadFor(ctx, room, user);
  });
}
