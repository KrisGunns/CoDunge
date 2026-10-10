'use strict';
(() => {
// =====================================================================
// Coop Quest — client. The room host's browser runs the simulation;
// the guest sends inputs and renders snapshots. Single player = host only.
// =====================================================================
const $ = id => document.getElementById(id);
const TILE = 32, COLS = 30, ROWS = 17, W = COLS * TILE, H = ROWS * TILE;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const STEP = 1 / 60;
const SPECIAL_CD = 15, DROP_CHANCE = 0.03;
const rnd = n => Math.floor(Math.random() * n);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const CHARS = {
  warrior: { name: 'Warrior', atk: 5, hp: 60, color: '#d9534f', dark: '#8e2420', cd: 0.5, speed: 150, sym: '🌀',
    desc: 'Spin Attack: AOE around you dealing 1.5× ATK.' },
  mage: { name: 'Mage', atk: 8, hp: 40, color: '#7e57c2', dark: '#4527a0', cd: 0.7, speed: 150, sym: '⚡',
    desc: 'Chain Lightning: 1.3× ATK, bounces up to 3 times, each hit 20% weaker.' },
  healer: { name: 'Healer', atk: 3, hp: 55, color: '#43a047', dark: '#1b5e20', cd: 0.6, speed: 150, sym: '✚',
    desc: 'Healing Ray: heals ally for 15 + 50% ATK, and yourself for half of that.' },
};
const ENEMIES = {
  rat: { atk: 1, hp: 10, speed: 95, r: 8, cd: 0.8 },
  goblin: { atk: 3, hp: 30, speed: 70, r: 11, cd: 1.0 },
  troll: { atk: 10, hp: 100, speed: 55, r: 14, cd: 1.2, boss: true },
};

// ---------------- profile / save ----------------
const SAVE_KEY = 'coopquest.v1';
const defaultProfile = () => ({ name: '', cp: 0, sel: 'warrior', up: { warrior: 0, mage: 0, healer: 0 }, best: { stage: 1, level: 1 } });
function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (p && typeof p === 'object') {
      const d = defaultProfile();
      return Object.assign(d, p, { up: Object.assign(d.up, p.up || {}), best: Object.assign(d.best, p.best || {}) });
    }
  } catch (e) {}
  return defaultProfile();
}
let profile = loadProfile();
function saveProfile() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(profile)); } catch (e) {} }
function statsFor(c) { const up = profile.up[c] | 0; return { atk: CHARS[c].atk + up, hp: CHARS[c].hp + 5 * up }; }

// ---------------- screens / toast ----------------
const SCREENS = ['scrName', 'scrMenu', 'scrMode', 'scrMulti', 'scrLobby', 'scrChar', 'scrOver'];
function show(id) {
  SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id));
  $('screens').classList.toggle('hidden', !id);
}
let toastTimer = 0;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------------- networking (PeerJS / WebRTC: no game server needed) ----------------
// Room host = one peer registered under a room-code id. "Find Game" uses a few well-known
// "waiting slot" ids: the first player registers a slot and waits; the next player finds it,
// the waiter opens a fresh room and tells the newcomer its code.
const PJ_PREFIX = 'coopquest-v1-';
const PJ_OPTS = {}; // e.g. { config: { iceServers: [ ...your STUN/TURN... ] } }
const FIND_SLOTS = 3;
const net = { id: 0, isHost: true, peer: null, pj: null, conn: null, token: 0, extra: [], findTimer: 0 };
let lobby = { code: '', players: [], hostId: 0, auto: false, searching: false };
let cdTimer = 0;
const safe = fn => { try { return fn(); } catch (e) { return undefined; } };
const mkCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 5; i++) c += A[rnd(A.length)]; return c; };

function closeNet() {
  net.token++; // invalidates every pending callback from the previous session
  clearInterval(cdTimer); cdTimer = 0; clearTimeout(net.findTimer);
  const c = net.conn, p = net.pj, extra = net.extra;
  net.conn = null; net.pj = null; net.peer = null; net.extra = [];
  safe(() => c && c.close()); safe(() => p && p.destroy()); extra.forEach(x => safe(() => x.destroy()));
}
function relay(d) { const c = net.conn; if (c && c.open) safe(() => c.send(d)); }
function peerMsg(err) {
  const t = err && err.type;
  if (t === 'peer-unavailable') return 'Room not found. Check the code.';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'Could not reach the PeerJS matchmaking service. Check your connection.';
  if (t === 'browser-incompatible') return 'This browser does not support WebRTC.';
  return 'Connection problem' + (t ? ` (${t})` : '') + '.';
}
function netFail(msg) { closeNet(); $('multiStatus').textContent = msg; show('scrMulti'); }
function needPeer() {
  if (typeof Peer !== 'undefined') return true;
  $('multiStatus').textContent = 'Multiplayer library failed to load. Check your connection and reload.';
  return false;
}
function myProfileMsg() { const s = statsFor(profile.sel); return { name: profile.name, char: profile.sel, atk: s.atk, hp: s.hp }; }

function attachConn(conn, tk) {
  net.conn = conn;
  conn.on('open', () => { if (tk === net.token && net.conn === conn) onLinkOpen(); });
  conn.on('data', d => { if (tk === net.token && net.conn === conn) onRelay(d); });
  const closed = () => { if (tk === net.token && net.conn === conn) onLinkClosed(); };
  conn.on('close', closed); conn.on('error', closed);
  if (conn.open) onLinkOpen();
}
function onLinkOpen() { relay({ k: 'prof', p: myProfileMsg() }); refreshLobby(); }
function onLinkClosed() {
  net.conn = null; net.peer = null; clearInterval(cdTimer); cdTimer = 0;
  if (game) {
    if (game.isHost) {
      const gp = game.players[1];
      if (gp) { gp.gone = true; gp.alive = false; }
      toast('Your friend left the game');
      checkOver(game);
    } else { toast('The host left the game'); leaveGame(); }
    return;
  }
  if (net.isHost && !lobby.auto) refreshLobby(); // room stays open for another friend
  else netFail(net.isHost ? 'Your partner left.' : 'The host left the room.');
}

function hostAccept(p, c, tk) {
  if (tk !== net.token || net.pj !== p) return safe(() => c.close());
  if ((net.conn && net.conn.open) || game) { // room already has two players
    c.on('open', () => { safe(() => c.send({ k: 'full' })); setTimeout(() => safe(() => c.close()), 300); });
    return;
  }
  attachConn(c, tk);
}
function createRoom() {
  if (!needPeer()) return;
  closeNet(); const tk = net.token; net.isHost = true; net.id = 0;
  $('multiStatus').textContent = 'Creating room…';
  const attempt = n => {
    const code = mkCode(), p = new Peer(PJ_PREFIX + code, PJ_OPTS);
    net.pj = p;
    p.on('open', () => { if (tk !== net.token || net.pj !== p) return; lobby = { code, players: [], hostId: 0, auto: false, searching: false }; refreshLobby(); });
    p.on('connection', c => hostAccept(p, c, tk));
    p.on('error', err => {
      if (tk !== net.token || net.pj !== p) return;
      if (err.type === 'unavailable-id' && n < 4) { safe(() => p.destroy()); attempt(n + 1); } else netFail(peerMsg(err));
    });
    p.on('disconnected', () => { if (tk === net.token && net.pj === p) safe(() => p.reconnect()); });
  };
  attempt(0);
}
function connectRoom(p, code, tk, auto) {
  const conn = p.connect(PJ_PREFIX + code, { reliable: true, serialization: 'json' });
  net.isHost = false; net.id = 1;
  lobby = { code, players: [], hostId: 0, auto, searching: false };
  attachConn(conn, tk);
  setTimeout(() => { if (tk === net.token && net.conn === conn && !conn.open) netFail('Could not connect to that room.'); }, 12000);
}
function joinRoom(code) {
  if (!needPeer()) return;
  closeNet(); const tk = net.token;
  $('multiStatus').textContent = 'Joining…';
  const p = new Peer(PJ_OPTS); net.pj = p;
  p.on('open', () => { if (tk === net.token && net.pj === p) connectRoom(p, code, tk, false); });
  p.on('error', err => { if (tk === net.token && net.pj === p) netFail(peerMsg(err)); });
}

