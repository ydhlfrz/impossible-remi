// UI online: login email, lobi (cari lawan / ruang pribadi), ruang tunggu, dan jembatan ke penampil game (main.js).
import { tr, applyI18n } from './i18n.js';
import { Net, RoomClient } from './net.js';
import { createSupabaseAuth, createLocalAuth } from './auth.js';

const $ = id => document.getElementById(id);
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const esc = x => String(x).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export function initOnline(hooks) {
  const ENV = (import.meta && import.meta.env) || {};
  let auth = null, net = null, user = null, client = null, inGame = false, room = null, recvAt = 0, timer = null;
  let target = 300, level = 'medium', mode = 'login', avSel = 0;
  const avImgs = new Map();

  // ---------- backend (Supabase bila dikonfigurasi, kalau tidak server lokal) ----------
  async function backend() {
    if (auth) return;
    if (ENV.VITE_SUPABASE_URL && ENV.VITE_SUPABASE_ANON_KEY) {
      const { createClient } = await import('@supabase/supabase-js');
      auth = createSupabaseAuth(createClient(ENV.VITE_SUPABASE_URL, ENV.VITE_SUPABASE_ANON_KEY));
      net = new Net({ getToken: auth.getToken });
    } else { net = new Net(); auth = createLocalAuth(net); }
  }
  const api = {
    send: a => client.send(a),
    leave: (ask = true) => leaveGame(ask),
    avatar: uid => {
      if (!avImgs.has(uid)) avImgs.set(uid, net.call('GET', '/api/avatar', { query: { uid } }).then(d => d.img).catch(() => null));
      return avImgs.get(uid);
    }
  };

  // ---------- pembuat modal ----------
  const mkModal = (id, html) => {
    let m = $(id);
    if (!m) { m = document.createElement('div'); m.id = id; m.className = 'modal'; document.body.appendChild(m); }
    m.innerHTML = '<div>' + html + '</div>';
    return m;
  };
  const authModal = mkModal('authModal', `
    <h2 id="authTitle"></h2>
    <div class="opt"><span data-i18n="auth.email"></span><input id="authEmail" type="email" autocomplete="email" maxlength="120"></div>
    <div class="opt" id="authNameRow"><span data-i18n="auth.name"></span><input id="authName" maxlength="14" autocomplete="nickname"></div>
    <div class="opt"><span data-i18n="auth.password"></span><input id="authPass" type="password" autocomplete="current-password" maxlength="128"></div>
    <p class="err" id="authMsg"></p>
    <button id="authGo"></button><button class="link" id="authSwitch"></button><button class="link" id="authForgot" data-i18n="auth.forgot"></button>
    <button id="authBack" data-i18n="auth.back"></button>`);
  const lobbyModal = mkModal('lobbyModal', `
    <h2 data-i18n="lobby.title"></h2>
    <div class="hd"><div class="avprev" id="lbAvPrev"></div><div><b id="lbName"></b><small id="lbChips"></small></div></div>
    <button id="lbResume" style="display:none"></button>
    <div class="sec"><div class="opt"><span data-i18n="lobby.room"></span><div class="seg" id="lbRoomSeg"><button data-v="300">300</button><button data-v="500">500</button><button data-v="1000">1000</button></div></div>
      <div class="opt"><span data-i18n="lobby.level"></span><div class="seg" id="lbLevelSeg"><button data-v="easy">Easy</button><button data-v="medium">Medium</button><button data-v="hard">Hard</button></div></div></div>
    <div class="sec"><div class="opt"><span data-i18n="lobby.quick"></span></div><button id="lbFind" data-i18n="lobby.find"></button></div>
    <div class="sec"><div class="opt"><span data-i18n="lobby.create"></span></div>
      <div class="lrow"><input id="lbPw" type="password" maxlength="32" data-i18n-ph="lobby.password" autocomplete="off"><button id="lbCreate" data-i18n="lobby.createBtn"></button></div></div>
    <div class="sec"><div class="opt"><span data-i18n="lobby.join"></span></div>
      <div class="lrow"><input id="lbCode" maxlength="8" data-i18n-ph="lobby.code" autocomplete="off" style="text-transform:uppercase"><input id="lbJoinPw" type="password" maxlength="32" data-i18n-ph="lobby.password" autocomplete="off"><button id="lbJoin" data-i18n="lobby.joinBtn"></button></div></div>
    <p class="err" id="lbErr"></p>
    <div class="sec"><div class="opt"><span data-i18n="lobby.profile"></span></div>
      <div class="lrow"><input id="lbNameIn" maxlength="14"><button id="lbSave" data-i18n="lobby.save"></button></div><div id="lbAv"></div></div>
    <div class="lrow" style="margin-top:14px"><button id="lbOut" class="link" data-i18n="auth.logout"></button><button id="lbBack" data-i18n="lobby.back" style="margin-left:auto!important"></button></div>`);
  const roomModal = mkModal('roomModal', `
    <h2 id="rmTitle"></h2><p data-i18n="room.share"></p>
    <div class="codebox"><b id="rmCode"></b><button id="rmCopy" data-i18n="room.copy"></button></div>
    <div class="opt"><span data-i18n="room.members"></span></div><div class="members" id="rmMembers"></div>
    <p id="rmInfo"></p><button id="rmStart" data-i18n="room.start"></button><button id="rmLeave" data-i18n="room.leave"></button>`);
  const show = (m, on) => { m.style.display = on ? 'flex' : 'none'; };
  const hideAll = () => [authModal, lobbyModal, roomModal].forEach(m => show(m, false));
  const AVE = hooks.avatars;

  // ---------- menu: tombol Online ----------
  const play = $('startGameBtn');
  if (play && !$('onlineBtn')) { const b = document.createElement('button'); b.id = 'onlineBtn'; b.dataset.i18n = 'menu.online'; play.after(b); }
  $('onlineBtn').onclick = async () => {
    try { await backend(); } catch (e) { alert('Supabase belum terpasang: jalankan "npm install". ' + e.message); return; }
    show($('startMenuModal'), false);
    let ok = false;
    try { if (await auth.getToken()) { user = await net.me(); ok = true; } } catch (e) { ok = false; }
    ok ? openLobby() : openAuth('login');
  };

  // ---------- login / daftar ----------
  const authMsg = (k, good) => { const el = $('authMsg'); el.textContent = k ? tr(k) : ''; el.className = 'err' + (good ? ' ok' : ''); };
  function renderAuth() {
    $('authTitle').textContent = tr(mode === 'login' ? 'auth.title.login' : 'auth.title.register');
    $('authGo').textContent = tr(mode === 'login' ? 'auth.login' : 'auth.register');
    $('authSwitch').textContent = tr(mode === 'login' ? 'auth.toRegister' : 'auth.toLogin');
    $('authNameRow').style.display = mode === 'register' ? '' : 'none';
    $('authForgot').style.display = mode === 'login' ? '' : 'none';
    $('authPass').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  }
  function openAuth(m) { mode = m; hideAll(); authMsg(''); renderAuth(); show(authModal, true); setTimeout(() => $('authEmail').focus(), 50); }
  $('authSwitch').onclick = () => openAuth(mode === 'login' ? 'register' : 'login');
  $('authBack').onclick = () => { hideAll(); show($('startMenuModal'), true); };
  $('authGo').onclick = async () => {
    const email = $('authEmail').value.trim(), password = $('authPass').value, name = $('authName').value.trim();
    if (!EMAIL.test(email)) return authMsg('auth.err.email');
    if (mode === 'register' && password.length < 8) return authMsg('auth.err.weak_password');
    authMsg('auth.busy', true); $('authGo').disabled = true;
    try {
      if (mode === 'register') {
        const r = await auth.signUp({ email, password, name });
        if (r.needsConfirm) { mode = 'login'; renderAuth(); return authMsg('auth.confirmSent', true); }
      } else await auth.signIn({ email, password });
      user = await net.me(); $('authPass').value = ''; authMsg(''); openLobby();
    } catch (e) { authMsg('auth.err.' + (['invalid_credentials', 'email_not_confirmed', 'user_already_exists', 'weak_password', 'rate', 'email', 'network'].includes(e.code) ? e.code : 'generic')); }
    finally { $('authGo').disabled = false; }
  };
  $('authForgot').onclick = async () => {
    const email = $('authEmail').value.trim();
    if (!EMAIL.test(email)) return authMsg('auth.enterEmail');
    try { await auth.resetPassword(email, location.origin); authMsg('auth.forgotSent', true); } catch (e) { authMsg('auth.err.' + (e.code === 'rate' ? 'rate' : 'generic')); }
  };
  [$('authEmail'), $('authName'), $('authPass')].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') $('authGo').click(); }));

  // ---------- lobi ----------
  const lbErr = (code, good) => { const el = $('lbErr'); if (!code) { el.textContent = ''; el.className = 'err'; return; } const k = code ? (code === 'saved' ? 'lobby.saved' : 'lobby.err.' + code) : ''; const t = k ? tr(k) : ''; el.textContent = t === k ? tr('lobby.err.generic') : t; el.className = 'err' + (good ? ' ok' : ''); };
  const errCode = e => (e && e.status ? e.code || 'generic' : 'network');
  function bindSeg(id, cur, set) {
    const seg = $(id);
    seg.querySelectorAll('button').forEach(b => { b.classList.toggle('sel', b.dataset.v == String(cur)); b.onclick = () => { seg.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b)); set(b.dataset.v); hooks.sound && hooks.sound('click'); }; });
  }
  bindSeg('lbRoomSeg', target, v => (target = +v)); bindSeg('lbLevelSeg', level, v => (level = v));
  function paintAvatar() {
    const img = user && user.avatar && user.avatar.img;
    $('lbAvPrev').innerHTML = img ? '' : AVE[(user && user.avatar && user.avatar.i) || 0];
    if (img && user.uid) api.avatar(user.uid).then(src => { if (src) $('lbAvPrev').innerHTML = `<img src="${esc(src)}" alt="">`; });
  }
  async function openLobby() {
    hideAll(); lbErr('');
    $('lbName').textContent = user.name; $('lbChips').textContent = tr('lobby.chips', { n: user.chips || 0 });
    $('lbNameIn').value = user.name; avSel = (user.avatar && user.avatar.i) || 0; paintAvatar();
    $('lbAv').innerHTML = ''; AVE.forEach((a, i) => { const b = document.createElement('button'); b.textContent = a; b.classList.toggle('sel', i === avSel); b.onclick = () => { avSel = i; [...$('lbAv').children].forEach((x, j) => x.classList.toggle('sel', j === i)); }; $('lbAv').appendChild(b); });
    const r = $('lbResume'); r.style.display = user.activeRoom ? '' : 'none'; if (user.activeRoom) r.textContent = tr('lobby.resume', { code: user.activeRoom });
    show(lobbyModal, true);
  }
  $('lbResume').onclick = () => run(() => net.sync(user.activeRoom));
  $('lbFind').onclick = () => run(() => net.quickMatch(target, level));
  $('lbCreate').onclick = () => run(() => net.createRoom({ target, level, password: $('lbPw').value || undefined }));
  $('lbJoin').onclick = () => run(() => net.joinRoom($('lbCode').value, $('lbJoinPw').value));
  $('lbSave').onclick = async () => { try { user = await net.profile({ name: $('lbNameIn').value, avatar: { i: avSel } }); $('lbName').textContent = user.name; paintAvatar(); lbErr('saved', true); } catch (e) { lbErr(errCode(e)); } };
  $('lbBack').onclick = () => { hideAll(); show($('startMenuModal'), true); };
  $('lbOut').onclick = async () => { try { await auth.signOut(); } catch (e) {} user = null; hideAll(); show($('startMenuModal'), true); };
  async function run(fn) {
    lbErr('');
    try { const p = await fn(); enterRoom(p); }
    catch (e) { const c = errCode(e); if (c === 'unauthorized') { hideAll(); openAuth('login'); return; } if (c === 'already_in_room' && e.data && e.data.code) { user.activeRoom = e.data.code; openLobby(); } lbErr(c); }
  }

  // ---------- ruang & permainan ----------
  function enterRoom(p) {
    hideAll(); inGame = false; room = null;
    client = new RoomClient({ net, code: p.code, realtime: auth.realtime, onUpdate });
    client.start(); onUpdate(p); // payload pertama dari permintaan masuk dipakai langsung
  }
  function onUpdate(p) {
    if (!client) return; // pembaruan terlambat setelah keluar ruang: abaikan (jangan memulai game lagi)
    if (p.error) { stopClient(); leaveUi(); return; }
    recvAt = Date.now();
    if (p.status === 'lobby') { room = p; paintRoom(); return; }
    if (!inGame) { hideAll(); clearInterval(timer); hooks.startOnline(p, api); inGame = true; }
    hooks.applyOnline(p);
    if (p.status === 'abandoned') { alert(tr('online.abandoned')); leaveGame(false); }
  }
  function paintRoom() {
    const p = room; show(roomModal, true);
    $('rmTitle').textContent = tr('room.title', { code: p.code }); $('rmCode').textContent = p.code;
    $('rmMembers').innerHTML = p.lobby.members.map(m => m
      ? `<div class="mem"><span class="av" style="--c:#42a5f5">${m.avatar === 'img' ? '👤' : AVE[m.avatar] || AVE[0]}</span><b>${esc(m.name)}</b>${m.uid === p.lobby.members[0].uid ? `<em>${tr('room.host')}</em>` : ''}</div>`
      : `<div class="mem empty"><span class="av" style="--c:#555">·</span>${tr('room.empty')}</div>`).join('');
    $('rmStart').style.display = p.isHost ? '' : 'none';
    clearInterval(timer);
    const tick = () => {
      const info = $('rmInfo');
      if (p.lobby.public && p.lobby.startAt) info.textContent = tr('room.autoStart', { s: Math.max(0, Math.ceil((p.lobby.startAt - (p.serverNow + Date.now() - recvAt)) / 1000)) });
      else info.textContent = p.isHost ? '' : tr('room.waitHost');
    };
    tick(); timer = setInterval(tick, 500);
  }
  $('rmCopy').onclick = async () => { try { await navigator.clipboard.writeText($('rmCode').textContent); $('rmCopy').textContent = tr('room.copied'); setTimeout(() => ($('rmCopy').textContent = tr('room.copy')), 1500); } catch (e) {} };
  $('rmStart').onclick = () => net.startRoom(client.code).then(p => client.kick()).catch(() => {});
  $('rmLeave').onclick = () => leaveGame(false);
  const stopClient = () => { if (client) client.stop(); client = null; clearInterval(timer); };
  function leaveUi() { inGame = false; room = null; if (hooks.stopOnline) hooks.stopOnline(); hideAll(); user ? openLobbyFresh() : show($('startMenuModal'), true); }
  async function openLobbyFresh() { try { user = await net.me(); } catch (e) {} user ? openLobby() : openAuth('login'); }
  async function leaveGame(ask) {
    if (ask && inGame && !confirm(tr('online.leaveConfirm'))) return;
    const code = client && client.code; stopClient();
    try { if (code) await net.leaveRoom(code); } catch (e) {}
    leaveUi();
  }
  // sesi yang berakhir saat bermain / pengguna keluar akun dari tab lain
  window.addEventListener('beforeunload', () => {});
  return { openLobby, leaveGame };
}
