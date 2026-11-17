import * as THREE from 'three';
import { tr, setLang, getLang, applyI18n } from './i18n.js';
import { DECK_X, CARD_SIZES, BOT_MELD_K, tableHalfW, seatX, deckX, poolLayout, handSpacing, meldStep } from './layout.js';
import { mapView, eventToUi } from './viewmap.js';
import { initOnline } from './online.js';
import * as SND from './audio.js';
import { val, melds, eatMeld, eatTargets, canManualMeldCards, canDiscCard } from './rules.js';
import { chooseEat, chooseMelds, chooseDiscard, LEVEL_NAMES } from './bot.js';

const T = THREE;
const $ = i => document.getElementById(i);
const after = (ms, f) => setTimeout(f, ms);
const S = ['♠', '♥', '♦', '♣'];
const R = [0, 'A', 2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K'];
// Pengaturan aturan (default = aturan yang Anda tetapkan). Lihat tools/sim.mjs & RULES.md untuk data keseimbangan.
//  reshuffleAlways: true  -> pool SELALU dikocok ulang saat tumpukan habis (aturan no. 6 semula)
//  leftoverMult: 1        -> pengali minus kartu sisa di tangan saat ronde berakhir (mis. 0.5 = setengah)
const RULES = { reshuffleAlways: false, leftoverMult: 1 };
const AV = ['🧑', '🦊', '🐼', '🐯'];
const COL = ['#42a5f5', '#ef5350', '#66bb6a', '#ffa726'];
const PHI = { draw: '🃏', discard: '🗑️', pluck: '✋', deal: '🎴', over: '🏁', wait: '⏳' };


let id = 0;
let deck = [];
let pool = [];
let P = [];
let cur = 0;
let phase = 'init';
let starter = 0;
let plk = [];
let anim = false;
let dealt = false;
let dealing = false;
let hover = null;
let hoverPool = null;
const esc = x => String(x).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
let sizeIdx = (() => { try { const raw = localStorage.getItem('remiCardSize'); const v = raw === null ? 2 : +raw; return Number.isInteger(v) && v >= 0 && v < CARD_SIZES.length ? v : 2; } catch (e) { return 2; } })();
const SZ = () => CARD_SIZES[sizeIdx];
let revealCards = false;
let ONLINE = null; // bukan null saat bermain online: tampilan digerakkan data server

// State Makan Manual & Konfirmasi
let TARGET = 1000;
let LEVEL = 'medium';
let roundNo = 0;
let reshuffled = false; // pool sudah pernah dikocok ulang pada ronde ini
let selectedHandCards = [];
let meldMode = false;
let pendingMeldCheckPlayer = null;
let pendingMeldCallback = null;

function shuf(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function mk() {
  const a = [];
  for (let s = 0; s < 4; s++) {
    for (let r = 1; r <= 13; r++) {
      a.push({ s, r, id: id++ });
    }
  }
  return a;
}

// ================= ATURAN (logika murni ada di rules.js & bot.js) =================
const hasMeld = p => p.melds.length > 0;
const cs = c => R[c.r] + S[c.s];
const canDisc = (p, c) => canDiscCard(p.hand, hasMeld(p), c);
const canManualMeld = (p, sel) => canManualMeldCards(sel, hasMeld(p));

// Menurunkan seri ke meja (dipakai pemain & bot): skor melayang, suara, dan log
function layMelds(p, ms) {
  let tot = 0;
  ms.forEach(m => {
    const v = m.reduce((a, c) => a + val(c), 0);
    tot += v;
    p.melds.push(m);
    p.hand = p.hand.filter(c => !m.includes(c));
    logEv(p.id, tr('log.meld', { cards: m.map(cs).join(' '), v }));
  });
  if (tot) {
    const w = W(p.id, 0, -2.1);
    after(700, () => { pop('+' + tot, w.x, w.z); SND.play('meld'); });
  }
  return tot;
}
function applyMelds(p) { return layMelds(p, melds(p.hand, hasMeld(p))); }

// Informasi yang boleh diketahui bot: kartu di tangannya, pool yang terlihat, dan seri di meja
function botInfo(p) {
  const seen = new Set();
  const add = c => seen.add(c.s * 13 + c.r);
  p.hand.forEach(add);
  pool.forEach(c => { if (!c.closed) add(c); });
  P.forEach(q => q.melds.forEach(m => m.forEach(add)));
  return { deckN: deck.length, seen };
}

function getPlayerMeldScore(p) {
  let meldPts = 0;
  if (p.melds) p.melds.forEach(m => m.forEach(c => (meldPts += val(c))));
  return meldPts;
}

// ================= ALUR =================
function resetEatSelection() {
  selectedHandCards = [];
  meldMode = false;
  const cancelBtn = $('cancelEatBtn');
  if (cancelBtn) cancelBtn.style.display = 'none';
}

function backToMenu() {
  phase = 'init'; anim = false; revealCards = false;
  P.forEach(p => { p.score = 0; p.hand = []; p.melds = []; p.pluckedCards = []; });
  resetEatSelection();
  clearCards(); deck = []; pool = [];
  const ov = $('ov'); if (ov) ov.style.display = 'none';
  const lg = $('logList'); if (lg) lg.innerHTML = '';
  $('startMenuModal').style.display = 'flex';
  render();
}

function newRound() {
  anim = true;
  dealt = false;
  revealCards = false;
  phase = 'deal';
  resetEatSelection();
  
  const ov = $('ov');
  if (ov) ov.style.display = 'none';
  
  const menuModal = $('startMenuModal');
  if (menuModal) menuModal.style.display = 'none';

  clearCards();
  deck = shuf(mk());
  pool = [];
  P.forEach(p => {
    p.hand = deck.splice(0, 7);
    p.melds = [];
    p.pluckedCards = [];
    p.pen = 0;
    p.cv = 0;
    p.done = false;
    p.remi = false;
  });
  cur = starter;
  roundNo++;
  reshuffled = false;
  logEv(-1, tr('log.round', { n: roundNo, room: TARGET, name: P[cur].name }));
  render();
  msg(tr('msg.shuffling'));
  shuffleFx(() => {
    dealt = true;
    dealing = true;
    SND.play('deal');
    render();
    dealing = false;
    msg(tr('msg.dealing'));
    after(2300, () => {
      anim = false;
      phase = 'draw';
      turn();
    });
  });
}

function turn() {
  resetEatSelection();
  render();
  if (phase === 'over' || phase === 'init') return;
  banner(cur == 0 ? tr('banner.yourTurn') : tr('banner.turnOf', { name: P[cur].name }));
  if (cur == 0) SND.play('turn');
  if (cur == 0) msg(tr('msg.yourTurn'));
  else {
    msg(tr('msg.thinking', { name: P[cur].name }));
    after(1000, bot);
  }
}

function draw(p) {
  if (ONLINE) return onlineSend({ type: 'draw' });
  if (phase !== 'draw') return;
  resetEatSelection();
  anim = true;
  const anyMeldExists = P.some(pl => pl.melds.length > 0);

  // Tumpukan habis: ada seri di meja -> ronde selesai. Belum ada seri -> pool dikocok ulang SEKALI;
  // bila tumpukan habis lagi dan tetap belum ada seri -> ronde selesai.
  if (!deck.length && !RULES.reshuffleAlways && (anyMeldExists || reshuffled)) {
    msg(tr(anyMeldExists ? 'msg.deckEndMeld' : 'msg.deckEndNone'));
    logEv(-1, tr(anyMeldExists ? 'log.deckEndMeld' : 'log.deckEndNone'));
    return endRound(null);
  }

  if (deck.length > 0) {
    const drawnCard = deck.pop();
    p.hand.push(drawnCard);
    SND.play('draw');
    logEv(p.id, p.id ? tr('log.drawBot') : tr('log.drawYou', { card: cs(drawnCard) }));
    anim = false;
    if (p.id === 0) {
      const cardInMeld = melds(p.hand, hasMeld(p)).find(m => m.includes(drawnCard));
      if (cardInMeld) {
        render();
        return promptMeldOption(
          p,
          tr('meld.drawn', { card: cs(drawnCard) }),
          () => { applyMelds(p); gained(p); },
          () => gained(p)
        );
      }
    } else layBotMelds(p);
    return gained(p);
  }

  // tumpukan habis & belum ada seri sama sekali: kocok ulang pool
  if (!pool.length) return endRound(null);
  const top = pool.pop();
  deck = shuf(pool.map(c => ((c.closed = false), c)));
  pool = top ? [top] : [];
  reshuffled = true;
  logEv(-1, tr('log.reshuffle'));
  msg(tr('msg.reshuffle'));
  render();
  after(1000, () => shuffleFx(() => { anim = false; draw(p); }));
}

// Makan dari pool: k = posisi kartu pool (1 = teratas), pendamping = kartu tangan yang dipilih
function eatManual(p, k) {
  if (ONLINE) { const sel = selectedHandCards.map(c => c.id); resetEatSelection(); return onlineSend({ type: 'eat', k, sel }); }
  if (phase !== 'draw') return;
  const sel = [...selectedHandCards];
  const m = eatMeld(p.hand, hasMeld(p), pool, k, sel);
  if (!m) return;
  resetEatSelection();
  SND.play('eat');
  const taken = pool.splice(-k);
  logEv(p.id, tr('log.eat', { k, cards: taken.map(cs).join(' ') }));
  p.hand.push(...taken);
  layMelds(p, [m]);
  render();

  if (p.id === 0 && melds(p.hand, hasMeld(p)).length > 0) {
    return promptMeldOption(
      p,
      tr('meld.more'),
      () => { applyMelds(p); gained(p); },
      () => gained(p)
    );
  }
  gained(p);
}

// Tangan kosong (setelah tarik, makan, atau susun seri) = REMI
function gained(p) {
  if (!p.hand.length) return declareRemi(p);
  phase = 'discard';
  render();
  if (p.id) {
    msg(tr('msg.choosing', { name: p.name }));
    after(1100, botDisc);
  } else {
    msg(tr('msg.discard') + (p.hand.length == 1 ? tr('msg.discardClose') : ''));
  }
}

function discard(p, c, closed) {
  if (ONLINE) { resetEatSelection(); return onlineSend(closed ? { type: 'close' } : { type: 'discard', id: c.id }); }
  if (phase !== 'discard' || p !== P[cur]) return; // klik ganda: 1 giliran hanya boleh membuang 1 kartu
  phase = 'wait';
  resetEatSelection();
  p.hand = p.hand.filter(x => x != c);
  c.closed = closed;
  pool.push(c);
  SND.play(closed ? 'closed' : 'discard');
  logEv(p.id, closed ? tr('log.closed') : tr('log.discard', { card: cs(c) }));
  hover = null;
  if (closed) {
    p.cv = val(c) * 10;
    render();
    return endRound(p, 'closed');
  }
  if (p.hand.length > 7) {
    phase = 'pluck';
    if (!p.id) {
      plk = shuf([...p.hand]);
      msg(tr('msg.pluck'));
    } else after(1000, botPluck);
    render();
  } else {
    render();
    after(700, next);
  }
}

function pluck(p, c) {
  if (ONLINE) return onlineSend({ type: 'pluck', index: plk.indexOf(c) });
  if (phase !== 'pluck' || p !== P[cur]) return; // cegah cabut ganda karena klik ganda
  p.hand = p.hand.filter(x => x != c);
  plk = plk.filter(x => x != c);
  if (!p.pluckedCards) p.pluckedCards = [];
  p.pluckedCards.push(c);
  const v = val(c) * 10;
  p.pen += v;
  logEv(p.id, tr('log.pluck'));
  const w = W(p.id, 0, 0);
  pop('-' + v, w.x, w.z, 1);
  SND.play('pluck');
  if (p.hand.length > 7) {
    render();
    if (p.id) after(900, botPluck);
  } else {
    phase = 'wait';
    render();
    after(700, next);
  }
}

// REMI: ronde selesai hanya untuk pemain ini; pemain lain lanjut sampai ronde berakhir
function declareRemi(p) {
  p.remi = true;
  p.done = true;
  SND.play('remi');
  logEv(p.id, tr('log.remi'));
  const w = W(p.id, 0, 0);
  pop('REMI! +25', w.x, w.z);
  banner(tr('banner.remi', { name: p.name }));
  render();
  if (P.every(q => q.done)) return endRound(null, '');
  msg(tr('msg.remiWait', { name: p.name }));
  phase = 'wait';
  after(1500, next);
}

function next() {
  if (phase === 'over' || phase === 'init') return;
  if (P.every(q => q.done)) return endRound(null, '');
  do { cur = (cur + 1) % 4; } while (P[cur].done);
  phase = 'draw';

  if (!deck.length) {
    draw(P[cur]);
  } else {
    turn();
  }
}

// ================= AKHIR RONDE & ANIMASI SKOR =================
function endRound(w, kind) {
  phase = 'over';
  anim = true;
  revealCards = true;
  if (!w && !P.some(q => q.remi)) SND.play('drawGame'); // ronde berakhir tanpa pemenang (imbang)
  resetEatSelection();
  msg(tr('msg.roundOver'));
  
  render();

  const roundData = P.map(p => {
    let g = 0;
    if (p.melds) p.melds.forEach(m => m.forEach(c => (g += val(c))));
    let l = 0;
    if (p.hand) p.hand.forEach(c => (l += val(c)));
    l = Math.round(l * RULES.leftoverMult);
    g += (p.cv || 0);
    if (p.remi) g += 25;
    const minus = l + (p.pen || 0);
    const r = g - minus;
    const oldScore = p.score;
    p.score += r;
    return { player: p, g, minus, r, oldScore, newScore: p.score };
  });
  
  starter = ((w ? w.id : cur) + 1) % 4;
  const reached = P.filter(p => p.score >= TARGET);
  const top = reached.length ? Math.max(...reached.map(p => p.score)) : 0;
  const tops = reached.filter(p => p.score === top);
  const win = tops.length === 1 ? tops[0] : null;
  const tie = tops.length > 1;
  logEv(-1, kind == 'closed' ? tr('log.closedBy', { name: w.name }) : tr('log.noWinner'));
  if (win) logEv(-1, tr('log.win', { name: win.name, score: win.score }));
  after(1400, () => animateScoreModal(w, kind, roundData, win, tie ? top : 0));
}

function animateScoreModal(w, kind, data, win, tieScore) {
  const ov = $('ov');
  if (!ov) return;

  ov.style.display = 'block';
  const remiNames = P.filter(q => q.remi).map(q => esc(q.name)).join(', ');
  ov.innerHTML = `
    <b>${kind == 'closed' ? tr('score.closed', { name: esc(w.name) }) : tr('score.title')}</b>
    ${remiNames ? `<div class="sub">${tr('score.remiList', { names: remiNames })}</div>` : ''}
    <table id="scoreTable">
      <thead>
        <tr><td>${tr('score.player')}</td><td>${tr('score.meld')}</td><td>${tr('score.minus')}</td><td>${tr('score.round')}</td><td>${tr('score.total')}</td></tr>
      </thead>
      <tbody>
        ${data
          .map(
            d => `<tr id="row-${d.player.id}">
            <td>${esc(d.player.name)}</td>
            <td class="val-g">+0</td>
            <td class="val-m">-0</td>
            <td class="val-r"><b>0</b></td>
            <td class="val-t">${d.oldScore}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
    <div id="winContainer"></div>
  `;

  data.forEach((d, idx) => {
    after(idx * 300, () => {
      const tr = $(`row-${d.player.id}`);
      if (!tr) return;

      tr.querySelector('.val-g').textContent = '+' + d.g;
      tr.querySelector('.val-m').textContent = '-' + d.minus;
      tr.querySelector('.val-r').innerHTML = `<b>${d.r >= 0 ? '+' : ''}${d.r}</b>`;
      tr.querySelector('.val-r').style.color = d.r >= 0 ? '#81c784' : '#ef5350';

      const wPos = W(d.player.id, 0, 0);
      pop((d.r >= 0 ? '+' : '') + d.r, wPos.x, wPos.z, d.r < 0);

      let curr = d.oldScore;
      const target = d.newScore;
      const step = (target - curr) / 10;
      let count = 0;
      const timer = setInterval(() => {
        count++;
        curr += step;
        if (count >= 10) {
          curr = target;
          clearInterval(timer);
        }
        tr.querySelector('.val-t').textContent = Math.round(curr);
      }, 30);
    });
  });

  after(data.length * 300 + 600, () => {
    const wc = $('winContainer');
    if (wc) {
      if (win) SND.play('win');
      wc.innerHTML = win
        ? `<p><b>${tr('score.win', { name: esc(win.name), score: win.score })}</b></p><button id="nx">${tr('score.again')}</button>`
        : (tieScore ? `<p>${tr('score.tie', { score: tieScore })}</p>` : '') + `<button id="nx">${tr('score.next')}</button>`;
      
      const nx = $('nx');
      if (nx) {
        nx.onclick = () => {
          if (win) backToMenu();
          else newRound();
        };
      }
    }
  });
}

// ================= BOT =================
function layBotMelds(p) {
  const ms = chooseMelds(p.hand, hasMeld(p), p.level, botInfo(p));
  if (ms.length) layMelds(p, ms);
}

// Bot memakai aturan & pilihan yang sama dengan pemain: susun seri, makan dengan pendamping, tarik, buang
function bot() {
  if (phase === 'over' || phase === 'init') return;
  const p = P[cur];
  layBotMelds(p);
  if (!p.hand.length) return declareRemi(p);
  const opt = chooseEat(p.hand, hasMeld(p), pool, p.level);
  if (opt) {
    SND.play('eat');
    const taken = pool.splice(-opt.k);
    logEv(p.id, tr('log.eat', { k: opt.k, cards: taken.map(cs).join(' ') }));
    p.hand.push(...taken);
    layMelds(p, [opt.meld]);
    layBotMelds(p);
    gained(p);
  } else draw(p);
}

function botDisc() {
  if (phase === 'over' || phase === 'init') return;
  const p = P[cur];
  layBotMelds(p);
  if (!p.hand.length) return declareRemi(p);
  if (p.hand.length == 1 && canDisc(p, p.hand[0])) return discard(p, p.hand[0], true);
  discard(p, chooseDiscard(p.hand, hasMeld(p), p.level, botInfo(p)), false);
}

function botPluck() {
  if (phase === 'over' || phase === 'init') return;
  const p = P[cur];
  if (!p.hand.length) return;
  pluck(p, p.hand[(Math.random() * p.hand.length) | 0]);
}

// ================= 3D SCENE & RESPONSIVE TOP-DOWN CAMERA =================
const ren = new T.WebGLRenderer({ canvas: $('c'), antialias: true });
ren.shadowMap.enabled = true;
ren.shadowMap.type = T.PCFSoftShadowMap;

const scene = new T.Scene();
const cam = new T.PerspectiveCamera(50, 1, 0.1, 100);
const root = new T.Group();

scene.background = new T.Color(0x1a2634);
scene.add(root);

// --- LIGHTING ---
const ambientLight = new T.AmbientLight(0xffffff, 1.15);
scene.add(ambientLight);

const dirLight = new T.DirectionalLight(0xfff5ea, 0.65);
dirLight.position.set(10, 30, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 50;
dirLight.shadow.camera.left = -18;
dirLight.shadow.camera.right = 18;
dirLight.shadow.camera.top = 18;
dirLight.shadow.camera.bottom = -18;
scene.add(dirLight);

// --- MEJA POKER LOW POLY (prosedural, tanpa aset eksternal) ---
function rrShape(w, h, r) {
  const sh = new T.Shape(), x = -w / 2, y = -h / 2;
  sh.moveTo(x + r, y);
  sh.lineTo(x + w - r, y); sh.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  sh.lineTo(x + w, y + h - r); sh.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  sh.lineTo(x + r, y + h); sh.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  sh.lineTo(x, y + r); sh.absarc(x + r, y + r, r, Math.PI, 1.5 * Math.PI, false);
  return sh;
}
function ringShape(w1, h1, r1, w2, h2, r2) {
  const sh = rrShape(w1, h1, r1);
  sh.holes.push(new T.Path(rrShape(w2, h2, r2).getPoints(5)));
  return sh;
}
const tableGroup = new T.Group();
scene.add(tableGroup);
function slab(shape, y0, depth, color, o = {}) {
  const g = new T.ExtrudeGeometry(shape, { depth, curveSegments: 5, bevelEnabled: !!o.bevel, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 1 });
  const m = new T.Mesh(g, new T.MeshStandardMaterial({ color, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0, flatShading: true, emissive: o.emissive ?? 0x000000 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y0;
  m.receiveShadow = true;
  m.castShadow = !!o.cast;
  tableGroup.add(m);
  return m;
}
function radialTex(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new T.CanvasTexture(c);
  if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
  return t;
}
function chipStack(x, z, cols) {
  cols.forEach((col, k) => {
    const m = new T.Mesh(new T.CylinderGeometry(0.42, 0.42, 0.13, 8), new T.MeshStandardMaterial({ color: col, roughness: 0.6, flatShading: true }));
    m.position.set(x, 0.07 + k * 0.14, z);
    m.castShadow = true; m.receiveShadow = true;
    tableGroup.add(m);
    const stripe = new T.Mesh(new T.CylinderGeometry(0.43, 0.43, 0.04, 8), new T.MeshStandardMaterial({ color: 0xf5f0e6, flatShading: true }));
    stripe.position.set(x, 0.07 + k * 0.14, z);
    tableGroup.add(stripe);
  });
}
// hw = setengah lebar luar meja (termasuk rel). Tinggi meja tetap; lebar mengikuti layar.
function buildTable(hw) {
  tableGroup.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
  });
  tableGroup.clear();
  const W2 = 2 * hw;
  const floor = new T.Mesh(new T.CircleGeometry(90, 16), new T.MeshStandardMaterial({ color: 0x1b1411, roughness: 1, flatShading: true }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -3; floor.receiveShadow = true; tableGroup.add(floor);
  const shadow = new T.Mesh(new T.PlaneGeometry(W2 + 11, 28), new T.MeshBasicMaterial({ map: radialTex('rgba(0,0,0,.85)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -2.95; tableGroup.add(shadow);
  // badan kayu, rel kayu, bantalan kulit, kain felt (permukaan felt di y = -0.02)
  slab(rrShape(W2, 18.4, 7), -2.2, 1.7, 0x2e180a, { cast: true });
  slab(ringShape(W2, 18.4, 7, W2 - 1.8, 16.6, 6.1), -0.5, 0.78, 0x5a3318, { bevel: true, cast: true, rough: 0.55 });
  slab(ringShape(W2 - 1.8, 16.6, 6.1, W2 - 3.2, 15.2, 5.2), -0.5, 0.62, 0x3c1a1d, { bevel: true, rough: 0.7 });
  slab(rrShape(W2 - 3.2, 15.2, 5.2), -0.5, 0.48, 0x1b7550, { rough: 0.98 });
  slab(ringShape(W2 - 3.9, 14.5, 4.9, W2 - 4.05, 14.35, 4.8), -0.03, 0.014, 0xd9b44a, { emissive: 0x3a2c00, rough: 0.4, metal: 0.3 });
  const glow = new T.Mesh(new T.PlaneGeometry(W2 - 3.4, 15.4), new T.MeshBasicMaterial({ map: radialTex('rgba(255,244,205,.26)', 'rgba(255,244,205,0)'), transparent: true, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = -0.012; tableGroup.add(glow);
  const sets = [[0xc62828, 0xc62828, 0x1565c0], [0x212121, 0x2e7d32, 0x2e7d32], [0xf9a825, 0xc62828, 0xc62828], [0x1565c0, 0x1565c0, 0x212121]];
  const cx = hw - 2.5;
  [[-cx, -6.7], [cx, -6.7], [-cx, 6.7], [cx, 6.7]].forEach(([x, z], i) => { chipStack(x, z, sets[i]); chipStack(x + (x < 0 ? 0.95 : -0.95), z, sets[(i + 1) % 4].slice(0, 2)); });
}
const warmLight = new T.PointLight(0xffd9a0, 0.5, 120);
warmLight.position.set(0, 24, 0);
scene.add(warmLight);

// Lebar meja menyesuaikan lebar layar: kursi samping, tumpukan, dan label ikut bergeser
let HWt = 0;
function applyTableWidth(hw) {
  hw = Math.round(hw * 4) / 4;
  if (hw === HWt) return;
  HWt = hw;
  const sx = seatX(hw);
  DX = deckX(hw);
  seat[1][0] = sx; seat[3][0] = -sx;
  PK[1][0] = sx + 1.7; PK[3][0] = -(sx + 1.7);
  if (playerSprites.length === 4) {
    playerSprites[0].sprite.position.x = -(sx + 1.3);
    playerSprites[1].sprite.position.x = sx + 1.4;
    playerSprites[3].sprite.position.x = -(sx + 1.4);
  }
  buildTable(hw);
  dirLight.shadow.camera.left = -(hw + 5);
  dirLight.shadow.camera.right = hw + 5;
  dirLight.shadow.camera.updateProjectionMatrix();
  if (phase !== 'init') render();
}
scene.background = new T.Color(0x120e0c);

function fit() {
  const v = $('view');
  const r = v.getBoundingClientRect();
  const w = Math.max(200, Math.floor(r.width)), h = Math.max(150, Math.floor(r.height));
  const aspect = w / h;
  applyTableWidth(tableHalfW(aspect));
  const need = Math.max(8.9, (HWt + 0.7) / aspect); // setengah tinggi dunia yang harus terlihat (meja + rel)
  const H = need / Math.tan((cam.fov / 2) * Math.PI / 180);
  ren.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  ren.setSize(w, h, false);
  cam.aspect = aspect;
  cam.updateProjectionMatrix();
  cam.position.set(0, H, 0.1);
  cam.lookAt(0, 0, 0);
}
window.addEventListener('resize', fit);
if (window.ResizeObserver) new ResizeObserver(fit).observe($('view'));

// --- KARTU LOW POLY ---
const geo = new T.BoxGeometry(1.05, 1.45, 0.04);
const sideM = new T.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5, flatShading: true });
const tex = {};

// ---- gambar kartu buatan sendiri: public/cards/card_<suit>_<rank>.png (lihat CARDS.md) ----
const CARD_AUTOCROP = true; // true = margin transparan di sekitar gambar dipotong otomatis & rasio kartu 3D mengikuti gambar
let cardCrop = null; // {fx, fy, fw, fh, ratio}: area gambar yang terlihat (pecahan dari ukuran gambar)
let cardRatio = 1.05 / 1.45; // lebar/tinggi bidang kartu 3D saat ini
let CARD_WF = 1; // lebar kartu relatif terhadap bawaan (dipakai tata letak untuk jarak antar kartu)

// batas piksel yang cukup opaque (abaikan bayangan semi-transparan)
function alphaBounds(w, h, data, th = 200) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] >= th) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  return { fx: x0 / w, fy: y0 / h, fw: cw / w, fh: ch / h, ratio: cw / ch };
}
function measureCrop(img) {
  try {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    return alphaBounds(c.width, c.height, g.getImageData(0, 0, c.width, c.height).data);
  } catch (err) { return null; }
}
function setCardRatio(r) {
  if (Math.abs(r - cardRatio) / cardRatio > 0.02) {
    geo.scale(r / cardRatio, 1, 1); // semua kartu berbagi geometri ini
    cardRatio = r;
  }
  CARD_WF = (1.45 * cardRatio) / 1.05;
  if (phase !== 'init') render();
}

const CARD_BASE = ((import.meta.env && import.meta.env.BASE_URL) || './') + 'cards/';
const CARD_TINT = 0.88; // 1 = warna asli gambar; kecil = lebih gelap (cahaya meja membuat kartu tampak lebih terang)
const SUIT_N = ['spades', 'hearts', 'diamonds', 'clubs'];
const rankN = r => (r == 1 ? 'A' : r == 11 ? 'J' : r == 12 ? 'Q' : r == 13 ? 'K' : r < 10 ? '0' + r : '10');
const cardFile = c => (c ? `card_${SUIT_N[c.s]}_${rankN(c.r)}` : 'card_back');
function loadImg(url) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
}
// ekstensi dideteksi otomatis dari card_back.(png|webp|jpg|jpeg); jika tidak ada, kartu digambar bawaan
const cardExtP = (async () => {
  for (const e of ['png', 'webp', 'jpg', 'jpeg']) {
    try {
      const img = await loadImg(CARD_BASE + 'card_back.' + e);
      if (CARD_AUTOCROP) {
        const m = measureCrop(img);
        if (m && m.fw * m.fh < 0.98) { cardCrop = m; setCardRatio(m.ratio); }
      }
      return e;
    } catch (err) {}
  }
  return null;
})();
function applyCardImage(c, m) {
  cardExtP.then(ext => {
    if (!ext) return;
    loadImg(CARD_BASE + cardFile(c) + '.' + ext).then(img => {
      let src = img;
      if (cardCrop) {
        const sx = Math.round(cardCrop.fx * img.width), sy = Math.round(cardCrop.fy * img.height);
        const sw = Math.round(cardCrop.fw * img.width), sh = Math.round(cardCrop.fh * img.height);
        const cc = document.createElement('canvas');
        cc.width = sw; cc.height = sh;
        cc.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        src = cc;
      }
      const t = new T.Texture(src);
      t.needsUpdate = true;
      t.magFilter = T.NearestFilter; // pixel art tetap tajam
      t.minFilter = T.LinearFilter;
      t.generateMipmaps = false;
      if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
      if (m.map) m.map.dispose();
      m.map = t;
      m.alphaTest = 0.5; // sudut transparan pada gambar tidak digambar
      m.color.setScalar(CARD_TINT);
      m.needsUpdate = true;
    }).catch(() => console.warn('Gambar kartu tidak ditemukan:', cardFile(c)));
  });
}

function mat(c) {
  const k = c ? c.id : 'b';
  if (tex[k]) return tex[k];
  const e = document.createElement('canvas');
  e.width = 256;
  e.height = 360;
  const g = e.getContext('2d');

  if (!c) {
    g.fillStyle = '#1e3c72';
    g.fillRect(0, 0, 256, 360);
    g.strokeStyle = '#2a5298';
    g.lineWidth = 12;
    g.strokeRect(16, 16, 224, 328);

    g.fillStyle = '#2a5298';
    for (let y = 30; y < 330; y += 40) {
      for (let x = 30; x < 230; x += 40) {
        g.beginPath();
        g.moveTo(x + 20, y);
        g.lineTo(x + 40, y + 20);
        g.lineTo(x + 20, y + 40);
        g.lineTo(x, y + 20);
        g.fill();
      }
    }
  } else {
    g.fillStyle = '#fcfcfc';
    g.fillRect(0, 0, 256, 360);
    g.strokeStyle = '#e0e0e0';
    g.lineWidth = 6;
    g.strokeRect(10, 10, 236, 340);

    const color = c.s == 1 || c.s == 2 ? '#d32f2f' : '#212121';
    g.fillStyle = color;

    g.textAlign = 'left';
    g.font = 'bold 58px sans-serif';
    g.fillText(R[c.r], 20, 68);
    g.font = '50px sans-serif';
    g.fillText(S[c.s], 20, 125);

    g.textAlign = 'center';
    g.font = '120px sans-serif';
    g.fillText(S[c.s], 128, 225);
  }

  const t = new T.CanvasTexture(e);
  if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
  const m = new T.MeshStandardMaterial({
    map: t,
    roughness: 0.5,
    metalness: 0.0,
    flatShading: true
  });
  tex[k] = m;
  applyCardImage(c, m);
  return m;
}

let DX = DECK_X;
const seat = [
  [0, 5.0, 0],
  [7.2, 0, Math.PI / 2],
  [0, -5.0, Math.PI],
  [-7.2, 0, -Math.PI / 2]
];

// area kartu cabutan tiap pemain (x, z, langkah x, langkah z) - di luar area kartu tangan & seri
const PK = [[6.4, 4.9, 0.32, 0], [8.9, -2.6, 0, -0.3], [3.2, -6.3, 0.32, 0], [-8.9, 2.6, 0, 0.3]];

function W(i, lx, lz) {
  const [sx, sz, a] = seat[i];
  return {
    x: sx + lx * Math.cos(a) + lz * Math.sin(a),
    z: sz - lx * Math.sin(a) + lz * Math.cos(a),
    ry: a
  };
}

const pile = new T.Mesh(geo, [sideM, sideM, sideM, sideM, mat(null), mat(null)]);
pile.rotation.x = -Math.PI / 2;
pile.castShadow = true;
pile.receiveShadow = true;
pile.userData = { u: { t: 'deck' } };

// --- INDIKATOR 3D TUMPUKAN ---
const countCanvas = document.createElement('canvas');
countCanvas.width = 128;
countCanvas.height = 64;
const countCtx = countCanvas.getContext('2d');
const countTexture = new T.CanvasTexture(countCanvas);
if (T.SRGBColorSpace) countTexture.colorSpace = T.SRGBColorSpace;

const countSprite = new T.Sprite(
  new T.SpriteMaterial({ map: countTexture, transparent: true, depthTest: false })
);
countSprite.scale.set(1.6, 0.8, 1);
scene.add(countSprite);

function updateDeckCounter() {
  const count = deck.length;
  countCtx.clearRect(0, 0, 128, 64);
  if (count > 0 && phase !== 'init') {
    countCtx.fillStyle = count <= 5 ? 'rgba(229, 57, 53, 0.95)' : 'rgba(30, 40, 55, 0.95)';
    countCtx.beginPath();
    countCtx.roundRect(14, 8, 100, 48, 12);
    countCtx.fill();
    countCtx.strokeStyle = '#ffffff';
    countCtx.lineWidth = 4;
    countCtx.stroke();

    countCtx.fillStyle = '#ffffff';
    countCtx.font = 'bold 28px sans-serif';
    countCtx.textAlign = 'center';
    countCtx.textBaseline = 'middle';
    countCtx.fillText(count.toString(), 64, 32);

    countSprite.visible = true;
  } else {
    countSprite.visible = false;
  }
  countTexture.needsUpdate = true;
}

// --- INDIKATOR 3D PLAYER & BOT ---
const playerSprites = [];

function initPlayerSprites() {
  for (let i = 0; i < 4; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const texture = new T.CanvasTexture(canvas);
    if (T.SRGBColorSpace) texture.colorSpace = T.SRGBColorSpace;

    const sprite = new T.Sprite(
      new T.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
    );

    if (i === 0) {
      sprite.scale.set(3.0, 1.5, 1);
      sprite.position.set(-8.5, 1.2, 5.2); 
    } else {
      sprite.scale.set(2.7, 1.35, 1);
      const posOffset = [
        [0, 0, 0],
        [8.6, 1.2, 0],
        [0, 1.2, -6.6],
        [-8.6, 1.2, 0]
      ];
      sprite.position.set(...posOffset[i]);
    }

    scene.add(sprite);
    playerSprites.push({ sprite, canvas, ctx, texture });
  }
}
initPlayerSprites();

function updatePlayerSprites() {
  if (phase === 'init') { playerSprites.forEach(ps => (ps.sprite.visible = false)); return; }
  P.forEach((p, i) => {
    const ps = playerSprites[i], g = ps.ctx;
    const turn = i == cur && phase != 'over' && phase != 'deal';
    ps.sprite.visible = true;
    g.clearRect(0, 0, 256, 128);
    g.fillStyle = turn ? 'rgba(18,52,36,.96)' : 'rgba(14,26,22,.86)';
    g.beginPath(); g.roundRect(6, 8, 244, 112, 20); g.fill();
    g.strokeStyle = turn ? '#ffc83d' : 'rgba(255,255,255,.2)';
    g.lineWidth = turn ? 5 : 2; g.stroke();
    g.fillStyle = COL[i]; g.beginPath(); g.arc(48, 50, 28, 0, 7); g.fill();
    g.textBaseline = 'middle'; g.textAlign = 'center'; g.font = '30px sans-serif'; g.fillStyle = '#fff';
    if (p.avatarImg && p.avatarImg.complete && p.avatarImg.naturalWidth) { g.save(); g.beginPath(); g.arc(48, 50, 28, 0, 7); g.clip(); g.drawImage(p.avatarImg, 20, 22, 56, 56); g.restore(); }
    else g.fillText(p.avatar || AV[i], 48, 53);
    g.textAlign = 'left'; g.font = 'bold 24px sans-serif'; g.fillText(p.name, 88, 36);
    g.fillStyle = '#ffc83d'; g.font = 'bold 22px sans-serif'; g.fillText(p.score + ' pts', 88, 64);
    g.fillStyle = '#9bb3a6'; g.font = '17px sans-serif'; g.fillText('🃏 ' + p.hand.length + '    ✅ +' + getPlayerMeldScore(p), 24, 91);
    g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(24, 104, 208, 7);
    g.fillStyle = COL[i]; g.fillRect(24, 104, 208 * Math.max(0, Math.min(1, p.score / TARGET)), 7);
    ps.texture.needsUpdate = true;
  });
}

let cache = {};
const spawnHint = {}; // id kartu -> titik awal animasi (kartu lawan muncul dari kursinya)
let pileTop = 0.1;

function clearCards() {
  root.clear();
  cache = {};
  root.add(pile);
}

function mesh(c) {
  let m = cache[c.id];
  if (!m) {
    m = new T.Mesh(geo, [sideM, sideM, sideM, sideM, mat(c), mat(null)]);
    m.rotation.order = 'YXZ';
    const sh = spawnHint[c.id];
    m.position.set(sh ? sh.x : DX, pileTop, sh ? sh.z : 0);
    if (sh) delete spawnHint[c.id];
    m.rotation.x = Math.PI / 2;
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData = { zone: '', wait: 0, t: null };
    cache[c.id] = m;
    root.add(m);
  }
  return m;
}

function layout() {
  if (phase === 'init') {
    pile.visible = false;
    countSprite.visible = false;
    updatePlayerSprites();
    return;
  }

  const its = [];
  const mine = cur == 0 && phase == 'draw' && !anim;
  const SZv = SZ();
  const st = Math.min(12, pool.length);
  const hiK = new Set(cur == 0 && phase == 'draw' && !anim ? eatTargets(P[0].hand, hasMeld(P[0]), pool, selectedHandCards) : []);
  const PL = poolLayout(SZv, CARD_WF, st, DX, seat[1][0]); // pool dipadatkan agar tidak menabrak tumpukan & area bot
  const psp = PL.psp;

  pool.forEach((c, idx) => {
    const i = idx - (pool.length - st);
    const k = pool.length - idx;
    
    const isTarget = hiK.has(k);
    
    its.push({
      c,
      zone: 'pool',
      x: i < 0 ? PL.x0 : PL.x0 + i * psp,
      y: 0.02 + Math.max(i, 0) * 0.01 + (isTarget ? 0.45 : mine && k <= 7 ? 0.12 : 0) + (c === hoverPool ? 0.9 : 0),
      s: c === hoverPool ? SZv.pool * 1.25 : SZv.pool,
      z: isTarget ? 0.25 : 0,
      ry: 0,
      down: c.closed,
      glow: isTarget,
      u: { t: 'pool', k }
    });
  });

  P.forEach((p, i) => {
    if (!dealt) return;
    const n = p.hand.length;
    const pl = phase == 'pluck' && i == 0;
    const h = i ? p.hand : pl ? plk : [...p.hand].sort((a, b) => a.s - b.s || a.r - b.r);
    
    const sp = i ? (revealCards ? 0.7 : 0.45) * CARD_WF : handSpacing(n, CARD_WF, SZv);

    h.forEach((c, j) => {
      const hv = i == 0 && !pl && (c == hover || selectedHandCards.includes(c));
      const isSel = selectedHandCards.includes(c);
      const w = W(i, (j - (n - 1) / 2) * sp, hv ? -0.5 : 0);
      
      const isFaceDown = revealCards ? false : (i > 0 || pl);

      its.push({
        c,
        zone: 'h' + i,
        x: w.x,
        y: 0.05 + j * 0.01 + (isSel ? 0.6 : hv ? 0.3 : 0),
        z: w.z,
        ry: w.ry,
        down: isFaceDown,
        s: i ? 0.85 : SZv.hand,
        o: j * 4 + i,
        u: i ? {} : { t: pl ? 'pluck' : 'hand', c }
      });
    });

    // seri dirapatkan otomatis bila terlalu panjang
    const msz = { meld: i ? SZv.meld * BOT_MELD_K : SZv.meld }; // seri bot lebih kecil
    const avail = i % 2 ? 6.4 : 8.2;
    const tot = p.melds.reduce((acc, m) => acc + m.length * meldStep(CARD_WF, msz) + 0.75, -0.75);
    const f = tot > avail ? Math.max(avail / tot, 0.4) : 1;
    let x = -(tot * f) / 2;
    p.melds.forEach((m, mi) => {
      m.forEach((c, j) => {
        const w = W(i, x + j * meldStep(CARD_WF, msz) * f, i % 2 ? -1.9 : -2.1);
        its.push({ c, zone: 'm' + i + '_' + mi, x: w.x, y: 0.02 + j * 0.01, z: w.z, ry: w.ry, s: msz.meld, o: j, u: {} });
      });
      x += (m.length * meldStep(CARD_WF, msz) + 0.75) * f;
    });

    if (p.pluckedCards && p.pluckedCards.length) {
      const [bx, bz, dx, dz] = PK[i];
      p.pluckedCards.forEach((c, j) => {
        its.push({ c, zone: 'pk' + i, x: bx + j * dx * CARD_WF, y: 0.02 + j * 0.01, z: bz + j * dz * CARD_WF, ry: seat[i][2], down: true, s: 0.65, o: j, u: {} });
      });
    }
  });

  let stag = -0.07;
  const seen = {};
  its.forEach(it => {
    const m = mesh(it.c);
    const d = m.userData;
    seen[it.c.id] = 1;
    m.visible = true;
    if (d.zone !== it.zone) {
      d.zone = it.zone;
      d.wait = dealing && it.zone[0] == 'h' ? it.o * 0.1 : (stag += 0.07);
    }
    d.t = {
      x: it.x,
      y: it.y,
      z: it.z,
      ry: it.ry,
      rx: it.down ? Math.PI / 2 : -Math.PI / 2,
      s: it.s || 1
    };
    m.userData.u = it.u;
    const fm = m.material[4];
    if (fm && fm.emissive) fm.emissive.setHex(it.glow ? 0x7a5c00 : 0x000000);
  });

  for (const k in cache) {
    if (!seen[k]) {
      const d = cache[k].userData;
      if (d.zone !== 'deck') {
        d.zone = 'deck';
        d.wait = 0;
        d.t = { x: DX, y: pileTop, z: 0, ry: 0, rx: Math.PI / 2, s: 1 };
      }
    }
  }

  const h = Math.max(deck.length, 0) * 0.012 + 0.03;
  pile.scale.z = h / 0.03;
  pile.scale.x = pile.scale.y = SZv.pool;
  pile.position.set(DX, h / 2, 0);
  pile.visible = deck.length > 0;
  pileTop = h + 0.05;

  countSprite.position.set(DX, pileTop + 0.2, -(0.73 * SZv.pool + 0.5));
  updateDeckCounter();
  updatePlayerSprites();
}

const avatarHTML = i => (P[i].avatarImg ? `<img src="${P[i].avatarImg.src}" alt="">` : (P[i].avatar || AV[i]));
function hud() {
  const h = $('hud'), st = $('status');
  const show = phase !== 'init';
  h.style.visibility = st.style.visibility = show ? 'visible' : 'hidden';
  if (!show) return;
  const lead = Math.max(...P.map(p => p.score));
  h.innerHTML = P.map((p, i) => {
    const pct = Math.max(0, Math.min(100, (p.score / TARGET) * 100));
    const on = i == cur && phase != 'over' && phase != 'deal' && !p.done;
    return `<div class="pl${on ? ' on' : ''}${p.done ? ' done' : ''}" style="--c:${COL[i]}"><span class="av">${avatarHTML(i)}</span><div class="pi"><div class="pn"><span>${esc(p.name)}${p.score == lead && lead > 0 ? ' 👑' : ''}${ONLINE ? '<em class="tmr"></em>' : ''}</span><b>${p.score}</b></div><div class="bar"><i style="width:${pct}%"></i></div>${p.remi ? `<span class="rm">${tr('hud.remi')}</span>` : `<small>🃏 ${p.hand.length} · ✅ +${getPlayerMeldScore(p)}</small>`}</div></div>`;
  }).join('');
  st.innerHTML = `<span class="chip" title="Room ${TARGET} · ${LEVEL_NAMES[LEVEL]}">🎯 ${TARGET}</span><span class="chip">📚 ${deck.length}</span><span class="chip">🗑️ ${pool.length}</span><span class="chip ph">${PHI[phase] || ''} ${tr('ph.' + phase)}</span>`;
  const clEl = $('closeRoundBtn');
  if (clEl) clEl.style.display = cur == 0 && phase == 'discard' && P[0].hand.length == 1 && !anim ? 'block' : 'none';
  const inDraw = cur == 0 && !anim && phase == 'draw';
  const inDisc = cur == 0 && !anim && phase == 'discard';
  const mm = $('meldModeBtn'), dm = $('doMeldBtn'), cb = $('cancelEatBtn');
  if (mm) { mm.style.display = inDisc && P[0].hand.length >= 3 ? 'block' : 'none'; mm.textContent = tr(meldMode ? 'btn.meldCancel' : 'btn.meldMode'); }
  if (dm) dm.style.display = (inDraw || (inDisc && meldMode)) && canManualMeld(P[0], selectedHandCards) ? 'block' : 'none';
  if (cb) cb.style.display = (inDraw || (inDisc && meldMode)) && selectedHandCards.length ? 'block' : 'none';
}

function render() {
  layout();
  hud();
}

function msg(t) {
  const m = $('msg');
  if (m) {
    if (phase === 'init') {
      m.style.display = 'none';
      return;
    }
    m.style.display = 'block';
    m.textContent = t;
    m.classList.remove('flash');
    void m.offsetWidth;
    m.classList.add('flash');
  }
}

function pop(t, x, z, neg) {
  const v = new T.Vector3(x, 0.5, z).project(cam);
  const e = document.createElement('div');
  e.className = 'pop' + (neg ? ' neg' : '');
  e.textContent = t;
  const rc = $('c').getBoundingClientRect();
  e.style.left = rc.left + ((v.x + 1) / 2) * rc.width + 'px';
  e.style.top = rc.top + ((1 - v.y) / 2) * rc.height + 'px';
  document.body.appendChild(e);
  after(1500, () => e.remove());
}

function banner(t) {
  const e = document.createElement('div');
  e.className = 'banner';
  e.textContent = t;
  document.body.appendChild(e);
  after(1300, () => e.remove());
}

// Animasi kocok kartu Low Poly
const fx = [...Array(8)].map(() => {
  const m = new T.Mesh(geo, [sideM, sideM, sideM, sideM, mat(null), mat(null)]);
  m.rotation.order = 'YXZ';
  m.rotation.x = -Math.PI / 2;
  m.castShadow = true;
  m.visible = false;
  scene.add(m);
  return m;
});
let fxT = null;
let fxCb = null;

function shuffleFx(cb) {
  SND.play('shuffle');
  fxT = performance.now();
  fxCb = cb;
}

let last = performance.now();
function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  for (const k in cache) {
    const m = cache[k];
    const d = m.userData;
    const t = d.t;
    if (!t || !m.visible) continue;
    if (d.wait > 0) {
      d.wait -= dt;
      continue;
    }
    const e = 1 - Math.exp(-dt * 8);
    const p = m.position;
    const dx = t.x - p.x;
    const dz = t.z - p.z;
    const dist = Math.hypot(dx, dz);

    p.x += dx * e;
    p.z += dz * e;
    p.y += (t.y + Math.min(dist, 7) * 0.35 - p.y) * e;

    m.rotation.x += (t.rx - m.rotation.x) * e;
    m.rotation.y += Math.atan2(Math.sin(t.ry - m.rotation.y), Math.cos(t.ry - m.rotation.y)) * e;
    m.scale.setScalar(m.scale.x + (t.s - m.scale.x) * e);

    if (d.zone == 'deck' && dist < 0.1) m.visible = false;
  }

  if (fxT !== null) {
    const u = (now - fxT) / 1300;
    const on = u < 1;
    fx.forEach((m, i) => {
      m.visible = on;
      if (!on) return;
      const sd = i % 2 ? 1 : -1;
      const sp = Math.abs(Math.sin(u * Math.PI * 2));
      m.position.set(DX + sd * 1.5 * sp, 0.15 + (1 - sp) * i * 0.05 + sp * 0.2, (i % 3 - 1) * 0.05);
      m.scale.setScalar(SZ().pool);
      m.rotation.z = sd * 0.25 * sp;
      m.rotation.y = sd * 0.3 * sp;
    });
    if (!on) {
      fxT = null;
      const f = fxCb;
      fxCb = null;
      f && f();
    }
  }

  ren.render(scene, cam);
}

// ================= PILIH KARTU TANGAN: pendamping makan & susun seri manual =================
function toggleSel(c) {
  SND.play('click');
  const i = selectedHandCards.indexOf(c);
  if (i > -1) selectedHandCards.splice(i, 1);
  else selectedHandCards.push(c);
  const p = P[0];
  const ok = canManualMeld(p, selectedHandCards);
  const tg = phase == 'draw' ? eatTargets(p.hand, hasMeld(p), pool, selectedHandCards) : [];
  if (tg.length) msg(tr('msg.eatHint') + (ok ? tr('msg.orMeld') : ''));
  else if (ok) msg(tr('msg.meldOk'));
  else msg(selectedHandCards.length
    ? tr('msg.selCount', { n: selectedHandCards.length })
    : phase == 'draw' ? tr('msg.idleDraw') : tr('msg.discard'));
  render();
}

function layManual(p) {
  if (ONLINE) {
    if (!canManualMeld(p, selectedHandCards)) return;
    const cards = selectedHandCards.map(c => c.id);
    resetEatSelection();
    return onlineSend({ type: 'meld', cards });
  }
  const sel = [...selectedHandCards];
  if (!canManualMeld(p, sel)) return;
  const wasDiscard = phase === 'discard';
  resetEatSelection();
  layMelds(p, melds(sel, hasMeld(p)));
  render();
  if (!p.hand.length) return declareRemi(p);
  msg(tr(wasDiscard ? 'msg.meldDoneDiscard' : 'msg.meldDoneDraw'));
}

// ================= INPUT & CONTROLS =================
const ray = new T.Raycaster();
const mv = new T.Vector2();

function pick(e) {
  const rc = $('c').getBoundingClientRect();
  mv.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
  ray.setFromCamera(mv, cam);
  const h = ray.intersectObjects(root.children, true).find(x => x.object.visible && x.object.userData.u && x.object.userData.u.t);
  return h && h.object.userData.u;
}

const cEl = $('c');
if (cEl) {
  cEl.addEventListener('pointermove', e => {
    if (phase === 'init' || phase === 'over') return;
    const u = pick(e);
    const canAct = cur == 0 && !anim;
    const h = canAct && u && u.t == 'hand' ? u.c : null;
    const hp = u && u.t == 'pool' ? pool[pool.length - u.k] || null : null;
    cEl.style.cursor = u && (canAct || u.t == 'pool') ? 'pointer' : 'default';
    if (h !== hover || hp !== hoverPool) {
      hover = h;
      hoverPool = hp;
      layout();
    }
  });
  cEl.addEventListener('pointerleave', () => {
    if (hover || hoverPool) { hover = null; hoverPool = null; layout(); }
  });

  cEl.addEventListener('pointerdown', e => {
    if (cur != 0 || phase == 'over' || anim || phase === 'init') return;
    const u = pick(e);
    const p = P[0];
    if (!u) return;

    if (phase == 'draw') {
      if (u.t == 'deck') {
        resetEatSelection();
        draw(p);
      } else if (u.t == 'hand') {
        toggleSel(u.c);
      } else if (u.t == 'pool') {
        if (!selectedHandCards.length) return msg(tr('msg.pickFirst'));
        if (u.k > 7) return msg(tr('msg.max7'));
        if (!eatMeld(p.hand, hasMeld(p), pool, u.k, selectedHandCards)) return msg(tr('msg.noMatch'));
        eatManual(p, u.k);
      }
    } else if (phase == 'discard' && u.t == 'hand') {
      if (meldMode) toggleSel(u.c);
      else if (canDisc(p, u.c)) discard(p, u.c, false);
      else msg(tr('msg.aceNo'));
    } else if (phase == 'pluck' && u.t == 'pluck') {
      pluck(p, u.c);
    }
  });
}

// ================= UI BUTTONS, MODALS & DIALOGS =================

// Modal Dialog Konfirmasi Seri (Meld Option Prompt)
let meldPromptModal = $('meldPromptModal');
if (!meldPromptModal) {
  meldPromptModal = document.createElement('div');
  meldPromptModal.id = 'meldPromptModal';
  meldPromptModal.className = 'modal';
  meldPromptModal.innerHTML = `
    <div>
      <h3 data-i18n="meld.title"></h3>
      <p id="meldPromptText"></p>
      
      <div>
        <button id="meldYesBtn" data-i18n="meld.yes"></button>
        <button id="meldNoBtn" data-i18n="meld.no"></button>
      </div>
    </div>
  `;
  document.body.appendChild(meldPromptModal);
}

function promptMeldOption(p, text, onYes, onNo) {
  const modal = $('meldPromptModal');
  const txt = $('meldPromptText');
  txt.textContent = text;
  modal.style.display = 'flex';

  $('meldYesBtn').onclick = () => {
    modal.style.display = 'none';
    onYes && onYes();
  };

  $('meldNoBtn').onclick = () => {
    modal.style.display = 'none';
    onNo && onNo();
  };
}

// 1. Start Menu Modal Overlay
let startMenuModal = $('startMenuModal');
if (!startMenuModal) {
  startMenuModal = document.createElement('div');
  startMenuModal.id = 'startMenuModal';
  startMenuModal.className = 'modal';
  startMenuModal.innerHTML = `
    <div>
      <h1>♠ IMPOSSIBLE REMI ♣</h1>
      <p data-i18n="menu.sub"></p>
      <div class="opt"><span data-i18n="menu.room"></span><div class="seg" id="roomSeg"><button data-v="300">300</button><button data-v="500">500</button><button data-v="1000">1000</button></div></div>
      <div class="opt"><span data-i18n="menu.level"></span><div class="seg" id="levelSeg"><button data-v="easy">Easy</button><button data-v="medium">Medium</button><button data-v="hard">Hard</button></div></div>
      
      <button id="startGameBtn" data-i18n="menu.play"></button>
      <button id="menuHelpBtn" data-i18n="menu.help"></button>
    </div>
  `;
  document.body.appendChild(startMenuModal);
}

// 2. Tombol CLOSED (TUTUP RONDE SAAT SISA 1 KARTU)
let closeRoundBtn = $('closeRoundBtn');
if (!closeRoundBtn) {
  closeRoundBtn = document.createElement('button');
  closeRoundBtn.id = 'closeRoundBtn';
  closeRoundBtn.textContent = '🔒 TUTUP (CLOSED)';
  closeRoundBtn.style.cssText = 'position:absolute;bottom:140px;left:50%;transform:translateX(-50%);padding:14px 28px;font-weight:bold;background:#d32f2f;color:white;border:2px solid #ef5350;border-radius:10px;box-shadow:0 6px 0 #9a0007;cursor:pointer;display:none;z-index:20;font-size:16px;animation:pulse 1.5s infinite;';
  document.body.appendChild(closeRoundBtn);
}
closeRoundBtn.onclick = () => {
  if (cur == 0 && phase == 'discard' && P[0].hand.length == 1 && !anim) {
    discard(P[0], P[0].hand[0], true);
  }
};

// 4. Tombol BATAL MAKAN
let cancelEatBtn = $('cancelEatBtn');
if (!cancelEatBtn) {
  cancelEatBtn = document.createElement('button');
  cancelEatBtn.id = 'cancelEatBtn';
  cancelEatBtn.textContent = 'BATAL';
  cancelEatBtn.style.cssText = 'position:absolute;bottom:85px;left:50%;transform:translateX(10%);padding:14px 28px;font-weight:bold;background:#616161;color:white;border:2px solid #e0e0e0;border-radius:8px;box-shadow:0 6px 0 #424242;cursor:pointer;display:none;z-index:10;font-size:15px;';
  document.body.appendChild(cancelEatBtn);
}
cancelEatBtn.onclick = () => {
  resetEatSelection();
  render();
  msg(tr('msg.cancelSel'));
};

// 5. Tombol HOW TO PLAY (Pojok Kanan Atas saat bermain)
let helpBtn = $('helpBtn');
if (!helpBtn) {
  helpBtn = document.createElement('button');
  helpBtn.id = 'helpBtn';
  helpBtn.innerHTML = '❓ How to Play';
  helpBtn.style.cssText = 'position:absolute;top:20px;right:20px;padding:10px 18px;font-weight:bold;background:rgba(30,40,55,0.9);color:#ffca28;border:2px solid #ffca28;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.4);cursor:pointer;z-index:100;font-size:14px;backdrop-filter:blur(6px);transition:all 0.2s;';
  document.body.appendChild(helpBtn);
}

// Modal Pop-Up How to Play
let helpModal = $('helpModal');
if (!helpModal) {
  helpModal = document.createElement('div');
  helpModal.id = 'helpModal';
  helpModal.className = 'modal';
  helpModal.innerHTML = `<div><button id="closeHelp">✕</button><h2 data-i18n="help.title"></h2><div data-i18n="help.body"></div><button id="gotItBtn" data-i18n="help.gotIt"></button></div>`;
  document.body.appendChild(helpModal);
}

// Event Listeners Start Menu & Help Modal
const OPT = (() => { try { return JSON.parse(localStorage.getItem('remiOpts') || '{}'); } catch (e) { return {}; } })();
if ([300, 500, 1000].includes(OPT.target)) TARGET = OPT.target;
if (['easy', 'medium', 'hard'].includes(OPT.level)) LEVEL = OPT.level;
const saveOpts = () => { try { localStorage.setItem('remiOpts', JSON.stringify({ target: TARGET, level: LEVEL })); } catch (e) {} };
function bindSeg(id, curVal, onPick) {
  const seg = $(id);
  seg.querySelectorAll('button').forEach(b => {
    b.classList.toggle('sel', b.dataset.v == String(curVal));
    b.onclick = () => {
      seg.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b));
      onPick(b.dataset.v);
      saveOpts();
      SND.play('click');
    };
  });
}
bindSeg('roomSeg', TARGET, v => (TARGET = +v));
bindSeg('levelSeg', LEVEL, v => (LEVEL = v));

// ---- profil pemain: nama & avatar (emoji atau foto unggahan) ----
const AVATARS = ['🧑', '👩', '👨', '🧔', '👵', '🤠', '🥷', '🦸', '🧙', '🤖', '👽', '🐱'];
const PROF = (() => { try { return JSON.parse(localStorage.getItem('remiProfile') || '{}'); } catch (e) { return {}; } })();
let profName = typeof PROF.name == 'string' ? PROF.name : '';
let profAv = Number.isInteger(PROF.av) && PROF.av >= 0 && PROF.av < AVATARS.length ? PROF.av : 0;
let profImg = typeof PROF.img == 'string' && PROF.img.startsWith('data:image/') ? PROF.img : null;

let profileModal = $('profileModal');
if (!profileModal) {
  profileModal = document.createElement('div');
  profileModal.id = 'profileModal';
  profileModal.className = 'modal';
  profileModal.innerHTML = `
    <div>
      <h2 data-i18n="prof.title"></h2>
      <div class="opt"><span data-i18n="prof.name"></span><input id="nameInput" maxlength="14" data-i18n-ph="prof.namePh" autocomplete="off"></div>
      <div class="opt"><span data-i18n="prof.avatar"></span><div id="avGrid"></div>
        <div class="avrow"><div id="avPrev" class="avprev"></div><button id="avUpBtn" data-i18n="prof.upload"></button><input type="file" id="avFile" accept="image/*" hidden></div>
      </div>
      <button id="profStartBtn" data-i18n="prof.start"></button>
      <button id="profBackBtn" data-i18n="prof.back"></button>
    </div>`;
  document.body.appendChild(profileModal);
}
function refreshAvatarUI() {
  $('avPrev').innerHTML = profImg ? `<img src="${profImg}" alt="">` : AVATARS[profAv];
  $('avGrid').querySelectorAll('button').forEach((b, i) => b.classList.toggle('sel', !profImg && i === profAv));
}
AVATARS.forEach((a, i) => {
  const b = document.createElement('button');
  b.textContent = a;
  b.onclick = () => { profAv = i; profImg = null; refreshAvatarUI(); SND.play('click'); };
  $('avGrid').appendChild(b);
});
$('avUpBtn').onclick = () => $('avFile').click();
$('avFile').onchange = e => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      const sq = Math.min(im.width, im.height);
      c.getContext('2d').drawImage(im, (im.width - sq) / 2, (im.height - sq) / 2, sq, sq, 0, 0, 96, 96);
      profImg = c.toDataURL('image/jpeg', 0.85);
      refreshAvatarUI();
    };
    im.src = rd.result;
  };
  rd.readAsDataURL(f);
};
function applyProfile() {
  P[0].name = profName || tr('prof.defaultName');
  P[0].avatar = AVATARS[profAv];
  if (profImg) {
    const im = new Image();
    im.onload = () => { if (phase !== 'init') render(); };
    im.src = profImg;
    P[0].avatarImg = im;
  } else P[0].avatarImg = null;
}
function startGame() {
  SND.init();
  P.forEach(p => { p.score = 0; if (p.id) p.level = LEVEL; });
  roundNo = 0;
  newRound();
}
$('startGameBtn').onclick = () => {
  SND.init();
  $('nameInput').value = profName;
  refreshAvatarUI();
  startMenuModal.style.display = 'none';
  profileModal.style.display = 'flex';
  setTimeout(() => $('nameInput').focus(), 50);
};
$('profBackBtn').onclick = () => { profileModal.style.display = 'none'; startMenuModal.style.display = 'flex'; };
$('profStartBtn').onclick = () => {
  profName = ($('nameInput').value || '').trim().slice(0, 14);
  try { localStorage.setItem('remiProfile', JSON.stringify({ name: profName, av: profAv, img: profImg })); } catch (e) {}
  applyProfile();
  profileModal.style.display = 'none';
  startGame();
};
$('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('profStartBtn').click(); });

$('menuHelpBtn').onclick = () => {
  helpModal.style.display = 'flex';
};

helpBtn.onclick = () => { 
  helpModal.style.display = 'flex'; 
};

$('closeHelp').onclick = () => { helpModal.style.display = 'none'; };
$('gotItBtn').onclick = () => { helpModal.style.display = 'none'; };

helpModal.onclick = e => {
  if (e.target === helpModal) helpModal.style.display = 'none';
};

$('meldModeBtn').onclick = () => {
  if (cur != 0 || anim || !(phase == 'draw' || phase == 'discard')) return;
  const was = meldMode;
  resetEatSelection();
  if (was) {
    msg(phase == 'draw' ? tr('msg.idleDraw') : tr('msg.discard'));
  } else {
    meldMode = true;
    msg(tr('msg.meldMode'));
  }
  render();
};
$('doMeldBtn').onclick = () => layManual(P[0]);

// ================= MODE ONLINE: tampilan digerakkan oleh data dari server =================
const cardCanon = new Map(); // id -> objek kartu tetap (hover & seleksi memakai identitas objek)
const canon = c => { let o = cardCanon.get(c.id); if (!o) { o = { ...c }; cardCanon.set(c.id, o); } else Object.assign(o, c); return o; };
const hintFor = loc => { const w = W(loc, 0, 0); return { x: w.x, z: w.z }; };
const isPlayPhase = ph => ph === 'draw' || ph === 'discard' || ph === 'pluck';

function onlineStart(p, api) {
  ONLINE = { api, code: p.code, round: 0, offset: 0, view: null, avatars: {} };
  anim = false; dealt = false; dealing = false; revealCards = false; hover = null; hoverPool = null;
  resetEatSelection(); clearCards(); cardCanon.clear();
  P.forEach(q => { q.hand = []; q.melds = []; q.pluckedCards = []; q.done = false; q.remi = false; q.score = 0; });
  ['startMenuModal', 'profileModal'].forEach(id => { const m = $(id); if (m) m.style.display = 'none'; });
  $('ov').style.display = 'none';
  $('leaveBtn').style.display = '';
  const lg = $('logList'); if (lg) lg.innerHTML = '';
  phase = 'deal';
}
function onlineStop() {
  ONLINE = null;
  $('leaveBtn').style.display = 'none';
  backToMenu();
  P.forEach((q, i) => { if (i) { q.name = 'Bot ' + i; q.avatar = null; q.avatarImg = null; } });
  applyProfile();
  $('startMenuModal').style.display = 'none'; // lobi online menampilkan layarnya sendiri
}
function onlineMsg(v) {
  const me = v.seats[v.you];
  if (me.done) return msg(tr('msg.remiWait', { name: me.name }));
  if (v.cur === v.you) return msg(phase === 'draw' ? tr('msg.yourTurn') : phase === 'discard' ? tr('msg.discard') + (P[0].hand.length === 1 ? tr('msg.discardClose') : '') : tr('msg.pluck'));
  msg(tr('online.waiting', { name: v.seats[v.cur].name }));
}
function onlineApply(p) {
  if (!ONLINE || !p.view) return;
  const v = p.view, m = mapView(v);
  const wasMine = !!ONLINE.view && ONLINE.view.cur === ONLINE.view.you && isPlayPhase(ONLINE.view.phase);
  ONLINE.offset = v.serverNow - Date.now();
  const newRound = v.round !== ONLINE.round;
  ONLINE.round = v.round; ONLINE.view = v;
  TARGET = v.target; roundNo = v.round;
  deck = m.deck.map(canon); pool = m.pool.map(canon); plk = m.plk.map(canon);
  phase = m.phase; cur = m.cur; revealCards = m.reveal; dealt = true;
  m.players.forEach((pl, i) => {
    const q = P[i];
    q.name = pl.name; q.score = pl.score; q.done = pl.done; q.remi = pl.remi;
    q.hand = pl.hand.map(canon); q.melds = pl.melds.map(mm => mm.map(canon)); q.pluckedCards = pl.plucked.map(canon);
    q.avatar = typeof pl.avatar === 'number' ? AVATARS[pl.avatar] : null;
    q.avatarImg = null;
    if (pl.avatar === 'img' && pl.uid) {
      if (ONLINE.avatars[pl.uid] === undefined) {
        ONLINE.avatars[pl.uid] = null;
        ONLINE.api.avatar(pl.uid).then(src => { if (!src || !ONLINE) return; const im = new Image(); im.onload = () => { ONLINE.avatars[pl.uid] = im; if (ONLINE) render(); }; im.src = src; });
      }
      q.avatarImg = ONLINE.avatars[pl.uid] || null;
    }
  });
  selectedHandCards = selectedHandCards.filter(c => P[0].hand.includes(c));
  if (phase !== 'draw' && phase !== 'discard') meldMode = false;
  if (newRound) { dealing = true; selectedHandCards = []; meldMode = false; }
  const info = { you: v.you, names: v.seats.map(s => s.name), target: v.target };
  for (const e of p.events || []) { // suara, log, skor melayang, banner, dan titik awal animasi
    const ui = eventToUi(e, info);
    if (!ui) continue;
    if (ui.spawn && ui.spawn.loc !== 0) spawnHint[ui.spawn.id] = hintFor(ui.spawn.loc);
    if (ui.sound) SND.play(ui.sound);
    if (ui.log) logEv(ui.log.sys ? -1 : ui.log.loc, tr(ui.log.key, ui.log.vars));
    if (ui.pop) { const w = W(ui.pop.loc, 0, 0); pop(ui.pop.text, w.x, w.z, ui.pop.neg ? 1 : 0); }
    if (ui.banner) banner(tr(ui.banner.key, ui.banner.vars));
  }
  render();
  dealing = false;
  if (v.phase === 'between' || v.phase === 'gameover') showOnlineResult(v);
  else { hideOnlineResult(); onlineMsg(v); }
  if (cur === 0 && isPlayPhase(phase) && !wasMine) SND.play('turn');
  const drawn = (p.events || []).find(e => e.type === 'draw' && e.seat === v.you && e.own);
  if (drawn && phase === 'discard' && cur === 0) { // kartu tarikan bisa membentuk seri: tawarkan menurunkannya
    const card = canon(drawn.own.card);
    const mm = melds(P[0].hand, hasMeld(P[0])).find(x => x.includes(card));
    if (mm) promptMeldOption(P[0], tr('meld.drawn', { card: cs(card) }), () => onlineSend({ type: 'meld', cards: mm.map(c => c.id) }), null);
  }
}
function showOnlineResult(v) {
  const res = v.result, ov = $('ov');
  if (!res) return;
  const me = v.seats[v.you], over = v.phase === 'gameover';
  const rows = res.rows.map(r => `<tr><td>${esc(v.seats[r.seat].name)}${r.remi ? ' ✓' : ''}</td><td class="val-g">+${r.gain}</td><td class="val-m">-${r.minus}</td><td><b>${r.round >= 0 ? '+' : ''}${r.round}</b></td><td class="val-t">${r.total}</td></tr>`).join('');
  const remis = res.rows.filter(r => r.remi).map(r => esc(v.seats[r.seat].name)).join(', ');
  const title = res.kind === 'closed' ? tr('score.closed', { name: esc(v.seats[res.closer].name) }) : tr('score.title');
  const foot = over
    ? `<p><b>${tr('score.win', { name: esc(v.seats[v.winner].name), score: v.seats[v.winner].score })}</b></p><button id="onBack">${tr('online.back')}</button>`
    : (v.tie ? `<p>${tr('score.tie', { score: Math.max(...v.seats.map(s => s.score)) })}</p>` : '') + (me.ready ? '' : `<button id="onReady">${tr('online.ready')}</button>`) + '<div class="tm" id="onTimer"></div>';
  ov.innerHTML = `<b>${title}</b>${remis ? `<div class="sub">${tr('score.remiList', { names: remis })}</div>` : ''}<table><thead><tr><td>${tr('score.player')}</td><td>${tr('score.meld')}</td><td>${tr('score.minus')}</td><td>${tr('score.round')}</td><td>${tr('score.total')}</td></tr></thead><tbody>${rows}</tbody></table>${foot}`;
  ov.style.display = 'block';
  const b = $('onBack'); if (b) b.onclick = () => ONLINE && ONLINE.api.leave(false);
  const r = $('onReady'); if (r) r.onclick = () => onlineSend({ type: 'ready' });
  msg(tr('msg.roundOver'));
}
function hideOnlineResult() { const ov = $('ov'); if (ov && ONLINE) ov.style.display = 'none'; }
async function onlineSend(action) {
  if (!ONLINE || anim) return; // anim = menunggu jawaban server (mencegah klik ganda)
  anim = true; render();
  try {
    const r = await ONLINE.api.send(action);
    if (r && r.ok === false) { const k = 'online.err.' + r.error, t = tr(k); msg(t === k ? tr('online.err.generic') : t); }
  } catch (e) { msg(tr('online.reconnecting')); }
  finally { anim = false; if (ONLINE) render(); }
}
setInterval(() => { // hitung mundur batas waktu giliran / jeda antar ronde
  if (!ONLINE || !ONLINE.view) return;
  const v = ONLINE.view;
  document.querySelectorAll('.tmr').forEach(el => { el.textContent = ''; });
  if (!v.deadline) return;
  const rem = Math.max(0, Math.ceil((v.deadline - (Date.now() + ONLINE.offset)) / 1000));
  if (v.phase === 'between') { const el = $('onTimer'); if (el) el.textContent = tr('online.readyWait', { s: rem }); }
  else if (isPlayPhase(v.phase)) { const t = document.querySelector('.pl.on .tmr'); if (t) t.textContent = '⏱ ' + rem; }
}, 250);
$('leaveBtn').onclick = () => { if (ONLINE) ONLINE.api.leave(true); };

// ---- ukuran kartu (S / M / L) ----
function updateSizeBtn() { $('sizeBtn').textContent = '🔍 ' + SZ().name; }
$('sizeBtn').onclick = () => {
  sizeIdx = (sizeIdx + 1) % CARD_SIZES.length;
  try { localStorage.setItem('remiCardSize', String(sizeIdx)); } catch (e) {}
  updateSizeBtn();
  if (phase !== 'init') render();
  SND.play('click');
};

// ---- bahasa (ID / EN) ----
function updateLangBtn() { $('langBtn').textContent = '🌐 ' + getLang().toUpperCase(); }
$('langBtn').onclick = () => {
  setLang(getLang() === 'id' ? 'en' : 'id');
  applyI18n();
  updateLangBtn();
  hud();
  if (phase !== 'init') render();
  SND.play('click');
};

// ---- kontrol audio ----
function syncAudioUI() {
  const a = SND.getState();
  $('musicBtn').classList.toggle('off', !a.music);
  $('sfxBtn').classList.toggle('off', !a.sfx);
  $('sfxBtn').textContent = a.sfx ? '🔊' : '🔇';
}
$('musicBtn').onclick = () => { SND.init(); SND.setMusic(!SND.getState().music); syncAudioUI(); };
$('sfxBtn').onclick = () => { SND.init(); SND.setSfx(!SND.getState().sfx); syncAudioUI(); SND.play('click'); };
['pointerdown', 'click', 'touchend', 'keydown'].forEach(ev => window.addEventListener(ev, () => SND.init()));
document.addEventListener('visibilitychange', () => SND.setHidden(document.hidden));
syncAudioUI();

// ---- log aksi ----
function logEv(i, text) {
  const l = $('logList');
  if (!l) return;
  const d = document.createElement('div');
  d.className = 'le' + (i < 0 ? ' sys' : '');
  d.style.setProperty('--c', i < 0 ? '#9bb3a6' : COL[i]);
  if (i < 0) d.textContent = text;
  else {
    const b = document.createElement('b');
    b.textContent = P[i].name;
    d.appendChild(b);
    d.appendChild(document.createTextNode(' ' + text));
  }
  l.appendChild(d);
  while (l.children.length > 80) l.removeChild(l.firstChild);
  l.scrollTop = l.scrollHeight;
}
$('logBtn').onclick = () => $('log').classList.toggle('open');
if (window.innerWidth >= 1280) $('log').classList.add('open');

// ================= INITIALIZATION =================
P = ['Anda', 'Bot 1', 'Bot 2', 'Bot 3'].map((n, i) => ({
  id: i,
  name: n,
  score: 0,
  hand: [],
  melds: [],
  pluckedCards: [],
  pen: 0,
  cv: 0,
  done: false,
  remi: false,
  avatar: null,
  avatarImg: null,
  level: i ? LEVEL : null
}));
applyProfile();

starter = (Math.random() * 4) | 0;
initOnline({ startOnline: onlineStart, applyOnline: onlineApply, stopOnline: onlineStop, avatars: AVATARS, sound: n => SND.play(n) });
applyI18n();
updateLangBtn();
updateSizeBtn();
fit();
clearCards();
requestAnimationFrame(tick);
render();