// ----- Find Game -----
function findGame() {
  if (!needPeer()) return;
  closeNet(); const tk = net.token;
  lobby = { code: '', players: [], hostId: 0, auto: true, searching: true };
  show('scrLobby'); renderLobby();
  scanSlot(tk, 0, 0);
}
function scanSlot(tk, i, n) {
  if (tk !== net.token) return;
  if (i >= FIND_SLOTS) { net.findTimer = setTimeout(() => scanSlot(tk, 0, 0), 2500 + rnd(2000)); return; }
  const p = new Peer(PJ_PREFIX + 'q' + i, PJ_OPTS); net.pj = p;
  let settled = false;
  p.on('open', () => { if (tk !== net.token || net.pj !== p) return; settled = true; waitForPartner(tk, p); });
  p.on('error', err => {
    if (tk !== net.token || net.pj !== p || settled) return;
    if (err.type === 'unavailable-id') { safe(() => p.destroy()); joinSlot(tk, i, n); } else netFail(peerMsg(err));
  });
}
function waitForPartner(tk, p) {
  let matched = false;
  p.on('connection', c => {
    if (tk !== net.token || net.pj !== p) return safe(() => c.close());
    c.on('open', () => {
      if (matched || tk !== net.token) { safe(() => c.send({ k: 'busy' })); setTimeout(() => safe(() => c.close()), 300); return; }
      matched = true; makeMatchRoom(tk, p, c, 0);
    });
  });
  p.on('disconnected', () => { if (tk === net.token && net.pj === p && !matched) safe(() => p.reconnect()); });
  // re-scan from slot 0 now and then so two waiters that landed on different slots still find each other
  net.findTimer = setTimeout(() => { if (tk === net.token && net.pj === p && !matched) { safe(() => p.destroy()); scanSlot(tk, 0, 0); } }, 12000 + rnd(8000));
}
function makeMatchRoom(tk, sp, c, n) {
  const code = mkCode(), rp = new Peer(PJ_PREFIX + code, PJ_OPTS);
  net.pj = rp; net.extra = [sp]; net.isHost = true; net.id = 0;
  rp.on('open', () => {
    if (tk !== net.token || net.pj !== rp) return;
    lobby = { code, players: [], hostId: 0, auto: true, searching: false };
    safe(() => c.send({ k: 'match', room: code }));
    setTimeout(() => { safe(() => c.close()); safe(() => sp.destroy()); if (tk === net.token) net.extra = []; }, 600); // frees the slot
    refreshLobby();
  });
  rp.on('connection', x => hostAccept(rp, x, tk));
  rp.on('error', err => {
    if (tk !== net.token || net.pj !== rp) return;
    if (err.type === 'unavailable-id' && n < 3) { safe(() => rp.destroy()); makeMatchRoom(tk, sp, c, n + 1); } else netFail(peerMsg(err));
  });
}
function joinSlot(tk, i, n) {
  const p = new Peer(PJ_OPTS); net.pj = p;
  let done = false;
  const next = same => { if (done) return; done = true; safe(() => p.destroy()); if (tk === net.token) scanSlot(tk, same && n < 2 ? i : i + 1, same ? n + 1 : 0); };
  p.on('open', () => {
    if (tk !== net.token || net.pj !== p) return;
    const c = p.connect(PJ_PREFIX + 'q' + i, { reliable: true, serialization: 'json' });
    const to = setTimeout(() => { safe(() => c.close()); next(false); }, 6000);
    c.on('data', d => {
      if (done || tk !== net.token || !d) return;
      if (d.k === 'match' && /^[A-Z0-9]{5}$/.test(String(d.room))) { done = true; clearTimeout(to); safe(() => c.close()); connectRoom(p, d.room, tk, true); }
      else if (d.k === 'busy') { clearTimeout(to); next(false); }
    });
    c.on('error', () => { clearTimeout(to); next(false); });
    c.on('close', () => { if (!done) { clearTimeout(to); next(false); } });
  });
  p.on('error', err => {
    if (tk !== net.token || net.pj !== p) return;
    if (done) { netFail('The match fell through. Try again.'); return; }
    if (err.type === 'peer-unavailable') next(true); else netFail(peerMsg(err));
  });
}

// ----- lobby -----
function refreshLobby() {
  if (game) return;
  const linked = !!(net.conn && net.conn.open);
  const me = { id: net.id, name: profile.name }, other = { id: 1 - net.id, name: net.peer ? net.peer.name : '…' };
  const list = [];
  if (net.isHost) { list.push(me); if (linked) list.push(other); } else { if (linked) list.push(other); list.push(me); }
  lobby.players = list; lobby.hostId = 0;
  if (list.length < 2) { clearInterval(cdTimer); cdTimer = 0; }
  show('scrLobby'); renderLobby(); maybeAutoStart();
}
function maybeAutoStart() {
  if (!lobby.auto || !net.isHost || lobby.players.length < 2 || !net.peer || cdTimer || game) return;
  let n = 3;
  $('lobbyStatus').textContent = `Match found! Starting in ${n}…`;
  cdTimer = setInterval(() => {
    n--;
    if (n <= 0) { clearInterval(cdTimer); cdTimer = 0; hostStart(); }
    else $('lobbyStatus').textContent = `Match found! Starting in ${n}…`;
  }, 1000);
}
function renderLobby() {
  const showCode = !!lobby.code && !lobby.auto;
  $('lobbyCodeBox').classList.toggle('hidden', !showCode);
  $('lobbyCode').textContent = lobby.code || '-----';
  $('lobbyTitle').textContent = lobby.auto ? 'Find Game' : 'Game Room';
  const ul = $('lobbyPlayers'); ul.innerHTML = '';
  (lobby.players || []).forEach(p => {
    const me = p.id === net.id;
    const ch = me ? CHARS[profile.sel].name : (net.peer ? CHARS[net.peer.char].name : '…');
    const li = document.createElement('li');
    li.textContent = `${p.name}${me ? ' (you)' : ''}${p.id === lobby.hostId ? ' ★' : ''} — ${ch}`;
    ul.appendChild(li);
  });
  const n = (lobby.players || []).length;
  let st = '';
  if (lobby.searching) st = 'Searching for other players…';
  else if (n < 2) st = lobby.auto ? 'Waiting for the other player…' : 'Waiting for your friend to join…';
  else if (lobby.auto) st = 'Match found! Starting soon…';
  else st = net.isHost ? 'Ready — press Start!' : 'Waiting for the host to start…';
  if (!cdTimer) $('lobbyStatus').textContent = st;
  $('btnLobbyStart').classList.toggle('hidden', !(net.isHost && !lobby.auto && n === 2));
  $('btnLobbyStart').disabled = !net.peer;
}
function onRelay(d) {
  if (!d) return;
  switch (d.k) {
    case 'full': netFail('That room is full.'); break;
    case 'prof': {
      const p = d.p || {};
      if (!CHARS[p.char]) return;
      net.peer = { name: String(p.name || 'Friend').slice(0, 12), char: p.char, atk: clamp(+p.atk || 1, 1, 9999), hp: clamp(+p.hp || 1, 1, 99999) };
      if (!game) refreshLobby();
      break;
    }
    case 'start': if (!game) { clearInterval(cdTimer); cdTimer = 0; startGuest(d.pid); } break;
    case 'lvl': if (game && !game.isHost) applyLevel(game, d); break;
    case 's': if (game && !game.isHost && game.grid) applySnap(game, d); break;
    case 'in': if (game && game.isHost) {
      const i = game.inputs[1] || (game.inputs[1] = { mx: 0, my: 0, atk: false, sp: false });
      i.mx = clamp(+d.mx || 0, -1, 1); i.my = clamp(+d.my || 0, -1, 1); i.atk = !!d.atk; if (d.sp) i.sp = true;
    } break;
    case 'over': if (game && !game.isHost) { game.stage = d.stage; game.level = d.level; game.over = true; showOver(game); } break;
  }
}

