// Talks to the community Helldivers 2 API (the same data helldivers.michi.onl uses).
const ROOT = "https://api.helldivers2.dev";
const HEADERS = {
  "X-Super-Client": "helldivers-tracker-extension",
  "X-Super-Contact": "chrome-extension-user"
};

// The community API allows about 5 requests per 10 seconds. Requests go out immediately while
// there is room in that window and only wait when it is full; a 429 is retried once after the
// server's Retry-After delay.
const WINDOW = 10200, MAX_PER_WINDOW = 5;
const starts = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function throttle() {
  for (;;) {
    const now = Date.now();
    while (starts.length && now - starts[0] >= WINDOW) starts.shift();
    if (starts.length < MAX_PER_WINDOW) { starts.push(now); return; }
    await sleep(starts[0] + WINDOW - now + 20);
  }
}

export async function getJSON(path, retried = false, slowRetried = false) {
  await throttle();
  let r;
  try {
    r = await fetch(ROOT + path, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
  } catch (e) {
    // A timeout or dropped connection is often momentary: try once more before giving up.
    if (!slowRetried) { await sleep(1500); return getJSON(path, retried, true); }
    throw e;
  }
  if (r.status === 429 && !retried) {
    await sleep(Math.min(Number(r.headers?.get?.("Retry-After")) || 10, 12) * 1000);
    return getJSON(path, true, slowRetried);
  }
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

// Dispatch text contains game markup like <i=1>text</i>; strip it.
export const clean = s => String(s ?? "").replace(/<[^>]+>/g, "").trim();
export const dispatchText = d => clean(d.message ?? d.content ?? d.text ?? "");

export function timeLeft(iso) {
  const ms = new Date(iso) - Date.now();
  if (!iso || isNaN(ms)) return "";
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`;
}

// ---- Campaign progress (mirrors how the companion website does it) ----
// 1) active defense event -> event health   (direction controlled by `invert`, see the footer toggle)
// 2) otherwise planet liberation (1 - health/maxHealth)
// 3) otherwise the leading unlocked REGION's progress. Under the region system the planet's own
//    health sits at 100% on most fronts, so reading it alone shows 0% almost everywhere.
// Fronts with no progress anywhere are "parked".
export function campaignProgress(c, byIdx = new Map(), invert = false) {
  const base = c.planet || {};
  const p = { ...(byIdx.get(base.index) || {}), ...base }; // /campaigns can omit fields /planets has
  const event = p.event || null;
  if (event?.maxHealth) {
    const f = event.health / event.maxHealth;
    return { pct: (invert ? f : 1 - f) * 100, kind: "defense", event, planet: p };
  }
  const planetPct = p.maxHealth ? (1 - p.health / p.maxHealth) * 100 : 0;
  if (planetPct > 0.005) return { pct: planetPct, kind: "planet", planet: p };
  let best = null;
  for (const r of p.regions || []) {
    if (r.isAvailable === false || !r.maxHealth) continue; // locked regions stay pinned at full health
    const pct = (1 - r.health / r.maxHealth) * 100;
    if (pct > 0.005 && (!best || pct > best.pct)) best = { pct, kind: "region", region: r.name, planet: p };
  }
  return best || { pct: 0, kind: "parked", planet: p };
}

// ---- Major Order helpers ----
const RACES = { 1: "Humans", 2: "Terminids", 3: "Automatons", 4: "Illuminate" };
const VERBS = { 2: "Collect samples", 3: "Eradicate", 11: "Liberate", 12: "Defend", 13: "Hold", 15: "Liberate more planets than are lost" };

// ---- Working out *which* enemy / what a task is about ----
// The game's task data names the faction but not the specific enemy (Chargers, Bile Titans, ...); the
// in-game text is built from internal ids. The order's own wording does name them, with the same
// numbers as the goals, so we match each task's goal number against the briefing text.
const STOP = new Set(["and", "to", "in", "on", "with", "of", "against", "from", "for", "by", "the", "before", "at", "across", "as", "that", "or", "who", "while", "using", "so", "into"]);
const JUNK = new Set(["times", "time", "kills", "enemies", "units", "points", "more", "total"]);

function numbersIn(text) {
  const out = [], re = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:\s*(million|billion|M|B)\b)?/g;
  let m;
  while ((m = re.exec(text))) {
    let n = parseFloat(m[1].replace(/,/g, ""));
    const u = (m[2] || "").toLowerCase();
    if (u.startsWith("m")) n *= 1e6; else if (u.startsWith("b")) n *= 1e9;
    out.push({ n, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

// The nth place in `text` where the number `goal` appears -> { name: "Bile Titans", clause: "..." }
export function describeFromText(goal, text, nth = 0) {
  if (!goal || !text) return null;
  const hit = numbersIn(text).filter(x => Math.abs(x.n - goal) < 1)[nth];
  if (!hit) return null;
  const words = [];
  for (const w of text.slice(hit.end).trim().split(/\s+/)) {
    const bare = w.replace(/[.,;:!?)"”]+$/g, "");
    if (!bare || STOP.has(bare.toLowerCase()) || /^\d/.test(bare)) break;
    words.push(bare);
    if (/[.,;:!?]$/.test(w) || words.length >= 4) break;
  }
  let name = words.join(" ");
  if (!name || JUNK.has(name.toLowerCase())) name = "";
  const before = text.slice(0, hit.start).split(/[,;.\n]| and /).pop();
  const after = text.slice(hit.end).split(/[,;.\n]| and /)[0];
  let clause = (before + text.slice(hit.start, hit.end) + after).trim().replace(/\s+/g, " ");
  if (clause.length > 70) clause = clause.slice(0, 67) + "…";
  clause = clause.charAt(0).toUpperCase() + clause.slice(1);
  return { name, clause };
}

// Turns one raw assignment task into something displayable.
// ctx = { text, used: Map } lets several kill tasks with the same goal number take turns at the matches.
export function parseTask(task, current = 0, planetsByIdx = new Map(), ctx = null) {
  const vt = task.valueTypes || [], v = task.values || [];
  const pick = t => { const i = vt.indexOf(t); return i >= 0 ? v[i] : undefined; };
  let goal = pick(3), planetIdx = pick(12), race = pick(1);
  if (!vt.length) { // no type info: fall back to the usual positions
    if ([11, 13].includes(task.type)) planetIdx = v[2]; else goal = v[2];
  }
  // Kill / sample tasks list a planet value type too, but it is just a zeroed filler (index 0 = Super Earth).
  if ([2, 3].includes(task.type)) planetIdx = undefined;
  else if (planetIdx === 0 && ![11, 13].includes(task.type)) planetIdx = undefined;
  const planet = planetIdx !== undefined ? planetsByIdx.get(planetIdx) : undefined;
  const target = goal ?? (planetIdx !== undefined ? 1 : undefined);
  const done = target ? current >= target : current >= 1;
  const pct = target ? Math.min(100, (current / target) * 100) : done ? 100 : 0;

  // A kill task that targets one enemy type has a non-zero id in one of its other slots. We don't know
  // which slot or which id means what, so the non-zero slots together act as a fingerprint: learn the
  // enemy's name from the order's wording once, then recognise the same fingerprint in later orders.
  const sig = task.type === 3
    ? vt.map((t, i) => [t, v[i]]).filter(([t, val]) => ![1, 3].includes(t) && val).map(([t, val]) => `${t}:${val}`).join("|")
    : "";

  let label = VERBS[task.type] || "Objective";
  if (planetIdx !== undefined) label += ` ${planet?.name || "planet " + planetIdx}`;
  else {
    let found = null;
    if (ctx && goal) {
      const n = ctx.used.get(goal) || 0;
      found = describeFromText(goal, ctx.text, n);
      if (found) ctx.used.set(goal, n + 1);
    }
    if (task.type === 3) {
      const known = sig && ctx?.names?.[sig];
      const name = found?.name || known;
      // only remember a name when the goal number is unique among this order's kill tasks (no mix-ups)
      if (found?.name && sig && ctx?.learn && ctx.goalCounts?.get(goal) === 1) ctx.learn[sig] = found.name;
      label += name ? ` ${name}` : race && RACES[race] ? ` ${RACES[race]}` : "";
    }
    else if (task.type === 2) label = found?.name ? `Collect ${found.name}` : label;
    else if (!VERBS[task.type] && found?.clause) label = found.clause;
    // Mission-count tasks (an enemy faction plus a goal count, with a task type we have no verb for)
    else if (!VERBS[task.type] && race && RACES[race] && goal > 0) label = `Complete ${Math.round(goal).toLocaleString("en-US")} ${RACES[race]} mission${goal === 1 ? "" : "s"}`;
    else if (race && RACES[race]) label += ` ${RACES[race]}`;
  }
  return { label, sig, planetIdx, target, current, done, pct, race: RACES[race], showCount: planetIdx === undefined && target > 1 };
}

// ---- Second source: the Helldivers Training Manual API ----
// No sign-in and no rate limit; it passes the game's own data through unchanged. Used for the Major
// Order, as a backup for campaigns, and for per-planet history. (Unofficial, so it can change.)
const TM = "https://helldiverstrainingmanual.com/api/v1";
export async function getTM(path) {
  const r = await fetch(TM + path, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const OWNER = { 1: "Humans", 2: "Terminids", 3: "Automaton", 4: "Illuminate" };

// Builds the same campaign objects the community API gives, from the game's raw war status.
// Planet names, sectors and regions aren't in the raw feed, so they come from the last cached planet list.
export function campaignsFromWarStatus(status, info, cachedPlanets = []) {
  const cached = new Map(cachedPlanets.map(p => [p.index, p]));
  const maxHealth = new Map((info?.planetInfos || []).map(p => [p.index, p.maxHealth]));
  const stat = new Map((status?.planetStatus || []).map(p => [p.index, p]));
  const events = new Map((status?.planetEvents || []).map(e => [e.planetIndex, e]));
  return (status?.campaigns || []).map(c => {
    const idx = c.planetIndex, st = stat.get(idx) || {}, ev = events.get(idx), old = cached.get(idx) || {};
    const planet = {
      ...old, index: idx, name: old.name || `Planet ${idx}`,
      currentOwner: OWNER[st.owner] || old.currentOwner,
      health: st.health, maxHealth: maxHealth.get(idx) ?? old.maxHealth, regenPerSecond: st.regenPerSecond ?? old.regenPerSecond,
      statistics: { playerCount: st.players ?? 0 }
    };
    delete planet.event; // a cached event may be out of date
    if (ev) planet.event = { health: ev.health, maxHealth: ev.maxHealth, faction: OWNER[ev.race],
      endTime: new Date(Date.now() + (ev.expireTime - status.time) * 1000).toISOString() };
    return { id: c.id, faction: OWNER[c.race], planet };
  });
}

// Planet history -> [[time, liberation %]], checked against the progress we already know.
// The response format isn't documented, so rather than trust a field name, try each numeric field with
// each plausible scale/direction and keep the one whose newest value matches the current progress.
export function parseHistory(raw, pctNow, maxHealth) {
  const list = Array.isArray(raw) ? raw : Object.values(raw || {}).find(v => Array.isArray(v) && v.length && typeof v[0] === "object");
  if (!Array.isArray(list) || list.length < 6) return { error: "too few history points" };
  const toMs = v => typeof v === "number" ? (v > 1e12 ? v : v > 1e9 ? v * 1000 : null) : typeof v === "string" && !isNaN(Date.parse(v)) ? Date.parse(v) : null;
  const flat = o => { const out = {}; (function walk(x, p, d) {
    for (const [k, v] of Object.entries(x || {})) {
      if (typeof v === "number") out[p + k] = v;
      else if (v && typeof v === "object" && !Array.isArray(v) && d < 2) walk(v, p + k + ".", d + 1);
    } })(o, "", 0); return out; };
  const timeOf = it => {
    for (const k of ["createdAt", "created_at", "timestamp", "time", "date", "t", "at"]) { const t = toMs(it[k]); if (t) return t; }
    for (const v of Object.values(it)) if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) { const t = toMs(v); if (t) return t; }
    return null;
  };
  const rows = list.map(it => ({ t: timeOf(it), f: flat(it) })).filter(r => r.t).sort((x, y) => x.t - y.t);
  if (rows.length < 6) return { error: "no timestamps found" };
  const skip = /(^|\.)(id|index|planetindex|players|count|time|timestamp|createdat|created_at|date|t|at)$/i;
  const tfs = [["as %", v => v], ["100 - %", v => 100 - v], ["fraction", v => v * 100], ["1 - fraction", v => (1 - v) * 100]];
  if (maxHealth) tfs.push(["1 - health/max", v => (1 - v / maxHealth) * 100], ["health/max", v => (v / maxHealth) * 100]);
  let best = null;
  for (const key of Object.keys(rows[rows.length - 1].f)) {
    if (skip.test(key) || rows.some(r => typeof r.f[key] !== "number")) continue;
    for (const [name, fn] of tfs) {
      const pts = rows.map(r => [r.t, fn(r.f[key])]);
      if (pts.some(p => !isFinite(p[1]) || p[1] < -5 || p[1] > 105)) continue;
      const diff = Math.abs(pts[pts.length - 1][1] - pctNow);
      if (diff <= 2.5 && (!best || diff < best.diff)) best = { diff, points: pts, field: key, transform: name };
    }
  }
  return best ? { points: best.points, field: best.field, transform: best.transform } : { error: "no field matched the current progress" };
}

// The Training Manual passes the game's raw assignment through ({ id32, progress, expiresIn, setting: {...} });
// turn it into the same shape the community API uses. Anything already in that shape is left alone.
export function fromRaw(a) {
  const st = a?.setting;
  if (!st) return a;
  const at = a.expiration ? Date.parse(a.expiration) : typeof a.expiresIn === "number" ? Date.now() + a.expiresIn * 1000 : NaN;
  return {
    id: a.id32 ?? a.id, title: st.overrideTitle, briefing: st.overrideBrief, description: st.taskDescription,
    tasks: st.tasks || [], progress: a.progress || [],
    reward: st.reward ? { type: st.reward.type, amount: st.reward.amount } : undefined,
    expiration: isNaN(at) ? undefined : new Date(at).toISOString()
  };
}

// Major Orders come from two places; the Training Manual's copy of the game feed wins if it has one.
async function fetchAssignments() {
  const diag = {};
  let tm = null, v1 = null;
  // The Training Manual (no rate limit) goes first; the community API is only asked when it has no order for us.
  try {
    let r = await getTM("/war/major-orders");
    if (r && !Array.isArray(r)) r = r.assignments || (r.setting ? [r] : []);
    tm = (Array.isArray(r) ? r : []).map(fromRaw);
    diag.trainingManual = `ok (${tm.length})`;
  } catch (e) { diag.trainingManual = "error: " + (e.message || e); }
  if (!tm?.length) {
    try { const r = await getJSON("/api/v1/assignments"); v1 = Array.isArray(r) ? r : []; diag.v1 = `ok (${v1.length})`; }
    catch (e) { diag.v1 = "error: " + (e.message || e); }
  } else diag.v1 = "skipped";
  const list = tm?.length ? tm : (v1 || []);
  // Trust "no order" only if the game-feed source replied; otherwise keep the last known order.
  const certain = tm !== null || (v1 && v1.length > 0);
  return { list, diag, certain };
}

// Campaigns: the community API normally; if it fails, rebuild them from the raw war status.
async function fetchCampaigns(prev, diag) {
  try {
    return await getJSON("/api/v1/campaigns");
  } catch (e) {
    const [status, info] = await Promise.all([getTM("/war/status"), getTM("/war/info")]);
    diag.campaigns = `fallback (backup source used: ${e.message})`;
    return campaignsFromWarStatus(status, info, prev.planets || []);
  }
}


// ---- Galactic statistics (Stats tab) ----
// Looks a value up by any of several spellings (playerCount / player_count / players ...).
const norm = k => String(k).toLowerCase().replace(/[^a-z0-9]/g, "");
function pickNum(obj, names) {
  const map = new Map(Object.entries(obj || {}).map(([k, v]) => [norm(k), v]));
  for (const n of names) {
    const v = map.get(norm(n));
    if (v !== undefined && v !== null && v !== "" && isFinite(Number(v))) return Number(v);
  }
  return undefined;
}

// Accepts the community /war object ({ statistics: {...} }) or a bare statistics object.
// Returns null when none of the fields we know about are present, so a changed format shows up as an error.
export function normalizeStats(raw) {
  const s = raw?.statistics || raw?.stats || raw?.galaxyStats || raw;
  if (!s || typeof s !== "object") return null;
  const n = (...names) => pickNum(s, names);
  const won = n("missionsWon", "missions_won"), lost = n("missionsLost", "missions_lost");
  const fired = n("bulletsFired", "bullets_fired"), hit = n("bulletsHit", "bullets_hit");
  const out = {
    players: n("playerCount", "players", "player_count"),
    won, lost,
    winRate: won !== undefined && lost !== undefined && won + lost > 0 ? (won / (won + lost)) * 100 : n("missionSuccessRate", "successRate", "winRate"),
    kills: { Terminids: n("terminidKills", "terminid_kills"), Automaton: n("automatonKills", "automaton_kills"), Illuminate: n("illuminateKills", "illuminate_kills") },
    deaths: n("deaths"), revives: n("revives"), friendlies: n("friendlies"), // (the feed's revive total is bogus; the popup hides it)
    // The game counts some hits more than once (pellets, blasts), so hits can exceed shots; never show over 100%.
    accuracy: Math.min(100, fired && hit !== undefined ? (hit / fired) * 100 : n("accuracy") ?? NaN),
    timePlayed: n("timePlayed", "time_played"), missionTime: n("missionTime", "mission_time")
  };
  const known = [out.players, out.won, out.lost, out.deaths, ...Object.values(out.kills)].some(v => v !== undefined);
  return known ? out : null;
}

async function fetchStats() {
  const tried = [];
  try {
    const stats = normalizeStats(await getJSON("/api/v1/war"));
    if (stats) return { ...stats, source: "community API" };
    tried.push("community /war: no recognised fields");
  } catch (e) { tried.push("community /war: " + (e.message || e)); }
  // Backup: the Training Manual. Its stats path isn't documented where I could read it, so try the likely ones.
  for (const path of ["/war/stats", "/war/statistics", "/stats"]) {
    try {
      const stats = normalizeStats(await getTM(path));
      if (stats) return { ...stats, source: "Training Manual" };
      tried.push(`TM ${path}: no recognised fields`);
    } catch (e) { tried.push(`TM ${path}: ${e.message || e}`); }
  }
  throw new Error(tried.join(" | "));
}

// ---- Democracy Space Station ----
// Tactical-action status is an enum in the game data; the numbers below are my best reading of it.
const ACTION_STATUS = { 1: "inactive", 2: "preparing", 3: "active", 4: "cooldown" };
export function normalizeStation(s) {
  const status = v => typeof v === "string" ? v.toLowerCase() : ACTION_STATUS[v] || (v === undefined || v === null ? "unknown" : `status ${v}`);
  return {
    id: s.id32 ?? s.id ?? 0,
    name: clean(s.name) || "Democracy Space Station",
    planet: s.planet?.name || (s.planet?.index !== undefined ? `Planet ${s.planet.index}` : ""),
    electionEnd: s.electionEnd || null,
    actions: (s.tacticalActions || []).map(a => ({
      id: a.id32 ?? a.id,
      name: clean(a.name) || "Tactical action",
      desc: (clean(a.strategicDescription) || clean(a.description)).replace(/\s*>+$/, ""), // the feed has a stray ">" on some texts
      status: status(a.status),
      expire: a.statusExpire || null,
      costs: (a.costs || []).map((c, i) => {
        const target = Number(c.targetValue ?? 0), current = Number(c.currentValue ?? 0);
        return { label: `Requirement ${i + 1}`, current, target, pct: target > 0 ? Math.max(0, Math.min(100, (current / target) * 100)) : 0 };
      })
    }))
  };
}

async function fetchStations() {
  let list;
  try { list = await getJSON("/api/v2/space-stations"); }
  catch (e) { list = await getJSON("/api/v1/space-stations").catch(() => { throw e; }); }
  const arr = Array.isArray(list) ? list : list ? [list] : [];
  return { list: arr.map(normalizeStation), raw: JSON.stringify(arr[0] ?? null).slice(0, 4000) };
}

// Fetch everything in parallel. Slow-changing data is cached for a while, and if a request fails the
// previous value is kept and the reason recorded in `diag`. `onProgress` gets a snapshot each time
// one source finishes, so the popup can fill in as results arrive instead of waiting for the slowest.
// Base data (Major Order, campaigns, dispatches, planets) every time; stats, station and Steam news only when asked
// for (`extras`), because they are only needed by their own tabs. `only` skips the base data.
export async function refreshAll(prev = {}, onProgress = () => {}, { extras = [], only = false } = {}) {
  const diag = {}, fetchedAt = { ...(prev.fetchedAt || {}) };
  const out = {
    campaigns: prev.campaigns || [], dispatches: prev.dispatches || [], planets: prev.planets || [],
    steam: prev.steam || [], assignments: prev.assignments || [],
    stats: prev.stats || null, stations: prev.stations || [], stationRaw: prev.stationRaw || ""
  };
  const snapshot = () => ({ ...out, fetchedAt: { ...fetchedAt }, diag: { ...diag }, updated: Date.now() });
  const emptyOk = new Set(["stats", "stations"]); // an empty station list is a real answer, not a failure
  const isEmpty = v => !v || (Array.isArray(v) && !v.length);
  const due = (k, ttlMs) => (emptyOk.has(k) ? !fetchedAt[k] : isEmpty(out[k])) || Date.now() - (fetchedAt[k] || 0) > ttlMs;
  const step = async (name, ttlMs, fn, keep = v => v) => {
    if (ttlMs && !due(name, ttlMs)) { diag[name] = "cached"; return; }
    try {
      const v = await fn();
      out[name] = keep(v);
      fetchedAt[name] = Date.now();
      if (!String(diag[name] || "").startsWith("fallback")) diag[name] = `ok (${Array.isArray(v) ? v.length : v ? 1 : 0})`;
    } catch (e) { diag[name] = "error: " + (e.message || e); }
    onProgress(snapshot());
  };
  const majorOrder = async () => {
    try {
      const a = await fetchAssignments();
      diag.assignments = a.diag;
      if (a.certain) out.assignments = a.list; // if we couldn't be sure (error / rate limit) keep the last known order
    } catch (e) { diag.assignments = { error: e.message || String(e) }; }
    onProgress(snapshot());
  };

  const jobs = [];
  if (!only) jobs.push(
    majorOrder(),
    step("campaigns", 0, () => fetchCampaigns(prev, diag)),
    step("dispatches", 4 * 60e3, () => getJSON("/api/v2/dispatches").catch(() => getJSON("/api/v1/dispatches")),
      list => [...list].sort((x, y) => y.id - x.id).slice(0, 30)), // the API returns the whole history
    step("planets", 10 * 60e3, () => getJSON("/api/v1/planets"))
  );
  if (extras.includes("steam")) jobs.push(step("steam", 30 * 60e3, () => getJSON("/api/v1/steam")));
  if (extras.includes("stats")) jobs.push(step("stats", 5 * 60e3, fetchStats));
  if (extras.includes("stations")) jobs.push(step("stations", 10 * 60e3, async () => { const r = await fetchStations(); out.stationRaw = r.raw; return r.list; }));
  await Promise.all(jobs);
  return snapshot();
}

// ---- Liberation tracking: progress history and "how long until it's done" ----
export function fmtDuration(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${Math.max(m, 1)}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return d >= 60 ? "60+ days" : `${d}d ${h % 24}h`;
}

// Keeps ~3 hours of (time, progress%) samples per active campaign planet, at most one per minute.
export function recordHistory(history = {}, campaigns = [], planets = [], now = Date.now()) {
  const byIdx = new Map(planets.map(p => [p.index, p]));
  const out = {};
  for (const c of campaigns) {
    const idx = c.planet?.index;
    if (idx === undefined) continue;
    const prog = campaignProgress(c, byIdx, true);
    if (prog.kind === "defense") continue;
    const old = history[idx];
    const s = (old && old.kind === prog.kind ? old.s : []).filter(x => x[0] >= now - 3 * 3600e3);
    if (!s.length || now - s[s.length - 1][0] >= 60e3) s.push([now, +prog.pct.toFixed(4)]);
    out[idx] = { kind: prog.kind, s }; // planets that are no longer campaigns drop out here
  }
  return out;
}

// Straight-line fit over the last hour of samples -> % per hour -> time left.
export function projection(rec, pctNow, now = Date.now(), windowMs = 3600e3) {
  const s = (rec?.s || []).filter(x => x[0] >= now - windowMs);
  if (s.length < 3 || s[s.length - 1][0] - s[0][0] < 10 * 60e3) return { status: "gathering" };
  const n = s.length, t0 = s[0][0];
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [t, y] of s) { const x = t - t0; sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const den = n * sxx - sx * sx;
  if (!den) return { status: "gathering" };
  const perHour = ((n * sxy - sx * sy) / den) * 3.6e6;
  const spanMin = Math.round((s[n - 1][0] - t0) / 60000);
  if (perHour < -0.005) return { status: "losing", perHour, spanMin };
  if (perHour < 0.005) return { status: "stalled", perHour, spanMin };
  return { status: "ok", perHour, spanMin, etaMs: ((100 - pctNow) / perHour) * 3.6e6 };
}

// ---- Major Order overall progress + pace (shared by the popup and the background check) ----
// Same maths as the Order tab: every objective's % averaged, with planet objectives showing the live campaign progress.
export function moOverall(a, data, invert = false) {
  const idx = new Map((data.planets || []).map(p => [p.index, p]));
  const rows = (data.campaigns || []).map(c => campaignProgress(c, idx, invert));
  const tasks = (a.tasks || []).map((t, i) => parseTask(t, a.progress?.[i] ?? 0, idx, null));
  tasks.forEach(t => {
    const r = t.planetIdx !== undefined ? rows.find(x => x.planet?.index === t.planetIdx) : null;
    if (r && r.kind !== "parked") t.pct = Math.max(0, Math.min(100, r.pct));
  });
  return tasks.length ? tasks.reduce((sum, t) => sum + t.pct, 0) / tasks.length : 0;
}

// Keeps ~12 hours of (time, overall %) samples per active Major Order, at most one per minute.
export function recordMoPace(prev = {}, list = [], data = {}, invert = false, now = Date.now()) {
  const out = {};
  for (const a of list) {
    const key = String(a.id ?? a.expiration ?? "");
    if (!key) continue;
    const s = (prev[key]?.s || []).filter(x => x[0] >= now - 12 * 3600e3);
    if (!s.length || now - s[s.length - 1][0] >= 60e3) s.push([now, +moOverall(a, data, invert).toFixed(3)]);
    out[key] = { s };
  }
  return out;
}

// "Will it finish before the deadline?" Compares the rate needed with the rate of the last three hours.
export function moPace(rec, pctNow, expiration, now = Date.now()) {
  const left = new Date(expiration) - now;
  if (!expiration || isNaN(left) || left <= 0) return null;
  if (pctNow >= 99.9) return { status: "done" };
  const need = (100 - pctNow) / (left / 3.6e6);
  const pr = projection(rec, pctNow, now, 3 * 3600e3);
  if (pr.status === "ok") return { status: pr.etaMs <= left ? "ahead" : "behind", need, perHour: pr.perHour, etaMs: pr.etaMs, slack: left - pr.etaMs };
  return { status: pr.status, need, perHour: pr.perHour };
}

// Toolbar badge: unread dispatches (yellow) or the number of active defense campaigns (red).
export function badgeInfo(data = {}, seen = Infinity, mode = "news") {
  if (mode === "defense") {
    const idx = new Map((data.planets || []).map(p => [p.index, p]));
    const n = (data.campaigns || []).filter(c => campaignProgress(c, idx).kind === "defense").length;
    return { text: n ? String(n) : "", bg: "#d6342c", fg: "#ffffff" };
  }
  const n = (data.dispatches || []).filter(d => d.id > seen).length;
  return { text: n ? String(n) : "", bg: "#ffe033", fg: "#0a1f44" };
}
