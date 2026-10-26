// Pure helpers added in v3.5.0 (no DOM, no chrome.* calls) so the popup and the background worker share one set of rules.
import { campaignProgress, projection, parseTask, moOverall, clean, badgeInfo } from "./api.js";

const OWN = { Humans: "H", Terminids: "T", Automaton: "A", Illuminate: "I" };
const FACTION_NAME = { H: "Super Earth", T: "the Terminids", A: "the Automatons", I: "the Illuminate" };
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const planetMap = data => new Map((data?.planets || []).map(p => [p.index, p]));
const moKey = a => String(a?.id ?? a?.expiration ?? "");

// ---------- Major Order target planets (for the map overlay) ----------
// -> Map(planet index -> { label, done }) for every objective of every active order that names a planet.
export function moTargets(assignments = [], planets = new Map()) {
  const out = new Map();
  for (const a of assignments) (a.tasks || []).forEach((t, i) => {
    const r = parseTask(t, a.progress?.[i] ?? 0, planets, null);
    if (r.planetIdx === undefined) return;
    const prev = out.get(r.planetIdx);
    out.set(r.planetIdx, { label: r.label, done: prev ? prev.done && r.done : r.done });
  });
  return out;
}

// ---------- Defense campaigns that are likely to fail ----------
// ~90 minutes of (time, defense %) samples per defending planet, at most one a minute.
export function recordDefense(prev = {}, campaigns = [], planets = [], invert = false, now = Date.now()) {
  const byIdx = planetMap({ planets }), out = {};
  for (const c of campaigns) {
    const p = c.planet; if (!p || p.index === undefined) continue;
    const prog = campaignProgress(c, byIdx, invert);
    if (prog.kind !== "defense") continue;
    const key = prog.event?.endTime || "";
    const old = prev[p.index], same = old && old.end === key;      // a new attack on the same planet starts a fresh line
    const s = (same ? old.s : []).filter(x => x[0] >= now - 90 * 60e3);
    if (!s.length || now - s[s.length - 1][0] >= 60e3) s.push([now, +clamp(prog.pct).toFixed(3)]);
    out[p.index] = { end: key, s };
  }
  return out;
}

// -> one entry per active defense: { idx, name, pct, leftMs, perHour, risk }. `risk` means it will probably not be held
// and the deadline is inside `windowMs`. With too little history, only a late, low-progress defense is flagged.
export function defenseRisk(campaigns = [], planets = [], defHist = {}, invert = false, now = Date.now(), windowMs = 60 * 60e3) {
  const byIdx = planetMap({ planets }), out = [];
  for (const c of campaigns) {
    const prog = campaignProgress(c, byIdx, invert);
    if (prog.kind !== "defense") continue;
    const p = prog.planet, leftMs = new Date(prog.event.endTime) - now;
    if (!(leftMs > 0)) continue;
    const pct = clamp(prog.pct), pr = projection(defHist[p.index], pct, now, 30 * 60e3);
    let risk = false;
    if (leftMs <= windowMs) {
      if (pr.status === "ok") risk = pr.etaMs > leftMs;
      else if (pr.status === "stalled" || pr.status === "losing") risk = pct < 99.5;
      else risk = pct < 60 && leftMs <= Math.min(windowMs, 30 * 60e3);
    }
    out.push({ idx: p.index, name: p.name || `Planet ${p.index}`, pct, leftMs, perHour: pr.perHour, status: pr.status, risk, key: `${p.index}:${prog.event.endTime}` });
  }
  return out.sort((a, b) => a.leftMs - b.leftMs);
}