// ---------------- level generation ----------------
function bfs(grid, sx, sy) {
  const f = new Int16Array(COLS * ROWS).fill(-1);
  const q = [sy * COLS + sx]; f[q[0]] = 0;
  for (let i = 0; i < q.length; i++) {
    const cur = q[i], c = cur % COLS, r = (cur / COLS) | 0;
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const k = nr * COLS + nc;
      if (f[k] >= 0 || grid[nr][nc] !== 0) continue;
      f[k] = f[cur] + 1; q.push(k);
    }
  }
  return f;
}
function genLevel(stage, level) {
  const boss = level === 10;
  let last = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const g = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) row.push((r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) ? 1 : 0);
      g.push(row);
    }
    const nb = attempt >= 55 ? 0 : (boss ? 5 : 7 + Math.floor(level * 0.9) + Math.min(stage, 4));
    for (let i = 0; i < nb; i++) {
      const bw = 1 + rnd(3), bh = 1 + rnd(3);
      const c = 6 + rnd(COLS - 8 - bw), r = 1 + rnd(ROWS - 2 - bh);
      for (let y = r; y < r + bh; y++) for (let x = c; x < c + bw; x++) g[y][x] = 1;
    }
    const side = ['right', 'top', 'bottom'][rnd(3)];
    let dc, dr, ic, ir;
    if (side === 'right') { dc = COLS - 1; dr = 3 + rnd(ROWS - 6); ic = dc - 1; ir = dr; }
    else if (side === 'top') { dr = 0; dc = 12 + rnd(COLS - 14); ic = dc; ir = 1; }
    else { dr = ROWS - 1; dc = 12 + rnd(COLS - 14); ic = dc; ir = ROWS - 2; }
    g[dr][dc] = 2; g[ir][ic] = 0;
    const f = bfs(g, 2, ROWS >> 1);
    const cells = [];
    for (let r = 1; r < ROWS - 1; r++) for (let c = 9; c < COLS - 1; c++) if (f[r * COLS + c] >= 0) cells.push([c, r]);
    last = { grid: g, door: { c: dc, r: dr, ic, ir }, cells };
    if (f[ir * COLS + ic] >= 0 && cells.length > 20) return last;
  }
  return last;
}

// ---------------- game state ----------------
let game = null;
const ctl = { sp: false };

function makePlayer(d, id) {
  return { id, name: d.name, char: d.char, atk: d.atk, maxhp: d.hp, hp: d.hp, x: 0, y: 0, r: 10, face: 0, alive: true,
    atkCd: 0, spCd: 0, cp: 0, speed: CHARS[d.char].speed, hurt: 0, gone: false };
}
function newGameBase(isHost, pid, multi) {
  return { isHost, pid, multi, stage: 1, level: 1, grid: null, door: null, players: [], enemies: [], proj: [], pickups: [], fx: [], fxq: [],
    inputs: {}, fields: {}, fieldT: 0, nid: 1, acc: 0, snapT: 0, sendT: 0, time: 0, over: false, seenCp: 0, banner: null };
}
function startSingle() {
  const s = statsFor(profile.sel);
  const g = newGameBase(true, 0, false);
  g.players = [makePlayer({ name: profile.name, char: profile.sel, atk: s.atk, hp: s.hp }, 0)];
  game = g; enterGameUI(); loadLevel(g, true);
}
function hostStart() {
  if (!net.peer || game) return;
  relay({ k: 'start', pid: 1 });
  const s = statsFor(profile.sel);
  const g = newGameBase(true, 0, true);
  g.players = [makePlayer({ name: profile.name, char: profile.sel, atk: s.atk, hp: s.hp }, 0), makePlayer(net.peer, 1)];
  game = g; enterGameUI(); loadLevel(g, true);
}
function startGuest(pid) {
  game = newGameBase(false, pid, true);
  enterGameUI();
}
function enterGameUI() {
  show(null);
  $('controls').classList.remove('hidden'); $('btnQuit').classList.remove('hidden');
  document.body.classList.add('playing');
  ctl.sp = false;
}
function leaveGame() {
  game = null;
  ctl.sp = false; ui.atk = false; joy.active = false; joy.id = null;
  $('controls').classList.add('hidden'); $('btnQuit').classList.add('hidden');
  document.body.classList.remove('playing');
  closeNet();
  updateMenu(); show('scrMenu');
}

function loadLevel(g, first) {
  const L = genLevel(g.stage, g.level);
  g.grid = L.grid; g.door = { c: L.door.c, r: L.door.r, ic: L.door.ic, ir: L.door.ir, open: false };
  g.enemies = []; g.proj = []; g.pickups = []; g.fields = {}; g.fieldT = 0;
  g.players.forEach((p, i) => {
    if (p.gone) return;
    p.x = 2.5 * TILE; p.y = (ROWS / 2 + (i === 0 ? -1 : 1) - 0.5 + 0.5) * TILE; p.atkCd = 0;
    if (!first) {
      if (!p.alive) { p.alive = true; p.hp = Math.ceil(p.maxhp * 0.5); }
      else p.hp = Math.min(p.maxhp, p.hp + Math.ceil(p.maxhp * 0.15));
    }
    const inp = g.inputs[p.id]; if (inp) inp.sp = false;
  });
  spawnEnemies(g, L);
  g.banner = { text: g.level === 10 ? `Stage ${g.stage}-${g.level} — BOSS` : `Stage ${g.stage}-${g.level}`, t: 0 };
  noteProgress(g);
  if (g.multi) {
    relay({ k: 'lvl', stage: g.stage, level: g.level, grid: g.grid.map(r => r.join('')),
      door: { c: g.door.c, r: g.door.r, ic: g.door.ic, ir: g.door.ir },
      players: g.players.map(p => ({ id: p.id, name: p.name, char: p.char, atk: p.atk, maxhp: p.maxhp, hp: p.hp, alive: p.alive, gone: p.gone, cp: p.cp, x: p.x, y: p.y })) });
  }
}
function spawnEnemies(g, L) {
  const m = 1 + 0.2 * (g.stage - 1);
  const list = [];
  if (g.level === 10) {
    list.push('troll');
    for (let i = 0; i < Math.min(6, 1 + g.stage); i++) list.push('rat');
  } else {
    const n = Math.min(20, 2 + g.level + (g.stage - 1) * 2);
    const pg = Math.min(0.75, 0.05 + g.level * 0.07 + (g.stage - 1) * 0.05);
    for (let i = 0; i < n; i++) list.push(Math.random() < pg ? 'goblin' : 'rat');
  }
  const placed = [];
  for (const type of list) {
    const def = ENEMIES[type];
    let pos = null;
    for (let t = 0; t < 80 && !pos; t++) {
      const [c, r] = L.cells[rnd(L.cells.length)];
      const x = (c + 0.5) * TILE, y = (r + 0.5) * TILE;
      if (placed.every(q => Math.hypot(q.x - x, q.y - y) > 40)) pos = { x, y };
    }
    if (!pos) { const [c, r] = L.cells[rnd(L.cells.length)]; pos = { x: (c + 0.5) * TILE, y: (r + 0.5) * TILE }; }
    placed.push(pos);
    g.enemies.push({ id: g.nid++, type, x: pos.x, y: pos.y, r: def.r, hp: Math.ceil(def.hp * m), maxhp: Math.ceil(def.hp * m),
      atk: def.atk * m, speed: def.speed * (0.9 + Math.random() * 0.2), cd: 0.6 + Math.random() * 0.6, hurt: 0, face: Math.PI, dead: false });
  }
}
function noteProgress(g) {
  const b = profile.best;
  if (g.stage > b.stage || (g.stage === b.stage && g.level > b.level)) { b.stage = g.stage; b.level = g.level; saveProfile(); }
}

