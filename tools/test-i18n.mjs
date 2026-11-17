import fs from 'fs';
import { dict } from '../src/i18n.js';
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const online = fs.readFileSync(new URL('../src/online.js', import.meta.url), 'utf8');
let bad = 0, n = 0;
const ok = (name, got, want) => { n++; if (got !== want) { bad++; console.log('GAGAL:', name, got, want); } };
const idK = Object.keys(dict.id).sort(), enK = Object.keys(dict.en).sort();
ok('kunci id = kunci en', JSON.stringify(idK), JSON.stringify(enK));
ok('tidak ada terjemahan kosong yang tak disengaja', idK.filter(k => !dict.id[k] && k !== 'ph.init').length + enK.filter(k => !dict.en[k] && k !== 'ph.init').length, 0);
const KEYRE = /'((?:msg|log|banner|score|meld|btn|ph|hud|prof|menu|help|rotate|lang|auth|lobby|room|online|size)\.[A-Za-z0-9_.]+)'/g;
const used = new Set([...main.matchAll(KEYRE), ...online.matchAll(KEYRE)].map(m => m[1]));
[...online.matchAll(/data-i18n(?:-ph|-title)?="([^"]+)"/g)].forEach(m => used.add(m[1]));
// keluarga kunci yang dirangkai saat jalan (auth.err.<kode>, lobby.err.<kode>, online.err.<kode>)
const fam = (p, codes) => codes.forEach(c => used.add(p + c));
fam('auth.err.', ['invalid_credentials', 'email_not_confirmed', 'user_already_exists', 'weak_password', 'rate', 'email', 'network', 'generic']);
fam('lobby.err.', ['wrong_password', 'room_not_found', 'room_full', 'room_started', 'already_in_room', 'too_many_requests', 'unauthorized', 'busy', 'network', 'generic', 'bad_password']);
fam('online.err.', ['generic', 'not_your_turn', 'invalid_eat', 'invalid_meld', 'ace_locked', 'cannot_close']);
[...html.matchAll(/data-i18n(?:-ph|-title)?="([^"]+)"/g), ...main.matchAll(/data-i18n(?:-ph|-title)?="([^"]+)"/g)].forEach(m => used.add(m[1]));
['draw', 'discard', 'pluck', 'deal', 'over', 'wait'].forEach(p => used.add('ph.' + p));
const missing = [...used].filter(k => !k.endsWith('.') && (!(k in dict.id) || !(k in dict.en))); // awalan dinamis ('auth.err.') ditangani lewat keluarga kunci di atas
ok('semua kunci yang dipakai ada di dua bahasa', missing.join(','), '');
// variabel {x} harus sama di kedua bahasa
const vars = s => ((s || '').match(/\{[a-zA-Z]+\}/g) || []).sort().join();
const diff = idK.filter(k => vars(dict.id[k]) !== vars(dict.en[k]));
ok('variabel {..} sama di dua bahasa', diff.join(','), '');
// teks Indonesia yang tertinggal di main.js (di luar komentar & kamus)
const code = main.split('\n').filter(l => !l.trim().startsWith('//')).map(l => l.replace(/\s\/\/[^'"`]*$/, '')).join('\n');
const words = /(Giliran|Ronde|tumpukan|Buang|membuang|kartu pool|Pilih dulu|berpikir|memilih kartu|Mengocok|Membagikan|menurunkan)/;
const left = code.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => words.test(l) && /['"`]/.test(l));
ok('tidak ada teks Indonesia tertinggal di main.js', left.map(([i, l]) => i + ':' + l.trim().slice(0, 70)).join(' | '), '');
console.log(`${n - bad}/${n} tes bahasa lulus (${idK.length} kunci)`);
process.exit(bad ? 1 : 0);