// ---------- "What to play" ranking ----------
// rows: the popup's campaign rows ({ p, prog, players, faction }). Returns the best places to help, best first, as plain data.
export function rankFronts(rows = [], { mo = new Map(), risk = new Map(), hist = {}, now = Date.now(), limit = 5 } = {}) {
  const live = rows.filter(r => r.prog.kind !== "parked");
  const attack = live.filter(r => r.prog.kind !== "defense");
  const maxPl = Math.max(1, ...attack.map(r => r.players));
  const out = [];
  for (const r of live) {
    const idx = r.p.index, pct = clamp(r.prog.pct), isMo = mo.has(idx) && !mo.get(idx).done;
    const reasons = [];
    if (r.prog.kind === "defense") {
      const leftMs = new Date(r.prog.event.endTime) - now; if (!(leftMs > 0)) continue;
      const rk = risk.get(idx), hrs = leftMs / 3.6e6;
      const score = 60 + 40 * (1 - Math.min(1, hrs / 12)) + (rk?.risk ? 30 : 0) + (isMo ? 12 : 0);
      out.push({ idx, name: r.p.name, faction: r.faction, kind: "defense", score, pct, players: r.players, leftMs, risk: !!rk?.risk, mo: isMo, reasons });
      continue;
    }
    const pr = projection(hist[idx], pct, now, 3600e3);
    const etaMs = pr.status === "ok" ? pr.etaMs : null;
    const crowd = 1 - Math.min(1, r.players / maxPl);                     // 1 = nobody there, 0 = the busiest front
    const score = 0.5 * pct + 0.3 * 100 * crowd + (isMo ? 15 : 0) + (etaMs !== null && etaMs < 3 * 3.6e6 ? 8 : 0) - (pr.status === "losing" ? 6 : 0);
    out.push({ idx, name: r.p.name, faction: r.faction, kind: r.prog.kind, score, pct, players: r.players, etaMs, rate: pr.status === "ok" ? pr.perHour : null,
      crowd, mo: isMo, region: r.prog.region, reasons });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---------- "What changed since you last looked" ----------
// A compact copy of the war (owner of every planet, progress of every front, progress of every order).
export function snapshotOf(data = {}, invert = false, now = Date.now()) {
  const byIdx = planetMap(data), own = {}, camps = {}, mo = {};
  for (const p of data.planets || []) own[p.index] = OWN[p.currentOwner] || "?";
  for (const c of data.campaigns || []) {
    const prog = campaignProgress(c, byIdx, invert), i = c.planet?.index; if (i === undefined) continue;
    camps[i] = [prog.kind === "defense" ? "d" : prog.kind === "parked" ? "p" : "l", +clamp(prog.pct).toFixed(2)];
  }
  for (const a of data.assignments || []) { const k = moKey(a); if (k) mo[k] = +moOverall(a, data, invert).toFixed(1); }
  const names = {}; for (const p of data.planets || []) if (camps[p.index] || own[p.index]) names[p.index] = p.name;
  return { at: now, own, camps, mo, names };
}

// -> [{ k, text, idx? }], most important first. k: good | bad | info
export function diffSnapshots(old, cur) {
  if (!old?.at || !cur) return [];
  const nm = i => cur.names?.[i] || old.names?.[i] || `Planet ${i}`, out = [];
  const changed = new Set();
  for (const [i, now] of Object.entries(cur.own)) {
    const was = old.own?.[i]; if (!was || was === "?" || now === "?" || was === now) continue;
    changed.add(i);
    if (now === "H") out.push({ k: "good", idx: +i, w: 100, text: `${nm(i)} was liberated from ${FACTION_NAME[was]}.` });
    else if (was === "H") out.push({ k: "bad", idx: +i, w: 99, text: `${nm(i)} fell to ${FACTION_NAME[now]}.` });
    else out.push({ k: "info", idx: +i, w: 60, text: `${nm(i)} changed hands: ${FACTION_NAME[was]} to ${FACTION_NAME[now]}.` });
  }
  for (const [i, [kind]] of Object.entries(cur.camps)) {
    if (old.camps?.[i] || changed.has(i)) continue;
    out.push({ k: kind === "d" ? "bad" : "info", idx: +i, w: kind === "d" ? 90 : 40, text: kind === "d" ? `${nm(i)} is under attack (new defense).` : `New front: ${nm(i)}.` });
  }
  for (const i of Object.keys(old.camps || {})) {
    if (cur.camps?.[i] || changed.has(i)) continue;
    out.push({ k: "info", idx: +i, w: 30, text: `The front on ${nm(i)} ended.` });
  }
  const movers = [];
  for (const [i, [kind, pct]] of Object.entries(cur.camps)) {
    const o = old.camps?.[i]; if (!o || o[0] !== kind || kind === "p") continue;
    const d = pct - o[1]; if (Math.abs(d) >= 2) movers.push({ i, d, kind, pct });
  }
  movers.sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 3).forEach(m =>
    out.push({ k: m.d > 0 ? "good" : "bad", idx: +m.i, w: 50, text: `${nm(m.i)} ${m.kind === "d" ? "defense" : "liberation"} ${m.d > 0 ? "up" : "down"} ${Math.abs(m.d).toFixed(1)}% (now ${m.pct.toFixed(1)}%).` }));
  for (const [k, pct] of Object.entries(cur.mo || {})) {
    if (!(k in (old.mo || {}))) out.push({ k: "info", w: 80, text: `A new Major Order is active (${pct.toFixed(0)}% done).` });
    else if (Math.abs(pct - old.mo[k]) >= 1) out.push({ k: pct > old.mo[k] ? "good" : "bad", w: 70, text: `Major Order ${pct > old.mo[k] ? "up" : "down"} ${Math.abs(pct - old.mo[k]).toFixed(0)}% (now ${pct.toFixed(0)}%).` });
  }
  for (const k of Object.keys(old.mo || {})) if (!(k in (cur.mo || {}))) out.push({ k: "info", w: 75, text: "The previous Major Order has ended." });
  return out.sort((a, b) => b.w - a.w).slice(0, 10);
}

// ---------- Major Order history and the war log (for the weekly recap) ----------
// One entry per order. When an order drops off the list it is closed: "done" if it vanished well before its deadline
// (it was completed), otherwise "expired" with the last progress we saw.
export function recordMoLog(log = [], list = [], data = {}, invert = false, now = Date.now()) {
  const out = log.map(e => ({ ...e })), live = new Set();
  for (const a of list) {
    const key = moKey(a); if (!key) continue;
    live.add(key);
    let e = out.find(x => x.key === key && !x.end);
    if (!e) { e = { key, start: now }; out.push(e); }
    e.title = clean(a.title) || e.title || "Major Order";
    e.medals = Number(a.reward?.amount) || e.medals || 0;
    e.exp = a.expiration ? Date.parse(a.expiration) || 0 : e.exp || 0;
    e.pct = +moOverall(a, data, invert).toFixed(1); e.last = now;
  }
  for (const e of out) if (!e.end && !live.has(e.key)) {
    e.end = now;
    e.status = e.exp && now < e.exp - 60e3 ? "done" : e.pct >= 99.5 ? "done" : "expired";
    if (e.status === "done") e.pct = 100;
  }
  return out.slice(-30);
}

export function pushWarLog(log = [], entry, now = Date.now()) {
  const keep = log.filter(e => now - e.t < 14 * 864e5);
  if (keep.some(e => e.idx === entry.idx && e.kind === entry.kind && Math.abs(e.t - entry.t) < 30 * 60e3)) return keep;
  return [...keep, entry].slice(-300);
}

export function weeklyRecap(warLog = [], moLog = [], now = Date.now(), days = 7) {
  const since = now - days * 864e5, w = warLog.filter(e => e.t >= since), by = k => w.filter(e => e.kind === k);
  const names = list => [...new Set(list.map(e => e.name))];
  const mos = moLog.filter(e => e.end && e.end >= since);
  return {
    since, liberated: names(by("liberated")), defended: names(by("defended")), lost: names(by("lost")), attacked: names(by("attacked")),
    moDone: mos.filter(e => e.status === "done").length, moExpired: mos.filter(e => e.status === "expired").length,
    medals: mos.filter(e => e.status === "done").reduce((s, e) => s + (e.medals || 0), 0), any: w.length + mos.length > 0
  };
}

// ---------- Field notes: biome, hazards and general advice per enemy ----------
const ENEMY_TIPS = {
  Terminids: [
    "Swarms are the main danger: bring something that clears crowds (flame, gas or an area weapon) and keep moving.",
    "Big armoured bugs (Chargers, Bile Titans) need anti-armour weapons; aim for weak points rather than the front armour.",
    "Bug holes keep spawning more bugs until they are closed with a grenade."
  ],
  Automaton: [
    "Fight from cover: the bots shoot from range, so smoke, shields and corners help.",
    "Fabricators keep spawning bots until they are destroyed with an explosive.",
    "Heavy bots (Hulks, Tanks) need anti-armour; vents and the head are usually the weak spots."
  ],
  Illuminate: [
    "Voteless come in melee swarms: area damage and keeping your distance work well.",
    "Overseers hit from range and the air, so stay mobile and use cover.",
    "Armoured walkers and shields need sustained heavy damage; bring anti-armour."
  ]
};
const HAZARD_TIPS = [
  [/heat|hot|desert|scorch/i, "Pack something that does not rely on cooling and keep a stim handy."],
  [/cold|frost|ice|freez/i, "Cold slows you down; plan fights in short bursts."],
  [/blizzard|snow/i, "Visibility drops in a blizzard; stay close to the squad."],
  [/fog/i, "Fog hides enemies until they are close, so bring a close-range option."],
  [/ion/i, "Ion storms can interfere with stratagems, so carry a backup that does not need one."],
  [/tremor|quake/i, "Tremors shake the ground and ruin your aim; steady yourself before shooting."],
  [/meteor/i, "Meteors can land anywhere, so avoid standing still in the open."],
  [/rain|storm/i, "Rain and storms cut visibility and cover noise; keep your squad in sight."],
  [/volcan|lava|fire|tornado/i, "Keep away from lava and fire, and watch for fire spreading."],
  [/sand|dust/i, "Sandstorms cut visibility; keep close to the squad."],
  [/acid/i, "Acid damages over time, so avoid standing in it."]
];
export function fieldNotes(planet = {}, faction = "") {
  const f = Object.keys(ENEMY_TIPS).find(k => String(faction || planet.currentOwner || "").toLowerCase().startsWith(k.toLowerCase()));
  const hazards = (planet.hazards || []).map(h => {
    const name = clean(h?.name ?? h), tip = HAZARD_TIPS.find(([re]) => re.test(name))?.[1] || clean(h?.description || "");
    return { name, tip };
  }).filter(h => h.name);
  const biome = planet.biome?.name ? { name: clean(planet.biome.name), text: clean(planet.biome.description || "") } : null;
  return { biome, hazards, tips: f ? ENEMY_TIPS[f] : [], enemy: f || "" };
}

// ---------- Toolbar badge with the "defense about to fail" warning ----------
// Same badge as before (unread dispatches or the defense count), except that while a defense is likely to fail
// and the warning badge is switched on, it shows a red "!" instead so it stands out.
export function badgeFor(data = {}, seen = Infinity, prefs = {}, defHist = {}, invert = false, now = Date.now()) {
  if (prefs.riskBadge !== false) {
    const hot = defenseRisk(data.campaigns, data.planets, defHist, invert, now).filter(r => r.risk).length;
    if (hot) return { text: "!", bg: "#d6342c", fg: "#ffffff", hot };
  }
  return badgeInfo(data, seen, prefs.badge || "news");
}
