/* Stratagem Hero: Super Earth Training Simulator
   A Helldivers 2 stratagem-code trainer. One script, no dependencies, no network requests.

   Contents (search for the banner comments):
     STRATAGEM DATA   roster, codes, inline SVG icons
     FLAVOR TEXT      satirical "managed democracy" lines
     AUDIO            Web Audio sound effects
     STORAGE          chrome.storage.local, hd2_* keys (localStorage fallback when run as a plain page)
     ECONOMY          Super Credits, modifiers, boosters, upgrades, Warbond, themes, medals
     GAME LOGIC       difficulties, rounds, scoring, Hellbomb bonus, revive (no DOM)
     UI               screens: menu, loadout, shop, Warbond, stats & medals, themes, Democracy Drop (plinko)
     INPUT / BOOT     keyboard handling and start-up */
(() => {
'use strict';

/* ======================= STRATAGEM DATA ======================= */
const CATEGORIES = {
  mission: { label: 'Mission',   color: '#ffd60a' },   // yellow
  supply:  { label: 'Supply',    color: '#7fd0ff' },   // light blue
  defense: { label: 'Defensive', color: '#ffffff' },   // white
  offense: { label: 'Offensive', color: '#5b9bff' }    // blue
};

/* ---- Icons: every stratagem has its own hand-drawn SVG (48x48 grid, stroke style set in iconSVG) ---- */
const sc = (c, x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">${c}</g>`;   // place + scale a part

// Reusable parts
const FLAME = '<path d="M24 44c-8 0-12-6-9-13 2 3 5 3 4-1-1-6 2-12 7-16 0 6 9 9 9 18 0 7-5 12-11 12z"/>';
const CLOUD = '<path d="M12 36a7 7 0 0 1 0-14 10 10 0 0 1 19-3 8 8 0 0 1 4 17z"/>';
const SHELL = '<path d="M24 4c5 4 7 10 7 16v18H17V20c0-6 2-12 7-16zM17 44h14M17 30h14"/>';
const WING  = '<path d="M24 6l5 9 15 9-15-2-2 9 5 5H16l5-5-2-9-15 2 15-9z"/>';
const BOMB  = '<path d="M24 4c6 0 9 8 9 18s-3 14-9 14-9-4-9-14S18 4 24 4zM17 38l-5 6h24l-5-6"/>';
const GUN   = '<path d="M4 22h28l4-4h8v8h-8l-2 4H20l-2 8h-6l2-8H4z"/>';
const SBASE = '<path d="M10 44l7-11h14l7 11z"/><rect x="16" y="21" width="16" height="12"/>';   // sentry base + head
const WINGS = sc(WING, 12, -2, 0.5);                                                         // small eagle for the top

const ICONS = {
  // Mission
  reinforce: '<path d="M24 3v15M17 10l7-7 7 7"/><circle cx="24" cy="27" r="5"/><path d="M13 45c0-9 4-12 11-12s11 3 11 12"/>',
  resupply:  '<path d="M6 18a18 13 0 0 1 36 0zM6 18l17 13M42 18L25 31"/><rect x="17" y="31" width="14" height="12"/>',
  sos:       '<path d="M24 44V22M14 15a14 14 0 0 1 20 0M7 8a24 24 0 0 1 34 0"/><circle cx="24" cy="21" r="3"/>',
  hellbomb:  '<circle cx="24" cy="27" r="14"/><circle cx="24" cy="27" r="5"/><path d="M24 13V5M19 5h10M10 27H4M44 27h-6"/>',
  upload:    '<rect x="8" y="24" width="32" height="18"/><path d="M8 33h32M24 19V4M16 11l8-8 8 8"/>',
  seismic:   '<path d="M24 3v22M19 25l5 10 5-10zM6 43q4-5 9 0t9 0 9 0 9 0"/>',
  rearm:     '<path d="M40 24a16 16 0 1 1-5-11.5M38 4v9h-9"/><path d="M24 15l5 9-5 9-5-9z"/>',
  flag:      '<path d="M11 5v39M11 7h26l-7 8 7 8H11"/>',

  // Orbital
  precision: '<circle cx="24" cy="31" r="10"/><path d="M24 2v18M24 42v4M9 31H3M45 31h-6M20 8l4 5 4-5"/>',
  airburst:  '<circle cx="24" cy="24" r="6"/><path d="M24 3v9M24 36v9M3 24h9M36 24h9M9 9l7 7M32 32l7 7M39 9l-7 7M16 32l-7 7"/>',
  gatling:   '<path d="M10 3v16M20 3v26M30 3v26M40 3v16M10 27v4M40 27v4M5 43h38"/>',
  gas:       CLOUD + '<circle cx="18" cy="28" r="2"/><circle cx="28" cy="28" r="2"/><path d="M17 41v3M24 41v3M31 41v3"/>',
  ems:       '<circle cx="24" cy="24" r="19"/><path d="M27 7L14 26h10l-3 15 13-20H24z"/>',
  smoke:     CLOUD + '<path d="M10 42q4-3 8 0t8 0t8 0"/>',
  he120:     sc(SHELL, -4, 6, 0.5) + sc(SHELL, 12, 6, 0.5) + sc(SHELL, 28, 6, 0.5) + '<path d="M4 40h40"/>',
  walking:   '<circle cx="10" cy="34" r="5"/><circle cx="24" cy="24" r="5"/><circle cx="38" cy="14" r="5"/><path d="M4 44h40"/>',
  laser:     '<path d="M24 2v30M17 6v20M31 6v20"/><ellipse cx="24" cy="38" rx="16" ry="6"/>',
  railcannon:'<path d="M24 2v26M16 18l8 10 8-10"/><path d="M6 36h36v8H6zM15 36v8M24 36v8M33 36v8"/>',
  he380:     SHELL + '<path d="M10 46h28"/>',

  // Eagle
  strafe:    WINGS + '<path d="M9 28v8M19 30v12M29 30v12M39 28v8"/>',
  airstrike: WINGS + sc(BOMB, 2, 22, 0.5) + sc(BOMB, 22, 22, 0.5),
  cluster:   WINGS + '<circle cx="12" cy="32" r="3"/><circle cx="24" cy="28" r="3"/><circle cx="36" cy="32" r="3"/><circle cx="18" cy="41" r="3"/><circle cx="30" cy="41" r="3"/>',
  napalm:    WINGS + sc(FLAME, 5, 10, 0.8),
  esmoke:    WINGS + sc(CLOUD, 6, 18, 0.7),
  pods:      '<rect x="6" y="12" width="36" height="24"/><circle cx="16" cy="24" r="5"/><circle cx="32" cy="24" r="5"/><path d="M24 12v24M12 36l-3 8M36 36l3 8"/>',
  bomb500:   BOMB + '<path d="M19 18h10"/>',

  // Supply: weapons & packs
  mg:        GUN,
  amr:       '<path d="M2 24h44M8 20h14l4 4M15 24v11h6V24M36 20v-4M32 16h9"/>',
  stalwart:  GUN + '<rect x="22" y="33" width="12" height="9"/>',
  eat:       '<rect x="4" y="18" width="40" height="12" rx="3"/><path d="M12 18v-6h9v6M36 30v9"/>',
  recoilless:'<path d="M4 16h30l10-5v26l-10-5H4zM13 31l-3 11M22 16v-5"/>',
  flamer:    '<path d="M3 22h20v8H3zM9 30v10h6V30"/>' + sc(FLAME, 20, 12, 0.6),
  autocannon:'<rect x="4" y="16" width="28" height="12"/><path d="M32 20h12M32 24h12"/><circle cx="17" cy="37" r="6"/>',
  railgun:   '<path d="M3 19h42M3 29h42M11 12v24M21 12v24M31 12v24"/>',
  spear:     '<path d="M4 28h30l10 4-10 4H4zM12 28V16M8 16h16"/>',
  grenade:   '<path d="M4 20h26v8H4zM30 16h14v16H30M13 28v10h6V28"/><circle cx="37" cy="24" r="3"/>',
  lasercannon:'<path d="M4 22h20v8H4zM10 30v10h6V30M24 26h8M36 20l9-4M36 26h9M36 32l9 4"/>',
  arc:       '<path d="M4 22h18v8H4zM10 30v10h6V30M22 26l6-7 4 9 6-9 6 7"/>',
  quasar:    '<rect x="4" y="18" width="26" height="12"/><circle cx="38" cy="24" r="8"/><circle cx="38" cy="24" r="2"/><path d="M12 30v10h6V30"/>',
  commando:  '<path d="M3 28h38l3 4H3zM11 28v-7h12v7M30 32v9h6v-9"/>',
  jump:      '<rect x="14" y="3" width="20" height="26" rx="4"/><path d="M18 29v5M30 29v5M16 40l2 5M24 36v9M32 40l-2 5"/>',
  supplypack:'<rect x="10" y="5" width="28" height="37" rx="5"/><path d="M24 15v18M15 24h18"/>',
  ballistic: '<path d="M24 3l17 6v14c0 10-7 17-17 22C14 40 7 33 7 23V9z"/><rect x="15" y="17" width="18" height="6"/>',
  shieldpack:'<rect x="14" y="24" width="20" height="20" rx="3"/><path d="M5 24a19 19 0 0 1 38 0"/>',
  dog:       '<path d="M7 12l9 7h16l9-7v18c0 8-7 14-17 14S7 38 7 30z"/><circle cx="17" cy="28" r="2.5"/><circle cx="31" cy="28" r="2.5"/><path d="M21 37h6"/>',

  // Defensive
  sentryMG:  SBASE + '<path d="M32 26h12"/>',
  sentryGat: SBASE + '<path d="M32 23h12M32 27h12M32 31h12"/>',
  sentryMor: SBASE + '<path d="M20 21l7-17M26 21l7-17"/>',
  sentryAC:  SBASE + '<rect x="32" y="23" width="12" height="7"/>',
  sentryRkt: SBASE + '<rect x="14" y="5" width="20" height="12"/><circle cx="20" cy="11" r="2"/><circle cx="28" cy="11" r="2"/>',
  tesla:     '<path d="M24 44V16M14 44h20M16 16h16l-3-9H19zM6 22l8-4M42 22l-8-4M4 31l10-3M44 31l-10-3"/>',
  hmg:       '<path d="M3 44h42M7 44v-8h34v8M13 36V22h14M27 27h17M27 32h17"/>',
  relay:     '<path d="M24 44V30M16 44h16"/><circle cx="24" cy="26" r="4"/><path d="M5 30a19 19 0 0 1 38 0"/>',
  mineAP:    '<circle cx="24" cy="30" r="8"/><path d="M24 14v8M10 18l6 6M38 18l-6 6M5 42h38"/>',
  mineInc:   '<circle cx="24" cy="38" r="7"/><path d="M5 46h38"/>' + sc(FLAME, 12, -4, 0.6),
  mineAT:    '<ellipse cx="24" cy="32" rx="19" ry="8"/><path d="M24 24v-9M17 32h14M5 42h38"/>'
};

// [name, code (U/D/L/R), category, icon key]
const ROSTER = [
  ['Reinforce','UDRLU','mission','reinforce'], ['Resupply','DDUR','mission','resupply'],
  ['SOS Beacon','UDRU','mission','sos'], ['Hellbomb','DULDURDU','mission','hellbomb'],
  ['Upload Data','LRUUU','mission','upload'], ['Seismic Probe','UULRDD','mission','seismic'],
  ['Eagle Rearm','UULUR','mission','rearm'], ['Super Earth Flag','DUDU','mission','flag'],

  ['Orbital Precision Strike','RRU','offense','precision'], ['Orbital Airburst Strike','RRR','offense','airburst'],
  ['Orbital Gatling Barrage','RDLUU','offense','gatling'], ['Orbital Gas Strike','RRDR','offense','gas'],
  ['Orbital EMS Strike','RRLD','offense','ems'], ['Orbital Smoke Strike','RRDU','offense','smoke'],
  ['Orbital 120MM HE Barrage','RRDLRD','offense','he120'], ['Orbital Walking Barrage','RDRDRD','offense','walking'],
  ['Orbital Laser','RDURD','offense','laser'], ['Orbital Railcannon Strike','RUDDR','offense','railcannon'],
  ['Orbital 380MM HE Barrage','RDUULDD','offense','he380'],
  ['Eagle Strafing Run','URR','offense','strafe'], ['Eagle Airstrike','URDR','offense','airstrike'],
  ['Eagle Cluster Bomb','URDDR','offense','cluster'], ['Eagle Napalm Airstrike','URDU','offense','napalm'],
  ['Eagle Smoke Strike','URUD','offense','esmoke'], ['Eagle 110MM Rocket Pods','URUL','offense','pods'],
  ['Eagle 500KG Bomb','URDDD','offense','bomb500'],
  ['Orbital Napalm Barrage','RRDLRU','offense','napalm'], ['Eagle Gas Airstrike','URLR','offense','gas'],

  ['Machine Gun','DLDUR','supply','mg'], ['Anti-Materiel Rifle','DLRUD','supply','amr'],
  ['Stalwart','DLDUUL','supply','stalwart'], ['Expendable Anti-Tank','DDLUR','supply','eat'],
  ['Recoilless Rifle','DLRRL','supply','recoilless'], ['Flamethrower','DLUDU','supply','flamer'],
  ['Autocannon','DLDUUR','supply','autocannon'], ['Railgun','DRDULR','supply','railgun'],
  ['Spear','DDUDD','supply','spear'], ['Grenade Launcher','DLULD','supply','grenade'],
  ['Laser Cannon','DLDUL','supply','lasercannon'], ['Arc Thrower','DRDULL','supply','arc'],
  ['Quasar Cannon','DDULR','supply','quasar'], ['Commando','DLUDR','supply','commando'],
  ['Jump Pack','DUUDU','supply','jump'], ['Supply Pack','DLDUUD','supply','supplypack'],
  ['Ballistic Shield Backpack','DLDDUL','supply','ballistic'], ['Shield Generator Pack','DULRLR','supply','shieldpack'],
  ['Guard Dog Rover','DULURR','supply','dog'],
  ['Heavy Machine Gun','DLUDD','supply','mg'], ['Airburst Rocket Launcher','DUULR','supply','recoilless'],
  ['W.A.S.P. Launcher','DDUDR','supply','spear'], ['Breaching Hammer','DLRLU','supply','flamer'],
  ['Epoch','DLULR','supply','lasercannon'], ['Bullet Storm','DLDRUL','supply','mg'],
  ['Speargun','DRDLUR','supply','spear'], ['Defoliation Tool','DLRRD','supply','flamer'],
  ['De-Escalator','DRULR','supply','grenade'], ['Expendable Napalm','DDLUL','supply','eat'],
  ['Sterilizer','DLUDL','supply','flamer'], ['Leveller','DDLUD','supply','eat'],
  ['Belt-Fed Grenade Launcher','DLULUU','supply','grenade'], ['C4 Pack','DRUURU','supply','supplypack'],
  ['Solo Silo','DURDD','supply','recoilless'], ['Cremator','DDRDUU','supply','flamer'],
  ['Maxigun','DLRDUU','supply','autocannon'], ['One True Flag','DLRRU','supply','flag'],
  ['Meltagun','DLULLD','supply','lasercannon'], ['Guard Dog','DULURD','supply','dog'],
  ['Directional Shield','DULRUU','supply','shieldpack'], ['Hot Dog','DULULL','supply','dog'],
  ['Portable Hellbomb','DRUUU','supply','hellbomb'], ['K-9','DULURL','supply','dog'],
  ['Hover Pack','DUUDLR','supply','jump'], ['Dog Breath','DULURU','supply','dog'],
  ['Warp Pack','DLRDLR','supply','jump'],

  ['Machine Gun Sentry','DURRU','defense','sentryMG'], ['Gatling Sentry','DURL','defense','sentryGat'],
  ['Mortar Sentry','DURRD','defense','sentryMor'], ['Autocannon Sentry','DURULU','defense','sentryAC'],
  ['Rocket Sentry','DURRL','defense','sentryRkt'], ['Tesla Tower','DURULR','defense','tesla'],
  ['HMG Emplacement','DULRRL','defense','hmg'], ['Shield Generator Relay','DDLRLR','defense','relay'],
  ['Anti-Personnel Minefield','DLUR','defense','mineAP'], ['Incendiary Mines','DLLD','defense','mineInc'],
  ['Anti-Tank Mines','DLUU','defense','mineAT'],
  ['EMS Mortar Sentry','DURDR','defense','sentryMor'], ['Gas Mortar Sentry','DURDL','defense','sentryMor'],
  ['Anti-Tank Emplacement','DULRRR','defense','hmg'], ['Grenadier Emplacement','DRDLR','defense','grenade']
];
const STRATAGEMS = ROSTER.map(([name, code, cat, icon]) => ({ name, code: [...code], cat, icon }));
const iconSVG = s =>
  `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[s.icon]}</svg>`;

/* ======================= FLAVOR TEXT ======================= */
const OPERATIONS = ["Liberty's Dawn","Steel Rain of Freedom","Managed Democracy","Hammer of Truth","Iron Sunrise","Burning Ballot"];
const BRIEFINGS = [
  "Citizen, the Bugs and Bots threaten your freedom to be mandatorily free. Dial it in. Quickly.",
  "Super Earth thanks you for your service. Super Earth also thanks you for not asking where the budget went.",
  "Remember: a delayed stratagem is a vote for the Illuminate. Democracy is counting on your fingers.",
  "High Command reminds you that mistakes are not permitted, but are statistically expected.",
  "Your sacrifice will be remembered in a brief and tasteful press release.",
  "Report for duty. Liberty is not going to deliver itself by orbital drop pod. Actually, it is. Be ready."
];
const CLEARED = [
  "Outstanding, Helldiver. Democracy has been officially delivered.",
  "Sector liberated. Please enjoy this complimentary patriotic feeling.",
  "High Command is pleased. High Command is always pleased with good numbers."
];
const FAILED = [
  "You have been reinforced into the great lottery of history. Thank you for your service.",
  "Mission failed successfully. Super Earth will say it was a victory.",
  "Your sacrifice has been noted, filed, and misspelled on a plaque."
];
const randOf = a => a[Math.random() * a.length | 0];

/* ======================= AUDIO (Web Audio, no files) ======================= */
let actx = null, muted = false; const SP = { wave: null, mul: 1, vol: 1, dur: 1 };   // sound settings (the default arcade sound)
const setMuted = m => { muted = m; };
const isMuted = () => muted;

function ac() {                       // lazily created inside a user gesture
  actx = actx || new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(freq, dur, { type = 'square', vol = 0.08, at = 0, slide = 0 } = {}) {
  if (muted) return;
  type = SP.wave || type; freq *= SP.mul; slide *= SP.mul; vol *= SP.vol; dur *= SP.dur;
  const c = ac(), t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}
const seq = (notes, step, opts) => notes.forEach((f, i) => tone(f, step * 1.6, { ...opts, at: i * step }));
const sfx = {
  correct:  step => tone(520 + step * 70, 0.07),
  mistake:  () => tone(180, 0.25, { type: 'sawtooth', vol: 0.12, slide: -120 }),
  complete: () => seq([660, 880, 1320], 0.07, { type: 'triangle', vol: 0.12 }),
  round:    () => seq([523, 659, 784, 1047, 1319], 0.1, { type: 'triangle', vol: 0.14 }),
  over:     () => seq([440, 370, 311, 220], 0.2, { type: 'sawtooth', vol: 0.12 }),
  start:    () => seq([392, 523], 0.09, { type: 'square' })
};

const HELLBOMB = STRATAGEMS.find(s => s.name === 'Hellbomb');
/* ---- show runtime errors on screen so a broken button can be diagnosed ---- */
function showErr(msg) {
  let bar = document.getElementById('errbar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'errbar'; document.body.appendChild(bar); }
  bar.textContent = 'Error: ' + msg; bar.style.display = 'block';
  if (window.hd2LogError) window.hd2LogError(msg, 'drills');
}
window.addEventListener('error', e => showErr(e.message));
window.addEventListener('unhandledrejection', e => showErr((e.reason && e.reason.message) || String(e.reason)));

/* extra sound effects for the shop / bonus systems */
sfx.coin   = () => seq([988, 1319], 0.06, { type: 'triangle', vol: 0.12 });
sfx.medal  = () => seq([784, 988, 1175, 1568], 0.09, { type: 'triangle', vol: 0.14 });
sfx.bomb   = () => seq([880, 660, 880, 660], 0.07, { type: 'square', vol: 0.1 });
sfx.shield = () => tone(330, 0.12, { type: 'triangle', vol: 0.12 });

/* ======================= STORAGE (chrome.storage.local) ======================= */
const area = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local ? chrome.storage.local : null;
const SCORES = 'hd2_scores', MUTE = 'hd2_muted', ECO = 'hd2_eco', STATS = 'hd2_stats', DAILY = 'hd2_daily', CHAL = 'hd2_challenges';

async function sGet(key, fallback) {
  if (area) { const r = await area.get(key); return r[key] ?? fallback; }
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
async function sSet(key, val) {
  if (area) await area.set({ [key]: val }); else localStorage.setItem(key, JSON.stringify(val));
}
const getScores = () => sGet(SCORES, {});
const getMuted = () => sGet(MUTE, false);
const setMutedPref = m => sSet(MUTE, m);
// Unbuffed runs live under the plain key (so old records stay valid); runs that used boosters go in "key:b".
async function saveScore(key, score, round, boosted) {
  const all = await getScores(), k = boosted ? key + ':b' : key, prev = all[k];
  const isNew = score > 0 && (!prev || score > prev.score);
  if (isNew) { all[k] = { score, round }; await sSet(SCORES, all); }
  return { isNew, best: all[k] };
}

/* ---- helpers ---- */
const fmt = n => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const dstr = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const today = () => dstr(new Date());
const hashStr = s => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const mulberry32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/* ======================= ECONOMY / PROGRESS DATA ======================= */
let eco = null, stats = null;                       // loaded at boot, saved after every change
const ecoDefault = () => ({ credits: 0, earned: 0, spent: 0, up: { time: 0, credit: 0, bonus: 0 },
  inv: { pilot: 0, shield: 0, combo: 0, skip: 0, revive: 0 }, premium: false, theme: 'earth', themes: [], pk: { cool: 0, loss: 0 }, sl: { cool: 0, loss: 0 }, dr: { cool: 0, loss: 0, tier: 0 },
  equip: { arrows: 'default', palette: 'default', logo: 'default', title: 'none' }, loadout: { boosts: [], mods: [] },
  pr: { names: [], count: 20 } });
const statsDefault = () => ({ runs: 0, codes: 0, hits: 0, misses: 0, perfect: 0, bestStreak: 0, playSec: 0, score: 0, rounds: 0,
  hbWin: 0, hbFail: 0, revives: 0, drops: 0, wagered: 0, payout: 0, jackpots: 0, spins: 0, slotWagered: 0, slotPayout: 0, slotJackpots: 0, crates: 0, crateSpent: 0, cratePayout: 0, crateLegend: 0, crateEpic: 0, crateRare: 0, crateHell: 0, bestLevel: 0, maxRun: 0, flawless: 0, tutorial: 0, daily: 0, practice: 0, arcade: 0, challenges: 0, memBest: 0, defBest: 0, dayStreak: 0, bestDayStreak: 0, lastPlay: '', bestRound: {}, calls: {}, medals: {} });
async function loadSaves() {
  const e = await sGet(ECO, {}) || {}, s = await sGet(STATS, {}) || {}, d = ecoDefault();
  eco = Object.assign(d, e);
  for (const k of ['up', 'inv', 'equip', 'loadout', 'pk', 'sl', 'dr', 'pr']) eco[k] = Object.assign(ecoDefault()[k], e[k]);
  stats = Object.assign(statsDefault(), s);
  for (const k of ['bestRound', 'calls', 'medals']) stats[k] = Object.assign({}, s[k]);
  eco.up = eco.up || {}; sanitize();
  const ch = await sGet(CHAL, {});
  chal = Object.assign({ day: '', week: '', d: {}, w: {}, arc: 0 }, ch && typeof ch === 'object' ? ch : {}); chal.d = chal.d || {}; chal.w = chal.w || {}; chRoll();
}
/* Saved data may be missing, from an older version, or hand-edited: coerce it into a safe shape. */
function sanitize() {
  const num = v => (Number.isFinite(v) && v >= 0 ? v : 0);
  ['credits', 'earned', 'spent'].forEach(k => { eco[k] = num(eco[k]); });
  Object.keys(eco.up).forEach(k => { eco.up[k] = Math.min(UPGRADES[k] ? UPGRADES[k].max : 0, Math.floor(num(eco.up[k]))); });
  Object.keys(eco.inv).forEach(k => { eco.inv[k] = Math.floor(num(eco.inv[k])); });
  eco.themes = Array.isArray(eco.themes) ? eco.themes.filter(t => THEMES[t]) : [];
  if (!THEMES[eco.theme] || !themeOwned(eco.theme)) eco.theme = 'earth';
  eco.premium = !!eco.premium; eco.cb = !!eco.cb;
  if (!/^\d{4}-\d\d-\d\d$/.test(stats.lastPlay)) stats.lastPlay = '';
  stats.dayStreak = Math.floor(num(stats.dayStreak)); stats.bestDayStreak = Math.max(Math.floor(num(stats.bestDayStreak)), stats.dayStreak);
  eco.pr = { names: Array.isArray(eco.pr && eco.pr.names) ? eco.pr.names.filter(n => typeof n === 'string').slice(0, 200) : [], count: PR_COUNTS.includes(eco.pr && eco.pr.count) ? eco.pr.count : 20 };
  eco.pk = { cool: Math.floor(num(eco.pk && eco.pk.cool)), loss: Math.floor(num(eco.pk && eco.pk.loss)) };
  eco.sl = { cool: Math.floor(num(eco.sl && eco.sl.cool)), loss: Math.floor(num(eco.sl && eco.sl.loss)) };
  eco.loadout = { boosts: Array.isArray(eco.loadout.boosts) ? eco.loadout.boosts : [], mods: Array.isArray(eco.loadout.mods) ? eco.loadout.mods : [] };
  Object.keys(statsDefault()).forEach(k => { if (typeof statsDefault()[k] === 'number') stats[k] = num(stats[k]); });
}
const saveEco = () => sSet(ECO, eco);
const saveStats = () => sSet(STATS, stats);
async function getDaily() { const d = await sGet(DAILY, null), t = today(); return d && d.date === t ? d : { date: t, done: false }; }
const setDaily = d => sSet(DAILY, d);

/* ---- Modifiers: optional twists that raise the credit multiplier ---- */
const MODS = {
  hidden:   { label: 'Radar Blackout', short: 'Blackout', bonus: 0.30, blurb: 'Arrows after the 2nd stay hidden until hit.' },
  mirror:   { label: 'Mirror Image', short: 'Mirror', bonus: 0.25, blurb: 'Left/right shown flipped. Enter the true code.' },
  reverse:  { label: 'Backwards Briefing', short: 'Reverse', bonus: 0.25, blurb: 'Shown in reverse. Enter the true code.' },
  scramble: { label: 'Illuminate Interference', short: 'Static', bonus: 0.20, blurb: 'Arrows briefly scramble on screen.' }
};
function dailyMods(date = today()) {              // same two modifiers for everyone on a given day
  const r = mulberry32(hashStr(date)), keys = Object.keys(MODS);
  for (let i = keys.length - 1; i > 0; i--) { const j = r() * (i + 1) | 0; [keys[i], keys[j]] = [keys[j], keys[i]]; }
  return keys.slice(0, 2);
}

/* ---- Per-run boosters (bought in the shop, brought on the loadout screen, used up) ---- */
const BOOSTS = {
  pilot:  { label: 'Expert Extraction Pilot', price: 90, blurb: '+6s on the clock every round (+12s at the start of Endless).' },
  shield: { label: 'Vitality Enhancement', price: 70, blurb: 'Ignores your first 2 mistakes completely.' },
  combo:  { label: 'Motivational Shock', price: 50, blurb: 'Your combo survives one mistake.' },
  skip:   { label: 'Hellpod Space Optimization', price: 40, blurb: '2 skips that reroll the current stratagem [Space].' },
  revive: { label: 'Flexible Reinforcement Budget', price: 120, blurb: 'When the clock hits zero you are called back in once with 10s.' }
};
/* ---- Permanent upgrades: small and capped so the economy does not snowball ---- */
const UPGRADES = {
  time:   { label: 'Extended Shift Hours', base: 150, max: 5, blurb: '+1s on the clock at the start of every round, per level.' },
  credit: { label: 'Offshore Tax Haven', base: 200, max: 5, blurb: '+5% Super Credits earned, per level.' },
  bonus:  { label: 'Tuition Subsidy', base: 250, max: 5, blurb: '+0.1s for every code you complete, per level.' }
};
const upCost = id => Math.round(UPGRADES[id].base * Math.pow(1.6, eco.up[id]));
const PREMIUM_COST = 1500, MEDAL_REWARD = 40;

/* ---- Warbond: cumulative credits earned unlock cosmetics on a free and a premium track ---- */
const WB_TIERS = [150, 400, 800, 1400, 2200, 3200];
const WB_FREE = [
  { type: 'title', id: 'enthusiast', name: 'Democracy Enthusiast' },
  { type: 'arrows', id: 'ice', name: 'Ice Arrows' },
  { type: 'palette', id: 'mono', name: 'Monochrome Ops' },
  { type: 'title', id: 'officer', name: 'Managed Democracy Officer' },
  { type: 'logo', id: 'gold', name: 'Gold Standard Logo' },
  { type: 'title', id: 'hammer', name: 'Hammer of Truth' }];
const WB_PREM = [
  { type: 'arrows', id: 'red', name: 'Hellbomb Red Arrows' },
  { type: 'palette', id: 'neon', name: 'Neon Liberty' },
  { type: 'title', id: 'elect', name: 'Super Citizen Elect' },
  { type: 'logo', id: 'crimson', name: 'Crimson Liberty Logo' },
  { type: 'arrows', id: 'violet', name: 'Illuminate Violet Arrows' },
  { type: 'palette', id: 'ember', name: 'Ember Directive' }];
const TYPE_LABEL = { title: 'Title', arrows: 'Arrow colour', palette: 'Icon palette', logo: 'Toolbar logo' };
const TITLES = Object.fromEntries([...WB_FREE, ...WB_PREM].filter(r => r.type === 'title').map(r => [r.id, r.name]));
const ARROW_THEMES = { default: '#ffd60a', ice: '#7fd0ff', red: '#ff5a4d', violet: '#c084ff' };
const BASE_COLORS = Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, v.color]));
const PALETTES = {
  default: BASE_COLORS,
  mono:  { mission: '#ffffff', supply: '#dbe6f5', defense: '#b3c6e0', offense: '#ffffff' },
  neon:  { mission: '#fff200', supply: '#00e5ff', defense: '#7dff6b', offense: '#ff4fd8' },
  ember: { mission: '#ffb703', supply: '#ff7b00', defense: '#ffe8a3', offense: '#ff3d2e' }
};
const LOGOS = {
  gold:    { frame: '#ffd60a', bg: '#1a1500', up: '#ffd60a', side: '#ffe98a', dot: '#ffffff' },
  crimson: { frame: '#ff4d42', bg: '#25090b', up: '#ff4d42', side: '#ffc2bd', dot: '#ffffff' }
};
function drawLogo(size, sch) {                      // four-way arrow pad on a framed square, drawn on a canvas
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), r = size * 0.18;
  const rr = (x, y, w, h, rad) => { g.beginPath(); g.moveTo(x + rad, y); g.arcTo(x + w, y, x + w, y + h, rad); g.arcTo(x + w, y + h, x, y + h, rad);
    g.arcTo(x, y + h, x, y, rad); g.arcTo(x, y, x + w, y, rad); g.closePath(); };
  rr(0, 0, size, size, r); g.fillStyle = sch.frame; g.fill();
  const b = size * 0.1; rr(b, b, size - 2 * b, size - 2 * b, r * 0.6); g.fillStyle = sch.bg; g.fill();
  const cx = size / 2, R = size * 0.34, r0 = size * 0.11, w = size * 0.15;
  [[0, -1, sch.up], [1, 0, sch.side], [0, 1, sch.side], [-1, 0, sch.side]].forEach(([dx, dy, col]) => {
    const px = -dy, py = dx; g.fillStyle = col; g.beginPath();
    g.moveTo(cx + dx * R, cx + dy * R);
    g.lineTo(cx + dx * r0 + px * w, cx + dy * r0 + py * w);
    g.lineTo(cx + dx * r0 - px * w, cx + dy * r0 - py * w); g.closePath(); g.fill();
  });
  g.fillStyle = sch.dot; g.beginPath(); g.arc(cx, cx, size * 0.065, 0, 7); g.fill();
  return c;
}
function applyLogo() {                              // the toolbar icon belongs to the war tracker, so the equipped logo shows in the game header
  const el = document.getElementById('hdrLogo'); if (!el) return;
  el.replaceChildren();
  const id = eco.equip.logo;
  if (id !== 'default' && LOGOS[id]) { const c = drawLogo(44, LOGOS[id]); c.style.cssText = 'width:22px;height:22px'; c.setAttribute('aria-hidden', 'true'); el.appendChild(c); }
}

/* ======================= UI THEMES ======================= */
// y = main accent, lb = secondary accent, b = stripe blue, hi = "offensive" icon colour. The first four are free; the rest cost SC.
const mk = (name, price, y, lb, b, hi, bg, panel, line, dim, g1, hov, dark, arr, ink) => ({ name, price, y, lb, b, hi, bg, panel, line, dim, g1, hov, dark, arr, ink });
const THEMES = {
  earth:      mk('Super Earth', 0, '#ffe033', '#6ec6ff', '#2f6fe4', '#5b9bff', '#0a1f44', '#0f2c5c', '#2a5ca8', '#a9d4f5', '#143a73', '#18457f', '#071634', '#7fa9d6', '#071634'),
  dark:       mk('Dark', 0, '#ffd84a', '#7cc4ff', '#3a4a66', '#6aa8ff', '#0e1013', '#161920', '#323847', '#aab3c2', '#1d212b', '#242a36', '#0b0d11', '#7d8798', '#14161a'),
  light:      mk('Light', 0, '#ffd21f', '#1c78c8', '#c5d3e6', '#2f5fd0', '#eaf0f8', '#ffffff', '#c5d3e6', '#4a6285', '#f4f8fd', '#f1f6ff', '#d9e3f1', '#6a7f9d', '#10223c'),
  terminid:   mk('Terminid Amber', 0, '#ffb020', '#ffd28a', '#c77a12', '#ff9a3c', '#1a1004', '#2b1b08', '#5c3d14', '#c9a273', '#4a2f0c', '#3b2609', '#0d0802', '#8a6a3a', '#1a1004'),
  automaton:  mk('Automaton Red', 0, '#ff4d42', '#ff9b94', '#c4272e', '#ff7a70', '#170708', '#2a0d10', '#5e1b21', '#c58b8f', '#4a1216', '#3a1013', '#0d0304', '#8a3b40', '#170708'),
  illuminate: mk('Illuminate Violet', 0, '#c084ff', '#8fe9ff', '#6a3fd6', '#9d7bff', '#0e0720', '#1a0f38', '#3d2a7a', '#a99bd6', '#2e1a66', '#281a56', '#070312', '#5a45a0', '#0e0720'),
  gold:       mk('Golden Age', 400, '#ffd700', '#fff1a8', '#b8960b', '#ffe14d', '#0a0a08', '#181710', '#3d3a1c', '#b5ac7a', '#2a2610', '#26230f', '#050503', '#6b6330', '#0a0a08'),
  stealth:    mk('Stealth Ops', 400, '#6dff9a', '#b6ffd0', '#1f9d55', '#3de07a', '#050a07', '#0c1a12', '#1b4a2c', '#7fb596', '#0f3a21', '#0e2e1b', '#020503', '#2f7a4a', '#050a07'),
  arctic:     mk('Arctic Frost', 600, '#7ff3ff', '#d4fbff', '#1aa7bd', '#4fd8ea', '#04181c', '#0a2b31', '#1a5a66', '#7fc3cc', '#0e4650', '#0c3a42', '#020c0e', '#2b7f8b', '#04181c'),
  festival:  mk('Festival of Liberty', 500, '#ff5148', '#ffb3a8', '#2f6b45', '#ff8a7e', '#07160f', '#0f2a1b', '#2f6b45', '#a8c9b3', '#143222', '#274234', '#040c08', '#7b9785', '#ffffff'),
  harvest:   mk('Harvest Moon', 500, '#ff8c2a', '#ffd9a0', '#7a4a1e', '#ffb15c', '#1b0f06', '#2d1a0b', '#7a4a1e', '#cfa77a', '#3a2210', '#4a3423', '#0f0803', '#9d7c5a', '#ffffff'),
  bloom:     mk('Spring Bloom', 600, '#ff7ab0', '#c2417c', '#e3c7d9', '#b8326f', '#f6eef4', '#ffffff', '#e3c7d9', '#7b4a66', '#ffffff', '#faf6fa', '#e5dde3', '#9c778c', '#2a1626'),
  destroyer: mk('Super Destroyer', 700, '#46c2ff', '#8fd3ff', '#34495f', '#7cc8ff', '#0b1118', '#141d28', '#34495f', '#9fb4c8', '#1a2635', '#2c3745', '#06090d', '#768697', '#10151f'),
  hive:      mk('Terminid Hive', 700, '#b6e03a', '#d7f27a', '#4d5c25', '#d0f060', '#10130a', '#1c2210', '#4d5c25', '#b2bd8a', '#252d14', '#363e27', '#090a06', '#858d66', '#10151f'),
  chrome:    mk('Chrome Legion', 900, '#ff3b3b', '#d5d8e0', '#3f3f4c', '#ff7676', '#0d0d10', '#18181d', '#3f3f4c', '#a9adba', '#202027', '#323238', '#070709', '#7d808a', '#ffffff')
};
// Custom Colours: bought here, then the accent and background are picked here, in Themes; the rest is derived (see theme.js).
function syncCustomTheme() {
  const t = window.hd2Custom.build(window.hd2Custom.read());
  THEMES.custom = mk('Custom Colours', 800, t.y, t.lb, t.b, t.hi, t.bg, t.panel, t.b, t.dim, t.g1, t.hov, t.dk, t.arr, t.ink);
}
syncCustomTheme();
const themeOwned = id => THEMES[id] && (!THEMES[id].price || eco.themes.includes(id));
let themeSaved = '';
function applyTheme() {                            // the game's Themes screen controls the look of the whole extension
  const id = themeOwned(eco.theme) ? eco.theme : 'earth', root = document.documentElement;
  window.hd2ApplyTheme(id);                        // colours for every page come from tokens.css (or the custom colours)
  try { localStorage.setItem('theme', id); } catch (e) { /* storage blocked */ }
  if (area && themeSaved !== id) { themeSaved = id; area.set({ theme: id }); }   // the tracker reads this key
  const cs = getComputedStyle(root), t = { y: cs.getPropertyValue('--accent-ink').trim(), lb: cs.getPropertyValue('--light').trim(), hi: THEMES[id].hi };
  Object.assign(BASE_COLORS, { mission: t.y, supply: t.lb, defense: cs.getPropertyValue('--text').trim() || '#ffffff', offense: t.hi });   // default icon palette follows the theme
  return t;
}
function applyCosmetics() {
  const th = applyTheme(), root = document.documentElement.style;
  document.body.classList.toggle('cb', !!eco.cb);
  const col = eco.equip.arrows === 'default' ? th.y : (ARROW_THEMES[eco.equip.arrows] || th.y);
  root.setProperty('--lit', col); root.setProperty('--litg', col + '88');
  const pal = PALETTES[eco.equip.palette] || BASE_COLORS;
  Object.keys(CATEGORIES).forEach(k => { CATEGORIES[k].color = pal[k]; });
  applyLogo();
}
const titleName = () => TITLES[eco.equip.title] || '';

/* ---- Career rank follows you across runs (lifetime score) ---- */
function career() {
  const CAREER = RANKS.map(([t, n]) => [t * 5, n]);   // RANKS is defined with the game logic below
  let i = 0; CAREER.forEach((c, j) => { if (stats.score >= c[0]) i = j; });
  return { name: CAREER[i][1], cur: CAREER[i][0], next: CAREER[i + 1] };
}

/* ---- admin panel limits ---- */
const MAX_SC = 9999999;

/* ======================= MEDALS ======================= */
// test(stats, lastRun) decides unlocking; prog(stats) optionally returns [current, goal] for the detail panel
const calls = (n, goal) => s => [s.calls[n] || 0, goal];
const MEDALS = [
  { id: 'first', name: 'Boots on the Ground', desc: 'Finish your first deployment.', icon: 'reinforce', prog: s => [s.runs, 1] },
  { id: 'runs25', name: 'Seasoned Citizen', desc: 'Finish 25 deployments.', icon: 'flag', prog: s => [s.runs, 25] },
  { id: 'reinf', name: 'Disposable Asset', desc: 'Call 100 Reinforces.', icon: 'reinforce', prog: calls('Reinforce', 100) },
  { id: 'resup', name: 'Supply Chain Hero', desc: 'Call 100 Resupplies.', icon: 'resupply', prog: calls('Resupply', 100) },
  { id: 'flaw', name: 'Flawless Democracy', desc: 'Clear Round 5 or later with zero mistakes in that round.', icon: 'precision', prog: s => [s.flawless, 1] },
  { id: 'codes1k', name: 'Muscle Memory', desc: 'Call 1,000 stratagems.', icon: 'upload', prog: s => [s.codes, 1000] },
  { id: 'codes10k', name: 'Carpal Tunnel of Freedom', desc: 'Call 10,000 stratagems.', icon: 'sos', prog: s => [s.codes, 10000] },
  { id: 'str25', name: 'Hot Streak', desc: 'Chain 25 codes without a mistake.', icon: 'napalm', prog: s => [s.bestStreak, 25] },
  { id: 'str50', name: 'Untouchable', desc: 'Chain 50 codes without a mistake.', icon: 'ems', prog: s => [s.bestStreak, 50] },
  { id: 'run50', name: 'Overtime for Liberty', desc: 'Call 50 stratagems in a single run.', icon: 'seismic', prog: s => [s.maxRun, 50] },
  { id: 'hb1', name: 'Fuse Whisperer', desc: 'Enter a Hellbomb code before its fuse runs out.', icon: 'hellbomb', prog: s => [s.hbWin, 1] },
  { id: 'hb10', name: 'Controlled Demolition', desc: 'Defuse... er, arm 10 Hellbombs in time.', icon: 'hellbomb', prog: s => [s.hbWin, 10] },
  { id: 'hbfail', name: 'Collateral Damage', desc: 'Let a Hellbomb fuse run out.', icon: 'he380', prog: s => [s.hbFail, 1] },
  { id: 'end10', name: 'Eternal Liberty', desc: 'Reach level 10 in Endless.', icon: 'rearm', prog: s => [s.bestLevel, 10] },
  { id: 'end20', name: 'Forever War', desc: 'Reach level 20 in Endless.', icon: 'rearm', prog: s => [s.bestLevel, 20] },
  { id: 'super5', name: 'Super Citizen', desc: 'Reach Round 5 on Super Helldiver.', icon: 'laser', prog: s => [s.bestRound.super || 0, 5] },
  { id: 'revive', name: 'Budget Approved', desc: 'Use a Flexible Reinforcement Budget revive.', icon: 'relay', prog: s => [s.revives, 1] },
  { id: 'spend500', name: 'Consumer of Freedom', desc: 'Spend 500 Super Credits.', icon: 'supplypack', prog: () => [eco.spent, 500] },
  { id: 'spend5k', name: 'Fiscal Patriot', desc: 'Spend 5,000 Super Credits.', icon: 'supplypack', prog: () => [eco.spent, 5000] },
  { id: 'premium', name: 'Premium Citizen', desc: 'Unlock the Premium Warbond.', icon: 'flag', prog: () => [eco.premium ? 1 : 0, 1] },
  { id: 'grad', name: 'Graduate', desc: 'Complete the tutorial.', icon: 'mg', prog: s => [s.tutorial, 1] },
  { id: 'order1', name: 'Order Fulfilled', desc: 'Complete a Daily Major Order.', icon: 'seismic', prog: s => [s.daily, 1] },
  { id: 'order7', name: 'Dedicated Servant', desc: 'Complete 7 Daily Major Orders.', icon: 'seismic', prog: s => [s.daily, 7] },
  { id: 'drop25', name: 'Gravity Enthusiast', desc: 'Make 25 Democracy Drop investments.', icon: 'upload', prog: s => [s.drops, 25] },
  { id: 'drop200', name: 'Compulsive Citizen', desc: 'Make 200 Democracy Drop investments.', icon: 'sos', prog: s => [s.drops, 200] },
  { id: 'jackpot', name: 'Jackpot of Freedom', desc: 'Land the 10x slot in Democracy Drop.', icon: 'precision', prog: s => [s.jackpots, 1] },
  { id: 'house', name: 'Fiscal Contribution', desc: 'Lose 2,000 SC net in Democracy Drop.', icon: 'flag', prog: s => [Math.max(0, s.wagered - s.payout), 2000] },
  { id: 'spin25', name: 'Lever Puller', desc: 'Spin Lucky Liberty Slots 25 times.', icon: 'resupply', prog: s => [s.spins, 25] },
  { id: 'slotjackpot', name: 'Triple Liberty', desc: 'Line up three flags on Lucky Liberty Slots.', icon: 'flag', prog: s => [s.slotJackpots, 1] },
  { id: 'slothouse', name: 'Dividend Donor', desc: 'Lose 2,000 SC net on Lucky Liberty Slots.', icon: 'hellbomb', prog: s => [Math.max(0, s.slotWagered - s.slotPayout), 2000] },
  { id: 'crate1', name: 'First Requisition', desc: 'Open your first Supply Drop.', icon: 'resupply', prog: s => [s.crates, 1] },
  { id: 'crate25', name: 'Crate Enthusiast', desc: 'Open 25 Supply Drops.', icon: 'supplypack', prog: s => [s.crates, 25] },
  { id: 'crate100', name: 'Hoarder of Liberty', desc: 'Open 100 Supply Drops.', icon: 'supplypack', prog: s => [s.crates, 100] },
  { id: 'cratehell', name: 'Hellpod Connoisseur', desc: 'Open 10 Hellpod Caches.', icon: 'pods', prog: s => [s.crateHell, 10] },
  { id: 'craterare', name: 'Rare Find', desc: 'Pull a Rare or better item from a Supply Drop.', icon: 'rearm', prog: s => [s.crateRare, 1] },
  { id: 'crateepic', name: 'Epic Delivery', desc: 'Pull an Epic or better item from a Supply Drop.', icon: 'laser', prog: s => [s.crateEpic, 1] },
  { id: 'crateleg', name: 'Legendary Supply', desc: 'Pull a Legendary item from a Supply Drop.', icon: 'flag', prog: s => [s.crateLegend, 1] },
  { id: 'cratehouse', name: 'Classified Contents', desc: 'Lose 2,000 SC net on Supply Drops.', icon: 'hellbomb', prog: s => [Math.max(0, s.crateSpent - s.cratePayout), 2000] },
  { id: 'study', name: 'Study Hall', desc: 'Finish 5 practice drills.', icon: 'mg', prog: s => [s.practice, 5] },
  { id: 'task10', name: 'Task Force', desc: 'Complete 10 daily or weekly challenges.', icon: 'seismic', prog: s => [s.challenges, 10] },
  { id: 'task50', name: 'Over-Achiever', desc: 'Complete 50 daily or weekly challenges.', icon: 'seismic', prog: s => [s.challenges, 50] },
  { id: 'mem10', name: 'Elephant of Democracy', desc: 'Clear 10 rounds in Code Memory.', icon: 'upload', prog: s => [s.memBest, 10] },
  { id: 'def300', name: 'Sky Guardian', desc: 'Score 300 in Airburst Defense.', icon: 'laser', prog: s => [s.defBest, 300] },
  { id: 'arc25', name: 'Arcade Regular', desc: 'Play 25 arcade games.', icon: 'resupply', prog: s => [s.arcade, 25] },
  { id: 'decor', name: 'Interior Decorator', desc: 'Own 3 premium themes.', icon: 'supplypack', prog: () => [eco.themes.length, 3] },
  { id: 'sharp', name: 'Sharpshooter', desc: 'Finish a run of 30+ stratagems at 98% accuracy or better.', icon: 'amr',
    test: (s, r) => !!r && !r.tutorial && r.completed >= 30 && r.accuracy >= 98 },
  { id: 'chaos', name: 'Chaos Agent', desc: 'Call 10+ stratagems in one run with 3 or more modifiers.', icon: 'gas',
    test: (s, r) => !!r && r.mods.length >= 3 && r.completed >= 10 }
];
MEDALS.forEach(m => { if (!m.test) m.test = s => { const p = m.prog(s); return p[0] >= p[1]; }; });
function awardMedals(r) {
  const got = [];
  MEDALS.forEach(m => {
    if (!stats.medals[m.id] && m.test(stats, r)) { stats.medals[m.id] = Date.now(); eco.credits += MEDAL_REWARD; eco.earned += MEDAL_REWARD; got.push(m); }
  });
  if (got.length) { saveStats(); saveEco(); }
  return got;
}
function mergeRun(r, s = stats) {                   // fold one run into the lifetime stats (or into a scratch copy)
  s.runs++; s.codes += r.completed; s.hits += r.hits; s.misses += r.misses; s.perfect += r.perfect;
  s.bestStreak = Math.max(s.bestStreak, r.bestStreak); s.playSec += r.playSec; s.score += r.score; s.rounds += r.roundsCleared;
  s.hbWin += r.hbWin; s.hbFail += r.hbFail; s.revives += r.revives; s.maxRun = Math.max(s.maxRun, r.completed);
  for (const n in r.calls) s.calls[n] = (s.calls[n] || 0) + r.calls[n];
  if (r.endless) s.bestLevel = Math.max(s.bestLevel, r.round);
  s.bestRound[r.key] = Math.max(s.bestRound[r.key] || 0, r.round);
  if (r.flawless) s.flawless++;
}
function bankRun(r, extra = 0) {                    // credits + stats + medals; synchronous so it can also run on popup close
  if (r.tutorial) stats.tutorial++; else mergeRun(r);
  const credits = r.credits + extra;
  eco.credits += credits; eco.earned += credits; streakTick();
  const challenges = r.tutorial ? [] : tickChallenges(challengeEvent(r));
  const medals = awardMedals(r);
  saveStats(); saveEco();
  return { credits, medals, challenges };
}

/* ======================= GAME LOGIC (no DOM) ======================= */
// minLen/maxLen/lenStep: code lengths and per-round growth; quota: stratagems needed per round;
// perStrat/drop/floor: seconds budgeted per stratagem and how fast that shrinks; add: seconds
// refunded per completion; penalty: seconds lost per mistake; mult: score multiplier; cm: credit multiplier.
// tutorial: guided lessons, no timer, nothing saved. endless: one long run that ramps up forever.
// daily: 3 fixed rounds, same stratagem sequence and modifiers for everyone on a given day.
const DIFFICULTIES = {
  tutorial: { label: 'Tutorial', blurb: 'Guided lessons, no timer.', tutorial: true,
    penalty: 0, add: 0, mult: 1, cm: 0,
    lessons: [
      { title: 'Basic input', names: ['Orbital Precision Strike', 'Orbital Airburst Strike', 'Eagle Strafing Run'],
        tip: 'Press the arrow keys (or W A S D) in the order shown. Each correct key lights up.' },
      { title: 'Mistakes happen', names: ['Resupply', 'Gatling Sentry', 'Anti-Personnel Minefield'],
        tip: 'A wrong key resets the code. There is no penalty here, just start again from the first arrow.' },
      { title: 'Mission essentials', names: ['Reinforce', 'Resupply', 'SOS Beacon', 'Super Earth Flag'],
        tip: 'Reinforce and Resupply are your lifelines in the field. Learn them by heart.' },
      { title: 'Speed and combos', names: ['Machine Gun', 'Eagle Airstrike', 'Orbital Gas Strike', 'Eagle Napalm Airstrike', 'Tesla Tower'],
        tip: 'Chain clean codes (no mistakes) to build your combo multiplier. Faster codes earn bonus points.' },
      { title: 'Graduation drill', random: 6, minLen: 3, maxLen: 6,
        tip: 'Final test: a random mix of stratagems. Pass it and you are ready for real deployment.' }
    ] },
  practice: { label: 'Practice', blurb: 'Pick the stratagems to drill.', tutorial: true, practice: true, hidden: true,
    penalty: 0, add: 0, mult: 1, cm: 0, lessons: [{ title: 'Practice drill', names: ['Reinforce'], tip: '' }] },
  recruit: { label: 'Recruit', blurb: 'Short codes, generous time, no mistake penalty.',
    minLen: 3, maxLen: 4, lenStep: 0.5, quota: 5, quotaStep: 1, quotaMax: 14,
    perStrat: 6.5, drop: 0.3, floor: 3.8, add: 1.2, penalty: 0, mult: 1, cm: 0.6 },
  helldiver: { label: 'Helldiver', blurb: 'Standard issue. Each mistake costs 1 second.',
    minLen: 3, maxLen: 5, lenStep: 0.8, quota: 6, quotaStep: 2, quotaMax: 16,
    perStrat: 5.2, drop: 0.35, floor: 3.2, add: 0.8, penalty: 1, mult: 1.75, cm: 1 },
  super: { label: 'Super Helldiver', blurb: 'Long codes, brutal clock, 2s mistake penalty.',
    minLen: 4, maxLen: 6, lenStep: 1, quota: 8, quotaStep: 2, quotaMax: 20,
    perStrat: 4.2, drop: 0.35, floor: 2.8, add: 0.4, penalty: 2, mult: 3, cm: 1.8 },
  endless: { label: 'Endless', blurb: 'Survive. Ramps up forever.', endless: true,
    startTime: 20, add: 2, addMin: 0.7, addDrop: 0.1, lvlEvery: 5, penalty: 1, mult: 2, cm: 1.2 },
  daily: { label: 'Daily Major Order', blurb: '', daily: true, maxRounds: 3,
    minLen: 3, maxLen: 5, lenStep: 0.8, quota: 6, quotaStep: 2, quotaMax: 16,
    perStrat: 5.2, drop: 0.35, floor: 3.2, add: 0.8, penalty: 1, mult: 2, cm: 1 }
};

const RANKS = [[0,'Cadet'],[300,'Space Cadet'],[800,'Sergeant'],[1600,'Master Sergeant'],[2800,'Chief'],
  [4500,'Space Chief Prime'],[7000,'Death Captain'],[10000,'Marshal'],[14000,'Star Marshal'],
  [19000,'Admiral'],[26000,'Skull Admiral'],[35000,'Fleet Admiral'],[50000,'Super Citizen']];
const rankFor = score => RANKS.filter(r => score >= r[0]).pop()[1];

function endlessCfg(d, level) {            // endless: code length creeps up every few levels
  return { round: level, endless: true, quota: Infinity, time: d.startTime,
    minLen: Math.min(5, 3 + Math.floor((level - 1) / 3)), maxLen: Math.min(8, 4 + Math.floor((level - 1) / 2)) };
}
function buildQueue(cfg) {                 // tutorial: fixed lesson list, or a random drill
  if (cfg.names) return cfg.names.map(n => STRATAGEMS.find(s => s.name === n)).filter(Boolean);
  const pool = STRATAGEMS.filter(s => s !== HELLBOMB && s.code.length >= cfg.minLen && s.code.length <= cfg.maxLen), q = [];
  while (q.length < cfg.random && pool.length) q.push(pool.splice(Math.random() * pool.length | 0, 1)[0]);
  return q;
}
// Each round: longer codes, bigger quota, less time per stratagem
function roundConfig(d, round) {
  if (d.tutorial) {
    const L = d.lessons[round - 1];
    const lens = (L.names || []).map(n => STRATAGEMS.find(s => s.name === n)?.code.length).filter(Boolean);
    return { round, tutorial: true, title: L.title, tip: L.tip, names: L.names, random: L.random,
      minLen: L.names ? Math.min(...lens) : L.minLen, maxLen: L.names ? Math.max(...lens) : L.maxLen,
      quota: L.names ? L.names.length : L.random, time: Infinity };
  }
  if (d.endless) return endlessCfg(d, round);
  const k = round - 1;
  const maxLen = Math.min(8, Math.floor(d.maxLen + k * d.lenStep));
  const minLen = Math.min(maxLen, 5, Math.floor(d.minLen + k * 0.4));
  const quota = Math.min(d.quotaMax, d.quota + k * d.quotaStep);
  const per = Math.max(d.floor, d.perStrat - k * d.drop);
  return { round, minLen, maxLen, quota, time: Math.round(quota * per) };
}

const BOMB_FUSE = 7.5, BOMB_CHANCE = 0.08, BOMB_PENALTY = 5, REVIVE_TIME = 10;

class Game {
  constructor(on) { this.on = on; this.state = 'idle'; this.mods = []; this.boosts = []; this.paused = false; }   // idle|briefing|playing|roundEnd|over
  emit(name, data) { if (this.on[name]) this.on[name](data); }
  get accuracy() { const n = this.hits + this.misses; return n ? Math.round(this.hits / n * 100) : 100; }
  earn(base) { this.credits += base * this.cm; }

  start(key, opts = {}) {
    const d = DIFFICULTIES[key];
    const boosts = d.tutorial ? [] : (opts.boosts || []);
    const mods = d.tutorial ? [] : d.daily ? dailyMods() : (opts.mods || []);
    const modBonus = mods.reduce((a, m) => a + MODS[m].bonus, 0);
    Object.assign(this, { key, diff: d, score: 0, round: 0, hits: 0, misses: 0, completed: 0, streak: 0, bestStreak: 0,
      boosts, mods, perfect: 0, calls: {}, missBy: {}, times: {}, hbWin: 0, hbFail: 0, revives: 0, playSec: 0, roundsCleared: 0, flawless: false,
      roundMisses: 0, credits: 0, roundStartCredits: 0, bomb: false, fuse: 0, bombDone: false,
      shield: boosts.includes('shield') ? 2 : 0, comboKeep: boosts.includes('combo') ? 1 : 0,
      skips: boosts.includes('skip') ? 2 : 0, reviveLeft: boosts.includes('revive') ? 1 : 0,
      cm: (d.cm || 0) * (1 + 0.05 * eco.up.credit) * (1 + modBonus) * (boosts.length ? 0.8 : 1),
      rng: d.daily ? mulberry32(hashStr(today())) : Math.random });
    this.paused = false;
    this.nextRound();
  }
  nextRound() {
    const d = this.diff;
    this.round++;
    this.cfg = roundConfig(d, this.round);
    let t = this.cfg.time;
    if (t !== Infinity) t += eco.up.time + (this.boosts.includes('pilot') ? (d.endless ? 12 : 6) : 0);
    this.timeLeft = this.timeMax = t;
    this.done = 0; this.current = null; this.upcoming = null; this.bomb = false; this.bombDone = false;
    this.roundMisses = 0; this.roundStartCredits = this.credits;
    this.queue = this.cfg.tutorial ? buildQueue(this.cfg) : null;
    this.state = 'briefing';
    this.emit('briefing', this.cfg);
  }
  begin() { if (this.state === 'briefing') { this.state = 'playing'; this.advance(); } }
  proceed() { if (this.state === 'roundEnd') this.nextRound(); }
  abort() { this.state = 'idle'; }

  pick(avoid) {
    const { minLen, maxLen } = this.cfg;
    const ok = s => s !== avoid && s !== HELLBOMB;
    let pool = STRATAGEMS.filter(s => ok(s) && s.code.length >= minLen && s.code.length <= maxLen);
    if (!pool.length) pool = STRATAGEMS.filter(ok);
    return pool[this.rng() * pool.length | 0];
  }
  advance() {
    this.bomb = false;
    if (this.queue) { this.current = this.queue[this.done]; this.upcoming = this.queue[this.done + 1] || null; }
    else { this.current = this.upcoming || this.pick(null); this.upcoming = this.pick(this.current); }
    this.pos = 0; this.stratTime = 0; this.clean = true;
    this.emit('stratagem', { s: this.current, next: this.upcoming });
  }
  skip() {                                         // Hellpod Space Optimization: reroll the current stratagem
    if (this.state !== 'playing' || this.paused || this.bomb || this.skips <= 0 || this.diff.tutorial) return;
    this.skips--;
    this.current = this.pick(this.current);
    this.pos = 0; this.stratTime = 0; this.clean = false;
    this.emit('skipped');
    this.emit('stratagem', { s: this.current, next: this.upcoming });
  }

  input(dir) {
    if (this.state !== 'playing' || this.paused) return;
    if (dir === this.current.code[this.pos]) {
      this.hits++; this.pos++;
      this.emit('progress', this.pos);
      if (this.pos === this.current.code.length) this.complete();
    } else {
      if (this.shield > 0) { this.shield--; this.emit('shielded'); return; }          // Vitality Enhancement: mistake ignored
      this.misses++; this.roundMisses++; this.clean = false; this.pos = 0; this.missBy[this.current.name] = (this.missBy[this.current.name] || 0) + 1;
      if (this.comboKeep > 0) this.comboKeep--; else this.streak = 0;                   // Motivational Shock
      this.timeLeft -= this.diff.penalty;
      this.emit('mistake', this.diff.penalty);
      if (this.timeLeft <= 0) this.outOfTime();
    }
  }

  complete() {
    const cur = this.current, len = cur.code.length, d = this.diff;
    this.calls[cur.name] = (this.calls[cur.name] || 0) + 1;
    if (this.bomb) return this.completeBomb();
    (this.times[cur.name] = this.times[cur.name] || []).push(this.stratTime);
    const par = len * 0.45 + 0.6;                                   // "pro" speed in seconds
    const speed = Math.round(Math.max(0, 1 - this.stratTime / (par * 3)) * len * 15);
    const perfect = this.clean ? len * 5 : 0;
    if (this.clean) this.perfect++;
    this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak);
    const combo = 1 + Math.min(this.streak - 1, 10) * 0.1;
    const points = Math.round((len * 10 + speed + perfect) * d.mult * combo);
    const bonus = (d.endless ? Math.max(d.addMin, d.add - (this.round - 1) * d.addDrop) : d.add) + (d.tutorial ? 0 : 0.1 * eco.up.bonus);
    this.score += points; this.completed++; this.done++; this.timeLeft += bonus;
    this.earn(Math.ceil(len * 0.6) + (this.clean ? 1 : 0) + (this.streak >= 10 ? 2 : this.streak >= 5 ? 1 : 0));
    this.emit('complete', { points });
    const roll = this.rng();                                        // always drawn, so the daily sequence stays identical
    if (d.endless) {                                                // level up every few codes
      const lvl = 1 + Math.floor(this.done / d.lvlEvery);
      if (lvl > this.round) { this.round = lvl; this.cfg = endlessCfg(d, lvl); this.bombDone = false; this.earn(8 * lvl); this.emit('levelUp', lvl); }
    }
    if (this.done >= this.cfg.quota) return this.endRound();
    if (!d.tutorial && !this.bombDone && this.done >= 2 && roll < BOMB_CHANCE) return this.startBomb();
    this.advance();
  }

  /* Hellbomb bonus: a rare 8-arrow code with a short fuse. Big payout, easy to fail. Not part of the quota. */
  startBomb() {
    this.bombDone = true; this.bomb = true; this.fuse = this.fuseMax = BOMB_FUSE;
    this.current = HELLBOMB; this.pos = 0; this.stratTime = 0; this.clean = true;
    this.emit('stratagem', { s: HELLBOMB, next: this.upcoming, bomb: true });
  }
  completeBomb() {
    const d = this.diff;
    this.bomb = false; this.hbWin++; this.completed++;
    if (this.clean) this.perfect++;
    this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak);
    const points = Math.round(400 * d.mult * (1 + Math.min(this.streak - 1, 10) * 0.1));
    this.score += points; this.timeLeft += 4; this.earn(30);
    this.emit('bombWin', { points });
    this.advance();
  }
  failBomb() {
    this.bomb = false; this.hbFail++; this.streak = 0; this.timeLeft -= BOMB_PENALTY;
    this.emit('bombFail');
    if (this.timeLeft <= 0) this.outOfTime();
    if (this.state === 'playing') this.advance();
  }

  outOfTime() {
    if (this.reviveLeft > 0) {                                      // Flexible Reinforcement Budget
      this.reviveLeft--; this.revives++; this.timeLeft = REVIVE_TIME;
      this.emit('revived'); return;
    }
    this.over('Out of time');
  }
  endRound() {
    const d = this.diff;
    const timeBonus = d.tutorial ? 0 : Math.round(Math.floor(this.timeLeft) * 10 * d.mult);
    this.score += timeBonus; this.roundsCleared++;
    if (!d.tutorial) { this.earn(10 * this.round); if (this.round >= 5 && this.roundMisses === 0) this.flawless = true; }
    if (d.tutorial && this.round >= d.lessons.length) return this.over('Tutorial complete');
    if (d.maxRounds && this.round >= d.maxRounds) return this.over('Major Order complete');
    this.state = 'roundEnd';
    this.emit('roundComplete', { round: this.round, timeBonus, timeLeft: this.timeLeft, accuracy: this.accuracy,
      roundCredits: Math.floor(this.credits - this.roundStartCredits) });
  }
  snapshot(reason) {                                               // everything the results screen / stats need
    return { key: this.key, score: this.score, round: this.round, accuracy: this.accuracy, completed: this.completed,
      bestStreak: this.bestStreak, reason, rank: rankFor(this.score), tutorial: !!this.diff.tutorial, endless: !!this.diff.endless,
      daily: !!this.diff.daily, practice: !!this.diff.practice, missBy: this.missBy, times: this.times, won: reason === 'Major Order complete' || reason === 'Tutorial complete',
      credits: Math.floor(this.credits), boosted: this.boosts.length > 0, mods: this.mods, boosts: this.boosts,
      hits: this.hits, misses: this.misses, perfect: this.perfect, calls: this.calls, hbWin: this.hbWin, hbFail: this.hbFail,
      revives: this.revives, playSec: this.playSec, roundsCleared: this.roundsCleared, flawless: this.flawless };
  }
  over(reason) {
    this.state = 'over'; this.bomb = false; this.timeLeft = Math.max(0, this.timeLeft);
    this.emit('gameOver', this.snapshot(reason));
  }
  tick(dt) {
    if (this.state !== 'playing' || this.paused) return;
    this.timeLeft -= dt; this.stratTime += dt; this.playSec += dt;
    if (this.bomb) { this.fuse -= dt; if (this.fuse <= 0) this.failBomb(); }
    if (this.state === 'playing' && this.timeLeft <= 0) this.outOfTime();
    if (this.state === 'playing') this.emit('tick');
  }
}

