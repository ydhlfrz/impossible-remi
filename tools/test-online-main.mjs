// Menguji logika sambungan online di main.js: fungsi aslinya diekstrak dari sumber lalu dijalankan dengan pengganti (stub) DOM/3D.
import fs from 'fs';
import { mapView, eventToUi } from '../src/viewmap.js';
import { melds } from '../src/rules.js';
import { createGame, begin, act, viewFor, cardId, _test } from '../src/engine.js';
const src = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
let n = 0, bad = 0;
const ok = (name, got, want = true) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log('GAGAL:', name, '| dapat', JSON.stringify(got), '| harusnya', JSON.stringify(want)); } };
function fnSrc(name) {
  let i = src.indexOf('function ' + name + '('); if (i < 0) throw new Error('fungsi tidak ada: ' + name);
  if (src.slice(i - 6, i) === 'async ') i -= 6;
  let d = 0, k = src.indexOf('{', i);
  for (;; k++) { if (src[k] === '{') d++; if (src[k] === '}' && --d === 0) break; }
  return src.slice(i, k + 1);
}
const constSrc = n2 => src.match(new RegExp('^const ' + n2 + ' = .*$', 'm'))[0];
const C = (s, r) => ({ s, r, id: cardId(s, r) });
const cfg = [0, 1, 2, 3].map(i => ({ uid: 'u' + i, name: 'P' + i, avatar: i }));
const mkGame = (seed = 5) => { const st = createGame({ seats: cfg, seed }); st.starter = 0; begin(st, 1000); return st; };

const make = () => new Function('mapView', 'eventToUi', 'melds', `
  let phase='init', cur=0, deck=[], pool=[], plk=[], TARGET=0, roundNo=0, revealCards=false, dealt=false, dealing=false, selectedHandCards=[], meldMode=false, anim=false, hover=null, hoverPool=null, ONLINE=null;
  const P=[0,1,2,3].map(()=>({name:'',hand:[],melds:[],pluckedCards:[],score:0,done:false,remi:false,avatar:null,avatarImg:null}));
  const AVATARS=['a0','a1','a2','a3','a4','a5','a6','a7','a8','a9','a10','a11'];
  const rec={snd:[],log:[],pop:[],ban:[],msgs:[],anims:[],dealingAt:[],prompts:[],results:0,hidden:0};
  const spawnHint={}, cardCanon=new Map();
  const SND={play:n=>rec.snd.push(n)}, KNOWN=new Set(['online.err.invalid_eat','online.err.generic']), tr=(k,v)=>(KNOWN.has(k)?'«'+k+'»':k)+(v?JSON.stringify(v):'');
  const $=id=>({style:{},innerHTML:''});
  function logEv(i,t){rec.log.push([i,t])} function pop(t){rec.pop.push(t)} function banner(t){rec.ban.push(t)} function msg(t){rec.msgs.push(t)}
  function render(){rec.anims.push(anim);rec.dealingAt.push(dealing)} const W=l=>({x:l*10,z:l*10}), hasMeld=p=>p.melds.length>0, cs=c=>'c'+c.id;
  function promptMeldOption(p,text,yes,no){rec.prompts.push({text,yes})} function showOnlineResult(){rec.results++} function hideOnlineResult(){rec.hidden++}
  function resetEatSelection(){selectedHandCards=[];meldMode=false} function clearCards(){} function backToMenu(){} function applyProfile(){}
  ${['canon', 'hintFor', 'isPlayPhase'].map(constSrc).join('\n')}
  ${['onlineStart', 'onlineMsg', 'onlineApply', 'onlineSend'].map(fnSrc).join('\n')}
  return { P, rec, spawnHint, st: () => ({ phase, cur, deck, pool, plk, TARGET, roundNo, revealCards, dealt, dealing, anim, ONLINE, selectedHandCards, meldMode }),
    setSel: v => { selectedHandCards = v; }, onlineStart, onlineApply, onlineSend };
`)(mapView, eventToUi, melds);

const fakeApi = (reply) => { const calls = []; return { calls, send: async a => { calls.push(a); return typeof reply === 'function' ? reply(a) : reply; }, avatar: async () => null, leave() {} }; };

