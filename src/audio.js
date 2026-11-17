// Audio prosedural (Web Audio API): BGM generatif + efek suara. Tanpa aset eksternal.
let ctx = null, master, musicBus, sfxBus, melIn, delay, noiseBuf, timer = null, nextT = 0, step = 0;
const st = { music: true, sfx: true };
try { Object.assign(st, JSON.parse(localStorage.getItem('remiAudio') || '{}')); } catch (e) {}
const save = () => { try { localStorage.setItem('remiAudio', JSON.stringify(st)); } catch (e) {} };
const R = (a, b) => a + Math.random() * (b - a);
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

export function init() {
  if (ctx) { if (ctx.state === 'suspended' && !document.hidden) ctx.resume(); return; }
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  master = ctx.createGain(); master.gain.value = 0.9;
  musicBus = ctx.createGain(); musicBus.gain.value = st.music ? 0.5 : 0;
  sfxBus = ctx.createGain(); sfxBus.gain.value = 1;
  melIn = ctx.createGain();
  delay = ctx.createDelay(1); delay.delayTime.value = 0.38;
  const fb = ctx.createGain(); fb.gain.value = 0.3;
  const wet = ctx.createGain(); wet.gain.value = 0.35;
  melIn.connect(musicBus); melIn.connect(delay);
  delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(musicBus);
  musicBus.connect(comp); sfxBus.connect(comp); comp.connect(master); master.connect(ctx.destination);
  const len = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  loadP = loadExternal();
  bgmWhenReady();
}

// ---------- pembangun suara ----------
function tone(f, t, d, o = {}) {
  const { type = 'sine', v = 0.3, a = 0.005, f2, bus = sfxBus } = o;
  const os = ctx.createOscillator(), g = ctx.createGain();
  os.type = type;
  os.frequency.setValueAtTime(f, t);
  if (f2) os.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  os.connect(g); g.connect(bus);
  os.start(t); os.stop(t + d + 0.05);
}
function noise(t, d, o = {}) {
  const { f = 2000, f2, q = 1, v = 0.3, type = 'bandpass', bus = sfxBus } = o;
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(fl); fl.connect(g); g.connect(bus);
  s.start(t, Math.random(), d + 0.05);
}

// ---------- audio buatan sendiri (opsional) ----------
// Letakkan file di public/audio/ lalu daftarkan di public/audio/manifest.json (lihat AUDIO.md).
// Suara yang tidak didaftarkan tetap memakai suara bawaan (sintetis).
const ext = { bgm: [], sfx: {}, vol: { bgm: 0.6, sfx: 1 } };
const BASE = (import.meta.env && import.meta.env.BASE_URL) || './';
let loadP = Promise.resolve(), bgmSrc = null, bgmIdx = 0, playingExt = false;
async function loadBuf(file) {
  const r = await fetch(BASE + 'audio/' + file);
  if (!r.ok) throw new Error(file);
  return ctx.decodeAudioData(await r.arrayBuffer());
}
async function loadExternal() {
  try {
    const r = await fetch(BASE + 'audio/manifest.json');
    if (!r.ok) return;
    const m = await r.json();
    Object.assign(ext.vol, m.volume || {});
    const list = [].concat(m.bgm || []);
    ext.bgm = (await Promise.all(list.map(f => loadBuf(f).catch(() => { console.warn('BGM gagal dimuat:', f); return null; })))).filter(Boolean);
    await Promise.all(Object.entries(m.sfx || {}).map(async ([k, f]) => {
      try { ext.sfx[k] = await loadBuf(f); } catch (e) { console.warn('SFX gagal dimuat:', k, f); }
    }));
  } catch (e) { /* tidak ada manifest: pakai suara bawaan */ }
}
function bgmWhenReady() { loadP.then(() => { if (st.music) startBgm(); }); }
function startExtBgm() {
  const b = ext.bgm[bgmIdx % ext.bgm.length]; bgmIdx++;
  const g = ctx.createGain(); g.gain.value = ext.vol.bgm; g.connect(musicBus);
  const src = ctx.createBufferSource();
  src.buffer = b; src.loop = ext.bgm.length === 1; src.connect(g);
  src.onended = () => { if (bgmSrc === src && playingExt) startExtBgm(); };
  bgmSrc = src; src.start();
}