/* ======================= UI ======================= */
const $ = id => document.getElementById(id);
const KEYMAP = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', w: 'U', s: 'D', a: 'L', d: 'R' };
const stat = (k, v) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`;
let unlockAt = 0;                                   // blocks Enter right after a screen change (anti key-mash)
const lockInput = () => { unlockAt = performance.now() + 700; };
let runMedals = [], adminOK = false;
let view = 'menu', curKey = null, selB = new Set(), selM = new Set(), toastT = 0, scrOn = false, scrT = 0;

const EMBED = location.search.includes('embed=1');   // running inside the war tracker's Drills tab
if (location.search.includes('view=')) document.body.classList.add('wide');
function fitEmbed() { const w = window.innerWidth; document.documentElement.style.setProperty('--z', (w < 400 ? w / 400 : w < 480 ? 1 : Math.min(1.6, w / 400)).toFixed(3)); }
if (EMBED) { document.body.classList.add('embed'); fitEmbed(); window.addEventListener('resize', fitEmbed); }

const VERSION = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) ? chrome.runtime.getManifest().version : '';
const HINTS = {
  menu: () => 'Keys 1–6 pick a mission · P practice · C challenges · A arcade' + (VERSION ? ' · v' + VERSION : ''),
  practice: 'Enter = start · Esc = back', challenges: 'Esc = back',
  arcade: 'Arrows / WASD · Enter = start · 1–2 = switch game · Esc = back',
  brief: 'Enter = deploy · Esc = menu', play: 'Arrows / WASD · Space = skip · P = pause · Esc = end run',
  result: 'Enter = continue · Esc = menu', loadout: 'Enter = deploy · Esc = back', shop: 'Esc = back', wb: 'Esc = back', themes: 'Esc = back',
  stats: 'Esc = back', plinko: '← → bet · Space = invest · 1–3 = switch game · Esc = back', slots: '← → bet · Space = spin · 1–3 = switch game · Esc = back', drops: '← → crate · Space = open · 1–3 = switch game · Esc = back', admin: 'Esc = back'
};
function show(id) {
  view = id;
  if (id !== 'arcade') stopArcade();
  if (id !== 'play') { game.paused = false; $('play').classList.remove('paused'); }
  const hint = HINTS[id]; $('hint').textContent = typeof hint === 'function' ? hint() : hint || '';
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('hidden', s.id !== id));
}
function toast(t) {
  const el = $('toast'); el.textContent = t; el.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2400);
}
/* ---- Daily play streak: one point for each calendar day you finish any drill; bonus credits on day 3, 7, 14 and every 7th day after ---- */
const streakBonus = n => ({ 3: 25, 7: 60, 14: 120 }[n] || (n > 14 && (n - 14) % 7 === 0 ? 120 : 0));
function streakTick() {                               // call whenever a run, practice drill or arcade game finishes; safe to call many times a day
  const t = today(); if (stats.lastPlay === t) return;
  const y = new Date(); y.setDate(y.getDate() - 1);
  stats.dayStreak = stats.lastPlay === dstr(y) ? stats.dayStreak + 1 : 1;
  stats.lastPlay = t; stats.bestDayStreak = Math.max(stats.bestDayStreak, stats.dayStreak);
  const n = stats.dayStreak, b = streakBonus(n);
  if (b) { eco.credits += b; eco.earned += b; }
  if (n > 1) toast(`Day ${n} streak${b ? ' · +' + b + ' SC bonus' : ''}`);
}
const streakNow = () => { const y = new Date(); y.setDate(y.getDate() - 1); return stats.lastPlay === today() || stats.lastPlay === dstr(y) ? stats.dayStreak : 0; };
const scChip = () => `<span class="sc">★ ${fmt(eco.credits)} SC</span>`;
function popText(text, cls) {
  const p = $('pop'); p.className = ''; void p.offsetWidth; p.textContent = text; p.className = `${cls} go`;
}
/* Scrollable screens keep their scroll position when re-rendered after a purchase */
function keepScroll(id, render) {
  const old = $(id).querySelector('.scrollbox'), y = old ? old.scrollTop : 0;
  render();
  const nu = $(id).querySelector('.scrollbox'); if (nu) nu.scrollTop = y;
}

/* ---- achievement pop-up in the corner (stacks if several unlock at once) ---- */
const mpQueue = []; let mpBusy = false;
function medalPopup(m) { mpQueue.push(m); if (!mpBusy) nextMedalPopup(); }
function nextMedalPopup() {                         // one at a time, so pop-ups never pile up over the screen
  const m = mpQueue.shift();
  if (!m) { mpBusy = false; return; }
  mpBusy = true; sfx.medal();
  const el = document.createElement('div'); el.className = 'mpop';
  el.innerHTML = `<span class="mi">${iconSVG({ icon: m.icon })}</span><span><small>Medal earned · +${MEDAL_REWARD} SC${mpQueue.length ? ' · +' + mpQueue.length + ' more' : ''}</small><b>${m.name}</b></span>`;
  $('mpops').appendChild(el); setTimeout(() => { el.remove(); nextMedalPopup(); }, 2900);
}
function liveMedals() {                             // check medals during a run, using stats + the run so far
  if (!game.diff || game.diff.tutorial) return;
  const vs = JSON.parse(JSON.stringify(stats)), snap = game.snapshot('live');
  mergeRun(snap, vs); vs.runs = stats.runs;         // the run is not finished yet
  const got = [];
  MEDALS.forEach(m => {
    if (!stats.medals[m.id] && m.test(vs, snap)) { stats.medals[m.id] = Date.now(); eco.credits += MEDAL_REWARD; eco.earned += MEDAL_REWARD; got.push(m); }
  });
  if (got.length) { saveStats(); saveEco(); got.forEach(medalPopup); runMedals.push(...got); }
}

/* ---- arrows: modifiers change how the code is DISPLAYED; the player always enters the true code ---- */
function dispCode(code) {
  let a = [...code];
  if (game.mods.includes('mirror')) a = a.map(d => d === 'L' ? 'R' : d === 'R' ? 'L' : d);
  if (game.mods.includes('reverse')) a.reverse();
  return a;
}
function buildArrows(s) {
  const n = s.code.length, rev = game.mods.includes('reverse');
  $('arrows').className = 'arrows';
  $('arrows').innerHTML = dispCode(s.code).map((d, i) =>
    `<div class="arrow" data-d="${d}" data-o="${d}" data-j="${rev ? n - 1 - i : i}">${arrowSvg()}</div>`).join('');
  scrOn = false; paint(0);
}
function paint(pos) {                               // data-j = index in the TRUE code that this arrow stands for
  const hid = game.mods.includes('hidden');
  [...$('arrows').children].forEach(el => {
    const j = +el.dataset.j;
    el.classList.toggle('lit', j < pos);
    el.classList.toggle('hid', hid && j >= 2 && j >= pos);
  });
}
function scrambleTick(dt) {                         // Illuminate Interference: arrows briefly show random directions
  if (game.state !== 'playing' || !game.mods.includes('scramble')) { if (scrOn) unscramble(); return; }
  scrT += dt;
  const want = scrT % 2.4 > 1.95;
  if (want && !scrOn) { scrOn = true; [...$('arrows').children].forEach(el => { el.dataset.d = 'UDLR'[Math.random() * 4 | 0]; }); }
  else if (!want && scrOn) unscramble();
}
function unscramble() { scrOn = false; [...$('arrows').children].forEach(el => { el.dataset.d = el.dataset.o; }); }

function renderBoosts() {
  const c = [];
  if (game.shield > 0) c.push(`<span class="chip">Vitality ×${game.shield}</span>`);
  if (game.comboKeep > 0) c.push('<span class="chip">Combo guard</span>');
  if (game.reviveLeft > 0) c.push('<span class="chip">Revive ready</span>');
  if (game.skips > 0 && !game.diff.tutorial) c.push(`<button class="chip" id="skipBtn">Skip ×${game.skips} [Space]</button>`);
  game.mods.forEach(m => c.push(`<span class="chip mod">${MODS[m].short}</span>`));
  $('boosts').innerHTML = c.join('');
}
function hud() {
  const d = game.diff, untimed = game.cfg.time === Infinity;
  $('lRound').textContent = d.endless ? 'Level' : d.practice ? 'Drill' : d.tutorial ? 'Lesson' : 'Round';
  $('lQuota').textContent = d.endless ? 'Called' : 'Quota';
  $('hRound').textContent = d.maxRounds ? `${game.round}/${d.maxRounds}` : game.round;
  $('hScore').textContent = game.score;
  $('hCombo').textContent = 'x' + (1 + Math.min(game.streak, 10) * 0.1).toFixed(1);
  $('hQuota').textContent = d.endless ? game.done : `${game.done}/${game.cfg.quota}`;
  if (game.bomb) $('sCat').textContent = 'HELLBOMB · FUSE ' + Math.max(0, game.fuse).toFixed(1) + 's';
  const bar = $('timerBar');
  if (untimed) { bar.style.width = '100%'; bar.classList.remove('low'); $('timerTxt').textContent = 'No time limit'; return; }
  const t = Math.max(0, game.timeLeft);
  bar.style.width = Math.min(100, t / game.timeMax * 100) + '%';
  bar.classList.toggle('low', t / game.timeMax < 0.25);
  $('timerTxt').textContent = t.toFixed(1) + 's';
}
function togglePause() {
  if (game.state !== 'playing') return;
  game.paused = !game.paused; $('play').classList.toggle('paused', game.paused);
}
window.addEventListener('blur', () => { if ((EMBED || document.body.classList.contains('wide')) && game.state === 'playing' && !game.paused) togglePause(); });
window.addEventListener('message', e => {             // the tracker tells the game when its tab is hidden or shown
  if (!EMBED || e.source !== window.parent || e.origin !== location.origin) return;
  if (e.data === 'hd2:pause') { if (game.state === 'playing' && !game.paused) togglePause(); }
  else if (e.data === 'hd2:focus') window.focus();
  else if (e.data === 'hd2:admin') { game.abort(); adminOK = true; openAdmin(); }                 // tracker Settings > Admin: password already checked there
  else if (e.data && e.data.t === 'hd2:debug') copyDebug(e.data.json);
});
const deploy = () => { game.begin(); sfx.start(); };
const TUTORIAL_DONE = "Congratulations, Helldiver. Your graduation certificate is pending approval from the Ministry of Truth.";

const game = new Game({
  briefing(c) {
    lockInput(); if (c.round === 1) runMedals = [];
    const d = game.diff, len = c.minLen === c.maxLen ? c.minLen : c.minLen + '–' + c.maxLen;
    const modTxt = game.mods.length ? game.mods.map(m => MODS[m].short).join(', ') : 'None';
    const rate = '×' + (d.cm ? game.cm / d.cm : 0).toFixed(2);
    let title = 'Round ' + c.round, sub = 'Operation: ' + OPERATIONS[(c.round - 1) % OPERATIONS.length];
    let note = randOf(BRIEFINGS), btn = 'Deploy [Enter]', grid;
    if (d.tutorial) {
      title = d.practice ? 'Practice drill' : `Lesson ${c.round}/${d.lessons.length}`; sub = d.practice ? c.quota + ' stratagems' : c.title; note = c.tip; btn = d.practice ? 'Begin [Enter]' : 'Begin lesson [Enter]';
      grid = stat('Stratagems', c.quota) + stat('Time', 'No limit') + stat('Code length', len) + stat('Score saved', 'No');
    } else if (d.endless) {
      title = 'Endless'; sub = 'Operation: Eternal Liberty';
      grid = stat('Start time', Math.round(game.timeLeft) + 's') + stat('Code bonus', '+' + d.add + 's (falls)') +
        stat('Level up', 'Every ' + d.lvlEvery) + stat('Mistake penalty', d.penalty + 's') + stat('Modifiers', modTxt) + stat('Credits', rate);
    } else {
      if (d.daily) { title = `Round ${c.round}/${d.maxRounds}`; sub = 'Daily Major Order'; }
      grid = stat('Quota', c.quota + ' stratagems') + stat('Time', Math.round(game.timeLeft) + 's') + stat('Code length', len) +
        stat('Mistake penalty', d.penalty ? d.penalty + 's' : 'None') + stat('Modifiers', modTxt) + stat('Credits', rate);
    }
    if (game.mods.length) note = game.mods.map(m => MODS[m].label + ': ' + MODS[m].blurb).join(' ');
    $('brief').innerHTML = `<h2 class="display">${title}</h2><h3>${sub}</h3>
      <p class="flavor">${note}</p><div class="stats">${grid}</div>
      <button class="btn" id="goBtn">${btn}</button>`;
    $('brief').querySelector('#goBtn').onclick = deploy; show('brief');
  },
  stratagem({ s, next, bomb }) {
    show('play');
    const c = CATEGORIES[s.cat];
    $('play').classList.toggle('bomb', !!bomb);
    $('icon').innerHTML = iconSVG(s); $('icon').style.color = c.color;
    $('sName').textContent = s.name;
    $('sCat').textContent = bomb ? 'HELLBOMB' : c.label + ' stratagem'; $('sCat').style.color = c.color;
    buildArrows(s);
    $('nextName').textContent = next ? next.name : 'Final stratagem';
    $('tip').textContent = game.diff.tutorial ? game.cfg.tip : '';
    if (bomb) { sfx.bomb(); popText('HELLBOMB ARMED!', 'good'); }
    renderBoosts(); hud();
  },
  progress(pos) { paint(pos); sfx.correct(pos); },
  mistake(pen) {
    const row = $('arrows');
    paint(0);
    row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake');
    setTimeout(() => row.classList.remove('shake'), 300);
    if (game.diff.tutorial) $('tip').textContent = 'Wrong key! The code resets. Start again from the first arrow.';
    popText(pen ? `-${pen}s` : 'Miss', 'bad'); sfx.mistake(); hud(); renderBoosts();
  },
  shielded() { popText('Shielded!', 'good'); sfx.shield(); renderBoosts(); },
  skipped() { sfx.shield(); },
  complete(r) { sfx.complete(); popText('+' + r.points, 'good'); liveMedals(); },
  bombWin(r) { sfx.round(); popText('HELLBOMB +' + r.points, 'good'); liveMedals(); },
  bombFail() { sfx.mistake(); popText('DETONATED -' + BOMB_PENALTY + 's', 'bad'); liveMedals(); },
  revived() { sfx.round(); popText('REINFORCED +' + REVIVE_TIME + 's', 'good'); renderBoosts(); liveMedals(); },
  levelUp(lvl) { popText('Level ' + lvl + '!', 'good'); sfx.round(); },
  tick: hud,
  roundComplete(r) {
    sfx.round(); lockInput(); liveMedals();
    const d = game.diff;
    $('result').innerHTML = d.tutorial
      ? `<h2 class="display ok">Lesson ${r.round} clear</h2>
        <p class="flavor">${randOf(CLEARED)}</p>
        <div class="stats">${stat('Accuracy', r.accuracy + '%')}${stat('Lessons left', d.lessons.length - r.round)}</div>
        <button class="btn" id="nextBtn">Next lesson [Enter]</button>`
      : `<h2 class="display ok">Round ${r.round} secured</h2>
        <p class="flavor">${randOf(CLEARED)}</p>
        <div class="stats">${stat('Time bonus', '+' + r.timeBonus)}${stat('Score', game.score)}
          ${stat('Accuracy', r.accuracy + '%')}${stat('Time left', r.timeLeft.toFixed(1) + 's')}
          ${stat('Credits', '+' + fmt(r.roundCredits) + ' SC')}${stat('Run total', fmt(game.credits) + ' SC')}</div>
        <button class="btn" id="nextBtn">Next round [Enter]</button>`;
    $('nextBtn').onclick = () => game.proceed(); show('result');
  },
  async gameOver(r) {
    lockInput();
    if (r.practice) {                                      // a practice drill: no credits, but it counts for challenges and medals
      stats.practice++; streakTick(); tickChallenges({ practice: 1 }); awardMedals(null).forEach(medalPopup); saveStats(); saveEco();
      sfx.round(); practiceResult(r); return;
    }
    const label = r.daily ? 'Major Order' : DIFFICULTIES[r.key].label, notes = [];
    let extra = 0;
    if (r.tutorial) { if (!stats.tutorial) { extra = 100; notes.push('First-time training bonus: +100 SC'); } }
    else if (r.daily && r.won) {
      const dl = await getDaily();
      if (!dl.done) { extra = 120; dl.done = true; stats.daily++; notes.push('Major Order bonus: +120 SC'); }
      await setDaily(dl);
    }
    const bank = bankRun(r, extra);
    const result = $('result');
    if (r.tutorial) {
      sfx.round();
      result.innerHTML = `<h2 class="display ok">Training complete</h2>
        <p class="flavor">${TUTORIAL_DONE}</p>
        <div class="stats">${stat('Lessons', DIFFICULTIES.tutorial.lessons.length + '/' + DIFFICULTIES.tutorial.lessons.length)}
          ${stat('Accuracy', r.accuracy + '%')}${stat('Stratagems called', r.completed)}${stat('Best streak', r.bestStreak)}</div>
        ${notes.map(n => `<p class="flavor">${n}</p>`).join('')}${medalNotes([...runMedals, ...bank.medals])}
        <div class="btnrow"><button class="btn" id="againBtn">Repeat [Enter]</button>
        <button class="btn alt" id="menuBtn">Menu [Esc]</button></div>`;
      $('againBtn').onclick = redeploy; $('menuBtn').onclick = showMenu; show('result');
      bank.medals.forEach(medalPopup);
      return;
    }
    const { isNew, best } = await saveScore(r.daily ? 'daily:' + today() : r.key, r.score, r.round, r.boosted);
    const unit = r.endless ? 'Level' : 'Round';
    r.won ? sfx.round() : sfx.over();
    bank.medals.forEach(medalPopup);
    const head = r.won ? 'Major Order complete' : (r.endless || r.reason === 'Aborted') ? 'Deployment ended'
      : r.reason === 'Out of time' ? 'Mission failed' : 'Fallen in service';
    const bestTxt = isNew ? `New ${r.boosted ? 'boosted ' : ''}personal best for ${label}!`
      : `Best (${label}${r.boosted ? ', boosted' : ''}): ` + (best ? fmt(best.score) + ' · ' + unit + ' ' + best.round : '—');
    result.innerHTML = `<h2 class="display ${r.won ? 'ok' : 'bad'}">${head}</h2>
      <p class="flavor">${randOf(r.won ? CLEARED : FAILED)}</p>
      <div class="stats">${stat('Score', fmt(r.score))}${stat(unit + ' reached', r.round)}
        ${stat('Accuracy', r.accuracy + '%')}${stat('Stratagems called', r.completed)}
        ${stat('Best streak', r.bestStreak)}${stat('Rank', r.rank)}
        ${stat('Credits earned', '+' + fmt(bank.credits) + ' SC')}${stat('Hellbombs', r.hbWin + ' of ' + (r.hbWin + r.hbFail))}</div>
      <p class="flavor">${bestTxt}${r.boosted ? ' Boosted runs earn 20% fewer credits and keep a separate record.' : ''}</p>
      ${notes.map(n => `<p class="flavor">${n}</p>`).join('')}${medalNotes([...runMedals, ...bank.medals])}${chNotes(bank.challenges)}
      <div class="btnrow"><button class="btn" id="againBtn">Redeploy [Enter]</button>
      <button class="btn alt" id="menuBtn">Menu [Esc]</button></div>`;
    $('againBtn').onclick = redeploy; $('menuBtn').onclick = showMenu; show('result');
  }
});
const medalNotes = list => list.map(m => `<p class="flavor medal">★ Medal earned: <b>${m.name}</b> (+${MEDAL_REWARD} SC)</p>`).join('');
const redeploy = () => { if (game.key === 'practice') startPractice(); else if (DIFFICULTIES[game.key].tutorial) game.start(game.key); else openLoadout(game.key); };

/* ---- leaving a run early keeps whatever you earned ---- */
function leaveRun() {
  if (!game.diff.tutorial && game.completed > 0 && ['playing', 'briefing', 'roundEnd'].includes(game.state)) game.over('Aborted');
  else showMenu();
}
window.addEventListener('pagehide', () => {         // popup closed mid-run: bank credits and stats before the page dies
  if (['playing', 'briefing', 'roundEnd'].includes(game.state) && !game.diff.tutorial && game.completed > 0) {
    const r = game.snapshot('Aborted'); game.state = 'over'; bankRun(r);
  }
});

/* ======================= MENU ======================= */
async function showMenu() {
  game.abort(); adminOK = false;
  const best = await getScores(), dl = await getDaily();
  const record = (k, d) => {
    if (d.tutorial) return stats.tutorial || stats.runs ? d.lessons.length + ' lessons' : 'Start here ▶';
    if (d.daily) { const b = best['daily:' + today()]; return b ? 'Best ' + fmt(b.score) : dl.done ? 'Cleared ✔' : '+120 SC'; }
    const b = best[k]; return b ? `Best ${fmt(b.score)} · ${d.endless ? 'L' : 'R'}${b.round}` : 'No record';
  };
  const blurb = d => d.daily ? dailyMods().map(m => MODS[m].short).join(' + ') + ' · 3 rounds' : d.blurb;
  const c = career(), t = titleName(), medals = Object.keys(stats.medals).length;
  $('menu').innerHTML = `<div class="mtop"><h2 class="display sm">Select Deployment</h2>${scChip()}</div>
    <div class="who">${c.name}${t ? ' · ' + t : ''} · ${medals}/${MEDALS.length} medals${streakNow() > 1 ? ` · ${streakNow()}-day streak${stats.lastPlay === today() ? '' : ' (play today to keep it)'}` : ''}</div>` +
    menuKeys().map((k, i) => [k, DIFFICULTIES[k]]).map(([k, d], i) => `<button class="diff" data-k="${k}">
      <span class="num">${i + 1}</span><span><b>${d.label}</b><small>${blurb(d)}</small></span>
      <em>${record(k, d)}</em></button>`).join('') +
    `<div class="navrow grid"><button data-go="practice">Practice</button><button data-go="challenges">Challenges</button><button data-go="arcade" title="Code Memory and Airburst Defense">Arcade</button>
      <button data-go="shop">Shop</button><button data-go="wb">Warbond</button><button data-go="themes">Themes</button>
      <button data-go="stats">Medals</button><button data-go="reinvest" title="Democracy Drop, Lucky Slots and Supply Drops">Reinvestment</button></div>`;
  show('menu');
}
/* one delegated listener, so the menu buttons keep working however often the menu is re-rendered */
$('menu').addEventListener('click', e => {
  const d = e.target.closest('.diff'), g = e.target.closest('[data-go]');
  if (d) selectDiff(d.dataset.k);
  else if (g) ({ shop: openShop, wb: openWb, stats: () => { statsTab = 'medals'; openStats(); }, themes: openThemes, reinvest: () => openReinvest(), practice: openPractice, challenges: openChallenges, 
    arcade: () => openArcade() })[g.dataset.go]();
});
const menuKeys = () => Object.keys(DIFFICULTIES).filter(k => !DIFFICULTIES[k].hidden);
function selectDiff(k) { if (DIFFICULTIES[k].tutorial) game.start(k); else openLoadout(k); }

/* ======================= LOADOUT ======================= */
function openLoadout(k) {
  curKey = k;
  selB = new Set((eco.loadout.boosts || []).filter(b => BOOSTS[b]));
  selM = new Set((eco.loadout.mods || []).filter(m => MODS[m]));
  const d = DIFFICULTIES[k];
  while (planCost() > eco.credits && selB.size) {            // drop what you can no longer afford
    const b = [...selB].find(x => !eco.inv[x]); if (!b) break; selB.delete(b);
  }
  lockInput(); renderLoadout(); show('loadout');
}
const planCost = () => { let c = 0; selB.forEach(b => { if (!eco.inv[b]) c += BOOSTS[b].price; }); return c; };
function renderLoadout() {
  keepScroll('loadout', () => {
    const d = DIFFICULTIES[curKey], mods = d.daily ? dailyMods() : [...selM], cost = planCost();
    const rate = (1 + 0.05 * eco.up.credit) * (1 + mods.reduce((a, m) => a + MODS[m].bonus, 0)) * (selB.size ? 0.8 : 1);
    const brow = Object.entries(BOOSTS).map(([id, b]) => {
      const on = selB.has(id), stock = eco.inv[id], afford = on || stock > 0 || cost + b.price <= eco.credits;
      return `<button class="row ${on ? 'on' : ''} ${afford ? '' : 'dis'}" data-b="${id}"><span><b>${b.label}</b><small>${b.blurb}</small></span>
        <em>${stock ? 'Stock ×' + stock : b.price + ' SC'}</em></button>`;
    }).join('');
    const mrow = Object.entries(MODS).map(([id, m]) => {
      const on = mods.includes(id);
      return `<button class="row ${on ? 'on' : ''}" data-m="${id}" ${d.daily ? 'disabled' : ''}><span><b>${m.label}</b><small>${m.blurb}</small></span>
        <em>+${Math.round(m.bonus * 100)}% SC</em></button>`;
    }).join('');
    $('loadout').innerHTML = `<div class="mtop"><h2 class="display sm">Loadout · ${d.label}</h2>${scChip()}</div>
      <div class="scrollbox"><h3>Boosters (used up this run${selB.size ? ' · credits ×0.8' : ''})</h3>${brow}
        <h3>Modifiers ${d.daily ? '(fixed today)' : '(optional)'}</h3>${mrow}</div>
      <div class="who">Credit rate ×${rate.toFixed(2)}${cost ? ' · Cost ' + cost + ' SC' : ''}</div>
      <div class="btnrow"><button class="btn" id="goBtn">Deploy [Enter]</button><button class="btn alt" id="backBtn">Back [Esc]</button></div>`;
    $('loadout').querySelectorAll('[data-b]').forEach(b => b.onclick = () => {
      const id = b.dataset.b;
      if (selB.has(id)) selB.delete(id);
      else if (eco.inv[id] > 0 || planCost() + BOOSTS[id].price <= eco.credits) selB.add(id);
      else return toast('Not enough Super Credits');
      renderLoadout();
    });
    $('loadout').querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
      const id = b.dataset.m; selM.has(id) ? selM.delete(id) : selM.add(id); renderLoadout();
    });
    $('loadout').querySelector('#goBtn').onclick = deployRun; $('loadout').querySelector('#backBtn').onclick = showMenu;
  });
}
function deployRun() {
  const cost = planCost();
  if (cost > eco.credits) return toast('Not enough Super Credits');
  selB.forEach(b => { if (eco.inv[b] > 0) eco.inv[b]--; else { eco.credits -= BOOSTS[b].price; eco.spent += BOOSTS[b].price; } });
  eco.loadout = { boosts: [...selB], mods: [...selM] }; saveEco();
  if (cost) sfx.coin();
  game.start(curKey, { boosts: [...selB], mods: [...selM] });
}

/* ======================= SHOP ======================= */
function openShop() { renderShop(); show('shop'); }
function afterPurchase() {
  const got = awardMedals(null); sfx.coin();
  got.forEach(medalPopup);
}
function renderShop() {
  keepScroll('shop', () => {
    const brow = Object.entries(BOOSTS).map(([id, b]) => `<button class="row ${eco.credits < b.price ? 'dis' : ''}" data-b="${id}">
      <span><b>${b.label}</b><small>${b.blurb}</small></span><em>${b.price} SC<small>Stock ×${eco.inv[id]}</small></em></button>`).join('');
    const urow = Object.entries(UPGRADES).map(([id, u]) => {
      const lv = eco.up[id], max = lv >= u.max, cost = max ? 0 : upCost(id);
      return `<button class="row ${max || eco.credits < cost ? 'dis' : ''}" data-u="${id}"><span><b>${u.label}</b><small>${u.blurb}</small></span>
        <em>${max ? 'MAX' : cost + ' SC'}<small class="pips">${'●'.repeat(lv)}${'○'.repeat(u.max - lv)}</small></em></button>`;
    }).join('');
    $('shop').innerHTML = `<div class="mtop"><h2 class="display sm">Super Store</h2>${scChip()}</div>
      <div class="scrollbox"><h3>Boosters · bring them on the loadout screen</h3>${brow}<h3>Permanent upgrades · capped</h3>${urow}</div>
      <button class="btn alt" id="backBtn">Back [Esc]</button>`;
    $('shop').querySelectorAll('[data-b]').forEach(b => b.onclick = () => {
      const id = b.dataset.b, p = BOOSTS[id].price;
      if (eco.credits < p) return toast('Not enough Super Credits');
      eco.credits -= p; eco.spent += p; eco.inv[id]++; saveEco(); afterPurchase(); renderShop();
    });
    $('shop').querySelectorAll('[data-u]').forEach(b => b.onclick = () => {
      const id = b.dataset.u;
      if (eco.up[id] >= UPGRADES[id].max) return toast('Already at maximum level');
      const c = upCost(id); if (eco.credits < c) return toast('Not enough Super Credits');
      eco.credits -= c; eco.spent += c; eco.up[id]++; saveEco(); afterPurchase(); renderShop();
    });
    $('shop').querySelector('#backBtn').onclick = showMenu;
  });
}

/* ======================= WARBOND ======================= */
function openWb() { renderWb(); show('wb'); }
function preview(r) {
  if (r.type === 'arrows') return `<i class="sw" style="background:${ARROW_THEMES[r.id]}"></i>`;
  if (r.type === 'palette') return `<span class="sws">${Object.values(PALETTES[r.id]).map(c => `<i class="sw" style="background:${c}"></i>`).join('')}</span>`;
  if (r.type === 'logo') return `<img alt="" src="${drawLogo(32, LOGOS[r.id]).toDataURL()}">`;
  return '<span class="tt">★</span>';
}
function renderWb() {
  keepScroll('wb', () => {
    const cell = (r, free, t) => {
      const open = eco.earned >= t && (free || eco.premium), eq = eco.equip[r.type] === r.id;
      const sub = eq ? 'Equipped' : open ? 'Tap to equip' : eco.earned < t ? 'Locked' : 'Premium only';
      const why = eco.earned < t ? `Locked: earn ${fmt(t - eco.earned)} more SC to unlock this tier` : 'Premium track: unlock the Premium Warbond first';
      return `<button class="cell ${eq ? 'eq' : open ? 'ok' : 'lock'}" ${open ? `data-t="${r.type}" data-i="${r.id}"` : `data-why="${why}"`}>${preview(r)}
        <span><b>${r.name}</b><small>${TYPE_LABEL[r.type]} · ${sub}</small></span></button>`;
    };
    const tiers = WB_TIERS.map((t, i) => `<div class="tier"><span class="tn">${fmt(t)}<small>SC earned</small></span>${cell(WB_FREE[i], true, t)}${cell(WB_PREM[i], false, t)}</div>`).join('');
    $('wb').innerHTML = `<div class="mtop"><h2 class="display sm">Warbond</h2>${scChip()}</div>
      <div class="who">Lifetime earned: ${fmt(eco.earned)} SC · tiers unlock on their own</div>
      <div class="scrollbox">
        ${eco.premium ? '<p class="flavor">Premium Warbond active. Super Earth thanks you for your voluntary contribution.</p>'
          : `<button class="row ${eco.credits < PREMIUM_COST ? 'dis' : ''}" id="premBtn"><span><b>Premium Warbond: Steel Wallet Edition</b>
            <small>Unlocks the whole premium track. Costs in-game credits only. Satire is free.</small></span><em>${fmt(PREMIUM_COST)} SC</em></button>`}
        <div class="tier hd"><span></span><b>Free track</b><b>Premium track</b></div>${tiers}
      </div>
      <div class="btnrow"><button class="btn alt" id="resetBtn">Reset cosmetics</button><button class="btn alt" id="backBtn">Back [Esc]</button></div>`;
    $('wb').querySelectorAll('.cell[data-t]').forEach(b => b.onclick = () => {
      const type = b.dataset.t, id = b.dataset.i, def = type === 'title' ? 'none' : 'default';
      eco.equip[type] = eco.equip[type] === id ? def : id;
      saveEco(); applyCosmetics(); sfx.shield(); renderWb();
    });
    $('wb').querySelectorAll('.cell[data-why]').forEach(b => b.onclick = () => toast(b.dataset.why));
    const pb = $('premBtn');
    if (pb) pb.onclick = () => {
      if (eco.credits < PREMIUM_COST) return toast('Not enough Super Credits');
      eco.credits -= PREMIUM_COST; eco.spent += PREMIUM_COST; eco.premium = true; saveEco(); afterPurchase(); renderWb();
    };
    $('resetBtn').onclick = () => { eco.equip = ecoDefault().equip; saveEco(); applyCosmetics(); renderWb(); };
    $('wb').querySelector('#backBtn').onclick = showMenu;
  });
}

/* ======================= STATS & MEDALS ======================= */
let statsTab = 'stats';
function openStats() { renderStats(); show('stats'); }
function renderStats() {
  keepScroll('stats', () => {
    const s = stats, n = s.hits + s.misses, acc = n ? (s.hits / n * 100).toFixed(1) + '%' : '—';
    const c = career(), top = Object.entries(s.calls).sort((a, b) => b[1] - a[1])[0];
    const hrs = Math.floor(s.playSec / 3600), mins = Math.floor(s.playSec % 3600 / 60), secs = Math.floor(s.playSec % 60);
    const pct = c.next ? Math.min(100, (s.score - c.cur) / (c.next[0] - c.cur) * 100) : 100;
    let body;
    if (statsTab === 'stats') {
      body = `<div class="flavor">Career rank: <b>${c.name}</b>${c.next ? ` · next: ${c.next[1]} at ${fmt(c.next[0])} career score` : ' · maximum rank'}</div>
        <div class="timer"><div id="rankBar" style="height:100%;background:var(--lb);width:${pct}%"></div><span class="ttxt">${fmt(s.score)} career score</span></div>
        <div class="stats tight">${stat('Deployments', fmt(s.runs))}${stat('Stratagems called', fmt(s.codes))}
          ${stat('Accuracy', acc)}${stat('Perfect codes', fmt(s.perfect))}${stat('Best streak', s.bestStreak)}
          ${stat('Time played', hrs ? `${hrs}h ${mins}m` : `${mins}m ${secs}s`)}${stat('Rounds cleared', fmt(s.rounds))}
          ${stat('Hellbombs', s.hbWin + ' ok / ' + s.hbFail + ' boom')}${stat('Revives used', s.revives)}
          ${stat('Plinko drops', fmt(s.drops))}${stat('10× jackpots', s.jackpots)}${stat('Slot spins', fmt(s.spins))}${stat('Triple Liberty', s.slotJackpots)}${stat('Supply drops', fmt(s.crates))}${stat('Credits earned', fmt(eco.earned))}${stat('Credits spent', fmt(eco.spent))}${stat('Endless best', s.bestLevel ? 'Level ' + s.bestLevel : '—')}
          ${stat('Most called', top ? top[0] + ' ×' + top[1] : '—')}${stat('Major Orders', s.daily)}${stat('Challenges done', s.challenges)}${stat('Day streak', streakNow() + ' (best ' + Math.max(s.bestDayStreak, streakNow()) + ')')}${stat('Practice drills', s.practice)}${stat('Arcade games', s.arcade)}</div>
        <button class="row danger" id="resetAll"><span><b>Reset all progress</b><small>Erases credits, medals, stats, scores and unlocks.</small></span><em>Tap twice</em></button>`;
    } else {
      body = `<div class="medals">${MEDALS.map(m => `<button class="mcell ${s.medals[m.id] ? 'got' : ''}" data-id="${m.id}">
          <span class="mi2">${iconSVG({ icon: m.icon })}</span><small>${m.name}</small></button>`).join('')}</div>`;
    }
    $('stats').innerHTML = `<div class="mtop"><h2 class="display sm">Stats &amp; Medals</h2>${scChip()}</div>
      <div class="btnrow tabs"><button class="navbtn ${statsTab === 'stats' ? 'act' : ''}" data-tab="stats">Stats</button>
        <button class="navbtn ${statsTab === 'medals' ? 'act' : ''}" data-tab="medals">Medals</button></div>
      ${statsTab === 'medals' ? `<div class="who">${Object.keys(s.medals).length}/${MEDALS.length} medals earned · tap one to see what it takes</div>` : ''}
      <div class="scrollbox">${body}</div>${statsTab === 'medals' ? '<div class="flavor" id="mdetail">Tap a medal to see what it takes.</div>' : ''}<button class="btn alt" id="backBtn">Back [Esc]</button>`;
    $('stats').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { statsTab = b.dataset.tab; renderStats(); });
    const ra = $('stats').querySelector('#resetAll');
    if (ra) ra.onclick = async () => {
      if (!ra.dataset.armed) { ra.dataset.armed = 1; ra.classList.add('armed'); ra.querySelector('em').textContent = 'Tap again!'; setTimeout(() => { if (ra.isConnected) { delete ra.dataset.armed; ra.classList.remove('armed'); ra.querySelector('em').textContent = 'Tap twice'; } }, 3500); return; }
      eco = ecoDefault(); stats = statsDefault(); pk.msg = '';
      chal = { day: '', week: '', d: {}, w: {}, arc: 0 }; chRoll();
      await Promise.all([saveEco(), saveStats(), sSet(SCORES, {}), sSet(DAILY, null), sSet(CHAL, chal)]);
      applyCosmetics(); toast('All progress erased.'); showMenu();
    };
    $('stats').querySelectorAll('.mcell').forEach(b => b.onclick = () => {
      $('stats').querySelectorAll('.mcell').forEach(x => x.classList.toggle('sel', x === b));
      const m = MEDALS.find(x => x.id === b.dataset.id), p = m.prog ? m.prog(stats) : null;
      $('mdetail').innerHTML = `<b>${m.name}</b> — ${m.desc}<br>` + (stats.medals[m.id] ? 'Earned ✔' : p ? `Progress: ${fmt(Math.min(p[0], p[1]))}/${fmt(p[1])}` : 'Not yet earned');
    });
    $('stats').querySelector('#backBtn').onclick = showMenu;
  });
}

/* ======================= THEMES ======================= */
function openThemes() { renderThemes(); show('themes'); }
function renderThemes() {
  keepScroll('themes', () => {
    const rows = Object.entries(THEMES).map(([id, t]) => {
      const owned = themeOwned(id), eq = eco.theme === id;
      const sw = [t.y, t.lb, t.b, t.bg].map(c => `<i class="sw" style="background:${c}"></i>`).join('');
      return `<button class="row ${eq ? 'on' : ''} ${!owned && eco.credits < t.price ? 'dis' : ''}" data-id="${id}">
        <span class="sws4">${sw}</span><span><b>${t.name}</b><small>${id === 'custom' ? (owned ? 'Pick your own colours below' : 'Choose your own accent and background') : t.price ? (owned ? 'Purchased' : 'Premium theme') : 'Included'}</small></span>
        <em>${eq ? 'Equipped' : owned ? 'Tap to equip' : fmt(t.price) + ' SC'}</em></button>`;
    }).join('');
    $('themes').innerHTML = `<div class="mtop"><h2 class="display sm">Themes</h2>${scChip()}</div>
      <div class="who">Applies to the whole extension · ${Object.values(THEMES).filter(t => !t.price).length} included, the rest cost Super Credits</div>
      <div class="scrollbox">${rows}<button class="row" id="cbRow"><span><b>Colour-blind arrows</b><small>Arrows are hollow until pressed, then solid with a ✓. A mistake shows a ✕. No colour needed.</small></span><em>${eco.cb ? 'On' : 'Off'}</em></button>${themeOwned('custom') ? `<div class="cust"><b>Custom colours</b><label>Accent <input type="color" id="cuA" value="${window.hd2Custom.read().accent}"></label>
        <label>Background <input type="color" id="cuB" value="${window.hd2Custom.read().bg}"></label><button class="btn alt" id="cuReset">Reset</button></div>` : ''}</div><button class="btn alt" id="backBtn">Back [Esc]</button>`;
    $('cbRow').onclick = () => { eco.cb = !eco.cb; saveEco(); applyCosmetics(); sfx.shield(); renderThemes(); };
    const cu = () => {
      window.hd2Custom.set({ accent: $('cuA').value, bg: $('cuB').value }); syncCustomTheme();
      if (eco.theme !== 'custom') { eco.theme = 'custom'; saveEco(); }   // picking a colour switches to the custom theme so you see it straight away
      applyCosmetics();
      const t = THEMES.custom, row = $('themes').querySelector('[data-id=custom]');
      if (row) { [t.y, t.lb, t.b, t.bg].forEach((c, i) => { row.querySelectorAll('.sw')[i].style.background = c; }); row.classList.add('on'); const em = row.querySelector('em'); if (em) em.textContent = 'Equipped'; }
      $('themes').querySelectorAll('.row.on').forEach(r => { if (r !== row) { r.classList.remove('on'); const em = r.querySelector('em'); if (em) em.textContent = 'Tap to equip'; } });
    };
    if ($('cuA')) { $('cuA').oninput = $('cuB').oninput = cu; $('cuReset').onclick = () => { window.hd2Custom.set(window.hd2Custom.def); syncCustomTheme(); if (eco.theme === 'custom') applyCosmetics(); renderThemes(); }; }
    $('themes').querySelectorAll('.row[data-id]').forEach(b => b.onclick = () => {
      const id = b.dataset.id, t = THEMES[id];
      if (!themeOwned(id)) {
        if (eco.credits < t.price) return toast('Not enough Super Credits');
        eco.credits -= t.price; eco.spent += t.price; eco.themes.push(id); afterPurchase();
      }
      eco.theme = id; saveEco(); applyCosmetics(); sfx.shield(); renderThemes();
    });
    $('themes').querySelector('#backBtn').onclick = showMenu;
  });
}

/* ======================= ADMIN (hidden) ======================= */
// The admin panel opens only from the tracker's Settings > Admin (password checked there); there is no in-game login.
function openAdmin() { if (!adminOK) return showMenu(); renderAdminPanel(); show('admin'); }
const adminActions = {
  credits() { eco.credits = MAX_SC; },
  medals() { MEDALS.forEach(m => { if (!stats.medals[m.id]) stats.medals[m.id] = Date.now(); }); },
  themes() { Object.entries(THEMES).forEach(([id, t]) => { if (t.price && !eco.themes.includes(id)) eco.themes.push(id); }); },
  warbond() { eco.earned = Math.max(eco.earned, WB_TIERS[WB_TIERS.length - 1]); eco.premium = true; }
};
function copyDebug(json) {
  if (!json) return toast('Nothing to copy yet. Open the tracker tabs first.');
  const done = () => { sfx.coin(); toast('Debug data copied'); };
  const fallback = () => { const t = document.createElement('textarea'); t.value = json; document.body.append(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Could not copy'); } t.remove(); };
  if (navigator.clipboard) navigator.clipboard.writeText(json).then(done, fallback); else fallback();
}
async function renderAdminPanel() {
  const medals = Object.keys(stats.medals).length, th = Object.values(THEMES).filter(t => !t.price).length + eco.themes.length;
  let flipped = true;                                  // tracker setting: on unless "invertDefense" is true
  try { if (area) flipped = (await area.get('invertDefense')).invertDefense !== true; } catch (e) { /* default */ }
  const row = (id, name, desc, val) => `<button class="row" data-a="${id}"><span><b>${name}</b><small>${desc}</small></span>${val ? `<em>${val}</em>` : ''}</button>`;
  $('admin').innerHTML = `<div class="mtop"><h2 class="display sm">High Command</h2>${scChip()}</div>
    <div class="who">Medals ${medals}/${MEDALS.length} · Themes ${th}/${Object.keys(THEMES).length} · Warbond ${eco.premium && eco.earned >= WB_TIERS[5] ? 'all unlocked' : 'partial'}</div>
    <div class="scrollbox">
      <h3>Drills</h3>
      ${row('credits', 'Max Super Credits', 'Sets your balance to ' + fmt(MAX_SC) + ' SC.', 'Tap twice')}
      ${row('medals', 'Unlock all medals', 'Awards every achievement (no credit payout).', 'Tap twice')}
      ${row('themes', 'Unlock all themes', 'Every premium colour theme becomes yours.', 'Tap twice')}
      ${row('warbond', 'Unlock the full Warbond', 'All free and premium tiers, plus the Premium Warbond.', 'Tap twice')}
      ${row('reset', 'Reset Drills progress', 'Clears credits, upgrades, items, themes, medals and stats. High scores and sound setting stay.', 'Tap twice')}
      <h3>War tracker</h3>
      ${row('flip', 'Flip defense %', 'On by default. Turn off if defense progress looks upside-down.', flipped ? 'On' : 'Off')}
      ${EMBED ? row('debug', 'Copy debug data', 'Raw feed numbers, for comparing with the game.') : ''}
    </div>
    <div class="btnrow"><button class="btn" id="allBtn" data-label="Unlock all Drills">Unlock all Drills</button><button class="btn alt" id="backBtn">Lock &amp; exit</button></div>`;
  const apply = fns => { fns.forEach(f => adminActions[f]()); saveEco(); saveStats(); applyCosmetics(); sfx.coin(); toast('Done. For Super Earth!'); renderAdminPanel(); };
  // Risky actions need a second tap within a few seconds, so a stray tap can't change your progress.
  const armOnce = (el, setText) => {
    if (!el.dataset.armed) {
      el.dataset.armed = 1; el.classList.add('armed'); setText(true);
      setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.classList.remove('armed'); setText(false); } }, 3500);
      return false;
    }
    return true;
  };
  const resetProgress = async () => {
    eco = ecoDefault(); stats = statsDefault(); sanitize();
    await saveEco(); await saveStats(); applyCosmetics(); sfx.coin(); toast('Drills progress reset.'); renderAdminPanel();
  };
  $('admin').querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
    const a = b.dataset.a;
    if (!['flip', 'debug'].includes(a) && !armOnce(b, on => { const em = b.querySelector('em'); if (em) em.textContent = on ? 'Tap again!' : 'Tap twice'; })) return;
    if (a === 'reset') await resetProgress();
    else if (a === 'flip') { if (area) await area.set({ invertDefense: flipped }); sfx.shield(); renderAdminPanel(); }
    else if (a === 'debug') window.parent.postMessage('hd2:debug', location.origin);
    else apply([a]);
  });
  $('allBtn').onclick = e => { const btn = e.currentTarget; if (armOnce(btn, on => { btn.textContent = on ? 'Tap again to confirm' : btn.dataset.label; })) apply(Object.keys(adminActions)); };   // keep the button: e.currentTarget is null once the click has finished, so the 3.5 s reset used to throw
  $('admin').querySelector('#backBtn').onclick = () => { adminOK = false; showMenu(); };
}

/* ======================= DEMOCRACY DROP (plinko) ======================= */
// The slot labels are what the player sees. The landing slot is decided BEFORE the ball drops, from a weighted table
// (PK.w) that is skewed hard toward the low-paying centre, then the ball's path is drawn so that it ends there.
// On top of that: a big win "cools" the next two drops, and a long losing streak occasionally gets a small bone.
const PK = { rows: 8, W: 372, H: 170, bets: [10, 25, 50, 100, 250, 500],
  mult: [10, 3, 1.5, 0.5, 0.2, 0.5, 1.5, 3, 10], w: [0.1, 1.2, 6, 22, 41.4, 22, 6, 1.2, 0.1] };
const pk = { bet: 50, ball: null, flash: -1, flashT: 0, msg: '', raf: 0 };
const PK_LINES_WIN = ['Dividends delivered. Super Earth is proud of your fiscal patriotism.', 'A rare victory for the private sector.'];
const PK_LINES_LOSE = ['Your investment was redistributed to the war effort.', 'Liberty has been funded. Thank you for your contribution.',
  'The market has spoken. The market is High Command.', 'A tasteful loss. Please invest again.'];

function plinkoPick(bet) {
  let w = PK.w.slice();
  if (eco.pk.cool > 0) { eco.pk.cool--; w = w.map((x, i) => PK.mult[i] >= 1 ? x * 0.35 : x * 1.4); }
  else if (eco.pk.loss >= 4 && Math.random() < 0.5) w = w.map((x, i) => (PK.mult[i] === 1.5 || PK.mult[i] === 0.5) ? x * 3 : x);
  if (bet >= 250) w = w.map((x, i) => PK.mult[i] >= 1 ? x * 0.7 : x);          // the higher the stakes, the worse the odds
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
  return 4;
}
function pkPath(slot) {                              // waypoints for a ball that ends in `slot` (shuffled left/right bounces)
  const R = PK.rows, dirs = [...Array(slot).fill(1), ...Array(R - slot).fill(0)];
  for (let i = dirs.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [dirs[i], dirs[j]] = [dirs[j], dirs[i]]; }
  const sp = PK.W / 9, cx = PK.W / 2, pegY = r => 20 + r * ((PK.H - 65) / (PK.rows - 1));
  const pts = [{ x: cx + (Math.random() - 0.5) * 6, y: 4 }]; let k = 0;
  for (let r = 0; r < R; r++) { pts.push({ x: cx + (k - r / 2) * sp, y: pegY(r) - 7 }); k += dirs[r]; }
  pts.push({ x: cx + (k - R / 2) * sp, y: PK.H - 16 });
  return pts;
}
const REINV = {
  plinko: { btn: 'pkDrop', msg: 'pkMsg', busy: () => !!pk.ball, label: 'Invest' },
  slots:  { btn: 'slDrop', msg: 'slMsg', busy: () => sl.busy, label: 'Spin' }
};   // (Supply Drops has its own tier buttons, see refreshDrops)
let reinvTab = 'plinko';
function reinvHead(active) {                         // shared header + tab strip for both Reinvestment games
  return `<div class="mtop"><h2 class="display sm">Reinvestment</h2>${scChip()}</div>
    <div class="btnrow tabs"><button class="navbtn ${active === 'plinko' ? 'act' : ''}" data-rt="plinko">Democracy Drop</button>
    <button class="navbtn ${active === 'slots' ? 'act' : ''}" data-rt="slots">Lucky Slots</button>
    <button class="navbtn ${active === 'drops' ? 'act' : ''}" data-rt="drops">Supply Drops</button></div>`;
}
function bindReinv(scr) {
  $(scr).querySelectorAll('[data-rt]').forEach(b => b.onclick = () => openReinvest(b.dataset.rt));
  $(scr).querySelectorAll('[data-bet]').forEach(b => b.onclick = () => setBet(+b.dataset.bet));
  $(scr).querySelector('#backBtn').onclick = showMenu;
}
function openReinvest(tab) {
  reinvTab = tab || reinvTab;
  (reinvTab === 'drops' ? renderDrops : reinvTab === 'slots' ? renderSlots : renderPlinko)();
  if (reinvTab === 'drops') { refreshDrops(); if (eco.credits < DR.tiers[0].price) $('drMsg').textContent = 'Out of Super Credits. Earn more on a mission, Citizen.'; }
  else { refreshBets(reinvTab); if (eco.credits < PK.bets[0]) $(REINV[reinvTab].msg).textContent = 'Out of Super Credits. Earn more on a mission, Citizen.'; }
  show(reinvTab); lockInput(); if (reinvTab === 'plinko') startPkLoop();
  fitReinv(reinvTab);
}
// Side panel only: use the panel's full height. The plinko board gets taller (its pegs and slots re-space themselves);
// the slot reels and the crate window are scaled up as far as the panel's width allows.
function fitReinv(tab) {
  if (!EMBED) return;
  const sc = $(tab), el = sc && sc.querySelector({ plinko: '#pkCanvas', slots: '.reels', drops: '.dwin' }[tab]);
  if (!el || sc.classList.contains('hidden')) return;
  const cs = getComputedStyle(sc), gap = parseFloat(cs.rowGap) || 0, pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  if (tab === 'plinko') { PK.H = 170; el.height = 170; } else { el.style.zoom = 1; if (tab === 'drops') el.style.setProperty('--dh', '76px'); }
  const kids = [...sc.children], used = kids.reduce((a, k) => a + k.offsetHeight, 0) + gap * (kids.length - 1) + pad;
  const free = sc.clientHeight - used - 8;
  if (free <= 0) return;
  if (tab === 'plinko') { PK.H = Math.round(Math.min(520, 170 + free / (el.clientWidth / PK.W))); el.height = PK.H; if (!pk.ball) drawPk(); }
  else {
    const ec = getComputedStyle(el), natW = tab === 'slots' ? [...el.children].reduce((a, k) => a + k.offsetWidth, 0) + (parseFloat(ec.columnGap) || 0) * (el.children.length - 1) : el.offsetWidth;   // the reels row spans the screen, so measure the reels themselves
    const wlim = (sc.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) / natW;
    let left = free;
    if (tab === 'drops') { const dh = Math.round(Math.min(190, 76 + free * 0.75)); el.style.setProperty('--dh', dh + 'px'); left = free - (dh - 76); }   // taller crate window, then widen to the panel
    el.style.zoom = Math.max(1, Math.min(wlim, 2, 1 + left / el.offsetHeight)).toFixed(3);
  }
}
if (EMBED) window.addEventListener('resize', () => { if (['plinko', 'slots', 'drops'].includes(view) && !(view === 'plinko' && pk.ball)) fitReinv(view); });

const betsRow = () => `<div class="bets">${PK.bets.map(b => `<button class="navbtn ${b === pk.bet ? 'act' : ''}" data-bet="${b}">${b}</button>`).join('')}</div>`;
function renderPlinko() {
  $('plinko').innerHTML = `${reinvHead('plinko')}
    <canvas id="pkCanvas" width="${PK.W}" height="${PK.H}"></canvas>
    ${betsRow()}
    <div class="who" id="pkMsg">${pk.msg || 'Invest Super Credits. Liberty pays dividends.'}</div>
    <div class="btnrow"><button class="btn" id="pkDrop">Invest ${pk.bet} SC</button><button class="btn alt" id="backBtn">Back [Esc]</button></div>`;
  bindReinv('plinko'); $('pkDrop').onclick = dropBall;
}
function setBet(b) {
  if (b > eco.credits) return toast('Not enough Super Credits');
  pk.bet = b; refreshBets(view);
}
function refreshBets(which = view) {                 // grey out bets you cannot afford; step down if the current one is too big
  const r = REINV[which]; if (!r || !$(r.btn)) return;
  if (pk.bet > eco.credits) { const ok = PK.bets.filter(b => b <= eco.credits); pk.bet = ok.length ? ok[ok.length - 1] : PK.bets[0]; }
  $(which).querySelectorAll('[data-bet]').forEach(el => { el.classList.toggle('act', +el.dataset.bet === pk.bet); el.classList.toggle('dis', +el.dataset.bet > eco.credits); });
  $(r.btn).textContent = `${r.label} ${pk.bet} SC`; $(r.btn).classList.toggle('dis', r.busy() || eco.credits < PK.bets[0]);
}
const stepBet = d => setBet(PK.bets[Math.max(0, Math.min(PK.bets.length - 1, PK.bets.indexOf(pk.bet) + d))]);
function dropBall() {
  if (pk.ball || view !== 'plinko') return;
  if (eco.credits < pk.bet) return toast('Not enough Super Credits');
  const bet = pk.bet, slot = plinkoPick(bet), mult = PK.mult[slot], payout = Math.round(bet * mult);
  eco.credits += payout - bet;                       // settled immediately, so closing the popup mid-drop loses nothing
  stats.drops++; stats.wagered += bet; stats.payout += payout; if (mult >= 10) stats.jackpots++;
  if (mult >= 1.5) eco.pk.cool = 2;
  eco.pk.loss = payout < bet ? eco.pk.loss + 1 : 0;
  saveEco(); saveStats();
  pk.ball = { pts: pkPath(slot), i: 0, t: 0, slot, mult, payout, bet }; pk.flash = -1;
  refreshBets('plinko'); $('pkMsg').textContent = 'Investing…'; sfx.shield();
}
function landBall() {
  const b = pk.ball; pk.ball = null; pk.flash = b.slot; pk.flashT = 1.2;
  const net = b.payout - b.bet;
  pk.msg = `${b.mult}× · ${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))} SC. ` + randOf(net > 0 ? PK_LINES_WIN : PK_LINES_LOSE);
  if (view === 'plinko') {
    $('pkMsg').textContent = pk.msg; $('pkDrop').classList.remove('dis');
    const c = $('plinko').querySelector('.sc'); if (c) c.textContent = '★ ' + fmt(eco.credits) + ' SC';
    refreshBets('plinko'); if (eco.credits < PK.bets[0]) $('pkMsg').textContent = pk.msg + ' You are out of Super Credits.';
  }
  b.mult >= 10 ? sfx.round() : net > 0 ? sfx.complete() : sfx.mistake();
  awardMedals(null).forEach(medalPopup);
}
function startPkLoop() {
  cancelAnimationFrame(pk.raf); let last = performance.now();
  const f = t => {
    if (view !== 'plinko') return;
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    if (pk.ball) {                                  // move along the waypoint path, arcing over each peg
      const b = pk.ball, n = b.pts.length - 1, seg = b.i === n - 1 ? 0.26 : 0.17;
      b.t += dt / seg;
      while (pk.ball && b.t >= 1) { b.t -= 1; b.i++; if (b.i >= n) landBall(); else sfx.correct(b.i % 6); }
    }
    if (pk.flashT > 0) pk.flashT -= dt;
    drawPk(); pk.raf = requestAnimationFrame(f);
  };
  pk.raf = requestAnimationFrame(f);
}
function drawPk() {
  const cv = $('pkCanvas'); if (!cv) return;
  const g = cv.getContext('2d'), cs = getComputedStyle(document.documentElement), col = n => cs.getPropertyValue(n).trim();
  const sp = PK.W / 9, cx = PK.W / 2, pegY = r => 20 + r * ((PK.H - 65) / (PK.rows - 1));
  g.clearRect(0, 0, PK.W, PK.H);
  g.fillStyle = col('--lb');
  for (let r = 0; r < PK.rows; r++) for (let j = 0; j <= r; j++) { g.beginPath(); g.arc(cx + (j - r / 2) * sp, pegY(r), 2.6, 0, 7); g.fill(); }
  g.font = '700 11px sans-serif'; g.textAlign = 'center';
  PK.mult.forEach((m, k) => {
    const x = cx + (k - 4.5) * sp, hot = pk.flash === k && pk.flashT > 0 && Math.floor(pk.flashT * 8) % 2 === 0;
    g.fillStyle = hot ? col('--y') : col('--gp'); g.fillRect(x + 1.5, PK.H - 26, sp - 3, 24);
    g.strokeStyle = m >= 3 ? col('--y') : m >= 1 ? col('--lb') : col('--gl'); g.lineWidth = 1.5; g.strokeRect(x + 1.5, PK.H - 26, sp - 3, 24);
    g.fillStyle = hot ? col('--ink') : m >= 3 ? col('--y') : m >= 1 ? col('--lb') : col('--dim'); g.fillText(m + '×', x + sp / 2, PK.H - 10);
  });
  if (pk.ball) {
    const b = pk.ball, a = b.pts[b.i], c = b.pts[b.i + 1], t = b.t, last = b.i === b.pts.length - 2;
    const x = a.x + (c.x - a.x) * t, y = last || b.i === 0 ? a.y + (c.y - a.y) * t * t : a.y + (c.y - a.y) * t - 7 * Math.sin(Math.PI * t);
    g.fillStyle = col('--y'); g.shadowColor = col('--y'); g.shadowBlur = 8; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.shadowBlur = 0;
  }
}

/* ======================= LUCKY LIBERTY SLOTS ======================= */
// Same trick as Democracy Drop: the outcome is chosen first from a skewed table, then the reels are stopped to show it.
// Losses are dressed up as near misses (two big symbols plus one that just missed) to keep players spinning.
const SL = { sym: ['flag', 'hellbomb', 'pods', 'precision', 'tesla', 'mineAT'], pay: [50, 20, 10, 5, 3, 2],
  col: ['var(--y)', 'var(--txt)', 'var(--lb)', 'var(--b)', 'var(--dim)', 'var(--lb)'],
  w: [0.0008, 0.003, 0.008, 0.02, 0.035, 0.05, 0.06],      // 3 flags, 3 bombs, 3 wings, 3 crosses, 3 turrets, 3 mines, any 2 flags (money back)
  cellH: 40, rows: EMBED ? 5 : 3, fill: [0.04, 0.12, 0.2, 0.22, 0.22, 0.2] };   // rows = symbols visible per reel (the payline is the middle one); the side panel has room for 5
const sl = { busy: false, msg: '', cells: [0, 1, 2].map(() => Array.from({ length: SL.rows }, () => 1 + Math.random() * 5 | 0)), timer: 0, iv: 0 };
const SL_WIN = ['Dividends delivered. Super Earth salutes your luck.', 'A clerical error in your favour. It will be corrected.'];
const SL_LOSE = ['The reels have been redistributed to the war effort.', 'So close. Liberty is always nearly yours.', 'Your contribution is appreciated and non-refundable.', 'The house is Super Earth. Super Earth thanks you.'];
const FILL = [0.12, 0.2, 0.22, 0.22, 0.24];                    // filler symbol weights for bomb..mine (flags never appear as filler)
const symPick = () => { let r = Math.random(); for (let i = 0; i < 5; i++) { r -= FILL[i]; if (r <= 0) return i + 1; } return 5; };
const symSvg = i => `<div class="sym" style="color:${SL.col[i]}">${iconSVG({ icon: SL.sym[i] })}</div>`;
function slotsPick(bet) {
  let f = 1;
  if (eco.sl.cool > 0) { eco.sl.cool--; f = 0.4; }
  if (bet >= 250) f *= 0.75;
  let outcome = -1;                                        // index into SL.w, 6 = two flags, -1 = loss
  if (f === 1 && eco.sl.loss >= 5 && Math.random() < 0.4) outcome = Math.random() < 0.5 ? 6 : 5;   // throw a small bone after a long dry spell
  else { let r = Math.random(); for (let i = 0; i < SL.w.length; i++) { r -= SL.w[i] * f; if (r <= 0) { outcome = i; break; } } }
  const mid = [0, 1, 2];
  if (outcome >= 0 && outcome <= 5) return { mult: SL.pay[outcome], mid: [outcome, outcome, outcome] };
  if (outcome === 6) { const odd = Math.random() * 3 | 0; return { mult: 1, mid: mid.map(k => k === odd ? 1 + (Math.random() * 5 | 0) : 0) }; }
  if (Math.random() < 0.35) {                              // near miss: two matching big symbols, third one different
    const h = 1 + (Math.random() * 3 | 0); let o; do { o = 1 + (Math.random() * 5 | 0); } while (o === h);
    const odd = Math.random() * 3 | 0; return { mult: 0, mid: mid.map(k => k === odd ? o : h) };
  }
  let m; do { m = mid.map(() => Math.random() < 0.012 ? 0 : symPick()); } while ((m[0] === m[1] && m[1] === m[2]) || m.filter(x => x === 0).length >= 2);
  return { mult: 0, mid: m };
}
function renderSlots() {
  $('slots').innerHTML = `${reinvHead('slots')}
    <div class="reels" id="reels" style="--rows:${SL.rows}">${[0, 1, 2].map(i => `<div class="reel"><div class="strip">${sl.cells[i].map(symSvg).join('')}</div></div>`).join('')}</div>
    <div class="pay">${[0, 1, 2, 3, 4, 5].map(i => `<span style="color:${SL.col[i]}">${iconSVG({ icon: SL.sym[i] })}<b>${SL.pay[i]}×</b></span>`).join('')}<span><b>2 flags 1×</b></span></div>
    ${betsRow()}
    <div class="who" id="slMsg">${sl.msg || 'Three of a kind on the line pays. Lucky Liberty favours the bold.'}</div>
    <div class="btnrow"><button class="btn" id="slDrop">Spin ${pk.bet} SC</button><button class="btn alt" id="backBtn">Back [Esc]</button></div>`;
  bindReinv('slots'); $('slDrop').onclick = spinSlots;
}
function spinSlots() {
  if (sl.busy || view !== 'slots') return;
  if (eco.credits < pk.bet) return toast('Not enough Super Credits');
  const bet = pk.bet, res = slotsPick(bet), payout = Math.round(bet * res.mult);
  eco.credits += payout - bet;                             // settled immediately, like Democracy Drop
  stats.spins++; stats.slotWagered += bet; stats.slotPayout += payout; if (res.mult >= 50) stats.slotJackpots++;
  if (res.mult >= 5) eco.sl.cool = 2;
  eco.sl.loss = payout < bet ? eco.sl.loss + 1 : 0;
  saveEco(); saveStats();
  sl.busy = true; refreshBets('slots'); $('slMsg').textContent = 'Spinning…'; $('reels').classList.remove('win');
  const H = SL.cellH;
  $('slots').querySelectorAll('.strip').forEach((st, i) => {
    const R = SL.rows, fill = 12 + i * 7, finalCells = Array.from({ length: R }, (_, k) => k === R >> 1 ? res.mid[i] : symPick());
    const seq = [...sl.cells[i], ...Array.from({ length: fill }, symPick), ...finalCells];
    st.style.transition = 'none'; st.style.transform = 'translateY(0)'; st.innerHTML = seq.map(symSvg).join(''); void st.offsetWidth;
    const dur = 1.3 + i * 0.55;
    st.style.transition = `transform ${dur}s cubic-bezier(.15,.75,.25,1)`; st.style.transform = `translateY(${-(seq.length - R) * H}px)`;
    sl.cells[i] = finalCells;
    setTimeout(sfx.shield, dur * 1000);
  });
  clearInterval(sl.iv); sl.iv = setInterval(() => sfx.correct(Math.random() * 4 | 0), 120);
  setTimeout(() => { clearInterval(sl.iv); landSlots(bet, res, payout); }, 1.3 * 1000 + 2 * 550 + 250);
}
function landSlots(bet, res, payout) {
  sl.busy = false;
  const net = payout - bet;
  sl.msg = `${res.mult ? res.mult + '× · ' : ''}${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))} SC. ` + (res.mult === 1 ? 'Two flags: your investment is returned.' : randOf(net > 0 ? SL_WIN : SL_LOSE));
  if (view === 'slots') {
    $('slMsg').textContent = sl.msg; $('reels').classList.toggle('win', res.mult > 0);
    const c = $('slots').querySelector('.sc'); if (c) c.textContent = '★ ' + fmt(eco.credits) + ' SC';
    refreshBets('slots'); if (eco.credits < PK.bets[0]) $('slMsg').textContent = sl.msg + ' You are out of Super Credits.';
  }
  res.mult >= 50 ? sfx.round() : net > 0 ? sfx.complete() : res.mult === 1 ? sfx.shield() : sfx.mistake();
  awardMedals(null).forEach(medalPopup);
}

/* ======================= SUPPLY DROPS (loot crates) ======================= */
// Same house-edge recipe as the other two games: the rarity is chosen FIRST from a skewed table, then the item strip is stopped on it.
// Losing crates are often staged as near misses (an epic or legendary item sits right next to the winning slot).
// A rare+ pull "cools" the next two crates, and a long dry spell occasionally gets a small refund. Dearer crates are worse value.
const DR = {
  tiers: [{ name: 'Standard Drop', price: 50 }, { name: 'Reinforced Drop', price: 150 }, { name: 'Hellpod Cache', price: 400 }],
  rar: [{ n: 'Common', c: 'var(--dim)' }, { n: 'Uncommon', c: 'var(--lb)' }, { n: 'Rare', c: 'var(--b)' }, { n: 'Epic', c: '#c77dff' }, { n: 'Legendary', c: 'var(--y)' }],
  items: [
    [['Spent Casings', 0.1, 'recoilless'], ['Expired Rations', 0.2, 'resupply'], ['Crumpled Flag', 0.3, 'flag']],
    [['Ammo Resupply', 0.6, 'resupply'], ['Stim Pack', 0.9, 'reinforce']],
    [['Supply Pack', 1.5, 'supplypack'], ['Eagle Rearm Kit', 2, 'rearm']],
    [['Orbital Care Package', 5, 'laser'], ['Hellpod Windfall', 6, 'pods']],
    [['Super Earth Dividend', 25, 'flag'], ['Managed Democracy Bonus', 30, 'hellbomb']]
  ],
  w: [[0.64, 0.275, 0.073, 0.011, 0.001], [0.67, 0.26, 0.062, 0.0075, 0.0005], [0.70, 0.25, 0.045, 0.0048, 0.0002]],
  show: [0.36, 0.26, 0.2, 0.12, 0.06],                    // what the spinning strip LOOKS like (richer than what you actually get)
  cell: 70, win: 360, len: 36 };
const dr = { busy: false, msg: '', strip: null };
const DR_WIN = ['Supply secured. Super Earth is pleased with your loyalty.', 'The crate was meant for someone else. Enjoy it anyway.'];
const DR_LOSE = ['Contents reclassified as "morale".', 'The good items were requisitioned by High Command.', 'A fine crate of nothing in particular. Open another.', 'So close. The next one is definitely better.'];
const drItem = r => { const l = DR.items[r], it = l[Math.random() * l.length | 0]; return { r, name: it[0], mult: it[1], icon: it[2] }; };
const drShow = () => { let x = Math.random(); for (let r = 0; r < 5; r++) { x -= DR.show[r]; if (x <= 0) return drItem(r); } return drItem(0); };
function cratePick(tier) {
  let w = DR.w[tier].slice(), f = 1;
  if (eco.dr.cool > 0) { eco.dr.cool--; f = 0.35; }
  w = w.map((x, i) => i >= 2 ? x * f : x); w[0] += DR.w[tier].slice(2).reduce((a, b) => a + b, 0) * (1 - f);
  if (f === 1 && eco.dr.loss >= 5 && Math.random() < 0.4) return drItem(Math.random() < 0.7 ? 1 : 2);    // a small bone after a dry spell
  let x = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let r = 0; r < 5; r++) { x -= w[r]; if (x <= 0) return drItem(r); }
  return drItem(0);
}
const drCell = it => `<div class="dcell r${it.r}" style="--rc:${DR.rar[it.r].c}">${iconSVG({ icon: it.icon })}<small>${it.mult}×</small></div>`;
function renderDrops() {
  const t = eco.dr.tier;
  if (!dr.strip) dr.strip = Array.from({ length: 6 }, drShow);
  $('drops').innerHTML = `${reinvHead('drops')}
    <div class="dwin" id="dwin"><div class="dstrip" id="dstrip">${dr.strip.map(drCell).join('')}</div><i class="dmark"></i></div>
    <div class="rarrow">${DR.rar.map(r => `<span style="color:${r.c}">${r.n}</span>`).join('')}</div>
    <div class="bets" id="drTiers">${DR.tiers.map((x, i) => `<button class="navbtn ${i === t ? 'act' : ''}" data-tier="${i}">${x.name}<br>${x.price} SC</button>`).join('')}</div>
    <div class="who" id="drMsg">${dr.msg || 'Pick a crate. Contents are classified until they are yours.'}</div>
    <div class="btnrow"><button class="btn" id="drOpen">Open crate ${DR.tiers[t].price} SC</button><button class="btn alt" id="backBtn">Back [Esc]</button></div>`;
  bindReinv('drops'); $('drOpen').onclick = openCrate;
  $('drops').querySelectorAll('[data-tier]').forEach(b => b.onclick = () => setTier(+b.dataset.tier));
  const st = $('dstrip'); st.style.transform = `translateX(${-(dr.strip.length - 3) * DR.cell - DR.cell / 2 + DR.win / 2}px)`;
}
function refreshDrops() {
  if (!$('drOpen')) return;
  const aff = DR.tiers.map(x => x.price <= eco.credits);
  if (!aff[eco.dr.tier]) { const ok = aff.lastIndexOf(true); eco.dr.tier = ok >= 0 ? ok : 0; }
  $('drops').querySelectorAll('[data-tier]').forEach(el => { const i = +el.dataset.tier; el.classList.toggle('act', i === eco.dr.tier); el.classList.toggle('dis', !aff[i]); });
  $('drOpen').textContent = `Open crate ${DR.tiers[eco.dr.tier].price} SC`; $('drOpen').classList.toggle('dis', dr.busy || !aff[eco.dr.tier]);
}
function setTier(i) { if (dr.busy || DR.tiers[i].price > eco.credits) return; eco.dr.tier = i; saveEco(); refreshDrops(); }
const stepTier = d => setTier(Math.max(0, Math.min(DR.tiers.length - 1, eco.dr.tier + d)));
function openCrate() {
  if (dr.busy || view !== 'drops') return;
  const tier = eco.dr.tier, price = DR.tiers[tier].price;
  if (eco.credits < price) return toast('Not enough Super Credits');
  const res = cratePick(tier), payout = Math.round(price * res.mult);
  eco.credits += payout - price;                           // settled immediately, so closing the popup mid-open loses nothing
  stats.crates++; stats.crateSpent += price; stats.cratePayout += payout; if (res.r === 4) stats.crateLegend++; if (res.r >= 3) stats.crateEpic++; if (res.r >= 2) stats.crateRare++; if (tier === 2) stats.crateHell++;
  if (res.r >= 3) eco.dr.cool = 2;
  eco.dr.loss = payout < price ? eco.dr.loss + 1 : 0;
  saveEco(); saveStats();
  dr.busy = true; refreshDrops(); $('drMsg').textContent = 'Opening…'; $('dwin').classList.remove('win');
  const L = DR.len, seq = Array.from({ length: L }, drShow), at = L - 3;
  seq[at] = res;
  if (res.r <= 1 && Math.random() < 0.6) seq[at + (Math.random() < 0.5 ? 1 : -1)] = drItem(Math.random() < 0.3 ? 4 : 3);   // near miss
  const st = $('dstrip'); st.style.transition = 'none'; st.style.transform = 'translateX(0)'; st.innerHTML = seq.map(drCell).join(''); void st.offsetWidth;
  const dur = 3.2; st.style.transition = `transform ${dur}s cubic-bezier(.12,.7,.2,1)`;
  st.style.transform = `translateX(${-at * DR.cell - DR.cell / 2 + DR.win / 2 - (Math.random() * 20 - 10)}px)`;
  dr.strip = [drShow(), drShow(), drShow(), res, drShow(), drShow()];
  clearInterval(dr.iv); dr.iv = setInterval(() => sfx.correct(Math.random() * 4 | 0), 140);
  setTimeout(() => { clearInterval(dr.iv); landCrate(price, res, payout); }, dur * 1000 + 150);
}
function landCrate(price, res, payout) {
  dr.busy = false;
  const net = payout - price, r = DR.rar[res.r];
  dr.msg = `${r.n}: ${res.name} (${res.mult}×) · ${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))} SC. ` + randOf(net > 0 ? DR_WIN : DR_LOSE);
  if (view === 'drops') {
    $('drMsg').textContent = dr.msg; $('dwin').classList.toggle('win', res.r >= 2); $('dwin').style.setProperty('--rc', r.c);
    const c = $('drops').querySelector('.sc'); if (c) c.textContent = '★ ' + fmt(eco.credits) + ' SC';
    refreshDrops(); if (eco.credits < DR.tiers[0].price) $('drMsg').textContent = dr.msg + ' You are out of Super Credits.';
  }
  res.r === 4 ? sfx.round() : net > 0 ? sfx.complete() : sfx.mistake();
  awardMedals(null).forEach(medalPopup);
}

/* ======================= v3.8: CHALLENGES (daily + weekly) ======================= */
const weekKey = () => {                                  // ISO week of the local date, e.g. 2026-W43; a new one starts every Monday
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const w1 = new Date(d.getFullYear(), 0, 4);
  return d.getFullYear() + '-W' + String(1 + Math.round(((d - w1) / 864e5 - 3 + (w1.getDay() + 6) % 7) / 7)).padStart(2, '0');
};
// kind: 'sum' adds up across runs, 'max' keeps the best single value. goals: [daily goals, weekly goals], matching CH_REWARD.
const CH_DEFS = {
  codes:    { text: n => `Call ${fmt(n)} stratagems`, kind: 'sum', val: e => e.completed || 0, goals: { d: [40, 60, 90], w: [250, 400, 600] } },
  runs:     { text: n => `Finish ${n} deployments`, kind: 'sum', val: e => e.runs || 0, goals: { d: [2, 3, 4], w: [8, 12, 16] } },
  streak:   { text: n => `Chain ${n} codes without a mistake in one run`, kind: 'max', val: e => e.bestStreak || 0, goals: { d: [10, 15, 20], w: [25, 35, 50] } },
  score:    { text: n => `Score ${fmt(n)} in a single run`, kind: 'max', val: e => e.score || 0, goals: { d: [800, 1500, 2500], w: [3000, 5000, 8000] } },
  rounds:   { text: n => `Clear ${n} rounds`, kind: 'sum', val: e => e.roundsCleared || 0, goals: { d: [2, 3, 5], w: [10, 15, 25] } },
  perfect:  { text: n => `Call ${n} stratagems with no mistakes`, kind: 'sum', val: e => e.perfect || 0, goals: { d: [20, 30, 45], w: [120, 200, 300] } },
  bombs:    { text: n => `Arm ${n} Hellbomb${n > 1 ? 's' : ''} in time`, kind: 'sum', val: e => e.hbWin || 0, goals: { d: [1, 2, 3], w: [4, 6, 8] } },
  acc:      { text: n => `Finish a run of 20+ stratagems at ${n}% accuracy`, kind: 'max', val: e => (e.completed >= 20 ? e.accuracy : 0), goals: { d: [90, 95, 97], w: [95, 97, 98] } },
  arcade:   { text: n => `Play ${n} arcade games`, kind: 'sum', val: e => e.arcade || 0, goals: { d: [2, 3, 4], w: [8, 12, 16] } },
  practice: { text: n => `Finish ${n} practice drill${n > 1 ? 's' : ''}`, kind: 'sum', val: e => e.practice || 0, goals: { d: [1, 2, 3], w: [4, 6, 8] } },
  endless:  { text: n => `Reach Endless level ${n}`, kind: 'max', val: e => e.endlessLevel || 0, goals: { d: [4, 6, 8], w: [10, 12, 15] } }
};
const CH_REWARD = { d: [25, 35, 45], w: [90, 120, 150] };
let chal = { day: '', week: '', d: {}, w: {}, arc: 0 };
function chSet(kind) {                                   // three challenges, the same for everyone on a given day / week
  const key = kind === 'd' ? today() : weekKey(), r = mulberry32(hashStr(kind + key)), ids = Object.keys(CH_DEFS);
  for (let i = ids.length - 1; i > 0; i--) { const j = r() * (i + 1) | 0; [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return ids.slice(0, 3).map(id => { const g = CH_DEFS[id].goals[kind], i = Math.min(g.length - 1, r() * g.length | 0); return { id, goal: g[i], reward: CH_REWARD[kind][i] }; });
}
function chRoll() {                                      // new day / new week: progress starts again
  const t = today(), w = weekKey();
  if (chal.day !== t) { chal.day = t; chal.d = {}; chal.arc = 0; }
  if (chal.week !== w) { chal.week = w; chal.w = {}; }
}
const challengeEvent = r => ({ completed: r.completed, runs: 1, bestStreak: r.bestStreak, score: r.score, roundsCleared: r.roundsCleared,
  perfect: r.perfect, hbWin: r.hbWin, accuracy: r.accuracy, endlessLevel: r.endless ? r.round : 0 });
function tickChallenges(ev) {                            // folds one run (or arcade game, or drill) in; pays out finished challenges at once
  chRoll(); const done = [];
  [['d', chal.d], ['w', chal.w]].forEach(([kind, prog]) => chSet(kind).forEach(c => {
    const def = CH_DEFS[c.id], p = prog[c.id] || { p: 0, done: false };
    if (p.done) return;
    const v = def.val(ev); if (!v) return;
    p.p = def.kind === 'sum' ? p.p + v : Math.max(p.p, v);
    if (p.p >= c.goal) { p.done = true; stats.challenges++; eco.credits += c.reward; eco.earned += c.reward; done.push({ text: def.text(c.goal), reward: c.reward, kind }); }
    prog[c.id] = p;
  }));
  sSet(CHAL, chal);
  if (done.length) { saveEco(); saveStats(); done.forEach(() => sfx.coin()); }
  return done;
}
const chNotes = list => (list || []).map(c => `<p class="flavor medal">✔ ${c.kind === 'd' ? 'Daily' : 'Weekly'} challenge: <b>${c.text}</b> (+${c.reward} SC)</p>`).join('');
function openChallenges() { chRoll(); renderChallenges(); show('challenges'); }
function renderChallenges() {
  keepScroll('challenges', () => {
    chRoll();
    const row = (kind, c) => {
      const def = CH_DEFS[c.id], p = (kind === 'd' ? chal.d : chal.w)[c.id] || { p: 0, done: false }, pct = Math.min(100, p.p / c.goal * 100);
      return `<div class="row ch ${p.done ? 'done' : ''}"><span><b>${def.text(c.goal)}</b><div class="pbar"><i style="width:${pct}%"></i></div>
        <small>${p.done ? 'Complete' : fmt(Math.min(p.p, c.goal)) + ' / ' + fmt(c.goal)}</small></span><em>${p.done ? '✔ Paid' : '+' + c.reward + ' SC'}</em></div>`;
    };
    const mid = new Date(); mid.setHours(24, 0, 0, 0);
    const hrs = Math.max(1, Math.ceil((mid - Date.now()) / 36e5)), wk = new Date(); wk.setHours(0, 0, 0, 0);
    const days = 7 - ((wk.getDay() + 6) % 7);
    const dl = chSet('d'), wl = chSet('w'), dn = dl.filter(c => (chal.d[c.id] || {}).done).length, wn = wl.filter(c => (chal.w[c.id] || {}).done).length;
    $('challenges').innerHTML = `<div class="mtop"><h2 class="display sm">Challenges</h2>${scChip()}</div>
      <div class="who">Bonus Super Credits, paid the moment you finish one · ${fmt(stats.challenges)} completed so far</div>
      <div class="scrollbox"><h3>Daily · ${dn}/3 · resets in ${hrs}h</h3>${dl.map(c => row('d', c)).join('')}
        <h3>Weekly · ${wn}/3 · resets in ${days} day${days > 1 ? 's' : ''}</h3>${wl.map(c => row('w', c)).join('')}
        <p class="flavor">Runs, practice drills and arcade games all count. Tutorial runs do not.</p></div>
      <button class="btn alt" id="backBtn">Back [Esc]</button>`;
    $('challenges').querySelector('#backBtn').onclick = showMenu;
  });
}

/* ======================= v3.8: PRACTICE (pick the stratagems to drill) ======================= */
const ARR = { U: '▲', D: '▼', L: '◀', R: '▶' }, PR_COUNTS = [10, 20, 30, 50];
const pr = { cat: 'all', q: '' };
function openPractice() { buildPractice(); show('practice'); lockInput(); }
function buildPractice() {
  $('practice').innerHTML = `<div class="mtop"><h2 class="display sm">Practice</h2><span class="who" id="prCount"></span></div>
    <div class="who">No timer, no credits. Pick what to drill; mistakes only reset the code.</div>
    <input type="search" id="prQ" class="field" placeholder="Search stratagems" autocomplete="off" value="${pr.q}">
    <div class="rchips" id="prCats">${[['all', 'All'], ...Object.entries(CATEGORIES).map(([k, c]) => [k, c.label])].map(([k, l]) => `<button class="navbtn ${pr.cat === k ? 'act' : ''}" data-c="${k}">${l}</button>`).join('')}</div>
    <div class="rchips"><button class="navbtn" id="prAll">Select shown</button><button class="navbtn" id="prNone">Clear</button>
      <span class="who">Length</span>${PR_COUNTS.map(n => `<button class="navbtn ${eco.pr.count === n ? 'act' : ''}" data-n="${n}">${n}</button>`).join('')}</div>
    <div class="scrollbox" id="prList"></div>
    <div class="btnrow"><button class="btn" id="prGo">Start [Enter]</button><button class="btn alt" id="backBtn">Back [Esc]</button></div>`;
  $('prQ').oninput = e => { pr.q = e.target.value.trim().toLowerCase(); fillPractice(); };
  $('prCats').querySelectorAll('[data-c]').forEach(b => b.onclick = () => { pr.cat = b.dataset.c; $('prCats').querySelectorAll('[data-c]').forEach(x => x.classList.toggle('act', x === b)); fillPractice(); });
  $('practice').querySelectorAll('[data-n]').forEach(b => b.onclick = () => { eco.pr.count = +b.dataset.n; saveEco(); $('practice').querySelectorAll('.rchips [data-n]').forEach(x => x.classList.toggle('act', x === b)); });
  $('prAll').onclick = () => { practiceShown().forEach(s => { if (!eco.pr.names.includes(s.name)) eco.pr.names.push(s.name); }); saveEco(); fillPractice(); };
  $('prNone').onclick = () => { eco.pr.names = []; saveEco(); fillPractice(); };
  $('prGo').onclick = startPractice; $('practice').querySelector('#backBtn').onclick = showMenu;
  fillPractice();
}
const practiceShown = () => STRATAGEMS.filter(s => (pr.cat === 'all' || s.cat === pr.cat) && (!pr.q || s.name.toLowerCase().includes(pr.q)));
function fillPractice() {
  const sel = new Set(eco.pr.names), box = $('prList'), y = box.scrollTop;
  box.innerHTML = practiceShown().map(s => `<button class="row ${sel.has(s.name) ? 'on' : ''}" data-s="${s.name.replace(/"/g, '&quot;')}">
    <span class="tick">${sel.has(s.name) ? '☑' : '☐'}</span><span><b>${s.name}</b><small>${s.code.map(d => ARR[d]).join(' ')}</small></span><em style="color:${CATEGORIES[s.cat].color}">${CATEGORIES[s.cat].label}</em></button>`).join('')
    || '<p class="flavor">Nothing matches that search.</p>';
  box.scrollTop = y;
  box.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
    const n = b.dataset.s, i = eco.pr.names.indexOf(n); i < 0 ? eco.pr.names.push(n) : eco.pr.names.splice(i, 1);
    saveEco(); b.classList.toggle('on', i < 0); b.querySelector('.tick').textContent = i < 0 ? '☑' : '☐'; $('prCount').textContent = eco.pr.names.length + ' selected';
  });
  $('prCount').textContent = eco.pr.names.length + ' selected';
}
function startPractice() {
  const names = eco.pr.names.filter(n => STRATAGEMS.some(s => s.name === n));
  if (!names.length) return toast('Pick at least one stratagem');
  const list = []; let bag = [];
  while (list.length < eco.pr.count) {                   // every pick comes round before any repeats
    if (!bag.length) { bag = names.slice(); for (let i = bag.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [bag[i], bag[j]] = [bag[j], bag[i]]; } if (list.length && bag[bag.length - 1] === list[list.length - 1] && bag.length > 1) bag.unshift(bag.pop()); }
    list.push(bag.pop());
  }
  DIFFICULTIES.practice.lessons = [{ title: 'Practice drill', names: list, tip: 'Mistakes only reset the code. Slow and clean first, then speed up.' }];
  game.start('practice');
}
function practiceResult(r) {
  const per = Object.keys(r.times).map(n => ({ n, c: r.times[n].length, avg: r.times[n].reduce((a, b) => a + b, 0) / r.times[n].length, miss: r.missBy[n] || 0 }));
  const all = per.reduce((a, x) => a + x.avg * x.c, 0), avg = r.completed ? all / r.completed : 0;
  const slow = per.filter(x => x.c).sort((a, b) => b.avg - a.avg).slice(0, 3), bad = per.filter(x => x.miss).sort((a, b) => b.miss - a.miss).slice(0, 3);
  const weak = [...new Set([...bad, ...slow].map(x => x.n))].slice(0, 6);
  const list = (arr, f) => arr.length ? arr.map(x => `<p class="flavor">${x.n}: ${f(x)}</p>`).join('') : '<p class="flavor">None. Clean work.</p>';
  $('result').innerHTML = `<h2 class="display ok">Drill complete</h2>
    <div class="stats">${stat('Stratagems', r.completed)}${stat('Accuracy', r.accuracy + '%')}${stat('Average per code', avg.toFixed(1) + 's')}${stat('Best streak', r.bestStreak)}</div>
    <h3>Slowest</h3>${list(slow, x => x.avg.toFixed(1) + 's average')}<h3>Most missed</h3>${list(bad, x => x.miss + ' mistake' + (x.miss > 1 ? 's' : ''))}
    <div class="btnrow"><button class="btn" id="againBtn">Again [Enter]</button>${weak.length ? '<button class="btn alt" id="weakBtn">Drill weak spots</button>' : ''}<button class="btn alt" id="menuBtn">Menu [Esc]</button></div>`;
  $('againBtn').onclick = startPractice; $('menuBtn').onclick = showMenu;
  const wb = $('weakBtn'); if (wb) wb.onclick = () => { eco.pr.names = weak; saveEco(); startPractice(); };
  show('result');
}

const arrowSvg = () => `<svg viewBox="0 0 24 24"><path d="M12 2 22 13h-6v9H8v-9H2z"/></svg>`;

/* ======================= v3.8: ARCADE (two quick skill games) ======================= */
const ARC_DAY_CAP = 250;                                 // most Super Credits the arcade pays out per day
let arcTab = 'memory';
const arc = { raf: 0, timers: [], mem: null, def: null };
const arcLater = (fn, ms) => { arc.timers.push(setTimeout(fn, ms)); };
function stopArcade() {
  arc.timers.forEach(clearTimeout); arc.timers = []; cancelAnimationFrame(arc.raf); arc.raf = 0;
  if (arc.mem) arc.mem.on = false; if (arc.def) arc.def.on = false;
}
const padHTML = () => ['U', 'L', 'R', 'D'].map(d => `<button class="pad" data-pd="${d}" data-d="${d}" aria-label="${{ U: 'Up', D: 'Down', L: 'Left', R: 'Right' }[d]}">${arrowSvg()}</button>`).join('');
const arcHead = active => `<div class="mtop"><h2 class="display sm">Arcade</h2>${scChip()}</div>
  <div class="btnrow tabs"><button class="navbtn ${active === 'memory' ? 'act' : ''}" data-at="memory">Code Memory</button><button class="navbtn ${active === 'defense' ? 'act' : ''}" data-at="defense">Airburst Defense</button></div>`;
function openArcade(tab) {
  stopArcade(); arcTab = tab || arcTab;
  (arcTab === 'defense' ? renderDefense : renderMemory)();
  show('arcade'); lockInput();
}
function bindArcade() {
  $('arcade').querySelectorAll('[data-at]').forEach(b => b.onclick = () => openArcade(b.dataset.at));
  $('arcade').querySelector('#backBtn').onclick = showMenu;
}
const arcMsg = t => { const m = $('arcMsg'); if (m) m.textContent = t; };
function arcPay(key, score, round, n, base) {            // credits (capped per day), stats, leaderboard, challenges, medals
  chRoll();
  const pay = Math.max(0, Math.min(base, ARC_DAY_CAP - (chal.arc || 0)));
  chal.arc = (chal.arc || 0) + pay; eco.credits += pay; eco.earned += pay;
  stats.arcade++; streakTick(); if (key === 'memory') stats.memBest = Math.max(stats.memBest, round); else stats.defBest = Math.max(stats.defBest, score);
  tickChallenges({ arcade: 1 });
  awardMedals(null).forEach(medalPopup);
  saveEco(); saveStats();
  const c = $('arcade').querySelector('.sc'); if (c) c.textContent = '★ ' + fmt(eco.credits) + ' SC';
  return { pay, capped: pay < base };
}
const payText = p => `+${p.pay} SC${p.capped ? ' (daily arcade limit reached)' : ''}`;
const flashPad = (d, ms) => { const b = $('arcade').querySelector(`.pad[data-pd="${d}"]`); if (!b) return; b.classList.add('on'); setTimeout(() => b.classList.remove('on'), ms); };

/* -- Code Memory: watch a growing arrow sequence, then repeat it -- */
function renderMemory() {
  $('arcade').innerHTML = arcHead('memory') + `<div class="who">Watch the arrows, then repeat them. Best: round ${stats.memBest || '—'}</div>
    <div class="memhud"><span>Round <b id="mmRound">0</b></span><span>Length <b id="mmLen">0</b></span><span>Score <b id="mmScore">0</b></span></div>
    <div class="dpad" id="mmPad">${padHTML()}</div><div class="arcmsg" id="arcMsg">Press Start, watch the pads light up, then repeat them in order.</div>
    <div class="btnrow"><button class="btn" id="mmGo">Start [Enter]</button><button class="btn alt" id="backBtn">Back [Esc]</button></div>`;
  bindArcade(); $('mmGo').onclick = memStart;
  $('mmPad').querySelectorAll('.pad').forEach(b => b.onclick = () => memInput(b.dataset.pd));
}
const rndDir = () => 'UDLR'[Math.random() * 4 | 0];
function memStart() { stopArcade(); arc.mem = { on: true, seq: [], idx: 0, round: 0, score: 0, phase: 'show' }; $('mmGo').textContent = 'Restart [Enter]'; memNext(); }
function memNext() {
  const m = arc.mem; if (!m || !m.on) return;
  m.round++; m.idx = 0; m.phase = 'show'; m.seq = m.round === 1 ? [rndDir(), rndDir(), rndDir()] : m.seq.concat(rndDir());
  $('mmRound').textContent = m.round; $('mmLen').textContent = m.seq.length; $('mmScore').textContent = m.score; arcMsg('Watch…');
  const gap = Math.max(260, 640 - m.round * 24);
  m.seq.forEach((d, i) => arcLater(() => { if (arc.mem === m && m.on) { flashPad(d, gap * 0.6); sfx.correct('UDLR'.indexOf(d) + 1); } }, 600 + i * gap));
  arcLater(() => { if (arc.mem === m && m.on) { m.phase = 'input'; arcMsg('Your turn!'); } }, 600 + m.seq.length * gap);
}
function memInput(d) {
  const m = arc.mem; if (!m || !m.on || m.phase !== 'input') return;
  flashPad(d, 160);
  if (d !== m.seq[m.idx]) return memOver();
  m.idx++; m.score += 10; sfx.correct(m.idx); $('mmScore').textContent = m.score;
  if (m.idx === m.seq.length) { m.phase = 'wait'; sfx.complete(); arcMsg('Round cleared!'); arcLater(memNext, 750); }
}
function memOver() {
  const m = arc.mem; m.on = false; m.phase = 'over'; sfx.mistake();
  const cleared = m.round - 1, p = arcPay('memory', m.score, cleared, cleared, Math.min(40, Math.floor(cleared * 3.5)));
  arcMsg(`Wrong arrow. You cleared ${cleared} round${cleared === 1 ? '' : 's'} · ${m.score} points · ${payText(p)}`);
  $('mmGo').textContent = 'Play again [Enter]';
}

/* -- Airburst Defense: press the arrow on each falling pod before it lands -- */
const DF = { W: 372, H: 260 };
function renderDefense() {
  $('arcade').innerHTML = arcHead('defense') + `<div class="who">Press the arrow on each falling pod to shoot it down. Best: ${stats.defBest ? fmt(stats.defBest) : '—'}</div>
    <div class="memhud"><span>Wave <b id="dfWave">0</b></span><span>Lives <b id="dfLives">3</b></span><span>Score <b id="dfScore">0</b></span></div>
    <canvas id="dfCanvas" width="${DF.W}" height="${DF.H}"></canvas>
    <div class="dpad compact" id="dfPad">${padHTML()}</div><div class="arcmsg" id="arcMsg">Pods fall faster every wave. Three that land and the base is lost.</div>
    <div class="btnrow"><button class="btn" id="dfGo">Start [Enter]</button><button class="btn alt" id="backBtn">Back [Esc]</button></div>`;
  bindArcade(); $('dfGo').onclick = dfStart;
  $('dfPad').querySelectorAll('.pad').forEach(b => b.onclick = () => dfInput(b.dataset.pd));
  dfDraw(null);
}
function dfStart() {
  stopArcade();
  arc.def = { on: true, targets: [], lives: 3, score: 0, kills: 0, wave: 1, streak: 0, spawn: 0.6, last: performance.now(), flash: 0, hit: [] };
  $('dfGo').textContent = 'Restart [Enter]'; arcMsg('Go!');
  arc.raf = requestAnimationFrame(dfLoop);
}
function dfLoop(t) {
  const g = arc.def; if (!g || !g.on) return;
  const dt = Math.min(0.05, (t - g.last) / 1000); g.last = t;
  g.spawn -= dt;
  if (g.spawn <= 0) {
    const speed = Math.min(130, 34 + g.wave * 8 + Math.random() * 10);
    g.targets.push({ x: 26 + Math.random() * (DF.W - 52), y: -14, d: rndDir(), vy: speed });
    g.spawn = Math.max(0.42, 1.5 - g.wave * 0.09);
  }
  g.targets.forEach(o => { o.y += o.vy * dt; });
  const land = g.targets.filter(o => o.y >= DF.H - 24);
  if (land.length) {
    g.targets = g.targets.filter(o => o.y < DF.H - 24); g.lives -= land.length; g.streak = 0; g.flash = 0.3; sfx.mistake();
    if (g.lives <= 0) { g.lives = 0; return dfOver(); }
  }
  g.hit = g.hit.filter(h => (h.t -= dt) > 0); g.flash = Math.max(0, g.flash - dt);
  dfDraw(g); $('dfLives').textContent = g.lives; $('dfScore').textContent = g.score; $('dfWave').textContent = g.wave;
  arc.raf = requestAnimationFrame(dfLoop);
}
function dfInput(d) {
  const g = arc.def; if (!g || !g.on) return;
  flashPad(d, 120);
  const t = g.targets.filter(o => o.d === d).sort((a, b) => b.y - a.y)[0];   // the lowest pod with that arrow
  if (!t) { g.streak = 0; g.score = Math.max(0, g.score - 5); sfx.mistake(); return; }
  g.targets.splice(g.targets.indexOf(t), 1); g.hit.push({ x: t.x, y: t.y, t: 0.25 });
  g.streak++; g.kills++; g.score += Math.round(10 * (1 + Math.min(g.streak - 1, 10) * 0.1)); sfx.correct(Math.min(8, g.streak));
  const w = 1 + Math.floor(g.kills / 10); if (w > g.wave) { g.wave = w; popArcade('Wave ' + w); sfx.round(); }
}
const popArcade = t => arcMsg(t);
function dfDraw(g) {
  const cv = $('dfCanvas'); if (!cv) return;
  const c = cv.getContext('2d'), cs = getComputedStyle(cv), y = cs.getPropertyValue('--y').trim() || '#ffd60a', lb = cs.getPropertyValue('--lb').trim() || '#7fd0ff',
    dark = cs.getPropertyValue('--dark').trim() || '#000', gl = cs.getPropertyValue('--gl').trim() || '#456', txt = cs.getPropertyValue('--txt').trim() || '#fff';
  c.clearRect(0, 0, DF.W, DF.H); c.fillStyle = dark; c.fillRect(0, 0, DF.W, DF.H);
  c.strokeStyle = gl; c.lineWidth = 1; for (let x = 0; x < DF.W; x += 31) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, DF.H); c.stroke(); }
  c.fillStyle = g && g.flash > 0 ? '#ff6b5e' : lb; c.fillRect(0, DF.H - 18, DF.W, 3);            // the base line turns red when a pod lands
  c.fillStyle = gl; c.fillRect(0, DF.H - 15, DF.W, 15);
  if (!g) return;
  const path = new Path2D('M12 2 22 13h-6v9H8v-9H2z');
  g.targets.forEach(o => {
    c.save(); c.translate(o.x, o.y); c.fillStyle = dark; c.strokeStyle = y; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 15, 0, 7); c.fill(); c.stroke();
    c.rotate({ U: 0, R: Math.PI / 2, D: Math.PI, L: -Math.PI / 2 }[o.d]); c.translate(-10, -10); c.scale(0.84, 0.84); c.fillStyle = txt; c.fill(path); c.restore();
  });
  g.hit.forEach(h => { c.strokeStyle = y; c.globalAlpha = Math.max(0, h.t * 4); c.lineWidth = 2; c.beginPath(); c.arc(h.x, h.y, 15 + (0.25 - h.t) * 90, 0, 7); c.stroke(); c.globalAlpha = 1; });
}
function dfOver() {
  const g = arc.def; g.on = false; cancelAnimationFrame(arc.raf);
  const p = arcPay('defense', g.score, g.wave, g.kills, Math.min(40, Math.floor(g.score / 25)));
  dfDraw(g); sfx.over();
  arcMsg(`Base lost on wave ${g.wave} · ${g.kills} pods shot · ${fmt(g.score)} points · ${payText(p)}`);
  $('dfGo').textContent = 'Play again [Enter]';
}
function arcadeKey(dir, go, k) {                         // keyboard for whichever arcade game is showing
  if (k === 'Escape') { showMenu(); return; }
  if (k === '1') return openArcade('memory'); if (k === '2') return openArcade('defense');
  if (arcTab === 'memory') { if (dir) memInput(dir); else if (go && (!arc.mem || !arc.mem.on) && performance.now() >= unlockAt) memStart(); }
  else { if (dir) dfInput(dir); else if (go && (!arc.def || !arc.def.on) && performance.now() >= unlockAt) dfStart(); }
}

/* ======================= INPUT ======================= */
/* Keyboard: capture arrows/WASD/Space/Enter/Esc so the page never scrolls */
document.addEventListener('keydown', e => {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { if (e.key === 'Escape') e.target.blur(); return; }   // typing in the practice search box
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key, dir = KEYMAP[k] || KEYMAP[k.toLowerCase()];
  if (dir || k === ' ' || k === 'Enter' || k === 'Escape') e.preventDefault();
  if (e.repeat) return;
  const ok = performance.now() >= unlockAt, go = k === 'Enter' || k === ' ';
  switch (game.state) {
    case 'playing':
      if (dir) game.input(dir); else if (k === ' ') game.skip(); else if (k === 'p' || k === 'P') togglePause(); else if (k === 'Escape') leaveRun(); break;
    case 'briefing':
      if (go && ok) deploy(); else if (k === 'Escape') leaveRun(); break;
    case 'roundEnd':
      if (go && ok) game.proceed(); else if (k === 'Escape') leaveRun(); break;
    case 'over':
      if (go && ok) redeploy(); else if (k === 'Escape' && ok) showMenu(); break;
    default:
      if (view === 'menu') {
        const key = menuKeys()[+k - 1], hot = { p: openPractice, c: openChallenges, a: () => openArcade() }[k.toLowerCase()];
        if (key) selectDiff(key); else if (hot) hot();
      }
      else if (view === 'practice') { if (go && ok) startPractice(); else if (k === 'Escape') showMenu(); }
      else if (view === 'arcade') arcadeKey(dir, go, k);
      else if (view === 'loadout') { if (go && ok) deployRun(); else if (k === 'Escape') showMenu(); }
      else if (view === 'plinko' || view === 'slots' || view === 'drops') {
        if (k === '1') openReinvest('plinko'); else if (k === '2') openReinvest('slots'); else if (k === '3') openReinvest('drops');
        else if (go && ok) (view === 'plinko' ? dropBall : view === 'slots' ? spinSlots : openCrate)();
        else if (dir === 'L' || dir === 'R') (view === 'drops' ? stepTier : stepBet)(dir === 'R' ? 1 : -1); else if (k === 'Escape') showMenu();
      }
      else if (k === 'Escape') showMenu();
  }
});
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); });
$('pauseOv').onclick = togglePause;
$('boosts').onclick = e => { if (e.target.closest('#skipBtn')) game.skip(); };

/* Header buttons */
$('btnMute').onclick = e => {
  setMuted(!isMuted()); setMutedPref(isMuted());
  e.currentTarget.textContent = 'Sound: ' + (isMuted() ? 'Off' : 'On'); e.currentTarget.blur();
};
const openView = (v, extra = {}) => {
  const url = chrome.runtime.getURL('drills/index.html?view=' + v);
  if (extra.type) chrome.windows.create({ url, ...extra }); else chrome.tabs.create({ url });
  window.close();
};
$('btnTab').onclick = () => openView('tab');
$('btnWin').onclick = () => openView('window', { type: 'popup', width: 900, height: 720 });

/* The tracker's Settings can change the theme while the game is open: follow it (only to a theme that is owned). */
if (area && chrome.storage.onChanged) chrome.storage.onChanged.addListener((ch, where) => {
  if (where === 'local' && ch.customTheme && eco) { window.hd2Custom.sync(ch.customTheme.newValue); syncCustomTheme(); if (eco.theme === 'custom') applyCosmetics(); }
  if (where !== 'local' || !ch.theme || !eco) return;
  const id = ch.theme.newValue;
  if (!id || id === eco.theme || !THEMES[id] || !themeOwned(id)) return;
  eco.theme = id; themeSaved = id; saveEco(); applyCosmetics();
  try { renderThemes(); } catch (e) { /* screen not built yet */ }
});

/* Boot: load saves, restore cosmetics + mute preference, show menu, run the frame loop */
(async () => {
  try { await loadSaves(); } catch (e) { showErr('could not read saved data (' + e.message + '), using defaults'); eco = ecoDefault(); stats = statsDefault(); }
  try {                                            // first run after the theme picker moved here: keep a Dark/Light choice made in the tracker's old Settings
    const old = area ? (await area.get('theme')).theme : null;
    if (eco.theme === 'earth' && old && old !== 'earth' && THEMES[old] && themeOwned(old)) { eco.theme = old; saveEco(); }   // a theme picked in the tracker's Settings before the game first ran
  } catch (e) { /* default look */ }
  applyCosmetics();
  setMuted(await getMuted());
  $('btnMute').textContent = 'Sound: ' + (isMuted() ? 'Off' : 'On');
  await showMenu();
  if (EMBED) window.parent.postMessage('hd2:ready', location.origin);
  let last = performance.now();
  (function loop(t) {
    const dt = Math.min(0.1, (t - last) / 1000); last = t;
    game.tick(dt); scrambleTick(dt);
    requestAnimationFrame(loop);
  })(last);
})();
})();