// ---------------- collision ----------------
function solid(g, c, r) {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
  const t = g.grid[r][c];
  return t === 1 || (t === 2 && !g.door.open);
}
function hitsWall(g, x, y, r) {
  const c0 = Math.floor((x - r) / TILE), c1 = Math.floor((x + r) / TILE), r0 = Math.floor((y - r) / TILE), r1 = Math.floor((y + r) / TILE);
  for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) if (solid(g, cc, rr)) return true;
  return false;
}
function moveEnt(g, e, dx, dy) {
  const nx = e.x + dx; if (!hitsWall(g, nx, e.y, e.r)) e.x = nx;
  const ny = e.y + dy; if (!hitsWall(g, e.x, ny, e.r)) e.y = ny;
}
function clearLine(g, x1, y1, x2, y2, r) {
  const d = Math.hypot(x2 - x1, y2 - y1), n = Math.ceil(d / (TILE / 4));
  for (let i = 1; i < n; i++) { const t = i / n; if (hitsWall(g, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, r)) return false; }
  return true;
}
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

// ---------------- effects ----------------
const FX_LIFE = { slash: 0.22, spin: 0.45, chain: 0.3, ray: 0.35, txt: 0.9, poof: 0.35, heal: 0.55, door: 0.6 };
function pushFx(g, f) { g.fx.push(Object.assign({ t: 0, life: FX_LIFE[f.type] || 0.4 }, f)); }
function addFx(g, f) { pushFx(g, f); if (g.multi && g.isHost) g.fxq.push(f); }

// ---------------- simulation (host) ----------------
function nearestEnemy(g, x, y, maxd, skip) {
  let b = null, bd = maxd;
  for (const e of g.enemies) {
    if (e.dead || (skip && skip.has(e))) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bd) { bd = d; b = e; }
  }
  return b;
}
function nearestPlayer(g, x, y) {
  let b = null, bd = 1e9;
  for (const p of g.players) {
    if (!p.alive || p.gone) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) { bd = d; b = p; }
  }
  return b;
}
function hitEnemy(g, e, dmg) {
  if (e.dead) return;
  const d = Math.max(1, Math.round(dmg));
  e.hp -= d; e.hurt = 0.12;
  addFx(g, { type: 'txt', x: e.x, y: e.y - e.r - 8, s: String(d), c: '#ffffff' });
  if (e.hp <= 0) {
    e.dead = true;
    addFx(g, { type: 'poof', x: e.x, y: e.y });
    if (!ENEMIES[e.type].boss && Math.random() < DROP_CHANCE) g.pickups.push({ id: g.nid++, x: e.x, y: e.y });
  }
}
function heal(g, t, v) {
  const n = Math.max(0, Math.min(t.maxhp - t.hp, Math.round(v)));
  t.hp += n;
  addFx(g, { type: 'heal', x: t.x, y: t.y });
  if (n > 0) addFx(g, { type: 'txt', x: t.x, y: t.y - 18, s: '+' + n, c: '#69f0ae' });
}
function doAttack(g, p) {
  const t = nearestEnemy(g, p.x, p.y, p.char === 'warrior' ? 120 : 300);
  if (t) p.face = Math.atan2(t.y - p.y, t.x - p.x);
  if (p.char === 'warrior') {
    for (const e of g.enemies) {
      if (e.dead) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (d > 58 + e.r) continue;
      if (d < e.r + p.r + 6 || Math.abs(angDiff(Math.atan2(dy, dx), p.face)) <= 1.25) hitEnemy(g, e, p.atk);
    }
    addFx(g, { type: 'slash', x: p.x, y: p.y, a: p.face });
  } else {
    const sp = p.char === 'mage' ? 400 : 340;
    // spawn at the caster's center so point-blank enemies (or a wall behind the muzzle) can't swallow the shot
    g.proj.push({ id: g.nid++, x: p.x, y: p.y, vx: Math.cos(p.face) * sp, vy: Math.sin(p.face) * sp,
      dmg: p.atk, life: 0.9, kind: p.char, dead: false });
  }
}
function doSpecial(g, p) {
  if (p.char === 'warrior') {
    for (const e of g.enemies) if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) <= 85 + e.r) hitEnemy(g, e, 1.5 * p.atk);
    addFx(g, { type: 'spin', x: p.x, y: p.y, r: 85 });
    return true;
  }
  if (p.char === 'mage') {
    const first = nearestEnemy(g, p.x, p.y, 320);
    if (!first) return false;
    const hit = new Set([first]);
    let dmg = 1.3 * p.atk, cur = first;
    const pts = [[p.x, p.y], [first.x, first.y]];
    hitEnemy(g, first, dmg);
    for (let b = 0; b < 3; b++) {
      const nx = nearestEnemy(g, cur.x, cur.y, 170, hit);
      if (!nx) break;
      dmg *= 0.8; hit.add(nx); pts.push([nx.x, nx.y]); hitEnemy(g, nx, dmg); cur = nx;
    }
    addFx(g, { type: 'chain', pts });
    return true;
  }
  // healer
  const amt = 15 + 0.5 * p.atk;
  const allies = g.players.filter(a => a !== p && a.alive && !a.gone);
  if (allies.length) {
    const a = allies.reduce((m, x) => (x.hp / x.maxhp < m.hp / m.maxhp ? x : m));
    heal(g, a, amt); heal(g, p, amt / 2);
    addFx(g, { type: 'ray', x1: p.x, y1: p.y, x2: a.x, y2: a.y });
  } else heal(g, p, amt); // solo: no ally to share with, so the whole heal goes to self
  return true;
}
function hurtPlayer(g, p, dmg) {
  p.hp -= dmg; p.hurt = 0.15;
  addFx(g, { type: 'txt', x: p.x, y: p.y - 18, s: '-' + dmg, c: '#ff5252' });
  if (p.hp <= 0) { p.hp = 0; p.alive = false; addFx(g, { type: 'poof', x: p.x, y: p.y }); addFx(g, { type: 'txt', x: p.x, y: p.y - 30, s: 'DOWN!', c: '#ff8a80' }); }
}

