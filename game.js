'use strict';
(() => {
// =====================================================================
// Doom and Dungeons — client. The room host's browser runs the simulation;
// the guest sends inputs and renders snapshots. Single player = host only.
// =====================================================================
const $ = id => document.getElementById(id);
const TILE = 32;
// Room size. Landscape rooms are 30x17 tiles; when the host plays in portrait the level is generated rotated: 17x30 (start at the bottom, door at the top).
let COLS = 30, ROWS = 17, W = COLS * TILE, H = ROWS * TILE;
// Every 5th stage (5, 10, 15, ...) is a Hell stage: only 5 levels, a much bigger room and twice as many enemies.
const HELL_EVERY = 5;
const isHell = stage => stage % HELL_EVERY === 0;
const levelsIn = stage => isHell(stage) ? 5 : 10;   // the last level of a stage is its boss room
const BIG = { cols: 48, rows: 28 };                // Hell room size in tiles (landscape; rotated in portrait)
const VIEW_W = 30 * TILE, VIEW_H = 17 * TILE;       // what the camera shows in landscape; rooms bigger than this scroll
function setDims(portrait, big) {
  const c = big ? BIG.cols : 30, r = big ? BIG.rows : 17;
  COLS = portrait ? r : c; ROWS = portrait ? c : r; W = COLS * TILE; H = ROWS * TILE;
  SPAWN_POINT = portrait ? { x: (COLS / 2) * TILE, y: (ROWS - 2.5) * TILE } : { x: 2.5 * TILE, y: (ROWS / 2) * TILE };
}
function spawnXY(i) { // where player i starts
  return portrait_() ? { x: (COLS / 2 + (i === 0 ? -1 : 1)) * TILE, y: (ROWS - 2.5) * TILE }
                     : { x: 2.5 * TILE, y: (ROWS / 2 + (i === 0 ? -1 : 1)) * TILE };
}
const portrait_ = () => ROWS > COLS;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const STEP = 1 / 60;
const SPECIAL_CD = 15, DROP_CHANCE = 0.03;      // DROP_CHANCE: Character Point (and, separately, Pet Point) chance per kill
const POTION = { chance: 0.08, heal: 0.2 };       // potion drop chance per kill; heals 20% of max HP when walked over
const PET_RESPAWN = 20;                           // seconds until a KO'd pet comes back
// Enemy senses: they only turn hostile when a player is inside their vision cone (with a clear line of sight),
// or very close behind them. Otherwise they wander near their home spot.
const VISION = { rat: 160, goblin: 190, troll: 230, skeleton: 220, voidling: 320, sorcerer: 220, hellguard: 200, assassin: 200, skeleton_king: 240, cerberus: 300 }; // px
const FOV = 2.1;      // radians (~120 degrees) in front of the enemy
const NOTICE = 44;    // px: anything this close (and not behind a wall) is noticed regardless of facing
let SPAWN_POINT = { x: 2.5 * TILE, y: (ROWS / 2) * TILE };
const SPAWN_MIN_DIST = 375; // enemies never spawn closer than this to where the players start (> every vision range)
const rnd = n => Math.floor(Math.random() * n);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const CHARS = {
  warrior: { name: 'Warrior', atk: 5, hp: 60, color: '#d9534f', dark: '#8e2420', cd: 0.5, speed: 150, sym: '🌀',
    desc: 'Spin Attack: AOE around you dealing 1.5× ATK.' },
  mage: { name: 'Mage', atk: 8, hp: 40, color: '#7e57c2', dark: '#4527a0', cd: 0.7, speed: 150, sym: '⚡',
    desc: 'Chain Lightning: 1.3× ATK, bounces up to 3 times, each hit 20% weaker.' },
  healer: { name: 'Healer', atk: 3, hp: 55, color: '#43a047', dark: '#1b5e20', cd: 0.6, speed: 150, sym: '✚',
    desc: 'Healing Ray: heals everything in range for 20% of your max HP + 10% of your current HP; you and pets get half of that. No ally in range: heals only yourself, in full.' },
};
const GAME_VERSION = '2026.10.20-b'; // shown on the menu and compared between players, so a stale cached copy is easy to spot
// ---- icons (drawn as SVG): gold coin, equipment helmet, pet-point paw ----
const ICON_SVG = {
  gold: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff0a0\"/><stop offset=\".5\" stop-color=\"#f5c21f\"/><stop offset=\"1\" stop-color=\"#c78a00\"/></linearGradient></defs><circle cx=\"32\" cy=\"32\" r=\"30\" fill=\"url(#g)\" stroke=\"#a87400\" stroke-width=\"1.6\"/><circle cx=\"32\" cy=\"32\" r=\"25.5\" fill=\"#f1bd24\" stroke=\"#b78100\" stroke-width=\"1.4\"/><circle cx=\"32\" cy=\"32\" r=\"24\" fill=\"none\" stroke=\"#ffe98a\" stroke-width=\".8\" opacity=\".7\"/><circle cx=\"51.00\" cy=\"32.00\" r=\"1.35\" fill=\"#f2c13a\" stroke=\"#a87400\" stroke-width=\".4\"/><circle cx=\"49.85\" cy=\"38.50\" r=\"1.35\" fill=\"#f2c13a\" stroke=\"#a87400\" stroke-width=\".4\"/><circle cx=\"46.55\" cy=\"44.21\" r=\"1.35\" fill=\"#f2c13a\" stroke=\"#a87400\" stroke-width=\".4\"/><circle cx=\"41.50\" cy=\"48.45\" r=\"1.35\" fill=\"#f2c13a\" stroke=\"#a87400\" stroke-width=\".4\"/><circle cx=\"35.30\" cy=\"50.71\" r=\"1.35\" fill=\"#f2c13a\" stroke=\"#a87400\" stroke-width=\".4\"/><circle cx=\"28.70\" cy=\"50.71\" r=\"1.35\" fill=\"#f2c13a\" stroke=\"#a87400\" stroke-width=\".4\"/><circle cx=\"22.50\" cy=\"48.45\" r=\"1.35\" fill=\"#f2c13a\" stroke=\"#a87400\" stroke-width=\".4\"/><circle cx=\"17.45\" cy=\"44.21\" r=\"1.35\" fill=\"#f2c13a\" stroke=\"#a87400\" stroke-width=\".4\"/><circle cx=\"14.15\" cy=\"38.50\" r=\"1.35\" fill=\"#f2c13a\" stroke=\"#a87400\" stroke-width=\".4\"/><circle cx=\"13.00\" cy=\"32.00\" r=\"1.35\" fill=\"#f2c13a\" stroke=\"#a87400\" stroke-width=\".4\"/><circle cx=\"14.15\" cy=\"25.50\" r=\"1.35\" fill=\"#f2c13a\" stroke=\"#a87400\" stroke-width=\".4\"/><circle cx=\"17.45\" cy=\"19.79\" r=\"1.35\" fill=\"#f2c13a\" stroke=\"#a87400\" stroke-width=\".4\"/><circle cx=\"22.50\" cy=\"15.55\" r=\"1.35\" fill=\"#f2c13a\" stroke=\"#a87400\" stroke-width=\".4\"/><circle cx=\"28.70\" cy=\"13.29\" r=\"1.35\" fill=\"#f2c13a\" stroke=\"#a87400\" stroke-width=\".4\"/><circle cx=\"35.30\" cy=\"13.29\" r=\"1.35\" fill=\"#f2c13a\" stroke=\"#a87400\" stroke-width=\".4\"/><circle cx=\"41.50\" cy=\"15.55\" r=\"1.35\" fill=\"#f2c13a\" stroke=\"#a87400\" stroke-width=\".4\"/><circle cx=\"46.55\" cy=\"19.79\" r=\"1.35\" fill=\"#f2c13a\" stroke=\"#a87400\" stroke-width=\".4\"/><circle cx=\"49.85\" cy=\"25.50\" r=\"1.35\" fill=\"#f2c13a\" stroke=\"#a87400\" stroke-width=\".4\"/><polygon points=\"32,32 32.00,17.00 35.76,26.82\" fill=\"#ffe88a\"/><polygon points=\"32,32 35.76,26.82 46.27,27.36\" fill=\"#d99a00\"/><polygon points=\"32,32 46.27,27.36 38.09,33.98\" fill=\"#ffe88a\"/><polygon points=\"32,32 38.09,33.98 40.82,44.14\" fill=\"#d99a00\"/><polygon points=\"32,32 40.82,44.14 32.00,38.40\" fill=\"#ffe88a\"/><polygon points=\"32,32 32.00,38.40 23.18,44.14\" fill=\"#d99a00\"/><polygon points=\"32,32 23.18,44.14 25.91,33.98\" fill=\"#ffe88a\"/><polygon points=\"32,32 25.91,33.98 17.73,27.36\" fill=\"#d99a00\"/><polygon points=\"32,32 17.73,27.36 28.24,26.82\" fill=\"#ffe88a\"/><polygon points=\"32,32 28.24,26.82 32.00,17.00\" fill=\"#d99a00\"/><polygon points=\"32.00,17.00 35.76,26.82 46.27,27.36 38.09,33.98 40.82,44.14 32.00,38.40 23.18,44.14 25.91,33.98 17.73,27.36 28.24,26.82\" fill=\"none\" stroke=\"#a87400\" stroke-width=\".8\" stroke-linejoin=\"round\"/></svg>",
  gear: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"s\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\"><stop offset=\"0\" stop-color=\"#8d939c\"/><stop offset=\".35\" stop-color=\"#f1f3f6\"/><stop offset=\"1\" stop-color=\"#7d838c\"/></linearGradient><linearGradient id=\"y\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e6c26a\"/><stop offset=\"1\" stop-color=\"#a47c25\"/></linearGradient></defs>\n<path d=\"M9 47 L32 60 L55 47 L51 40 H13 Z\" fill=\"url(#s)\" stroke=\"#555a62\" stroke-width=\"1.2\" stroke-linejoin=\"round\"/><path d=\"M9 47 L32 60 L55 47\" fill=\"none\" stroke=\"url(#y)\" stroke-width=\"3\" stroke-linejoin=\"round\"/>\n<path d=\"M14 44 V27 C14 14 22 7 32 7 C42 7 50 14 50 27 V44 L32 54 Z\" fill=\"url(#s)\" stroke=\"#555a62\" stroke-width=\"1.2\" stroke-linejoin=\"round\"/>\n<path d=\"M14 23 Q32 15 50 23 V28 Q32 20 14 28 Z\" fill=\"url(#y)\" stroke=\"#7a5a14\" stroke-width=\".8\"/>\n<path d=\"M18 31 L46 31 L44 37 L20 37 Z\" fill=\"#14161a\"/>\n<path d=\"M29 30 L35 30 L36 47 L32 52 L28 47 Z\" fill=\"url(#y)\" stroke=\"#7a5a14\" stroke-width=\".8\"/>\n<g fill=\"#2a2d33\"><rect x=\"19\" y=\"40\" width=\"3\" height=\"5\" rx=\"1.2\"/><rect x=\"24\" y=\"40\" width=\"3\" height=\"5\" rx=\"1.2\"/><rect x=\"37\" y=\"40\" width=\"3\" height=\"5\" rx=\"1.2\"/><rect x=\"42\" y=\"40\" width=\"3\" height=\"5\" rx=\"1.2\"/></g>\n<path d=\"M32 1 L37 8 L32 14 L27 8 Z\" fill=\"url(#y)\" stroke=\"#7a5a14\" stroke-width=\".8\" stroke-linejoin=\"round\"/>\n<g fill=\"#cfd3d9\" stroke=\"#555a62\" stroke-width=\".5\"><circle cx=\"19\" cy=\"25\" r=\"1.3\"/><circle cx=\"45\" cy=\"25\" r=\"1.3\"/><circle cx=\"32\" cy=\"24\" r=\"1.4\"/></g></svg>",
  paw: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"p\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#7be34f\"/><stop offset=\"1\" stop-color=\"#1f9a2b\"/></linearGradient></defs>\n<g fill=\"url(#p)\" stroke=\"#b6ff7a\" stroke-width=\"1.2\"><ellipse cx=\"15\" cy=\"29\" rx=\"5.3\" ry=\"7.5\" transform=\"rotate(-18 15 29)\"/><ellipse cx=\"25.5\" cy=\"17.5\" rx=\"5.8\" ry=\"8\" transform=\"rotate(-8 25.5 17.5)\"/><ellipse cx=\"38.5\" cy=\"17.5\" rx=\"5.8\" ry=\"8\" transform=\"rotate(8 38.5 17.5)\"/><ellipse cx=\"49\" cy=\"29\" rx=\"5.3\" ry=\"7.5\" transform=\"rotate(18 49 29)\"/>\n<path d=\"M32 29 C44 29 53 40 50 49 C48 56 40 55 32 57 C24 55 16 56 14 49 C11 40 20 29 32 29 Z\"/></g>\n<g fill=\"none\" stroke=\"#0e5a17\" stroke-width=\"2.2\" stroke-linecap=\"round\"><path d=\"M38 38 C44 40 48 46 47 52\"/><path d=\"M33 42 C39 43 42 48 41 53\"/><path d=\"M43 34 C48 37 51 42 51 47\"/></g></svg>"
};
const ICON_URI = {}; for (const k of Object.keys(ICON_SVG)) ICON_URI[k] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ICON_SVG[k]);
const ic = n => `<img class="ic" src="${ICON_URI[n]}" alt="">`;                // for HTML text
const iconImgs = {};
function iconImg(n) { let im = iconImgs[n]; if (!im) { im = iconImgs[n] = new Image(); im.src = ICON_URI[n]; } return im; }   // for the canvas
function fillIcons() { document.querySelectorAll('[data-ic]').forEach(el => { el.innerHTML = ic(el.dataset.ic); }); }
// ---- equipment art: every piece is drawn as SVG from a palette (per rarity) and a detail level (gearSVG), then cached as a data URI ----
const GEAR_BORDER = ['#b0bec5', '#66bb6a', '#29b6f6', '#ab47bc', '#ffd54f', '#ff1744', '#8b0000'];
const GEAR_PAL = [
  { m: ['#a3a7b0', '#55585f', '#1b1c20'], tr: ['#8b8f98', '#3a3c42'], gem: ['#8a8d94', '#d8dadf'], cl: ['#8a6a48', '#3d2a18'], bone: ['#d9cfb4', '#8f845f', '#3f3820'], eye: '#c8ccd2' },
  { m: ['#a3a7b0', '#55585f', '#1b1c20'], tr: ['#8b8f98', '#3a3c42'], gem: ['#8a8d94', '#d8dadf'], cl: ['#8a6a48', '#3d2a18'], bone: ['#d9cfb4', '#8f845f', '#3f3820'], eye: '#c8ccd2' },
  { m: ['#a9c1e3', '#41567a', '#101828'], tr: ['#8fb0dc', '#2b3d5c'], gem: ['#1e8fff', '#bfe4ff'], cl: ['#3d5f94', '#16243d'], bone: ['#d6dce6', '#8091aa', '#35405a'], eye: '#3aa9ff' },
  { m: ['#b79ae0', '#4c3174', '#150c26'], tr: ['#a07edb', '#35205a'], gem: ['#b43cff', '#efc0ff'], cl: ['#6d3fa6', '#26123f'], bone: ['#e0d4f2', '#8f74b8', '#3d2860'], eye: '#c25bff' },
  { m: ['#fff3b8', '#dba52a', '#6e4a00'], tr: ['#ffe98f', '#a06f00'], gem: ['#ffe34a', '#fffbe0'], cl: ['#f0d27a', '#a77a12'], bone: ['#fff6d0', '#e6c260', '#8a6618'], eye: '#ffe65c' },
  { m: ['#ff6a5a', '#c4162a', '#470510'], tr: ['#ff6e4c', '#6a0a14'], gem: ['#ff7a00', '#fff0cc'], cl: ['#e23a3a', '#7a0a18'], bone: ['#ffc9bd', '#e0503f', '#7a1a14'], eye: '#ff6a1f' },
  { m: ['#77737e', '#2d2b33', '#09090c'], tr: ['#d03228', '#6a0808'], gem: ['#ff1a1a', '#ffb4a4'], cl: ['#5a2a30', '#1d0c0f'], bone: ['#8c7878', '#463a3a', '#150f0f'], eye: '#ff2a1a' },
];
const GEAR_LEVEL = t => t < 2 ? 0 : t === 2 ? 1 : t === 3 ? 2 : 3;
const GEAR_IDX = { iron_helm: 0, scout_hood: 1, vampire_crown: 2, wizard_hat: 3, horned_helm: 4, leather_vest: 5, chainmail: 6, dragon_plate: 7, mystic_robe: 8, troll_mantle: 9, iron_blade: 10, runed_staff: 11, doom_edge: 12, hunter_bow: 13, shadow_dagger: 14 };
function gearSVG(key, t) {
  const P = GEAR_PAL[t], L = GEAR_LEVEL(t), id = 'q' + GEAR_IDX[key] + 'x' + t; let defs = '', gn = 0;
  const lg = (cols, v) => { const i = id + 'g' + (gn++); defs += `<linearGradient id="${i}" x1="0" y1="0" x2="${v ? 0 : 1}" y2="${v ? 1 : 0}">` + cols.map((c, k) => `<stop offset="${(k / (cols.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join('') + '</linearGradient>'; return `url(#${i})`; };
  const rg = (cols) => { const i = id + 'r' + (gn++); defs += `<radialGradient id="${i}">` + cols.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('') + '</radialGradient>'; return `url(#${i})`; };
  const OUT = t === 6 ? '#000' : '#0d0b10', M = lg(P.m), MV = lg(P.m, 1), TR = lg(P.tr, 1), CL = lg(P.cl, 1), BN = lg(P.bone, 1), GM = rg([[0, P.gem[1], 1], [0.55, P.gem[0], 1], [1, P.gem[0], 0.85]]);
  const st = (w) => `stroke="${OUT}" stroke-width="${w || 1.3}" stroke-linejoin="round" stroke-linecap="round"`;
  const hi = d => `<path d="${d}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.3" stroke-linecap="round"/>`;
  let a = { gem: [32, 30], top: [32, 6], sides: [[12, 30], [52, 30]] }, art = '', rot = 0;
  switch (key) {
    case 'iron_helm':
      art = `<path d="M13 46 L32 56 L51 46 L47 40 H17 Z" fill="${M}" ${st()}/><path d="M13 46 L32 56 L51 46" fill="none" stroke="${TR}" stroke-width="3"/>
      <path d="M14 44 V27 C14 14 22 7 32 7 C42 7 50 14 50 27 V44 L32 53 Z" fill="${M}" ${st()}/><path d="M14 22 Q32 14 50 22 V27 Q32 19 14 27 Z" fill="${TR}" ${st(1.2)}/>
      <path d="M18 31 H46 L44 37 H20 Z" fill="#0c0b0d"/><path d="M29 30 H35 L36 46 L32 51 L28 46 Z" fill="${TR}" ${st(1.2)}/>
      <g fill="#1d1b20"><rect x="19" y="40" width="3" height="5" rx="1.2"/><rect x="24" y="40" width="3" height="5" rx="1.2"/><rect x="37" y="40" width="3" height="5" rx="1.2"/><rect x="42" y="40" width="3" height="5" rx="1.2"/></g>${hi('M19 18 Q25 11 32 10')}`;
      a = { gem: [32, 19], top: [32, 7], sides: [[13, 33], [51, 33]] }; break;
    case 'scout_hood':
      art = `<path d="M32 5 C18 7 11 22 13 37 C14 47 20 55 32 58 C44 55 50 47 51 37 C53 22 46 7 32 5 Z" fill="${CL}" ${st()}/>
      <path d="M32 19 C24 19 19 28 21 38 C23 46 28 49 32 49 C36 49 41 46 43 38 C45 28 40 19 32 19 Z" fill="#150f1a" ${st(1.4)}/>
      <path d="M25 35 q2 -2 4 0 M35 35 q2 -2 4 0" stroke="${P.gem[1]}" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="${t < 2 ? 0.55 : 0}"/>
      <path d="M16 40 Q20 52 32 55 M48 40 Q44 52 32 55" fill="none" stroke="${TR}" stroke-width="2.2"/><path d="M22 11 Q27 8 32 8" stroke="#fff" stroke-opacity=".4" stroke-width="1.4" fill="none"/>`;
      a = { gem: [32, 13], top: [32, 5], sides: [[13, 36], [51, 36]] }; break;
    case 'vampire_crown':
      art = `<path d="M10 48 L12 20 L23 33 L32 11 L41 33 L52 20 L54 48 Z" fill="${M}" ${st()}/><path d="M10 48 H54 V54 H10 Z" fill="${TR}" ${st()}/>
      <g fill="${TR}" ${st(1.2)}><circle cx="12" cy="19" r="3"/><circle cx="32" cy="10" r="3.4"/><circle cx="52" cy="19" r="3"/></g>
      <path d="M32 33 L38 41 L32 49 L26 41 Z" fill="${L ? GM : '#c62828'}" ${st(1.4)}/><path d="M30 38 L32 36 L34 38" fill="none" stroke="#fff" stroke-opacity=".7"/>${hi('M14 26 L22 36')}`;
      a = { gem: [32, 41], top: [32, 10], sides: [[11, 30], [53, 30]] }; break;
    case 'wizard_hat':
      art = `<ellipse cx="32" cy="48" rx="27" ry="8.5" fill="${CL}" ${st()}/><path d="M32 3 C31 14 27 24 22 33 L15 47 C24 52 40 52 49 47 L42 33 C37 24 33 14 32 3 Z" fill="${CL}" ${st()}/>
      <path d="M18 41 Q32 47 46 41 L48 46 Q32 52 16 46 Z" fill="${TR}" ${st(1.3)}/><path d="M27 41 H37 V48 H27 Z" fill="${TR}" ${st(1.2)}/><path d="M29.5 43 H34.5 V46 H29.5Z" fill="${OUT}" opacity=".55"/>
      <path d="M30 12 Q34 14 34 18" stroke="#fff" stroke-opacity=".4" stroke-width="1.4" fill="none"/><path d="M32 3 Q40 4 41 10" fill="none" stroke="${P.cl[1]}" stroke-width="2.2" stroke-linecap="round"/>`;
      a = { gem: [32, 44.5], top: [32, 3], sides: [[7, 48], [57, 48]] }; break;
    case 'horned_helm':
      art = `<path d="M17 36 C6 34 4 20 9 9 C11 19 17 22 21 26 Z" fill="${BN}" ${st()}/><path d="M47 36 C58 34 60 20 55 9 C53 19 47 22 43 26 Z" fill="${BN}" ${st()}/>
      <path d="M15 52 V34 C15 22 22 16 32 16 C42 16 49 22 49 34 V52 L40 56 H24 Z" fill="${M}" ${st()}/><path d="M15 30 H49 V36 H15 Z" fill="${TR}" ${st(1.2)}/>
      <path d="M22 40 H42 L40 46 H24 Z" fill="#0c0b0d"/><path d="M29.5 36 H34.5 V52 L32 55 L29.5 52 Z" fill="${TR}" ${st(1.2)}/>${hi('M19 28 Q24 21 31 20')}`;
      a = { gem: [32, 24], top: [32, 16], sides: [[9, 10], [55, 10]] }; break;
    case 'leather_vest':
      art = `<path d="M19 9 L27 6 L32 14 L37 6 L45 9 L54 18 L49 29 L47 56 H17 L15 29 L10 18 Z" fill="${CL}" ${st()}/><path d="M27 6 L32 14 L37 6" fill="none" stroke="${TR}" stroke-width="2.6"/>
      <path d="M32 14 V56" stroke="${OUT}" stroke-width="1.6"/><path d="M28 20 L36 23 M28 28 L36 31 M28 36 L36 39" stroke="${P.tr[0]}" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M16 46 H48 V51 H16 Z" fill="${TR}" ${st(1.2)}/><rect x="28" y="45" width="8" height="7" rx="1.5" fill="${M}" ${st(1.2)}/>
      <path d="M12 20 L16 28 M52 20 L48 28" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.2"/>`;
      a = { gem: [32, 33], top: [32, 6], sides: [[10, 19], [54, 19]] }; break;
    case 'chainmail': {
      const pt = id + 'p'; defs += `<pattern id="${pt}" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="2.1" fill="none" stroke="${P.m[2]}" stroke-width="1"/><circle cx="0" cy="0" r="2.1" fill="none" stroke="${P.m[2]}" stroke-width="1"/><circle cx="6" cy="6" r="2.1" fill="none" stroke="${P.m[2]}" stroke-width="1"/><circle cx="6" cy="0" r="2.1" fill="none" stroke="${P.m[2]}" stroke-width="1"/><circle cx="0" cy="6" r="2.1" fill="none" stroke="${P.m[2]}" stroke-width="1"/></pattern>`;
      const sh = 'M18 9 L27 6 Q32 13 37 6 L46 9 L57 19 L51 31 L47 28 L47 56 H17 L17 28 L13 31 L7 19 Z';
      art = `<path d="${sh}" fill="${MV}" ${st()}/><path d="${sh}" fill="url(#${pt})"/><path d="M27 6 Q32 13 37 6" fill="#120f14" ${st(1.4)}/><path d="M17 50 H47 V56 H17 Z" fill="${TR}" ${st(1.2)}/><path d="M7 19 L13 31 M57 19 L51 31" stroke="${TR}" stroke-width="2.4" fill="none"/>${hi('M20 14 L22 40')}`;
      a = { gem: [32, 30], top: [32, 6], sides: [[8, 21], [56, 21]] }; break; }
    case 'dragon_plate':
      art = `<ellipse cx="13" cy="17" rx="10" ry="8" transform="rotate(-20 13 17)" fill="${M}" ${st()}/><ellipse cx="51" cy="17" rx="10" ry="8" transform="rotate(20 51 17)" fill="${M}" ${st()}/>
      <path d="M20 9 H44 L49 30 L43 56 H21 L15 30 Z" fill="${MV}" ${st()}/><path d="M32 9 V56" stroke="${OUT}" stroke-width="1.4"/><path d="M18 36 H46 M20 44 H44 M22 51 H42" stroke="${OUT}" stroke-width="1.3" stroke-opacity=".7"/>
      <path d="M32 18 L38 26 L32 36 L26 26 Z" fill="${TR}" ${st(1.3)}/><path d="M7 15 L4 8 L12 11 M57 15 L60 8 L52 11" fill="${P.m[1]}" ${st(1.3)}/>${hi('M22 14 L19 30')}`;
      a = { gem: [32, 26], top: [32, 9], sides: [[6, 14], [58, 14]] }; break;
    case 'mystic_robe':
      art = `<path d="M23 8 L32 13 L41 8 L53 20 L49 34 L47 57 H17 L15 34 L11 20 Z" fill="${CL}" ${st()}/><path d="M23 8 L32 26 L41 8" fill="#15101c" ${st(1.4)}/><path d="M23 8 L32 26 L41 8" fill="none" stroke="${TR}" stroke-width="2.4"/>
      <path d="M16 38 L48 33 L48 40 L16 45 Z" fill="${TR}" ${st(1.2)}/><path d="M17 51 H47 V57 H17 Z" fill="${TR}" ${st(1.2)}/><path d="M22 30 q-3 14 -2 24 M42 30 q3 14 2 24" fill="none" stroke="${OUT}" stroke-opacity=".35" stroke-width="1.3"/>
      <path d="M32 28 l2 4.5 5 .6 -3.7 3.3 1 5 -4.3 -2.6 -4.3 2.6 1 -5 -3.7 -3.3 5 -.6 Z" fill="${P.gem[1]}" stroke="${OUT}" stroke-width="1"/>`;
      a = { gem: [32, 36], top: [32, 8], sides: [[10, 20], [54, 20]] }; break;
    case 'troll_mantle':
      art = `<path d="M9 22 C11 11 21 6 32 6 C43 6 53 11 55 22 L57 38 L51 35 L53 48 L45 43 L43 56 L36 47 L32 58 L28 47 L21 56 L19 43 L11 48 L13 35 L7 38 Z" fill="${CL}" ${st()}/>
      <path d="M32 14 V50 M20 20 L24 44 M44 20 L40 44 M14 30 L17 46 M50 30 L47 46" stroke="${OUT}" stroke-opacity=".35" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M18 14 Q32 22 46 14" fill="none" stroke="${P.cl[0]}" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="17" r="5" fill="${BN}" ${st(1.4)}/>
      <path d="M10 26 L7 31 M54 26 L57 31" stroke="${BN}" stroke-width="3" stroke-linecap="round"/>`;
      a = { gem: [32, 17], top: [32, 6], sides: [[8, 34], [56, 34]] }; break;
    case 'iron_blade':
      art = `<path d="M32 2 L38 8 V41 L32 47 L26 41 V8 Z" fill="${M}" ${st()}/><path d="M32 6 V44" stroke="${OUT}" stroke-opacity=".45" stroke-width="2"/><path d="M29 10 V38" stroke="#fff" stroke-opacity=".55" stroke-width="1.4"/>
      <path d="M17 44 Q32 41 47 44 L47 50 Q32 47 17 50 Z" fill="${TR}" ${st()}/><rect x="29" y="49" width="6" height="9" rx="1.5" fill="${CL}" ${st(1.4)}/><circle cx="32" cy="60" r="3.2" fill="${TR}" ${st(1.4)}/>`;
      a = { gem: [32, 46.5], top: [32, 2], sides: [[16, 46], [48, 46]] }; rot = 40; break;
    case 'runed_staff':
      art = `<path d="M30 24 H34 V63 H30 Z" fill="${CL}" ${st(1.5)}/><path d="M31 32 h2 M31 40 h2 M31 48 h2 M31 56 h2" stroke="${P.tr[0]}" stroke-width="1.6"/>
      <path d="M22 22 C18 14 22 6 32 5 C42 6 46 14 42 22 C40 18 38 16 36 16 L28 16 C26 16 24 18 22 22 Z" fill="${M}" ${st()}/><path d="M26 22 H38 L36 27 H28 Z" fill="${TR}" ${st(1.3)}/>
      <circle cx="32" cy="14" r="7.5" fill="${GM}" ${st(1.6)}/><circle cx="29.5" cy="11.5" r="2" fill="#fff" fill-opacity=".8"/>`;
      a = { gem: [32, 14], top: [32, 4], sides: [[20, 18], [44, 18]] }; rot = 40; break;
    case 'doom_edge':
      art = `<path d="M32 1 L37 8 L35 12 L40 17 L36 22 L41 28 L38 36 L40 42 L32 48 L24 42 L26 36 L23 28 L28 22 L24 17 L29 12 L27 8 Z" fill="${M}" ${st()}/><path d="M32 6 V44" stroke="${P.gem[0]}" stroke-width="2.4" stroke-linecap="round"/><path d="M29 12 V30" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/>
      <path d="M13 44 Q22 38 32 45 Q42 38 51 44 L48 51 Q40 46 32 53 Q24 46 16 51 Z" fill="${TR}" ${st()}/><rect x="29" y="52" width="6" height="7" fill="${CL}" ${st(1.3)}/><circle cx="32" cy="61" r="3.4" fill="${GM}" ${st(1.3)}/>`;
      a = { gem: [32, 47], top: [32, 1], sides: [[13, 45], [51, 45]] }; rot = 40; break;
    case 'hunter_bow':
      art = `<path d="M22 4 C50 14 50 50 22 60" fill="none" stroke="${OUT}" stroke-width="7.4" stroke-linecap="round"/><path d="M22 4 C50 14 50 50 22 60" fill="none" stroke="${CL}" stroke-width="5" stroke-linecap="round"/>
      <path d="M22 4 L22 60" stroke="#e9e4d6" stroke-width="1.2"/><path d="M12 32 H52" stroke="${OUT}" stroke-width="3.4" stroke-linecap="round"/><path d="M12 32 H52" stroke="${P.bone[1]}" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M52 32 L45 28 L45 36 Z" fill="${M}" ${st(1.3)}/><path d="M12 32 L8 27 L16 29 Z M12 32 L8 37 L16 35 Z" fill="${TR}" ${st(1)}/><rect x="39" y="26" width="5" height="12" rx="2" transform="rotate(8 41 32)" fill="${TR}" ${st(1.2)}/>`;
      a = { gem: [41, 32], top: [29, 8], sides: [[22, 6], [22, 58]] }; rot = -30; break;
    case 'shadow_dagger':
      art = `<path d="M32 2 C42 12 41 30 37 43 H27 C23 30 22 12 32 2 Z" fill="${M}" ${st()}/><path d="M32 7 V41" stroke="${OUT}" stroke-opacity=".4" stroke-width="1.8"/><path d="M28 14 Q27 28 29 38" stroke="#fff" stroke-opacity=".55" stroke-width="1.3" fill="none"/>
      <path d="M18 43 Q32 39 46 43 L44 48 Q32 45 20 48 Z" fill="${TR}" ${st()}/><rect x="29" y="47" width="6" height="9" rx="1.5" fill="${CL}" ${st(1.4)}/><circle cx="32" cy="59" r="4" fill="${GM}" ${st(1.4)}/>`;
      a = { gem: [32, 45.5], top: [32, 2], sides: [[17, 45], [47, 45]] }; rot = 40; break;
  }

  // ---- dark-fantasy finish: hammered texture, light/shadow sheen, engraving, glowing eyes, cracks ----
  const SIL = { iron_helm: 'M14 44 V27 C14 14 22 7 32 7 C42 7 50 14 50 27 V44 L32 53 Z', scout_hood: 'M32 5 C18 7 11 22 13 37 C14 47 20 55 32 58 C44 55 50 47 51 37 C53 22 46 7 32 5 Z', vampire_crown: 'M10 48 L12 20 L23 33 L32 11 L41 33 L52 20 L54 48 Z', wizard_hat: 'M32 3 C31 14 27 24 22 33 L15 47 C24 52 40 52 49 47 L42 33 C37 24 33 14 32 3 Z', horned_helm: 'M15 52 V34 C15 22 22 16 32 16 C42 16 49 22 49 34 V52 L40 56 H24 Z',
    leather_vest: 'M19 9 L27 6 L32 14 L37 6 L45 9 L54 18 L49 29 L47 56 H17 L15 29 L10 18 Z', chainmail: 'M18 9 L27 6 Q32 13 37 6 L46 9 L57 19 L51 31 L47 28 L47 56 H17 L17 28 L13 31 L7 19 Z', dragon_plate: 'M20 9 H44 L49 30 L43 56 H21 L15 30 Z', mystic_robe: 'M23 8 L32 13 L41 8 L53 20 L49 34 L47 57 H17 L15 34 L11 20 Z', troll_mantle: 'M9 22 C11 11 21 6 32 6 C43 6 53 11 55 22 L57 38 L51 35 L53 48 L45 43 L43 56 L36 47 L32 58 L28 47 L21 56 L19 43 L11 48 L13 35 L7 38 Z',
    iron_blade: 'M32 2 L38 8 V41 L32 47 L26 41 V8 Z', runed_staff: 'M22 22 C18 14 22 6 32 5 C42 6 46 14 42 22 C40 18 38 16 36 16 L28 16 C26 16 24 18 22 22 Z', doom_edge: 'M32 1 L37 8 L35 12 L40 17 L36 22 L41 28 L38 36 L40 42 L32 48 L24 42 L26 36 L23 28 L28 22 L24 17 L29 12 L27 8 Z', hunter_bow: '', shadow_dagger: 'M32 2 C42 12 41 30 37 43 H27 C23 30 22 12 32 2 Z' };
  const ENG = { iron_helm: ['M32 9 V28', 'M32 10 C25 12 19 19 17 28', 'M32 10 C39 12 45 19 47 28'], scout_hood: ['M32 8 C22 12 17 24 17 36', 'M32 8 C42 12 47 24 47 36'], vampire_crown: ['M12 44 H52', 'M23 36 L32 18 L41 36'], wizard_hat: ['M32 6 C30 18 24 30 17 44', 'M32 6 C34 18 40 30 47 44'], horned_helm: ['M32 18 V34', 'M32 19 C25 21 19 26 17 33', 'M32 19 C39 21 45 26 47 33'],
    leather_vest: ['M22 14 V44', 'M42 14 V44'], chainmail: ['M32 16 V50'], dragon_plate: ['M26 14 L22 50', 'M38 14 L42 50'], mystic_robe: ['M20 24 C18 36 18 46 19 54', 'M44 24 C46 36 46 46 45 54'], troll_mantle: ['M32 24 V52'],
    iron_blade: ['M34.5 8 V40'], runed_staff: ['M28 12 C27 16 28 19 30 21', 'M36 12 C37 16 36 19 34 21'], doom_edge: ['M35 10 V40'], hunter_bow: [], shadow_dagger: ['M34 6 V40'] };
  const EYES = { iron_helm: [[25, 34], [39, 34]], scout_hood: [[27, 35], [37, 35]], horned_helm: [[26, 43], [38, 43]] };
  const sil = SIL[key]; let fin = '';
  if (sil) {
    const tx = id + 'tx', sh = id + 'sh', cp = id + 'cp';
    defs += `<filter id="${tx}" x="0" y="0" width="64" height="64" filterUnits="userSpaceOnUse"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${GEAR_IDX[key] + 3}" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.6 -.55" result="m"/><feComposite in="m" in2="SourceAlpha" operator="in"/></filter>`;
    defs += `<linearGradient id="${sh}" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".30"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></linearGradient><clipPath id="${cp}"><path d="${sil}"/></clipPath>`;
    fin += `<path d="${sil}" fill="#000" filter="url(#${tx})" opacity=".34"/><path d="${sil}" fill="url(#${sh})"/>`;
    if (t >= 1) for (const d of ENG[key]) fin += `<path d="${d}" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="1.4" stroke-linecap="round"/><path d="${d}" transform="translate(.9 .9)" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width=".8" stroke-linecap="round"/>`;
    if (t === 6) fin += `<g clip-path="url(#${cp})" fill="none" stroke="#ff2a1a" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M16 14 L24 22 L19 30 L28 38 L24 50"/><path d="M46 12 L40 22 L47 29 L40 38 L45 52"/><path d="M30 8 L33 18 L29 26 L35 34"/><path d="M12 36 L20 40 M52 40 L44 44 M30 46 L36 54"/></g>`;
  }
  const ey = EYES[key];
  if (ey && t >= 2) for (const [ex, ey2] of ey) fin += `<ellipse cx="${ex}" cy="${ey2}" rx="6.5" ry="3.4" fill="${P.eye}" fill-opacity="${t === 6 ? 0.22 : 0.32}"/><ellipse cx="${ex}" cy="${ey2}" rx="3.9" ry="1.5" fill="${P.eye}"/><ellipse cx="${ex}" cy="${ey2}" rx="1.6" ry=".6" fill="#fff" fill-opacity=".9"/>`;
  art += fin;
  // ---- adornments: rarity upgrades ----
  const g = a.gem, tp = a.top, sd = a.sides; let pre = '', post = '';
  if (L >= 1) post += `<circle cx="${sd[0][0]}" cy="${sd[0][1]}" r="2.2" fill="${TR}" ${st(1)}/><circle cx="${sd[1][0]}" cy="${sd[1][1]}" r="2.2" fill="${TR}" ${st(1)}/>`;
  if (L >= 1) post += `<circle cx="${g[0]}" cy="${g[1]}" r="${L === 1 ? 7 : L === 2 ? 9 : 10}" fill="${P.gem[0]}" fill-opacity="${t === 6 ? 0.18 : 0.28}"/><circle cx="${g[0]}" cy="${g[1]}" r="${L === 1 ? 3.4 : L === 2 ? 4.4 : 5}" fill="${GM}" ${st(1.4)}/><circle cx="${g[0] - 1.1}" cy="${g[1] - 1.2}" r="1.2" fill="#fff" fill-opacity=".85"/>`;
  if (L >= 2) {
    const f = (s) => { const [x, y] = sd[s], d = s ? 1 : -1; return `<path d="M${x} ${y - 2} L${x + d * 12} ${y - 15} L${x + d * 7} ${y - 1} Z M${x} ${y + 1} L${x + d * 11} ${y + 3} L${x + d * 4} ${y + 6} Z" fill="${M}" ${st(1.1)}/><path d="M${x + d * 1.5} ${y - 3} L${x + d * 10} ${y - 13}" stroke="#fff" stroke-opacity=".5" stroke-width=".8" fill="none"/>`; };
    pre += f(0) + f(1);
    pre += `<path d="M${tp[0] - 3.5} ${tp[1] + 7} L${tp[0]} ${tp[1] - 4} L${tp[0] + 3.5} ${tp[1] + 7} Z" fill="${M}" ${st(1.1)}/><path d="M${tp[0] - 1} ${tp[1] + 6} L${tp[0]} ${tp[1] - 2}" stroke="#fff" stroke-opacity=".5" stroke-width=".9" fill="none"/>`; }
  let bg = '';
  if (t === 4) { // legendary: golden radiance with rays
    let rays = ''; for (let i = 0; i < 12; i++) { const an = i * Math.PI / 6; rays += `<path d="M32 32 L${(32 + 44 * Math.cos(an - 0.09)).toFixed(1)} ${(32 + 44 * Math.sin(an - 0.09)).toFixed(1)} L${(32 + 44 * Math.cos(an + 0.09)).toFixed(1)} ${(32 + 44 * Math.sin(an + 0.09)).toFixed(1)} Z" fill="#fff6b0" fill-opacity=".38"/>`; }
    bg = `<circle cx="32" cy="32" r="32" fill="${rg([[0, '#fff9c4', 0.95], [0.5, '#ffe45c', 0.5], [1, '#ffd000', 0]])}"/>` + rays;
    pre += `<g fill="#fff9c4" ${st(1)}><path d="M${tp[0] - 7} ${tp[1] + 4} L${tp[0] - 4} ${tp[1] - 6} L${tp[0]} ${tp[1] + 1} L${tp[0] + 4} ${tp[1] - 6} L${tp[0] + 7} ${tp[1] + 4} Z" fill="${TR}"/></g>`;
    post += `<path d="M10 12 l1.6 3.6 3.6 1.6 -3.6 1.6 -1.6 3.6 -1.6 -3.6 -3.6 -1.6 3.6 -1.6Z M54 50 l1.2 2.6 2.6 1.2 -2.6 1.2 -1.2 2.6 -1.2 -2.6 -2.6 -1.2 2.6 -1.2Z" fill="#fff" fill-opacity=".95"/>`; }
  if (t === 5) { // mythic: red radiance and licking flames
    bg = `<circle cx="32" cy="32" r="32" fill="${rg([[0, '#ff8a80', 0.95], [0.5, '#ff1744', 0.55], [1, '#d50000', 0]])}"/>`;
    const fl = (x, y, s, r) => `<path d="M${x} ${y} C${x - 5 * s} ${y - 6 * s} ${x - 2 * s} ${y - 12 * s} ${x} ${y - 18 * s} C${x + 1 * s} ${y - 12 * s} ${x + 5 * s} ${y - 8 * s} ${x + 4 * s} ${y - 3 * s} Z" transform="rotate(${r} ${x} ${y})" fill="#ff5a1f" stroke="#ffd180" stroke-width=".9"/>`;
    { const hr = (s) => { const [x, y] = sd[s], d = s ? 1 : -1; return `<path d="M${x} ${y} C${x + d * 11} ${y + 1} ${x + d * 15} ${y - 12} ${x + d * 9} ${y - 22} C${x + d * 9} ${y - 11} ${x + d * 5} ${y - 6} ${x} ${y - 5} Z" fill="${BN}" ${st(1.2)}/>`; }; pre += hr(0) + hr(1); }
    pre += `<circle cx="32" cy="32" r="29" fill="none" stroke="#4a0510" stroke-width="3.4"/><circle cx="32" cy="32" r="29" fill="none" stroke="#ff4a2a" stroke-width="1" stroke-dasharray="2 3"/>` + [[32,1],[63,32],[32,63],[1,32]].map(([x,y]) => `<path d="M${x} ${y} l${x<32?-3:x>32?3:-2} ${y<32?-3:y>32?3:-2} l${x===32?4:0} ${y===32?4:0} Z" fill="#4a0510"/>`).join('') + fl(tp[0], tp[1] + 3, 1.1, 0) + fl(tp[0] - 9, tp[1] + 7, 0.8, -28) + fl(tp[0] + 9, tp[1] + 7, 0.8, 28) + fl(sd[0][0] + 2, sd[0][1] + 10, 0.8, -70) + fl(sd[1][0] - 2, sd[1][1] + 10, 0.8, 70); }
  if (t === 6) { // doomsday: black spikes and horns over burning cinders (no glow)
    let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0; const rnd = () => (h = (Math.imul(h, 1664525) + 1013904223) >>> 0) / 4294967296;
    let em = ''; for (let i = 0; i < 34; i++) { const x = rnd() * 64, y = 20 + rnd() * 44, r = 0.5 + rnd() * 1.5, hot = rnd(); em += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${hot > 0.7 ? '#ffd54f' : hot > 0.35 ? '#ff7a1a' : '#e53900'}" fill-opacity="${(0.4 + rnd() * 0.6).toFixed(2)}"/>`; }
    let coals = ''; for (let i = 0; i < 9; i++) coals += `<ellipse cx="${(4 + i * 7.5 + rnd() * 3).toFixed(1)}" cy="${(58 + rnd() * 5).toFixed(1)}" rx="${(5 + rnd() * 4).toFixed(1)}" ry="${(2.4 + rnd() * 2).toFixed(1)}" fill="${rg([[0, '#ff9a3c', 0.95], [0.6, '#d63a00', 0.8], [1, '#5a0a00', 0.7]])}"/>`;
    bg = `<rect width="64" height="64" fill="${lg(['#0a0203', '#2a0705', '#5a1204'], 1)}"/><rect y="40" width="64" height="24" fill="${rg([[0, '#ff6a00', 0.0], [1, '#ff6a00', 0]])}"/><ellipse cx="32" cy="64" rx="40" ry="20" fill="${rg([[0, '#ff6a1a', 0.55], [1, '#ff2a00', 0]])}"/>` + coals + em;
    const hn = (s) => { const [x, y] = sd[s], d = s ? 1 : -1; return `<path d="M${x} ${y + 2} C${x + d * 8} ${y + 2} ${x + d * 11} ${y - 8} ${x + d * 7} ${y - 16} C${x + d * 6} ${y - 8} ${x + d * 3} ${y - 4} ${x} ${y - 4} Z" fill="#0d0a0c" stroke="#a01010" stroke-width="1.1"/>`; };
    pre += hn(0) + hn(1) + `<path d="M${tp[0] - 4} ${tp[1] + 7} L${tp[0]} ${tp[1] - 5} L${tp[0] + 4} ${tp[1] + 7} Z" fill="#0d0a0c" stroke="#5a0000" stroke-width="1.2"/>`; }
  const sc = rot ? 0.95 : 0.98, tf = ` transform="translate(32 35) rotate(${rot}) scale(${sc}) translate(-32 -33)"`;
  const shadow = `<ellipse cx="32" cy="60" rx="18" ry="2.6" fill="#000" fill-opacity=".28"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>${defs}</defs>${bg}${t === 6 ? '' : shadow}<g${tf}>${pre}${art}${post}</g></svg>`;
}
const gearURIs = {};
const gearURI = (key, t) => gearURIs[key + ':' + t] || (gearURIs[key + ':' + t] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(gearSVG(key, t)));
const ENEMIES = {
  rat: { name: 'Rat', atk: 1, hp: 10, speed: 95, r: 8, cd: 0.8, gold: 2.5 },
  goblin: { name: 'Goblin', atk: 3, hp: 30, speed: 70, r: 11, cd: 1.0, gold: 5 },
  skeleton: { name: 'Skeleton Archer', atk: 5, hp: 20, speed: 60, r: 10, cd: 1.6, ranged: true, gold: 5 }, // from stage 2
  voidling: { name: 'Voidling', atk: 10, hp: 30, speed: 65, r: 10, cd: 3, laser: true, gold: 7.5 },          // from stage 3
  sorcerer: { name: 'Sorcerer', atk: 20, hp: 40, speed: 58, r: 10, cd: 3.5, caster: true, gold: 10 },             // from stage 5-1
  hellguard: { name: 'Hellguard', atk: 15, hp: 60, speed: 70, r: 11, cd: 1, gold: 12 },                       // Doom stages only (target lock + barrier)
  assassin: { name: 'Assassin', atk: 25, hp: 55, speed: 75, r: 11, cd: 1, gold: 12 },                         // from stage 6-1 (teleport strike)
  troll: { name: 'Troll', atk: 10, hp: 100, speed: 60.5, r: 14, cd: 1.2, boss: true, gold: 0 },
  skeleton_king: { name: 'Skeleton King', atk: 15, hp: 150, speed: 58, r: 15, cd: 1.6, boss: true, gold: 0, reach: 70 },
  cerberus: { name: 'Cerberus', atk: 20, hp: 200, speed: 66, r: 15, cd: 1.2, boss: true, gold: 0 },             // 3-headed hound; boss of every 3rd stage (3, 6, 9, ...)
};
// Boss order: stage 1 Troll, stage 2 Skeleton King, stage 3 Cerberus, stage 4 Troll, ... New bosses go at the END of this list.
const BOSS_ORDER = ['troll', 'skeleton_king', 'cerberus'];
const bossFor = stage => BOSS_ORDER[(stage - 1) % BOSS_ORDER.length];
// Gold per kill = base gold x (1 + GOLD_PER_STAGE x (stage - 1)), rounded. Bosses and summoned minions pay nothing.
const GOLD_PER_STAGE = 0.15;
const goldFor = (type, stage) => Math.round(Math.round(ENEMIES[type].gold * (1 + GOLD_PER_STAGE * (stage - 1)) * 1e6) / 1e6);
// Troll Smash: stops and charges for 1 s (red circle shows the area), then hits everyone inside for 3x ATK. 10 s cooldown.
const SMASH = { cd: 10, charge: 1, mult: 3, r: 120, trigger: 0.9 }; // r is bigger than the warrior's spin (85)
// Skeleton King: big mace cleave in front of him; summons archers; charges forward for a x3 cleave.
const KING = {
  cleave: { r: 150, arc: 1.1, windup: 0.5, cd: 1.6 },          // radius px, half-angle rad
  summon: { cd: 30, n: 3, first: 3, cap: 6 },                 // skill 1: 3 archers every 30 s (max 6 alive)
  dash: { charge: 1, mult: 3, cd: 12, first: 6, speed: 520, range: 420 }, // skill 2: charge cleave
};
// Sorcerer: 3 pillars of fire erupt one after another in a line toward the target. gap = seconds between pillars; step = px between them.
const SORC = { range: 230, hold: 170, keep: 100, windup: 0.5, gap: 0.45, step: 70, n: 3, r: 30, rise: 0.45 };
// Cerberus: Fireballs (one per head, fired one after another, bounce off walls) and a Jump that lands on the target.
const CERB = {
  fire: { cd: 25, first: 6, windup: 0.5, gap: 0.3, speed: 210, mult: 1.5, life: 10, spread: 0.3, range: 640 },
  jump: { cd: 15, first: 4, up: 1.3, down: 0.3, lock: 0.45, r: 110, mult: 3, min: 70, max: 450 }, // up = whole flight (he leaps, travels over the floor and lands); the landing spot stops following you for the last `lock` seconds
};
const LASER = { range: 640, charge: 0.8, lock: 0.25, width: 14, keep: 220, hold: 480 }; // Voidling: red laser ignores walls
// Hellguard: once it spots you it locks on and never stops chasing (only a wolf's howl breaks the lock); while locked it wears a barrier of 50% of its max HP.
const LOCK = { barrier: 0.5 };
// Assassin: once it has spotted you it may blink next to you (10 s cooldown); half a second after it lands it strikes once, so you can step out of the red circle.
const TP = { cd: 10, first: 3, chance: 1, vanish: 0.3, windup: 0.5, r: 46, mult: 2, near: 30, minDist: 80, maxDist: 560 }; // chance = per second once ready
const HEAL_RANGE = 200;
const HEALER = { maxPct: 0.2, curPct: 0.1 };   // the healer's ray only reaches allies this close
const REVIVE_TIME = 5;   // seconds the reviver must stay put and unhurt
const REVIVE_RANGE = 64;  // how close you must stand to a downed ally to revive them
const ARROW = { speed: 240, life: 1.3, range: 250, keep: 110, hold: 210 };
// ---- pets ----
const PET_SIGHT = 230;    // a pet only fights once it sees an enemy within this distance
const PETS = {
  wolf: { name: 'Wolf', kind: 'Attacker', atk: 5, hp: 55, speed: 185, r: 9, cd: 0.8, price: 5000,
    ability: 'Howl: when enemies are gathered around it, they run away in fear and cannot attack for 2 seconds (bosses are immune). (15 s cooldown)' },
  panther: { name: 'Panther', kind: 'Attacker', atk: 6, hp: 60, speed: 215, r: 9, cd: 0.7, price: 5000,
    ability: 'Triple Slash: slashes the area in front of it 3 times rapidly. (12 s cooldown)' },
  turtle: { name: 'Turtle', kind: 'Defender', atk: 2, hp: 90, speed: 130, r: 11, cd: 1.2, price: 5000,
    ability: 'Shell Barrier: shields you and itself for 75% of its current HP for 5 seconds; any barrier left over heals for 20% of what remains. (25 s cooldown)' },
};
const WOLF = { r: 190, fear: 2, cd: 15, crowd: 3, engage: 85 }; // howls once 3 enemies (or all that are left) are within r and the nearest is within `engage` px
const PANTHER = { hits: 3, gap: 0.14, mult: 1.5, r: 72, arc: 1.2, cd: 12 };
const TURTLE = { mult: 0.75, dur: 5, heal: 0.2, cd: 25, r: 240 };
// ---- equipment: 3 slots, 6 rarity tiers (Common..Mythic) of 15 pieces + a 7th tier (Doomsday) that only exists as its own separate pieces ----
// MERGE_N identical pieces of one tier merge into the next tier, up to Mythic (MERGE_TOP). Mythic cannot be merged; Doomsday pieces only come straight out of chests.
const TIERS = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Doomsday'];
const TIER_BORDER = GEAR_BORDER, TIER_COLORS = ['#b0bec5', '#81c784', '#4fc3f7', '#ba68c8', '#ffd54f', '#ff5a73', '#e53935']; // border colours (tiles) / brighter text colours
const MERGE_N = 3;       // how many identical pieces make the next tier
const MERGE_TOP = 5;     // Mythic: the highest tier that merging can produce (index 5)
const DOOM_TIER = 6;
const TIER_VERSION = 7;  // saves from the 4-tier days (Common/Rare/Epic/Legendary) are converted on load
const SLOTS = { head: 'Head', body: 'Body', weapon: 'Weapon' };
// Numbers come from CoDunge_Enemy_Stats.xlsx (Equipment & Drops + Equipment Bonuses). vals = main effect for Common..Mythic; bon = extra bonuses that stack from tier `from` (Epic=3, Legendary=4, Mythic=5).
// eff: atk / hp = flat, dr / spd = fraction (0.05 = 5%), vamp = fraction of max HP healed per kill. Doomsday pieces (doom: true) have a fixed bonus list and are drawn with `art`.
const EQUIP = {
  iron_helm: { name: "Iron Helm", slot: 'head', price: 300, eff: 'dr', vals: [0.05, 0.07, 0.1, 0.15, 0.25, 0.4],
    bon: [{ eff: "hp", from: 3, v: [15, 25, 40] }, { eff: "atk", from: 4, v: [2, 4] }, { eff: "spd", from: 5, v: [0.05] }] },
  scout_hood: { name: "Scout's Hood", slot: 'head', price: 300, eff: 'spd', vals: [0.02, 0.03, 0.05, 0.08, 0.1, 0.15],
    bon: [{ eff: "atk", from: 3, v: [2, 3, 5] }, { eff: "dr", from: 4, v: [0.03, 0.05] }, { eff: "vamp", from: 5, v: [0.03] }] },
  vampire_crown: { name: "Vampire Crown", slot: 'head', price: 300, eff: 'vamp', vals: [0.01, 0.02, 0.03, 0.05, 0.08, 0.1],
    bon: [{ eff: "hp", from: 3, v: [15, 25, 40] }, { eff: "atk", from: 4, v: [2, 4] }, { eff: "dr", from: 5, v: [0.05] }] },
  leather_vest: { name: "Leather Vest", slot: 'body', price: 400, eff: 'hp', vals: [15, 20, 30, 45, 60, 80],
    bon: [{ eff: "spd", from: 3, v: [0.03, 0.05, 0.08] }, { eff: "atk", from: 4, v: [2, 3] }, { eff: "dr", from: 5, v: [0.03] }] },
  chainmail: { name: "Chainmail", slot: 'body', price: 400, eff: 'hp', vals: [20, 25, 35, 50, 65, 85],
    bon: [{ eff: "dr", from: 3, v: [0.03, 0.05, 0.08] }, { eff: "atk", from: 4, v: [2, 3] }, { eff: "vamp", from: 5, v: [0.02] }] },
  dragon_plate: { name: "Dragon Plate", slot: 'body', price: 400, eff: 'hp', vals: [35, 40, 50, 65, 80, 100],
    bon: [{ eff: "dr", from: 3, v: [0.04, 0.06, 0.1] }, { eff: "atk", from: 4, v: [3, 5] }, { eff: "vamp", from: 5, v: [0.03] }] },
  iron_blade: { name: "Iron Blade", slot: 'weapon', price: 500, eff: 'atk', vals: [2, 3, 4, 5, 7, 10],
    bon: [{ eff: "hp", from: 3, v: [15, 25, 40] }, { eff: "spd", from: 4, v: [0.03, 0.05] }, { eff: "vamp", from: 5, v: [0.02] }] },
  runed_staff: { name: "Runed Staff", slot: 'weapon', price: 500, eff: 'atk', vals: [2, 5, 6, 9, 12, 17],
    bon: [{ eff: "vamp", from: 3, v: [0.02, 0.03, 0.05] }, { eff: "hp", from: 4, v: [25, 40] }, { eff: "spd", from: 5, v: [0.05] }] },
  doom_edge: { name: "Doom Edge", slot: 'weapon', price: 500, eff: 'atk', vals: [2, 9, 11, 16, 22, 31],
    bon: [{ eff: "vamp", from: 3, v: [0.02, 0.04, 0.06] }, { eff: "dr", from: 4, v: [0.03, 0.05] }, { eff: "spd", from: 5, v: [0.05] }] },
  wizard_hat: { name: "Wizard Hat", slot: 'head', price: 400, eff: 'atk', vals: [1, 2, 3, 5, 7, 10],
    bon: [{ eff: "hp", from: 3, v: [12, 20, 32] }, { eff: "spd", from: 4, v: [0.03, 0.05] }, { eff: "vamp", from: 5, v: [0.02] }] },
  horned_helm: { name: "Horned Helm", slot: 'head', price: 400, eff: 'dr', vals: [0.04, 0.06, 0.09, 0.13, 0.2, 0.3],
    bon: [{ eff: "atk", from: 3, v: [2, 3, 5] }, { eff: "hp", from: 4, v: [20, 35] }, { eff: "spd", from: 5, v: [0.04] }] },
  mystic_robe: { name: "Mystic Robe", slot: 'body', price: 400, eff: 'hp', vals: [12, 16, 24, 36, 52, 72],
    bon: [{ eff: "spd", from: 3, v: [0.03, 0.05, 0.08] }, { eff: "atk", from: 4, v: [2, 3] }, { eff: "dr", from: 5, v: [0.04] }] },
  troll_mantle: { name: "Troll Mantle", slot: 'body', price: 500, eff: 'hp', vals: [40, 48, 60, 76, 96, 120],
    bon: [{ eff: "dr", from: 3, v: [0.02, 0.04, 0.06] }, { eff: "vamp", from: 4, v: [0.01, 0.02] }, { eff: "atk", from: 5, v: [3] }] },
  hunter_bow: { name: "Hunter Bow", slot: 'weapon', price: 500, eff: 'atk', vals: [3, 4, 6, 8, 11, 15],
    bon: [{ eff: "spd", from: 3, v: [0.03, 0.05, 0.08] }, { eff: "vamp", from: 4, v: [0.01, 0.02] }, { eff: "hp", from: 5, v: [30] }] },
  shadow_dagger: { name: "Shadow Dagger", slot: 'weapon', price: 500, eff: 'atk', vals: [4, 5, 7, 9, 13, 18],
    bon: [{ eff: "vamp", from: 3, v: [0.01, 0.02, 0.04] }, { eff: "spd", from: 4, v: [0.03, 0.06] }, { eff: "dr", from: 5, v: [0.03] }] },
  // ---- Doomsday-only pieces (chest drops only, never merged) ----
  doomsday_visage: { name: "Doomsday Visage", slot: 'head', price: 500, doom: true, art: 'iron_helm',
    bon: [{ eff: "dr", v: 0.3 }, { eff: "atk", v: 10 }, { eff: "spd", v: 0.1 }] },
  doomsday_bulwark: { name: "Doomsday Bulwark", slot: 'body', price: 500, doom: true, art: 'dragon_plate',
    bon: [{ eff: "hp", v: 160 }, { eff: "dr", v: 0.1 }, { eff: "vamp", v: 0.05 }] },
  doomsday_reaper: { name: "Doomsday Reaper", slot: 'weapon', price: 500, doom: true, art: 'doom_edge',
    bon: [{ eff: "atk", v: 45 }, { eff: "vamp", v: 0.08 }, { eff: "spd", v: 0.08 }] },
};
const EQUIP_KEYS = Object.keys(EQUIP), BASE_KEYS = EQUIP_KEYS.filter(k => !EQUIP[k].doom), DOOM_KEYS = EQUIP_KEYS.filter(k => EQUIP[k].doom);
const sellPrice = (key, tier) => Math.round(EQUIP[key].price / 2) * Math.pow(MERGE_N, tier); // each tier is worth MERGE_N pieces of the one below
const pctOf = v => Math.round(v * 100);
function bonusList(key, tier) { // every bonus this piece gives at this tier: main effect first, then the extra ones (Epic and up)
  const d = EQUIP[key];
  if (d.doom) return d.bon.map(b => ({ eff: b.eff, v: b.v }));
  const t = Math.max(0, Math.min(MERGE_TOP, tier | 0)), out = [{ eff: d.eff, v: d.vals[t] }];
  for (const b of d.bon) if (t >= b.from) out.push({ eff: b.eff, v: b.v[t - b.from] });
  return out;
}
const effText = (eff, v) => eff === 'dr' ? `Take ${pctOf(v)}% less damage` : eff === 'spd' ? `Move ${pctOf(v)}% faster` : eff === 'vamp' ? `Heal ${pctOf(v)}% max HP per kill` : eff === 'hp' ? `+${v} HP` : `+${v} ATK`;
function equipText(key, tier) { return bonusList(key, tier).map(b => effText(b.eff, b.v)).join(' · '); }
const gearArt = key => EQUIP[key].art || key;                                           // which drawing a piece uses
const gearIc = (key, tier, cls) => `<img class="${cls || 'gimg'}" src="${gearURI(gearArt(key), tier)}" alt="">`;   // equipment picture for HTML

// ---------------- name filter ----------------
// Blocks rude or unfriendly names. It cannot be perfect (no filter is): it normalises look-alike characters, then checks a list of strong
// words anywhere in the name and a list of weaker words only as whole words. Extend the lists freely.
const BAD_STRONG = ['fuck', 'shit', 'cunt', 'bitch', 'nigg', 'fagg', 'whore', 'slut', 'rapist', 'nazi', 'hitler', 'molest', 'paedo', 'dickhead', 'asshole', 'bastard', 'retard', 'cocksuck', 'blowjob', 'handjob', 'jizz', 'cumshot', 'porn', 'penis', 'vagina', 'pussy', 'wank', 'twat', 'bollock', 'jihad', 'suicide', 'killyourself', 'tranny', 'chink', 'kike'];
const BAD_WORDS = ['kkk', 'isis', 'spic', 'coon', 'kys', 'rape', 'pedo', 'ass', 'arse', 'dick', 'cock', 'cum', 'tit', 'tits', 'boob', 'boobs', 'anal', 'anus', 'sex', 'sexy', 'nude', 'nudes', 'hoe', 'fag', 'gay', 'dyke', 'damn', 'crap', 'piss', 'turd', 'fart', 'poo', 'nsfw', 'kill', 'die', 'rapey', 'bum', 'weed', 'drug', 'drugs', 'hell', 'idiot', 'stupid', 'dumb', 'loser', 'ugly', 'fat', 'noob'];
const BAD_ALLOW = ['assassin', 'class', 'classic', 'glass', 'grass', 'pass', 'mass', 'bass', 'brass', 'assist', 'assume', 'assure', 'asset', 'cassie', 'massive', 'passion', 'sassy', 'scunthorpe', 'cocktail', 'peacock', 'hancock', 'titan', 'title', 'tittle', 'attitude', 'constitution', 'dickens', 'cumin', 'document', 'circumstance', 'cucumber', 'shitake', 'analyst', 'analog', 'canal', 'banal', 'sussex', 'essex', 'middlesex', 'bumble', 'bummer', 'hello', 'shell', 'seashell'];
function isBadName(name) {
  const raw = String(name || '').toLowerCase(); if (!raw) return false;
  const map = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't', '€': 'e', '£': 'l' };
  const norm = raw.replace(/[0-9@$!|+€£]/g, c => map[c]).normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const words = norm.split(/[^a-z]+/).filter(Boolean);                       // whole words as typed
  const letters = norm.replace(/[^a-z]/g, ''), one = letters.replace(/(.)\1+/g, '$1'), two = letters.replace(/(.)\1{2,}/g, '$1$1'); // "fuuuck" -> one: "fuck"; "niggger" -> two: "nigger"
  const dbl = w => /(.)\1/.test(w), single = w => w.replace(/(.)\1+/g, '$1'), fix = (t, f) => BAD_ALLOW.reduce((x, w) => x.split(f(w)).join(''), t), two2 = w => w.replace(/(.)\1{2,}/g, '$1$1');   // allowlist ("assassin", "class") is cut out before matching
  const o1 = fix(one, single), o2 = fix(two, two2);
  if (BAD_STRONG.some(w => (dbl(w) ? o2 : o1).includes(w))) return true;
  const w1 = words.map(single), w2 = words.map(two2);
  if (BAD_WORDS.some(w => (dbl(w) ? w2 : w1).includes(w))) return true;
  // CamelCase pieces ("BigDick") count as words too
  const camel = String(name).replace(/[^A-Za-z]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(' ').filter(Boolean);
  return BAD_WORDS.some(w => camel.includes(w));
}

// ---------------- profile / save ----------------
const SAVE_KEY = 'coopquest.v1';
const emptyUp = () => ({ warrior: { atk: 0, hp: 0 }, mage: { atk: 0, hp: 0 }, healer: { atk: 0, hp: 0 } });
const emptyPetUp = () => ({ wolf: { atk: 0, hp: 0 }, panther: { atk: 0, hp: 0 }, turtle: { atk: 0, hp: 0 } });
const defaultProfile = () => ({ name: '', cp: 0, pp: 0, gold: 0, sel: 'warrior', up: emptyUp(), best: { stage: 1, level: 1 }, pets: [], pet: '', petUp: emptyPetUp(), inv: {}, eq: { head: null, body: null, weapon: null }, tv: TIER_VERSION, chestBuys: 0, ageOk: false, friendCode: '', friends: [] });
const OLD_TIER_MAP = [0, 2, 3, 4]; // the old 4 tiers (Common, Rare, Epic, Legendary) sit at these places in the 7-tier list
const cap = (v, m) => Math.min(m, Math.max(0, Math.floor(+v) || 0));
// Turns anything (an old save, a pasted save code) into a valid profile: unknown keys dropped, numbers clamped, tiers converted. Returns { out, migrated }.
function sanitizeProfile(p) {
  const d = defaultProfile(); let migrated = false;
  const out = Object.assign(d, p, { best: Object.assign(d.best, p.best || {}) });
  for (const k of Object.keys(out)) if (!(k in defaultProfile())) delete out[k];
  out.name = String(out.name || '').replace(/[<>&"'`\u0000-\u001f]/g, '').slice(0, 12);
  if (isBadName(out.name)) out.name = '';
  out.chestBuys = cap(out.chestBuys, 1e6); out.ageOk = !!out.ageOk;
  out.friendCode = /^[A-Z0-9]{6}$/.test(out.friendCode) ? out.friendCode : '';
  { const seen = new Set([out.friendCode]); out.friends = (Array.isArray(out.friends) ? out.friends : []).filter(f => f && typeof f === 'object' && /^[A-Z0-9]{6}$/.test(f.code) && !seen.has(f.code) && seen.add(f.code))
      .slice(0, 30).map(f => ({ code: f.code, name: String(f.name || '').replace(/[<>&"'`\u0000-\u001f]/g, '').trim().slice(0, 12), st: f.st === 'pend' ? 'pend' : 'ok' })); }
  out.cp = cap(out.cp, 1e9); out.gold = cap(out.gold, 1e9); out.pp = cap(out.pp, 1e9);
  out.best = { stage: Math.max(1, cap(out.best.stage, 999)), level: Math.max(1, cap(out.best.level, 10)) };
  out.sel = CHARS[out.sel] ? out.sel : 'warrior';
  { const pu = emptyPetUp(); for (const k of Object.keys(pu)) { const v = p.petUp && p.petUp[k]; if (v && typeof v === 'object') pu[k] = { atk: cap(v.atk, 1e6), hp: cap(v.hp, 1e6) }; } out.petUp = pu; }
  const oldTiers = (p.tv | 0) < TIER_VERSION, tierAt = t => oldTiers ? OLD_TIER_MAP[t] : t; // pre-7-tier saves: move each piece to its new tier slot
  { const inv = {};
    for (const k of EQUIP_KEYS) { const a = p.inv && p.inv[k]; if (Array.isArray(a)) { const row = TIERS.map(() => 0); a.forEach((n, t) => { let nt = tierAt(t); if (nt !== undefined && nt < TIERS.length) { // regular pieces stop at Mythic; Doomsday pieces are always Doomsday
           nt = EQUIP[k].doom ? DOOM_TIER : Math.min(nt, MERGE_TOP); row[nt] += cap(n, 1e6); } }); if (row.some(n => n)) inv[k] = row; } }
    out.inv = inv;
    const eq = { head: null, body: null, weapon: null };
    for (const sl of Object.keys(eq)) { const v = p.eq && p.eq[sl]; if (v && EQUIP[v.k] && EQUIP[v.k].slot === sl) { let nt = tierAt(v.t | 0); if (nt !== undefined && nt >= 0 && nt < TIERS.length) { nt = EQUIP[v.k].doom ? DOOM_TIER : Math.min(nt, MERGE_TOP); eq[sl] = { k: v.k, t: nt }; } } }
    out.eq = eq; }
  if (oldTiers) migrated = true;
  out.tv = TIER_VERSION;
  out.pets = (Array.isArray(out.pets) ? out.pets : []).filter((k, n, a) => PETS[k] && a.indexOf(k) === n);
  if (!out.pets.includes(out.pet)) out.pet = '';
  // Each point is now spent on ATK *or* HP. Old saves stored one number per character (a point gave both):
  // refund those points so the player can re-spend them, and save right away so the refund happens only once.
  const up = emptyUp();
  for (const c of Object.keys(CHARS)) {
    const v = p.up && p.up[c];
    if (typeof v === 'number') { out.cp = cap(out.cp + Math.max(0, v | 0), 1e9); migrated = true; }
    else if (v && typeof v === 'object') up[c] = { atk: cap(v.atk, 1e6), hp: cap(v.hp, 1e6) };
  }
  out.up = up;
  return { out, migrated };
}
function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (p && typeof p === 'object') {
      const { out, migrated } = sanitizeProfile(p);
      if (migrated) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(out)); } catch (e) {} }
      return out;
    }
  } catch (e) {}
  return defaultProfile();
}
let profile = loadProfile();
const mkFCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 6; i++) c += A[rnd(A.length)]; return c; };
if (!profile.friendCode) { profile.friendCode = mkFCode(); try { localStorage.setItem(SAVE_KEY, JSON.stringify(profile)); } catch (e) {} }
// ---- save codes: the whole profile as one line of text, so progress can be kept somewhere safe and loaded on another device ----
// Format: DD1.<base64url JSON>.<8-hex checksum>. The checksum only catches typos and cut-off pastes; it is not anti-cheat (the save lives in the browser anyway).
const fnv = str => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
const b64u = { enc: t => btoa(unescape(encodeURIComponent(t))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), dec: t => decodeURIComponent(escape(atob(t.replace(/-/g, '+').replace(/_/g, '/')))) };
function exportSave() { const body = b64u.enc(JSON.stringify(profile)); return 'DD1.' + body + '.' + fnv(body); }
function parseSave(code) { // returns { ok, profile } or { ok: false, msg }
  const parts = String(code || '').replace(/\s+/g, '').split('.');
  if (parts.length !== 3 || parts[0] !== 'DD1') return { ok: false, msg: 'That does not look like a Doom and Dungeons save code.' };
  if (fnv(parts[1]) !== parts[2]) return { ok: false, msg: 'The code is damaged or cut off. Copy the whole code again.' };
  try { const p = JSON.parse(b64u.dec(parts[1])); if (!p || typeof p !== 'object') throw 0; return { ok: true, profile: sanitizeProfile(p).out }; }
  catch (e) { return { ok: false, msg: 'The code could not be read.' }; }
}
let onProfileSaved = null; // set by the lobby code: while a player customises from the lobby, every save is passed on to the other player
function saveProfile() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(profile)); } catch (e) {} if (onProfileSaved) onProfileSaved(); }
function gearBonus(eq) { // total of what the three equipped pieces give
  const b = { atk: 0, hp: 0, dr: 0, spd: 0, vamp: 0 };
  for (const sl of Object.keys(SLOTS)) { const it = eq && eq[sl]; if (it && EQUIP[it.k]) for (const x of bonusList(it.k, it.t)) b[x.eff] += x.v; }
  b.dr = Math.min(b.dr, 0.5); b.spd = Math.min(b.spd, 0.5); // the lobby only accepts up to +50%
  return b;
}
function statsFor(c) { const u = profile.up[c] || { atk: 0, hp: 0 }, b = gearBonus(profile.eq); return { atk: CHARS[c].atk + (u.atk | 0) + b.atk, hp: CHARS[c].hp + 5 * (u.hp | 0) + b.hp }; } // 1 point = +1 ATK or +5 HP, plus equipment
function petStatsFor(k) { const u = profile.petUp[k] || { atk: 0, hp: 0 }; return { atk: PETS[k].atk + (u.atk | 0), hp: PETS[k].hp + 5 * (u.hp | 0) }; } // 1 Pet Point = +1 ATK or +5 HP
// ---- equipment inventory (profile.inv[key] = pieces owned per tier, not counting the equipped ones) ----
function addGear(key, tier) { const row = profile.inv[key] || (profile.inv[key] = TIERS.map(() => 0)); row[tier]++; }
function takeGear(key, tier) { const row = profile.inv[key]; if (!row || row[tier] < 1) return false; row[tier]--; if (!row.some(n => n)) delete profile.inv[key]; return true; }
function equipGear(key, tier) {
  const sl = EQUIP[key].slot; if (!takeGear(key, tier)) return false;
  const old = profile.eq[sl]; if (old) addGear(old.k, old.t);
  profile.eq[sl] = { k: key, t: tier }; saveProfile(); return true;
}
function unequipGear(sl) { const old = profile.eq[sl]; if (!old) return; profile.eq[sl] = null; addGear(old.k, old.t); saveProfile(); }
function mergeGear(key, tier) { // MERGE_N identical pieces of one tier -> one piece of the next tier
  const row = profile.inv[key]; if (!row || row[tier] < MERGE_N || tier >= MERGE_TOP || EQUIP[key].doom) return false; // Mythic and Doomsday cannot be merged
  row[tier] -= MERGE_N; row[tier + 1]++; saveProfile(); return true;
}
function mergeAllGear() { // merge every identical set in the inventory, rarest results cascading upward; returns how many merges happened
  let n = 0;
  for (const key of EQUIP_KEYS) {
    const row = profile.inv[key]; if (!row || EQUIP[key].doom) continue;
    for (let t = 0; t < MERGE_TOP; t++) { const m = Math.floor(row[t] / MERGE_N); if (m) { row[t] -= MERGE_N * m; row[t + 1] += m; n += m; } }
    if (!row.some(x => x)) delete profile.inv[key];
  }
  if (n) saveProfile(); return n;
}
// ---- the Treasure Chest: the only way to buy equipment. One chest that levels up with every purchase: higher level = better odds, higher price ----
// odds[level-1] = chance per piece of each tier (Common .. Doomsday); need[level-1] = chests to buy at that level to reach the next one. Tune freely.
const CHEST = {
  name: 'Treasure Chest', icon: '📦', basePrice: 1000, growth: 1.25, pieces: 2,
  need: [8, 10, 12, 15, 18, 22, 26, 30, 35, 40, 45],
  odds: [   // from the Excel (Equipment & Drops). A Doomsday roll gives one of the Doomsday-only pieces; every other tier gives one of the 15 regular pieces.
    [0.88, 0.1, 0.02, 0, 0, 0, 0],
    [0.8, 0.15, 0.05, 0, 0, 0, 0],
    [0.65, 0.25, 0.1, 0, 0, 0, 0],
    [0.45, 0.33, 0.2, 0.02, 0, 0, 0],
    [0, 0.55, 0.4, 0.05, 0, 0, 0],
    [0, 0.4, 0.5, 0.1, 0, 0, 0],
    [0, 0, 0.78, 0.2, 0.02, 0, 0],
    [0, 0, 0.5, 0.45, 0.05, 0, 0],
    [0, 0, 0, 0.895, 0.1, 0.005, 0],
    [0, 0, 0, 0.692, 0.3, 0.008, 0],
    [0, 0, 0, 0, 0.984, 0.013, 0.0025],
    [0, 0, 0, 0, 0.975, 0.02, 0.005],
  ],
};
const CHEST_MAX = CHEST.odds.length;
function chestLevel(buys = profile.chestBuys) { let lv = 1, left = buys | 0; while (lv < CHEST_MAX && left >= CHEST.need[lv - 1]) { left -= CHEST.need[lv - 1]; lv++; } return lv; }
function chestProgress() { // chests bought toward the next level: { lv, have, need } (need 0 at max level)
  let lv = 1, left = profile.chestBuys | 0; while (lv < CHEST_MAX && left >= CHEST.need[lv - 1]) { left -= CHEST.need[lv - 1]; lv++; }
  return { lv, have: left, need: lv < CHEST_MAX ? CHEST.need[lv - 1] : 0 };
}
const chestPrice = lv => Math.round(CHEST.basePrice * Math.pow(CHEST.growth, lv - 1) / 50) * 50;
// ---- chest artwork: one look per level (wood -> iron -> bronze -> silver -> gold -> gems -> crowns -> doomsday) ----
// Chest icons: chestSVG(level 1..12) -> SVG string. Each level changes colours, trim, lid shape and adds extras.
const CHEST_LOOKS = [
  { name: 'Wooden',      body: '#8d5a2b', lid: '#a56a34', trim: '#5b3a1c', lock: '#b0a28a', glow: null,      arch: 0, studs: 0 },
  { name: 'Banded',      body: '#8d5a2b', lid: '#a56a34', trim: '#6e7378', lock: '#c4c9cf', glow: null,      arch: 1, studs: 4 },
  { name: 'Iron',        body: '#7a5530', lid: '#94653a', trim: '#8f979f', lock: '#d3d9de', glow: null,      arch: 1, studs: 6 },
  { name: 'Bronze',      body: '#7a4a24', lid: '#935a2c', trim: '#c9803a', lock: '#f0b866', glow: '#c9803a', arch: 1, studs: 6 },
  { name: 'Silver',      body: '#5f6f86', lid: '#7686a0', trim: '#d5dde8', lock: '#ffffff', glow: '#9ec5ff', arch: 1, studs: 6, gem: '#64b5f6' },
  { name: 'Golden',      body: '#7b3f1a', lid: '#9c5224', trim: '#ffc83d', lock: '#ffe27a', glow: '#ffc83d', arch: 1, studs: 6, gem: '#e53935' },
  { name: 'Emerald',     body: '#1f6b57', lid: '#2a8a6f', trim: '#ffc83d', lock: '#ffe27a', glow: '#3ddc97', arch: 1, studs: 6, gem: '#69f0ae', spark: 2 },
  { name: 'Amethyst',    body: '#5e3a94', lid: '#7a4fb8', trim: '#e1c8ff', lock: '#ffffff', glow: '#b388ff', arch: 0, studs: 6, gem: '#ea80fc', spark: 3 },
  { name: 'Royal',       body: '#8e1b2b', lid: '#b02336', trim: '#ffc83d', lock: '#ffe27a', glow: '#ff5252', arch: 1, studs: 8, gem: '#40c4ff', crown: 1, spark: 3 },
  { name: 'Mythic',      body: '#a01a6b', lid: '#c9268a', trim: '#ffd1ec', lock: '#ffffff', glow: '#ff4fb0', arch: 0, studs: 8, gem: '#ffee58', crown: 1, spark: 4 },
  { name: 'Radiant',     body: '#b8860b', lid: '#e0a81a', trim: '#fff3b0', lock: '#ffffff', glow: '#ffe066', arch: 1, studs: 8, gem: '#ff5252', crown: 1, spark: 5, gems: 1 },
  { name: 'Doomsday',    body: '#1b1013', lid: '#2a171b', trim: '#ff6a1a', lock: '#ffb347', glow: '#ff3d00', arch: 0, studs: 8, gem: '#ff3d00', spikes: 1, cracks: 1, spark: 4 },
];
function chestSVG(level, opt = {}) {
  const L = CHEST_LOOKS[Math.max(1, Math.min(12, level)) - 1], id = 'c' + level + (opt.uid || '');
  const lid = L.arch ? 'M20 62 L20 50 Q20 27 60 27 Q100 27 100 50 L100 62 Z' : 'M17 62 L25 34 L95 34 L103 62 Z';
  const lidTop = L.arch ? 27 : 34;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="${opt.size || 120}" height="${opt.size || 120}">
<defs>
<radialGradient id="${id}g" cx="50%" cy="55%" r="55%"><stop offset="0" stop-color="${L.glow || '#000'}" stop-opacity="${L.glow ? 0.55 : 0}"/><stop offset="1" stop-color="${L.glow || '#000'}" stop-opacity="0"/></radialGradient>
<linearGradient id="${id}l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".30"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>
<linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></linearGradient>
<linearGradient id="${id}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient>
</defs>
<circle cx="60" cy="68" r="58" fill="url(#${id}g)"/>
<ellipse cx="60" cy="104" rx="42" ry="7" fill="#000" opacity=".4"/>`;
  if (L.spikes) for (const x of [30, 45, 60, 75, 90]) s += `<path d="M${x - 5} ${lidTop + 6} L${x} ${lidTop - 14 - (x === 60 ? 6 : 0)} L${x + 5} ${lidTop + 6} Z" fill="#12090b" stroke="${L.trim}" stroke-width="1.5"/>`;
  // base
  s += `<rect x="20" y="60" width="80" height="40" rx="5" fill="${L.body}" stroke="#1a0f08" stroke-width="2.5"/><rect x="20" y="60" width="80" height="40" rx="5" fill="url(#${id}b)"/>`;
  for (const y of [72, 84]) s += `<line x1="22" y1="${y}" x2="98" y2="${y}" stroke="#000" stroke-opacity=".22" stroke-width="1.5"/>`;
  // lid
  s += `<path d="${lid}" fill="${L.lid}" stroke="#1a0f08" stroke-width="2.5" stroke-linejoin="round"/><path d="${lid}" fill="url(#${id}l)"/>`;
  if (L.arch) s += `<path d="M30 40 Q60 24 90 40" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="3" stroke-linecap="round"/>`;
  else s += `<path d="M30 40 L90 40" stroke="#fff" stroke-opacity=".25" stroke-width="3" stroke-linecap="round"/>`;
  if (L.cracks) for (const p of ['M30 66 L36 74 L32 82 L38 92', '90 68 L84 77 L89 86 L83 96']) s += `<polyline points="${p.replace(/^M/, '')}" fill="none" stroke="#ff6a1a" stroke-width="2" stroke-linejoin="round"/>`;
  // bands
  for (const x of [32, 82]) { s += `<rect x="${x}" y="${L.arch ? 30 : 34}" width="9" height="${L.arch ? 70 : 66}" fill="${L.trim}" stroke="#1a0f08" stroke-width="1.5"/><rect x="${x}" y="${L.arch ? 30 : 34}" width="9" height="${L.arch ? 70 : 66}" fill="url(#${id}t)" opacity=".5"/>`; }
  s += `<rect x="17" y="58" width="86" height="7" rx="2" fill="${L.trim}" stroke="#1a0f08" stroke-width="1.5"/><rect x="17" y="58" width="86" height="7" rx="2" fill="url(#${id}t)" opacity=".6"/>`;
  s += `<rect x="18" y="96" width="84" height="6" rx="2" fill="${L.trim}" stroke="#1a0f08" stroke-width="1.5"/>`;
  // studs
  const studs = [[24, 68], [96, 68], [24, 92], [96, 92], [36, 100], [84, 100], [36, 38], [84, 38]].slice(0, L.studs);
  for (const [x, y] of studs) s += `<circle cx="${x}" cy="${y}" r="2.3" fill="${L.lock}" stroke="#1a0f08" stroke-width="1"/>`;
  // lock plate
  s += `<rect x="50" y="54" width="20" height="26" rx="4" fill="${L.lock}" stroke="#1a0f08" stroke-width="2"/><rect x="50" y="54" width="20" height="26" rx="4" fill="url(#${id}t)" opacity=".5"/>`;
  s += L.gem ? `<circle cx="60" cy="63" r="5" fill="${L.gem}" stroke="#1a0f08" stroke-width="1.5"/><circle cx="58.3" cy="61.3" r="1.6" fill="#fff" opacity=".85"/>` : `<circle cx="60" cy="63" r="3.6" fill="#1a0f08"/>`;
  s += `<path d="M58 66 L62 66 L63 75 L57 75 Z" fill="#1a0f08"/>`;
  if (L.gems) for (const [x, y, c] of [[26, 52, '#40c4ff'], [94, 52, '#ff5252'], [60, 38, '#69f0ae']]) s += `<polygon points="${x},${y - 5} ${x + 4},${y} ${x},${y + 5} ${x - 4},${y}" fill="${c}" stroke="#1a0f08" stroke-width="1.2"/>`;
  if (L.crown) s += `<path d="M44 ${lidTop + 2} L44 ${lidTop - 8} L52 ${lidTop - 2} L60 ${lidTop - 13} L68 ${lidTop - 2} L76 ${lidTop - 8} L76 ${lidTop + 2} Z" fill="${L.trim}" stroke="#1a0f08" stroke-width="1.8" stroke-linejoin="round"/><circle cx="60" cy="${lidTop - 13}" r="2.4" fill="${L.gem || '#fff'}"/><circle cx="44" cy="${lidTop - 8}" r="1.8" fill="#ff5252"/><circle cx="76" cy="${lidTop - 8}" r="1.8" fill="#40c4ff"/>`;
  const sp = [[12, 30, 5], [108, 26, 6], [16, 78, 4], [106, 72, 4], [60, 10, 5]].slice(0, L.spark || 0);
  for (const [x, y, r] of sp) s += `<path d="M${x} ${y - r} Q${x + 1} ${y - 1} ${x + r} ${y} Q${x + 1} ${y + 1} ${x} ${y + r} Q${x - 1} ${y + 1} ${x - r} ${y} Q${x - 1} ${y - 1} ${x} ${y - r} Z" fill="${L.glow || '#fff'}" stroke="#fff" stroke-width=".8"/>`;
  return s + '</svg>';
}
function rollTier(odds) { // odds are used as shares of their own total, so a row that adds up to 99.95% still never falls through to Common
  const sum = odds.reduce((a, b) => a + b, 0) || 1; let r = Math.random() * sum, a = 0, last = 0;
  for (let t = 0; t < odds.length; t++) { if (odds[t] > 0) last = t; a += odds[t]; if (r < a) return t; } return last;
}
function rollPiece(t) { const pool = t === DOOM_TIER ? DOOM_KEYS : BASE_KEYS; return pool.length ? { k: pool[rnd(pool.length)], t } : { k: BASE_KEYS[rnd(BASE_KEYS.length)], t: MERGE_TOP }; }
function buyChest() { // returns the pieces found, or null if it can't be afforded
  const lv = chestLevel(), price = chestPrice(lv); if (profile.gold < price) return null;
  profile.gold -= price; profile.chestBuys++; const out = [];
  for (let i = 0; i < CHEST.pieces; i++) { const { k, t } = rollPiece(rollTier(CHEST.odds[lv - 1])); addGear(k, t); out.push({ k, t }); }
  saveProfile(); return out;
}
function sellEquipped(sl) { const it = profile.eq[sl]; if (!it) return 0; const p = sellPrice(it.k, it.t); profile.eq[sl] = null; profile.gold += p; saveProfile(); return p; }
function sellGear(key, tier) { if (!EQUIP[key] || !takeGear(key, tier)) return false; profile.gold += sellPrice(key, tier); saveProfile(); return true; }

// ---------------- screens / toast ----------------
const SCREENS = ['scrName', 'scrMenu', 'scrSettings', 'scrDev', 'scrSave', 'scrMode', 'scrStage', 'scrMulti', 'scrLobby', 'scrChar', 'scrPets', 'scrShop', 'scrGear', 'scrFriends', 'scrOver'];
function show(id) {
  SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id));
  $('screens').classList.toggle('hidden', !id);
  if (id === 'scrMulti' || id === 'scrMenu') applyLock();
}
// Progress gates: these buttons do not exist until the player's best stage reaches the number (best stage N means "reached N-1").
const UNLOCK = { pets: 2, shop: 2, gear: 5 };
const unlocked = k => profile.best.stage >= UNLOCK[k];
function applyGates() {
  for (const [ids, k] of [[['btnPets', 'lbPets'], 'pets'], [['btnShop', 'lbShop'], 'shop'], [['btnGear', 'lbGear'], 'gear']]) for (const id of ids) $(id).classList.toggle('hidden', !unlocked(k));
  $('tabEquip').classList.toggle('hidden', !unlocked('gear'));
  if (!unlocked('gear')) shopTab = 'pets';
  $('shopTabs').classList.toggle('hidden', !unlocked('gear'));
  $('menuPpBox').classList.toggle('hidden', !unlocked('pets')); // no Pet Points anywhere until pets are unlocked
}
// A run you left or lost (guest side) can be rejoined for 5 minutes. Until you reconnect or leave it, nothing else in the menus is available,
// so a run can't be dodged to upgrade heroes and then rejoined.
function applyLock() {
  const l = !!lastGame();
  $('rejoinBox').classList.toggle('hidden', !l); $('multiMain').classList.toggle('hidden', l);
  for (const id of ['btnChar', 'btnPets', 'btnGear', 'btnFriends', 'btnShop', 'btnSettings']) $(id).disabled = l;
}
{ const lt = setInterval(() => { if (!$('scrMenu').classList.contains('hidden') || !$('scrMulti').classList.contains('hidden')) applyLock(); }, 2000); if (lt && lt.unref) lt.unref(); }
let toastTimer = 0, pauseOpen = false;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------------- networking (PeerJS / WebRTC: no game server needed) ----------------
// Room host = one peer registered under a room-code id. "Find Game" uses a few well-known
// "waiting slot" ids: the first player registers a slot and waits; the next player finds it,
// the waiter opens a fresh room and tells the newcomer its code.
const PJ_PREFIX = 'coopquest-v1-';
// Direct-only: STUN servers just help the two browsers find each other, and all game data then flows peer to peer (no relay, no data cost).
// The catch: if both networks block direct links (some mobile data / strict networks) the connection fails instead of being relayed.
// To allow a relay fallback again, list TURN servers in turn-config.js (they are used only if present).
// Fallback relay used only when turn-config.js has no servers of its own: the free public OpenRelay TURN service (metered.ca).
// WebRTC always tries a direct link first and only uses the relay when both networks block direct links (mobile data etc.).
// It is shared and rate-limited, so for reliable play put your own free metered.ca credentials in turn-config.js.
const PUBLIC_TURN = [
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];
const PJ_OPTS = { debug: 1, config: { iceServers: [
  { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' },
].concat(Array.isArray(globalThis.CODUNGE_ICE) && globalThis.CODUNGE_ICE.length ? globalThis.CODUNGE_ICE : PUBLIC_TURN) } };
// Errors after which a PeerJS peer is destroyed. Everything else (network blips, a friend's failed attempt) must NOT close the room.
const FATAL = new Set(['browser-incompatible', 'invalid-id', 'invalid-key', 'ssl-unavailable', 'unavailable-id']);
const FIND_SLOTS = 3;             // waiting slots per region pool
const FIND_DWELL_MS = 18000;      // how long a waiting player stays in one region pool before widening the search
const slotId = (pool, i) => PJ_PREFIX + 'q-' + pool + '-' + i;
// Region pools, nearest first. A browser can't know where it is on the map, but its time zone is a good stand-in for distance:
// same time zone -> same UTC offset -> same continent -> anywhere. Find Game starts in the nearest pool and only widens while nobody is found.
function findPools() {
  let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
  const clean = x => String(x).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
  const off = -new Date(2026, 0, 1).getTimezoneOffset() / 60, cont = tz.indexOf('/') > 0 ? tz.split('/')[0] : '';
  const all = [tz && { id: 'z' + clean(tz), label: 'near you' }, { id: 'o' + String(off).replace('-', 'm').replace('.', 'h'), label: 'in nearby time zones' }, cont && { id: 'c' + clean(cont), label: 'on your continent' }, { id: 'g', label: 'worldwide' }];
  const seen = new Set(); return all.filter(p => p && !seen.has(p.id) && seen.add(p.id));
}
const SLOT_CONNECT_MS = 20000; // a WebRTC link through a relay can take a while on mobile data; don't give up on it too early
const net = { id: 0, isHost: true, peer: null, pj: null, conn: null, token: 0, extra: [], findTimer: 0, lastMsg: 0, tok: '', roomCode: '', rc: null, helloT: 0, sub: false };
const AWAY_MS = 5000;        // host: a partner silent for this long counts as disconnected (their hero stands still and is safe)
const REJOIN_MS = 300000;    // how long a dropped player can come back (host keeps their slot) / how long a guest keeps retrying
const LAST_KEY = 'coopquest.last';
const newTok = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
const nowMs = () => performance.now();
function saveLast(ts) { if (net.isHost || !net.roomCode || !net.tok) return; try { localStorage.setItem(LAST_KEY, JSON.stringify({ code: net.roomCode, tok: net.tok, ts: ts || Date.now() })); } catch (e) {} }
function clearLast() { try { localStorage.removeItem(LAST_KEY); } catch (e) {} }
function lastGame() { try { const l = JSON.parse(localStorage.getItem(LAST_KEY)); if (l && /^[A-Z0-9]{5}$/.test(l.code) && l.tok && Date.now() - l.ts < REJOIN_MS - 5000) return l; } catch (e) {} return null; }
const linkBusy = c => { const dc = c && (c.dataChannel || c._dc); return !!(dc && dc.bufferedAmount > 24576); }; // send queue is backing up: skip a snapshot instead of lagging further
let lobby = { code: '', players: [], hostId: 0, auto: false, searching: false, note: '' };
const findNote = (tk, t) => { if (tk !== net.token || !lobby.auto || !lobby.searching) return; lobby.note = t; renderLobby(); };
let cdTimer = 0;
const safe = fn => { try { return fn(); } catch (e) { return undefined; } };
const mkCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 5; i++) c += A[rnd(A.length)]; return c; };

let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) {}
}
function keepBrokerLink(p, tk) { // re-attach a peer to the matchmaking service after it dropped (e.g. tab was backgrounded)
  const tryRe = n => {
    if (tk !== net.token || net.pj !== p || p.destroyed || !p.disconnected) return;
    safe(() => p.reconnect());
    if (n < 150) setTimeout(() => tryRe(n + 1), 2000); // keep trying for ~5 minutes
  };
  tryRe(0);
}
function reviveNet() { // called when the page returns to the foreground / network comes back
  const p = net.pj;
  if (!p) return;
  if (game) { if (net.isHost && p.disconnected && !p.destroyed) keepBrokerLink(p, net.token); return; }
  if (p.destroyed && net.revive && !net.conn) net.revive();
  else if (p.disconnected && !p.destroyed) keepBrokerLink(p, net.token);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (game) net.lastMsg = nowMs(); reviveNet(); if (net.pj || game) keepAwake(); } });
window.addEventListener('online', reviveNet);

function closeNet() {
  net.sub = false; net.token++; // invalidates every pending callback from the previous session
  net.revive = null; if (wakeLock) { safe(() => wakeLock.release()); wakeLock = null; }
  clearInterval(cdTimer); cdTimer = 0; clearTimeout(net.findTimer); clearInterval(net.helloT); net.helloT = 0;
  if (net.rc) { clearTimeout(net.rc.timer); net.rc = null; } hideReconn();
  const c = net.conn, p = net.pj, extra = net.extra;
  net.conn = null; net.pj = null; net.peer = null; net.extra = [];
  safe(() => c && c.close()); safe(() => p && p.destroy()); extra.forEach(x => safe(() => x.destroy()));
}
// Connection diagnostics (multiplayer): ping to the other player, and whether the WebRTC link is direct or goes through the TURN relay.
// Relayed traffic is what counts against the TURN data cap and adds latency, so the readout makes both visible.
net.rtt = 0; net.relayed = null; net.probeT = 0; net.statT = 0;
function netProbe(now) {
  const c = net.conn; if (!c || !c.open) return;
  if (net.pongT !== undefined) { relay({ k: 'pong', t: net.pongT }); net.pongT = undefined; }
  if (now - net.probeT > 2000) { net.probeT = now; relay({ k: 'ping', t: now }); }
  if (now - net.statT > 4000) {
    net.statT = now;
    const pc = c.peerConnection; if (!pc || !pc.getStats) return;
    safe(() => pc.getStats().then(rep => {
      let pair = null; const cands = {};
      rep.forEach(r => { if (r.type === 'local-candidate' || r.type === 'remote-candidate') cands[r.id] = r; });
      rep.forEach(r => { if (r.type === 'candidate-pair' && (r.selected || (r.nominated && r.state === 'succeeded'))) pair = pair && !r.selected ? pair : r; });
      if (!pair) return;
      const l = cands[pair.localCandidateId], m = cands[pair.remoteCandidateId];
      net.relayed = !!((l && l.candidateType === 'relay') || (m && m.candidateType === 'relay'));
    }).catch(() => {}));
  }
}
let fpsAvg = 60;
function netText() { return Math.round(fpsAvg) + ' fps · ' + (net.rtt ? Math.round(net.rtt) + ' ms' : '… ms') + (net.relayed === null ? '' : net.relayed ? ' · relay' : ' · direct'); }
function relay(d) { const c = net.conn; if (c && c.open) safe(() => c.send(d)); }
function peerMsg(err) {
  const t = err && err.type;
  if (t === 'peer-unavailable') return 'Room not found. Check the code, and ask the host to keep the game open in the foreground.';
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
function myProfileMsg() { const s = statsFor(profile.sel), g = gearBonus(profile.eq), ps = profile.pet ? petStatsFor(profile.pet) : { atk: 0, hp: 0 }; return { name: profile.name, char: profile.sel, atk: s.atk, hp: s.hp, pet: profile.pet, patk: ps.atk, php: ps.hp, dr: g.dr, spd: g.spd, vamp: g.vamp, best: profile.best.stage, ver: GAME_VERSION, tok: net.tok, ed: net.sub ? 1 : 0 }; }

function ensureHello() { // guest: until the game has arrived, keep asking the host to (re)send it
  if (net.isHost || net.helloT) return;
  net.helloT = setInterval(() => { if (!net.isHost && (!game || !game.grid) && net.conn && net.conn.open && !net.rc) relay({ k: 'hello' }); }, 2000);
}
function attachConn(conn, tk) {
  net.conn = conn;
  conn.on('open', () => { if (tk === net.token && net.conn === conn) onLinkOpen(); });
  conn.on('data', d => { if (tk === net.token && net.conn === conn) onRelay(d); });
  ensureHello();
  const closed = () => { if (tk === net.token && net.conn === conn) onLinkClosed(); };
  conn.on('close', closed); conn.on('error', closed);
  if (conn.open) onLinkOpen();
}
function onLinkOpen() { relay({ k: 'prof', p: myProfileMsg() }); refreshLobby(); }
function onLinkClosed() {
  net.conn = null; clearInterval(cdTimer); cdTimer = 0;
  if (game) {
    if (game.isHost) { toast('Your friend disconnected — they can rejoin for 5 minutes'); } // the update loop marks them "away" and waits
    else startReconnect('Connection to the host was lost');
    return;
  }
  net.peer = null;
  if (net.isHost && !lobby.auto) refreshLobby(); // room stays open for another friend
  else netFail(net.isHost ? 'Your partner left.' : 'The host left the room.');
}

function hostAccept(p, c, tk) {
  if (tk !== net.token || net.pj !== p) return safe(() => c.close());
  if (game && game.isHost && game.multi) { // a dropped partner coming back (or a stranger, who is turned away)
    const refuse = () => { safe(() => c.send({ k: 'full' })); setTimeout(() => safe(() => c.close()), 300); };
    c.on('data', d => {
      if (!d || d.k !== 'rejoin' || c._done) return;
      c._done = true;
      if (!game || !game.guestTok || d.tok !== game.guestTok) return refuse();
      const old = net.conn; attachConn(c, tk); if (old && old !== c) safe(() => old.close());
      resyncGuest(true);
    });
    setTimeout(() => { if (!c._done) { c._done = true; safe(() => c.close()); } }, 15000);
    return;
  }
  if ((net.conn && net.conn.open) || game) { // room already has two players
    c.on('open', () => { safe(() => c.send({ k: 'full' })); setTimeout(() => safe(() => c.close()), 300); });
    return;
  }
  attachConn(c, tk);
}
function createRoom() {
  if (!needPeer()) return;
  closeNet(); keepAwake(); const tk = net.token; net.isHost = true; net.id = 0;
  $('multiStatus').textContent = 'Creating room…';
  let code = mkCode(), tries = 0, announced = false;
  const start = () => {
    if (tk !== net.token) return;
    const p = new Peer(PJ_PREFIX + code, PJ_OPTS); net.pj = p;
    let dead = false;
    const current = () => tk === net.token && net.pj === p;
    p.on('open', () => { if (!current()) return; announced = true; tries = 0; lobby = { code, players: [], hostId: 0, auto: false, searching: false }; refreshLobby(); });
    p.on('connection', c => hostAccept(p, c, tk));
    p.on('disconnected', () => { if (current()) keepBrokerLink(p, tk); });
    p.on('error', err => {
      if (!current()) return;
      if (!FATAL.has(err.type)) { if (p.disconnected) keepBrokerLink(p, tk); return; } // keep the room alive through blips
      dead = true; safe(() => p.destroy());
      if (err.type === 'unavailable-id') {
        if (announced && tries < 8) { tries++; setTimeout(start, 2000); }      // our own stale registration: wait for it to expire
        else if (!announced && tries < 4) { tries++; code = mkCode(); start(); } // someone else's code: pick another
        else netFail(peerMsg(err));
      } else netFail(peerMsg(err));
    });
    p.on('close', () => { // peer destroyed by the browser/broker: bring the same room code back
      if (dead || !current() || !announced) return;
      if (game) { reopenRoom(tk, code, 0); return; } // mid-game: bring the room code back so a dropped friend can rejoin
      if (net.conn) return;
      if (tries < 200) { tries++; setTimeout(() => { if (tk === net.token && !net.conn && !game) start(); }, 1500); } // waiting room stays registered for ~5 minutes of outages
    });
  };
  net.revive = () => { tries = 0; start(); };
  start();
}
function reopenRoom(tk, code, tries) { // host peer died during a game: register the same room code again
  if (tk !== net.token || !game) return;
  const p = new Peer(PJ_PREFIX + code, PJ_OPTS); net.pj = p;
  const cur = () => tk === net.token && net.pj === p;
  p.on('connection', c => hostAccept(p, c, tk));
  p.on('disconnected', () => { if (cur()) keepBrokerLink(p, tk); });
  p.on('error', err => { if (!cur()) return; if (err.type === 'unavailable-id' && tries < 10) { safe(() => p.destroy()); setTimeout(() => reopenRoom(tk, code, tries + 1), 2000); } });
  p.on('close', () => { if (cur() && tries < 10) setTimeout(() => reopenRoom(tk, code, tries + 1), 1500); });
}
function connectRoom(p, code, tk, auto) {
  const conn = p.connect(PJ_PREFIX + code, { reliable: true, serialization: 'json' });
  net.isHost = false; net.id = 1; net.roomCode = code; if (!net.tok) net.tok = newTok();
  lobby = { code, players: [], hostId: 0, auto, searching: false, connecting: true };
  $('multiStatus').textContent = 'Connecting to the host…';
  if (auto) renderLobby();
  attachConn(conn, tk);
  setTimeout(() => { if (tk === net.token && net.conn === conn && !conn.open && auto) { findGame(); return; } // matched room unreachable: just look for another match
    if (tk === net.token && net.conn === conn && !conn.open) netFail('Found the room but could not open a connection to the host (a network is blocking it, or the relay is busy). Try again, put both players on the same kind of network (e.g. both on Wi-Fi), or add a TURN relay in turn-config.js.'); }, 20000);
}
function joinRoom(code) {
  if (!needPeer()) return;
  closeNet(); keepAwake(); const tk = net.token;
  $('multiStatus').textContent = 'Contacting the matchmaking service…';
  const p = new Peer(PJ_OPTS); net.pj = p;
  p.on('open', () => { if (tk === net.token && net.pj === p) connectRoom(p, code, tk, false); });
  p.on('error', err => {
    if (tk !== net.token || net.pj !== p) return;
    if (game || net.rc) { rcError(err); return; }
    if (net.conn && net.conn.open) return; // already linked: ignore stray errors
    netFail(peerMsg(err));
  });
}

// ----- reconnecting after a drop -----
function showReconn(txt) { const el = $('reconn'); if (!el) return; $('reconnTxt').textContent = txt; el.classList.remove('hidden'); }
function hideReconn() { const el = $('reconn'); if (el) el.classList.add('hidden'); }
function startReconnect(reason) {
  if (net.rc || net.isHost) return;
  net.rc = { t0: nowMs(), tries: 0, gone: 0, timer: 0, reason };
  rcAttempt();
}
function rcAttempt() {
  const rc = net.rc; if (!rc) return;
  clearTimeout(rc.timer);
  if (nowMs() - rc.t0 > REJOIN_MS) return giveUp('Could not reconnect to the host.');
  rc.tries++;
  const old = net.conn; net.conn = null; safe(() => old && old.close());
  if (game) showReconn(`${rc.reason}. Trying to reach the host again (attempt ${rc.tries})…`); else $('multiStatus').textContent = `Rejoining your game (try ${rc.tries})…`;
  const go = p => {
    if (net.rc !== rc) return;
    const conn = p.connect(PJ_PREFIX + net.roomCode, { reliable: true, serialization: 'json' });
    net.conn = conn;
    conn.on('open', () => { if (net.rc === rc && net.conn === conn) safe(() => conn.send({ k: 'rejoin', tok: net.tok })); });
    conn.on('data', d => { if (net.conn === conn) onRelay(d); });
    const closed = () => { if (net.conn === conn) net.conn = null; };
    conn.on('close', closed); conn.on('error', closed);
  };
  let p = net.pj;
  if (!p || p.destroyed || p.disconnected) {
    safe(() => p && p.destroy());
    p = new Peer(PJ_OPTS); net.pj = p;
    p.on('open', () => { if (net.rc === rc && net.pj === p) go(p); });
    p.on('error', err => { if (net.pj === p) rcError(err); });
  } else go(p);
  rc.timer = setTimeout(rcAttempt, 6000);
}
function rcError(err) { // a reconnect attempt failed; a vanished room means the host is gone for good
  const rc = net.rc; if (!rc) return;
  if (err && err.type === 'peer-unavailable' && ++rc.gone >= 4) giveUp('The host ended the game.');
}
function giveUp(msg) {
  if (net.rc) { clearTimeout(net.rc.timer); net.rc = null; }
  hideReconn(); clearLast();
  if (game) { toast(msg); leaveGame(); } else netFail(msg);
}
function endReconnect() { if (net.rc) { clearTimeout(net.rc.timer); net.rc = null; } hideReconn(); net.lastMsg = nowMs(); toast('Reconnected!'); }
function rejoinLast() { // menu button: come back to a run you left (or lost) a moment ago
  const l = lastGame(); if (!l || !needPeer()) { updateMenu(); return; }
  closeNet(); keepAwake(); net.isHost = false; net.id = 1; net.roomCode = l.code; net.tok = l.tok;
  $('multiStatus').textContent = 'Rejoining your game…'; show('scrMulti');
  net.rc = { t0: nowMs(), tries: 0, gone: 0, timer: 0, reason: 'Rejoining' };
  rcAttempt();
}

// ----- Find Game -----
function findGame() {
  if (!needPeer()) return;
  closeNet(); const tk = net.token;
  lobby = { code: '', players: [], hostId: 0, auto: true, searching: true, note: 'Connecting to the matchmaking service…' };
  net.find = { pools: findPools(), level: 0 };
  show('scrLobby'); renderLobby();
  runFind(tk);
}
function findLabel() { const f = net.find; return f ? f.pools[f.level].label : ''; }
function runFind(tk) { // one search round at the current level: look for waiting players in the nearer pools first, then wait (or join) in this level's pool
  if (tk !== net.token || !net.find) return;
  const f = net.find, here = f.pools[f.level], near = [];
  for (const pl of f.pools.slice(0, f.level)) for (let i = 0; i < FIND_SLOTS; i++) near.push([pl.id, i]);
  findNote(tk, `Searching ${here.label}…`);
  const probe = k => { if (tk !== net.token) return; if (k >= near.length) return scanSlot(tk, here.id, 0, 0); joinSlot(tk, near[k][0], near[k][1], 0, () => probe(k + 1), true); };
  probe(0);
}
function widenFind(tk) { // nobody here: look a little further away (and loop back to the nearest pool after the widest)
  const f = net.find; if (!f || tk !== net.token) return;
  f.level = (f.level + 1) % f.pools.length; runFind(tk);
}
function scanSlot(tk, pool, i, n) { // claim the first free waiting slot of this pool; an occupied slot means somebody is waiting there, so join them instead
  if (tk !== net.token) return;
  if (i >= FIND_SLOTS) { findNote(tk, `Searching ${findLabel()}…`); net.findTimer = setTimeout(() => scanSlot(tk, pool, 0, 0), 2500 + rnd(2000)); return; }
  const p = new Peer(slotId(pool, i), PJ_OPTS); net.pj = p;
  let settled = false;
  p.on('open', () => { if (tk !== net.token || net.pj !== p) return; settled = true; waitForPartner(tk, p, i); });
  p.on('error', err => {
    if (tk !== net.token || net.pj !== p || settled) return;
    if (err.type === 'unavailable-id') { safe(() => p.destroy()); joinSlot(tk, pool, i, n, same => scanSlot(tk, pool, same && n < 2 ? i : i + 1, same ? n + 1 : 0), false); } else netFail(peerMsg(err));
  });
}
function waitForPartner(tk, p, slot) {
  let matched = false, pending = false, pendT = 0;
  findNote(tk, `Waiting for a player ${findLabel()}…`);
  p.on('connection', c => {
    if (tk !== net.token || net.pj !== p) return safe(() => c.close());
    pending = true; clearTimeout(pendT); pendT = setTimeout(() => { pending = false; }, SLOT_CONNECT_MS + 3000); // someone is connecting: don't tear this slot down
    findNote(tk, 'Another player found — connecting…');
    c.on('open', () => {
      if (matched || tk !== net.token) { safe(() => c.send({ k: 'busy' })); setTimeout(() => safe(() => c.close()), 300); return; }
      matched = true; clearTimeout(pendT); makeMatchRoom(tk, p, c, 0);
    });
  });
  p.on('disconnected', () => { if (tk === net.token && net.pj === p && !matched) safe(() => p.reconnect()); });
  p.on('close', () => { if (tk === net.token && net.pj === p && !matched) runFind(tk); }); // lost the slot unexpectedly: start this round over
  // Wait here for a while; if nobody comes, widen the search to the next region pool (never while somebody is mid-connection).
  const dwell = () => { if (tk !== net.token || net.pj !== p || matched) return;
    if (pending) { net.findTimer = setTimeout(dwell, 3000); return; }
    safe(() => p.destroy()); widenFind(tk); };
  net.findTimer = setTimeout(dwell, FIND_DWELL_MS + rnd(6000));
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
  rp.on('disconnected', () => { if (tk === net.token && net.pj === rp) keepBrokerLink(rp, tk); });
  rp.on('close', () => { if (tk === net.token && net.pj === rp && game) reopenRoom(tk, code, 0); }); // mid-game: keep the room code alive for a rejoin
  rp.on('error', err => {
    if (tk !== net.token || net.pj !== rp) return;
    if (!FATAL.has(err.type)) return;
    if (err.type === 'unavailable-id' && n < 3) { safe(() => rp.destroy()); makeMatchRoom(tk, sp, c, n + 1); } else netFail(peerMsg(err));
  });
}
function joinSlot(tk, pool, i, n, cont, probe) { // connect to whoever waits in this slot; cont(sameSlot) is called when it did not work out
  const p = new Peer(PJ_OPTS); net.pj = p;
  let done = false;
  findNote(tk, `Looking for a waiting player ${probe ? 'nearby' : findLabel()}…`);
  const next = same => { if (done) return; done = true; safe(() => p.destroy()); if (tk === net.token) cont(same); };
  p.on('open', () => {
    if (tk !== net.token || net.pj !== p) return;
    const c = p.connect(slotId(pool, i), { reliable: true, serialization: 'json' });
    const to = setTimeout(() => { safe(() => c.close()); next(false); }, SLOT_CONNECT_MS);
    c.on('open', () => findNote(tk, 'Connected — setting up the match…'));
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
    if (err.type === 'peer-unavailable') next(!probe); else netFail(peerMsg(err));   // probing an empty slot is normal: just move on
  });
}

// ----- lobby -----
function refreshLobby() {
  if (game) return;
  const linked = !!(net.conn && net.conn.open);
  const me = { id: net.id, name: profile.name }, other = { id: 1 - net.id, name: net.peer ? net.peer.name : '…' };
  const list = [];
  if (net.isHost) { list.push(me); if (linked) list.push(other); } else { if (linked) list.push(other); list.push(me); }
  const before = (lobby.players || []).length;
  lobby.players = list; lobby.hostId = 0; if (linked) lobby.connecting = false;
  if (list.length < 2) { clearInterval(cdTimer); cdTimer = 0; }
  if (net.sub) { renderLobby(); if (before < 2 && list.length === 2) toast(other.name + ' joined the room'); return; } // browsing Characters / Pets / Equipment / Shop from the lobby: stay there
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
  applyGates();
  const showCode = !!lobby.code && !lobby.auto;
  $('lobbyCodeBox').classList.toggle('hidden', !showCode);
  $('lobbyCode').textContent = lobby.code || '-----';
  $('lobbyTitle').textContent = lobby.auto ? 'Find Game' : 'Game Room';
  $('btnInvite').classList.toggle('hidden', !net.isHost);
  const ul = $('lobbyPlayers'); ul.innerHTML = '';
  (lobby.players || []).forEach(p => {
    const me = p.id === net.id;
    const ch = me ? CHARS[profile.sel].name : (net.peer ? CHARS[net.peer.char].name : '…');
    const li = document.createElement('li');
    li.textContent = `${p.name}${me ? ' (you)' : ''}${p.id === lobby.hostId ? ' ★' : ''} — ${ch}${!me && net.peer && net.peer.ed ? ' · customizing…' : ''}`;
    ul.appendChild(li);
  });
  const n = (lobby.players || []).length;
  let st = '';
  if (lobby.connecting && !lobby.players.some(p => p.id !== net.id)) st = 'Match found — connecting to the host…';
  else if (lobby.searching) st = 'Searching for other players…' + (lobby.note ? '\n' + lobby.note : '');
  else if (n < 2) st = lobby.auto ? 'Waiting for the other player…' : 'Waiting for your friend to join…';
  else if (lobby.auto) st = 'Match found! Starting soon…';
  else if (net.peer && net.peer.ed) st = `${net.peer.name} is customizing their hero — Start unlocks when they are back.`;
  else st = net.isHost ? 'Ready — press Start!' : 'Waiting for the host to start…';
  if (n === 2 && net.peer && net.peer.ver && net.peer.ver !== GAME_VERSION) st += `\n⚠ Different game versions (you: ${GAME_VERSION}, partner: ${net.peer.ver}). Refresh the page (clear cache) on the older one.`;
  if (!cdTimer) $('lobbyStatus').textContent = st;
  $('btnLobbyStart').classList.toggle('hidden', !(net.isHost && !lobby.auto && n === 2));
  $('btnLobbyStart').disabled = !net.peer || !!net.peer.ed;
  $('lobbyTools').classList.toggle('hidden', !!lobby.auto);
}
function onRelay(d) {
  if (!d) return;
  net.lastMsg = nowMs();
  switch (d.k) {
    case 'full': netFail('That room is full.'); break;
    case 'prof': {
      const p = d.p || {};
      if (!CHARS[p.char]) return;
      net.peer = { name: (nm => isBadName(nm) ? 'Player' : nm)(String(p.name || 'Friend').slice(0, 12)), char: p.char, atk: clamp(+p.atk || 1, 1, 9999), hp: clamp(+p.hp || 1, 1, 99999),
        tok: String(p.tok || '').slice(0, 20), pet: PETS[p.pet] ? p.pet : '', patk: clamp(+p.patk || 0, 0, 9999), php: clamp(+p.php || 0, 0, 99999), dr: clamp(+p.dr || 0, 0, 0.5), spd: clamp(+p.spd || 0, 0, 0.5), vamp: clamp(+p.vamp || 0, 0, 1), best: clamp(+p.best || 1, 1, 999), ver: String(p.ver || '?').slice(0, 24) };
      net.peer.ed = !!p.ed;
      if (!game) refreshLobby();
      break;
    }
    case 'start':
      if (!game && !net.isHost) { clearInterval(cdTimer); cdTimer = 0; startGuest(d.pid); }
      if (net.rc && !net.isHost) endReconnect();
      break;
    case 'lvl':
      if (!game && !net.isHost && net.conn) startGuest(1); // the 'start' message was lost: the level itself is proof the match is on
      if (game && !game.isHost) { applyLevel(game, d); if (net.rc) endReconnect(); }
      break;
    case 's':
      if (!game && !net.isHost && net.conn) startGuest(1);
      if (game && !game.isHost && game.grid) { // only the newest snapshot is applied each frame; effects from skipped ones are kept
        if (game.pendSnap) d.f = (game.pendSnap.f || []).concat(d.f || []).slice(-40);
        game.pendSnap = d;
      }
      break;
    case 'hello': if (game && game.isHost && game.multi) resyncGuest(false); break;
    case 'ping': net.pongT = d.t; break;   // answered from the frame loop (netProbe), so a frozen game loop still counts as silent
    case 'pong': { const r = nowMs() - (+d.t || 0); if (r >= 0 && r < 20000) net.rtt = net.rtt ? net.rtt * 0.7 + r * 0.3 : r; break; }
    case 'bye': if (game && !game.isHost) { clearLast(); if (net.rc) { clearTimeout(net.rc.timer); net.rc = null; } hideReconn(); toast('The host ended the game'); leaveGame(); } break;
    case 'in': if (game && game.isHost) {
      const i = game.inputs[1] || (game.inputs[1] = { mx: 0, my: 0, atk: false, sp: false });
      i.mx = clamp(+d.mx || 0, -1, 1); i.my = clamp(+d.my || 0, -1, 1); i.atk = !!d.atk; if (d.sp) i.sp = true; if (d.rev) i.rev = true;
    } break;
    case 'over': if (game && !game.isHost) { game.stage = d.stage; game.level = d.level; if (d.cp > game.teamCp) game.teamCp = d.cp; if (d.gold > game.teamGold) game.teamGold = d.gold; if (d.pp > game.teamPp) game.teamPp = d.pp; if (Array.isArray(d.lt) && Array.isArray(d.lt[game.pid]) && d.lt[game.pid].length > game.lootBy[game.pid].length) game.lootBy[game.pid] = d.lt[game.pid].filter(k => EQUIP[k]); creditCp(game); game.over = true; showOver(game); } break;
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
function genLandscape(stage, level) {
  const boss = level === levelsIn(stage), hell = isHell(stage), eff = hell ? level * 2 : level; // 5 Hell levels count as 10 for difficulty
  let last = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const g = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) row.push((r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) ? 1 : 0);
      g.push(row);
    }
    const nb = attempt >= 55 ? 0 : Math.round((boss ? 5 : 7 + Math.floor(eff * 0.9) + Math.min(stage, 4)) * (hell ? 2.4 : 1));
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

function genLevel(stage, level, portrait) {
  const big = isHell(stage);
  setDims(false, big);
  const L = genLandscape(stage, level);
  if (!portrait) return L;
  const GC = COLS; // rotate a quarter turn: left (start) -> bottom, right -> top
  const g = [];
  for (let r = 0; r < GC; r++) g.push(new Array(ROWS).fill(0));
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < GC; c++) g[GC - 1 - c][r] = L.grid[r][c];
  const d = L.door;
  const out = { grid: g, door: { c: d.r, r: GC - 1 - d.c, ic: d.ir, ir: GC - 1 - d.ic }, cells: L.cells.map(([c, r]) => [r, GC - 1 - c]) };
  setDims(true, big);
  return out;
}

// ---------------- game state ----------------
let game = null;
const ctl = { sp: false, rev: false };

function makePlayer(d, id) {
  return { id, name: d.name, char: d.char, atk: d.atk, maxhp: d.hp, hp: d.hp, x: 0, y: 0, r: 10, face: 0, alive: true,
    atkCd: 0, spCd: 0, cp: 0, speed: CHARS[d.char].speed * (1 + (+d.spd || 0)), hurt: 0, gone: false, pet: PETS[d.pet] ? d.pet : '', shield: 0, shieldT: 0, still: 0,
    patk: +d.patk || 0, php: +d.php || 0, dr: +d.dr || 0, vamp: +d.vamp || 0 };
}
function newGameBase(isHost, pid, multi) {
  return { isHost, pid, multi, stage: 1, level: 1, grid: null, door: null, players: [], enemies: [], proj: [], pickups: [], fx: [], fxq: [],
    inputs: {}, fields: {}, fieldT: 0, nid: 1, acc: 0, snapT: 0, sendT: 0, time: 0, over: false, seenCp: 0, teamCp: 0, seenGold: 0, teamGold: 0, seenPp: 0, teamPp: 0, lootBy: [[], []], seenLoot: 0, kills: 0, bossKills: 0, runT: 0, pets: [], bossRoom: false, banner: null, hz: [] };
}
// Where a new run begins. Solo: one stage below your best (never below 1). Co-op: the lowest best stage of the two players.
function startStage(multi, otherBest) {
  const mine = Math.max(1, profile.best.stage | 0);
  if (!multi) return Math.max(1, mine - 1);
  const other = Math.max(1, otherBest | 0 || mine);
  return mine === other ? Math.max(1, mine - 1) : Math.min(mine, other); // same best stage: start one stage back; otherwise the lower of the two
}
function soloStages() { // stages a solo run may start at: up to 5 stages below your best (never the best itself, never below 1)
  const b = Math.max(1, profile.best.stage | 0), lo = Math.max(1, b - 5), hi = Math.max(1, b - 1), out = [];
  for (let s = lo; s <= hi; s++) out.push(s);
  return out;
}
function startSingle(stage) {
  const s = statsFor(profile.sel);
  const g = newGameBase(true, 0, false);
  g.players = [makePlayer(myProfileMsg(), 0)];
  g.stage = soloStages().includes(stage) ? stage : startStage(false); // solo: the stage the player picked
  game = g; enterGameUI(); loadLevel(g, true);
}
function hostStart() {
  if (!net.peer || game || net.peer.ed) return;
  relay({ k: 'start', pid: 1 });
  const g = newGameBase(true, 0, true); g.guestTok = net.peer.tok || ''; net.lastMsg = nowMs();
  g.players = [makePlayer(myProfileMsg(), 0), makePlayer(net.peer, 1)];
  g.stage = startStage(true, net.peer.best); // co-op: the lower of the two players' best stages
  game = g; enterGameUI(); loadLevel(g, true);
}
function startGuest(pid) {
  game = newGameBase(false, pid, true);
  net.lastMsg = nowMs(); saveLast(); ensureHello();
  enterGameUI();
}
function enterGameUI() {
  net.sub = false;
  show(null);
  $('controls').classList.remove('hidden'); $('btnQuit').classList.remove('hidden');
  document.body.classList.add('playing');
  ctl.sp = false;
}
function leaveGame() {
  const g = game;
  if (g && g.multi && !g.over) { // the host ending the run ends it for the partner; a guest leaving can rejoin from the menu for 2 minutes
    if (g.isHost) relay({ k: 'bye' }); else saveLast();
  }
  game = null; closePause();
  ctl.sp = false; ui.atk = false; joy.active = false; joy.id = null;
  $('controls').classList.add('hidden'); $('btnQuit').classList.add('hidden');
  document.body.classList.remove('playing');
  closeNet();
  updateMenu(); show(lastGame() ? 'scrMulti' : 'scrMenu'); // a guest who left a live run lands on the reconnect-or-leave screen
}

function bannerText(stage, level) { return `Stage ${stage}-${level}` + (level === levelsIn(stage) ? (isHell(stage) ? ' — DOOM BOSS' : ' — BOSS') : isHell(stage) ? ' — DOOM' : ''); }
function loadLevel(g, first) {
  const oldPets = new Map((g.pets || []).map(q => [q.owner, q]));   // pets come along with the health they had; a KO'd one keeps counting down
  if (!first && g.pickups) for (const k of g.pickups) { if (k.kind === 'cp') g.teamCp++; else if (k.kind === 'pp') g.teamPp++; } // points left on the ground are collected automatically
  const L = genLevel(g.stage, g.level, innerHeight > innerWidth);
  g.grid = L.grid; g.door = { c: L.door.c, r: L.door.r, ic: L.door.ic, ir: L.door.ir, open: false };
  g.enemies = []; g.proj = []; g.pickups = []; g.fields = {}; g.fieldT = 0; g.pets = []; g.cam = null;
  g.bossRoom = g.level === levelsIn(g.stage); g.hz = [];
  g.players.forEach((p, i) => {
    if (p.gone) return;
    const sp = spawnXY(i); p.x = sp.x; p.y = sp.y; p.atkCd = 0; p.shield = 0; p.shieldT = 0; p.still = 0; p.revTarget = null; p.revT = 0; p.revP = 0;
    if (!first) {
      if (!p.alive) { p.alive = true; p.hp = Math.ceil(p.maxhp * 0.5); }
    }
    const inp = g.inputs[p.id]; if (inp) inp.sp = false;
  });
  spawnEnemies(g, L);
  g.players.forEach(p => {
    if (p.gone || !p.pet) return;
    const q = makePet(g, p), o = oldPets.get(p.id);   // the pet appears at its owner's side
    if (!first && o && o.type === p.pet) {
      q.abCd = o.abCd || 0;
      if (o.alive) q.hp = Math.min(q.maxhp, Math.max(1, o.hp));
      else { q.alive = false; q.hp = 0; q.respT = Math.max(0.1, o.respT || 0); }   // still KO'd: the countdown carries on and shows beside its body
    }
    g.pets.push(q);
  });
  g.banner = { text: bannerText(g.stage, g.level), t: 0 };
  noteProgress(g);
  if (g.multi) relay(lvlMsg(g));
}
function lvlMsg(g) {
  return { k: 'lvl', stage: g.stage, level: g.level, grid: g.grid.map(r => r.join('')),
    door: { c: g.door.c, r: g.door.r, ic: g.door.ic, ir: g.door.ir },
    players: g.players.map(p => ({ id: p.id, name: p.name, char: p.char, atk: p.atk, maxhp: p.maxhp, hp: p.hp, alive: p.alive, gone: p.gone, cp: p.cp, x: p.x, y: p.y, speed: p.speed })) };
}
function resyncGuest(rejoined) { // host: (re)send the whole game state to the partner
  const g = game; if (!g || !g.isHost || !g.multi || !g.grid) return;
  net.lastMsg = nowMs();
  relay({ k: 'start', pid: 1, re: rejoined ? 1 : 0 });
  relay(lvlMsg(g));
  const gp = g.players[1]; if (gp && !gp.gone && gp.away) { gp.away = false; toast('Your friend is back!'); }
}
// Difficulty per stage: HP and ATK of every enemy x (1 + 0.20 per stage + 0.01 x stage^2, counting from stage 1); bosses also start with BOSS_HP_MULT x their base HP
const STAGE_LIN = 0.2, STAGE_QUAD = 0.01, BOSS_HP_MULT = 3;
const stageMult = stage => 1 + STAGE_LIN * (stage - 1) + STAGE_QUAD * (stage - 1) * (stage - 1);
function makeEnemy(g, type, x, y, summoned) {
  const def = ENEMIES[type], m = stageMult(g.stage), hp = Math.ceil(def.hp * (def.boss ? BOSS_HP_MULT : 1) * m - 1e-9);
  return { id: g.nid++, type, x, y, r: def.r, hp, maxhp: hp, atk: def.atk * m,
    speed: def.speed * (def.boss ? 1 : 0.9 + Math.random() * 0.2), cd: 0.6 + Math.random() * 0.6, hurt: 0, face: Math.random() * Math.PI * 2, dead: false,
    alert: 0, home: { x, y }, wp: null, wt: 0, pause: Math.random() * 2,
    sm: type === 'troll' ? 4 : type === 'skeleton_king' ? KING.summon.first : type === 'cerberus' ? CERB.fire.first : 0, s2: type === 'skeleton_king' ? KING.dash.first : type === 'cerberus' ? CERB.jump.first : type === 'assassin' ? TP.first : 0, fbQ: 0, fbT: 0, shield: 0, lock: false, hadLock: false,
    ch: 0, cht: 0, sk: '', fear: 0, dashT: 0, summoned: !!summoned };
}
const DOOM = { sorcShare: 0.4, hellShare: 0.25, bossAdds: 10, bossSorcShare: 0.6 }; // Doom rooms: shares of sorcerers / hellguards (rest voidlings); boss room: bossAdds escorts, 60% sorcerers + 40% hellguards
const ASSASSIN_SPAWN = { from: 6, base: 0.05, perLevel: 0.01, perStage: 0.01, cap: 0.15 };
function spawnEnemies(g, L) {
  const list = [], hell = isHell(g.stage), K = hell ? 2 : 1;      // Hell stages hold twice as many enemies
  const eff = hell ? g.level * 2 : g.level;                       // 5 Hell levels count as 10 for difficulty
  if (hell) { // Doom stages: nothing but sorcerers, hellguards and voidlings (the boss room: sorcerers and hellguards only)
    if (g.level === levelsIn(g.stage)) {
      list.push(bossFor(g.stage));
      const nS = Math.round(DOOM.bossAdds * DOOM.bossSorcShare);
      for (let i = 0; i < DOOM.bossAdds; i++) list.push(i < nS ? 'sorcerer' : 'hellguard');
    } else { const n = K * Math.min(20, 2 + eff + (g.stage - 1) * 2); for (let i = 0; i < n; i++) { const r = Math.random(); list.push(r < DOOM.sorcShare ? 'sorcerer' : r < DOOM.sorcShare + DOOM.hellShare ? 'hellguard' : 'voidling'); } }
  } else if (g.level === levelsIn(g.stage)) {
    const boss = bossFor(g.stage); list.push(boss);
    if (boss === 'troll') {
      for (let i = 0; i < Math.min(6, 1 + g.stage) * K; i++) list.push('rat');
      if (g.stage >= 2) for (let i = 0; i < Math.min(3, g.stage - 1) * K; i++) list.push('skeleton');
    } else for (let i = 0; i < 2 * K; i++) list.push('rat');
    if (g.stage >= 3) for (let i = 0; i < Math.min(2, g.stage - 2) * K; i++) list.push('voidling');
    if (g.stage >= 5) for (let i = 0; i < Math.min(3, g.stage - 4) * K; i++) list.push('sorcerer');
  } else {
    const n = K * Math.min(20, 2 + eff + (g.stage - 1) * 2);
    const pg = Math.min(0.75, 0.05 + eff * 0.07 + (g.stage - 1) * 0.05);
    const pSk = g.stage >= 2 ? Math.min(0.35, 0.12 + eff * 0.02 + (g.stage - 2) * 0.03) : 0;   // skeleton archers appear from stage 2-1
    const pVd = g.stage >= 3 ? Math.min(0.2, 0.06 + eff * 0.01 + (g.stage - 3) * 0.02) : 0;     // voidlings from stage 3-1
    const pSo = g.stage >= 5 ? Math.min(0.2, 0.08 + eff * 0.01 + (g.stage - 5) * 0.015) : 0;    // sorcerers from stage 5-1
    const A = ASSASSIN_SPAWN, pAs = g.stage >= A.from ? Math.min(A.cap, A.base + eff * A.perLevel + (g.stage - A.from) * A.perStage) : 0; // assassins from stage 6-1
    for (let i = 0; i < n; i++) { const r = Math.random(); list.push(r < pSo ? 'sorcerer' : r < pSo + pAs ? 'assassin' : r < pSo + pAs + pVd ? 'voidling' : r < pSo + pAs + pVd + pSk ? 'skeleton' : Math.random() < pg ? 'goblin' : 'rat'); }
    const ensure = (type, count, fromEnd) => { let have = list.filter(t => t === type).length; for (let i = 0; have < count && i < list.length; i++) { const k = list.length - fromEnd - i; if (k >= 0 && list[k] !== type) { list[k] = type; have++; } } };
    if (g.stage >= 2) ensure('skeleton', 1, 1);
    if (g.stage >= 3) ensure('voidling', 1, 2);
    if (g.stage >= 5) ensure('sorcerer', K, 4);
  }
  const placed = [];
  const far = ([c, r]) => Math.hypot((c + 0.5) * TILE - SPAWN_POINT.x, (r + 0.5) * TILE - SPAWN_POINT.y);
  let pool = L.cells.filter(cell => far(cell) >= SPAWN_MIN_DIST);
  if (pool.length < list.length * 2) pool = L.cells.slice().sort((a, b) => far(b) - far(a)).slice(0, Math.max(list.length * 3, 40));
  for (const type of list) {
    let pos = null;
    for (let t = 0; t < 80 && !pos; t++) {
      const [c, r] = pool[rnd(pool.length)];
      const x = (c + 0.5) * TILE, y = (r + 0.5) * TILE;
      if (placed.every(q => Math.hypot(q.x - x, q.y - y) > 40)) pos = { x, y };
    }
    if (!pos) { const [c, r] = pool[rnd(pool.length)]; pos = { x: (c + 0.5) * TILE, y: (r + 0.5) * TILE }; }
    placed.push(pos);
    g.enemies.push(makeEnemy(g, type, pos.x, pos.y, false));
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
const BOSS_HIT = 1.7;                                                   // bosses are drawn 2x bigger: hit-tests use a larger body radius, walls still use the small one
const bodyR = e => (ENEMIES[e.type] && ENEMIES[e.type].boss ? e.r * BOSS_HIT : e.r);
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
const FX_LIFE = { slash: 0.22, spin: 0.45, chain: 0.3, ray: 0.35, txt: 0.9, poof: 0.35, heal: 0.55, door: 0.6, smash: 0.5, howl: 0.6, barrier: 0.5, laser: 0.22, cleave: 0.28, summon: 0.7, bash: 0.25, dust: 0.4 };
function pushFx(g, f) {
  if (f.type === 'cleave' || f.type === 'smash' || f.type === 'summon' || f.type === 'bash') { // tell the boss it just used a skill, so it can play the matching animation (host and guest)
    const bx = f.bx !== undefined ? f.bx : f.x, by = f.by !== undefined ? f.by : f.y, want = f.type === 'cleave' || f.type === 'summon' ? 'skeleton_king' : f.type === 'smash' ? 'troll' : null;
    for (const e of g.enemies) if (!e.dead && ENEMIES[e.type] && ENEMIES[e.type].boss && (!want || e.type === want) && Math.hypot(e.x - bx, e.y - by) < 8) { if (f.type === 'summon') e.suAt = performance.now(); else e.swAt = performance.now(); }
  }
  if (g.fx.length > 160) g.fx.splice(0, 40); g.fx.push(Object.assign({ t: 0, life: FX_LIFE[f.type] || 0.4 }, f)); }
function addFx(g, f) { pushFx(g, f); if (g.multi && g.isHost) g.fxq.push(f); }

// ---------------- simulation (host) ----------------
function nearestEnemy(g, x, y, maxd, skip) {
  let b = null, bd = maxd;
  for (const e of g.enemies) {
    if (e.dead || isAir(e) || (skip && skip.has(e))) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bd) { bd = d; b = e; }
  }
  return b;
}
function nearestPlayer(g, x, y) {
  let b = null, bd = 1e9;
  for (const p of g.players) {
    if (!p.alive || p.gone || p.away) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) { bd = d; b = p; }
  }
  return b;
}
function dropAt(g, x, y, kind) { g.pickups.push({ id: g.nid++, x: x + (Math.random() - 0.5) * 14, y: y + (Math.random() - 0.5) * 14, kind }); }
function noteFocus(g, src, e) { // an owner attacking something pulls their idle pet onto the same target
  if (!src || src.isPet) return;
  for (const q of g.pets) if (q.owner === src.id && q.alive && !q.combat && !(q.focusT > 0)) { q.focus = e; q.focusT = 3; }
}
function hitEnemy(g, e, dmg, src) {
  if (e.dead || isAir(e)) return;
  let d = Math.max(1, Math.round(dmg));
  if (e.shield > 0) { // Hellguard's target-lock barrier soaks damage first
    const ab = Math.min(e.shield, d); e.shield -= ab; d -= ab;
    addFx(g, { type: 'txt', x: e.x, y: e.y - e.r - 8, s: '🛡' + ab, c: '#ffab91' });
    if (d <= 0) { e.hurt = 0.12; noteFocus(g, src, e); return; }
  }
  e.hp -= d; e.hurt = 0.12;
  noteFocus(g, src, e);
  if (e.hp > 0) { if (e.alert <= 0) alertAllies(g, e, 3); e.alert = Math.max(e.alert, 6); } // getting shot wakes it up
  addFx(g, { type: 'txt', x: e.x, y: e.y - e.r - 8, s: String(d), c: '#ffffff' });
  if (e.hp <= 0) {
    e.dead = true;
    addFx(g, { type: 'poof', x: e.x, y: e.y });
    const def = ENEMIES[e.type];
    if (def.boss) g.bossKills++; else g.kills++;
    if (src && !src.isPet && src.vamp > 0 && src.alive) heal(g, src, Math.max(1, Math.round(src.vamp * src.maxhp))); // 'HP healed per kill %': a share of max HP
    if (!e.summoned) { // summoned minions pay nothing, so a boss can't be farmed
      const gd = goldFor(e.type, g.stage);
      if (gd > 0) { g.teamGold += gd; addFx(g, { type: 'txt', x: e.x, y: e.y - e.r - 20, s: '+' + gd, ic: 'gold', c: '#ffd54f' }); }
      if (def.boss) { // bosses: one point (Character OR Pet, never both) and one random piece of equipment
        const cp = Math.random() < 0.5;
        if (cp) g.teamCp++; else g.teamPp++;
        addFx(g, { type: 'txt', x: e.x, y: e.y - e.r - 34, s: cp ? '+1 CP' : '+1 PP', c: cp ? '#ffd600' : '#f48fb1' });
        for (const pl of g.players) if (!pl.gone) g.lootBy[pl.id].push(BASE_KEYS[rnd(BASE_KEYS.length)]); // each player rolls their own (regular, Common) piece
        addFx(g, { type: 'txt', x: e.x, y: e.y - e.r - 48, s: 'Loot!', ic: 'gear', c: '#ffd54f' });
      } else {
        // one roll per kill, so an enemy drops at most ONE item: Character Point, Pet Point (once pets are unlocked) or a potion
        const r = Math.random(); let kind = '';
        if (r < DROP_CHANCE) kind = 'cp';
        else if (r < DROP_CHANCE * 2) kind = unlocked('pets') ? 'pp' : '';
        else if (r < DROP_CHANCE * 2 + POTION.chance) kind = 'pot';
        if (kind) dropAt(g, e.x, e.y, kind);
      }
    }
    if (def.boss) for (const o of g.enemies) if (o.summoned && !o.dead) { o.dead = true; addFx(g, { type: 'poof', x: o.x, y: o.y }); } // the King's minions fall with him
  }
}
function heal(g, t, v) {
  const n = Math.max(0, Math.min(t.maxhp - t.hp, Math.round(v)));
  t.hp += n;
  addFx(g, { type: 'heal', x: t.x, y: t.y });
  if (n > 0) addFx(g, { type: 'txt', x: t.x, y: t.y - 18, s: '+' + n, c: '#69f0ae' });
}
const AUTO_ATTACK = true; // heroes attack on their own when an enemy is in reach (the attack button is hidden); false brings the button back
function autoTarget(g, p) { // is an enemy close enough that this hero should swing / shoot by itself?
  if (p.char === 'warrior') { for (const e of g.enemies) if (!e.dead && !isAir(e) && Math.hypot(e.x - p.x, e.y - p.y) <= 58 + bodyR(e) - 4) return true; return false; }
  const t = nearestEnemy(g, p.x, p.y, 300); return !!t && clearLine(g, p.x, p.y, t.x, t.y, 3);
}
function doAttack(g, p) {
  const t = nearestEnemy(g, p.x, p.y, p.char === 'warrior' ? 120 : 300);
  if (t) p.face = Math.atan2(t.y - p.y, t.x - p.x);
  if (p.char === 'warrior') {
    for (const e of g.enemies) {
      if (e.dead) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (d > 58 + bodyR(e)) continue;
      if (d < bodyR(e) + p.r + 6 || Math.abs(angDiff(Math.atan2(dy, dx), p.face)) <= 1.25) hitEnemy(g, e, p.atk, p);
    }
    addFx(g, { type: 'slash', x: p.x, y: p.y, a: p.face });
  } else {
    const sp = p.char === 'mage' ? 400 : 340;
    // spawn at the caster's center so point-blank enemies (or a wall behind the muzzle) can't swallow the shot
    g.proj.push({ id: g.nid++, x: p.x, y: p.y, vx: Math.cos(p.face) * sp, vy: Math.sin(p.face) * sp,
      dmg: p.atk, life: 0.9, kind: p.char, owner: p.id, dead: false });
  }
}
function doSpecial(g, p) {
  if (p.char === 'warrior') {
    for (const e of g.enemies) if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) <= 85 + bodyR(e)) hitEnemy(g, e, 1.5 * p.atk, p);
    addFx(g, { type: 'spin', x: p.x, y: p.y, r: 85 });
    return true;
  }
  if (p.char === 'mage') {
    const first = nearestEnemy(g, p.x, p.y, 320);
    if (!first) return false;
    const hit = new Set([first]);
    let dmg = 1.3 * p.atk, cur = first;
    const pts = [[p.x, p.y], [first.x, first.y]];
    hitEnemy(g, first, dmg, p);
    for (let b = 0; b < 3; b++) {
      const nx = nearestEnemy(g, cur.x, cur.y, 170, hit);
      if (!nx) break;
      dmg *= 0.8; hit.add(nx); pts.push([nx.x, nx.y]); hitEnemy(g, nx, dmg, p); cur = nx;
    }
    addFx(g, { type: 'chain', pts });
    return true;
  }
  // healer: everything in range is healed. Allies get the full amount, the healer and any pets get half.
  const amt = HEALER.maxPct * p.maxhp + HEALER.curPct * p.hp; // 20% of max HP + 10% of current HP
  const allies = g.players.filter(a => a !== p && a.alive && !a.gone && Math.hypot(a.x - p.x, a.y - p.y) <= HEAL_RANGE);
  const pets = g.pets.filter(q => q.alive && Math.hypot(q.x - p.x, q.y - p.y) <= HEAL_RANGE);
  for (const a of allies) { heal(g, a, amt); addFx(g, { type: 'ray', x1: p.x, y1: p.y, x2: a.x, y2: a.y }); }
  for (const q of pets) { heal(g, q, amt / 2); addFx(g, { type: 'ray', x1: p.x, y1: p.y, x2: q.x, y2: q.y }); }
  heal(g, p, allies.length ? amt / 2 : amt); // nobody else in range (or playing solo): the whole heal goes to the healer
  return true;
}
function smash(g, e) {
  const dmg = Math.max(1, Math.round(SMASH.mult * e.atk));
  for (const t of targetsOf(g)) if (Math.hypot(t.x - e.x, t.y - e.y) <= SMASH.r + t.r) hurtT(g, t, dmg);
  addFx(g, { type: 'smash', x: e.x, y: e.y, r: SMASH.r });
}
function cleave(g, e) { // Skeleton King's mace: a wide cone in front of him
  const dmg = Math.max(1, Math.round(e.atk));
  for (const t of targetsOf(g)) {
    const dx = t.x - e.x, dy = t.y - e.y;
    if (Math.hypot(dx, dy) <= KING.cleave.r + t.r && Math.abs(angDiff(Math.atan2(dy, dx), e.face)) <= KING.cleave.arc) hurtT(g, t, dmg);
  }
  addFx(g, { type: 'cleave', x: e.x, y: e.y, a: e.face, r: KING.cleave.r, arc: KING.cleave.arc });
}
function summonArchers(g, e) {
  let made = 0;
  for (let i = 0; i < 12 && made < KING.summon.n; i++) {
    const a = (made + Math.random() * 0.6) * (Math.PI * 2 / KING.summon.n) + Math.random() * 0.4, d = 40 + Math.random() * 30;
    const x = e.x + Math.cos(a) * d, y = e.y + Math.sin(a) * d;
    if (hitsWall(g, x, y, 10) || !clearLine(g, e.x, e.y, x, y, 8)) continue;
    const m = makeEnemy(g, 'skeleton', x, y, true); m.alert = 6; g.enemies.push(m); made++;
    addFx(g, { type: 'poof', x, y });
  }
  addFx(g, { type: 'summon', x: e.x, y: e.y });
  addFx(g, { type: 'txt', x: e.x, y: e.y - 34, s: 'ARISE!', c: '#b39ddb' });
}
function fireLaser(g, e) { // instant red beam that ignores walls
  const a = e.face, vx = Math.cos(a) * LASER.range, vy = Math.sin(a) * LASER.range, dmg = Math.max(1, Math.round(e.atk));
  for (const t of targetsOf(g)) {
    const wx = t.x - e.x, wy = t.y - e.y, u = clamp((wx * vx + wy * vy) / (vx * vx + vy * vy), 0, 1);
    if (Math.hypot(t.x - (e.x + vx * u), t.y - (e.y + vy * u)) <= t.r + LASER.width / 2) hurtT(g, t, dmg);
  }
  addFx(g, { type: 'laser', x1: e.x, y1: e.y, x2: e.x + vx, y2: e.y + vy });
}
function reviveTarget(g, p) { // nearest downed ally within REVIVE_RANGE
  let best = null, bd = REVIVE_RANGE;
  for (const a of g.players) {
    if (a === p || a.alive || a.gone) continue;
    const d = Math.hypot(a.x - p.x, a.y - p.y);
    if (d <= bd) { bd = d; best = a; }
  }
  return best;
}
function cancelRevive(g, p, announce) {
  if (!p.revTarget) return;
  p.revTarget.revP = 0; p.revTarget = null; p.revT = 0;
  if (announce) addFx(g, { type: 'txt', x: p.x, y: p.y - 30, s: 'REVIVE INTERRUPTED', c: '#ff8a80' });
}
function tryRevive(g, p) { // starts a REVIVE_TIME channel on the nearest downed ally; taking damage, leaving range or them being revived otherwise cancels it
  if (p.revTarget) return false;
  const best = reviveTarget(g, p);
  if (!best || g.players.some(o => o.revTarget === best)) return false;
  p.revTarget = best; p.revT = 0; best.revP = 0;
  addFx(g, { type: 'txt', x: best.x, y: best.y - 30, s: 'REVIVING…', c: '#69f0ae' });
  return true;
}
function reviveTick(g, p, dt) {
  const a = p.revTarget; if (!a) return;
  if (a.alive || a.gone || Math.hypot(a.x - p.x, a.y - p.y) > REVIVE_RANGE + 6) { cancelRevive(g, p, !a.alive && !a.gone); return; }
  p.revT += dt; a.revP = Math.min(1, p.revT / REVIVE_TIME);
  if (p.revT >= REVIVE_TIME) {
    cancelRevive(g, p, false);
    a.alive = true; a.hp = Math.max(1, Math.ceil(a.maxhp * 0.5)); a.hurt = 0; a.atkCd = 0;
    addFx(g, { type: 'heal', x: a.x, y: a.y });
    addFx(g, { type: 'txt', x: a.x, y: a.y - 30, s: 'REVIVED!', c: '#69f0ae' });
  }
}
function hurtT(g, t, dmg) {
  if (t.away || (t.isPet && g.players[t.owner] && g.players[t.owner].away)) return;
  if (t.dr > 0) dmg = Math.max(1, Math.round(dmg * (1 - t.dr))); // Iron Helm
  if (t.shield > 0) {
    const ab = Math.min(t.shield, dmg); t.shield -= ab; dmg -= ab;
    if (dmg <= 0) { addFx(g, { type: 'txt', x: t.x, y: t.y - 18, s: '🛡' + Math.round(ab), c: '#80d8ff' }); return; }
  }
  t.hp -= dmg; t.hurt = 0.15;
  if (t.revTarget) cancelRevive(g, t, true); // getting hurt interrupts a revive in progress
  addFx(g, { type: 'txt', x: t.x, y: t.y - 18, s: '-' + dmg, c: '#ff5252' });
  if (t.hp <= 0) {
    t.hp = 0; t.alive = false; t.shield = 0; t.shieldT = 0; if (t.isPet) t.respT = PET_RESPAWN;
    addFx(g, { type: 'poof', x: t.x, y: t.y });
    addFx(g, { type: 'txt', x: t.x, y: t.y - 30, s: t.isPet ? 'KO!' : 'DOWN!', c: '#ff8a80' });
  }
}
function hurtPlayer(g, p, dmg) { hurtT(g, p, dmg); }
function tickShield(g, t, dt) { // barrier timer; what is left when it expires heals 20% of the remainder
  if (!(t.shield > 0)) return;
  t.shieldT -= dt;
  if (t.shieldT <= 0) { const rem = t.shield; t.shield = 0; t.shieldT = 0; if (t.alive && rem > 0) heal(g, t, TURTLE.heal * rem); }
}

function alertAllies(g, e, t) { // nearby enemies get woken up too
  for (const o of g.enemies) if (o !== e && !o.dead && o.alert <= 0 && Math.hypot(o.x - e.x, o.y - e.y) < 110) o.alert = t;
}
function playerInSight(g, e) {
  let best = null, bd = 1e9;
  const vr = VISION[e.type];
  for (const p of g.players) {
    if (!p.alive || p.gone || p.away) continue;
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy);
    if (d > vr || d >= bd) continue;
    if (d > NOTICE && Math.abs(angDiff(Math.atan2(dy, dx), e.face)) > FOV / 2) continue; // outside the vision cone
    if (!clearLine(g, e.x, e.y, p.x, p.y, 2)) continue;                                  // a wall blocks the view
    best = p; bd = d;
  }
  return best;
}
function wander(g, e, dt) { // idle: short random strolls around the home spot, with pauses and looking around
  const wsp = e.speed * 0.45;
  if (e.wp) {
    const dx = e.wp.x - e.x, dy = e.wp.y - e.y, d = Math.hypot(dx, dy);
    e.wt -= dt;
    if (d < 4 || e.wt <= 0) { e.wp = null; e.pause = 0.8 + Math.random() * 2.2; return; }
    e.face = Math.atan2(dy, dx);
    const sp = wsp * dt, ox = e.x, oy = e.y;
    moveEnt(g, e, dx / d * sp, dy / d * sp);
    if (Math.hypot(e.x - ox, e.y - oy) < sp * 0.3) { e.wp = null; e.pause = 0.5; } // bumped into something
    return;
  }
  e.pause -= dt;
  if (e.pause > 0) { if (Math.random() < dt * 0.6) e.face += (Math.random() - 0.5) * 1.8; return; } // glance around
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 60;
    const x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r;
    if (Math.hypot(x - e.home.x, y - e.home.y) > 140) continue;
    if (hitsWall(g, x, y, e.r + 2) || !clearLine(g, e.x, e.y, x, y, e.r + 1)) continue;
    e.wp = { x, y }; e.wt = r / wsp + 1; return;
  }
  e.pause = 0.7; e.face += (Math.random() - 0.5) * 2.4;
}

// Walk toward a target: straight when the way is clear, otherwise along the path field of player `fk`.
function stepTo(g, e, tgt, fk, dt, mult) {
  let tx = tgt.x, ty = tgt.y;
  if (!clearLine(g, e.x, e.y, tgt.x, tgt.y, e.r + 1)) {
    const f = g.fields[fk];
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
  const dx = tx - e.x, dy = ty - e.y, dl = Math.hypot(dx, dy) || 1, sp = e.speed * dt * (mult || 1), ox = e.x, oy = e.y;
  moveEnt(g, e, dx / dl * sp, dy / dl * sp);
  if (Math.hypot(e.x - ox, e.y - oy) < sp * 0.5) {
    // snagged on a wall corner: slide along the free axis at full speed
    if (Math.abs(dx) >= Math.abs(dy)) { moveEnt(g, e, 0, (dy >= 0 ? 1 : -1) * sp); if (e.y === oy) moveEnt(g, e, Math.sign(dx) * sp, 0); }
    else { moveEnt(g, e, (dx >= 0 ? 1 : -1) * sp, 0); if (e.x === ox) moveEnt(g, e, 0, Math.sign(dy) * sp); }
  }
}
const CHARGE_KINDS = { smash: 1, dash: 2, laser: 3, cleave: 4, pillars: 5, fire: 6, jumpup: 7, jumpdn: 8, tpout: 9, tpstrike: 10 };
const isAir = e => e.sk === 'jumpup' || e.sk === 'jumpdn' || e.sk === 'tpout'; // Cerberus mid-jump / Assassin mid-teleport: can't be hit
function startCharge(e, kind, t) { e.sk = kind; e.ch = e.cht = t; }
function chargeLock(kind) { return kind === 'laser' ? LASER.lock : kind === 'dash' ? 0.25 : kind === 'cleave' ? 0.12 : kind === 'pillars' ? 0.1 : kind === 'fire' ? 0.15 : Infinity; } // aims until this many seconds are left
function chargeStep(g, e, dt) {
  e.ch -= dt;
  if (e.sk === 'jumpup') { // flight: he travels from where he jumped to the marked spot; the mark follows the target until the last moments so the player can still dodge
    if (!e.jfrom) e.jfrom = { x: e.x, y: e.y };
    if (e.ch > CERB.jump.lock) { const t = nearestTarget(g, e.x, e.y); if (t) e.land = { x: t.x, y: t.y }; }
    let L = e.land || e.jfrom; for (let i = 0; i <= 10 && hitsWall(g, L.x, L.y, e.r); i++) L = { x: L.x + (e.jfrom.x - L.x) * 0.1 * (i + 1), y: L.y + (e.jfrom.y - L.y) * 0.1 * (i + 1) };
    e.land = L; const u = clamp(1 - Math.max(e.ch, 0) / CERB.jump.up, 0, 1), sp = 0.5 - 0.5 * Math.cos(Math.PI * u);
    e.x = e.jfrom.x + (L.x - e.jfrom.x) * sp; e.y = e.jfrom.y + (L.y - e.jfrom.y) * sp; e.face = Math.atan2(L.y - e.jfrom.y, L.x - e.jfrom.x);
  }
  if (e.ch > chargeLock(e.sk)) { const t = nearestTarget(g, e.x, e.y); if (t) e.face = Math.atan2(t.y - e.y, t.x - e.x); } // keeps aiming, so the player can still dodge at the end
  if (e.ch > 0) return;
  const k = e.sk; e.ch = 0; e.sk = '';
  if (k === 'smash') { e.sm = SMASH.cd; smash(g, e); }
  else if (k === 'cleave') { e.cd = KING.cleave.cd; cleave(g, e); }
  else if (k === 'laser') { e.cd = ENEMIES[e.type].cd; fireLaser(g, e); }
  else if (k === 'pillars') { e.cd = ENEMIES[e.type].cd; castPillars(g, e); }
  else if (k === 'fire') { e.sm = CERB.fire.cd; e.fbQ = 3; e.fbT = 0; }
  else if (k === 'tpout') { // Assassin lands beside its target, then strikes half a second later
    const t = (e.tpTgt && e.tpTgt.alive !== false && !e.tpTgt.gone && !e.tpTgt.away) ? e.tpTgt : nearestTarget(g, e.x, e.y); e.tpTgt = null;
    if (t) {
      const a0 = Math.random() * Math.PI * 2, dist = t.r + e.r + TP.near;
      for (let i = 0; i < 12; i++) {
        const a = a0 + i * Math.PI / 6, x = t.x + Math.cos(a) * dist, y = t.y + Math.sin(a) * dist;
        if (!hitsWall(g, x, y, e.r) && clearLine(g, t.x, t.y, x, y, 2)) { e.x = x; e.y = y; break; }
      }
      e.face = Math.atan2(t.y - e.y, t.x - e.x);
    }
    addFx(g, { type: 'poof', x: e.x, y: e.y }); startCharge(e, 'tpstrike', TP.windup);
  }
  else if (k === 'tpstrike') { // one quick strike on whoever is still standing in the circle
    e.cd = Math.max(e.cd, ENEMIES[e.type].cd);
    const dmg = Math.max(1, Math.round(TP.mult * e.atk));
    for (const t of targetsOf(g)) if (Math.hypot(t.x - e.x, t.y - e.y) <= TP.r + t.r) hurtT(g, t, dmg);
    addFx(g, { type: 'slash', x: e.x, y: e.y, a: e.face }); addFx(g, { type: 'slash', x: e.x, y: e.y, a: e.face + Math.PI });
  }
  else if (k === 'jumpup') { // touchdown: the slam
    e.jfrom = null; e.s2 = CERB.jump.cd; e.cd = Math.max(e.cd, 1);
    const dmg = Math.max(1, Math.round(CERB.jump.mult * e.atk));
    for (const t of targetsOf(g)) if (Math.hypot(t.x - e.x, t.y - e.y) <= CERB.jump.r + t.r) hurtT(g, t, dmg);
    addFx(g, { type: 'smash', x: e.x, y: e.y, r: CERB.jump.r });
  }
  else if (k === 'jumpdn') { // slam
    e.s2 = CERB.jump.cd; e.cd = Math.max(e.cd, 1);
    const dmg = Math.max(1, Math.round(CERB.jump.mult * e.atk));
    for (const t of targetsOf(g)) if (Math.hypot(t.x - e.x, t.y - e.y) <= CERB.jump.r + t.r) hurtT(g, t, dmg);
    addFx(g, { type: 'smash', x: e.x, y: e.y, r: CERB.jump.r });
  }
  else if (k === 'dash') {
    const t = nearestTarget(g, e.x, e.y), dist = t ? Math.hypot(t.x - e.x, t.y - e.y) : KING.dash.range;
    e.dashLeft = clamp(dist + 60, 120, KING.dash.range); e.dashT = 1; e.dashHit = new Set();
  }
}
function dashStep(g, e, dt) {
  const step = Math.min(KING.dash.speed * dt, e.dashLeft), ox = e.x, oy = e.y;
  e.dustT = (e.dustT || 0) - dt; if (e.dustT <= 0) { e.dustT = 0.04; addFx(g, { type: 'dust', x: e.x - Math.cos(e.face) * 30, y: e.y - Math.sin(e.face) * 30, a: e.face }); }
  moveEnt(g, e, Math.cos(e.face) * step, Math.sin(e.face) * step);
  const moved = Math.hypot(e.x - ox, e.y - oy); e.dashLeft -= step;
  for (const t of targetsOf(g)) {
    if (e.dashHit.has(t) || Math.hypot(t.x - e.x, t.y - e.y) > e.r + t.r + 10) continue;
    e.dashHit.add(t); hurtT(g, t, Math.max(1, Math.round(KING.dash.mult * e.atk)));
    addFx(g, { type: 'smash', x: t.x, y: t.y, r: 34 });
  }
  if (moved < step * 0.5 || e.dashLeft <= 0) { e.dashT = 0; e.s2 = KING.dash.cd; e.cd = Math.max(e.cd, 0.8); }
}
function fearStep(g, e, dt) {
  e.fear -= dt; e.ch = 0; e.sk = ''; e.dashT = 0; e.fbQ = 0;
  if (e.lock) { e.lock = false; e.shield = 0; }   // a howl breaks a Hellguard's target lock (and its barrier)
  const f = e.fearFrom || { x: e.x - 1, y: e.y }, a = Math.atan2(e.y - f.y, e.x - f.x), sp = e.speed * 1.2 * dt;
  e.face = a;
  const ox = e.x, oy = e.y; moveEnt(g, e, Math.cos(a) * sp, Math.sin(a) * sp);
  if (Math.hypot(e.x - ox, e.y - oy) < sp * 0.4) { moveEnt(g, e, -Math.sin(a) * sp, Math.cos(a) * sp); if (e.x === ox && e.y === oy) moveEnt(g, e, Math.sin(a) * sp, -Math.cos(a) * sp); } // slide along a wall
}
function pillarSpots(e) { const out = []; for (let i = 1; i <= SORC.n; i++) out.push({ x: e.x + Math.cos(e.face) * SORC.step * i, y: e.y + Math.sin(e.face) * SORC.step * i }); return out; }
function castPillars(g, e) { // Sorcerer: 3 pillars of fire rise one after another along a line; each hurts whoever stands in it when it erupts
  const dmg = Math.max(1, Math.round(e.atk));
  pillarSpots(e).forEach((p, i) => {
    if (hitsWall(g, p.x, p.y, 2)) return;
    const delay = i * SORC.gap; g.hz.push({ x: p.x, y: p.y, t: -delay, dmg, done: false });
    addFx(g, { type: 'pillar', x: p.x, y: p.y, d: delay, life: delay + SORC.rise + 0.3 });
  });
}
function hazardTick(g, dt) {
  for (const h of g.hz) {
    h.t += dt;
    if (!h.done && h.t >= 0) { h.done = true; for (const t of targetsOf(g)) if (Math.hypot(t.x - h.x, t.y - h.y) <= SORC.r + t.r * 0.5) hurtT(g, t, h.dmg); }
  }
  g.hz = g.hz.filter(h => h.t < 0.5);
}
function fireTick(g, e, dt) { // Cerberus: its three heads spit one fireball each, one after another; they bounce off walls
  const tgt = nearestTarget(g, e.x, e.y);
  if (!tgt) { e.fbQ = 0; return; }
  e.fbT -= dt; if (e.fbT > 0) return;
  const h = 3 - e.fbQ, a = Math.atan2(tgt.y - e.y, tgt.x - e.x) + (h - 1) * CERB.fire.spread;
  e.fbQ--; e.fbT = CERB.fire.gap; e.face = a;
  let x = e.x + Math.cos(a) * e.r, y = e.y + Math.sin(a) * e.r; if (hitsWall(g, x, y, 3)) { x = e.x; y = e.y; }
  g.proj.push({ id: g.nid++, x, y, vx: Math.cos(a) * CERB.fire.speed, vy: Math.sin(a) * CERB.fire.speed, dmg: Math.max(1, Math.round(CERB.fire.mult * e.atk)),
    life: CERB.fire.life, kind: 'fireball', hostile: true, bounce: true, rad: 7, dead: false });
}
function cerbAI(g, e, tgt, d) { // returns true when it started a skill this frame
  if (e.s2 <= 0 && d >= CERB.jump.min && d <= CERB.jump.max) { startCharge(e, 'jumpup', CERB.jump.up); e.land = { x: tgt.x, y: tgt.y }; e.jfrom = { x: e.x, y: e.y }; return true; }
  if (e.sm <= 0 && d >= 60 && d <= CERB.fire.range) { startCharge(e, 'fire', CERB.fire.windup); return true; }
  return false;
}
function kingAI(g, e, tgt, seen, d) { // returns true when it used up this frame starting a skill
  const minions = g.enemies.reduce((n, o) => n + (o.summoned && !o.dead ? 1 : 0), 0);
  if (e.sm <= 0 && minions <= KING.summon.cap - KING.summon.n) { e.sm = KING.summon.cd; summonArchers(g, e); return true; }
  if (e.s2 <= 0 && seen && d >= 100 && d <= KING.dash.range && clearLine(g, e.x, e.y, tgt.x, tgt.y, e.r)) { startCharge(e, 'dash', KING.dash.charge); return true; }
  if (e.cd <= 0 && d <= KING.cleave.r * 0.85 + tgt.r) { startCharge(e, 'cleave', KING.cleave.windup); return true; }
  return false;
}
// ---- pets ----
function targetsOf(g) { // everything an enemy can hurt: living players and living pets
  const r = [];
  for (const p of g.players) if (p.alive && !p.gone && !p.away) r.push(p);
  for (const q of g.pets) if (q.alive && !(g.players[q.owner] && g.players[q.owner].away)) r.push(q); // a disconnected player's hero and pet stay safe
  return r;
}
function nearestTarget(g, x, y) {
  let best = null, bd = Infinity;
  for (const t of targetsOf(g)) { const d = Math.hypot(t.x - x, t.y - y); if (d < bd) { bd = d; best = t; } }
  return best;
}
function makePet(g, p) {
  const d = PETS[p.pet], side = p.id === 0 ? -1 : 1;
  let x = p.x + side * 22, y = p.y + 18;
  if (hitsWall(g, x, y, d.r)) { x = p.x; y = p.y; }
  const hp = p.php > 0 ? p.php : d.hp, atk = p.patk > 0 ? p.patk : d.atk; // base stats plus the owner's Pet Points
  return { id: 100 + p.id, isPet: true, owner: p.id, type: p.pet, x, y, r: d.r, hp, maxhp: hp, atk, speed: d.speed, alive: true, face: p.face || 0, respT: 0, focus: null, focusT: 0,
    atkCd: 0, abCd: 0, shield: 0, shieldT: 0, slashN: 0, slashT: 0, hurt: 0, combat: false, home: { x, y }, wp: null, wt: 0, pause: 0 };
}
function petAbility(g, q, o, foe, fd) {
  if (q.abCd > 0) return;
  if (q.type === 'wolf') {
    const near = g.enemies.filter(e => !e.dead && !isBossT(e) && !(e.fear > 0) && !isAir(e) && Math.hypot(e.x - q.x, e.y - q.y) <= WOLF.r);
    if (!near.length) return;
    // wait until the howl is worth it: the enemy crowd is as big as it is going to get (up to 3) and the nearest one is already on top of the wolf; low health forces it
    const alive = g.enemies.reduce((n, e) => n + (e.dead || isBossT(e) ? 0 : 1), 0), need = Math.min(WOLF.crowd, alive);
    let nd = Infinity; for (const e of near) nd = Math.min(nd, Math.hypot(e.x - q.x, e.y - q.y));
    const crowded = near.length >= need && nd <= WOLF.engage, desperate = q.hp < q.maxhp * 0.5 && nd <= WOLF.engage * 1.5;
    if (!crowded && !desperate) return;
    for (const e of near) { e.fear = WOLF.fear; e.fearFrom = { x: q.x, y: q.y }; e.ch = 0; e.sk = ''; e.dashT = 0; }
    addFx(g, { type: 'howl', x: q.x, y: q.y, r: WOLF.r }); q.abCd = WOLF.cd;
  } else if (q.type === 'panther') {
    if (fd <= PANTHER.r) { q.slashN = PANTHER.hits; q.slashT = 0; q.abCd = PANTHER.cd; }
  } else if (q.type === 'turtle') {
    if (fd > TURTLE.r && Math.hypot(foe.x - o.x, foe.y - o.y) > TURTLE.r) return;
    const amt = Math.max(1, Math.round(TURTLE.mult * q.hp));
    for (const t of [q, o]) if (t.alive) { t.shield = amt; t.shieldT = TURTLE.dur; addFx(g, { type: 'barrier', x: t.x, y: t.y }); }
    q.abCd = TURTLE.cd;
  }
}
function petStep(g, q, dt) {
  const def = PETS[q.type], o = g.players[q.owner];
  q.hurt = Math.max(0, q.hurt - dt); q.atkCd -= dt; q.abCd = Math.max(0, q.abCd - dt);
  tickShield(g, q, dt);
  if (q.focusT > 0) { q.focusT -= dt; if (q.focusT <= 0 || !q.focus || q.focus.dead) { q.focus = null; q.focusT = 0; } }
  if (!o || o.gone) { q.alive = false; q.respT = 0; return; }
  if (!q.alive) { // KO'd: comes back on its own after PET_RESPAWN seconds, at its owner's side with full health
    q.respT -= dt;
    if (q.respT <= 0) {
      const fresh = makePet(g, o); fresh.abCd = q.abCd;
      Object.assign(q, fresh, { id: q.id });
      addFx(g, { type: 'heal', x: q.x, y: q.y }); addFx(g, { type: 'txt', x: q.x, y: q.y - 24, s: 'BACK!', c: '#69f0ae' });
    }
    return;
  }
  if (q.slashN > 0) { // panther: rapid triple slash
    q.slashT -= dt;
    if (q.slashT <= 0) {
      q.slashT = PANTHER.gap; q.slashN--;
      for (const e of g.enemies) {
        if (e.dead) continue;
        const dx = e.x - q.x, dy = e.y - q.y;
        if (Math.hypot(dx, dy) <= PANTHER.r + bodyR(e) && Math.abs(angDiff(Math.atan2(dy, dx), q.face)) <= PANTHER.arc) hitEnemy(g, e, PANTHER.mult * q.atk);
      }
      addFx(g, { type: 'slash', x: q.x, y: q.y, a: q.face });
    }
    return;
  }
  // a pet only fights once it can see an enemy
  let foe = null, fd = PET_SIGHT;
  for (const e of g.enemies) {
    if (e.dead || isAir(e)) continue;
    const d = Math.hypot(e.x - q.x, e.y - q.y);
    if (d < fd && clearLine(g, q.x, q.y, e.x, e.y, 2)) { fd = d; foe = e; }
  }
  if (q.focus && !q.focus.dead) { foe = q.focus; fd = Math.hypot(foe.x - q.x, foe.y - q.y); } // the owner is attacking this one: join in at once
  q.combat = !!foe;
  const od = Math.hypot(o.x - q.x, o.y - q.y);
  if (foe) {
    q.face = Math.atan2(foe.y - q.y, foe.x - q.x);
    petAbility(g, q, o, foe, fd);
    if (q.slashN > 0) return;
    const reach = q.r + foe.r + 6;
    const stayClose = def.kind === 'Defender' && Math.hypot(foe.x - o.x, foe.y - o.y) > 150; // defenders don't wander off from their owner
    if (!stayClose) {
      if (fd > reach) stepTo(g, q, foe, q.owner, dt, 1);
      if (fd <= reach + 2 && q.atkCd <= 0) { q.atkCd = def.cd; hitEnemy(g, foe, q.atk); addFx(g, { type: 'slash', x: q.x, y: q.y, a: q.face }); }
      return;
    }
  }
  // not fighting: follow the owner, or wander around once the owner has stood still for 5 seconds
  if (od > 450) { q.x = o.x; q.y = o.y; q.face = o.face; return; }
  if (o.still >= 5 && od < 220) { q.home = { x: o.x, y: o.y }; wander(g, q, dt); return; }
  const px = q.x, py = q.y;
  if (od > 56) stepTo(g, q, o, q.owner, dt, clamp((od - 56) / 70, 0.3, 1));
  // no sliding sideways: face the way it is travelling, or the way its owner faces once it has caught up
  const mv = Math.hypot(q.x - px, q.y - py), want = mv > 0.15 ? Math.atan2(q.y - py, q.x - px) : o.face;
  q.face += angDiff(want, q.face) * Math.min(1, dt * 12);
}

function step(g, dt) {
  g.time += dt;
  if (g.banner) { g.banner.t += dt; if (g.banner.t > 2.2) g.banner = null; }
  // players
  for (const p of g.players) {
    if (p.gone) continue;
    p.hurt = Math.max(0, p.hurt - dt);
    tickShield(g, p, dt);
    if (!p.alive) continue;
    const inp = g.inputs[p.id] || (g.inputs[p.id] = { mx: 0, my: 0, atk: false, sp: false });
    let mx = +inp.mx || 0, my = +inp.my || 0;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    if (len > 0.08) { moveEnt(g, p, mx * p.speed * dt, my * p.speed * dt); p.face = Math.atan2(my, mx); p.still = 0; } else p.still += dt;
    p.atkCd -= dt; p.spCd = Math.max(0, p.spCd - dt);
    if ((inp.atk || (AUTO_ATTACK && autoTarget(g, p))) && p.atkCd <= 0) { doAttack(g, p); p.atkCd = CHARS[p.char].cd; }
    if (inp.sp) { inp.sp = false; if (p.spCd <= 0 && doSpecial(g, p)) p.spCd = SPECIAL_CD; }
    if (inp.rev) { inp.rev = false; tryRevive(g, p); }
    reviveTick(g, p, dt);
  }
  // path fields
  g.fieldT -= dt;
  if (g.fieldT <= 0) {
    g.fieldT = 0.25;
    for (const p of g.players) if (p.alive && !p.gone) g.fields[p.id] = bfs(g.grid, clamp(Math.floor(p.x / TILE), 0, COLS - 1), clamp(Math.floor(p.y / TILE), 0, ROWS - 1));
  }
  // pets
  for (const q of g.pets) petStep(g, q, dt);
  // enemies
  for (const e of g.enemies) {
    if (e.dead) continue;
    const def = ENEMIES[e.type];
    e.hurt = Math.max(0, e.hurt - dt); e.cd -= dt;
    if (e.sm > 0) e.sm -= dt;
    if (e.s2 > 0) e.s2 -= dt;
    if (g.bossRoom) e.alert = Math.max(e.alert, 5);        // everyone in the boss room is hostile from the moment players enter
    if (e.fear > 0) { fearStep(g, e, dt); continue; }      // howled at: runs away, cannot attack
    if (e.dashT > 0) { dashStep(g, e, dt); continue; }     // Skeleton King mid-charge
    if (e.ch > 0) { chargeStep(g, e, dt); continue; }      // winding up a skill: stands still
    if (e.fbQ > 0) { fireTick(g, e, dt); continue; }       // Cerberus spitting fireballs: stands still
    const seen = playerInSight(g, e);
    if (seen) { if (e.alert <= 0) alertAllies(g, e, 3); e.alert = 4; } // spotted: hostile, and keeps hunting a few seconds after losing sight
    else e.alert = Math.max(0, e.alert - dt);
    if (e.type === 'hellguard') { // target lock: once it has spotted you it never stops chasing (until howled at), wrapped in a barrier of 50% max HP
      if (!e.lock && (seen || (g.bossRoom && !e.hadLock))) { e.lock = true; e.hadLock = true; e.shield = Math.ceil(e.maxhp * LOCK.barrier); addFx(g, { type: 'barrier', x: e.x, y: e.y }); }
      if (e.lock) e.alert = Math.max(e.alert, 6);
    }
    if (e.alert <= 0) { wander(g, e, dt); continue; }
    const tgt = nearestTarget(g, e.x, e.y);                // players, or a pet that is closer (so a Defender can tank)
    if (!tgt) { e.alert = 0; if (e.lock) { e.lock = false; e.shield = 0; } continue; }
    const d = Math.hypot(tgt.x - e.x, tgt.y - e.y), fk = tgt.isPet ? tgt.owner : tgt.id;
    e.face = Math.atan2(tgt.y - e.y, tgt.x - e.x);
    if (e.type === 'troll' && e.sm <= 0 && seen && d <= SMASH.r * SMASH.trigger) { startCharge(e, 'smash', SMASH.charge); continue; }
    if (e.type === 'skeleton_king' && kingAI(g, e, tgt, seen, d)) continue;
    if (e.type === 'cerberus' && cerbAI(g, e, tgt, d)) continue;
    if (e.type === 'assassin' && e.s2 <= 0 && d >= TP.minDist && d <= TP.maxDist && Math.random() < TP.chance * dt) { // teleport strike: only once it has spotted you
      e.s2 = TP.cd; e.tpTgt = tgt; addFx(g, { type: 'poof', x: e.x, y: e.y }); startCharge(e, 'tpout', TP.vanish); continue;
    }
    if (def.caster) { // Sorcerer: keeps its distance and calls up a chain of fire pillars
      const los = clearLine(g, e.x, e.y, tgt.x, tgt.y, 3);
      if (e.cd <= 0 && los && d <= SORC.range) { startCharge(e, 'pillars', SORC.windup); continue; }
      if (d < SORC.keep) moveEnt(g, e, (e.x - tgt.x) / (d || 1) * e.speed * 0.9 * dt, (e.y - tgt.y) / (d || 1) * e.speed * 0.9 * dt);
      else if (d > SORC.hold || !los) stepTo(g, e, tgt, fk, dt, 1);
      continue;
    }
    if (def.laser) { // Voidling: fires a wall-piercing laser from very far away
      if (e.cd <= 0 && d <= LASER.range) { startCharge(e, 'laser', LASER.charge); continue; }
      if (d < LASER.keep) moveEnt(g, e, (e.x - tgt.x) / (d || 1) * e.speed * 0.9 * dt, (e.y - tgt.y) / (d || 1) * e.speed * 0.9 * dt);
      else if (d > LASER.hold) stepTo(g, e, tgt, fk, dt, 1);
      continue;
    }
    const ranged = !!def.ranged;
    const los = ranged && clearLine(g, e.x, e.y, tgt.x, tgt.y, 3);
    const reach = def.reach || (bodyR(e) + tgt.r + 4);
    if (ranged ? (d > ARROW.hold || !los) : d > reach) stepTo(g, e, tgt, fk, dt, 1);
    if (ranged) {
      if (d < ARROW.keep) { // too close: back away to keep shooting distance
        const bx = (e.x - tgt.x) / (d || 1), by = (e.y - tgt.y) / (d || 1), bs = e.speed * 0.9 * dt;
        moveEnt(g, e, bx * bs, by * bs);
      }
      if (los && d <= ARROW.range && e.cd <= 0) {
        e.cd = def.cd;
        const a = Math.atan2(tgt.y - e.y, tgt.x - e.x);
        g.proj.push({ id: g.nid++, x: e.x, y: e.y, vx: Math.cos(a) * ARROW.speed, vy: Math.sin(a) * ARROW.speed,
          dmg: Math.max(1, Math.round(e.atk)), life: ARROW.life, kind: 'arrow', hostile: true, dead: false });
      }
    } else if (e.type !== 'skeleton_king' && d <= bodyR(e) + tgt.r + 8 && e.cd <= 0) { e.cd = def.cd; hurtT(g, tgt, Math.max(1, Math.round(e.atk))); if (def.boss) addFx(g, { type: 'bash', x: tgt.x, y: tgt.y, bx: e.x, by: e.y, a: e.face }); }
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
    const ox = j.x, oy = j.y;
    j.x += j.vx * dt; j.y += j.vy * dt; j.life -= dt;
    if (j.life <= 0) { j.dead = true; continue; }
    if (hitsWall(g, j.x, j.y, 2)) {
      if (!j.bounce) { j.dead = true; continue; }
      const hx = hitsWall(g, j.x, oy, 2), hy = hitsWall(g, ox, j.y, 2); // fireballs bounce: flip whichever axis ran into the wall
      if (hx || !hy) j.vx = -j.vx;
      if (hy || !hx) j.vy = -j.vy;
      j.x = ox; j.y = oy;
    }
    if (j.hostile) { // enemy arrow / fireball: hits the first living player or pet it touches
      for (const t of targetsOf(g)) if (Math.hypot(t.x - j.x, t.y - j.y) < t.r + (j.rad || 4)) { hurtT(g, t, j.dmg); j.dead = true; break; }
      continue;
    }
    for (const e of g.enemies) {
      if (!e.dead && !isAir(e) && Math.hypot(e.x - j.x, e.y - j.y) < bodyR(e) + 5) { hitEnemy(g, e, j.dmg, g.players[j.owner]); j.dead = true; break; }
    }
  }
  hazardTick(g, dt);
  // pickups: points are shared by both players; a potion heals whoever walks over it (and stays put if they are already at full health)
  for (const k of g.pickups) {
    for (const p of g.players) {
      if (!p.alive || p.gone || Math.hypot(p.x - k.x, p.y - k.y) >= p.r + 10) continue;
      if (k.kind === 'pot') {
        if (p.hp >= p.maxhp) continue;
        heal(g, p, POTION.heal * p.maxhp); k.dead = true; break;
      }
      if (k.kind === 'pp') { g.teamPp++; addFx(g, { type: 'txt', x: k.x, y: k.y - 10, s: '+1 PP', c: '#f48fb1' }); }
      else { p.cp++; g.teamCp++; addFx(g, { type: 'txt', x: k.x, y: k.y - 10, s: '+1 CP', c: '#ffd600' }); }
      k.dead = true; break;
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
        g.level++; if (g.level > levelsIn(g.stage)) { g.level = 1; g.stage++; }
        loadLevel(g, false);
        return;
      }
    }
  }
  checkOver(g);
}
function checkOver(g) {
  if (g.over || !g.grid) return;
  if (g.players.every(p => !p.alive || p.gone || p.away)) {
    g.over = true;
    if (g.multi) relay({ k: 'over', stage: g.stage, level: g.level, cp: g.teamCp, gold: g.teamGold, pp: g.teamPp, lt: g.lootBy });
    showOver(g);
  }
}
function creditCp(g, announce) { // points and gold found by either player go to both profiles
  if (g.teamCp > g.seenCp) {
    const n = g.teamCp - g.seenCp; profile.cp += n; g.seenCp = g.teamCp; saveProfile();
    if (announce) toast(n > 1 ? `+${n} Character Points!` : '+1 Character Point!');
  }
  if (g.teamPp > g.seenPp) { const n = g.teamPp - g.seenPp; profile.pp += n; g.seenPp = g.teamPp; saveProfile(); if (announce) toast(n > 1 ? `+${n} Pet Points!` : '+1 Pet Point!'); }
  if (g.teamGold > g.seenGold) { profile.gold += g.teamGold - g.seenGold; g.seenGold = g.teamGold; saveProfile(); }
  const mine = g.lootBy[g.pid] || [];
  while (g.seenLoot < mine.length) { const k = mine[g.seenLoot++]; if (EQUIP[k]) { addGear(k, 0); if (announce) toast(`Found: ${EQUIP[k].name}!`); } saveProfile(); }
}
function showOver(g) {
  if (!g.isHost) clearLast();
  const me = g.players[g.pid];
  $('overStage').textContent = `You reached Stage ${g.stage}-${g.level}`;
  creditCp(g);
  $('overCp').innerHTML = `Character Points: 🟡 ${g.teamCp}  ·  ` + (unlocked('pets') || g.teamPp ? `Pet Points: ${ic('paw')} ${g.teamPp}  ·  ` : '') + `Gold: ${ic('gold')} ${g.teamGold}` + ((g.lootBy[g.pid] || []).length ? `\nEquipment found: ${g.lootBy[g.pid].map(k => EQUIP[k].name).join(', ')}` : '') + (g.multi ? '\n(shared with your partner)' : '');
  $('controls').classList.add('hidden'); $('btnQuit').classList.add('hidden'); closePause();
  show('scrOver');
}

// ---------------- snapshots (host -> guest) ----------------
const r1 = v => Math.round(v * 10) / 10;
const ri = v => Math.round(v), r2 = v => Math.round(v * 100) / 100;
function snapshot(g) { // kept small on purpose: it goes out 20x a second over a relayed WebRTC link
  const s = {
    k: 's', d: g.door.open ? 1 : 0, kl: g.kills, bk: g.bossKills, t: g.teamCp, gd: g.teamGold, pp: g.teamPp, lt: g.lootBy,
    p: g.players.map(p => [r1(p.x), r1(p.y), p.hp, r2(p.face), r1(p.spCd), p.alive ? 1 : 0, p.cp, p.gone ? 1 : 0, r2(p.hurt), Math.round(p.shield || 0), r2(p.revP || 0), p.away ? 1 : 0]),
    e: g.enemies.map(e => [e.id, e.type, ri(e.x), ri(e.y), e.hp, e.maxhp, r2(e.face), r2(e.hurt), e.alert > 0 ? 1 : 0, e.ch > 0 ? r2(e.ch) : 0, CHARGE_KINDS[e.sk] || 0, e.fear > 0 ? 1 : 0, e.summoned ? 1 : 0, e.sk === 'jumpup' && e.land ? ri(e.land.x) : 0, e.sk === 'jumpup' && e.land ? ri(e.land.y) : 0, Math.round(e.shield || 0)]),
    q: g.pets.map(q => [q.id, q.type, ri(q.x), ri(q.y), q.hp, q.maxhp, r2(q.face), q.alive ? 1 : 0, q.owner, Math.round(q.shield || 0), r2(q.hurt), q.combat ? 1 : 0, q.alive ? 0 : Math.ceil(Math.max(0, q.respT || 0))]),
    j: g.proj.map(j => [j.id, ri(j.x), ri(j.y), j.kind, r2(Math.atan2(j.vy, j.vx))]),
    c: g.pickups.map(k => [k.id, ri(k.x), ri(k.y), k.kind === 'pp' ? 1 : k.kind === 'pot' ? 2 : 0]),
    f: g.fxq.length > 40 ? g.fxq.slice(-40) : g.fxq,
  };
  g.fxq = [];
  return s;
}
function applyLevel(g, m) {
  g.stage = m.stage; g.level = m.level;
  g.grid = m.grid.map(r => [...r].map(Number));
  setDims(g.grid.length > g.grid[0].length, Math.max(g.grid.length, g.grid[0].length) > 30);
  g.door = { c: m.door.c, r: m.door.r, ic: m.door.ic, ir: m.door.ir, open: false };
  g.enemies = []; g.proj = []; g.pickups = []; g.fx = []; g.pets = []; g.pendSnap = null; g.cam = null;
  g.players = m.players.map(p => Object.assign({ r: 10, face: 0, spCd: 0, hurt: 0, shield: 0, tx: p.x, ty: p.y }, p));
  g.banner = { text: bannerText(m.stage, m.level), t: 0 };
  noteProgress(g);
}
function applySnap(g, s) {
  g.door.open = !!s.d;
  if (s.kl > g.kills) g.kills = s.kl;
  if (s.bk > g.bossKills) g.bossKills = s.bk;
  if (s.t > g.teamCp) g.teamCp = s.t;
  if (s.gd > g.teamGold) g.teamGold = s.gd;
  if (s.pp > g.teamPp) g.teamPp = s.pp;
  if (Array.isArray(s.lt) && Array.isArray(s.lt[g.pid]) && s.lt[g.pid].length > g.lootBy[g.pid].length) g.lootBy[g.pid] = s.lt[g.pid].filter(k => EQUIP[k]);
  s.p.forEach((a, i) => {
    const p = g.players[i]; if (!p) return;
    p.tx = a[0]; p.ty = a[1]; p.hp = a[2]; p.face = a[3]; p.spCd = a[4]; p.alive = !!a[5]; p.cp = a[6]; p.gone = !!a[7]; p.hurt = a[8]; p.shield = a[9] || 0; p.revP = a[10] || 0; p.away = !!a[11];
  });
  const oldE = new Map(g.enemies.map(e => [e.id, e]));
  g.enemies = s.e.map(a => {
    let e = oldE.get(a[0]);
    if (!e) e = { id: a[0], type: a[1], x: a[2], y: a[3], r: ENEMIES[a[1]] ? ENEMIES[a[1]].r : 10 };
    e.tx = a[2]; e.ty = a[3]; e.hp = a[4]; e.maxhp = a[5]; e.face = a[6]; e.hurt = a[7]; e.al = a[8]; e.ch = a[9] || 0; e.skc = a[10] || 0; e.fearing = !!a[11]; e.summoned = !!a[12]; e.land = a[13] || a[14] ? { x: a[13], y: a[14] } : null; e.shield = a[15] || 0;
    return e;
  });
  const oldQ = new Map(g.pets.map(q => [q.id, q]));
  g.pets = (s.q || []).map(a => {
    let q = oldQ.get(a[0]);
    if (!q) q = { id: a[0], type: a[1], x: a[2], y: a[3], isPet: true, r: PETS[a[1]] ? PETS[a[1]].r : 9 };
    q.tx = a[2]; q.ty = a[3]; q.hp = a[4]; q.maxhp = a[5]; q.face = a[6]; q.alive = !!a[7]; q.owner = a[8]; q.shield = a[9] || 0; q.hurt = a[10] || 0; q.combat = !!a[11]; q.respT = a[12] || 0;
    return q;
  });
  const oldJ = new Map(g.proj.map(j => [j.id, j]));
  g.proj = s.j.map(a => {
    let j = oldJ.get(a[0]);
    if (!j) j = { id: a[0], x: a[1], y: a[2] };
    j.tx = a[1]; j.ty = a[2]; j.kind = a[3]; j.ang = a[4];
    return j;
  });
  g.pickups = s.c.map(a => ({ id: a[0], x: a[1], y: a[2], kind: a[3] === 1 ? 'pp' : a[3] === 2 ? 'pot' : 'cp' }));
  (s.f || []).forEach(f => pushFx(g, f));
}
// Guest-side prediction: the host is the only one who simulates, so without this the joining player's own hero would
// only move after the input had travelled to the host AND the snapshot had come back (one full ping + up to 50 ms).
// The guest therefore moves its own hero locally right away, with the same movement and wall rules, and only gets
// nudged back when the host's position disagrees by more than what ping alone explains.
const PRED_DEADZONE = 46;   // px of disagreement tolerated (ping x speed); beyond this the hero is eased towards the host's position
function predictMe(g, me, inp, dt) {
  const len = Math.hypot(inp.mx, inp.my);
  if (len > 0.08) {
    const m = len > 1 ? 1 / len : 1, sp = me.speed || CHARS[me.char].speed;
    moveEnt(g, me, inp.mx * m * sp * dt, inp.my * m * sp * dt);
  }
  if (me.tx === undefined) return;
  const ex = me.tx - me.x, ey = me.ty - me.y, err = Math.hypot(ex, ey);
  const idle = len <= 0.08;
  if (err > 110) { me.x = me.tx; me.y = me.ty; }                                          // teleported / revived / new room
  else if (idle && err > 0.5) { const k = 1 - Math.exp(-dt * 12); me.x += ex * k; me.y += ey * k; } // standing still: the host has caught up, so settle exactly on its position
  else if (err > PRED_DEADZONE) { const k = (1 - Math.exp(-dt * 6)) * (err - PRED_DEADZONE) / err; me.x += ex * k; me.y += ey * k; }
}
function smooth(g, dt, inp) {
  const k = 1 - Math.exp(-dt * 18);
  const me = g.players[g.pid];
  const f = o => {
    if (o === me && inp && o.alive && !o.gone && !o.away) return predictMe(g, o, inp, dt);
    if (o.tx === undefined) return;
    if (Math.abs(o.tx - o.x) + Math.abs(o.ty - o.y) > 100) { o.x = o.tx; o.y = o.ty; }
    else { o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; }
  };
  g.players.forEach(f); g.enemies.forEach(f); g.proj.forEach(f); g.pets.forEach(f);
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

const btnAtk = $('btnAtk'), btnSp = $('btnSp'), btnRev = $('btnRev');
$('controls').classList.toggle('auto', AUTO_ATTACK); btnAtk.classList.toggle('hidden', AUTO_ATTACK); // auto-attack: no attack button, the special button moves into its spot
let atkPtr = null;
btnAtk.addEventListener('pointerdown', e => { ui.atk = true; atkPtr = e.pointerId; btnAtk.classList.add('down'); try { btnAtk.setPointerCapture(e.pointerId); } catch (err) {} e.preventDefault(); });
const atkUp = e => { if (e.pointerId === atkPtr) { ui.atk = false; atkPtr = null; btnAtk.classList.remove('down'); } };
['pointerup', 'pointercancel'].forEach(t => btnAtk.addEventListener(t, atkUp));
btnSp.addEventListener('pointerdown', e => { ctl.sp = true; btnSp.classList.add('down'); e.preventDefault(); });
['pointerup', 'pointercancel', 'pointerleave'].forEach(t => btnSp.addEventListener(t, () => btnSp.classList.remove('down')));
btnRev.addEventListener('pointerdown', e => { ctl.rev = true; btnRev.classList.add('down'); e.preventDefault(); });
['pointerup', 'pointercancel', 'pointerleave'].forEach(t => btnRev.addEventListener(t, () => btnRev.classList.remove('down')));

window.addEventListener('keydown', e => {
  if (!game || game.over) return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyJ', 'KeyK', 'KeyL', 'ShiftLeft', 'KeyR', 'KeyE'].includes(e.code)) e.preventDefault();
  if (!e.repeat && ['KeyK', 'KeyL', 'ShiftLeft'].includes(e.code)) ctl.sp = true;
  if (!e.repeat && ['KeyR', 'KeyE'].includes(e.code)) ctl.rev = true;
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
function hostLinkTick(g, dt) { // is the partner still there? (a closed tab often sends no 'close' event, so silence counts too)
  const gp = g.players[1]; if (!gp || gp.gone) return;
  const silent = !net.conn || !net.conn.open || nowMs() - net.lastMsg > AWAY_MS;
  if (silent && !gp.away) { gp.away = true; g.awayT = 0; cancelRevive(g, gp, false); toast(`${gp.name} disconnected — waiting for them to rejoin`); }
  else if (!silent && gp.away) { gp.away = false; toast(`${gp.name} is back!`); }
  if (gp.away) {
    g.awayT = (g.awayT || 0) + dt;
    g.inputs[1] = { mx: 0, my: 0, atk: false, sp: false };
    if (g.awayT > REJOIN_MS / 1000) { gp.gone = true; gp.alive = false; gp.away = false; toast(`${gp.name} left the game`); checkOver(g); }
  }
}
function update(dt) {
  const g = game; if (!g) return;
  const frozen = pauseOpen && !g.multi;               // solo: the run stands still while the menu is open (co-op can't stop the host)
  if (g.grid && !g.over && !pauseOpen) g.runT += dt;  // elapsed time ignores the time spent in the menu
  if (frozen) { ctl.sp = false; ctl.rev = false; }
  const inp = readInput();
  if (g.isHost) {
    const i0 = g.inputs[0] || (g.inputs[0] = { mx: 0, my: 0, atk: false, sp: false });
    i0.mx = inp.mx; i0.my = inp.my; i0.atk = inp.atk;
    if (ctl.sp) { i0.sp = true; ctl.sp = false; }
    if (ctl.rev) { i0.rev = true; ctl.rev = false; }
    if (!g.over && g.grid && !frozen) {
      g.acc += dt; let n = 0;
      while (g.acc >= STEP && n < 5) { step(g, STEP); g.acc -= STEP; n++; if (!game || g.over) break; }
      if (g.acc > STEP) g.acc = 0;
    }
    if (game && g.multi && g.grid) {
      hostLinkTick(g, dt); netProbe(nowMs());
      g.snapT += dt;
      if (g.snapT >= (net.relayed ? 0.067 : 0.05)) {   // relayed links get 15 snapshots/s instead of 20: less data through the TURN cap
        g.snapT = 0;
        if (linkBusy(net.conn)) { if (g.fxq.length > 40) g.fxq = g.fxq.slice(-40); } // connection is backed up: drop this snapshot rather than pile on lag
        else relay(snapshot(g));
      }
    }
  } else if (g.grid) {
    if (!net.rc) { if (g.pendSnap) { applySnap(g, g.pendSnap); g.pendSnap = null; } smooth(g, dt, inp); } // while disconnected the picture stays frozen: nothing is simulated or changed until the host answers again
    if (g.multi && !net.rc && nowMs() - net.lastMsg > 4000) startReconnect(net.conn && net.conn.open ? 'No data from the host' : 'Connection lost'); // silent link: try to re-establish it
    if (g.banner) { g.banner.t += dt; if (g.banner.t > 2.2) g.banner = null; }
    if (g.multi) netProbe(nowMs());
    g.sendT += dt;
    if (g.sendT >= 0.04) {   // inputs go out only when they change (plus a 4/s heartbeat): every relayed packet costs data, and the host keeps the last input anyway
      const m = { k: 'in', mx: Math.round(inp.mx * 100) / 100, my: Math.round(inp.my * 100) / 100, atk: inp.atk ? 1 : 0, sp: ctl.sp ? 1 : 0, rev: ctl.rev ? 1 : 0 };
      const sig = m.mx + "," + m.my + "," + m.atk;
      if (m.sp || m.rev || sig !== g.lastSig || g.sendT >= 0.25) { g.sendT = 0; g.lastSig = sig; relay(m); ctl.sp = false; ctl.rev = false; }
    }
  }
  if (!game) return;
  for (const f of g.fx) f.t += dt;
  g.fx = g.fx.filter(f => f.t < f.life);
  const me = g.players[g.pid];
  if (me) {
    creditCp(g, true);
    const cd = me.spCd || 0;
    $('spCd').style.height = (cd / SPECIAL_CD * 100) + '%';
    $('spTxt').textContent = cd > 0 ? Math.ceil(cd) : CHARS[me.char].sym;
    btnSp.classList.toggle('ready', cd <= 0 && me.alive);
  }
  // Revive button: only while you're standing next to a downed ally
  const canRev = !!me && me.alive && g.players.some(a => a !== me && !a.alive && !a.gone && Math.hypot(a.x - me.x, a.y - me.y) <= REVIVE_RANGE + 6);
  btnRev.classList.toggle('hidden', !canRev);
  if (netInfo) { if (g.multi) { netInfo.classList.remove('hidden'); const tx = netText(); if (netInfo.textContent !== tx) netInfo.textContent = tx; } else netInfo.classList.add('hidden'); }
}
const netInfo = $('netInfo');
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now; frameDt = dt; if (dt > 0) fpsAvg += (1 / dt - fpsAvg) * 0.05;
  try { update(dt); } catch (e) { safe(() => console.error(e)); } // one bad frame must never freeze the game
  try { render(); } catch (e) { safe(() => console.error(e)); }
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
const CHARGE_NAMES = ['', 'smash', 'dash', 'laser', 'cleave', 'pillars', 'fire', 'jumpup', 'jumpdn', 'tpout', 'tpstrike'];
const chargeTotal = k => k === 'smash' ? SMASH.charge : k === 'dash' ? KING.dash.charge : k === 'laser' ? LASER.charge : k === 'cleave' ? KING.cleave.windup : k === 'pillars' ? SORC.windup : k === 'fire' ? CERB.fire.windup : k === 'jumpup' ? CERB.jump.up : k === 'jumpdn' ? CERB.jump.down : k === 'tpout' ? TP.vanish : k === 'tpstrike' ? TP.windup : 1;
function drawPet(c, q) {
  c.save(); c.translate(q.x, q.y);
  if (!q.alive) c.globalAlpha = 0.3;
  c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(0, 3, q.r + 3, q.r - 1, 0, 0, 7); c.fill();
  c.rotate(q.face || 0);
  if (q.type === 'wolf') { // stocky, grey and shaggy: bushy tail, pointed ears, long snout, pale muzzle
    c.fillStyle = '#90a4ae'; c.strokeStyle = '#546e7a'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(-8, -2); c.quadraticCurveTo(-18, -7, -20, 1); c.quadraticCurveTo(-17, 8, -8, 3); c.closePath(); c.fill(); c.stroke();              // bushy tail
    c.fillStyle = '#cfd8dc'; c.beginPath(); c.moveTo(-17, -1); c.quadraticCurveTo(-20, 1, -19, 3); c.quadraticCurveTo(-17, 5, -15, 3); c.closePath(); c.fill(); // pale tail tip
    c.fillStyle = '#78909c'; for (const [lx, ly] of [[5, -7.5], [5, 7.5], [-5, -7.5], [-5, 7.5]]) { c.beginPath(); c.arc(lx, ly, 2.4, 0, 7); c.fill(); }          // paws
    c.fillStyle = '#b0bec5'; c.strokeStyle = '#546e7a'; c.beginPath(); c.ellipse(0, 0, 11.5, 8, 0, 0, 7); c.fill(); c.stroke();                                // body
    c.fillStyle = '#607d8b'; c.beginPath(); c.ellipse(-1, 0, 8, 3.2, 0, 0, 7); c.fill();                                                                       // dark saddle
    c.fillStyle = '#b0bec5'; c.beginPath(); c.arc(9, 0, 6.2, 0, 7); c.fill(); c.stroke();                                                                       // head
    c.fillStyle = '#eceff1'; c.beginPath(); c.ellipse(14.5, 0, 4.6, 2.9, 0, 0, 7); c.fill(); c.stroke();                                                        // long muzzle
    c.fillStyle = '#37474f'; c.beginPath(); c.moveTo(7, -4.5); c.lineTo(4.5, -11.5); c.lineTo(10.5, -6.5); c.closePath(); c.fill();                            // pointed ears
    c.beginPath(); c.moveTo(7, 4.5); c.lineTo(4.5, 11.5); c.lineTo(10.5, 6.5); c.closePath(); c.fill();
    c.fillStyle = '#212121'; c.beginPath(); c.arc(18.6, 0, 1.7, 0, 7); c.fill();                                                                                // nose
    c.fillStyle = '#ffca28'; c.beginPath(); c.arc(10.5, -2.6, 1.2, 0, 7); c.fill(); c.beginPath(); c.arc(10.5, 2.6, 1.2, 0, 7); c.fill();                     // eyes
  } else if (q.type === 'panther') { // sleek, long and low: black coat with a violet sheen, round ears, short muzzle, long curled tail, green eyes
    c.strokeStyle = '#15101c'; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-11, 0); c.bezierCurveTo(-20, 1, -22, -9, -16, -11); c.stroke(); c.lineCap = 'butt';                                               // long curled tail
    c.fillStyle = '#3a2f4d'; c.strokeStyle = '#0a0710'; c.lineWidth = 1.1;
    for (const [lx, ly, s] of [[6, -1, -1], [6, 1, 1], [-7, -1, -1], [-7, 1, 1]]) { c.beginPath(); c.ellipse(lx, ly + s * 6, 4, 2.8, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#5a4a78'; c.beginPath(); c.arc(lx + 2.8, ly + s * 8, 2, 0, 7); c.fill(); c.fillStyle = '#3a2f4d'; } // muscular legs with paws
    c.fillStyle = '#1b1426'; c.strokeStyle = '#0a0710'; c.lineWidth = 1.4; c.beginPath(); c.ellipse(-0.5, 0, 14, 5.2, 0, 0, 7); c.fill(); c.stroke();             // long lean body
    c.fillStyle = 'rgba(140,110,200,.35)'; c.beginPath(); c.ellipse(-1, -1.6, 10, 1.6, 0, 0, 7); c.fill();                                                    // violet sheen along the back
    c.fillStyle = '#1b1426'; c.beginPath(); c.arc(12.5, 0, 5, 0, 7); c.fill(); c.stroke();                                                                      // round head
    c.beginPath(); c.arc(7.2, -4.2, 2.2, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.arc(7.2, 4.2, 2.2, 0, 7); c.fill(); c.stroke();                         // small round ears
    c.fillStyle = '#69f0ae'; c.beginPath(); c.ellipse(14, -2.2, 1.6, 1, 0.5, 0, 7); c.fill(); c.beginPath(); c.ellipse(14, 2.2, 1.6, 1, -0.5, 0, 7); c.fill();   // glowing green eyes
    c.fillStyle = '#f8bbd0'; c.beginPath(); c.arc(17.2, 0, 1, 0, 7); c.fill();                                                                                  // nose
  } else { // turtle
    c.fillStyle = '#81c784'; c.strokeStyle = '#2e7d32'; c.lineWidth = 1;
    for (const [lx, ly] of [[6, -10.5], [6, 10.5], [-7, -10.5], [-7, 10.5]]) { c.beginPath(); c.arc(lx, ly, 3.4, 0, 7); c.fill(); c.stroke(); } // legs: drawn first so the shell covers their inner half (they sit under it)
    c.beginPath(); c.moveTo(-9, -3.4); c.lineTo(-19, 0); c.lineTo(-9, 3.4); c.closePath(); c.fill(); c.stroke();                      // short tail (behind the shell)
    c.beginPath(); c.arc(12, 0, 4.5, 0, 7); c.fill();                                                                              // head
    c.fillStyle = '#2e7d32'; c.strokeStyle = '#1b5e20'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 11, 0, 7); c.fill(); c.stroke(); // shell
    c.strokeStyle = '#66bb6a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-8, 0); c.lineTo(8, 0); c.moveTo(0, -8); c.lineTo(0, 8); c.moveTo(-5, -5); c.lineTo(5, 5); c.moveTo(5, -5); c.lineTo(-5, 5); c.stroke();
    c.fillStyle = '#000'; c.beginPath(); c.arc(14, -1.5, 0.9, 0, 7); c.fill(); c.beginPath(); c.arc(14, 1.5, 0.9, 0, 7); c.fill();
  }
  if (q.hurt > 0 && q.alive) { c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.arc(0, 0, q.r + 3, 0, 7); c.fill(); }
  c.restore();
  if (q.shield > 0) { c.strokeStyle = 'rgba(128,216,255,.9)'; c.lineWidth = 2.5; c.beginPath(); c.arc(q.x, q.y, q.r + 7, 0, 7); c.stroke(); }
  if (q.alive && q.hp < q.maxhp) { c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(q.x - 11, q.y - q.r - 9, 22, 3); c.fillStyle = '#66bb6a'; c.fillRect(q.x - 11, q.y - q.r - 9, 22 * clamp(q.hp / q.maxhp, 0, 1), 3); }
}
function airLift(e) { // Cerberus mid-jump: 0 on the ground .. 1 at the top of the leap
  const kind = e.sk || CHARGE_NAMES[e.skc] || '';
  if (kind === 'jumpup') return Math.sin(clamp(1 - e.ch / CERB.jump.up, 0, 1) * Math.PI);
  if (kind === 'jumpdn') { const u = clamp(e.ch / CERB.jump.down, 0, 1); return u * u; }
  return 0;
}
const LIFT_PX = 80;
const isBossT = e => !!(ENEMIES[e.type] && ENEMIES[e.type].boss);          // bosses are drawn twice as big
function drawEnemy(c, e) {
  if (e.type === 'assassin' && (e.sk || CHARGE_NAMES[e.skc] || '') === 'tpout') return;   // mid-teleport: gone for a moment
  const lift = e.type === 'cerberus' ? airLift(e) : 0;
  if (lift > 0) { // his shadow stays on the floor and travels across the map under him; it shrinks and fades as he climbs
    const sc = 1 - lift * 0.25; c.save(); c.translate(e.x, e.y + 3); c.rotate(e.face || 0); c.fillStyle = `rgba(0,0,0,${0.5 - lift * 0.18})`;
    c.beginPath(); c.ellipse(0, 0, e.r * 3.3 * sc, e.r * 2.2 * sc, 0, 0, 7); c.fill();
    for (const hy of [-1, 0, 1]) { c.beginPath(); c.ellipse(e.r * (hy ? 2.5 : 3.2) * sc, hy * e.r * 1.35 * sc, e.r * 0.8 * sc, e.r * 0.65 * sc, 0, 0, 7); c.fill(); } c.restore(); }
  c.save(); c.translate(e.x, e.y - lift * LIFT_PX); c.rotate(e.face || 0); if (lift > 0) c.scale(1 + lift * 0.18, 1 + lift * 0.18);
  if (lift <= 0) { c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(0, 2, isBossT(e) ? e.r * 2.1 : e.r + 3, isBossT(e) ? e.r * 1.6 : e.r, 0, 0, 7); c.fill(); }
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
  } else if (e.type === 'skeleton') {
    c.strokeStyle = '#8d6e63'; c.lineWidth = 2.5; c.beginPath(); c.arc(10, 0, 12, -1.15, 1.15); c.stroke(); // bow
    c.strokeStyle = '#eee'; c.lineWidth = 1; c.beginPath(); c.moveTo(10 + 12 * Math.cos(-1.15), 12 * Math.sin(-1.15)); c.lineTo(10 + 12 * Math.cos(1.15), 12 * Math.sin(1.15)); c.stroke();
    c.fillStyle = '#cfd8dc'; c.strokeStyle = '#78909c'; c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(-1, 0, 7, 10, 0, 0, 7); c.fill(); c.stroke();            // ribcage / shoulders
    c.strokeStyle = '#78909c'; c.lineWidth = 1; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(-5, i * 3.4); c.lineTo(3, i * 3.4); c.stroke(); }
    c.fillStyle = '#eceff1'; c.strokeStyle = '#78909c'; c.lineWidth = 1.5; c.beginPath(); c.arc(3, 0, 6.5, 0, 7); c.fill(); c.stroke(); // skull
    c.fillStyle = '#212121'; c.beginPath(); c.arc(5.5, -2.4, 1.7, 0, 7); c.fill(); c.beginPath(); c.arc(5.5, 2.4, 1.7, 0, 7); c.fill();
  } else if (e.type === 'voidling') {
    const t = performance.now() / 1000;
    c.fillStyle = 'rgba(120,20,160,.28)'; c.beginPath(); c.arc(0, 0, 15 + Math.sin(t * 4 + e.x) * 2, 0, 7); c.fill();
    c.fillStyle = '#2a0f3d'; c.strokeStyle = '#8e24aa'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 10, 0, 7); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(206,147,216,.8)'; c.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { const a0 = t * 2.5 + i * 2.1; c.beginPath(); c.arc(0, 0, 13, a0, a0 + 1.0); c.stroke(); }
    c.fillStyle = '#ff1744'; c.beginPath(); c.arc(4, 0, 4.2, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(5.2, -0.8, 1.2, 0, 7); c.fill();
  } else if (e.type === 'skeleton_king') {
    c.scale(3.2, 3.2);
    // summon aura: purple glow and the mace held high
    const now = performance.now(), su = e.suAt ? (now - e.suAt) / 1000 : 9;
    if (su < 0.8) { c.fillStyle = `rgba(179,157,219,${0.35 * (1 - su / 0.8)})`; c.beginPath(); c.arc(0, 0, 16 + su * 14, 0, 7); c.fill(); c.strokeStyle = `rgba(206,147,216,${0.8 * (1 - su / 0.8)})`; c.lineWidth = 0.8; c.beginPath(); c.arc(0, 0, 12 + su * 22, 0, 7); c.stroke(); }
    // mace: raised during the wind-up, sweeps across the cone on the hit, then drifts back to rest
    const kind = e.sk || CHARGE_NAMES[e.skc] || '', arc = KING.cleave.arc, sw = e.swAt ? (now - e.swAt) / 1000 : 9;
    let ma = su < 0.8 ? 1.5 * Math.sin(Math.min(1, su / 0.25) * Math.PI / 2) * (su < 0.55 ? 1 : (0.8 - su) / 0.25) : 0;
    if (kind === 'cleave') { const k = clamp(1 - e.ch / (e.cht || chargeTotal('cleave')), 0, 1); ma = arc * 1.15 * (k * k * (3 - 2 * k)); }
    else if (sw < 0.16) ma = arc * 1.15 - 2.3 * arc * (sw / 0.16);
    else if (sw < 0.6) ma = -arc * 1.15 * (1 - (sw - 0.16) / 0.44);
    // tattered red cape trailing behind him
    c.fillStyle = '#8e1b1b'; c.strokeStyle = '#4a0a0a'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(-3, -9); c.lineTo(-12, -11); c.lineTo(-18, -7); c.lineTo(-15, -3.5); c.lineTo(-21, 0); c.lineTo(-16, 3.2); c.lineTo(-19, 7); c.lineTo(-12, 11); c.lineTo(-3, 9); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(40,0,0,.55)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-4, -4); c.lineTo(-16, -5); c.moveTo(-4, 0); c.lineTo(-19, 0); c.moveTo(-4, 4); c.lineTo(-16, 5); c.stroke();
    // dark plate armour with bronze trim and a cold glow underneath
    c.fillStyle = '#3b3340'; c.strokeStyle = '#17121b'; c.lineWidth = 1.4; c.beginPath(); c.ellipse(-1, 0, 8.5, 10.5, 0, 0, 7); c.fill(); c.stroke();
    c.fillStyle = 'rgba(77,208,225,.45)'; c.beginPath(); c.ellipse(1, 0, 3, 6.5, 0, 0, 7); c.fill();
    c.strokeStyle = '#a46a3c'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(-6, -7); c.lineTo(2, -2); c.lineTo(2, 2); c.lineTo(-6, 7); c.stroke();
    // war-mace: held in the cyan-glowing right hand; short haft, bronze flanged head with a spike
    c.save(); c.translate(5, 11); c.rotate(ma);
    c.strokeStyle = '#2d2a2e'; c.lineWidth = 2.6; c.beginPath(); c.moveTo(-4, 0); c.lineTo(21, 0); c.stroke();                                             // haft
    c.strokeStyle = '#6b6068'; c.lineWidth = 1; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(3 + i * 3.5, -1.4); c.lineTo(5 + i * 3.5, 1.4); c.stroke(); } // grip wrap
    c.fillStyle = '#a46a3c'; c.strokeStyle = '#3b2410'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(-4, -1.8); c.lineTo(-8, 0); c.lineTo(-4, 1.8); c.closePath(); c.fill(); c.stroke();                                                  // butt spike
    c.beginPath(); c.moveTo(19, -3.4); c.lineTo(26, -5); c.lineTo(31, -2.6); c.lineTo(31, 2.6); c.lineTo(26, 5); c.lineTo(19, 3.4); c.closePath(); c.fill(); c.stroke(); // head
    c.fillStyle = '#26222a'; for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(21, sd * 3.6); c.lineTo(25, sd * 8.6); c.lineTo(28, sd * 4); c.closePath(); c.fill(); c.stroke(); } // dark side flanges
    c.fillStyle = '#cfd2d6'; c.beginPath(); c.moveTo(31, -1.2); c.lineTo(37, 0); c.lineTo(31, 1.2); c.closePath(); c.fill(); c.stroke();                         // tip spike
    c.fillStyle = '#4dd0e1'; c.beginPath(); c.arc(25.5, 0, 1.3, 0, 7); c.fill();                                                                                   // glow gem
    c.restore();
    // big bronze pauldrons with spikes
    for (const sd of [-1, 1]) { c.fillStyle = '#a46a3c'; c.strokeStyle = '#3b2410'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-5, sd * 14); c.lineTo(-1, sd * 21); c.lineTo(3, sd * 14); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(-1, sd * 11, 6.8, 5.6, 0, 0, 7); c.fill(); c.stroke(); c.strokeStyle = '#d4a060'; c.lineWidth = 0.8; c.beginPath(); c.arc(-1, sd * 11, 3.6, 0, 7); c.stroke(); }
    c.fillStyle = '#4dd0e1'; c.fillStyle = 'rgba(77,208,225,.35)'; c.beginPath(); c.arc(5, 11, 4.6, 0, 7); c.arc(8, -9, 4, 0, 7); c.fill();
    c.fillStyle = '#80deea'; c.beginPath(); c.arc(5, 11, 2.4, 0, 7); c.arc(8, -9, 2.1, 0, 7); c.fill();                                                           // glowing hands
    // helm, long white hair, crown spikes and a skull face with cyan eyes
    c.strokeStyle = '#d9dcdf'; c.lineWidth = 1; for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(0, sd * (3 + i * 1.6)); c.quadraticCurveTo(-6, sd * (4.5 + i * 2), -10 - i, sd * (6 + i * 1.5)); c.stroke(); }
    c.fillStyle = '#e6e2d8'; c.strokeStyle = '#78716a'; c.lineWidth = 1.2; c.beginPath(); c.arc(3.5, 0, 7.4, 0, 7); c.fill(); c.stroke();                               // skull
    c.fillStyle = '#a46a3c'; c.strokeStyle = '#3b2410'; c.lineWidth = 1.2; c.beginPath(); c.arc(0, 0, 5.6, 1.5, 4.78); c.lineTo(2, 0); c.closePath(); c.fill(); c.stroke(); // bronze helm over the back of the head
    for (const a of [2.1, 2.62, 3.14, 3.66, 4.18]) { const ca2 = Math.cos(a), sa2 = Math.sin(a); c.beginPath(); c.moveTo(ca2 * 5.2 - sa2 * 1.2, sa2 * 5.2 + ca2 * 1.2); c.lineTo(ca2 * 10, sa2 * 10); c.lineTo(ca2 * 5.2 + sa2 * 1.2, sa2 * 5.2 - ca2 * 1.2); c.closePath(); c.fill(); c.stroke(); } // crown spikes
    c.fillStyle = '#d4a060'; c.beginPath(); c.moveTo(-3, -0.7); c.lineTo(4, -0.5); c.lineTo(6, 0); c.lineTo(4, 0.5); c.lineTo(-3, 0.7); c.closePath(); c.fill();     // central crest blade
    c.fillStyle = '#1b161d'; c.beginPath(); c.ellipse(8, 0, 1.6, 2.6, 0, 0, 7); c.fill();                                                                         // jaw shadow
    c.fillStyle = 'rgba(77,208,225,.55)'; c.beginPath(); c.arc(7, -2.6, 2.6, 0, 7); c.arc(7, 2.6, 2.6, 0, 7); c.fill();
    c.fillStyle = '#b2ebf2'; c.beginPath(); c.arc(7, -2.6, 1.3, 0, 7); c.arc(7, 2.6, 1.3, 0, 7); c.fill();                                                        // glowing eyes
    c.scale(1 / 3.2, 1 / 3.2);
  } else if (e.type === 'sorcerer') { // hooded fire mage: crimson robe, glowing eyes, staff with a flame orb
    const casting = e.ch > 0 || e.al;
    c.strokeStyle = '#5d4037'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(4, 9); c.lineTo(19, 9); c.stroke();                                                 // staff
    const pulse = 1 + (e.ch > 0 ? 0.5 : 0.12) * Math.sin((e.x + performance.now() / 90) % 6.28);
    c.fillStyle = 'rgba(255,112,67,.35)'; c.beginPath(); c.arc(21, 9, 7.5 * pulse, 0, 7); c.fill();
    c.fillStyle = '#ff7043'; c.beginPath(); c.arc(21, 9, 4, 0, 7); c.fill(); c.fillStyle = '#ffee58'; c.beginPath(); c.arc(21, 9, 1.8, 0, 7); c.fill();         // flame orb
    c.fillStyle = '#7b1e3a'; c.strokeStyle = '#3d0c1c'; c.lineWidth = 1.6; c.beginPath(); c.ellipse(-1, 0, 8, 11.5, 0, 0, 7); c.fill(); c.stroke();             // robe / shoulders
    c.fillStyle = '#e57373'; c.beginPath(); c.arc(5, 9, 2.4, 0, 7); c.fill();                                                                               // hand on the staff
    c.fillStyle = '#4a1230'; c.strokeStyle = '#240812'; c.beginPath(); c.arc(2, 0, 7, 0, 7); c.fill(); c.stroke();                                          // hood
    c.fillStyle = '#ffab40'; c.beginPath(); c.arc(6, -2.2, 1.4, 0, 7); c.fill(); c.beginPath(); c.arc(6, 2.2, 1.4, 0, 7); c.fill();                          // eyes in the shadow
    c.strokeStyle = '#ffca28'; c.lineWidth = 1; c.beginPath(); c.arc(-1, 0, 10, 2.2, 4.1); c.stroke();                                                     // golden trim
  } else if (e.type === 'hellguard') { // heavy infernal knight: black plate, curled horns, burning visor, halberd; wears a red barrier while locked on
    const now = performance.now(), lk = e.shield > 0, sw = e.swAt ? (now - e.swAt) / 1000 : 9;
    if (lk) { const pr = 1 + 0.12 * Math.sin(now / 110 + e.x); c.fillStyle = 'rgba(255,61,0,.16)'; c.beginPath(); c.arc(0, 0, 17 * pr, 0, 7); c.fill(); }
    c.save(); c.translate(6, 11); if (sw < 0.25) c.rotate(-0.9 * Math.sin(sw / 0.25 * Math.PI));
    c.strokeStyle = '#4e342e'; c.lineWidth = 2.6; c.beginPath(); c.moveTo(-6, 0); c.lineTo(26, 0); c.stroke();                                              // halberd shaft
    c.fillStyle = '#546e7a'; c.strokeStyle = '#1c2429'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(22, 0); c.lineTo(28, -7); c.lineTo(34, -2); c.lineTo(34, 2); c.lineTo(28, 5); c.closePath(); c.fill(); c.stroke(); // axe blade
    c.strokeStyle = '#ff3d00'; c.lineWidth = 1; c.beginPath(); c.moveTo(29, -5.5); c.lineTo(33, -1.5); c.stroke();                                       // glowing edge
    c.restore();
    c.fillStyle = '#2b2d36'; c.strokeStyle = '#0e0f13'; c.lineWidth = 1.8; c.beginPath(); c.ellipse(-1, 0, 8.5, 12, 0, 0, 7); c.fill(); c.stroke();           // breastplate
    c.strokeStyle = 'rgba(255,61,0,.85)'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(-5, -6); c.lineTo(1, 0); c.lineTo(-5, 6); c.stroke();                     // glowing seam
    for (const sy of [-1, 1]) { c.fillStyle = '#3c3f4c'; c.strokeStyle = '#0e0f13'; c.beginPath(); c.arc(1, sy * 10.5, 5, 0, 7); c.fill(); c.stroke();     // pauldrons with spikes
      c.fillStyle = '#b71c1c'; c.beginPath(); c.moveTo(3, sy * 13.5); c.lineTo(7, sy * 17.5); c.lineTo(0, sy * 15.5); c.closePath(); c.fill(); }
    c.fillStyle = '#e57373'; c.beginPath(); c.arc(6, 11, 2.3, 0, 7); c.fill();                                                                              // hand on the haft
    c.fillStyle = '#353845'; c.strokeStyle = '#0e0f13'; c.beginPath(); c.arc(3, 0, 7, 0, 7); c.fill(); c.stroke();                                           // helm
    c.strokeStyle = '#d7ccc8'; c.lineWidth = 2.2; c.lineCap = 'round'; for (const sy of [-1, 1]) { c.beginPath(); c.moveTo(1, sy * 6); c.quadraticCurveTo(7, sy * 14, 14, sy * 11); c.stroke(); } c.lineCap = 'butt'; // curled horns
    c.fillStyle = '#ff1744'; c.fillRect(6.5, -3.2, 3, 6.4); c.fillStyle = '#ffd180'; c.fillRect(7.6, -1.4, 1.2, 2.8);                                        // burning visor slit
  } else if (e.type === 'assassin') { // slim hooded blade-dancer: violet cloak, scarf, twin daggers
    const now = performance.now(), st = (e.sk || CHARGE_NAMES[e.skc] || '') === 'tpstrike', sw = e.swAt ? (now - e.swAt) / 1000 : 9;
    if (st) { c.fillStyle = 'rgba(179,136,255,.22)'; c.beginPath(); c.arc(0, 0, 15 + 2 * Math.sin(now / 50), 0, 7); c.fill(); }
    const wave = Math.sin(now / 120 + e.x * 0.05) * 2.5;
    c.fillStyle = '#4a2a78'; c.strokeStyle = '#1a0d2e'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(-6, -3); c.quadraticCurveTo(-15, -4 + wave, -21, -2 + wave); c.lineTo(-15, 1 + wave); c.quadraticCurveTo(-11, 3, -6, 3); c.closePath(); c.fill(); c.stroke(); // scarf tail
    for (const sy of [-1, 1]) { c.save(); c.translate(7, sy * 8); c.rotate(sy * (st ? -0.2 : 0.35) + (sw < 0.2 ? sy * 0.8 * Math.sin(sw / 0.2 * Math.PI) : 0));
      c.strokeStyle = '#eceff1'; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath(); c.moveTo(-1, 0); c.quadraticCurveTo(5, sy * -1.5, 11, 0); c.stroke();                // curved dagger
      c.strokeStyle = '#7e57c2'; c.lineWidth = 1; c.beginPath(); c.moveTo(-3, 0); c.lineTo(0, 0); c.stroke(); c.lineCap = 'butt'; c.restore(); }
    c.fillStyle = '#2d1b4e'; c.strokeStyle = '#120a1f'; c.lineWidth = 1.6; c.beginPath(); c.ellipse(-1, 0, 6.5, 10, 0, 0, 7); c.fill(); c.stroke();             // cloaked shoulders
    c.fillStyle = '#d7a98d'; for (const sy of [-1, 1]) { c.beginPath(); c.arc(5.5, sy * 7.5, 1.9, 0, 7); c.fill(); }                                          // hands
    c.fillStyle = '#1c1030'; c.strokeStyle = '#0a0612'; c.beginPath(); c.arc(2, 0, 6, 0, 7); c.fill(); c.stroke();                                           // hood
    c.fillStyle = '#7e57c2'; c.fillRect(4.2, -4.2, 2.2, 8.4);                                                                                              // mask band
    c.fillStyle = '#e1bee7'; c.beginPath(); c.arc(5.4, -1.8, 1.1, 0, 7); c.arc(5.4, 1.8, 1.1, 0, 7); c.fill();                                               // glowing eyes
  } else if (e.type === 'cerberus') { // three-headed hound, seen from above
    const tt = performance.now() / 1000 + e.x * 0.01, bs = e.swAt ? (performance.now() - e.swAt) / 1000 : 9, ck = e.sk || CHARGE_NAMES[e.skc] || '';
    c.scale(2.7, 2.7); if (bs < 0.25) c.translate(7 * Math.sin(bs / 0.25 * Math.PI), 0); // bite: lunges forward
    c.lineCap = 'round'; c.lineJoin = 'round';
    const dark = '#2a0b0b', fur = '#4a1311', furHi = '#6b1f17', ember = '#ff6d00', gold = '#d9a300';
    const sway = Math.sin(tt * 2.2);
    c.fillStyle = dark; c.strokeStyle = '#120404'; c.lineWidth = 1.6;
    for (const [lx, ly, la] of [[10, -14, 0.25], [10, 14, -0.25], [-14, -14, -0.15], [-14, 14, 0.15]]) { // paws with claws
      c.beginPath(); c.ellipse(lx, ly, 6.8, 4.4, la, 0, 7); c.fill(); c.stroke();
      c.strokeStyle = '#e8d9c0'; c.lineWidth = 1.1; for (const k of [-1.6, 0, 1.6]) { c.beginPath(); c.moveTo(lx + 5.5, ly + k); c.lineTo(lx + 8.5, ly + k * 1.4); c.stroke(); } c.strokeStyle = '#120404'; c.lineWidth = 1.6; }
    c.fillStyle = fur; c.strokeStyle = '#1a0606'; c.lineWidth = 2; c.beginPath(); c.ellipse(-5, 0, 21, 14, 0, 0, 7); c.fill(); c.stroke();      // body
    c.fillStyle = furHi; c.beginPath(); c.ellipse(5, 0, 11, 12, 0, 0, 7); c.fill();                                                             // heavy shoulders
    c.strokeStyle = `rgba(255,109,0,.75)`; c.lineWidth = 1.3; for (const [x1, y1, x2, y2] of [[-10, -8, -4, -3], [-14, 6, -7, 4], [-2, 8, 3, 5], [-18, -2, -12, 0]]) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); } // glowing cracks
    c.fillStyle = '#1c0707'; for (let i = 0; i < 6; i++) { const fx = -20 + i * 5, fl = 5.5 + 1.2 * Math.sin(tt * 6 + i * 1.7); c.beginPath(); c.moveTo(fx - 2.4, 0); c.lineTo(fx + 1, -fl); c.lineTo(fx + 2.4, 0); c.lineTo(fx + 1, fl); c.closePath(); c.fill(); c.fillStyle = ember; c.beginPath(); c.arc(fx + 1, -fl, 1, 0, 7); c.arc(fx + 1, fl, 1, 0, 7); c.fill(); c.fillStyle = '#1c0707'; } // spines, glowing at the tips
    // a dog's tail: thick at the rump, tapering to a tip, held up and wagging
    { const w = 3.2 * Math.sin(tt * 5), tx2 = -37, ty2 = -3 + w * 2.2;
      c.strokeStyle = '#1a0606'; c.lineWidth = 7.4; c.beginPath(); c.moveTo(-20, 0); c.quadraticCurveTo(-30, 8 + w, tx2, ty2); c.stroke();
      c.strokeStyle = fur; c.lineWidth = 5.4; c.beginPath(); c.moveTo(-20, 0); c.quadraticCurveTo(-30, 8 + w, tx2, ty2); c.stroke();
      c.strokeStyle = furHi; c.lineWidth = 3; c.beginPath(); c.moveTo(-21, 0); c.quadraticCurveTo(-30, 8 + w, tx2 + 1, ty2); c.stroke(); }
    // three heads on thick necks, each with a spiked gold collar; a chain hangs between the outer two
    const heads = [[28, 0, 9, 0.05 * Math.sin(tt * 2.4)], [17, -20, 7.6, -0.6 + 0.1 * Math.sin(tt * 2)], [17, 20, 7.6, 0.6 - 0.1 * Math.sin(tt * 2 + 1)]]; // [x, y, size, angle]
    for (const [hx, hy] of heads) { c.strokeStyle = '#1a0606'; c.lineWidth = 9.5; c.beginPath(); c.moveTo(6, hy * 0.15); c.lineTo(hx - 4, hy); c.stroke(); c.strokeStyle = fur; c.lineWidth = 7.5; c.beginPath(); c.moveTo(6, hy * 0.15); c.lineTo(hx - 4, hy); c.stroke(); }
    for (const [hx, hy] of heads) { const cx = 6 + (hx - 4 - 6) * 0.55, cy = hy * 0.15 + (hy - hy * 0.15) * 0.55; // collar
      c.strokeStyle = gold; c.lineWidth = 2.4; c.beginPath(); c.moveTo(cx - 1.5, cy - 5.2); c.lineTo(cx + 1.5, cy + 5.2); c.stroke();
      c.fillStyle = '#ffe082'; for (const k of [-4, 0, 4]) { c.beginPath(); c.moveTo(cx + 0.4, cy + k - 1.2); c.lineTo(cx + 4.2, cy + k); c.lineTo(cx + 0.4, cy + k + 1.2); c.fill(); } }
    c.strokeStyle = gold; c.lineWidth = 1.2; c.setLineDash([1.6, 1.6]); c.beginPath(); c.moveTo(13, -9); c.quadraticCurveTo(2, 0, 13, 9); c.stroke(); c.setLineDash([]); // chain across the chest
    for (const [hx, hy, hs, ha] of heads) {
      c.save(); c.translate(hx, hy); c.rotate(ha);
      c.fillStyle = '#3a0e0c'; c.strokeStyle = '#120404'; c.lineWidth = 1.2;
      for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(-hs * 0.1, sd * hs * 0.8); c.lineTo(-hs * 1.0, sd * hs * 1.55); c.lineTo(-hs * 0.85, sd * hs * 0.25); c.closePath(); c.fill(); c.stroke(); } // pointed ears
      c.fillStyle = '#4a0f0c'; c.beginPath(); c.moveTo(hs * 0.2, -hs * 0.35); c.lineTo(hs * 1.7, -hs * 0.5); c.lineTo(hs * 1.9, hs * 0.5); c.lineTo(hs * 0.2, hs * 0.35); c.closePath(); c.fill();                // open lower jaw
      c.fillStyle = '#ff8f00'; c.beginPath(); c.ellipse(hs * 1.1, 0, hs * 0.65, hs * 0.3, 0, 0, 7); c.fill();                                                                                         // fire in the throat
      c.fillStyle = furHi; c.strokeStyle = '#1a0606'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, hs, 0, 7); c.fill(); c.stroke();                                                                   // skull
      c.fillStyle = '#8a2e22'; c.beginPath(); c.moveTo(hs * 0.5, -hs * 0.62); c.lineTo(hs * 1.9, -hs * 0.36); c.lineTo(hs * 1.95, -hs * 0.08); c.lineTo(hs * 0.5, 0); c.closePath(); c.fill(); c.stroke();      // upper snout, split by the open mouth
      c.beginPath(); c.moveTo(hs * 0.5, hs * 0.62); c.lineTo(hs * 1.9, hs * 0.36); c.lineTo(hs * 1.95, hs * 0.08); c.lineTo(hs * 0.5, 0); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#111'; c.beginPath(); c.arc(hs * 1.9, -hs * 0.26, hs * 0.17, 0, 7); c.arc(hs * 1.9, hs * 0.26, hs * 0.17, 0, 7); c.fill();                                                          // nose
      c.fillStyle = '#fff'; for (const sd of [-1, 1]) for (const k of [0.95, 1.3, 1.62]) { c.beginPath(); c.moveTo(hs * (k - 0.1), sd * hs * 0.07); c.lineTo(hs * k, sd * hs * 0.3); c.lineTo(hs * (k + 0.1), sd * hs * 0.07); c.fill(); } // fangs along both jaws
      c.fillStyle = 'rgba(255,215,64,.35)'; c.beginPath(); c.arc(hs * 0.3, -hs * 0.45, hs * 0.38, 0, 7); c.arc(hs * 0.3, hs * 0.45, hs * 0.38, 0, 7); c.fill();                                           // eye glow
      c.fillStyle = '#ffd740'; c.beginPath(); c.arc(hs * 0.3, -hs * 0.45, hs * 0.2, 0, 7); c.arc(hs * 0.3, hs * 0.45, hs * 0.2, 0, 7); c.fill();
      c.strokeStyle = '#1a0606'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(hs * 0.05, -hs * 0.8); c.lineTo(hs * 0.65, -hs * 0.58); c.moveTo(hs * 0.05, hs * 0.8); c.lineTo(hs * 0.65, hs * 0.58); c.stroke(); // angry brows
      c.restore();
    }
    if (ck === 'fire') { const fk = clamp(1 - e.ch / (e.cht || CERB.fire.windup), 0, 1); for (const [hx, hy, hs, ha] of heads) { const fx = hx + Math.cos(ha) * hs * 1.9, fy = hy + Math.sin(ha) * hs * 1.9; c.fillStyle = `rgba(255,150,0,${0.35 + 0.4 * fk})`; c.beginPath(); c.arc(fx, fy, hs * (0.35 + 0.6 * fk), 0, 7); c.fill(); c.fillStyle = `rgba(255,238,88,${0.9 * fk})`; c.beginPath(); c.arc(fx, fy, hs * 0.3 * fk, 0, 7); c.fill(); } } // fire gathers in the mouths
    c.lineCap = 'butt';
    c.scale(1 / 2.7, 1 / 2.7);
  } else {
    c.scale(3, 3);
    const kind = e.sk || CHARGE_NAMES[e.skc] || '', sw = e.swAt ? (performance.now() - e.swAt) / 1000 : 9;
    let ca = 0, lift = 0; // club angle: raised high while the smash charges, slammed down on the hit, then back to rest
    if (kind === 'smash') { const k = clamp(1 - e.ch / (e.cht || chargeTotal('smash')), 0, 1); ca = -2.0 * (k * k * (3 - 2 * k)); lift = k; }
    else if (sw < 0.14) { ca = -2.0 + 2.5 * (sw / 0.14); lift = 1 - sw / 0.14; }
    else if (sw < 0.5) ca = 0.5 * (1 - (sw - 0.14) / 0.36);
    if (lift > 0) { c.fillStyle = `rgba(255,255,255,${0.12 * lift})`; c.beginPath(); c.arc(0, 0, 16 + lift * 4, 0, 7); c.fill(); }
    // a hunched mountain of mossy stone: broad rocky back, long hairy beard, glowing yellow eyes, and an uprooted tree for a club
    c.fillStyle = '#4f564a'; c.strokeStyle = '#23271f'; c.lineWidth = 2; c.beginPath(); c.ellipse(-2, 0, 15.5, 16.5, 0, 0, 7); c.fill(); c.stroke();                 // hunched back
    for (const [px, py, pr, pc] of [[-8, -7, 5.5, '#646c5d'], [-4, 6, 6, '#3d4338'], [-11, 3, 4.5, '#6b7363'], [0, -9, 4, '#3d4338'], [-6, -1, 3.6, '#4b5245'], [2, 8, 3.4, '#646c5d']]) { c.fillStyle = pc; c.strokeStyle = '#23271f'; c.lineWidth = 1; c.beginPath(); c.arc(px, py, pr, 0, 7); c.fill(); c.stroke(); } // stone plates
    c.fillStyle = 'rgba(96,130,54,.75)'; for (const [px, py, pr] of [[-9, -6, 3], [-3, 8, 2.6], [-12, 2, 2.2], [1, -10, 1.8]]) { c.beginPath(); c.arc(px, py, pr, 0, 7); c.fill(); }          // moss
    c.strokeStyle = '#1f2119'; c.lineWidth = 1; for (let i = 0; i < 12; i++) { const a = 1.7 + i * 0.4, rx = Math.cos(a) * 15.5 - 2, ry = Math.sin(a) * 16.5; c.beginPath(); c.moveTo(rx, ry); c.lineTo(rx + Math.cos(a) * 4, ry + Math.sin(a) * 4); c.stroke(); } // shaggy hair along the back
    c.fillStyle = '#6a7263'; c.strokeStyle = '#23271f'; c.lineWidth = 1.6; c.beginPath(); c.arc(6, -14, 7, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.arc(7, 14, 7, 0, 7); c.fill(); c.stroke(); // shoulders
    c.fillStyle = '#7b8470'; c.beginPath(); c.arc(15, -12, 5.2, 0, 7); c.fill(); c.stroke();                                                                         // left fist
    c.strokeStyle = '#23271f'; c.lineWidth = 0.9; for (const k of [-2, 0, 2]) { c.beginPath(); c.moveTo(17, -12 + k); c.lineTo(19.5, -12 + k * 1.3); c.stroke(); }
    c.save(); c.translate(8, 14); c.rotate(ca);                                                                                                                       // the club
    c.strokeStyle = '#2a2018'; c.lineWidth = 8.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(-2, 0); c.lineTo(26, 0); c.stroke();
    c.strokeStyle = '#5a4630'; c.lineWidth = 6.6; c.beginPath(); c.moveTo(-2, 0); c.lineTo(26, 0); c.stroke();
    c.strokeStyle = '#3a2d1f'; c.lineWidth = 0.9; for (const [x1, y1] of [[2, -2], [8, 1.5], [14, -2.5], [20, 1.5]]) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 + 3, y1 + 1); c.stroke(); } // bark
    c.fillStyle = 'rgba(96,130,54,.8)'; c.beginPath(); c.ellipse(13, -1.6, 4, 1.6, 0, 0, 7); c.fill();
    c.strokeStyle = '#4a3825'; c.lineWidth = 2; for (const [bx, by] of [[34, -9], [38, -3], [37, 5], [33, 10], [30, -11]]) { c.beginPath(); c.moveTo(25, 0); c.lineTo(bx, by); c.stroke(); } // root / branch tangle at the heavy end
    c.lineWidth = 1.2; for (const [bx, by, bx2, by2] of [[34, -9, 38, -12], [38, -3, 42, -4], [37, 5, 41, 8], [33, 10, 35, 14]]) { c.beginPath(); c.moveTo(bx, by); c.lineTo(bx2, by2); c.stroke(); }
    c.lineCap = 'butt'; c.restore();
    c.fillStyle = '#7b8470'; c.strokeStyle = '#23271f'; c.lineWidth = 1.6; c.beginPath(); c.arc(8, 14, 5.2, 0, 7); c.fill(); c.stroke();                           // right fist on the club
    c.fillStyle = '#6f7867'; c.beginPath(); c.moveTo(2, -7); c.lineTo(0, -11.5); c.lineTo(5, -9); c.fill(); c.beginPath(); c.moveTo(2, 7); c.lineTo(0, 11.5); c.lineTo(5, 9); c.fill(); // pointed ears
    c.fillStyle = '#34362c'; c.strokeStyle = '#15160f'; c.lineWidth = 0.8;                                                                                            // long stringy beard hanging forward off the chin
    for (const [by2, bl] of [[-5.5, 8], [-2.8, 12], [0, 15], [2.8, 12], [5.5, 8]]) { c.beginPath(); c.moveTo(8, by2 - 1.8); c.quadraticCurveTo(8 + bl * 0.6, by2 * 1.5, 9 + bl, by2 * 1.2); c.quadraticCurveTo(8 + bl * 0.6, by2 * 1.5 + 2.4, 8, by2 + 1.8); c.closePath(); c.fill(); c.stroke(); }
    c.strokeStyle = '#6b6e60'; c.lineWidth = 0.6; for (const [by2, bl] of [[-3.4, 9], [0, 12], [3.4, 9]]) { c.beginPath(); c.moveTo(9, by2); c.lineTo(8 + bl, by2 * 1.15); c.stroke(); }
    c.fillStyle = '#7b8470'; c.strokeStyle = '#23271f'; c.lineWidth = 1.5; c.beginPath(); c.arc(4, 0, 8.4, 0, 7); c.fill(); c.stroke();                               // head
    c.fillStyle = 'rgba(96,130,54,.8)'; c.beginPath(); c.arc(0.5, -3, 2.4, 0, 7); c.arc(1, 4, 1.8, 0, 7); c.fill();
    c.fillStyle = '#2a2d24'; c.beginPath(); c.moveTo(3, -8.2); c.lineTo(11.5, -5); c.lineTo(11, -2.2); c.lineTo(3, -4.2); c.closePath(); c.fill();                    // heavy brow ridge
    c.beginPath(); c.moveTo(3, 8.2); c.lineTo(11.5, 5); c.lineTo(11, 2.2); c.lineTo(3, 4.2); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,196,0,.45)'; c.beginPath(); c.arc(8.6, -3.3, 3.4, 0, 7); c.arc(8.6, 3.3, 3.4, 0, 7); c.fill();
    c.fillStyle = '#ffd21a'; c.beginPath(); c.arc(8.6, -3.3, 1.7, 0, 7); c.arc(8.6, 3.3, 1.7, 0, 7); c.fill();                                                       // glowing eyes
    c.fillStyle = '#69715f'; c.beginPath(); c.ellipse(13, 0, 3, 2.4, 0, 0, 7); c.fill(); c.stroke();                                                                // big knobbly nose
    c.scale(1 / 3, 1 / 3);
  }
  if (e.hurt > 0) { c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.arc(0, 0, isBossT(e) ? e.r * 3.1 : e.r + 2, 0, 7); c.fill(); }
  c.restore();
  const big = isBossT(e), bw = big ? 84 : e.r * 2 + 6, by = e.y - lift * LIFT_PX - (big ? e.r * 3.4 : e.r + 8);
  c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(e.x - bw / 2, by, bw, 4);
  c.fillStyle = '#e53935'; c.fillRect(e.x - bw / 2, by, bw * clamp(e.hp / e.maxhp, 0, 1), 4);
  if (e.shield > 0) { c.strokeStyle = `rgba(255,112,67,${0.65 + 0.25 * Math.sin(performance.now() / 150 + e.x)})`; c.lineWidth = 2.5; c.beginPath(); c.arc(e.x, e.y, e.r + 7, 0, 7); c.stroke(); }  // barrier ring
  if (e.shield > 0) { c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(e.x - bw / 2, by - 4, bw, 3); c.fillStyle = '#ff7043'; c.fillRect(e.x - bw / 2, by - 4, bw * clamp(e.shield / (e.maxhp * LOCK.barrier), 0, 1), 3); }  // Hellguard barrier
  if (e.al !== undefined ? e.al : e.alert > 0) { // "!" = this enemy has noticed a player
    c.font = 'bold 15px system-ui,sans-serif'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.85)'; c.fillStyle = '#ff5252';
    c.strokeText('!', e.x, by - 3); c.fillText('!', e.x, by - 3);
  }
}

const tileHash = (c, r) => (Math.imul(c + 1, 73856093) ^ Math.imul(r + 1, 19349663)) >>> 0;
function drawWorld(g) {
  const t = g.time || performance.now() / 1000, hell = isHell(g.stage);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const v = g.grid[r][c], x = c * TILE, y = r * TILE;
    if (hell) {
      const h = tileHash(c, r);
      if (v === 1) { // obsidian pillars with glowing lava seams
        ctx.fillStyle = '#1a0f12'; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = '#3d1c1c'; ctx.fillRect(x, y, TILE, 4);
        ctx.fillStyle = '#0c0607'; ctx.fillRect(x, y + TILE - 5, TILE, 5);
        ctx.fillStyle = `rgba(255,${70 + (h % 50)},20,${0.45 + 0.25 * Math.sin(t * 2 + h)})`;
        if (h % 3 === 0) ctx.fillRect(x + 6 + (h % 9), y + 7, 2, TILE - 15); else if (h % 3 === 1) ctx.fillRect(x + 5, y + 10 + (h % 8), TILE - 12, 2);
      } else {
        ctx.fillStyle = (c + r) % 2 ? '#2b1311' : '#2f1613'; ctx.fillRect(x, y, TILE, TILE);
        if (h % 6 === 0) { // cracks of lava
          ctx.strokeStyle = `rgba(255,${80 + (h % 60)},20,${0.5 + 0.25 * Math.sin(t * 2.5 + h)})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x + (h % 11) + 3, y + 2); ctx.lineTo(x + 14 + (h % 7), y + 15); ctx.lineTo(x + 6 + (h % 13), y + TILE - 2); ctx.stroke();
        } else if (h % 29 === 0) { // small pool
          ctx.fillStyle = `rgba(255,${100 + (h % 40)},20,${0.55 + 0.2 * Math.sin(t * 3 + h)})`; ctx.beginPath(); ctx.ellipse(x + 16, y + 17, 10, 6, 0, 0, 7); ctx.fill();
        }
      }
      continue;
    }
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
    ctx.fillStyle = hell ? '#4a1410' : '#6d4c2f'; ctx.fillRect(dx, dy, TILE, TILE);
    ctx.strokeStyle = hell ? '#ff6d00' : '#3e2a18'; ctx.lineWidth = 2; ctx.strokeRect(dx + 2, dy + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = hell ? '#ff5722' : '#ffd54f'; ctx.beginPath(); ctx.arc(dx + TILE / 2, dy + TILE / 2, 5, 0, 7); ctx.fill();
  } else {
    const gr = ctx.createRadialGradient(dx + 16, dy + 16, 2, dx + 16, dy + 16, 22 + Math.sin(t * 5) * 3);
    if (hell) { gr.addColorStop(0, '#fff3c4'); gr.addColorStop(0.4, '#ff6d00'); gr.addColorStop(1, 'rgba(200,30,0,0)'); } else { gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.4, '#80deea'); gr.addColorStop(1, 'rgba(0,150,200,0)'); }
    ctx.fillStyle = hell ? '#2a0603' : '#0b1f2a'; ctx.fillRect(dx, dy, TILE, TILE);
    ctx.fillStyle = gr; ctx.fillRect(dx - 8, dy - 8, TILE + 16, TILE + 16);
  }
  if (hell) { // drifting embers over the whole room
    ctx.fillStyle = 'rgba(255,140,40,.8)';
    for (let i = 0; i < 70; i++) { const ex = (i * 977 + Math.sin(t * 0.6 + i) * 24) % W, ey = H - ((t * (14 + i % 9) + i * 131) % H); ctx.globalAlpha = 0.35 + 0.45 * Math.abs(Math.sin(t * 3 + i)); ctx.fillRect(ex, ey, 2, 2); }
    ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(110,0,0,.10)'; ctx.fillRect(0, 0, W, H);
  }
  // pickups
  for (const k of g.pickups) {
    const b = Math.sin(t * 5 + k.id) * 2;
    if (k.kind === 'pot') { // health potion
      ctx.fillStyle = 'rgba(255,82,82,.25)'; ctx.beginPath(); ctx.arc(k.x, k.y + b, 11, 0, 7); ctx.fill();
      ctx.fillStyle = '#e53935'; ctx.strokeStyle = '#7f0000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(k.x, k.y + b + 2, 6, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#cfd8dc'; ctx.fillRect(k.x - 2.5, k.y + b - 8, 5, 5); ctx.strokeRect(k.x - 2.5, k.y + b - 8, 5, 5);
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(k.x - 2, k.y + b, 1.6, 0, 7); ctx.fill();
    } else if (k.kind === 'pp') { // pet point: a pink paw
      ctx.fillStyle = 'rgba(244,143,177,.28)'; ctx.beginPath(); ctx.arc(k.x, k.y + b, 11, 0, 7); ctx.fill();
      ctx.fillStyle = '#f06292'; ctx.strokeStyle = '#880e4f'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(k.x, k.y + b + 2, 5, 4, 0, 0, 7); ctx.fill(); ctx.stroke();
      for (const [ox, oy] of [[-5, -3], [-2, -6], [2, -6], [5, -3]]) { ctx.beginPath(); ctx.arc(k.x + ox, k.y + b + oy, 2, 0, 7); ctx.fill(); ctx.stroke(); }
    } else {
      ctx.fillStyle = 'rgba(255,214,0,.25)'; ctx.beginPath(); ctx.arc(k.x, k.y + b, 10, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffd400'; ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(k.x, k.y + b, 6, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(k.x - 2, k.y + b - 2, 1.8, 0, 7); ctx.fill();
    }
  }
  // skill telegraphs: whatever is about to hit you is drawn on the floor first, so you can move out of it
  for (const e of g.enemies) if (e.ch > 0) {
    const kind = e.sk || CHARGE_NAMES[e.skc] || '', tot = e.cht || chargeTotal(kind) || 1, k = clamp(1 - e.ch / tot, 0, 1);
    ctx.save();
    if (kind === 'smash') {
      ctx.fillStyle = 'rgba(229,57,53,.14)'; ctx.beginPath(); ctx.arc(e.x, e.y, SMASH.r, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(229,57,53,.30)'; ctx.beginPath(); ctx.arc(e.x, e.y, SMASH.r * k, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,82,82,.9)'; ctx.lineWidth = 3; ctx.setLineDash([10, 7]); ctx.beginPath(); ctx.arc(e.x, e.y, SMASH.r, 0, 7); ctx.stroke();
    } else if (kind === 'cleave') {
      const a = e.face || 0;
      ctx.fillStyle = 'rgba(229,57,53,.16)'; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.arc(e.x, e.y, KING.cleave.r, a - KING.cleave.arc, a + KING.cleave.arc); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(229,57,53,.32)'; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.arc(e.x, e.y, KING.cleave.r * k, a - KING.cleave.arc, a + KING.cleave.arc); ctx.closePath(); ctx.fill();
    } else if (kind === 'dash') {
      const a = e.face || 0, len = KING.dash.range, w = e.r + 10;
      ctx.translate(e.x, e.y); ctx.rotate(a);
      ctx.fillStyle = 'rgba(229,57,53,.14)'; ctx.fillRect(0, -w, len, w * 2);
      ctx.fillStyle = 'rgba(229,57,53,.32)'; ctx.fillRect(0, -w, len * k, w * 2);
      ctx.strokeStyle = 'rgba(255,82,82,.9)'; ctx.lineWidth = 2; ctx.strokeRect(0, -w, len, w * 2);
    } else if (kind === 'laser') {
      const a = e.face || 0, len = LASER.range;
      ctx.strokeStyle = `rgba(255,23,68,${0.25 + 0.55 * k})`; ctx.lineWidth = 1 + 3 * k; ctx.setLineDash(k > 0.7 ? [] : [12, 8]);
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(a) * len, e.y + Math.sin(a) * len); ctx.stroke();
    } else if (kind === 'tpstrike') { // Assassin has landed: this circle is where it is about to strike
      ctx.fillStyle = 'rgba(229,57,53,.14)'; ctx.beginPath(); ctx.arc(e.x, e.y, TP.r, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(229,57,53,.34)'; ctx.beginPath(); ctx.arc(e.x, e.y, TP.r * k, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,82,82,.95)'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.arc(e.x, e.y, TP.r, 0, 7); ctx.stroke();
    } else if (kind === 'pillars') { // the three spots where fire is about to rise
      for (const p of pillarSpots(e)) {
        ctx.fillStyle = `rgba(255,112,67,${0.08 + 0.22 * k})`; ctx.beginPath(); ctx.arc(p.x, p.y, SORC.r, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(255,171,64,.9)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.arc(p.x, p.y, SORC.r, 0, 7); ctx.stroke();
      }
    } else if (kind === 'fire') { // Cerberus lines up three shots
      const a = e.face || 0;
      ctx.strokeStyle = `rgba(255,145,0,${0.2 + 0.5 * k})`; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
      for (let h = -1; h <= 1; h++) { ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(a + h * CERB.fire.spread) * 230, e.y + Math.sin(a + h * CERB.fire.spread) * 230); ctx.stroke(); }
    } else if (kind === 'jumpup' && e.land) { // flight: the landing zone is marked on the floor where he will come down
      ctx.fillStyle = 'rgba(229,57,53,.14)'; ctx.beginPath(); ctx.arc(e.land.x, e.land.y, CERB.jump.r, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(229,57,53,.32)'; ctx.beginPath(); ctx.arc(e.land.x, e.land.y, CERB.jump.r * k, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,82,82,.95)'; ctx.lineWidth = 3; ctx.setLineDash([10, 7]); ctx.beginPath(); ctx.arc(e.land.x, e.land.y, CERB.jump.r, 0, 7); ctx.stroke();
    } else if (kind === 'jumpdn') { // landing zone
      ctx.fillStyle = 'rgba(229,57,53,.14)'; ctx.beginPath(); ctx.arc(e.x, e.y, CERB.jump.r, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(229,57,53,.32)'; ctx.beginPath(); ctx.arc(e.x, e.y, CERB.jump.r * k, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,82,82,.95)'; ctx.lineWidth = 3; ctx.setLineDash([10, 7]); ctx.beginPath(); ctx.arc(e.x, e.y, CERB.jump.r, 0, 7); ctx.stroke();
    }
    ctx.restore();
  }
  // enemies + players sorted by y
  const ents = [];
  g.enemies.forEach(e => ents.push({ y: e.y, f: () => drawEnemy(ctx, e) }));
  g.pets.forEach(q => ents.push({ y: q.y, f: () => { drawPet(ctx, q); if (!q.alive && q.respT > 0) { ctx.font = 'bold 12px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.fillStyle = '#fff'; const tx = Math.ceil(q.respT) + 's'; ctx.strokeText(tx, q.x, q.y - 14); ctx.fillText(tx, q.x, q.y - 14); } } }));
  g.players.forEach(p => {
    if (p.gone) return;
    ents.push({ y: p.y, f: () => {
      if (p.char === 'healer' && p.alive && p.id === g.pid && (p.spCd || 0) <= 0 && g.players.length > 1) { // show where the healing ray reaches
        ctx.strokeStyle = 'rgba(105,240,174,.35)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(p.x, p.y, HEAL_RANGE, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.globalAlpha = p.alive ? 1 : 0.3;
      drawChar(ctx, p.char, p.x, p.y, p.face, 1, p.hurt > 0 && p.alive);
      ctx.globalAlpha = 1;
      if (p.shield > 0) { ctx.strokeStyle = 'rgba(128,216,255,.9)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 9, 0, 7); ctx.stroke(); }
      if (!p.alive && p.revP > 0) { // revive progress
        const bw = 36; ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(p.x - bw / 2 - 1, p.y - 38, bw + 2, 7);
        ctx.fillStyle = '#69f0ae'; ctx.fillRect(p.x - bw / 2, p.y - 37, bw * p.revP, 5);
      }
      ctx.font = 'bold 11px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.fillStyle = '#fff';
      ctx.strokeText(p.name, p.x, p.y - 20); ctx.fillText(p.name, p.x, p.y - 20);
    } });
  });
  ents.sort((a, b) => a.y - b.y).forEach(o => o.f());
  // projectiles
  for (const j of g.proj) {
    const a = j.ang !== undefined ? j.ang : Math.atan2(j.vy, j.vx);
    if (j.kind === 'arrow') { // enemy arrow
      ctx.save(); ctx.translate(j.x, j.y); ctx.rotate(a);
      ctx.strokeStyle = '#d7ccc8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(7, 0); ctx.stroke();
      ctx.fillStyle = '#ff7043'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(5, -3.5); ctx.lineTo(5, 3.5); ctx.fill();
      ctx.strokeStyle = '#ef9a9a'; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-12, -3); ctx.moveTo(-9, 0); ctx.lineTo(-12, 3); ctx.stroke();
      ctx.restore(); continue;
    }
    if (j.kind === 'fireball') { // Cerberus: a bouncing ball of fire with a short trail
      for (let i = 3; i >= 1; i--) { ctx.fillStyle = `rgba(255,109,0,${0.12 * (4 - i)})`; ctx.beginPath(); ctx.arc(j.x - Math.cos(a) * i * 6, j.y - Math.sin(a) * i * 6, 8 - i, 0, 7); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,110,30,.35)'; ctx.beginPath(); ctx.arc(j.x, j.y, 12, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff6d00'; ctx.beginPath(); ctx.arc(j.x, j.y, 7, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffee58'; ctx.beginPath(); ctx.arc(j.x, j.y, 3.5, 0, 7); ctx.fill();
      continue;
    }
    if (j.kind === 'mage') { // Mage: a blazing fireball with a flickering tail, a bit bigger than the healer's bolt
      const t = performance.now() / 70 + j.x * 0.05;
      for (let i = 4; i >= 1; i--) { ctx.fillStyle = `rgba(255,${90 + i * 25},20,${0.13 * (5 - i)})`; ctx.beginPath(); ctx.arc(j.x - Math.cos(a) * i * 6.5, j.y - Math.sin(a) * i * 6.5, 9 - i * 1.3 + Math.sin(t + i) * 0.8, 0, 7); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,110,30,.35)'; ctx.beginPath(); ctx.arc(j.x, j.y, 13 + Math.sin(t) * 1.2, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff6d00'; ctx.beginPath(); ctx.arc(j.x, j.y, 8, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffca28'; ctx.beginPath(); ctx.arc(j.x + Math.cos(a) * 1.5, j.y + Math.sin(a) * 1.5, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#fffde7'; ctx.beginPath(); ctx.arc(j.x + Math.cos(a) * 2, j.y + Math.sin(a) * 2, 2.4, 0, 7); ctx.fill();
      continue;
    }
    const col = '#1b8a3a'; // Healer: dark green bolt
    ctx.fillStyle = col + '66'; ctx.beginPath(); ctx.arc(j.x - Math.cos(a) * 6, j.y - Math.sin(a) * 6, 6, 0, 7); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(j.x, j.y, 4.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#7bd88f'; ctx.beginPath(); ctx.arc(j.x, j.y, 1.8, 0, 7); ctx.fill();
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
      case 'smash':
        ctx.globalAlpha = 1 - k; ctx.fillStyle = '#ff8a65'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.3 + 0.7 * Math.min(1, k * 3)), 0, 7); ctx.fill();
        ctx.globalAlpha = 1 - k * 0.7; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * Math.min(1, 0.4 + k * 2), 0, 7); ctx.stroke(); break;
      case 'howl':
        ctx.globalAlpha = (1 - k) * 0.8; ctx.strokeStyle = '#e1f5fe'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.2 + 0.8 * k), 0, 7); ctx.stroke();
        ctx.globalAlpha = (1 - k) * 0.25; ctx.fillStyle = '#b3e5fc'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.2 + 0.8 * k), 0, 7); ctx.fill(); break;
      case 'barrier':
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#80d8ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(f.x, f.y, 12 + k * 14, 0, 7); ctx.stroke(); break;
      case 'laser':
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ff1744'; ctx.lineWidth = 8 * (1 - k) + 2; ctx.shadowColor = '#ff1744'; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke(); break;
      case 'cleave':
        ctx.globalAlpha = (1 - k) * 0.7; ctx.fillStyle = '#ffccbc'; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.arc(f.x, f.y, f.r, f.a - f.arc, f.a + f.arc); ctx.closePath(); ctx.fill(); break;
      case 'bash': { // a boss's melee hit: impact star where it lands
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        for (let i = 0; i < 8; i++) { const a = i * 0.785 + f.a, r0 = 6 + k * 8, r1 = 14 + k * 16; ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * r0, f.y + Math.sin(a) * r0); ctx.lineTo(f.x + Math.cos(a) * r1, f.y + Math.sin(a) * r1); ctx.stroke(); }
        ctx.fillStyle = '#ffab91'; ctx.beginPath(); ctx.arc(f.x, f.y, 10 * (1 - k * 0.5), 0, 7); ctx.fill(); break; }
      case 'dust': // the Skeleton King's charge kicks up dust behind him
        ctx.globalAlpha = (1 - k) * 0.55; ctx.fillStyle = '#b0a79b'; ctx.beginPath(); ctx.arc(f.x, f.y, 10 + k * 22, 0, 7); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.globalAlpha = (1 - k) * 0.5; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - Math.cos(f.a) * 40, f.y - Math.sin(f.a) * 40); ctx.stroke(); break;
      case 'summon':
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#b39ddb'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(f.x, f.y, 20 + k * 70, 0, 7); ctx.stroke(); break;
      case 'pillar': { // Sorcerer's pillar of fire: a warning ring until it is its turn, then flames rise
        const d = f.d || 0;
        if (f.t < d) {
          ctx.globalAlpha = 0.5 + 0.4 * Math.sin(f.t * 22); ctx.strokeStyle = '#ffab40'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
          ctx.beginPath(); ctx.arc(f.x, f.y, SORC.r, 0, 7); ctx.stroke(); break;
        }
        const u = clamp((f.t - d) / Math.max(0.01, f.life - d), 0, 1), h = 86 * Math.min(1, u * 6) * (1 - u * 0.45), al = 1 - u * u;
        ctx.globalAlpha = al * 0.5; ctx.fillStyle = '#ff6d00'; ctx.beginPath(); ctx.arc(f.x, f.y, SORC.r * (0.8 + 0.25 * Math.sin(f.t * 30)), 0, 7); ctx.fill();
        ctx.globalAlpha = al;
        for (const [w, col, hm] of [[13, '#ff5722', 1], [9, '#ff9800', 0.82], [5, '#ffeb3b', 0.6]]) {
          ctx.fillStyle = col;
          for (let i = -1; i <= 1; i++) {
            const ox = i * w * 0.9, jit = Math.sin(f.t * 40 + i * 2) * 3, hh = h * hm * (i === 0 ? 1 : 0.72);
            ctx.beginPath(); ctx.moveTo(f.x + ox - w, f.y); ctx.quadraticCurveTo(f.x + ox - w * 0.9, f.y - hh * 0.55, f.x + ox + jit, f.y - hh); ctx.quadraticCurveTo(f.x + ox + w * 0.9, f.y - hh * 0.55, f.x + ox + w, f.y); ctx.closePath(); ctx.fill();
          }
        }
        break;
      }
      case 'door':
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#80deea'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(f.x, f.y, 10 + k * 40, 0, 7); ctx.stroke(); break;
      case 'txt':
        ctx.globalAlpha = 1 - k * k; ctx.font = 'bold 14px system-ui,sans-serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.fillStyle = f.c || '#fff';
        ctx.strokeText(f.s, f.x, f.y - k * 26); ctx.fillText(f.s, f.x, f.y - k * 26);
        if (f.ic) { const im = iconImg(f.ic), w = ctx.measureText(f.s).width; if (im.complete && im.naturalWidth) ctx.drawImage(im, f.x + w / 2 + 3, f.y - k * 26 - 13, 16, 16); }
        break;
    }
    ctx.restore();
  }
}
function drawHUD(g, hw, hh, portrait) { // hw/hh: size of the area the HUD is laid out in
  const troll = g.enemies.find(e => ENEMIES[e.type].boss);
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)';
  if (!portrait) { // landscape: stage title + objective centred at the top of the room (portrait draws them in the bottom-left corner instead)
    ctx.textAlign = 'center'; ctx.font = 'bold 22px system-ui,sans-serif'; ctx.fillStyle = '#fff';
    const title = `Stage ${g.stage}-${g.level}`;
    ctx.strokeText(title, hw / 2, 28); ctx.fillText(title, hw / 2, 28);
    ctx.font = '13px system-ui,sans-serif';
    const [sub, col] = objective(g, troll);
    ctx.fillStyle = col; ctx.strokeText(sub, hw / 2, 46); ctx.fillText(sub, hw / 2, 46);
  }
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
  { // points collected so far this run (shared by both players)
    const y = 12 + g.players.length * 34 + 8;
    ctx.font = 'bold 13px system-ui,sans-serif'; ctx.fillStyle = '#ffd54f'; ctx.textAlign = 'left';
    const parts = [{ t: `🟡 CP ${g.teamCp || 0}   ` }, { ic: 'paw' }, { t: ` PP ${g.teamPp || 0}   ` }, { ic: 'gold' }, { t: ` ${g.teamGold || 0}` }];
    if (g.lootBy && (g.lootBy[g.pid] || []).length) parts.push({ t: '   ' }, { ic: 'gear' }, { t: ` ${g.lootBy[g.pid].length}` });
    let hx = 12; for (const q of parts) { if (q.ic) { const im = iconImg(q.ic); if (im.complete && im.naturalWidth) ctx.drawImage(im, hx, y - 3, 15, 15); hx += 17; } else { ctx.strokeText(q.t, hx, y + 10); ctx.fillText(q.t, hx, y + 10); hx += ctx.measureText(q.t).width; } }
  }
  if (g.isHost && g.multi) for (const p of g.players) if (p.away && !p.gone) {
    const y = 12 + g.players.length * 34 + 30; ctx.font = 'bold 12px system-ui,sans-serif'; ctx.fillStyle = '#ffab91'; ctx.textAlign = 'left';
    const txt = `⚠ ${p.name} disconnected — waiting (${Math.max(0, Math.ceil(REJOIN_MS / 1000 - (g.awayT || 0)))}s)`; ctx.strokeText(txt, 12, y); ctx.fillText(txt, 12, y);
  }
  if (troll && !portrait) {
    const bw = Math.min(300, hw - 24), x = hw / 2 - bw / 2;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x, 54, bw, 10);
    ctx.fillStyle = '#c62828'; ctx.fillRect(x, 54, bw * clamp(troll.hp / troll.maxhp, 0, 1), 10);
  }
  if (g.banner) {
    const b = g.banner, a = b.t < 0.3 ? b.t / 0.3 : b.t > 1.7 ? Math.max(0, (2.2 - b.t) / 0.5) : 1;
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.font = `bold ${Math.min(44, Math.floor(hw / Math.max(9, b.text.length * 0.64)))}px system-ui,sans-serif`;
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.fillStyle = '#ffd54f';
    ctx.strokeText(b.text, hw / 2, hh / 2 - 20); ctx.fillText(b.text, hw / 2, hh / 2 - 20); ctx.restore();
  }
}
function objective(g, troll) {
  if (g.door.open) return ['The door is open!', '#80deea'];
  if (troll) return [`BOSS FIGHT — defeat the ${ENEMIES[troll.type].name}!`, '#ff8a80'];
  return [`Defeat all enemies to open the door (${g.enemies.length} left)`, '#cfd8ff'];
}
// Portrait: stage + objective live in the dark strip below the room, bottom-left, opposite the attack/special buttons.
function drawInfoPanel(g, top, ih) {
  const troll = g.enemies.find(e => ENEMIES[e.type].boss);
  const right = (() => { let l = Infinity; for (const b of [btnAtk, btnSp, btnRev]) { const r = typeof b.getBoundingClientRect === 'function' ? b.getBoundingClientRect() : null; if (r && r.width) l = Math.min(l, r.left); } return innerWidth; })();
  const x = 14, maxW = Math.max(120, right - x - 12);
  ctx.save(); ctx.textAlign = 'left'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)';
  const [sub, col] = objective(g, troll);
  // wrap the objective to the free width (never overlaps the buttons)
  const words = sub.split(' '), lines = []; let cur = '';
  ctx.font = '15px system-ui,sans-serif';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  lines.push(cur);
  const th = 26 + lines.length * 20 + (troll ? 18 : 0);
  let y = top + Math.max(18, (ih - top - th) / 2) + 22;
  ctx.font = 'bold 24px system-ui,sans-serif'; ctx.fillStyle = '#fff';
  const title = `Stage ${g.stage}-${g.level}`; ctx.strokeText(title, x, y); ctx.fillText(title, x, y);
  ctx.font = '15px system-ui,sans-serif'; ctx.fillStyle = col;
  for (const ln of lines) { y += 20; ctx.strokeText(ln, x, y); ctx.fillText(ln, x, y); }
  if (troll) { y += 10; ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x, y, maxW, 10); ctx.fillStyle = '#c62828'; ctx.fillRect(x, y, maxW * clamp(troll.hp / troll.maxhp, 0, 1), 10); }
  ctx.restore();
}
function drawJoystick() {
  if (!joy.active) return;
  let dx = joy.x - joy.ox, dy = joy.y - joy.oy; const l = Math.hypot(dx, dy);
  if (l > JR) { dx = dx / l * JR; dy = dy / l * JR; }
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(joy.ox, joy.oy, JR, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(joy.ox + dx, joy.oy + dy, 26, 0, 7); ctx.fill();
}
const PORTRAIT_VIEW_W = 520; // world px visible across the screen width in portrait; the camera follows the player
function controlsReserve() { // landscape: CSS px on the right edge occupied by the attack/special buttons
  if (!game || game.over) return 0;
  let left = Infinity;
  for (const b of [btnAtk, btnSp]) {
    const r = typeof b.getBoundingClientRect === 'function' ? b.getBoundingClientRect() : null;
    if (r && r.width) left = Math.min(left, r.left);
  }
  return isFinite(left) ? Math.max(0, innerWidth - left + 8) : 110;
}
const PORTRAIT_STRIP = 84, PORTRAIT_ZOOM_MAX = 1.25; // portrait: a slim strip at the bottom for the stage text; the buttons float over the room, higher up the screen
function bottomReserve() { return !game || game.over ? 0 : PORTRAIT_STRIP; }
// Where the room goes on screen. world -> CSS px is x*s+tx. Landscape shows the whole room left of the buttons;
// portrait zooms in across the screen width (room above the buttons) and follows the local player.
function layout(g) {
  const iw = innerWidth, ih = innerHeight;
  if (ih > iw) {
    const sw = iw / (W <= PORTRAIT_VIEW_W + 40 ? W : PORTRAIT_VIEW_W); // a portrait room fits the width exactly; a wide one is zoomed
    const s = Math.min(Math.max(sw, (ih - bottomReserve()) / H), sw * PORTRAIT_ZOOM_MAX);  // ...then zoomed in a little more (up to 25%) so the room fills the taller play area; the camera follows the player sideways
    const vh = Math.max(120, Math.min(H * s, ih - bottomReserve()));
    const vw = iw / s, vhw = vh / s;
    const me = g && g.players[g.pid];
    const px = me ? me.x : W / 2, py = me ? me.y : H / 2;
    const camX = vw >= W ? (W - vw) / 2 : clamp(px - vw / 2, 0, W - vw);
    const camY = vhw >= H ? (H - vhw) / 2 : clamp(py - vhw / 2, 0, H - vhw);
    return { portrait: true, s, camX, camY, ox: 0, oy: 0, tx: -camX * s, ty: -camY * s, clip: { x: 0, y: 0, w: iw, h: vh } };
  }
  const R = controlsReserve();
  const vw = Math.min(W, W >= H ? VIEW_W : VIEW_H), vh = Math.min(H, W >= H ? VIEW_H : VIEW_W); // rooms bigger than the normal view scroll with the player
  const s = Math.max(0.1, Math.min((iw - R) / vw, ih / vh));
  const ox = Math.max(0, Math.min((iw - vw * s) / 2, iw - R - vw * s)), oy = (ih - vh * s) / 2;
  const me = g && g.players[g.pid], px = me ? me.x : W / 2, py = me ? me.y : H / 2;
  const camX = vw >= W ? 0 : clamp(px - vw / 2, 0, W - vw), camY = vh >= H ? 0 : clamp(py - vh / 2, 0, H - vh);
  return { portrait: false, s, camX, camY, ox, oy, vw, vh, tx: ox - camX * s, ty: oy - camY * s, clip: { x: ox, y: oy, w: vw * s, h: vh * s } };
}
let frameDt = 1 / 60;
function drawDoorArrow(g, L, tx, ty) { // the exit is off-screen in a big room: point the way
  if (!g.door.open) return;
  const cx = (g.door.c + 0.5) * TILE * L.s + tx, cy = (g.door.r + 0.5) * TILE * L.s + ty, k = L.clip, m = 26;
  if (cx >= k.x && cx <= k.x + k.w && cy >= k.y && cy <= k.y + k.h) return;
  const mx = k.x + k.w / 2, my = k.y + k.h / 2, a = Math.atan2(cy - my, cx - mx);
  const f = Math.min((k.w / 2 - m) / (Math.abs(Math.cos(a)) || 1e-6), (k.h / 2 - m) / (Math.abs(Math.sin(a)) || 1e-6));
  ctx.save(); ctx.translate(mx + Math.cos(a) * f, my + Math.sin(a) * f); ctx.rotate(a);
  ctx.fillStyle = isHell(g.stage) ? '#ff6d00' : '#80deea'; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, -12); ctx.lineTo(-4, 0); ctx.lineTo(-10, 12); ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.restore();
}
function render() {
  const g0 = game;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = g0 && g0.grid && isHell(g0.stage) ? '#140707' : '#0d0f16'; ctx.fillRect(0, 0, cv.width, cv.height);
  const g = game; if (!g || !g.grid) return;
  const L = layout(g);
  if (!g.cam) g.cam = { x: L.camX, y: L.camY }; // glide the camera after the player instead of snapping
  else { const k = 1 - Math.exp(-frameDt * 12); g.cam.x += (L.camX - g.cam.x) * k; g.cam.y += (L.camY - g.cam.y) * k; }
  const tx = L.ox - g.cam.x * L.s, ty = L.oy - g.cam.y * L.s;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.beginPath(); ctx.rect(L.clip.x, L.clip.y, L.clip.w, L.clip.h); ctx.clip();
  ctx.setTransform(L.s * dpr, 0, 0, L.s * dpr, tx * dpr, ty * dpr);
  drawWorld(g);
  if (L.portrait) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawHUD(g, L.clip.w, L.clip.h, true); } // HUD stays put, normal text size
  else { ctx.setTransform(L.s * dpr, 0, 0, L.s * dpr, L.ox * dpr, L.oy * dpr); drawHUD(g, L.vw, L.vh); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawDoorArrow(g, L, tx, ty);
  ctx.restore();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (L.portrait && !g.over) drawInfoPanel(g, L.clip.h, innerHeight);
  drawJoystick();
}

// ---------------- menus ----------------
function updateMenu() {
  applyGates();
  $('menuName').textContent = profile.name;
  $('menuCp').textContent = profile.cp;
  $('menuGold').textContent = profile.gold; $('menuPp').textContent = profile.pp;
  $('menuVer').textContent = 'v' + GAME_VERSION;
  applyLock();
  $('menuBest').textContent = `${profile.best.stage}-${profile.best.level}`;
}
// portraits are drawn at 3x (shown at 120 CSS px) so they stay sharp on phones and high-DPI screens
const PORTRAIT_K = 3, PORTRAIT_PX = 120 * PORTRAIT_K;
// one stat's row of point options in a horizontal line: +1, +5, Max, or type an amount and press OK. dk = 'c' (character) or 'p' (pet)
const openSpend = {};   // which stat's point options are showing on a card: 'c:warrior' -> 'atk' | 'hp'
function toggleSpend(dk, key, stat) { const id = dk + ':' + key; openSpend[id] = openSpend[id] === stat ? '' : stat; }
function spendRows(dk, key, avail, icon) { // two buttons, "+ ATK" and "+ HP"; tapping one opens its options in a horizontal line: +1, +5, Max, or type an amount and press OK
  const cur = openSpend[dk + ':' + key] || '', dis = avail < 1 ? 'disabled' : '', d5 = avail < 5 ? 'disabled' : '';
  const tog = (stat, label) => `<button data-act="open" data-${dk}="${key}" data-s="${stat}" class="${cur === stat ? 'on' : ''}">${label}</button>`;
  const opts = !cur ? '' : `<div class="po">
    <button data-act="spend" data-${dk}="${key}" data-s="${cur}" data-n="1" ${dis}>+1</button>
    <button data-act="spend" data-${dk}="${key}" data-s="${cur}" data-n="5" ${d5}>+5</button>
    <button data-act="spend" data-${dk}="${key}" data-s="${cur}" data-n="max" ${dis}>Max</button>
    <input class="amt" type="number" inputmode="numeric" min="1" step="1" placeholder="#" aria-label="amount" ${dis}>
    <button data-act="spend" data-${dk}="${key}" data-s="${cur}" data-n="in" ${dis}>OK</button></div>
    <span class="pl"><small>${icon} ${cur === 'atk' ? '+1 ATK' : '+5 HP'} per point</small></span>`;
  return `<div class="pts"><div class="po tog">${tog('atk', '+ ATK')}${tog('hp', '+ HP')}</div>${opts}</div>`;
}
function spendAmount(b, pool) { // how many points a spend button means: 1, 5, all of them, or what was typed next to it
  const n = b.dataset.n;
  if (n === 'max') return profile[pool];
  if (n === 'in') { const inp = b.parentElement.querySelector('input'); return Math.max(0, parseInt(inp && inp.value, 10) || 0); }
  return +n || 0;
}
function spendPoints(pool, up, stat, n) { // moves up to n points from the pool into ATK or HP; returns how many were spent
  n = Math.min(Math.max(0, n | 0), profile[pool]);
  if (n < 1 || !up || (stat !== 'atk' && stat !== 'hp')) return 0;
  profile[pool] -= n; up[stat] += n; return n;
}
function enterToSpend(e) { if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('amt')) { const ok = e.target.parentElement.querySelector('button[data-n="in"]'); if (ok) ok.click(); } }
let charView = '', petView = '', shopView = '';     // the tile whose details are showing under the grid
function ptile(key, viewed, chosen, name, tag, stats, btn, paint) { // one big tile: portrait, name, tag, stats and the action button; tapping the tile shows its details
  const t = document.createElement('div'); t.className = 'ptile' + (chosen ? ' sel' : '') + (viewed ? ' view' : ''); t.dataset.act = 'pick'; t.dataset.k = key;
  t.innerHTML = `<canvas width="${PORTRAIT_PX}" height="${PORTRAIT_PX}"></canvas><h3>${name}</h3><div class="tagrow">${tag || '&nbsp;'}</div><div class="stats">${stats}</div><div class="lact">${btn}</div>`;
  const c2 = t.querySelector('canvas').getContext('2d'); paint(c2); return t;
}
function pgrid(box, tiles, detailHtml) { // grid of tiles with a detail panel under it
  box.innerHTML = ''; box.className = 'pgrid';
  const g = document.createElement('div'); g.className = 'pg2'; tiles.forEach(t => g.appendChild(t)); box.appendChild(g);
  if (detailHtml) { const d = document.createElement('div'); d.className = 'pdetail'; d.innerHTML = detailHtml; box.appendChild(d); }
}
function renderChars() {
  $('cpCount').textContent = profile.cp;
  const keys = Object.keys(CHARS); if (!CHARS[charView]) charView = profile.sel;
  const tiles = keys.map(key => {
    const def = CHARS[key], st = statsFor(key), chosen = profile.sel === key;
    return ptile(key, charView === key, chosen, def.name, '', `ATK <b>${st.atk}</b> · HP <b>${st.hp}</b>`, `<button data-act="sel" data-c="${key}" ${chosen ? 'disabled' : ''}>${chosen ? 'Selected' : 'Select'}</button>`,
      c2 => { c2.fillStyle = '#232838'; c2.fillRect(0, 0, PORTRAIT_PX, PORTRAIT_PX); c2.save(); c2.scale(PORTRAIT_K, PORTRAIT_K); drawChar(c2, key, 44, 62, 0, 1.8, false); c2.restore(); });
  });
  const v = CHARS[charView];
  pgrid($('charCards'), tiles, `<h3>${v.name}</h3><div class="desc">${v.desc}</div>${profile.up[charView] ? spendRows('c', charView, profile.cp, '🟡') : ''}`);
}
$('charCards').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) { const t = e.target.closest('.ptile'); if (t) { charView = t.dataset.k; renderChars(); } return; }
  if (b.disabled) return;
  const c = b.dataset.c;
  if (b.dataset.act === 'open') { toggleSpend('c', c, b.dataset.s); renderChars(); return; }
  if (b.dataset.act === 'sel') { profile.sel = c; charView = c; }
  else if (b.dataset.act === 'spend' && profile.up[c]) spendPoints('cp', profile.up[c], b.dataset.s, spendAmount(b, 'cp'));
  saveProfile(); renderChars();
});
$('charCards').addEventListener('keydown', enterToSpend);
// ---- pets, equipment & shop ----
const PET_KEYS = Object.keys(PETS);
const SHOW_TIER = t => `<span class="tier" style="color:${TIER_COLORS[t]}">${TIERS[t]}</span>`;
function petTile(key, mode, viewed) { // mode: 'pets' (equip + upgrade) or 'shop' (buy)
  const d = PETS[key], owned = profile.pets.includes(key), st = petStatsFor(key), on = mode === 'pets' && profile.pet === key;
  let btn;
  if (mode === 'shop') btn = owned ? `<button disabled>Owned</button>` : `<button data-act="buy" data-p="${key}" ${profile.gold < d.price ? 'disabled' : ''}>Buy · ${ic('gold')} ${d.price.toLocaleString()}</button>`;
  else if (!owned) btn = `<button disabled>Not owned</button>`;
  else btn = on ? `<button data-act="unsel" data-p="${key}">Equipped</button>` : `<button data-act="sel" data-p="${key}">Equip</button>`;
  return ptile(key, viewed, on, d.name, `<span class="tag ${d.kind.toLowerCase()}">${d.kind}</span>`, `ATK <b>${st.atk}</b> · HP <b>${st.hp}</b>`, btn,
    c2 => { c2.fillStyle = '#4a5275'; c2.fillRect(0, 0, PORTRAIT_PX, PORTRAIT_PX); c2.save(); c2.scale(PORTRAIT_K, PORTRAIT_K); c2.translate(60, 62); c2.scale(2.3, 2.3); drawPet(c2, { x: 0, y: 0, face: 0, r: d.r, type: key, alive: true, hurt: 0, shield: 0 }); c2.restore(); });
}
const petDetail = (key, spend) => `<h3>${PETS[key].name} <span class="tag ${PETS[key].kind.toLowerCase()}">${PETS[key].kind}</span></h3><div class="desc">${PETS[key].ability}</div>${spend ? spendRows('p', key, profile.pp, ic('paw')) : ''}`;
function renderPets() {
  $('petPp').textContent = profile.pp;
  if (!PETS[petView]) petView = profile.pet || PET_KEYS[0];
  pgrid($('petCards'), PET_KEYS.map(k => petTile(k, 'pets', petView === k)), petDetail(petView, profile.pets.includes(petView)));
}
function gearRow(key, tier, count, buttons) { // one line of an equipment list
  const d = EQUIP[key], row = document.createElement('div'); row.className = 'gear';
  row.innerHTML = `<span class="gi gt${tier}" style="--tc:${TIER_BORDER[tier]}">${gearIc(key, tier)}</span><span class="gt"><b>${d.name}</b> ${SHOW_TIER(tier)}${count > 1 ? ` ×${count}` : ''}<br><small>${SLOTS[d.slot]} · ${equipText(key, tier)}</small></span><span class="gb">${buttons}</span>`;
  return row;
}
const gearTile = (key, tier, count, sel, attrs, label, act) => `<button type="button" class="gtile${sel ? ' sel' : ''}${key ? ' gt' + tier : ' empty'}" style="--tc:${key ? TIER_BORDER[tier] : '#3b4278'}" data-act="${act}" ${attrs}>${key ? `<span class="gic">${gearIc(key, tier)}</span><span class="gtier" style="color:${TIER_COLORS[tier]}">${TIERS[tier]}</span>${count > 1 ? `<span class="gcnt">×${count}</span>` : ''}${act === 'sell-pick' && attrs.includes('data-s=') ? '<span class="geq">EQUIPPED</span>' : ''}` : `<span class="gic">·</span><span class="gtier">${label}</span>`}</button>`;;
function renderGear() { // Equipment screen: equipped slots, inventory, equip / merge
  const box = $('gearBox'); box.innerHTML = '';
  const b = gearBonus(profile.eq);
  $('gearSummary').textContent = `Bonuses: +${b.atk} ATK · +${b.hp} HP` + (b.dr ? ` · ${Math.round(b.dr * 100)}% less damage` : '') + (b.spd ? ` · ${Math.round(b.spd * 100)}% faster` : '') + (b.vamp ? ` · heal ${pctOf(b.vamp)}% max HP per kill` : '');
  // equipped slots: three big tiles; inventory: a grid of tiles (one per item + rarity); tap a tile to see it and its buttons
  const tile = (key, tier, count, sel, attrs, label) => gearTile(key, tier, count, sel, attrs, label, 'pick');
  if (gearSel && !(gearSel.s ? profile.eq[gearSel.s] : (profile.inv[gearSel.k] && profile.inv[gearSel.k][gearSel.t] > 0))) gearSel = null; // what was selected is gone (equipped, merged ...)
  const h1 = document.createElement('h3'); h1.textContent = 'Equipped'; box.appendChild(h1);
  const eqg = document.createElement('div'); eqg.className = 'ggrid three';
  eqg.innerHTML = Object.keys(SLOTS).map(sl => { const it = profile.eq[sl]; return it ? tile(it.k, it.t, 1, gearSel && gearSel.s === sl, `data-s="${sl}"`) : tile(null, 0, 0, false, 'disabled', SLOTS[sl]); }).join('');
  box.appendChild(eqg);
  const det = document.createElement('div'); det.className = 'gdetail'; box.appendChild(det); // the selected piece and its buttons, right under the equipped slots
  let pairs = 0; for (const key of EQUIP_KEYS) { const r = profile.inv[key]; if (r) for (let t = 0; t < MERGE_TOP; t++) pairs += Math.floor(r[t] / MERGE_N); }
  const hd = document.createElement('div'); hd.className = 'gearhead';
  hd.innerHTML = `<h3>Inventory · ${MERGE_N} identical pieces merge up</h3><button data-act="merge-all" ${pairs ? '' : 'disabled'}>Merge all${pairs ? ` (${pairs})` : ''}</button>`; box.appendChild(hd);
  const fl = document.createElement('div'); fl.className = 'tabs subtabs gfilter';
  fl.innerHTML = [['all', 'All'], ...Object.entries(SLOTS)].map(([k, n]) => `<button type="button" data-act="filter" data-f="${k}" class="${gearFilter === k ? 'on' : ''}">${n}</button>`).join(''); box.appendChild(fl);
  const inv = [];
  for (const key of EQUIP_KEYS) { if (gearFilter !== 'all' && EQUIP[key].slot !== gearFilter) continue; const r = profile.inv[key]; if (r) for (let t = TIERS.length - 1; t >= 0; t--) if (r[t]) inv.push([key, t, r[t]]); }
  inv.sort((a, b) => b[1] - a[1]);
  if (!inv.length) { const e = document.createElement('p'); e.className = 'sub'; e.textContent = gearFilter !== 'all' && Object.keys(profile.inv).length ? `No ${SLOTS[gearFilter].toLowerCase()} pieces yet.` : 'Nothing here yet. Buy a chest in the Shop, or defeat a boss for a random piece.'; box.appendChild(e); }
  else { const g = document.createElement('div'); g.className = 'ggrid'; g.innerHTML = inv.map(([k, t, n]) => tile(k, t, n, gearSel && !gearSel.s && gearSel.k === k && gearSel.t === t, `data-k="${k}" data-t="${t}"`)).join(''); box.appendChild(g); }
  if (!gearSel) det.innerHTML = '<small>Tap a piece to see it</small>';
  else if (gearSel.s) { const it = profile.eq[gearSel.s]; det.appendChild(gearRow(it.k, it.t, 1, `<button data-act="unequip" data-s="${gearSel.s}">Unequip</button>`)); }
  else { const { k, t } = gearSel, n = profile.inv[k][t], merge = t < MERGE_TOP && !EQUIP[k].doom ? `<button data-act="merge" data-k="${k}" data-t="${t}" ${n < MERGE_N ? 'disabled' : ''}>Merge ${MERGE_N} → ${TIERS[t + 1]}</button>` : ''; det.appendChild(gearRow(k, t, n, `<button data-act="equip" data-k="${k}" data-t="${t}">Equip</button>${merge}`)); }
}
let gearFilter = 'all'; // inventory filter: all | head | body | weapon
let gearSel = null; // { k, t } a piece in the inventory, or { s } an equipped slot
let shopTab = 'pets', shopSub = 'buy', chestResult = null, chestOdds = false, sellSel = null;
function renderShop() {
  applyGates();
  $('shopGold').textContent = profile.gold;
  $('tabEquip').classList.toggle('on', shopTab === 'equip'); $('tabPets').classList.toggle('on', shopTab === 'pets');
  $('subTabs').classList.toggle('hidden', shopTab !== 'equip');
  $('subBuy').classList.toggle('on', shopSub === 'buy'); $('subSell').classList.toggle('on', shopSub === 'sell');
  const box = $('shopCards'); box.innerHTML = '';
  if (shopTab === 'pets') {
    const avail = PET_KEYS.filter(k => !profile.pets.includes(k));
    if (!avail.length) { box.className = 'list'; const e = document.createElement('p'); e.className = 'sub'; e.textContent = 'No available pets.'; box.appendChild(e); return; }
    if (!avail.includes(shopView)) shopView = avail[0];
    pgrid(box, avail.map(k => petTile(k, 'shop', shopView === k)), petDetail(shopView, false));
    return;
  }
  box.className = 'list';
  if (shopSub === 'buy') { // Buy: the chests, on their own screen
    if (chestResult) { // what the last chest contained
      const r = document.createElement('div'); r.className = 'chestres';
      r.innerHTML = `<b>${chestResult.name} opened!</b>` + chestResult.items.map(it => `<div>${gearIc(it.k, it.t, 'gimg sm')} ${EQUIP[it.k].name} ${SHOW_TIER(it.t)} <small>${equipText(it.k, it.t)}</small></div>`).join('');
      box.appendChild(r);
    }
    const cp = chestProgress(), lv = cp.lv, price = chestPrice(lv), od = CHEST.odds[lv - 1], pct = cp.need ? Math.round(cp.have / cp.need * 100) : 100;
    const card = document.createElement('div'); card.className = 'chestcard' + (chestOdds ? ' open' : '');
    card.innerHTML = `<button type="button" class="chesticon" data-act="chest-odds" aria-label="Show the chances">${chestSVG(lv, { size: 150, uid: 's' })}</button>
      <div class="cname">${CHEST.name} · Level ${lv}${lv >= CHEST_MAX ? ' (max)' : ''}</div>
      <div class="cbar"><i style="width:${pct}%"></i><span>${cp.need ? `${cp.have} / ${cp.need}` : 'MAX'}</span></div>
      ${chestOdds ? `<div class="codds">${TIERS.map((n, t) => od[t] > 0 ? `<div><span style="color:${TIER_COLORS[t]}">● ${n}</span><b>${+(od[t] * 100).toFixed(1)}%</b></div>` : '').join('')}</div>` : '<div class="chint">Tap the chest to see the chances</div>'}
      <button class="chestbuy" data-act="buy-chest" ${profile.gold < price ? 'disabled' : ''}>Buy · ${ic('gold')} ${price.toLocaleString()}</button>`;
    box.appendChild(card);
    return;
  }
  // Sell: everything you own as a grid (equipped slots first); tap a piece, then sell it
  const items = [];
  for (const sl of Object.keys(SLOTS)) { const it = profile.eq[sl]; if (it) items.push({ k: it.k, t: it.t, n: 1, s: sl }); }
  for (const key of EQUIP_KEYS) { const r = profile.inv[key]; if (r) for (let t = TIERS.length - 1; t >= 0; t--) if (r[t]) items.push({ k: key, t, n: r[t] }); }
  const same = (a, b) => a && b && (a.s || '') === (b.s || '') && a.k === b.k && a.t === b.t;
  if (sellSel && !items.some(i => same(i, sellSel))) sellSel = null;
  if (!items.length) { const e = document.createElement('p'); e.className = 'sub'; e.textContent = 'You have no equipment to sell.'; box.appendChild(e); return; }
  const det = document.createElement('div'); det.className = 'gdetail';
  if (!sellSel) det.innerHTML = '<small>Tap a piece to sell it</small>';
  else { const i = sellSel, price = sellPrice(i.k, i.t); det.appendChild(gearRow(i.k, i.t, i.s ? 1 : i.n, i.s ? `<small>equipped</small><button data-act="sell-eq" data-s="${i.s}">Sell · ${ic('gold')} ${price.toLocaleString()}</button>` : `<button data-act="sell" data-k="${i.k}" data-t="${i.t}">Sell · ${ic('gold')} ${price.toLocaleString()}</button>`)); }
  box.appendChild(det);
  const g = document.createElement('div'); g.className = 'ggrid';
  g.innerHTML = items.map(i => gearTile(i.k, i.t, i.n, same(i, sellSel), `data-k="${i.k}" data-t="${i.t}"${i.s ? ` data-s="${i.s}"` : ''}`, '', 'sell-pick') + '').join(''); box.appendChild(g);
}
$('petCards').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) { const t = e.target.closest('.ptile'); if (t) { petView = t.dataset.k; renderPets(); } return; }
  if (b.disabled) return;
  const k = b.dataset.p;
  if (b.dataset.act === 'open') { toggleSpend('p', k, b.dataset.s); renderPets(); return; }
  if (b.dataset.act === 'sel' && profile.pets.includes(k)) { profile.pet = k; petView = k; }
  else if (b.dataset.act === 'unsel') profile.pet = '';
  else if (b.dataset.act === 'spend' && profile.pets.includes(k)) spendPoints('pp', profile.petUp[k], b.dataset.s, spendAmount(b, 'pp'));
  saveProfile(); renderPets();
});
$('petCards').addEventListener('keydown', enterToSpend);
$('shopCards').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) { const t = e.target.closest('.ptile'); if (t) { shopView = t.dataset.k; renderShop(); } return; }
  if (b.disabled) return;
  if (b.dataset.act === 'buy') {
    const k = b.dataset.p, d = PETS[k];
    if (!d || profile.pets.includes(k) || profile.gold < d.price) return;
    profile.gold -= d.price; profile.pets.push(k); if (!profile.pet) profile.pet = k;
    saveProfile(); renderShop(); toast(`${d.name} bought!`);
  } else if (b.dataset.act === 'chest-odds') { chestOdds = !chestOdds; renderShop(); }
  else if (b.dataset.act === 'buy-chest') { const lv0 = chestLevel(), items = buyChest(); if (items) { chestResult = { name: CHEST.name, items }; renderShop(); if (chestLevel() > lv0) toast(`Chest leveled up to ${chestLevel()}!`); } }
  else if (b.dataset.act === 'sell-pick') { sellSel = { k: b.dataset.k, t: +b.dataset.t, s: b.dataset.s || '' }; renderShop(); }
  else if (b.dataset.act === 'sell-eq') { const p = sellEquipped(b.dataset.s); sellSel = null; if (p) { renderShop(); toast(`Sold for ${p} gold`); } }
  else if (b.dataset.act === 'sell') { const k = b.dataset.k, t = +b.dataset.t, p = sellPrice(k, t); if (sellGear(k, t)) { if (!profile.inv[k] || !profile.inv[k][t]) sellSel = null; renderShop(); toast(`Sold for ${p} gold`); } }
});
$('gearBox').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  const a = b.dataset.act;
  if (a === 'filter') { gearFilter = b.dataset.f; }
  else if (a === 'pick') { gearSel = b.dataset.s ? { s: b.dataset.s } : { k: b.dataset.k, t: +b.dataset.t }; }
  else if (a === 'equip') { equipGear(b.dataset.k, +b.dataset.t); gearSel = null; }
  else if (a === 'unequip') { unequipGear(b.dataset.s); gearSel = null; }
  else if (a === 'merge-all') { const n = mergeAllGear(); if (n) toast(n > 1 ? `${n} merges done!` : 'Merged!'); }
  else if (a === 'merge') { if (mergeGear(b.dataset.k, +b.dataset.t)) toast(`Merged into ${TIERS[+b.dataset.t + 1]} ${EQUIP[b.dataset.k].name}!`); }
  renderGear();
});
$('tabEquip').addEventListener('click', () => { shopTab = 'equip'; chestResult = null; renderShop(); });
$('subBuy').addEventListener('click', () => { shopSub = 'buy'; renderShop(); });
$('subSell').addEventListener('click', () => { shopSub = 'sell'; chestResult = null; renderShop(); });
$('tabPets').addEventListener('click', () => { shopTab = 'pets'; renderShop(); });
const openPets = () => { renderPets(); show('scrPets'); };
$('btnPets').addEventListener('click', openPets);
const openShop = () => { renderShop(); show('scrShop'); };
$('btnSettings').addEventListener('click', () => show('scrSettings'));
$('btnSound').addEventListener('click', () => toast('Sound settings are coming soon'));
$('btnPrivacy').addEventListener('click', () => toast('Privacy Policy is coming soon'));
$('btnDev').addEventListener('click', () => { // testing panel, behind a code; remove before release
  const c = prompt('Enter developer code'); if (c === null) return;
  if (c.trim().toLowerCase() !== 'dev') { toast('Wrong code'); return; }
  renderDev(); show('scrDev');
});
function renderDev() { $('devBest').textContent = `${profile.best.stage}-${profile.best.level}`; $('devStage').value = profile.best.stage; }
$('btnDevStage').addEventListener('click', () => { const n = Math.max(1, Math.min(999, Math.floor(+$('devStage').value) || 1)); profile.best = { stage: n, level: 1 }; saveProfile(); renderDev(); toast(`Best stage set to ${n}-1`); });
$('btnDevCp').addEventListener('click', () => { profile.cp += 50; saveProfile(); updateMenu(); toast('+50 Character Points'); });
$('btnDevPp').addEventListener('click', () => { profile.pp += 50; saveProfile(); updateMenu(); toast('+50 Pet Points'); });
$('btnDevGold').addEventListener('click', () => { profile.gold += 10000; saveProfile(); updateMenu(); toast('+10000 Gold'); });
$('btnSaveData').addEventListener('click', () => { $('saveOut').value = ''; $('saveIn').value = ''; $('saveMsg').textContent = ''; show('scrSave'); });
$('btnExport').addEventListener('click', () => { $('saveOut').value = exportSave(); $('saveMsg').textContent = 'Save code created. Copy it or download it, and keep it somewhere safe.'; });
$('btnCopy').addEventListener('click', async () => {
  if (!$('saveOut').value) $('saveOut').value = exportSave();
  try { await navigator.clipboard.writeText($('saveOut').value); $('saveMsg').textContent = 'Copied! Paste it somewhere safe (notes app, email to yourself).'; }
  catch (e) { $('saveOut').focus(); $('saveOut').select(); $('saveMsg').textContent = 'Select the code above and copy it.'; }
});
$('btnDownload').addEventListener('click', () => {
  if (!$('saveOut').value) $('saveOut').value = exportSave();
  try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([$('saveOut').value], { type: 'text/plain' })); a.download = 'doom-and-dungeons-save.txt'; document.body.appendChild(a); a.click(); a.remove(); $('saveMsg').textContent = 'Downloaded as doom-and-dungeons-save.txt'; }
  catch (e) { $('saveMsg').textContent = 'Could not download. Copy the code instead.'; }
});
$('btnImport').addEventListener('click', () => {
  const r = parseSave($('saveIn').value);
  if (!r.ok) { $('saveMsg').textContent = r.msg; return; }
  const p = r.profile, sum = `${p.name || 'Unnamed'} · best ${p.best.stage}-${p.best.level} · 🟡${p.cp} · PP ${p.pp} · gold ${p.gold}`;
  if (!confirm(`Load this save?\n${sum}\n\nIt REPLACES the progress on this device.`)) return;
  profile = p; if (!profile.friendCode) profile.friendCode = mkFCode(); saveProfile(); updateMenu(); restartPresence(); $('saveIn').value = ''; $('saveMsg').textContent = 'Save loaded: ' + sum;
  toast('Save loaded!');
});
$('btnShop').addEventListener('click', openShop);
const openGear = () => { renderGear(); show('scrGear'); };
$('btnGear').addEventListener('click', openGear);
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
  const to = b.dataset.go;
  if (to === 'scrMenu' && net.sub) { net.sub = false; relay({ k: 'prof', p: myProfileMsg() }); refreshLobby(); return; } // back from customising: return to the lobby and tell the other player
  if (to === 'scrMenu') updateMenu();
  show(to);
}));
const MIN_AGE = 13; // age restriction; keep in step with the wording of the privacy policy / terms
function submitName() {
  const n = $('nameInput').value.trim().replace(/[<>&"'`\u0000-\u001f]/g, '').slice(0, 12), err = m => { $('nameErr').textContent = m; };
  if (!n) { err(''); $('nameInput').focus(); return; }
  if (!$('ageOk').checked) { err(`You must be ${MIN_AGE} or older to play.`); return; }
  if (isBadName(n)) { err('Please choose a friendly name. That one is not allowed.'); $('nameInput').focus(); return; }
  err(''); profile.name = n; profile.ageOk = true; saveProfile(); updateMenu(); afterName();
}
let pendingRoom = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
let pendingFriend = (new URLSearchParams(location.search).get('friend') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
function afterName() { // an invite link (?room=CODE) jumps straight into joining; a friend link (?friend=CODE) sends a friend request
  startPresence();
  if (pendingFriend.length === 6) {
    const c = pendingFriend; pendingFriend = '';
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    openFriends(); const r = addFriend(c); $('fMsg').textContent = r;
  } else if (pendingRoom.length === 5) {
    const c = pendingRoom; pendingRoom = '';
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    $('codeInput').value = c; show('scrMulti'); joinRoom(c);
  } else show('scrMenu');
}
$('btnNameOk').addEventListener('click', submitName);
$('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') submitName(); });
$('menuName').addEventListener('click', () => { $('nameInput').value = profile.name; $('ageOk').checked = !!profile.ageOk; $('nameErr').textContent = ''; show('scrName'); });
$('btnStart').addEventListener('click', () => { if (lastGame()) show('scrMulti'); else show('scrMode'); });
const openChars = () => { renderChars(); show('scrChar'); };
$('btnChar').addEventListener('click', openChars);
function renderStage() {
  const list = soloStages(), rec = list[list.length - 1], box = $('stageBtns'); box.innerHTML = '';
  $('stageBest').textContent = profile.best.stage;
  for (const st of list) {
    const b = document.createElement('button'); b.type = 'button'; b.className = st === rec ? 'rec' : '';
    b.textContent = `Stage ${st}-1` + (st === rec ? ' (recommended)' : '');
    b.addEventListener('click', () => startSingle(st)); box.appendChild(b);
  }
}
$('btnSingle').addEventListener('click', () => { renderStage(); show('scrStage'); });
$('btnMulti').addEventListener('click', () => { $('multiStatus').textContent = ''; show('scrMulti'); });
$('btnFind').addEventListener('click', () => { $('multiStatus').textContent = ''; findGame(); });
$('btnCreate').addEventListener('click', () => { $('multiStatus').textContent = ''; createRoom(); });
$('btnJoin').addEventListener('click', () => {
  const code = $('codeInput').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 5) { $('multiStatus').textContent = 'Enter the 5-character room code.'; return; }
  $('multiStatus').textContent = ''; joinRoom(code);
});
$('btnLobbyStart').addEventListener('click', hostStart);
// customise from inside the lobby: the connection stays open, and the other player sees "customizing…" until you are back
for (const [id, open] of [['lbChar', openChars], ['lbPets', openPets], ['lbGear', openGear], ['lbShop', openShop]]) $(id).addEventListener('click', () => {
  net.sub = true; relay({ k: 'prof', p: myProfileMsg() }); open();
});
onProfileSaved = () => { if (net.sub && net.conn && net.conn.open && !game) relay({ k: 'prof', p: myProfileMsg() }); };
$('btnShare').addEventListener('click', async () => {
  const url = location.origin + location.pathname + '?room=' + lobby.code;
  try { if (navigator.share) { await navigator.share({ title: 'Doom and Dungeons', text: `Join my Doom and Dungeons room (${lobby.code})`, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); toast('Invite link copied!'); } catch (e) { toast(url); }
});
$('btnLobbyLeave').addEventListener('click', () => { closeNet(); $('multiStatus').textContent = ''; show('scrMulti'); });
window.addEventListener('beforeunload', closeNet);
$('btnOverMenu').addEventListener('click', leaveGame);
// ---- in-run menu (the ☰ button): sound, current run details, quit run ----
let pauseTimer = 0;
const fmtTime = t => { t = Math.floor(t); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), sc = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sc).padStart(2, '0'); };
function pmView(v) { for (const id of ['pmMain', 'pmRunBox', 'pmConfirm']) $(id).classList.toggle('hidden', id !== v); if (v === 'pmRunBox') pmStats(); }
function pmStats() {
  const g = game; if (!g) return;
  const rows = [['Mobs defeated', g.kills], ['Bosses killed', g.bossKills], ['Character Points earned', '🟡 ' + g.teamCp]];
  if (unlocked('pets') || g.teamPp) rows.push(['Pet Points earned', ic('paw') + ' ' + g.teamPp]);
  rows.push(['Gold earned', ic('gold') + ' ' + g.teamGold], ['Equipment collected', (g.lootBy[g.pid] || []).length], ['Time in this run', fmtTime(g.runT)]);
  $('pmStats').innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
}
function openPause() { if (!game) return; pauseOpen = true; $('pauseMenu').classList.remove('hidden'); $('pmNote').classList.toggle('hidden', !game.multi); pmView('pmMain'); clearInterval(pauseTimer); pauseTimer = setInterval(() => { if (!$('pmRunBox').classList.contains('hidden')) pmStats(); }, 500); }
function closePause() { pauseOpen = false; clearInterval(pauseTimer); const el = $('pauseMenu'); if (el) el.classList.add('hidden'); }
$('btnQuit').addEventListener('click', openPause);
$('pmClose').addEventListener('click', closePause);
$('pmSound').addEventListener('click', () => toast('Sound settings are coming soon'));
$('pmRun').addEventListener('click', () => pmView('pmRunBox'));
$('pmRunBack').addEventListener('click', () => pmView('pmMain'));
$('pmQuit').addEventListener('click', () => {
  const g = game; $('pmConfirmTxt').textContent = g && g.multi ? (g.isHost ? 'This ends the run for your friend too.' : 'For 5 minutes you can only reconnect to it or leave it for good (Start Game > Multiplayer).') : 'Your progress so far in this run is kept.';
  pmView('pmConfirm');
});
$('pmNo').addEventListener('click', () => pmView('pmMain'));
$('pmYes').addEventListener('click', () => { closePause(); leaveGame(); });
$('btnRejoin').addEventListener('click', rejoinLast);
$('btnRejoinLeave').addEventListener('click', () => {
  if (!confirm('Leave this run for good? You will not be able to rejoin it.')) return;
  if (net.rc) { clearTimeout(net.rc.timer); net.rc = null; } hideReconn(); closeNet(); clearLast(); $('multiStatus').textContent = ''; updateMenu(); show('scrMenu');
});
$('btnReconn').addEventListener('click', () => { if (net.rc) rcAttempt(); });
$('btnReconnLeave').addEventListener('click', () => { if (net.rc) { clearTimeout(net.rc.timer); net.rc = null; } hideReconn(); leaveGame(); });


// ---------------- friends: friend codes, requests, online check and game invites ----------------
// Every player has a permanent friend code (profile.friendCode). While the game is open, a small "presence" peer listens on the free PeerJS matchmaking
// service under that code. Friends are mutual: you add a code, they accept. Only accepted friends can see you online or send you invites.
// This works only while the game is open in the friend's browser (no server of our own, so no offline invites / push notifications).
const FR_MAX = 30, FCODE = /^[A-Z0-9]{6}$/;
const fid = code => PJ_PREFIX + 'f-' + code;
const pres = { p: null, token: 0, state: 'off', tries: 0, timer: 0 }; // state: off | connecting | on | taken
const frStat = {};            // friend code -> 'on' | 'busy' | 'off' | 'chk'
const declined = new Set();   // friend requests turned down this session
const fmQueue = []; let fmTimer = 0;
const fName = n => { n = String(n || '').replace(/[<>&"'`\u0000-\u001f]/g, '').trim().slice(0, 12); return !n || isBadName(n) ? 'Player' : n; };
const findFriend = code => profile.friends.find(f => f.code === code);
const busyNow = () => !!game || !!(net.conn && net.conn.open);
function startPresence() {
  if (typeof Peer === 'undefined' || !profile.friendCode || !profile.name) return;
  if (pres.p && !pres.p.destroyed) { if (pres.p.disconnected) safe(() => pres.p.reconnect()); return; }
  clearTimeout(pres.timer);
  const tk = ++pres.token, p = new Peer(fid(profile.friendCode), PJ_OPTS), cur = () => tk === pres.token && pres.p === p;
  pres.p = p; pres.state = 'connecting'; renderFriendsHead();
  const retry = ms => { clearTimeout(pres.timer); pres.timer = setTimeout(() => { if (tk !== pres.token) return; safe(() => p.destroy()); pres.p = null; startPresence(); }, ms); };
  p.on('open', () => { if (!cur()) return; pres.state = 'on'; pres.tries = 0; renderFriendsHead(); checkT = 0; if (friendsOpen()) checkFriends(); });
  p.on('connection', c => { if (cur()) presConn(c); });
  p.on('disconnected', () => { if (cur()) { pres.state = 'connecting'; renderFriendsHead(); setTimeout(() => { if (cur() && p.disconnected && !p.destroyed) safe(() => p.reconnect()); }, 2000); } });
  p.on('close', () => { if (cur()) { pres.state = 'off'; pres.p = null; renderFriendsHead(); retry(5000); } });
  p.on('error', err => {
    if (!cur()) return; const t = err && err.type;
    if (t === 'peer-unavailable') return; // a friend who is not online: handled by the probe timeouts
    if (t === 'unavailable-id') { pres.state = ++pres.tries > 6 ? 'taken' : 'connecting'; renderFriendsHead(); safe(() => p.destroy()); pres.p = null; retry(pres.tries > 6 ? 30000 : 6000); return; } // old tab still registered, or open on another device
    if (p.disconnected && !p.destroyed) { setTimeout(() => { if (cur() && p.disconnected && !p.destroyed) safe(() => p.reconnect()); }, 3000); return; }
    if (p.destroyed) { pres.state = 'off'; pres.p = null; renderFriendsHead(); retry(10000); }
  });
}
function restartPresence() { pres.token++; clearTimeout(pres.timer); const p = pres.p; pres.p = null; pres.state = 'off'; safe(() => p && p.destroy()); startPresence(); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { startPresence(); if (friendsOpen()) checkFriends(); } });
window.addEventListener('online', () => startPresence());
window.addEventListener('beforeunload', () => safe(() => pres.p && pres.p.destroy())); // frees the friend code at once, so a page reload can claim it again
function presConn(c) {
  const from = String(c.peer || '').startsWith(PJ_PREFIX + 'f-') ? String(c.peer).slice((PJ_PREFIX + 'f-').length) : '';
  const kill = setTimeout(() => safe(() => c.close()), 20000);
  c.on('close', () => clearTimeout(kill));
  c.on('data', d => { if (FCODE.test(from) && d && typeof d === 'object') safe(() => onPresMsg(c, from, d)); });
}
function onPresMsg(c, from, d) {
  const me = fName(profile.name), f = findFriend(from);
  if (d.k === 'ping') { if (f && f.st === 'ok') { c.send({ k: 'pong', name: me, busy: busyNow() }); updFriendName(f, d.name); } } // strangers get no answer at all
  else if (d.k === 'freq') {
    if (f && (f.st === 'ok' || f.st === 'pend')) { if (f.st === 'pend') { f.st = 'ok'; saveProfile(); updFriendName(f, d.name); toast(`${f.name} is now your friend`); renderFriends(); } c.send({ k: 'facc', name: me }); return; }
    if (declined.has(from) || game || profile.friends.length >= FR_MAX || fmQueue.some(q => q.code === from)) return;
    fmQueue.push({ kind: 'req', code: from, name: fName(d.name) }); nextModal();
  }
  else if (d.k === 'facc') { if (f && f.st === 'pend') { f.st = 'ok'; saveProfile(); updFriendName(f, d.name); toast(`${f.name} accepted your friend request`); renderFriends(); } }
  else if (d.k === 'invite') {
    if (!f || f.st !== 'ok' || !/^[A-Z0-9]{5}$/.test(String(d.room))) return;
    if (busyNow() || fmQueue.some(q => q.kind === 'inv')) { c.send({ k: 'ack', busy: true }); return; }
    updFriendName(f, d.name); c.send({ k: 'ack', ok: true });
    fmQueue.push({ kind: 'inv', code: from, name: f.name, room: String(d.room) }); nextModal();
  }
}
function updFriendName(f, n) { if (!n) return; const nn = fName(n); if (f.name !== nn) { f.name = nn; saveProfile(); } }
function nextModal() { // one pop-up at a time: friend requests and game invites
  if (fmTimer || !fmQueue.length || game) return;
  const q = fmQueue[0], inv = q.kind === 'inv';
  $('fmTitle').textContent = inv ? 'Game invite' : 'Friend request';
  $('fmTxt').textContent = inv ? `${q.name} invites you to play together!` : `${q.name} (${q.code}) wants to be your friend.`;
  $('fmYes').textContent = inv ? 'Join game' : 'Accept'; $('fmNo').textContent = inv ? 'Not now' : 'Decline';
  $('fmodal').classList.remove('hidden');
  const t0 = performance.now();
  fmTimer = setInterval(() => { if (game || performance.now() - t0 > 90000) closeModal(true); }, 1000); // never lingers over a run, and an old invite expires
}
function closeModal(drop) { clearInterval(fmTimer); fmTimer = 0; $('fmodal').classList.add('hidden'); const q = fmQueue.shift(); setTimeout(nextModal, 250); return drop ? null : q; }
$('fmNo').addEventListener('click', () => { const q = closeModal(); if (q && q.kind === 'req') declined.add(q.code); });
$('fmYes').addEventListener('click', () => {
  const q = closeModal(); if (!q || game) return;
  if (q.kind === 'req') {
    if (profile.friends.length >= FR_MAX) { toast('Your friend list is full'); return; }
    const f = findFriend(q.code); if (f) { f.st = 'ok'; f.name = q.name; } else profile.friends.push({ code: q.code, name: q.name, st: 'ok' });
    saveProfile(); toast(`${q.name} is now your friend`); probeFriend(findFriend(q.code), { k: 'freq', name: fName(profile.name) }, () => {}); renderFriends();
  } else { if (!needPeer()) return; show('scrMulti'); $('multiStatus').textContent = ''; joinRoom(q.room); }
});
// Send one message to a friend's presence peer and wait briefly for the answer (null = no answer = offline).
function probeFriend(f, msg, done, ms) {
  const p = pres.p; if (!f || !p || p.destroyed || p.disconnected || pres.state !== 'on') return done(null);
  let fin = false, c = null, to = 0;
  const end = r => { if (fin) return; fin = true; clearTimeout(to); safe(() => c && c.close()); done(r); };
  to = setTimeout(() => end(null), ms || 6000);
  try { c = p.connect(fid(f.code), { reliable: true, serialization: 'json' }); } catch (e) { return end(null); }
  c.on('open', () => safe(() => c.send(msg)));
  c.on('data', d => end(d && typeof d === 'object' ? d : null)); c.on('error', () => end(null)); c.on('close', () => end(null));
}
let checkT = 0;
function checkFriends() {
  if (Date.now() - checkT < 2500) return; checkT = Date.now();
  const me = fName(profile.name);
  for (const f of profile.friends.slice()) {
    if (frStat[f.code] === 'chk') continue; frStat[f.code] = 'chk';
    probeFriend(f, f.st === 'pend' ? { k: 'freq', name: me } : { k: 'ping', name: me }, r => {
      if (r && r.k === 'pong' && f.st === 'ok') { frStat[f.code] = r.busy ? 'busy' : 'on'; updFriendName(f, r.name); }
      else if (r && r.k === 'facc' && f.st === 'pend') { f.st = 'ok'; updFriendName(f, r.name); saveProfile(); frStat[f.code] = 'on'; toast(`${f.name} accepted your friend request`); }
      else frStat[f.code] = 'off';
      renderFriends();
    });
  }
  renderFriends();
}
function addFriend(code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!FCODE.test(code)) return 'Friend codes have 6 letters / numbers.';
  if (code === profile.friendCode) return 'That is your own code.';
  if (findFriend(code)) return 'Already on your list.';
  if (profile.friends.length >= FR_MAX) return `Your list is full (${FR_MAX} friends).`;
  profile.friends.push({ code, name: '', st: 'pend' }); saveProfile(); startPresence(); checkT = 0; checkFriends();
  return 'Request sent. They need the game open to see it — it is sent again every time you open this list.';
}
const friendsOpen = () => !$('scrFriends').classList.contains('hidden');
const canInvite = () => !!(net.isHost && lobby.code && !lobby.auto && net.pj && !game);
function renderFriendsHead() {
  if (!friendsOpen()) return;
  $('myFCode').textContent = profile.friendCode || '------';
  $('fPresence').textContent = pres.state === 'on' ? '● Online — friends can see you and invite you' : pres.state === 'taken' ? '○ This friend code is open on another device or tab' : pres.state === 'connecting' ? '… Connecting to the friends service' : '○ Friends service not reachable (retrying)';
  $('fPresence').style.color = pres.state === 'on' ? '#a5d6a7' : '#ffab91';
}
function renderFriends() {
  if (!friendsOpen()) return;
  renderFriendsHead();
  const ul = $('friendList'); ul.innerHTML = ''; const inv = canInvite();
  $('fHint').textContent = inv ? 'Tap Invite on an online friend to send them your room.' : 'Friends who are online show a green dot. To invite one: Start Game > Multiplayer > Create Game Room > Invite.';
  if (!profile.friends.length) { const li = document.createElement('li'); li.className = 'fempty'; li.textContent = 'No friends yet. Share your code or add theirs.'; ul.appendChild(li); return; }
  const rank = f => f.st === 'pend' ? 3 : ({ on: 0, busy: 1, chk: 2, off: 2 })[frStat[f.code]] ?? 2;
  for (const f of profile.friends.slice().sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))) {
    const st = f.st === 'pend' ? 'pend' : (frStat[f.code] || 'off'), li = document.createElement('li');
    const label = { on: 'Online', busy: 'In a game', chk: 'Checking…', off: 'Offline', pend: 'Request sent' }[st];
    const dot = document.createElement('span'); dot.className = 'fdot ' + st; li.appendChild(dot);
    const nm = document.createElement('span'); nm.className = 'fname'; nm.textContent = f.name || f.code; const sm = document.createElement('small'); sm.textContent = label + (f.name ? ' · ' + f.code : ''); nm.appendChild(sm); li.appendChild(nm);
    if (inv && st === 'on') { const b = document.createElement('button'); b.type = 'button'; b.dataset.act = 'invite'; b.dataset.c = f.code; b.textContent = 'Invite'; li.appendChild(b); }
    const x = document.createElement('button'); x.type = 'button'; x.className = 'back fx'; x.dataset.act = 'remove'; x.dataset.c = f.code; x.textContent = '✕'; x.title = 'Remove'; li.appendChild(x);
    ul.appendChild(li);
  }
}
let frTimer = 0;
function openFriends() {
  $('fMsg').textContent = ''; show('scrFriends'); startPresence(); renderFriends(); checkT = 0; checkFriends();
  clearInterval(frTimer); frTimer = setInterval(() => { if (!friendsOpen()) { clearInterval(frTimer); frTimer = 0; return; } checkFriends(); }, 12000);
}
$('btnFriends').addEventListener('click', openFriends);
$('btnInvite').addEventListener('click', () => { net.sub = true; relay({ k: 'prof', p: myProfileMsg() }); openFriends(); });
$('btnFAdd').addEventListener('click', () => { $('fMsg').textContent = addFriend($('fcodeInput').value); if (!/^(Friend codes|That is|Already|Your list)/.test($('fMsg').textContent)) $('fcodeInput').value = ''; renderFriends(); });
$('fcodeInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnFAdd').click(); });
$('btnFRefresh').addEventListener('click', () => { checkT = 0; startPresence(); checkFriends(); });
$('btnFCopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(profile.friendCode); toast('Friend code copied'); } catch (e) { toast(profile.friendCode); } });
$('btnFShare').addEventListener('click', async () => {
  const url = location.origin + location.pathname + '?friend=' + profile.friendCode;
  try { if (navigator.share) { await navigator.share({ title: 'Doom and Dungeons', text: `Add me as a friend in Doom and Dungeons (code ${profile.friendCode})`, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); toast('Friend link copied!'); } catch (e) { toast(url); }
});
$('friendList').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; const f = findFriend(b.dataset.c); if (!f) return;
  if (b.dataset.act === 'remove') { if (!confirm(`Remove ${f.name || f.code} from your friends?`)) return; profile.friends = profile.friends.filter(x => x !== f); saveProfile(); renderFriends(); }
  else if (b.dataset.act === 'invite') {
    if (!canInvite()) { toast('Create a game room first'); return; }
    b.disabled = true; b.textContent = 'Sending…';
    probeFriend(f, { k: 'invite', name: fName(profile.name), room: lobby.code }, r => {
      toast(r && r.ok ? `Invite sent to ${f.name || f.code}` : r && r.busy ? `${f.name || f.code} is busy right now` : `${f.name || f.code} did not answer (offline?)`);
      renderFriends();
    });
  }
});
// ---------------- boot ----------------
fillIcons();
resize();
if (profile.name && profile.ageOk) { updateMenu(); afterName(); } else { $('nameInput').value = profile.name; show('scrName'); }
requestAnimationFrame(frame);
})();
