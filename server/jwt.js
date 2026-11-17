// Verifikasi JWT Supabase secara lokal (tanpa panggilan jaringan per permintaan).
// HS256 memakai SUPABASE_JWT_SECRET (proyek lama); ES256/RS256 memakai JWKS proyek (kunci asimetris).
import { createHmac, createPublicKey, verify, timingSafeEqual } from 'node:crypto';
const b64 = s => Buffer.from(s, 'base64url');
const jwksCache = new Map(); // url -> { keys, at }

async function loadKeys(url, fetchFn, force, now) {
  const hit = jwksCache.get(url);
  if (hit && !force && now - hit.at < 600000) return hit.keys;
  const r = await fetchFn(url);
  if (!r.ok) throw new Error('jwks_http_' + r.status);
  const keys = (await r.json()).keys || [];
  jwksCache.set(url, { keys, at: now });
  return keys;
}
export const _clearJwksCache = () => jwksCache.clear();

export async function verifySupabaseJwt(token, { secret, jwks, jwksUrl, fetchFn = globalThis.fetch, now = Date.now(), audience = 'authenticated' } = {}) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(b64(parts[0]).toString()), payload = JSON.parse(b64(parts[1]).toString());
    const data = Buffer.from(parts[0] + '.' + parts[1]), sig = b64(parts[2]);
    let valid = false;
    if (header.alg === 'HS256') {
      if (!secret) return null; // algoritma hanya diterima bila dikonfigurasi (cegah alg-confusion)
      const exp = createHmac('sha256', secret).update(data).digest();
      valid = exp.length === sig.length && timingSafeEqual(exp, sig);
    } else if (header.alg === 'ES256' || header.alg === 'RS256') {
      if (!jwks && !jwksUrl) return null;
      const find = keys => keys.find(k => (!header.kid || k.kid === header.kid) && (header.alg === 'ES256' ? k.kty === 'EC' : k.kty === 'RSA'));
      let keys = jwks ? jwks.keys : await loadKeys(jwksUrl, fetchFn, false, now), jwk = find(keys);
      if (!jwk && !jwks) jwk = find(await loadKeys(jwksUrl, fetchFn, true, now)); // kunci baru dirotasi
      if (!jwk) return null;
      const key = createPublicKey({ key: jwk, format: 'jwk' });
      valid = header.alg === 'ES256' ? verify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, sig) : verify('sha256', data, key, sig);
    } else return null; // termasuk "none"
    if (!valid) return null;
    const t = Math.floor(now / 1000);
    if (!payload.exp || payload.exp <= t) return null;
    if (payload.nbf && payload.nbf > t + 5) return null;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (audience && !aud.includes(audience)) return null;
    return payload;
  } catch (e) { return null; }
}