function step(g, dt) {
  g.time += dt;
  if (g.banner) { g.banner.t += dt; if (g.banner.t > 2.2) g.banner = null; }
  // players
  for (const p of g.players) {
    if (p.gone) continue;
    p.hurt = Math.max(0, p.hurt - dt);
    if (!p.alive) continue;
    const inp = g.inputs[p.id] || (g.inputs[p.id] = { mx: 0, my: 0, atk: false, sp: false });
    let mx = +inp.mx || 0, my = +inp.my || 0;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    if (len > 0.08) { moveEnt(g, p, mx * p.speed * dt, my * p.speed * dt); p.face = Math.atan2(my, mx); }
    p.atkCd -= dt; p.spCd = Math.max(0, p.spCd - dt);
    if (inp.atk && p.atkCd <= 0) { doAttack(g, p); p.atkCd = CHARS[p.char].cd; }
    if (inp.sp) { inp.sp = false; if (p.spCd <= 0 && doSpecial(g, p)) p.spCd = SPECIAL_CD; }
  }
  // path fields
  g.fieldT -= dt;
  if (g.fieldT <= 0) {
    g.fieldT = 0.25;
    for (const p of g.players) if (p.alive && !p.gone) g.fields[p.id] = bfs(g.grid, clamp(Math.floor(p.x / TILE), 0, COLS - 1), clamp(Math.floor(p.y / TILE), 0, ROWS - 1));
  }
  // enemies
  for (const e of g.enemies) {
    if (e.dead) continue;
    e.hurt = Math.max(0, e.hurt - dt); e.cd -= dt;
    const tgt = nearestPlayer(g, e.x, e.y);
    if (!tgt) continue;
    const d = Math.hypot(tgt.x - e.x, tgt.y - e.y);
    e.face = Math.atan2(tgt.y - e.y, tgt.x - e.x);
    if (d > e.r + tgt.r + 4) {
      let tx = tgt.x, ty = tgt.y;
      if (!clearLine(g, e.x, e.y, tgt.x, tgt.y, e.r + 1)) {
        const f = g.fields[tgt.id];
        if (f) {
          const c = clamp(Math.floor(e.x / TILE), 0, COLS - 1), r = clamp(Math.floor(e.y / TILE), 0, ROWS - 1);
          let best = f[r * COLS + c], bc = c, br = r;
          for (const [dc, dr] of DIRS) {
            const nc = c + dc, nr = r + dr;
            if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
            const v = f[nr * COLS + nc];
            if (v >= 0 && (best < 0 || v < best)) { best = v; bc = nc; br = nr; }
          }
          if (bc !== c || br !== r) { tx = (bc + 0.5) * TILE; ty = (br + 0.5) * TILE; }
        }
      }
      const dx = tx - e.x, dy = ty - e.y, dl = Math.hypot(dx, dy) || 1, sp = e.speed * dt, ox = e.x, oy = e.y;
      moveEnt(g, e, dx / dl * sp, dy / dl * sp);
      if (Math.hypot(e.x - ox, e.y - oy) < sp * 0.5) {
        // snagged on a wall corner: slide along the free axis at full speed
        if (Math.abs(dx) >= Math.abs(dy)) { moveEnt(g, e, 0, (dy >= 0 ? 1 : -1) * sp); if (e.y === oy) moveEnt(g, e, Math.sign(dx) * sp, 0); }
        else { moveEnt(g, e, (dx >= 0 ? 1 : -1) * sp, 0); if (e.x === ox) moveEnt(g, e, 0, Math.sign(dy) * sp); }
      }
    }
    if (d <= e.r + tgt.r + 8 && e.cd <= 0) { e.cd = ENEMIES[e.type].cd; hurtPlayer(g, tgt, Math.max(1, Math.round(e.atk))); }
  }
  // enemy separation
  for (let i = 0; i < g.enemies.length; i++) for (let j = i + 1; j < g.enemies.length; j++) {
    const a = g.enemies[i], b = g.enemies[j];
    if (a.dead || b.dead) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = (a.r + b.r) * 0.9;
    if (d < min && d > 0.01) { const push = 40 * dt / d; moveEnt(g, a, -dx * push, -dy * push); moveEnt(g, b, dx * push, dy * push); }
  }
  // projectiles
  for (const j of g.proj) {
    j.x += j.vx * dt; j.y += j.vy * dt; j.life -= dt;
    if (j.life <= 0 || hitsWall(g, j.x, j.y, 2)) { j.dead = true; continue; }
    for (const e of g.enemies) {
      if (!e.dead && Math.hypot(e.x - j.x, e.y - j.y) < e.r + 5) { hitEnemy(g, e, j.dmg); j.dead = true; break; }
    }
  }
  // pickups
  for (const k of g.pickups) {
    for (const p of g.players) {
      if (p.alive && !p.gone && Math.hypot(p.x - k.x, p.y - k.y) < p.r + 10) {
        p.cp++; k.dead = true;
        addFx(g, { type: 'txt', x: k.x, y: k.y - 10, s: '+1 CP', c: '#ffd600' });
        break;
      }
    }
  }
  g.enemies = g.enemies.filter(e => !e.dead);
  g.proj = g.proj.filter(j => !j.dead);
  g.pickups = g.pickups.filter(k => !k.dead);
  // door
  if (!g.door.open && g.enemies.length === 0) { g.door.open = true; addFx(g, { type: 'door', x: (g.door.c + 0.5) * TILE, y: (g.door.r + 0.5) * TILE }); }
  if (g.door.open) {
    const d = g.door;
    for (const p of g.players) {
      if (p.alive && !p.gone && p.x >= d.c * TILE - 2 && p.x <= (d.c + 1) * TILE + 2 && p.y >= d.r * TILE - 2 && p.y <= (d.r + 1) * TILE + 2) {
        g.level++; if (g.level > 10) { g.level = 1; g.stage++; }
        loadLevel(g, false);
        return;
      }
    }
  }
  checkOver(g);
}
function checkOver(g) {
  if (g.over || !g.grid) return;
  if (g.players.every(p => !p.alive || p.gone)) {
    g.over = true;
    if (g.multi) relay({ k: 'over', stage: g.stage, level: g.level });
    showOver(g);
  }
}
function showOver(g) {
  const me = g.players[g.pid];
  $('overStage').textContent = `You reached Stage ${g.stage}-${g.level}`;
  $('overCp').textContent = `Character Points earned: 🟡 ${me ? me.cp : 0}`;
  $('controls').classList.add('hidden'); $('btnQuit').classList.add('hidden');
  show('scrOver');
}

// ---------------- snapshots (host -> guest) ----------------
const r1 = v => Math.round(v * 10) / 10;
function snapshot(g) {
  const s = {
    k: 's', d: g.door.open ? 1 : 0,
    p: g.players.map(p => [r1(p.x), r1(p.y), p.hp, Math.round(p.face * 100) / 100, r1(p.spCd), p.alive ? 1 : 0, p.cp, p.gone ? 1 : 0, Math.round(p.hurt * 100) / 100]),
    e: g.enemies.map(e => [e.id, e.type, r1(e.x), r1(e.y), e.hp, e.maxhp, Math.round(e.face * 100) / 100, Math.round(e.hurt * 100) / 100]),
    j: g.proj.map(j => [j.id, r1(j.x), r1(j.y), j.kind, Math.round(Math.atan2(j.vy, j.vx) * 100) / 100]),
    c: g.pickups.map(k => [k.id, r1(k.x), r1(k.y)]),
    f: g.fxq,
  };
  g.fxq = [];
  return s;
}
function applyLevel(g, m) {
  g.stage = m.stage; g.level = m.level;
  g.grid = m.grid.map(r => [...r].map(Number));
  g.door = { c: m.door.c, r: m.door.r, ic: m.door.ic, ir: m.door.ir, open: false };
  g.enemies = []; g.proj = []; g.pickups = []; g.fx = [];
  g.players = m.players.map(p => Object.assign({ r: 10, face: 0, spCd: 0, hurt: 0, tx: p.x, ty: p.y }, p));
  g.banner = { text: m.level === 10 ? `Stage ${m.stage}-${m.level} — BOSS` : `Stage ${m.stage}-${m.level}`, t: 0 };
  noteProgress(g);
}
function applySnap(g, s) {
  g.door.open = !!s.d;
  s.p.forEach((a, i) => {
    const p = g.players[i]; if (!p) return;
    p.tx = a[0]; p.ty = a[1]; p.hp = a[2]; p.face = a[3]; p.spCd = a[4]; p.alive = !!a[5]; p.cp = a[6]; p.gone = !!a[7]; p.hurt = a[8];
  });
  const oldE = new Map(g.enemies.map(e => [e.id, e]));
  g.enemies = s.e.map(a => {
    let e = oldE.get(a[0]);
    if (!e) e = { id: a[0], type: a[1], x: a[2], y: a[3], r: ENEMIES[a[1]].r };
    e.tx = a[2]; e.ty = a[3]; e.hp = a[4]; e.maxhp = a[5]; e.face = a[6]; e.hurt = a[7];
    return e;
  });
  const oldJ = new Map(g.proj.map(j => [j.id, j]));
  g.proj = s.j.map(a => {
    let j = oldJ.get(a[0]);
    if (!j) j = { id: a[0], x: a[1], y: a[2] };
    j.tx = a[1]; j.ty = a[2]; j.kind = a[3]; j.ang = a[4];
    return j;
  });
  g.pickups = s.c.map(a => ({ id: a[0], x: a[1], y: a[2] }));
  (s.f || []).forEach(f => pushFx(g, f));
}
function smooth(g, dt) {
  const k = 1 - Math.exp(-dt * 18);
  const f = o => {
    if (o.tx === undefined) return;
    if (Math.abs(o.tx - o.x) + Math.abs(o.ty - o.y) > 100) { o.x = o.tx; o.y = o.ty; }
    else { o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; }
  };
  g.players.forEach(f); g.enemies.forEach(f); g.proj.forEach(f);
}

// ---------------- input ----------------
const cv = $('game'), ctx = cv.getContext('2d');
const ui = { atk: false };
const keys = new Set();
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0, active: false };
const JR = 60;

cv.addEventListener('pointerdown', e => {
  if (!game || game.over || joy.id !== null) return;
  joy.id = e.pointerId; joy.ox = joy.x = e.clientX; joy.oy = joy.y = e.clientY; joy.active = true;
  try { cv.setPointerCapture(e.pointerId); } catch (err) {}
  e.preventDefault();
});
cv.addEventListener('pointermove', e => { if (e.pointerId === joy.id) { joy.x = e.clientX; joy.y = e.clientY; } });
const endJoy = e => { if (e.pointerId === joy.id) { joy.id = null; joy.active = false; } };
cv.addEventListener('pointerup', endJoy);
cv.addEventListener('pointercancel', endJoy);

