// Penyimpanan: MemoryStore (dev/tes) dan UpstashStore (Redis REST, untuk Vercel). Semua nilai dibulatkan lewat JSON.
import { randomBytes } from 'node:crypto';
const sleep = ms => new Promise(r => setTimeout(r, ms));

class Base {
  // kunci terdistribusi: SET NX PX + hapus-jika-pemilik
  async withLock(key, fn, o = {}) {
    const tok = randomBytes(8).toString('hex'), end = Date.now() + (o.wait ?? 4000);
    while (!(await this.setnx(key, tok, o.ttl ?? 5000))) {
      if (Date.now() > end) throw Object.assign(new Error('lock_timeout'), { status: 503, code: 'busy' });
      await sleep(15 + Math.random() * 25);
    }
    try { return await fn(); } finally { await this.delIf(key, tok); }
  }
}
export class MemoryStore extends Base {
  constructor() { super(); this.m = new Map(); }
  _live(k) { const e = this.m.get(k); if (!e) return null; if (e.exp && e.exp <= Date.now()) { this.m.delete(k); return null; } return e; }
  async get(k) { const e = this._live(k); return e ? JSON.parse(e.v) : null; }
  async set(k, v, ttlSec) { this.m.set(k, { v: JSON.stringify(v), exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 }); }
  async del(k) { this.m.delete(k); }
  async setnx(k, v, ttlMs) { if (this._live(k)) return false; this.m.set(k, { v: JSON.stringify(v), exp: Date.now() + ttlMs }); return true; }
  async delIf(k, v) { const e = this._live(k); if (e && e.v === JSON.stringify(v)) this.m.delete(k); }
}
export class UpstashStore extends Base {
  constructor(url, token, fetchFn = globalThis.fetch) { super(); this.url = url; this.token = token; this.f = fetchFn; }
  async cmd(args) {
    const r = await this.f(this.url, { method: 'POST', headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error('redis: ' + (j.error || r.status));
    return j.result;
  }
  async get(k) { const r = await this.cmd(['GET', k]); return r == null ? null : JSON.parse(r); }
  async set(k, v, ttlSec) { const a = ['SET', k, JSON.stringify(v)]; if (ttlSec) a.push('EX', String(ttlSec)); await this.cmd(a); }
  async del(k) { await this.cmd(['DEL', k]); }
  async setnx(k, v, ttlMs) { return (await this.cmd(['SET', k, JSON.stringify(v), 'NX', 'PX', String(ttlMs)])) === 'OK'; }
  async delIf(k, v) { await this.cmd(['EVAL', "if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", '1', k, JSON.stringify(v)]); }
}
// Postgres Supabase lewat PostgREST (tabel kv + fungsi RPC; lihat supabase/schema.sql). Hanya diakses server dengan service key.
export class SupabaseStore extends Base {
  constructor(url, serviceKey, fetchFn = globalThis.fetch) { super(); this.url = url.replace(/\/+$/, ''); this.key = serviceKey; this.f = fetchFn; }
  async req(method, path, body, extra = {}) {
    const r = await this.f(this.url + '/rest/v1' + path, { method, headers: { apikey: this.key, Authorization: 'Bearer ' + this.key, 'Content-Type': 'application/json', ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text();
    if (!r.ok) throw new Error('supabase ' + r.status + ': ' + t.slice(0, 200));
    return t ? JSON.parse(t) : null;
  }
  async get(k) {
    const rows = await this.req('GET', '/kv?k=eq.' + encodeURIComponent(k) + '&select=v,exp&limit=1');
    const row = rows && rows[0];
    if (!row || (row.exp && Date.parse(row.exp) <= Date.now())) return null;
    return row.v;
  }
  async set(k, v, ttlSec) { await this.req('POST', '/kv?on_conflict=k', [{ k, v, tok: null, exp: ttlSec ? new Date(Date.now() + ttlSec * 1000).toISOString() : null }], { Prefer: 'resolution=merge-duplicates,return=minimal' }); }
  async del(k) { await this.req('DELETE', '/kv?k=eq.' + encodeURIComponent(k)); }
  async setnx(k, v, ttlMs) { return (await this.req('POST', '/rpc/kv_setnx', { p_k: k, p_tok: String(v), p_ttl_ms: ttlMs })) === true; }
  async delIf(k, v) { await this.req('POST', '/rpc/kv_del_if', { p_k: k, p_tok: String(v) }); }
}
let mem = null;
export function getStore(env = process.env) {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) return new SupabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL, token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (url && token) return new UpstashStore(url, token);
  return (mem ||= new MemoryStore()); // PERINGATAN: di Vercel memori tidak dibagi antar-instance -> wajib pakai Supabase/Redis
}