// ---------- efek suara ----------
const FX = {
  draw(t) { noise(t, 0.13, { f: 1800, f2: 5200, q: 0.8, v: 0.35 }); tone(900, t, 0.05, { type: 'triangle', v: 0.05 }); },
  shuffle(t) {
    noise(t, 1.2, { f: 600, f2: 2600, q: 0.6, v: 0.07 });
    for (let i = 0; i < 22; i++) noise(t + i * 0.055 + R(0, 0.02), 0.05, { f: R(3000, 5500), q: 1.2, v: 0.22 });
  },
  deal(t) { for (let i = 0; i < 28; i++) noise(t + i * 0.1, 0.06, { f: R(2500, 4500), f2: 6000, q: 1, v: 0.18 }); },
  eat(t) {
    tone(220, t, 0.12, { type: 'square', f2: 110, v: 0.16 });
    tone(220, t + 0.13, 0.12, { type: 'square', f2: 110, v: 0.16 });
    noise(t, 0.1, { f: 1200, q: 2, v: 0.2 });
    tone(523, t + 0.27, 0.16, { type: 'triangle', v: 0.2 });
    tone(784, t + 0.35, 0.25, { type: 'triangle', v: 0.2 });
  },
  discard(t) { noise(t, 0.18, { f: 3500, f2: 700, v: 0.3 }); tone(160, t + 0.08, 0.14, { f2: 60, v: 0.4 }); },
  meld(t) { [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.07, 0.28, { type: 'triangle', v: 0.2 })); },
  pluck(t) { tone(120, t, 0.28, { type: 'sawtooth', f2: 90, v: 0.2 }); tone(110, t + 0.14, 0.3, { type: 'sawtooth', f2: 80, v: 0.2 }); },
  closed(t) {
    tone(110, t, 0.55, { type: 'sawtooth', f2: 50, v: 0.35 });
    noise(t, 0.4, { f: 900, f2: 200, v: 0.4 });
    [392, 466, 587].forEach(f => tone(f, t + 0.15, 0.5, { type: 'square', v: 0.07 }));
  },
  remi(t) {
    [523, 659, 784, 1047, 1319].forEach((f, i) => { tone(f, t + i * 0.1, 0.3, { type: 'square', v: 0.09 }); tone(f, t + i * 0.1, 0.3, { type: 'triangle', v: 0.18 }); });
    [523, 659, 784, 1047].forEach(f => tone(f, t + 0.6, 1.3, { a: 0.03, v: 0.16 }));
    for (let i = 0; i < 8; i++) tone(R(2200, 4200), t + 0.6 + i * 0.1, 0.15, { v: 0.05 });
  },
  drawGame(t) { [392, 349, 330, 262].forEach((f, i) => tone(f, t + i * 0.24, 0.34, { type: 'triangle', v: 0.22 })); },
  win(t) {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => { tone(f, t + i * 0.13, 0.35, { type: 'square', v: 0.1 }); tone(f, t + i * 0.13, 0.35, { type: 'triangle', v: 0.18 }); });
    [523, 659, 784, 1047].forEach(f => tone(f, t + 1, 1.8, { a: 0.03, v: 0.15 }));
    for (let i = 0; i < 12; i++) tone(R(2000, 4200), t + 1 + i * 0.12, 0.15, { v: 0.05 });
  },
  turn(t) { tone(880, t, 0.12, { v: 0.12 }); tone(1175, t + 0.08, 0.18, { v: 0.1 }); },
  click(t) { tone(1200, t, 0.04, { type: 'triangle', v: 0.12 }); }
};

export function play(name) {
  if (!ctx || !st.sfx || ctx.state !== 'running') return;
  const b = ext.sfx[name];
  if (b) {
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = b; g.gain.value = ext.vol.sfx; src.connect(g); g.connect(sfxBus); src.start();
    return;
  }
  const fn = FX[name];
  if (fn) { try { fn(ctx.currentTime + 0.01); } catch (e) {} }
}

// ---------- BGM generatif (lounge santai) ----------
const BEAT = 60 / 78;
const CH = [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 60, 64], [55, 59, 62, 64]]; // Am7 Fmaj7 Cmaj7 G6
const ROOT = [45, 41, 48, 43];
const PENT = [69, 72, 74, 76, 79, 81];

function pad(notes, t, d) {
  const g = ctx.createGain(), lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 900;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.035, t + 0.7);
  g.gain.setValueAtTime(0.035, t + d - 0.5);
  g.gain.linearRampToValueAtTime(0.0001, t + d + 0.4);
  lp.connect(g); g.connect(musicBus);
  notes.forEach(m => [-6, 6].forEach(dt => {
    const o = ctx.createOscillator();
    o.type = 'triangle'; o.frequency.value = hz(m); o.detune.value = dt;
    o.connect(lp); o.start(t); o.stop(t + d + 0.5);
  }));
}
function playStep(n, t) {
  const ci = Math.floor(n / 8) % 4, s = n % 8;
  if (s === 0) { pad(CH[ci], t, BEAT * 4); tone(hz(ROOT[ci]), t, BEAT * 1.8, { v: 0.22, a: 0.03, bus: musicBus }); }
  if (s === 4) tone(hz(ROOT[ci]), t, BEAT * 1.2, { v: 0.15, a: 0.03, bus: musicBus });
  if (s % 2 === 1) noise(t, 0.04, { f: 7000, type: 'highpass', v: 0.035, bus: musicBus });
  if (Math.random() < 0.45) {
    const pool = [...CH[ci].map(x => x + 12), ...PENT];
    tone(hz(pool[(Math.random() * pool.length) | 0]), t, R(0.35, 0.6), { type: 'triangle', v: 0.09, a: 0.01, bus: melIn });
  }
}
function sched() {
  if (!ctx) return;
  while (nextT < ctx.currentTime + 0.35) { playStep(step, nextT); nextT += BEAT / 2; step++; }
}
function startBgm() {
  if (!ctx || timer || playingExt) return;
  if (ext.bgm.length) { musicBus.gain.setTargetAtTime(0.5, ctx.currentTime, 0.3); playingExt = true; startExtBgm(); return; }
  nextT = ctx.currentTime + 0.15; step = 0;
  musicBus.gain.setTargetAtTime(0.5, ctx.currentTime, 0.3);
  timer = setInterval(sched, 100);
}
function stopBgm() {
  if (timer) { clearInterval(timer); timer = null; }
  if (playingExt) { playingExt = false; if (bgmSrc) { bgmSrc.onended = null; try { bgmSrc.stop(); } catch (e) {} bgmSrc = null; } }
  if (ctx) musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
}

export function setMusic(on) { st.music = on; save(); if (!ctx) return; on ? bgmWhenReady() : stopBgm(); }
export function setSfx(on) { st.sfx = on; save(); }
export function getState() { return { ...st }; }
export function setHidden(h) { if (!ctx) return; h ? ctx.suspend() : ctx.resume(); }