const btnAtk = $('btnAtk'), btnSp = $('btnSp');
let atkPtr = null;
btnAtk.addEventListener('pointerdown', e => { ui.atk = true; atkPtr = e.pointerId; btnAtk.classList.add('down'); try { btnAtk.setPointerCapture(e.pointerId); } catch (err) {} e.preventDefault(); });
const atkUp = e => { if (e.pointerId === atkPtr) { ui.atk = false; atkPtr = null; btnAtk.classList.remove('down'); } };
['pointerup', 'pointercancel'].forEach(t => btnAtk.addEventListener(t, atkUp));
btnSp.addEventListener('pointerdown', e => { ctl.sp = true; btnSp.classList.add('down'); e.preventDefault(); });
['pointerup', 'pointercancel', 'pointerleave'].forEach(t => btnSp.addEventListener(t, () => btnSp.classList.remove('down')));

window.addEventListener('keydown', e => {
  if (!game || game.over) return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyJ', 'KeyK', 'KeyL', 'ShiftLeft'].includes(e.code)) e.preventDefault();
  if (!e.repeat && ['KeyK', 'KeyL', 'ShiftLeft'].includes(e.code)) ctl.sp = true;
  keys.add(e.code);
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('contextmenu', e => { if (game) e.preventDefault(); });

function readInput() {
  let mx = 0, my = 0;
  if (joy.active) {
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, len = Math.hypot(dx, dy);
    if (len > 6) { const m = Math.min(1, len / JR); mx = dx / len * m; my = dy / len * m; }
  } else {
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
    const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
  }
  return { mx, my, atk: ui.atk || keys.has('Space') || keys.has('KeyJ') };
}

// ---------------- main loop ----------------
function update(dt) {
  const g = game; if (!g) return;
  const inp = readInput();
  if (g.isHost) {
    const i0 = g.inputs[0] || (g.inputs[0] = { mx: 0, my: 0, atk: false, sp: false });
    i0.mx = inp.mx; i0.my = inp.my; i0.atk = inp.atk;
    if (ctl.sp) { i0.sp = true; ctl.sp = false; }
    if (!g.over && g.grid) {
      g.acc += dt; let n = 0;
      while (g.acc >= STEP && n < 5) { step(g, STEP); g.acc -= STEP; n++; if (!game || g.over) break; }
      if (g.acc > STEP) g.acc = 0;
    }
    if (game && g.multi && g.grid) { g.snapT += dt; if (g.snapT >= 0.05) { g.snapT = 0; relay(snapshot(g)); } }
  } else if (g.grid) {
    smooth(g, dt);
    if (g.banner) { g.banner.t += dt; if (g.banner.t > 2.2) g.banner = null; }
    g.sendT += dt;
    if (g.sendT >= 0.04) {
      g.sendT = 0;
      relay({ k: 'in', mx: Math.round(inp.mx * 100) / 100, my: Math.round(inp.my * 100) / 100, atk: inp.atk ? 1 : 0, sp: ctl.sp ? 1 : 0 });
      ctl.sp = false;
    }
  }
  if (!game) return;
  for (const f of g.fx) f.t += dt;
  g.fx = g.fx.filter(f => f.t < f.life);
  const me = g.players[g.pid];
  if (me) {
    if (me.cp > g.seenCp) { profile.cp += me.cp - g.seenCp; g.seenCp = me.cp; saveProfile(); toast('+1 Character Point!'); }
    const cd = me.spCd || 0;
    $('spCd').style.height = (cd / SPECIAL_CD * 100) + '%';
    $('spTxt').textContent = cd > 0 ? Math.ceil(cd) : CHARS[me.char].sym;
    btnSp.classList.toggle('ready', cd <= 0 && me.alive);
  }
}
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  update(dt);
  render();
}

// ---------------- drawing ----------------
let dpr = 1;
function resize() { dpr = Math.min(window.devicePixelRatio || 1, 2); cv.width = Math.floor(innerWidth * dpr); cv.height = Math.floor(innerHeight * dpr); }
window.addEventListener('resize', resize);

function drawChar(c, type, x, y, a, sc, hurt) {
  c.save(); c.translate(x, y); c.rotate(a); c.scale(sc, sc);
  const def = CHARS[type];
  c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(0, 2, 13, 11, 0, 0, 7); c.fill();
  // weapons (under the body)
  if (type === 'warrior') {
    c.fillStyle = '#8d6e63'; c.strokeStyle = '#4e342e'; c.lineWidth = 1.5; c.beginPath(); c.arc(9, -10, 6, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#cfd8dc'; c.fillRect(8, 7.5, 22, 3);
    c.beginPath(); c.moveTo(30, 7.5); c.lineTo(35, 9); c.lineTo(30, 10.5); c.fill();
    c.fillStyle = '#ffca28'; c.fillRect(8, 5, 3, 8);
  } else if (type === 'mage') {
    c.strokeStyle = '#8d6e63'; c.lineWidth = 3; c.beginPath(); c.moveTo(-6, 9); c.lineTo(24, 9); c.stroke();
    c.fillStyle = 'rgba(77,208,225,.35)'; c.beginPath(); c.arc(26, 9, 8, 0, 7); c.fill();
    c.fillStyle = '#4dd0e1'; c.beginPath(); c.arc(26, 9, 4.5, 0, 7); c.fill();
  } else {
    c.strokeStyle = '#a1887f'; c.lineWidth = 3; c.beginPath(); c.moveTo(-6, 9); c.lineTo(22, 9); c.stroke();
    c.fillStyle = '#fff'; c.fillRect(21, 7.8, 11, 2.6); c.fillRect(25.2, 3.6, 2.6, 11);
  }
  // body
  c.fillStyle = def.color; c.strokeStyle = def.dark; c.lineWidth = 2;
  c.beginPath(); c.ellipse(0, 0, 8, 13, 0, 0, 7); c.fill(); c.stroke();
  c.fillStyle = '#f1c27d'; c.beginPath(); c.arc(8, -10, 3.2, 0, 7); c.fill(); c.beginPath(); c.arc(8, 10, 3.2, 0, 7); c.fill();
  // head + headgear
  if (type === 'mage') {
    c.fillStyle = '#4527a0'; c.beginPath(); c.arc(0, 0, 11.5, 0, 7); c.fill();
    c.fillStyle = '#7e57c2'; c.beginPath(); c.arc(0, 0, 6.5, 0, 7); c.fill();
    c.fillStyle = '#ffd54f'; c.beginPath(); c.arc(1, 0, 2, 0, 7); c.fill();
  } else {
    c.fillStyle = '#f1c27d'; c.beginPath(); c.arc(1, 0, 7.5, 0, 7); c.fill();
    if (type === 'warrior') {
      c.fillStyle = '#90a4ae'; c.beginPath(); c.arc(0, 0, 8, Math.PI * 0.5, Math.PI * 1.5); c.fill();
      c.fillStyle = '#d32f2f'; c.fillRect(-7, -1.5, 12, 3);
    } else {
      c.fillStyle = '#e8f5e9'; c.beginPath(); c.arc(-1, 0, 8.5, Math.PI * 0.4, Math.PI * 1.6); c.fill();
    }
    c.fillStyle = '#333'; c.beginPath(); c.arc(5.5, -2.6, 1.1, 0, 7); c.fill(); c.beginPath(); c.arc(5.5, 2.6, 1.1, 0, 7); c.fill();
  }
  if (hurt) { c.fillStyle = 'rgba(255,255,255,.65)'; c.beginPath(); c.arc(0, 0, 14, 0, 7); c.fill(); }
  c.restore();
}
function drawEnemy(c, e) {
  c.save(); c.translate(e.x, e.y); c.rotate(e.face || 0);
  c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(0, 2, e.r + 3, e.r, 0, 0, 7); c.fill();
  if (e.type === 'rat') {
    c.strokeStyle = '#e8a0a0'; c.lineWidth = 2; c.beginPath(); c.moveTo(-8, 0); c.quadraticCurveTo(-14, 6, -20, 2); c.stroke();
    c.fillStyle = '#9e9e9e'; c.strokeStyle = '#616161'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(0, 0, 10, 7, 0, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#bdbdbd'; c.beginPath(); c.arc(8, 0, 5, 0, 7); c.fill();
    c.fillStyle = '#f8bbd0'; c.beginPath(); c.arc(6, -5, 2.6, 0, 7); c.fill(); c.beginPath(); c.arc(6, 5, 2.6, 0, 7); c.fill();
    c.fillStyle = '#d50000'; c.beginPath(); c.arc(10, -2, 1, 0, 7); c.fill(); c.beginPath(); c.arc(10, 2, 1, 0, 7); c.fill();
    c.fillStyle = '#f48fb1'; c.beginPath(); c.arc(13, 0, 1.4, 0, 7); c.fill();
  } else if (e.type === 'goblin') {
    c.strokeStyle = '#cfd8dc'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(8, 9); c.lineTo(21, 9); c.stroke();
    c.fillStyle = '#6aa84f'; c.strokeStyle = '#38761d'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 11, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#8fce6b';
    c.beginPath(); c.moveTo(1, -7); c.lineTo(-4, -19); c.lineTo(6, -9); c.fill();
    c.beginPath(); c.moveTo(1, 7); c.lineTo(-4, 19); c.lineTo(6, 9); c.fill();
    c.beginPath(); c.arc(3, 0, 7, 0, 7); c.fill();
    c.fillStyle = '#fdd835'; c.beginPath(); c.arc(7, -2.6, 1.4, 0, 7); c.fill(); c.beginPath(); c.arc(7, 2.6, 1.4, 0, 7); c.fill();
  } else {
    c.scale(1.5, 1.5);
    c.fillStyle = '#7b8f4a'; c.strokeStyle = '#4e5d2c'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 14, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#8fa35c'; c.beginPath(); c.arc(6, -14, 6, 0, 7); c.fill(); c.beginPath(); c.arc(6, 14, 6, 0, 7); c.fill();
    c.strokeStyle = '#6d4c2f'; c.lineWidth = 5; c.beginPath(); c.moveTo(8, 14); c.lineTo(26, 14); c.stroke();
    c.fillStyle = '#5d4037'; c.beginPath(); c.arc(28, 14, 6, 0, 7); c.fill();
    c.fillStyle = '#9aae63'; c.beginPath(); c.arc(4, 0, 8, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(11, -3); c.lineTo(15, -4); c.lineTo(12, -1); c.fill(); c.beginPath(); c.moveTo(11, 3); c.lineTo(15, 4); c.lineTo(12, 1); c.fill();
    c.fillStyle = '#d50000'; c.beginPath(); c.arc(8, -3, 1.3, 0, 7); c.fill(); c.beginPath(); c.arc(8, 3, 1.3, 0, 7); c.fill();
    c.scale(1 / 1.5, 1 / 1.5);
  }
  if (e.hurt > 0) { c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.arc(0, 0, e.type === 'troll' ? 22 : e.r + 2, 0, 7); c.fill(); }
  c.restore();
  const bw = e.type === 'troll' ? 44 : e.r * 2 + 6, by = e.y - (e.type === 'troll' ? 30 : e.r + 8);
  c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(e.x - bw / 2, by, bw, 4);
  c.fillStyle = '#e53935'; c.fillRect(e.x - bw / 2, by, bw * clamp(e.hp / e.maxhp, 0, 1), 4);
}

function drawWorld(g) {
  const t = g.time || performance.now() / 1000;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const v = g.grid[r][c], x = c * TILE, y = r * TILE;
    if (v === 1) {
      ctx.fillStyle = '#454c63'; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#5b6483'; ctx.fillRect(x, y, TILE, 4);
      ctx.fillStyle = '#2f3447'; ctx.fillRect(x, y + TILE - 5, TILE, 5);
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x + TILE / 2, y + 4, 1, TILE - 9);
    } else {
      ctx.fillStyle = (c + r) % 2 ? '#1f2433' : '#222839'; ctx.fillRect(x, y, TILE, TILE);
    }
  }
  // door
  const d = g.door, dx = d.c * TILE, dy = d.r * TILE;
  if (!d.open) {
    ctx.fillStyle = '#6d4c2f'; ctx.fillRect(dx, dy, TILE, TILE);
    ctx.strokeStyle = '#3e2a18'; ctx.lineWidth = 2; ctx.strokeRect(dx + 2, dy + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.arc(dx + TILE / 2, dy + TILE / 2, 5, 0, 7); ctx.fill();
  } else {
    const gr = ctx.createRadialGradient(dx + 16, dy + 16, 2, dx + 16, dy + 16, 22 + Math.sin(t * 5) * 3);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.4, '#80deea'); gr.addColorStop(1, 'rgba(0,150,200,0)');
    ctx.fillStyle = '#0b1f2a'; ctx.fillRect(dx, dy, TILE, TILE);
    ctx.fillStyle = gr; ctx.fillRect(dx - 8, dy - 8, TILE + 16, TILE + 16);
  }
  // pickups
  for (const k of g.pickups) {
    const b = Math.sin(t * 5 + k.id) * 2;
    ctx.fillStyle = 'rgba(255,214,0,.25)'; ctx.beginPath(); ctx.arc(k.x, k.y + b, 10, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd400'; ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(k.x, k.y + b, 6, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(k.x - 2, k.y + b - 2, 1.8, 0, 7); ctx.fill();
  }
  // enemies + players sorted by y
  const ents = [];
  g.enemies.forEach(e => ents.push({ y: e.y, f: () => drawEnemy(ctx, e) }));
  g.players.forEach(p => {
    if (p.gone) return;
    ents.push({ y: p.y, f: () => {
      ctx.globalAlpha = p.alive ? 1 : 0.3;
      drawChar(ctx, p.char, p.x, p.y, p.face, 1, p.hurt > 0 && p.alive);
      ctx.globalAlpha = 1;
      ctx.font = 'bold 11px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.fillStyle = '#fff';
      ctx.strokeText(p.name, p.x, p.y - 20); ctx.fillText(p.name, p.x, p.y - 20);
    } });
  });
  ents.sort((a, b) => a.y - b.y).forEach(o => o.f());
  // projectiles
  for (const j of g.proj) {
    const col = j.kind === 'mage' ? '#4dd0e1' : '#69f0ae';
    const a = j.ang !== undefined ? j.ang : Math.atan2(j.vy, j.vx);
    ctx.fillStyle = col + '55'; ctx.beginPath(); ctx.arc(j.x - Math.cos(a) * 6, j.y - Math.sin(a) * 6, 6, 0, 7); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(j.x, j.y, 4, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(j.x, j.y, 1.8, 0, 7); ctx.fill();
  }
  drawFx(g);
}
function drawFx(g) {
  for (const f of g.fx) {
    const k = f.t / f.life;
    ctx.save();
    switch (f.type) {
      case 'slash':
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(f.x, f.y, 40, f.a - 1.2 + k * 0.5, f.a + 1.2); ctx.stroke(); break;
      case 'spin':
        ctx.globalAlpha = 1 - k * 0.8; ctx.strokeStyle = '#ffcc80'; ctx.lineWidth = 7; ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) { const a0 = f.t * 22 + i * 2.09; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.55 + 0.45 * k), a0, a0 + 1.4); ctx.stroke(); }
        ctx.globalAlpha = (1 - k) * 0.25; ctx.fillStyle = '#ffb74d'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill(); break;
      case 'chain':
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#fff59d'; ctx.lineWidth = 3; ctx.shadowColor = '#4fc3f7'; ctx.shadowBlur = 10;
        for (let i = 0; i < f.pts.length - 1; i++) {
          const a = f.pts[i], b = f.pts[i + 1];
          ctx.beginPath(); ctx.moveTo(a[0], a[1]);
          for (let s = 1; s < 5; s++) { const u = s / 5; ctx.lineTo(a[0] + (b[0] - a[0]) * u + (Math.random() - 0.5) * 14, a[1] + (b[1] - a[1]) * u + (Math.random() - 0.5) * 14); }
          ctx.lineTo(b[0], b[1]); ctx.stroke();
        } break;
      case 'ray':
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#69f0ae'; ctx.lineWidth = 5; ctx.shadowColor = '#00e676'; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke(); break;
      case 'heal':
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#69f0ae'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x, f.y, 8 + k * 18, 0, 7); ctx.stroke(); break;
      case 'poof':
        ctx.globalAlpha = 1 - k; ctx.fillStyle = '#cfd8dc';
        for (let i = 0; i < 6; i++) { const a = i * 1.05; ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * k * 16, f.y + Math.sin(a) * k * 16, 4 * (1 - k) + 1, 0, 7); ctx.fill(); } break;
      case 'door':
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#80deea'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(f.x, f.y, 10 + k * 40, 0, 7); ctx.stroke(); break;
      case 'txt':
        ctx.globalAlpha = 1 - k * k; ctx.font = 'bold 14px system-ui,sans-serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.fillStyle = f.c || '#fff';
        ctx.strokeText(f.s, f.x, f.y - k * 26); ctx.fillText(f.s, f.x, f.y - k * 26); break;
    }
    ctx.restore();
  }
}
function drawHUD(g) {
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px system-ui,sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.fillStyle = '#fff';
  const title = `Stage ${g.stage}-${g.level}`;
  ctx.strokeText(title, W / 2, 28); ctx.fillText(title, W / 2, 28);
  const troll = g.enemies.find(e => e.type === 'troll');
  ctx.font = '13px system-ui,sans-serif';
  let sub, col = '#cfd8ff';
  if (g.door.open) { sub = 'The door is open!'; col = '#80deea'; }
  else if (troll) { sub = 'BOSS FIGHT — defeat the Troll!'; col = '#ff8a80'; }
  else sub = `Defeat all enemies to open the door (${g.enemies.length} left)`;
  ctx.fillStyle = col; ctx.strokeText(sub, W / 2, 46); ctx.fillText(sub, W / 2, 46);
  // player bars
  ctx.textAlign = 'left';
  g.players.forEach((p, i) => {
    if (p.gone) return;
    const y = 12 + i * 34;
    ctx.font = 'bold 12px system-ui,sans-serif'; ctx.fillStyle = '#fff'; ctx.strokeText(`${p.name} · ${CHARS[p.char].name}`, 12, y + 10); ctx.fillText(`${p.name} · ${CHARS[p.char].name}`, 12, y + 10);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(12, y + 14, 150, 9);
    ctx.fillStyle = p.alive ? '#43a047' : '#616161'; ctx.fillRect(12, y + 14, 150 * clamp(p.hp / p.maxhp, 0, 1), 9);
    ctx.fillStyle = '#fff'; ctx.font = '10px system-ui,sans-serif'; ctx.fillText(`${Math.max(0, Math.ceil(p.hp))}/${p.maxhp}`, 166, y + 22);
  });
  if (troll) {
    const bw = 300, x = W / 2 - bw / 2;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x, 54, bw, 10);
    ctx.fillStyle = '#c62828'; ctx.fillRect(x, 54, bw * clamp(troll.hp / troll.maxhp, 0, 1), 10);
  }
  if (g.banner) {
    const b = g.banner, a = b.t < 0.3 ? b.t / 0.3 : b.t > 1.7 ? Math.max(0, (2.2 - b.t) / 0.5) : 1;
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.font = 'bold 44px system-ui,sans-serif';
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.fillStyle = '#ffd54f';
    ctx.strokeText(b.text, W / 2, H / 2 - 20); ctx.fillText(b.text, W / 2, H / 2 - 20); ctx.restore();
  }
}
function drawJoystick() {
  if (!joy.active) return;
  let dx = joy.x - joy.ox, dy = joy.y - joy.oy; const l = Math.hypot(dx, dy);
  if (l > JR) { dx = dx / l * JR; dy = dy / l * JR; }
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(joy.ox, joy.oy, JR, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(joy.ox + dx, joy.oy + dy, 26, 0, 7); ctx.fill();
}
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#0d0f16'; ctx.fillRect(0, 0, cv.width, cv.height);
  const g = game; if (!g || !g.grid) return;
  const s = Math.min(cv.width / W, cv.height / H), ox = (cv.width - W * s) / 2, oy = (cv.height - H * s) / 2;
  ctx.setTransform(s, 0, 0, s, ox, oy);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  drawWorld(g); drawHUD(g);
  ctx.restore();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawJoystick();
}