// ---------- 1. pemetaan keadaan ----------
{ const st = mkGame(), g = make(), api = fakeApi({ ok: true });
  g.onlineStart({ code: 'ABC' }, api);
  ok('mulai online: fase "deal", ONLINE terisi', [g.st().phase, g.st().ONLINE.code], ['deal', 'ABC']);
  g.onlineApply({ view: viewFor(st, 2, 5000), events: [] });
  const s = g.st();
  ok('pemain sendiri (kursi 2) di indeks lokal 0 dengan tangan asli', [g.P[0].name, g.P[0].hand.map(c => c.id)], ['P2', st.seats[2].hand.map(c => c.id)]);
  ok('urutan lawan searah jarum jam', g.P.map(p => p.name), ['P2', 'P3', 'P0', 'P1']);
  ok('tangan lawan hanya kartu pengganti tertutup', g.P.slice(1).every(p => p.hand.length === 7 && p.hand.every(c => c.id >= 100)));
  ok('keadaan: target, ronde, tumpukan, siap dirender', [s.TARGET, s.roundNo, s.deck.length, s.dealt], [300, 1, st.deck.length, true]);
  ok('giliran kursi 0 = indeks lokal 2 untuk kursi 2', [s.cur, s.phase], [2, 'draw']);
  ok('ronde baru: animasi bagi kartu aktif saat render lalu dimatikan', [g.rec.dealingAt[0], s.dealing], [true, false]);
  const hidden = new Set(st.seats.flatMap((q, i) => (i === 2 ? [] : q.hand.map(c => c.id))).concat(st.deck.map(c => c.id)));
  ok('tidak ada id kartu tersembunyi di keadaan renderer', [...g.P.flatMap(p => p.hand), ...g.st().pool, ...g.st().deck].some(c => hidden.has(c.id)), false);
  ok('pesan giliran lawan: menunggu pemain', g.rec.msgs.at(-1), 'online.waiting{"name":"P0"}'); }

// ---------- 2. efek event: suara, log, titik awal animasi ----------
{ const st = mkGame(), g = make(); g.onlineStart({ code: 'A' }, fakeApi({ ok: true }));
  g.onlineApply({ view: viewFor(st, 1, 1), events: [] });
  const v = viewFor(st, 1, 2), c1 = C(0, 7);
  g.onlineApply({ view: v, events: [{ seq: 1, type: 'draw', seat: 3 }, { seq: 2, type: 'discard', seat: 3, card: c1 }, { seq: 3, type: 'meld', seat: 1, cards: [C(0, 3), C(0, 4), C(0, 5)], value: 15 }, { seq: 4, type: 'pluck', seat: 2, value: 50 }, { seq: 5, type: 'remi', seat: 2 }] });
  ok('suara dari event', g.rec.snd.filter(x => x !== 'turn'), ['draw', 'discard', 'meld', 'pluck', 'remi']);
  ok('kartu buangan lawan muncul dari kursinya (kursi 3 -> lokal 2)', g.spawnHint[c1.id], { x: 20, z: 20 });
  ok('buangan sendiri tidak diberi titik awal', (() => { const g2 = make(); g2.onlineStart({ code: 'A' }, fakeApi({})); g2.onlineApply({ view: viewFor(st, 1, 1), events: [{ seq: 1, type: 'discard', seat: 1, card: C(1, 9) }] }); return g2.spawnHint[C(1, 9).id] === undefined; })());
  ok('log memakai indeks lokal & kunci terjemahan', g.rec.log.map(l => l[0]), [2, 2, 0, 1, 1]);
  ok('skor melayang & banner REMI', [g.rec.pop, g.rec.ban.length], [['+15', '-50'], 1]); }

// ---------- 3. akhir ronde ----------
{ const st = mkGame(9), g = make(); st.seats[0].melds = [[C(0, 3), C(0, 4), C(0, 5)]]; st.seats[0].hand = [C(2, 12)]; st.cur = 0; st.phase = 'discard';
  act(st, 0, { type: 'close' }, 3000);
  g.onlineStart({ code: 'A' }, fakeApi({})); g.onlineApply({ view: viewFor(st, 1, 3000), events: [] });
  ok('antar ronde: fase lokal "over", papan skor tampil, tangan terbuka', [g.st().phase, g.rec.results, g.st().revealCards], ['over', 1, true]);
  ok('papan skor tidak disembunyikan saat antar ronde', g.rec.hidden, 0); }

// ---------- 4. tawaran seri setelah menarik ----------
{ const st = mkGame(3), g = make(); st.seats[0].hand = [C(0, 3), C(0, 4), C(0, 5), C(1, 9), C(2, 12), C(3, 2), C(1, 6), C(2, 8)]; st.cur = 0; st.phase = 'discard';
  const api = fakeApi({ ok: true }); g.onlineStart({ code: 'A' }, api);
  g.onlineApply({ view: viewFor(st, 0, 1), events: [{ seq: 1, type: 'draw', seat: 0, own: { card: C(0, 5) } }] });
  ok('menarik kartu pembentuk seri: muncul tawaran', [g.rec.prompts.length, g.rec.prompts[0].text.startsWith('meld.drawn')], [1, true]);
  g.rec.prompts[0].yes(); await new Promise(r => setTimeout(r, 5));
  ok('menjawab "Ya" mengirim aksi meld dengan kartu yang benar', api.calls[0], { type: 'meld', cards: [C(0, 3).id, C(0, 4).id, C(0, 5).id] });
  const g2 = make(); g2.onlineStart({ code: 'A' }, fakeApi({}));
  g2.onlineApply({ view: viewFor(st, 0, 1), events: [{ seq: 1, type: 'draw', seat: 0, own: { card: C(2, 12) } }] });
  ok('kartu tarikan yang tidak membentuk seri: tanpa tawaran', g2.rec.prompts.length, 0);
  const g3 = make(); g3.onlineStart({ code: 'A' }, fakeApi({}));
  g3.onlineApply({ view: viewFor(st, 0, 1), events: [{ seq: 1, type: 'draw', seat: 2 }] });
  ok('lawan menarik: tanpa tawaran', g3.rec.prompts.length, 0); }

