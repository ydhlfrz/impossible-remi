// SDK klien untuk API online (fetch). Dipakai UI lobi/online nanti; juga bisa diuji tanpa jaringan lewat fetchFn tiruan.
export class Net {
  constructor({ base = '', fetchFn, storage, getToken } = {}) {
    this.base = base;
    this.getToken = getToken || null; // async () => token (Supabase); bila kosong memakai token lokal
    this.f = fetchFn || ((...a) => globalThis.fetch(...a));
    this.store = storage || (typeof localStorage !== 'undefined' ? localStorage : { getItem: () => null, setItem() {}, removeItem() {} });
    this.token = this.store.getItem('remiToken');
  }
  async call(method, path, { body, query } = {}) {
    const qs = query ? '?' + new URLSearchParams(query).toString() : '';
    const tok = this.getToken ? await this.getToken() : this.token;
    const res = await this.f(this.base + path + qs, {
      method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'http_' + res.status), { status: res.status, code: data.error, data });
    return data;
  }
  _auth(d) { this.token = d.token; this.store.setItem('remiToken', d.token); return d.user; }
  logout() { this.token = null; this.store.removeItem('remiToken'); }
  register(username, password, name, avatar) { return this.call('POST', '/api/register', { body: { username, password, name, avatar } }).then(d => this._auth(d)); }
  login(username, password) { return this.call('POST', '/api/login', { body: { username, password } }).then(d => this._auth(d)); }
  me() { return this.call('GET', '/api/me').then(d => d.user); }
  profile(p) { return this.call('POST', '/api/profile', { body: p }).then(d => d.user); }
  quickMatch(target, level) { return this.call('POST', '/api/match', { body: { target, level } }); }
  createRoom(o) { return this.call('POST', '/api/rooms', { body: o }); }
  joinRoom(code, password) { return this.call('POST', '/api/rooms/join', { body: { code, password } }); }
  startRoom(code) { return this.call('POST', '/api/rooms/start', { body: { code } }); }
  leaveRoom(code) { return this.call('POST', '/api/rooms/leave', { body: { code } }); }
  sync(code, since = 0) { return this.call('GET', '/api/rooms/sync', { query: { code, since } }); }
  action(code, action, since = 0) { return this.call('POST', '/api/rooms/action', { body: { code, action, since } }); }
  // polling: 0,8 dtk saat giliran Anda, 1,2 dtk bila tidak; berhenti dengan stop(); backoff saat error jaringan
  poll(code, onUpdate, { fast = 800, slow = 1200 } = {}) {
    let alive = true, since = 0, fails = 0;
    const loop = async () => {
      while (alive) {
        let wait = slow;
        try {
          const p = await this.sync(code, since);
          fails = 0; since = p.seq; onUpdate(p);
          if (p.view && p.view.cur === p.seat) wait = fast;
          if (p.status === 'finished') alive = false;
        } catch (e) {
          fails++; wait = Math.min(8000, 1000 * 2 ** Math.min(fails, 3));
          if (e.status === 401 || e.status === 403 || e.status === 404) { alive = false; onUpdate({ error: e.code }); }
        }
        if (alive) await new Promise(r => setTimeout(r, wait));
      }
    };
    loop();
    return { stop: () => { alive = false; } };
  }
}

// Klien satu ruang: sync digerakkan notifikasi push (Supabase Realtime) + pewaktu batas waktu giliran + polling cadangan.
export class RoomClient {
  constructor({ net, code, onUpdate, realtime, pollMs = 1200, fallbackMs = 6000, fastMs = 800, backoffMs = 1000 }) {
    Object.assign(this, { net, code, onUpdate, realtime, pollMs, fallbackMs, fastMs, backoffMs });
    this.alive = false; this.since = 0; this.handled = 0; this.busy = false; this.again = false; this.fails = 0; this.live = false; this.timer = null; this.ch = null;
  }
  start() {
    this.alive = true;
    if (this.realtime) {
      try {
        this.ch = this.realtime.channel('room:' + this.code);
        this.ch.on('broadcast', { event: 'v' }, () => this.kick());
        this.ch.subscribe(st => { this.live = st === 'SUBSCRIBED'; if (this.live) this.kick(); });
      } catch (e) { this.ch = null; this.live = false; }
    }
    this.kick();
    return this;
  }
  stop() {
    this.alive = false; clearTimeout(this.timer);
    if (this.ch && this.realtime) { try { this.realtime.removeChannel(this.ch); } catch (e) {} }
    this.ch = null;
  }
  kick() { if (!this.alive) return; if (this.busy) { this.again = true; return; } clearTimeout(this.timer); this.run(); }
  deliver(p) { // setiap event hanya diteruskan sekali, walau datang dari sync dan action bersamaan
    const evs = (p.events || []).filter(e => e.seq > this.handled);
    this.handled = Math.max(this.handled, p.seq || 0); this.since = this.handled;
    this.onUpdate({ ...p, events: evs });
  }
  async send(action) { // aksi pemain; hasilnya juga dikirim ke onUpdate
    const p = await this.net.action(this.code, action, this.since);
    this.deliver(p); this.schedule(p);
    return p;
  }
  async run() {
    this.busy = true;
    try {
      const p = await this.net.sync(this.code, this.since);
      this.fails = 0; this.deliver(p); this.schedule(p);
    } catch (e) {
      this.fails++;
      if ([401, 403, 404].includes(e.status)) { this.onUpdate({ error: e.code || 'error', status: e.status }); this.stop(); }
      else this.timer = setTimeout(() => this.kick(), Math.min(8 * this.backoffMs, this.backoffMs * 2 ** Math.min(this.fails, 3)));
    } finally { this.busy = false; if (this.again && this.alive) { this.again = false; this.kick(); } }
  }
  schedule(p) {
    if (!this.alive) return;
    clearTimeout(this.timer);
    if (p.status === 'finished' || p.status === 'abandoned') return;
    let d = this.live ? this.fallbackMs : this.pollMs;
    const v = p.view;
    if (v && v.deadline) d = Math.min(d, Math.max(300, v.deadline - p.serverNow + 200)); // bangun tepat setelah batas waktu (server menegakkan timer saat sync)
    if (v && v.cur === v.you && !this.live) d = Math.min(d, this.fastMs);
    this.timer = setTimeout(() => this.kick(), d);
  }
}
