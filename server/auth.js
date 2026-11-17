// Akun: scrypt + token bertanda tangan HMAC. Cukup untuk MVP; sebelum chip bernilai, pindahkan ke penyedia auth terkelola.
import { scrypt, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
const scr = (pw, salt) => new Promise((res, rej) => scrypt(pw, salt, 32, { N: 16384 }, (e, k) => (e ? rej(e) : res(k))));
export async function hashPassword(pw, salt = randomBytes(16)) { return { salt: salt.toString('hex'), hash: (await scr(pw, salt)).toString('hex') }; }
export async function verifyPassword(pw, rec) {
  if (!rec) return false;
  const h = await scr(pw, Buffer.from(rec.salt, 'hex')), a = Buffer.from(rec.hash, 'hex');
  return a.length === h.length && timingSafeEqual(a, h);
}
const sign = (body, secret) => createHmac('sha256', secret).update(body).digest('base64url');
export function signToken(payload, secret, ttlSec, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(now / 1000) + ttlSec })).toString('base64url');
  return body + '.' + sign(body, secret);
}
export function verifyToken(tok, secret, now = Date.now()) {
  if (typeof tok !== 'string') return null;
  const [body, sig] = tok.split('.');
  if (!body || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(sign(body, secret));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let p; try { p = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch (e) { return null; }
  return p && p.exp && p.exp * 1000 > now ? p : null;
}