// ---------------- menus ----------------
function updateMenu() {
  $('menuName').textContent = profile.name;
  $('menuCp').textContent = profile.cp;
  $('menuBest').textContent = `${profile.best.stage}-${profile.best.level}`;
}
function renderChars() {
  $('cpCount').textContent = profile.cp;
  const box = $('charCards'); box.innerHTML = '';
  for (const key of Object.keys(CHARS)) {
    const def = CHARS[key], up = profile.up[key] | 0, st = statsFor(key);
    const card = document.createElement('div'); card.className = 'card' + (profile.sel === key ? ' sel' : '');
    card.innerHTML = `<canvas width="120" height="120"></canvas><h3>${def.name}${up ? ` <small>(+${up})</small>` : ''}</h3>
      <div class="stats">ATK <b>${st.atk}</b> · HP <b>${st.hp}</b></div><div class="desc">${def.desc}</div>
      <div class="btns"><button data-act="sel" data-c="${key}" ${profile.sel === key ? 'disabled' : ''}>${profile.sel === key ? 'Selected' : 'Select'}</button>
      <button data-act="up" data-c="${key}" ${profile.cp < 1 ? 'disabled' : ''}>+1 (🟡1)</button></div>`;
    box.appendChild(card);
    const c2 = card.querySelector('canvas').getContext('2d');
    c2.fillStyle = '#232838'; c2.fillRect(0, 0, 120, 120);
    drawChar(c2, key, 52, 60, 0, 2.2, false);
  }
}
$('charCards').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  const c = b.dataset.c;
  if (b.dataset.act === 'sel') profile.sel = c;
  else if (b.dataset.act === 'up' && profile.cp >= 1) { profile.cp--; profile.up[c] = (profile.up[c] | 0) + 1; }
  saveProfile(); renderChars();
});
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
  const to = b.dataset.go;
  if (to === 'scrMenu') updateMenu();
  show(to);
}));
function submitName() {
  const n = $('nameInput').value.trim().slice(0, 12);
  if (!n) { $('nameInput').focus(); return; }
  profile.name = n; saveProfile(); updateMenu(); show('scrMenu');
}
$('btnNameOk').addEventListener('click', submitName);
$('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') submitName(); });
$('menuName').addEventListener('click', () => { $('nameInput').value = profile.name; show('scrName'); });
$('btnStart').addEventListener('click', () => show('scrMode'));
$('btnChar').addEventListener('click', () => { renderChars(); show('scrChar'); });
$('btnSingle').addEventListener('click', startSingle);
$('btnMulti').addEventListener('click', () => { $('multiStatus').textContent = ''; show('scrMulti'); });
$('btnFind').addEventListener('click', () => { $('multiStatus').textContent = ''; findGame(); });
$('btnCreate').addEventListener('click', () => { $('multiStatus').textContent = ''; createRoom(); });
$('btnJoin').addEventListener('click', () => {
  const code = $('codeInput').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 5) { $('multiStatus').textContent = 'Enter the 5-character room code.'; return; }
  $('multiStatus').textContent = ''; joinRoom(code);
});
$('btnLobbyStart').addEventListener('click', hostStart);
$('btnLobbyLeave').addEventListener('click', () => { closeNet(); $('multiStatus').textContent = ''; show('scrMulti'); });
window.addEventListener('beforeunload', closeNet);
$('btnOverMenu').addEventListener('click', leaveGame);
$('btnQuit').addEventListener('click', () => { if (confirm('Quit this run?')) leaveGame(); });

// ---------------- boot ----------------
resize();
if (profile.name) { updateMenu(); show('scrMenu'); } else show('scrName');
requestAnimationFrame(frame);
})();
