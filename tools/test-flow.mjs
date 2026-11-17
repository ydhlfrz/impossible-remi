import fs from 'fs';
const src = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
function fn(name) {
  const i = src.indexOf('function ' + name + '(');
  let d = 0, k = src.indexOf('{', i);
  for (;; k++) { if (src[k] === '{') d++; if (src[k] === '}' && --d === 0) break; }
  return src.slice(i, k + 1);
}
let bad = 0, n = 0;
const ok = (name, got, want) => { n++; if (got !== want) { bad++; console.log('GAGAL:', name, 'dapat', got, 'harusnya', want); } };
const mk = (cnt) => Array.from({ length: cnt }, (_, i) => ({ s: 0, r: 2 + (i % 9), id: i }));
const make = (handN) => new Function(`
  let ONLINE=null; function onlineSend(){}
  let phase='discard', cur=0, hover=null, plk=[], anim=false, turns=0, ends=0;
  const P=[{id:0,hand:${JSON.stringify(mk(handN))},melds:[],pen:0,pluckedCards:[],cv:0},{id:1,hand:[],melds:[],pen:0,pluckedCards:[],cv:0},{id:2,hand:[],melds:[]},{id:3,hand:[],melds:[]}];
  const pool=[], queue=[], SND={play(){}}, W=()=>({x:0,z:0}), shuf=a=>a, cs=()=>'x', val=()=>5, tr=k=>k;
  let deck=[1]; function draw(){}
  function logEv(){} function render(){} function msg(){} function pop(){} function botPluck(){}
  const after=(ms,f)=>queue.push(f), resetEatSelection=()=>{}, endRound=()=>{ends++;phase='over'}, turn=()=>{turns++};
  ${fn('discard')}
  ${fn('pluck')}
  ${fn('next')}
  return { P, pool, queue, get phase(){return phase}, get cur(){return cur}, get turns(){return turns}, get ends(){return ends}, discard, pluck,
    flush(){ while(queue.length) queue.shift()(); } };
`)();
// 1. klik ganda buang kartu (tangan 8 -> harus tersisa 7, bukan 6)
let g = make(8);
g.discard(g.P[0], g.P[0].hand[0], false);
g.discard(g.P[0], g.P[0].hand[0], false);
ok('buang 2x klik: sisa kartu', g.P[0].hand.length, 7);
ok('buang 2x klik: pool', g.pool.length, 1);
g.flush();
ok('giliran maju sekali', g.cur, 1);
ok('fase kembali draw', g.phase, 'draw');
// 2. klik ganda setelah giliran pindah tidak berpengaruh pada pemain lain
g.discard(g.P[0], g.P[0].hand[0], false);
ok('bukan giliran: tidak membuang', g.P[0].hand.length, 7);
// 3. kartu lebih dari 7: buang 1, lalu cabut ganda
g = make(9);
g.discard(g.P[0], g.P[0].hand[0], false);
ok('9 kartu -> 8, fase cabut', g.phase, 'pluck');
g.pluck(g.P[0], g.P[0].hand[0]);
g.pluck(g.P[0], g.P[0].hand[0]);
ok('cabut 2x klik: sisa kartu', g.P[0].hand.length, 7);
ok('cabut 2x klik: denda sekali', g.P[0].pen, 5 * 10);
g.flush();
ok('cabut: giliran maju sekali', g.cur, 1);
// 4. buang kartu tertutup (CLOSED) ganda -> ronde berakhir sekali
g = make(1);
g.discard(g.P[0], g.P[0].hand[0], true);
g.discard(g.P[0], g.P[0].hand[0], true);
ok('CLOSED ganda: endRound sekali', g.ends, 1);
// 5. nama file gambar sesuai daftar Anda
const rankN = new Function(`${src.match(/const rankN = .*/)[0]}; return rankN;`)();
const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
const names = []; for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) names.push(`card_${suits[s]}_${rankN(r)}`);
ok('52 nama unik', new Set(names).size, 52);
ok('semua sesuai pola', names.every(x => /^card_(spades|hearts|diamonds|clubs)_(0[2-9]|10|A|J|Q|K)$/.test(x)), true);
ok('contoh spades_03', names.includes('card_spades_03'), true);
ok('contoh hearts_A', names.includes('card_hearts_A'), true);
ok('contoh diamonds_10', names.includes('card_diamonds_10'), true);
ok('contoh clubs_Q', names.includes('card_clubs_Q'), true);
// 6. deteksi batas gambar kartu (margin transparan + bayangan semi-transparan diabaikan)
const alphaBounds = new Function(`${fn('alphaBounds')}; return alphaBounds;`)();
const W = 56, H = 72, data = new Uint8ClampedArray(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const inCard = x >= 8 && x < 48 && y >= 4 && y < 68; // kartu 40x64 di tengah kanvas 56x72
  const shadow = x >= 48 && x < 52 && y >= 8 && y < 68; // bayangan alpha ~100
  data[(y * W + x) * 4 + 3] = inCard ? 255 : shadow ? 100 : 0;
}
const b = alphaBounds(W, H, data);
ok('crop lebar 40', Math.round(b.fw * W), 40);
ok('crop tinggi 64', Math.round(b.fh * H), 64);
ok('rasio 40/64', Math.abs(b.ratio - 40 / 64) < 1e-9, true);
ok('tanpa margin -> tidak dipotong', alphaBounds(4, 4, new Uint8ClampedArray(64).fill(255)).fw, 1);
ok('gambar kosong -> null', alphaBounds(4, 4, new Uint8ClampedArray(64)), null);
// 7. aturan tumpukan habis
const mkDraw = (meldsExist, alreadyReshuffled, poolN = 5) => new Function(`
  let ONLINE=null; function onlineSend(){}
  let phase='draw', anim=false, reshuffled=${alreadyReshuffled}, ends=0, gainedN=0, shuffleN=0;
  const RULES={reshuffleAlways:false}, queue=[], SND={play(){}}, tr=k=>k;
  const P=[{id:0,hand:[],melds:${meldsExist ? '[[1]]' : '[]'}},{id:1,hand:[],melds:[]},{id:2,hand:[],melds:[]},{id:3,hand:[],melds:[]}];
  let deck=[], pool=Array.from({length:${poolN}},(_,i)=>({s:0,r:2+i,id:i}));
  const shuf=a=>a, after=(ms,f)=>queue.push(f), shuffleFx=cb=>{shuffleN++;cb()}, melds=()=>[], hasMeld=p=>p.melds.length>0, cs=()=>'x';
  function resetEatSelection(){} function msg(){} function logEv(){} function render(){} function layBotMelds(){}
  function promptMeldOption(){} function gained(){gainedN++} function endRound(){ends++}
  ${fn('draw')}
  return { P, draw, flush(){ while(queue.length) queue.shift()(); }, get ends(){return ends}, get reshuffled(){return reshuffled}, get deck(){return deck}, get shuffleN(){return shuffleN}, get gainedN(){return gainedN} };
`)();
let d = mkDraw(false, false); d.draw(d.P[0]); d.flush();
ok('tanpa seri, kocok pertama: ronde lanjut', d.ends, 0);
ok('tanpa seri, kocok pertama: pool jadi tumpukan', d.deck.length, 3);
ok('tanpa seri, kocok pertama: tanda reshuffled', d.reshuffled, true);
ok('tanpa seri, kocok pertama: kartu ditarik', d.gainedN, 1);
d = mkDraw(false, true); d.draw(d.P[0]);
ok('tanpa seri, sudah dikocok: ronde selesai', d.ends, 1);
ok('tanpa seri, sudah dikocok: tidak kocok lagi', d.shuffleN, 0);
d = mkDraw(true, false); d.draw(d.P[0]);
ok('ada seri: ronde selesai tanpa kocok', d.ends, 1);
ok('ada seri: tidak ada kocok', d.shuffleN, 0);
d = mkDraw(true, true); d.draw(d.P[0]);
ok('ada seri + sudah dikocok: ronde selesai', d.ends, 1);
// 8. REMI hanya untuk pemain itu; pemain lain lanjut
const mkRemi = (doneFlags) => new Function(`
  let phase='draw', cur=1, ends=0, turns=0, drawCalls=0;
  const P=[0,1,2,3].map(i=>({id:i,done:${JSON.stringify(doneFlags)}[i],remi:false,hand:[],melds:[[1]]}));
  let deck=[1,2,3]; const queue=[], SND={play(){}}, tr=k=>k;
  const after=(ms,f)=>queue.push(f);
  const W=()=>({x:0,z:0});
  function logEv(){} function pop(){} function banner(){} function render(){} function msg(){}
  function endRound(){ends++;phase='over'} function turn(){turns++} function draw(){drawCalls++}
  ${fn('declareRemi')}
  ${fn('next')}
  return { P, declareRemi, next, flush(){ while(queue.length) queue.shift()(); }, get cur(){return cur}, get phase(){return phase}, get ends(){return ends}, get turns(){return turns}, set cur(v){cur=v} };
`)();
let r = mkRemi([false, false, false, false]);
r.declareRemi(r.P[1]);
ok('REMI: pemain ditandai selesai', r.P[1].done && r.P[1].remi, true);
ok('REMI: ronde belum berakhir', r.ends, 0);
ok('REMI: menunggu giliran berikutnya', r.phase, 'wait');
r.flush();
ok('REMI: giliran pindah ke pemain lain', r.cur, 2);
ok('REMI: turn() dipanggil', r.turns, 1);
r = mkRemi([false, false, true, false]);
r.cur = 1; r.next();
ok('next() melewati pemain yang REMI', r.cur, 3);
r = mkRemi([true, true, true, false]);
r.declareRemi(r.P[3]);
ok('semua pemain selesai -> ronde berakhir', r.ends, 1);
r = mkRemi([true, false, true, true]);
r.cur = 1; r.next();
ok('hanya satu pemain aktif: giliran kembali padanya', r.cur, 1);
// 9. skor: bonus REMI per pemain
const mkEnd = () => new Function(`
  let phase='draw', anim=false, revealCards=false, starter=0, cur=0, TARGET=300;
  const RULES={leftoverMult:1}, SND={play(){}}, tr=k=>k, val=c=>c.r==1?15:c.r>10?10:5;
  const logs=[]; function logEv(i,t){logs.push(t)} function msg(){} function render(){} function resetEatSelection(){}
  const after=(ms,f)=>{}; function animateScoreModal(){}
  const P=[
    {id:0,name:'A',score:0,remi:true, melds:[[{r:5},{r:6},{r:7}]],hand:[],pen:0,cv:0},
    {id:1,name:'B',score:0,remi:false,melds:[],hand:[{r:12},{r:3}],pen:50,cv:0},
    {id:2,name:'C',score:0,remi:false,melds:[[{r:11},{r:12},{r:13}]],hand:[],pen:0,cv:0},
    {id:3,name:'D',score:0,remi:false,melds:[],hand:[],pen:0,cv:0}];
  ${fn('endRound')}
  endRound(null,'');
  return { P, phase };
`)();
ok('skor REMI: 15 (seri) + 25 (bonus)', mkEnd().P[0].score, 40);
ok('skor non-REMI: minus kartu sisa & denda', mkEnd().P[1].score, -(10 + 5 + 50));
ok('skor seri gambar tanpa bonus', mkEnd().P[2].score, 30);
// 10. nama pemain tidak boleh menyuntikkan HTML
const esc = new Function(`${src.match(/const esc = .*/)[0]}; return esc;`)();
ok('esc: tag script', esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
ok('esc: atribut', esc('"><img src=x onerror=1>'), '&quot;&gt;&lt;img src=x onerror=1&gt;');
ok('esc: teks biasa', esc('Budi & Sari'), 'Budi &amp; Sari');
console.log(`${n - bad}/${n} tes alur lulus`);
process.exit(bad ? 1 : 0);
