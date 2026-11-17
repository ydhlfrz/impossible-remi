import { generateKeyPairSync, createHmac, sign } from 'node:crypto';
import { verifySupabaseJwt, _clearJwksCache } from '../server/jwt.js';
let n = 0, bad = 0;
const ok = (name, got, want = true) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log('GAGAL:', name, '| dapat', JSON.stringify(got), '| harusnya', JSON.stringify(want)); } };
const b64u = x => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
const mk = (header, payload, signer) => { const d = b64u(header) + '.' + b64u(payload); return d + '.' + signer(Buffer.from(d)).toString('base64url'); };
const NOW = 1_800_000_000_000, T = Math.floor(NOW / 1000);
const claims = (o = {}) => ({ sub: 'u-1', email: 'a@b.co', aud: 'authenticated', role: 'authenticated', exp: T + 3600, ...o });
const hs = s => d => createHmac('sha256', s).update(d).digest();

// HS256 (proyek lama)
const S = 'super-secret';
const t1 = mk({ alg: 'HS256', typ: 'JWT' }, claims(), hs(S));
ok('HS256 valid', (await verifySupabaseJwt(t1, { secret: S, now: NOW }))?.sub, 'u-1');
ok('HS256 secret salah', await verifySupabaseJwt(t1, { secret: 'lain', now: NOW }), null);
ok('HS256 tanpa secret terkonfigurasi ditolak', await verifySupabaseJwt(t1, { now: NOW }), null);
ok('token kedaluwarsa', await verifySupabaseJwt(mk({ alg: 'HS256' }, claims({ exp: T - 1 }), hs(S)), { secret: S, now: NOW }), null);
ok('tanpa exp ditolak', await verifySupabaseJwt(mk({ alg: 'HS256' }, { sub: 'x', aud: 'authenticated' }, hs(S)), { secret: S, now: NOW }), null);
ok('nbf di masa depan ditolak', await verifySupabaseJwt(mk({ alg: 'HS256' }, claims({ nbf: T + 600 }), hs(S)), { secret: S, now: NOW }), null);
ok('aud salah (anon) ditolak', await verifySupabaseJwt(mk({ alg: 'HS256' }, claims({ aud: 'anon' }), hs(S)), { secret: S, now: NOW }), null);
ok('aud berupa array diterima', !!(await verifySupabaseJwt(mk({ alg: 'HS256' }, claims({ aud: ['x', 'authenticated'] }), hs(S)), { secret: S, now: NOW })));
const [h, p, s] = t1.split('.');
ok('payload dimodifikasi ditolak', await verifySupabaseJwt(h + '.' + b64u(claims({ sub: 'admin' })) + '.' + s, { secret: S, now: NOW }), null);
ok('alg none ditolak', await verifySupabaseJwt(b64u({ alg: 'none' }) + '.' + p + '.', { secret: S, now: NOW }), null);
ok('sampah ditolak', [await verifySupabaseJwt('abc', { secret: S }), await verifySupabaseJwt('', { secret: S }), await verifySupabaseJwt(null, { secret: S })], [null, null, null]);

// ES256 + JWKS (proyek dengan kunci asimetris)
const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const ecJwk = { ...ec.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'ES256', use: 'sig' };
const es = k => d => sign('sha256', d, { key: k, dsaEncoding: 'ieee-p1363' });
const t2 = mk({ alg: 'ES256', typ: 'JWT', kid: 'k1' }, claims(), es(ec.privateKey));
ok('ES256 valid (JWKS langsung)', (await verifySupabaseJwt(t2, { jwks: { keys: [ecJwk] }, now: NOW }))?.sub, 'u-1');
const ec2 = generateKeyPairSync('ec', { namedCurve: 'P-256' });
ok('ES256 ditandatangani kunci lain ditolak', await verifySupabaseJwt(mk({ alg: 'ES256', kid: 'k1' }, claims(), es(ec2.privateKey)), { jwks: { keys: [ecJwk] }, now: NOW }), null);
ok('kid tidak dikenal ditolak', await verifySupabaseJwt(mk({ alg: 'ES256', kid: 'zzz' }, claims(), es(ec.privateKey)), { jwks: { keys: [ecJwk] }, now: NOW }), null);
// RS256
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const rsJwk = { ...rsa.publicKey.export({ format: 'jwk' }), kid: 'r1', alg: 'RS256' };
ok('RS256 valid', (await verifySupabaseJwt(mk({ alg: 'RS256', kid: 'r1' }, claims(), d => sign('sha256', d, rsa.privateKey)), { jwks: { keys: [rsJwk] }, now: NOW }))?.sub, 'u-1');
// alg-confusion: HS256 yang ditandatangani dengan kunci publik tidak boleh lolos bila hanya JWKS yang dikonfigurasi
ok('alg-confusion (HS256 dengan kunci publik) ditolak', await verifySupabaseJwt(mk({ alg: 'HS256' }, claims(), hs(JSON.stringify(ecJwk))), { jwks: { keys: [ecJwk] }, now: NOW }), null);
ok('ES256 tanpa JWKS terkonfigurasi ditolak', await verifySupabaseJwt(t2, { secret: S, now: NOW }), null);

// JWKS lewat URL: di-cache, dan di-refresh sekali saat kid baru muncul (rotasi kunci)
_clearJwksCache();
let fetches = 0, keys = [ecJwk];
const fetchFn = async url => { fetches++; return { ok: true, status: 200, json: async () => ({ keys }) }; };
const opt = { jwksUrl: 'https://p.supabase.co/auth/v1/.well-known/jwks.json', fetchFn, now: NOW };
await verifySupabaseJwt(t2, opt); await verifySupabaseJwt(t2, opt); await verifySupabaseJwt(t2, opt);
ok('JWKS di-cache (1 unduhan untuk 3 verifikasi)', fetches, 1);
const ec3 = generateKeyPairSync('ec', { namedCurve: 'P-256' });
keys = [ecJwk, { ...ec3.publicKey.export({ format: 'jwk' }), kid: 'k2', alg: 'ES256' }];
ok('kunci baru (rotasi) dikenali lewat refresh', (await verifySupabaseJwt(mk({ alg: 'ES256', kid: 'k2' }, claims(), es(ec3.privateKey)), opt))?.sub, 'u-1');
ok('refresh hanya sekali tambahan', fetches, 2);
ok('JWKS gagal diunduh -> ditolak, bukan error', await verifySupabaseJwt(mk({ alg: 'ES256', kid: 'k9' }, claims(), es(ec.privateKey)), { ...opt, fetchFn: async () => ({ ok: false, status: 500 }) }), null);
console.log(`${n - bad}/${n} tes JWT lulus`);
process.exit(bad ? 1 : 0);