// ---------- 5. identitas kartu & seleksi bertahan antar pembaruan ----------
{ const st = mkGame(), g = make(); g.onlineStart({ code: 'A' }, fakeApi({}));
  g.onlineApply({ view: viewFor(st, 0, 1), events: [] });
  const card = g.P[0].hand[2]; g.setSel([card]);
  g.onlineApply({ view: viewFor(st, 0, 2), events: [] });
  ok('objek kartu sama (hover/seleksi tetap valid)', [g.P[0].hand[2] === card, g.st().selectedHandCards[0] === card], [true, true]);
  st.seats[0].hand = st.seats[0].hand.filter(c => c.id !== card.id); g.onlineApply({ view: viewFor(st, 0, 3), events: [] });
  ok('kartu terpilih yang hilang dari tangan dibuang dari seleksi', g.st().selectedHandCards.length, 0); }

// ---------- 6. mengirim aksi ----------
{ const g = make(), api = fakeApi({ ok: true }); g.onlineStart({ code: 'A' }, api);
  const a = g.onlineSend({ type: 'draw' }), b = g.onlineSend({ type: 'draw' }); await Promise.all([a, b]);
  ok('klik ganda: hanya satu aksi dikirim', api.calls.length, 1);
  ok('selama menunggu server input dikunci, sesudahnya dibuka', [g.rec.anims[g.rec.anims.length - 2], g.st().anim], [true, false]);
  const g2 = make(); g2.onlineStart({ code: 'A' }, fakeApi({ ok: false, error: 'invalid_eat' })); await g2.onlineSend({ type: 'eat' });
  ok('galat aturan ditampilkan dengan teksnya', g2.rec.msgs.at(-1), '«online.err.invalid_eat»');
  const g3 = make(); g3.onlineStart({ code: 'A' }, fakeApi({ ok: false, error: 'aneh' })); await g3.onlineSend({ type: 'x' });
  ok('galat tak dikenal -> pesan umum', g3.rec.msgs.at(-1), '«online.err.generic»');
  const g4 = make(); g4.onlineStart({ code: 'A' }, { send: async () => { throw new Error('putus'); } }); await g4.onlineSend({ type: 'draw' });
  ok('jaringan putus -> menghubungkan ulang & input dibuka lagi', [g4.rec.msgs.at(-1), g4.st().anim], ['online.reconnecting', false]);
  const g5 = make(); await g5.onlineSend({ type: 'draw' }); ok('di luar mode online tidak mengirim apa pun', g5.rec.anims.length, 0); }

// ---------- 7. tombol/klik diarahkan ke server pada mode online ----------
const mkAct = () => new Function(`
  let ONLINE={}, selectedHandCards=[], plk=[], phase='draw', P=[{hand:[],melds:[]}], cur=0, meldMode=false; const sent=[];
  function onlineSend(a){sent.push(a)} function resetEatSelection(){selectedHandCards=[]} const canManualMeld=()=>true;
  ${['draw', 'eatManual', 'discard', 'pluck', 'layManual'].map(fnSrc).join('\n')}
  return { sent, draw, eatManual, discard, pluck, layManual, set sel(v){selectedHandCards=v}, set plk(v){plk=v}, P };
`)();
{ const a = mkAct(), c1 = { id: 7 }, c2 = { id: 9 }, c3 = { id: 11 };
  a.draw(a.P[0]); a.sel = [c1, c2]; a.eatManual(a.P[0], 3); a.discard(a.P[0], c3, false); a.discard(a.P[0], c3, true); a.plk = [{ id: 400 }, { id: 401 }, c1]; a.pluck(a.P[0], c1); a.sel = [c1, c2, c3]; a.layManual(a.P[0]);
  ok('draw/eat/discard/close/pluck/meld -> aksi server yang benar', a.sent, [{ type: 'draw' }, { type: 'eat', k: 3, sel: [7, 9] }, { type: 'discard', id: 11 }, { type: 'close' }, { type: 'pluck', index: 2 }, { type: 'meld', cards: [7, 9, 11] }]); }
ok('semua titik masuk aksi memeriksa ONLINE paling awal', ['function draw(p) {\n  if (ONLINE)', 'function eatManual(p, k) {\n  if (ONLINE)', 'function discard(p, c, closed) {\n  if (ONLINE)', 'function pluck(p, c) {\n  if (ONLINE)', 'function layManual(p) {\n  if (ONLINE)'].every(s => src.includes(s)));

console.log(`${n - bad}/${n} tes sambungan online lulus`);
process.exit(bad ? 1 : 0);
