import { clean, dispatchText, timeLeft, parseTask, campaignProgress, projection, fmtDuration, getTM, parseHistory, moOverall, moPace } from "./api.js";
import { F } from "./features.js";
import { moTargets, defenseRisk, rankFronts, snapshotOf, diffSnapshots, weeklyRecap, fieldNotes, badgeFor } from "./insights.js";

// ---------- small helpers ----------
const COLORS = { humans:"#6ec6ff", terminids:"#ffb300", automaton:"#ff5a52", illuminate:"#b779ff" };
const color = f => {
  const k = String(f || "").toLowerCase();
  return Object.entries(COLORS).find(([n]) => k.startsWith(n))?.[1] || "#6ec6ff";
};
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const ago = iso => {
  const m = Math.max(0, (Date.now() - new Date(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${Math.round(m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
const fmt = n => n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1000 ? (n / 1000).toFixed(1) + "K" : String(n ?? 0);

const svg = (d, extra = "") => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const I = {
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  users: svg('<path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M21 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 'style="width:11px;height:11px"'),
  medal: svg('<circle cx="12" cy="15" r="6"/><path d="M8.5 3h7l-2 6.5M8.5 3l2 6.5"/><path d="M12 12.5v5M9.8 15h4.4"/>', 'style="width:20px;height:20px"'),
  chart: svg('<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>').replace('class="ico"', 'class="ico big"'),
  station: svg('<circle cx="12" cy="12" r="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-25 12 12)"/>').replace('class="ico"', 'class="ico big"'),
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.6-3.2 8.2-8 9-4.8-.8-8-4.4-8-9V6l8-3z"/><path d="M12 8l1.2 2.6 2.8.3-2.1 1.9.6 2.8L12 14.2 9.5 15.6l.6-2.8L8 10.9l2.8-.3z"/></svg>'
};

const TABS = ["mo", "campaigns", "news", "stats", "station", "drills"];
let data = null, invert = false, tab = "mo", refreshing = false, history = {}, enemyNames = {}, paceStore = {}, pinned = new Set(), ownedThemes = [];
let defHist = {}, warLog = [], moLog = [], hiddenTabs = [], drillStats = null, baseline = null, sinceDismissed = false;
const campFilter = { q: "", f: "all" };
let campView = "list";                                   // Campaigns tab: "list" or "map"
const mapState = { s: 1, vx: 0, vy: 0, sel: null, flip: false, style: "stars", sec: null };
const mapOpts = { mo: false };                                  // map overlays (Major Order targets)
const tl = { on: false, playing: false, loading: false, got: 0, want: 0, lo: 0, hi: 0, t: 0, timer: 0 };   // 24-hour time-lapse
let riskCache = new Map(), repaintPending = false;
const openGroups = new Set(), openPlanets = new Set();
const tmHist = {}, tmPending = new Set(); // planet index -> Training Manual history (kept for 10 min)

// The game's last 24h of progress for one planet (kept for 10 minutes). Shared by the planet details and the map time-lapse.
async function fetchHist(idx, pct, maxHealth) {
  if (tmPending.has(idx) || (tmHist[idx] && Date.now() - tmHist[idx].at < 10 * 60e3)) return;
  tmPending.add(idx);
  try {
    const raw = await getTM(`/war/history/${idx}?timeframe=day`);
    tmHist[idx] = { ...parseHistory(raw, pct, maxHealth), at: Date.now(),
      sample: (Array.isArray(raw) ? raw : Object.values(raw || {}).find(Array.isArray) || []).slice(0, 2) };
  } catch (e) { tmHist[idx] = { error: String(e.message || e), at: Date.now() }; }
  tmPending.delete(idx);
}
// When a planet is opened, fetch its history so the estimate is ready straight away.
async function ensureHistory(idx) {
  const row = campaignRows().find(r => r.p.index === idx);
  if (!row || ["defense", "parked", "region"].includes(row.prog.kind)) return;
  await fetchHist(idx, row.prog.pct, row.p.maxHealth);
  if (data && !tl.loading) { renderMO(); renderCampaigns(); renderStats(); }
}
const planetsByIdx = () => new Map((data.planets || []).map(p => [p.index, p]));
const players = p => p?.statistics?.playerCount || 0;

// One row per campaign, with progress worked out the way the companion website does it.
function campaignRows() {
  const idx = planetsByIdx();
  return data.campaigns.map(c => {
    const prog = campaignProgress(c, idx, invert), p = prog.planet;
    return { c, p, prog, players: players(p),
      faction: prog.kind === "defense" ? prog.event.faction
        : (p.currentOwner && p.currentOwner !== "Humans" ? p.currentOwner : (c.faction || p.currentOwner)) };
  });
}

function planetStatus(idx) {
  const r = campaignRows().find(x => x.p.index === idx);
  if (!r) return "";
  if (r.prog.kind === "defense") return `Defense ${Math.max(0, Math.min(100, r.prog.pct)).toFixed(2)}% · ${timeLeft(r.prog.event.endTime)} left · ${fmt(r.players)} players`;
  if (r.prog.kind === "parked") return `No progress yet · ${fmt(r.players)} players`;
  return `Liberation ${Math.max(0, Math.min(100, r.prog.pct)).toFixed(2)}%${r.prog.region ? " (" + r.prog.region + ")" : ""} · ${fmt(r.players)} players`;
}

// ---------- pinned planets ----------
const pinBtn = (idx, name) => {
  const on = pinned.has(idx);
  return `<button type="button" class="pin ${on ? "on" : ""}" data-pin="${idx}" aria-pressed="${on}" aria-label="${on ? "Unpin" : "Pin"} ${esc(name)}" title="${on ? "Unpin" : "Pin to the top of Campaigns"}">${on ? "★" : "☆"}</button>`;
};
async function togglePin(idx) {
  pinned.has(idx) ? pinned.delete(idx) : pinned.add(idx);
  await chrome.storage.local.set({ pinned: [...pinned] });
  renderMO(); renderCampaigns();
}

// A small trend line of a planet's progress: the game's last 24h if we have it, otherwise what this extension tracked.
function sparkHTML(row) {
  if (!row || ["defense", "parked"].includes(row.prog.kind)) return "";
  const h = tmHist[row.p.index];
  const pts = (h?.points?.length > 5 ? h.points : history[row.p.index]?.s) || [];
  if (pts.length < 4) return "";
  const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
  if (t1 - t0 < 10 * 60e3) return "";
  const W = 260, H = 44, ys = pts.map(q => q[1]), lo = Math.min(...ys), span = Math.max(Math.max(...ys) - lo, 0.5);
  const line = pts.map(([t, v]) => `${(((t - t0) / (t1 - t0)) * W).toFixed(1)},${(H - 3 - ((v - lo) / span) * (H - 6)).toFixed(1)}`).join(" ");
  const delta = ys[ys.length - 1] - ys[0], hrs = (t1 - t0) / 3.6e6, span$ = hrs >= 1 ? `${Math.round(hrs)}h` : `${Math.round(hrs * 60)}m`;
  return `<div class="spark"><div class="row"><b>Progress, last ${span$}</b><span class="muted">${delta >= 0 ? "+" : ""}${delta.toFixed(2)}%</span></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Progress trend"><polyline points="${line}" fill="none" stroke="var(--accent-ink)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg></div>`;
}

// ---------- planet details (click a planet) ----------
const regionPct = r => r.maxHealth ? Math.max(0, Math.min(100, (1 - r.health / r.maxHealth) * 100)) : 0;
const regionSize = r => { const v = r.size ?? r.regionSize; return typeof v === "string" ? v.replace(/([a-z])([A-Z])/g, "$1 $2") : ""; };

// One projection per front, shared by the campaign cards, the Major Order checklist and the copied summary.
// -> { status: ok|stalled|losing|gathering, etaMs?, perHour?, leftMs? }  (leftMs = defense timer, when there is one)
function projFor(r) {
  const { prog, p } = r;
  if (prog.kind === "parked") return { status: "parked" };
  if (prog.kind === "defense") {
    const e = riskCache.get(p.index), leftMs = new Date(prog.event.endTime) - Date.now();
    if (!e || e.status === "gathering") return { status: "gathering", leftMs };
    if (e.status === "ok" && e.perHour > 0) return { status: "ok", perHour: e.perHour, etaMs: ((100 - Math.max(0, Math.min(100, prog.pct))) / e.perHour) * 3.6e6, leftMs };
    return { status: e.status, perHour: e.perHour, leftMs };
  }
  const h = tmHist[p.index];
  let pr = h?.points ? projection({ s: h.points }, prog.pct) : { status: "gathering" };
  if (pr.status === "gathering") pr = projection(history[p.index], prog.pct);
  return pr;
}
// Small chip under a campaign card's name: how long until it is won, or a warning that it will not be in time.
function cardEtaChip(r) {
  const pr = projFor(r), def = r.prog.kind === "defense";
  if (pr.status === "ok") {
    if (def) return pr.etaMs <= pr.leftMs
      ? `<span class="eta-chip ok" title="At the current pace the defense is won before its timer runs out.">Holds in ~${esc(fmtDuration(pr.etaMs))}</span>`
      : `<span class="eta-chip bad" title="At the current pace it needs ${esc(fmtDuration(pr.etaMs))} but only ${esc(fmtDuration(pr.leftMs))} remain.">Won't hold at this pace</span>`;
    return `<span class="eta-chip" title="Estimated from recent progress; it shifts as player numbers change.">~${esc(fmtDuration(pr.etaMs))} to liberate</span>`;
  }
  if (pr.status === "losing") return `<span class="eta-chip bad">Losing ground</span>`;
  if (pr.status === "stalled") return `<span class="eta-chip ${def ? "bad" : ""}">Stalled</span>`;
  return "";
}

function etaHTML(row) {
  const { prog, p } = row;
  if (prog.kind === "defense")
    return `<div class="eta"><b>Defense deadline</b><span class="big">${esc(timeLeft(prog.event.endTime))} left</span>
      <span class="faint">Event health ${fmt(prog.event.health)} / ${fmt(prog.event.maxHealth)}. Liberation estimates are only made for attack fronts.</span></div>`;
  if (prog.kind === "parked")
    return `<div class="eta"><b>Time to liberate</b><span class="big">No progress yet</span><span class="faint">Nobody is pushing this front at the moment.</span></div>`;
  const goal = prog.kind === "region" ? `clear ${prog.region}` : "liberate";
  const h = tmHist[p.index];
  let pr = h?.points ? projection({ s: h.points }, prog.pct) : { status: "gathering" };
  let via = "the game's recent history";
  if (pr.status === "gathering") { pr = projection(history[p.index], prog.pct); via = "progress this extension has tracked"; }
  if (pr.status === "ok") {
    const when = pr.etaMs < 7 * 864e5
      ? new Date(Date.now() + pr.etaMs).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })
      : new Date(Date.now() + pr.etaMs).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
    return `<div class="eta"><b>Time to ${esc(goal)}</b><span class="big">~${esc(fmtDuration(pr.etaMs))}</span>
      <span class="faint">Around ${esc(when)} at +${pr.perHour.toFixed(2)}%/h, using ${esc(via)} over the last ${pr.spanMin} min. Shifts as player numbers change.</span></div>`;
  }
  const msg = {
    gathering: ["Collecting data…", tmPending.has(p.index) ? "Fetching this planet's recent history…" : "An estimate appears after about 10 minutes of tracking this front."],
    stalled:   ["Not moving", "Progress is roughly flat, so there's no finish time yet."],
    losing:    ["Losing ground", `Progress is falling (${pr.perHour?.toFixed(2)}%/h), so it won't be done at this pace.`]
  }[pr.status];
  return `<div class="eta"><b>Time to ${esc(goal)}</b><span class="big">${msg[0]}</span><span class="faint">${msg[1]}</span></div>`;
}

function planetDetail(idx) {
  const row = campaignRows().find(r => r.p.index === idx);
  const p = row?.p || planetsByIdx().get(idx);
  if (!p) return "";
  const regen = p.regenPerSecond && p.maxHealth ? (p.regenPerSecond * 3600 / p.maxHealth) * 100 : 0;
  const kv = [
    ["Sector", p.sector], ["Held by", p.currentOwner], ["Players", fmt(row ? row.players : players(p))],
    ["Planet health", p.maxHealth ? `${fmt(p.health)} / ${fmt(p.maxHealth)}` : ""],
    ["Enemy regen", regen ? `${regen.toFixed(2)}%/h` : ""]
  ].filter(([, v]) => v);
  const regions = [...(p.regions || [])].sort((a, b) =>
    (b.isAvailable !== false) - (a.isAvailable !== false) || regionPct(b) - regionPct(a));
  const regionHtml = regions.map(r => {
    const locked = r.isAvailable === false, pct = regionPct(r), size = regionSize(r);
    return `<div class="region ${locked ? "locked" : ""}" style="--c:${color(row?.faction || p.currentOwner)}">
      <div class="row"><span><b>${esc(r.name)}</b> ${size ? `<span class="chip">${esc(size)}</span>` : ""}</span>
        ${locked ? '<span class="chip">Locked</span>' : `<span class="pct">${pct.toFixed(1)}%</span>`}</div>
      ${!locked ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ""}
      ${r.players ? `<div class="faint">${I.users} ${fmt(r.players)} players</div>` : ""}</div>`;
  }).join("");
  return `<div class="detail">
    ${row ? etaHTML(row) : '<div class="eta"><b>Not an active campaign</b><span class="faint">There is no front on this planet right now.</span></div>'}
    ${sparkHTML(row)}
    <div class="detail-actions">${pinBtn(idx, p.name)}<span class="faint">${pinned.has(idx) ? "Pinned to the top of Campaigns" : "Pin this planet"}</span></div>
    ${fieldNotesHTML(p, row?.faction)}
    <div class="kv">${kv.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div>
    <div class="sub-h">Cities &amp; regions${regions.length ? ` · ${regions.length}` : ""}</div>
    ${regionHtml || '<div class="faint">This planet has no separate regions.</div>'}
  </div>`;
}

function togglePlanet(idx) {
  const opening = !openPlanets.has(idx);
  opening ? openPlanets.add(idx) : openPlanets.delete(idx);
  renderMO(); renderCampaigns();
  if (opening) ensureHistory(idx);
  [...document.querySelectorAll(`[data-pl="${idx}"]`)].find(el => el.offsetParent)?.focus();
}

// ---------- Major Order pace check ----------
function paceHTML(p) {
  if (!p || p.status === "done") return "";
  const need = Number.isFinite(p.need) ? p.need.toFixed(2) : "?";
  const rate = Number.isFinite(p.perHour) ? p.perHour.toFixed(2) : "?";
  // Each message is built only when its status is the current one (building them all up front crashed on missing numbers).
  const M = {
    ahead:     () => ["On pace", `Projected to finish in about ${fmtDuration(p.etaMs)}, roughly ${fmtDuration(p.slack)} before the deadline.`, "ok"],
    behind:    () => ["Behind pace", `At the current rate it would finish about ${fmtDuration(-p.slack)} after the deadline. It needs ${need}%/h and is moving at ${rate}%/h.`, "bad"],
    gathering: () => ["Checking pace…", `It needs ${need}%/h to finish in time. A projection appears after about 10 minutes of tracking.`, ""],
    stalled:   () => ["Stalled", `Progress is roughly flat. It needs ${need}%/h to finish in time.`, "bad"],
    losing:    () => ["Losing ground", `Progress is falling. It needs ${need}%/h to finish in time.`, "bad"]
  }[p.status]?.();
  return M ? `<div class="pace ${M[2]}" title="A rough estimate from the last few hours; progress is rarely steady."><b>${M[0]}</b><span class="faint">${esc(M[1])}</span></div>` : "";
}

// ---------- Major Order ----------
// Enemy names learned from past orders, saved so later orders (even with vaguer wording) can reuse them.
function rememberEnemies(learned) {
  const fresh = Object.entries(learned).filter(([sig, name]) => enemyNames[sig] !== name);
  if (!fresh.length) return;
  enemyNames = { ...enemyNames, ...Object.fromEntries(fresh) };
  chrome.storage.local.set({ enemyNames });
}

function renderMO() {
  const list = data.assignments || [];
  if (!list.length) {
    const d = data.diag?.assignments;
    const note = d ? Object.entries(d).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(" · ") : "no status recorded yet";
    $("mo").innerHTML = riskBarHTML() + sinceHTML() + `<div class="empty">${I.shield}
      <h3>No active Major Order</h3>
      <p>High Command hasn't issued new orders. This page refreshes on its own, and you'll get a notification when one lands.</p>
      <details class="src"><summary>Source check</summary><div>${note}</div></details></div>` + recapHTML();
    return;
  }
  const idx = planetsByIdx();
  $("mo").innerHTML = riskBarHTML() + sinceHTML() + list.map(a => {
    // the order's own wording (briefing, task text and recent dispatches) names the specific enemies
    const text = [a.briefing, a.description, ...[...data.dispatches].sort((x, y) => y.id - x.id).slice(0, 6).map(dispatchText)].map(clean).join("\n");
    const goalCounts = new Map();
    (a.tasks || []).filter(t => t.type === 3).forEach(t => { const g = (t.valueTypes || []).length ? t.values[t.valueTypes.indexOf(3)] : t.values?.[2]; goalCounts.set(g, (goalCounts.get(g) || 0) + 1); });
    const ctx = { text, used: new Map(), names: enemyNames, learn: {}, goalCounts };
    const tasks = (a.tasks || []).map((t, i) => parseTask(t, a.progress?.[i] ?? 0, idx, ctx));
    rememberEnemies(ctx.learn);
    // A planet objective shows the same live progress as the Campaigns tab (defense or liberation),
    // not the order's own 0/1 "held" flag, which reads 100% or 0% and never matches.
    const rows = campaignRows();
    tasks.forEach(t => {
      const r = t.planetIdx !== undefined ? rows.find(x => x.p.index === t.planetIdx) : null;
      if (r && r.prog.kind !== "parked") { t.pct = Math.max(0, Math.min(100, r.prog.pct)); t.live = true; }
      t.row = r || null;
    });
    const done = tasks.filter(t => t.done).length;
    // Per-objective check: will this planet objective finish before the order ends?
    const orderLeft = a.expiration ? new Date(a.expiration) - Date.now() : Infinity;
    tasks.forEach(t => {
      t.chk = null;
      if (t.done || !t.row) return;
      const pr = projFor(t.row), limit = Math.min(orderLeft, pr.leftMs ?? Infinity);
      if (pr.status === "ok") t.chk = pr.etaMs <= limit ? { cls: "ok", text: `On track: done in ~${fmtDuration(pr.etaMs)}` } : { cls: "bad", text: `Behind: ~${fmtDuration(pr.etaMs)} needed, ${fmtDuration(Math.max(0, limit))} left` };
      else if (pr.status === "stalled" || pr.status === "losing") t.chk = { cls: "bad", text: pr.status === "losing" ? "Behind: losing ground" : "Behind: not moving" };
      else if (pr.status === "gathering") t.chk = { cls: "", text: "Checking pace…" };
    });
    const left = tasks.filter(t => !t.done), risky = left.filter(t => t.chk?.cls === "bad"), unsure = left.filter(t => !t.chk || t.chk.cls === "");
    const todo = left.length ? `<div class=\"todo ${risky.length ? "bad" : unsure.length ? "" : "ok"}\"><b>${left.length} objective${left.length === 1 ? "" : "s"} left</b><span class=\"faint\">${risky.length ? `At risk of missing the deadline: ${esc(risky.map(t => t.label).join(", "))}.` : unsure.length ? "No warnings so far; some objectives can't be projected yet." : "Every remaining objective is on track."}</span></div>` : `<div class=\"todo ok\"><b>All objectives complete</b></div>`;
    const overall = tasks.length ? tasks.reduce((s, t) => s + t.pct, 0) / tasks.length : 0;
    const pace = paceHTML(moPace(paceStore[String(a.id ?? a.expiration ?? "")], overall, a.expiration));
    const items = tasks.map(t => {
      const pl = t.planetIdx !== undefined, open = pl && openPlanets.has(t.planetIdx);
      return `
      <li class="task ${t.done ? "done" : ""} ${pl ? "clickable" : ""} ${open ? "open" : ""}" ${pl ? `data-pl="${t.planetIdx}" tabindex="0" role="button" aria-expanded="${open}"` : ""}>
        <span class="tick">${I.check}</span>
        <div>
          <div class="row"><span class="tname">${esc(t.label)}${pl ? '<i class="caret self"></i>' : ""}</span>
            <span class="muted">${t.showCount ? `${fmt(t.current)} / ${fmt(t.target)}` : t.live ? `${t.pct.toFixed(2)}%` : t.done ? "Complete" : `${t.pct.toFixed(0)}%`}</span></div>
          ${pl ? `<div class="faint">${esc(planetStatus(t.planetIdx))}</div>`
            : t.showCount ? `<div class="faint">${t.race ? esc(t.race) + " · " : ""}${t.pct.toFixed(1)}% of the galactic goal</div>` : ""}
          <div class="bar"><i style="width:${t.pct}%"></i></div>
          ${t.chk ? `<div class="tk-chk ${t.chk.cls}">${esc(t.chk.text)}</div>` : ""}
          ${open ? planetDetail(t.planetIdx) : ""}
        </div></li>`;
    }).join("");
    const brief = clean(a.briefing || a.description);
    return `<div class="card mo">
      <div class="mo-top"><span class="chip solid">Major Order</span>
        ${a.expiration ? `<span class="chip">${I.clock} ${esc(timeLeft(a.expiration))} left</span>` : ""}</div>
      <div class="mo-title">${esc(clean(a.title) || "Major Order")}</div>
      ${brief ? `<p class="brief">${esc(brief)}</p>` : ""}
      <div class="overall"><div class="row"><span class="muted">${done} of ${tasks.length} objectives complete</span><span class="pct">${overall.toFixed(0)}%</span></div>
        <div class="bar"><i style="width:${overall}%"></i></div></div>
      ${pace}
      ${todo}
      <ul class="tasks">${items}</ul>
      ${a.reward?.amount ? `<div class="reward">${I.medal} ${esc(a.reward.amount)} Medals on completion</div>` : ""}
    </div>`;
  }).join("") + recapHTML();
}

// ---------- Campaigns ----------
function campaignCard(r) {
  const { p, prog, players: pl, faction } = r;
  const pct = Math.max(0, Math.min(100, prog.pct)), def = prog.kind === "defense", open = openPlanets.has(p.index), etaChip = cardEtaChip(r);
  const where = def
    ? `${I.clock} ${esc(timeLeft(prog.event.endTime))} left`
    : esc([p.sector, prog.region].filter(Boolean).join(" · "));
  return `<div class="card clickable ${open ? "open" : ""}" data-pl="${p.index}" tabindex="0" role="button" aria-expanded="${open}" style="--c:${color(faction)}">
    <div class="row"><span class="name">${pinBtn(p.index, p.name)}${esc(p.name)}<i class="caret"></i> ${def ? '<span class="chip solid">Defense</span>' : ""}${def && riskCache.get(p.index)?.risk ? ' <span class="chip warn">At risk</span>' : ""}</span><span class="pct">${pct.toFixed(2)}%</span></div>
    <div class="meta"><span class="muted"><span class="chip">${esc(faction)}</span> ${where}</span><span class="muted">${I.users} ${fmt(pl)}</span></div>
    ${etaChip ? `<div class="eta-line">${etaChip}</div>` : ""}
    <div class="bar"><i style="width:${pct}%"></i></div>
    ${open ? planetDetail(p.index) : ""}</div>`;
}

const FACTION_FILTERS = [["all", "All"], ["terminid", "Terminids"], ["automat", "Automatons"], ["illuminate", "Illuminate"]];
// The search box and filter chips are built once, so typing never loses focus when the list repaints.
function ensureFilters() {
  const box = $("campaigns");
  if (box.querySelector("#campList")) return;
  box.innerHTML = `<div class="filters"><div class="seg" role="group" aria-label="Campaigns view">${[["list", "List"], ["map", "Map"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${campView === v ? "on" : ""}" aria-pressed="${campView === v}">${l}</button>`).join("")}</div>
    <div class="fbody"><input type="search" id="campQ" placeholder="Search planets or sectors" aria-label="Search campaigns" autocomplete="off" value="${esc(campFilter.q)}">
    <div class="chips" role="group" aria-label="Filter by enemy">${FACTION_FILTERS.map(([k, l]) => `<button type="button" class="fchip ${campFilter.f === k ? "on" : ""}" data-f="${k}" aria-pressed="${campFilter.f === k}">${l}</button>`).join("")}</div></div></div><div id="campList"></div><div id="campMap" hidden></div>`;
  box.querySelectorAll("[data-v]").forEach(b => b.addEventListener("click", () => {
    campView = b.dataset.v; chrome.storage.local.set({ campView }); renderCampaigns();
  }));
  mapInit();
  $("campQ").addEventListener("input", e => { campFilter.q = e.target.value; renderCampaigns(); });
  box.querySelectorAll("[data-f]").forEach(btn => btn.addEventListener("click", () => {
    campFilter.f = btn.dataset.f;
    box.querySelectorAll("[data-f]").forEach(x => { x.classList.toggle("on", x === btn); x.setAttribute("aria-pressed", x === btn); });
    renderCampaigns();
  }));
}
function filterRows(rows) {
  const q = campFilter.q.trim().toLowerCase();
  return rows.filter(r => (campFilter.f === "all" || String(r.faction).toLowerCase().startsWith(campFilter.f))
    && (!q || [r.p.name, r.p.sector, r.prog.region, r.faction].some(x => String(x || "").toLowerCase().includes(q))));
}

function renderCampaigns() {
  const all = campaignRows();
  $("campCount").textContent = all.length || "";
  ensureFilters();
  const isMap = campView === "map";
  $("campaigns").querySelectorAll("[data-v]").forEach(b => { b.classList.toggle("on", b.dataset.v === campView); b.setAttribute("aria-pressed", b.dataset.v === campView); });
  $("campaigns").querySelector(".fbody").hidden = isMap;
  $("campList").hidden = isMap; $("campMap").hidden = !isMap;
  if (isMap) { renderMap(); return; }
  const box = $("campList");
  if (!all.length) { box.innerHTML = '<div class="empty"><h3>No active campaigns</h3><p>Nothing to show right now, or the API is unreachable.</p></div>'; return; }

  const filtering = !!campFilter.q.trim() || campFilter.f !== "all";
  const rows = filterRows(all);
  const byProgress = (a, b) => b.prog.pct - a.prog.pct || b.players - a.players;
  const byDeadline = (a, b) => new Date(a.prog.event.endTime) - new Date(b.prog.event.endTime);
  const pins = rows.filter(r => pinned.has(r.p.index)).sort((a, b) => (b.prog.kind === "defense") - (a.prog.kind === "defense") || byProgress(a, b));
  const rest = rows.filter(r => !pinned.has(r.p.index));
  const defenses = rest.filter(r => r.prog.kind === "defense").sort(byDeadline);
  const moving = rest.filter(r => !["defense", "parked"].includes(r.prog.kind)).sort(byProgress);
  const parked = rest.filter(r => r.prog.kind === "parked");
  const idle = filtering ? [] : [...pinned].filter(i => !all.some(r => r.p.index === i)).map(i => planetsByIdx().get(i)).filter(Boolean);

  const byFaction = {};
  parked.forEach(r => (byFaction[r.faction] ||= []).push(r));
  const groups = Object.entries(byFaction).map(([f, list]) => {
    list.sort((a, b) => b.players - a.players);
    return `<details class="card group" data-g="${esc(f)}" style="--c:${color(f)}" ${openGroups.has(f) || filtering ? "open" : ""}>
      <summary><span class="name">${esc(f)} <span class="muted">· ${list.length} parked</span></span>
        <span class="muted">${I.users} ${fmt(list.reduce((s, r) => s + r.players, 0))}</span></summary>
      <ul>${list.map(r => `<li><span>${pinBtn(r.p.index, r.p.name)}${esc(r.p.name)}</span><span class="faint">${fmt(r.players)}</span></li>`).join("")}</ul></details>`;
  }).join("");

  const countAll = { defense: all.filter(r => r.prog.kind === "defense").length, parked: all.filter(r => r.prog.kind === "parked").length };
  box.innerHTML = `${filtering ? "" : playHTML(all)}
    <div class="pills">
      <div class="pill"><b>${all.length}</b><span>Active</span></div>
      <div class="pill ${countAll.defense ? "hot" : ""}"><b>${countAll.defense}</b><span>Defense</span></div>
      <div class="pill"><b>${all.length - countAll.defense - countAll.parked}</b><span>Moving</span></div>
      <div class="pill"><b>${countAll.parked}</b><span>Parked</span></div>
    </div>
    ${pins.length || idle.length ? `<h4>Pinned</h4>${pins.map(campaignCard).join("")}${idle.map(p => `<div class="card quiet"><div class="row"><span class="name">${pinBtn(p.index, p.name)}${esc(p.name)}</span><span class="muted">No active front</span></div></div>`).join("")}` : ""}
    ${defenses.length ? `<h4>Under attack</h4>${defenses.map(campaignCard).join("")}` : ""}
    ${moving.length ? `<h4>Liberation in progress</h4>${moving.map(campaignCard).join("")}` : ""}
    ${parked.length ? `<h4>Parked fronts</h4>${groups}` : ""}
    ${filtering && !rows.length ? '<p class="muted center">No campaigns match your search.</p>' : ""}`;
}

// ---------- insight features: risk, where to help, since you last looked, weekly recap ----------
const moMap = () => moTargets(data?.assignments || [], planetsByIdx());
const riskList = () => (data ? defenseRisk(data.campaigns, data.planets, defHist, invert) : []);
const riskMap = () => new Map(riskList().map(r => [r.idx, r]));
const typing = () => document.activeElement?.id === "mapQ";   // a repaint now would throw away what is being typed

const openFN = new Set();   // planets whose Field notes are expanded

function fieldNotesHTML(p, faction) {
  const f = fieldNotes(p, faction);
  if (!f.biome && !f.hazards.length && !f.tips.length) return "";
  return `<details class="fieldnotes" data-fn="${p.index}" ${openFN.has(p.index) ? "open" : ""}><summary>Field notes${f.enemy ? ` · ${esc(f.enemy)}` : ""}</summary>
    ${f.biome ? `<div class="fn-row"><b>${esc(f.biome.name)}</b>${f.biome.text ? `<span class="faint"> ${esc(f.biome.text)}</span>` : ""}</div>` : ""}
    ${f.hazards.map(h => `<div class="fn-row"><b>${esc(h.name)}</b>${h.tip ? `<span class="faint"> ${esc(h.tip)}</span>` : ""}</div>`).join("")}
    ${f.tips.length ? `<ul class="fn-tips">${f.tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
    <div class="faint">General advice, not live data.</div></details>`;
}

// A defense that will probably fall inside the next hour.
function riskBarHTML() {
  const hot = riskList().filter(r => r.risk);
  if (!hot.length) return "";
  return `<div class="riskbar" role="status"><b>Defense at risk</b>${hot.map(r => `<button type="button" class="link-btn" data-goto="${r.idx}">${esc(r.name)} · ${esc(fmtDuration(r.leftMs))} left · ${r.pct.toFixed(0)}%</button>`).join("")}</div>`;
}
let audioCtx = null, riskSeen = null;
function beep() {
  try {
    audioCtx ||= new AudioContext(); audioCtx.resume?.();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime;
    o.type = "square"; o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(620, t + .16); g.gain.value = .05;
    o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + .36);
  } catch { /* audio not allowed yet: the notification and badge still work */ }
}
function watchRisk() {                       // a soft alarm while the panel is open, when a new defense becomes likely to fail
  const keys = new Set(riskList().filter(r => r.risk).map(r => r.key));
  if (riskSeen && prefsNow.riskSound && [...keys].some(k => !riskSeen.has(k))) beep();
  riskSeen = keys;
}

// "Where to help": the best few fronts right now, from the rules in insights.js.
function whyText(f) {
  const out = [];
  if (f.kind === "defense") { out.push(`${fmtDuration(f.leftMs)} left`); if (f.risk) out.push("may not hold"); }
  else {
    if (f.etaMs != null) out.push(`done in ~${fmtDuration(f.etaMs)}`); else if (f.pct >= 60) out.push("past halfway");
    if (f.crowd >= 0.8) out.push("few divers"); else if (f.crowd >= 0.5) out.push("room for more");
  }
  if (f.mo) out.push("Major Order target");
  return out.join(" · ");
}
function playHTML(rows) {
  const best = rankFronts(rows, { mo: moMap(), risk: riskMap(), hist: history, limit: 3 });
  if (!best.length) return "";
  return `<div class="card play"><div class="row"><b>Where to help</b><span class="faint">top ${best.length}</span></div>
    <div class="secrows">${best.map((f, i) => `<button type="button" class="secrow" data-goto="${f.idx}" style="--c:${color(f.faction)}">
      <span><i class="rank">${i + 1}</i>${esc(f.name)} <span class="chip ${f.kind === "defense" ? "solid" : ""}">${f.kind === "defense" ? "Defense" : "Front"}</span><small class="faint">${esc(whyText(f))}</small></span><b>${f.pct.toFixed(0)}%</b></button>`).join("")}</div>
    <div class="faint">A guide, not a rule: it favours fronts close to finishing, with few divers, or on the Major Order.</div></div>`;
}
function gotoPlanet(idx) {
  campView = "list"; chrome.storage.local.set({ campView });
  campFilter.q = ""; campFilter.f = "all"; const q = $("campQ"); if (q) q.value = "";
  $("campaigns").querySelectorAll("[data-f]").forEach(x => { const on = x.dataset.f === "all"; x.classList.toggle("on", on); x.setAttribute("aria-pressed", on); });
  openPlanets.add(idx);
  setTab("campaigns"); renderCampaigns(); ensureHistory(idx);
  [...document.querySelectorAll(`#campList [data-pl="${idx}"]`)][0]?.scrollIntoView({ block: "center", behavior: "smooth" });
}

// "Since you last looked": compares the war now with the copy saved when the panel was last in use.
function sinceHTML() {
  if (sinceDismissed || !baseline?.items.length) return "";
  return `<div class="card since"><div class="row"><b>Since you last looked <span class="faint">· ${esc(baseline.age)} ago</span></b><button type="button" class="link-btn" data-since="x">Dismiss</button></div>
    <ul>${baseline.items.slice(0, 6).map(i => `<li class="${i.k}">${i.idx !== undefined ? `<button type="button" class="link-btn" data-goto="${i.idx}">${esc(i.text)}</button>` : esc(i.text)}</li>`).join("")}</ul>${baseline.items.length > 6 ? `<div class="faint">+${baseline.items.length - 6} more changes</div>` : ""}</div>`;
}
let baselineDone = false, lastSnap = 0;
function trackSnapshot(stored) {
  if (!data?.planets?.length || !data?.campaigns?.length) return;
  const now = Date.now();
  if (!baselineDone) {
    baselineDone = true;
    if (stored?.at && now - stored.at >= 5 * 60e3) baseline = { age: fmtDuration(now - stored.at), items: diffSnapshots(stored, snapshotOf(data, invert)) };
  }
  if (document.visibilityState === "visible" && now - lastSnap >= 60e3) { lastSnap = now; chrome.storage.local.set({ snap: snapshotOf(data, invert) }); }
}

// Weekly recap and Major Order history, from what the background check logged on this device.
function recapHTML() {
  const r = weeklyRecap(warLog, moLog), orders = [...moLog].filter(e => e.end).reverse().slice(0, 6);
  const medals = moLog.filter(e => e.status === "done").reduce((s, e) => s + (e.medals || 0), 0), doneAll = moLog.filter(e => e.status === "done").length;
  const list = (label, names) => names.length ? `<div class="faint"><b>${label}:</b> ${names.slice(0, 8).map(esc).join(", ")}${names.length > 8 ? ` +${names.length - 8} more` : ""}</div>` : "";
  const body = !r.any && !orders.length
    ? '<p class="faint">Nothing logged yet. The background check records planets liberated, defended or lost and finished Major Orders while Chrome is open.</p>'
    : `<div class="pills four"><div class="pill"><b>${r.liberated.length}</b><span>Liberated</span></div><div class="pill"><b>${r.defended.length}</b><span>Defended</span></div>
        <div class="pill ${r.lost.length ? "hot" : ""}"><b>${r.lost.length}</b><span>Lost</span></div><div class="pill"><b>${r.moDone}</b><span>Orders won</span></div></div>
      ${list("Liberated", r.liberated)}${list("Defended", r.defended)}${list("Lost", r.lost)}
      ${r.medals ? `<div class="reward">${I.medal} ${fmtInt(r.medals)} Medals from Major Orders this week</div>` : ""}
      ${orders.length ? `<div class="sub-h">Major Order history</div>${orders.map(e => `<div class="hrow"><span>${esc(e.title)}</span><span class="chip ${e.status === "done" ? "solid" : ""}">${e.status === "done" ? "Done" : `Expired ${Math.round(e.pct)}%`}</span><span class="faint">${e.medals ? e.medals + " medals" : ""}</span></div>`).join("")}
        <div class="faint">All time on this device: ${doneAll} order${doneAll === 1 ? "" : "s"} completed${medals ? `, ${fmtInt(medals)} Medals` : ""}.</div>` : ""}`;
  return `<details class="card recap" id="recapBox" ${openGroups.has("__recap") ? "open" : ""}><summary><b>Weekly recap</b> <span class="muted">last 7 days</span></summary>${body}</details>`;
}

// ---------- Galaxy map ----------

const FKEYS = ["humans", "terminids", "automaton", "illuminate"];
const fkey = f => FKEYS.find(k => String(f || "").toLowerCase().startsWith(k)) || "humans";
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
function hull(pts) {                                    // convex hull (monotone chain)
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = list => { const h = []; for (const q of list) { while (h.length >= 2 && cr(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop(); h.push(q); } h.pop(); return h; };
  return [...half(p), ...half([...p].reverse())];
}
function sectorStats(planets, byIdx) {
  const m = new Map();
  for (const p of planets) {
    const n = p.sector || "Unknown";
    if (!m.has(n)) m.set(n, { name: n, planets: [], own: { humans: 0, terminids: 0, automaton: 0, illuminate: 0 }, fronts: [], defenses: 0 });
    const s = m.get(n); s.planets.push(p); s.own[fkey(p.currentOwner)]++;
    const r = byIdx.get(p.index); if (r) { s.fronts.push(r); if (r.prog.kind === "defense") s.defenses++; }
  }
  for (const s of m.values()) {
    const top = Math.max(...Object.values(s.own));
    s.lead = [...FKEYS].reverse().find(k => s.own[k] === top);        // ties go to the enemy
    s.mixed = Object.values(s.own).filter(v => v > 0).length > 1 || s.fronts.length > 0;
  }
  return m;
}

// ---- 24-hour time-lapse: each front's progress from the game's own history (Training Manual), falling back to what this extension tracked ----
const tlPts = idx => { const h = tmHist[idx]; return h?.points?.length > 5 ? h.points : history[idx]?.s?.length >= 4 ? history[idx].s : null; };
function tlAt(idx, t) {
  const pts = tlPts(idx); if (!pts) return null;
  const n = pts.length;
  if (t <= pts[0][0]) return pts[0][1];
  if (t >= pts[n - 1][0]) return pts[n - 1][1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m][0] <= t) lo = m; else hi = m; }
  const [t0, v0] = pts[lo], [t1, v1] = pts[hi];
  return v0 + (v1 - v0) * (t - t0) / (t1 - t0 || 1);
}
function tlRange() {
  const now = Date.now(); let lo = now;
  for (const r of campaignRows()) { const pts = tlPts(r.p.index); if (pts) lo = Math.min(lo, pts[0][0]); }
  return [Math.max(lo, now - 24 * 3.6e6), now];
}
const tlLabel = () => tl.hi - tl.t < 90e3 ? "Now" : `${fmtDuration(tl.hi - tl.t)} ago`;
function applyTl() {
  document.querySelectorAll("#mapBody [data-arc]").forEach(el => { const v = tlAt(+el.dataset.arc, tl.t); if (v != null) el.setAttribute("stroke-dasharray", `${clamp(v).toFixed(1)} 100`); });
  document.querySelectorAll("#mapBody [data-lbp]").forEach(el => { const v = tlAt(+el.dataset.lbp, tl.t); if (v != null) el.textContent = ` ${clamp(v).toFixed(0)}%`; });
  const rng = $("tlRange"); if (rng && +rng.value !== Math.round(tl.t)) rng.value = Math.round(tl.t);
  const lb = $("tlLbl"); if (lb) lb.textContent = tlLabel();
}
function tlPlay(on) {
  clearInterval(tl.timer); tl.playing = on;
  if (on) {
    [tl.lo, tl.hi] = tlRange();
    if (tl.t >= tl.hi - 60e3 || tl.t < tl.lo) tl.t = tl.lo;
    tl.timer = setInterval(() => {
      if (!document.querySelector("#mapBody [data-arc]")) { tlPlay(false); return; }
      tl.t += (tl.hi - tl.lo) / 160;
      if (tl.t >= tl.hi) { tl.t = tl.hi; tlPlay(false); }
      applyTl();
    }, 110);
  }
  const b = $("tlPlay"); if (b) b.textContent = on ? "Pause" : "Play";
}
async function startTimelapse() {
  tl.on = true; tl.playing = false; tl.loading = true; tl.got = 0;
  const rows = campaignRows().filter(r => !["defense", "parked", "region"].includes(r.prog.kind));
  tl.want = rows.length; renderMap();
  const queue = [...rows];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length && tl.on) { const r = queue.shift(); await fetchHist(r.p.index, r.prog.pct, r.p.maxHealth); tl.got++; const s = $("tlStatus"); if (s) s.textContent = `Loading history… ${tl.got} of ${tl.want} fronts`; }
  }));
  tl.loading = false;
  if (!tl.on) return;
  [tl.lo, tl.hi] = tlRange(); tl.t = tl.hi;
  renderMap();
}
function stopTimelapse() { tlPlay(false); tl.on = false; tl.loading = false; renderMap(); }
function tlPanel() {
  if (!tl.on) return "";
  const head = t => `<div class="row"><b>${t}</b><button type="button" class="link-btn" data-tl="close">Close</button></div>`;
  if (tl.loading) return `<div class="card tlcard">${head("Last 24 hours")}<p class="faint" id="tlStatus">Loading history… ${tl.got} of ${tl.want} fronts</p></div>`;
  const rows = campaignRows(), have = rows.filter(r => tlPts(r.p.index));
  if (tl.hi - tl.lo < 15 * 60e3 || !have.length)
    return `<div class="card tlcard">${head("Last 24 hours")}<p class="faint">Not enough history yet. The game's recent history wasn't available for these fronts and this extension has tracked them for under 15 minutes.</p></div>`;
  const movers = have.map(r => ({ r, d: tlAt(r.p.index, tl.hi) - tlAt(r.p.index, tl.lo) })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 3);
  return `<div class="card tlcard">${head(`Last ${fmtDuration(tl.hi - tl.lo)}`)}
    <div class="tlctl"><button type="button" class="btn" data-tl="play" id="tlPlay">${tl.playing ? "Pause" : "Play"}</button>
      <input type="range" id="tlRange" min="${Math.round(tl.lo)}" max="${Math.round(tl.hi)}" step="60000" value="${Math.round(tl.t)}" aria-label="Time">
      <span id="tlLbl" class="muted">${tlLabel()}</span></div>
    <div class="faint">The rings show each front's liberation progress at that moment. ${have.length} of ${rows.filter(r => !["defense", "parked"].includes(r.prog.kind)).length} fronts have history; defenses are not replayed.</div>
    <div class="sub-h">Biggest movers</div>
    <div class="secrows">${movers.map(m => `<button type="button" class="secrow" data-selp="${m.r.p.index}" style="--c:${color(m.r.faction)}"><span>${esc(m.r.p.name)}</span><b>${m.d >= 0 ? "+" : ""}${m.d.toFixed(1)}%</b></button>`).join("")}</div></div>`;
}

// ---- the map's fixed bar (style, overlays, search) is built once so typing in the search box never loses focus ----
function ensureMapShell() {
  const box = $("campMap");
  if (box.querySelector("#mapBody")) return;
  box.innerHTML = `<div class="mapbar">
      <div class="seg mapstyle" role="group" aria-label="Map style">${[["fronts", "Fronts"], ["stars", "Stars"], ["sectors", "Sectors"]].map(([v, l]) => `<button type="button" data-ms="${v}" aria-pressed="false">${l}</button>`).join("")}</div>
      <button type="button" class="mtog" data-mt="mo" aria-pressed="false" title="Mark the Major Order's target planets">Order</button>
      <button type="button" class="mtog" data-mt="tl" aria-pressed="false" title="Replay the last 24 hours">24h</button>
      <button type="button" class="mtog" data-mt="png" title="Save the map as an image">Image</button></div>
    <div class="mapsearch"><input type="search" id="mapQ" placeholder="Find a planet or sector" aria-label="Find a planet or sector" autocomplete="off"><div id="mapHits" class="maphits" hidden></div></div>
    <div id="mapBody"></div>`;
}
const mapPos = new Map(), secPos = new Map();
function mapSearch(q) {
  const hits = $("mapHits"); q = q.trim().toLowerCase();
  if (!q || !data) { hits.hidden = true; hits.innerHTML = ""; return; }
  const camp = new Map(campaignRows().map(r => [r.p.index, r]));
  const pl = (data.planets || []).filter(p => mapPos.has(p.index)).map(p => ({ p, n: p.name.toLowerCase() }))
    .filter(x => x.n.includes(q)).sort((a, b) => !a.n.startsWith(q) - !b.n.startsWith(q) || !camp.has(a.p.index) - !camp.has(b.p.index) || a.n.localeCompare(b.n)).slice(0, 5);
  const secs = [...secPos.keys()].filter(n => n.toLowerCase().includes(q)).slice(0, 2);
  hits.innerHTML = [...pl.map(({ p }) => {
    const r = camp.get(p.index);
    return `<button type="button" class="secrow" data-mhit="p:${p.index}" style="--c:${color(r ? r.faction : p.currentOwner)}"><span>${esc(p.name)}${r ? ` <span class="chip ${r.prog.kind === "defense" ? "solid" : ""}">${r.prog.kind === "defense" ? "Defense" : "Front"}</span>` : ""}<small class="faint">${esc(p.sector || "")}</small></span><b>${esc(p.currentOwner === "Humans" ? "Super Earth" : p.currentOwner || "")}</b></button>`;
  }), ...secs.map(n => `<button type="button" class="secrow" data-mhit="s:${esc(n)}"><span>${esc(n)} <span class="chip">Sector</span></span><b>›</b></button>`)].join("") || '<p class="faint" style="margin:4px 8px">No match.</p>';
  hits.hidden = false;
}
function focusMap(x, y, zoom) {
  mapState.s = zoom; const w = 1000 / zoom;
  mapState.vx = x - w / 2; mapState.vy = y - w / 2;
  renderMap();
}
function mapHit(v) {
  const [kind, id] = [v.slice(0, 1), v.slice(2)];
  $("mapQ").value = ""; mapSearch(""); $("mapQ").blur();   // leave the box so the map is allowed to repaint
  if (kind === "p") {
    const idx = Number(id), q = mapPos.get(idx); if (!q) return;
    mapState.sel = idx; mapState.sec = null; ensureHistory(idx); focusMap(q[0], q[1], 3.5);
  } else {
    const q = secPos.get(id); if (!q) return;
    mapState.style = "sectors"; chrome.storage.local.set({ mapStyle: "sectors" });
    mapState.sel = null; mapState.sec = id; focusMap(q[0], q[1], 2.4);
  }
}

// ---------- "Fronts" map: every active front on one chart ----------
// Across = how far along the liberation or defense is. Up = how many Helldivers are on it. The bottom right (nearly done, few divers) is
// where an extra player counts most. Dots are fronts, diamonds are defenses; rings mark risk, pins and Major Order targets.
function frontsChart(rows, { moT, moOn }) {
  const W = 600, HT = 520, L = 58, R = 586, T = 16, B = 452, pw = R - L, ph = B - T;
  const live = rows.filter(r => r.prog.kind !== "parked");
  if (!live.length) return '<div class="empty"><h3>No active fronts</h3><p>Nothing is being fought over right now.</p></div>';
  const maxPl = Math.max(1, ...live.map(r => r.players));
  const X = pct => L + clamp(pct) / 100 * pw, Y = pl => B - 10 - Math.sqrt(Math.max(0, pl) / maxPl) * (ph - 20) * 0.94;
  const yMid = Y(maxPl / 4);
  let g = "";
  g += `<rect class="fbest" x="${X(50)}" y="${yMid.toFixed(1)}" width="${(R - X(50)).toFixed(1)}" height="${(B - yMid).toFixed(1)}" rx="6"/>`;
  for (const v of [0, 25, 50, 75, 100]) g += `<line class="fgrid" x1="${X(v)}" y1="${T}" x2="${X(v)}" y2="${B}"/><text class="fax" x="${X(v)}" y="${B + 19}" text-anchor="${v === 0 ? "start" : v === 100 ? "end" : "middle"}">${v}%</text>`;
  for (const v of [0, maxPl / 4, maxPl]) g += `<line class="fgrid" x1="${L}" y1="${Y(v).toFixed(1)}" x2="${R}" y2="${Y(v).toFixed(1)}"/><text class="fax" x="${L - 6}" y="${(Y(v) + 5).toFixed(1)}" text-anchor="end">${v === 0 ? "0" : fmt(v)}</text>`;
  g += `<text class="qlab" x="${R - 8}" y="${B - 10}" text-anchor="end">Finish these</text><text class="qlab" x="${L + 8}" y="${B - 10}">Needs divers</text>
    <text class="qlab" x="${R - 8}" y="${T + 20}" text-anchor="end">Busy</text><text class="qlab" x="${L + 8}" y="${T + 20}">Crowded</text>
    <text class="fax" x="${R}" y="${HT - 6}" text-anchor="end">Progress →</text><text class="fax" x="14" y="${T + 6}" transform="rotate(-90 14 ${T + 6})" text-anchor="end">Divers →</text>`;
  const node = r => {
    const idx = r.p.index, def = r.prog.kind === "defense", rk = def && riskCache.get(idx)?.risk, c = color(r.faction), t = moT.get(idx), mo = moOn && t;
    const shape = def ? `<path class="fdef" d="M0 -11L11 0L0 11L-11 0Z" fill="${c}"/>` : `<circle class="dot" r="8" fill="${c}"/>`;
    return `<g class="mp camp ${def ? "def" : ""} ${rk ? "risk" : ""}" data-mp="${idx}" transform="translate(${X(r.prog.pct).toFixed(1)} ${Y(r.players).toFixed(1)})" style="--c:${c}">
      <circle class="hit" r="17"/>${rk ? '<circle class="riskr" r="18"/>' : ""}${pinned.has(idx) ? '<circle class="pinr" r="14"/>' : ""}${mapState.sel === idx ? '<circle class="selr" r="20"/>' : ""}${shape}
      ${mo ? `<circle class="mo-ring" r="15" fill="none"/><text class="mo-star" y="-20">${t.done ? "✓" : "★"}</text>` : ""}</g>`;
  };
  // labels: most important first, skipping any that would sit on top of one already placed
  const prio = r => (mapState.sel === r.p.index ? 100 : 0) + (riskCache.get(r.p.index)?.risk ? 90 : 0) + (r.prog.kind === "defense" ? 80 : 0) + (moOn && moT.has(r.p.index) ? 70 : 0) + (pinned.has(r.p.index) ? 60 : 0)
    + clamp(r.prog.pct) * 0.2 + (1 - r.players / maxPl) * 20;
  const placed = [], hitBox = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  let labels = "", n = 0;
  for (const r of [...live].sort((a, b) => prio(b) - prio(a))) {
    const must = prio(r) >= 60; if (!must && n >= 5) continue;
    const x = X(r.prog.pct), y = Y(r.players), left = x > 400;
    const txt = `${r.p.name} ${clamp(r.prog.pct).toFixed(0)}%${r.prog.kind === "defense" ? " · " + fmtDuration(new Date(r.prog.event.endTime) - Date.now()) : ""}`;
    const w = txt.length * 11, bx = left ? { x0: x - 14 - w, x1: x - 14 } : { x0: x + 14, x1: x + 14 + w }, box = { ...bx, y0: y - 15, y1: y + 6 };
    if (bx.x0 < 2 || bx.x1 > W - 2 || placed.some(q => hitBox(q, box))) continue;
    placed.push(box); if (!must) n++;
    labels += `<text class="lb" x="${left ? x - 14 : x + 14}" y="${(y + 5).toFixed(1)}" text-anchor="${left ? "end" : "start"}">${esc(txt)}</text>`;
  }
  const dots = [...live].sort((a, b) => (a.prog.kind === "defense") - (b.prog.kind === "defense") || a.prog.pct - b.prog.pct).map(node).join("");
  return `<svg class="gmap fchart" viewBox="0 0 ${W} ${HT}" style="--u:1.8" role="img" aria-label="Fronts: progress against Helldivers on each front">
    <g>${g}</g><g class="fnodes">${dots}</g><g>${labels}</g></svg>`;
}

// Uses the planet list the extension already fetches (each planet has a position, supply-line links and what it is attacking), so it needs no extra permissions.
let mapApply = () => {};
function renderMap() {
  if (typing()) { repaintPending = true; return; }
  ensureMapShell();
  const box = $("campMap"), body = $("mapBody");
  const planets = (data.planets || []).filter(p => Number.isFinite(p.position?.x) && Number.isFinite(p.position?.y));
  if (!planets.length) {
    body.innerHTML = '<div class="empty"><h3>Map not available yet</h3><p>The planet list with positions hasn\'t loaded. It will appear after the next successful refresh.</p></div>';
    return;
  }
  riskCache = riskMap();
  const rows = campaignRows(), byIdx = new Map(rows.map(r => [r.p.index, r])), P = new Map(planets.map(p => [p.index, p]));
  const moT = moMap(), moOn = mapOpts.mo;
  const k = 440 / Math.max(0.01, ...planets.map(p => Math.max(Math.abs(p.position.x), Math.abs(p.position.y))));
  const sy = mapState.flip ? 1 : -1;
  const X = p => (500 + p.position.x * k).toFixed(1), Y = p => (500 + sy * p.position.y * k).toFixed(1);
  mapPos.clear(); secPos.clear();
  for (const p of planets) mapPos.set(p.index, [Number(X(p)), Number(Y(p))]);
  const seen = new Set(); let lines = "", atk = "";
  for (const p of planets) for (const w of p.waypoints || []) {
    const q = P.get(w); if (!q) continue;
    const key = p.index < w ? `${p.index}-${w}` : `${w}-${p.index}`; if (seen.has(key)) continue; seen.add(key);
    lines += `<line x1="${X(p)}" y1="${Y(p)}" x2="${X(q)}" y2="${Y(q)}"/>`;
  }
  for (const p of planets) for (const t of p.attacking || []) {
    const q = P.get(t); if (q) atk += `<line x1="${X(p)}" y1="${Y(p)}" x2="${X(q)}" y2="${Y(q)}" stroke="${color(p.currentOwner)}"/>`;
  }
  const bySec = mapState.style === "sectors", secsAll = sectorStats(planets, byIdx), secs = bySec ? secsAll : new Map();
  let blobs = "", secLabels = "";
  for (const s of secsAll.values()) {
    const pts = s.planets.map(p => mapPos.get(p.index)), cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cy = pts.reduce((a, q) => a + q[1], 0) / pts.length;
    secPos.set(s.name, [cx, cy]);
    if (!bySec) continue;
    const h = hull(pts), c = color(s.lead);
    const d = h.length === 1 ? `M${h[0][0]} ${h[0][1]}l0 .1` : "M" + h.map(q => q.join(" ")).join("L") + (h.length > 2 ? "Z" : "");
    blobs += `<path class="sec ${s.mixed ? "mixed" : ""} ${mapState.sec === s.name ? "on" : ""}" data-sec="${esc(s.name)}" d="${d}" style="--c:${c}"/>`;
    const hasMo = moOn && s.planets.some(p => moT.has(p.index) && !moT.get(p.index).done);
    secLabels += `<text class="slb" x="${cx.toFixed(1)}" y="${(cy - 12).toFixed(1)}">${esc(s.name)}${s.fronts.length ? ` · ${s.fronts.length}` : ""}${hasMo ? " ★" : ""}</text>`;
  }
  const tlOn = tl.on && !tl.loading;
  if (tlOn) { [tl.lo, tl.hi] = tlRange(); tl.t = clamp(tl.t || tl.hi, tl.lo, tl.hi); }
  const arcPct = r => { const v = tlOn ? tlAt(r.p.index, tl.t) : null; return clamp(v ?? r.prog.pct); };
  const dots = [...planets].sort((a, b) => byIdx.has(a.index) - byIdx.has(b.index)).map(p => {
    const r = byIdx.get(p.index), def = r?.prog.kind === "defense", rk = def && riskCache.get(p.index)?.risk, held = color(p.currentOwner), c = color(r ? r.faction : p.currentOwner);
    const R = def ? 13 : 10;
    const ring = r ? `<circle class="ring rtrack" r="${R}"/><circle class="rarc" data-arc="${p.index}" r="${R}" pathLength="100" stroke-dasharray="${arcPct(r).toFixed(1)} 100" transform="rotate(-90)"/>${rk ? '<circle class="riskr" r="17"/>' : ""}` : "";
    return `<g class="mp ${r ? "camp" : ""} ${def ? "def" : ""} ${rk ? "risk" : ""}" data-mp="${p.index}" transform="translate(${X(p)} ${Y(p)})" style="--c:${c}">
      <circle class="hit" r="9"/>${ring}${pinned.has(p.index) ? '<circle class="pinr" r="8"/>' : ""}
      <circle class="dot" r="${r ? 5.5 : 3}" fill="${held}" ${p.currentOwner === "Humans" ? 'opacity=".6"' : ""}/>${mapState.sel === p.index ? '<circle class="selr" r="16"/>' : ""}</g>`;
  }).join("");
  let moLayer = "";
  if (moOn) for (const [i, t] of moT) {
    const q = mapPos.get(i); if (!q) continue;
    moLayer += `<g class="moov ${t.done ? "done" : ""}" transform="translate(${q[0]} ${q[1]})"><circle class="mo-ring" r="19"/><text class="mo-star" y="-23">${t.done ? "✓" : "★"}</text></g>`;
  }
  const labels = planets.filter(p => byIdx.has(p.index) || pinned.has(p.index) || p.index === 0 || mapState.sel === p.index || (moOn && moT.has(p.index))).map(p => {
    const r = byIdx.get(p.index), major = r?.prog.kind === "defense" || pinned.has(p.index) || p.index === 0 || mapState.sel === p.index || (moOn && moT.has(p.index));
    const pct = r ? ` ${arcPct(r).toFixed(0)}%` : "";
    return `<text class="lb ${major ? "" : "minor"}" x="${(Number(X(p)) + 15).toFixed(1)}" y="${(Number(Y(p)) + 4).toFixed(1)}">${esc(p.name)}<tspan class="lbp" data-lbp="${p.index}">${pct}</tspan></text>`;
  }).join("");

  const sel = mapState.sel != null ? P.get(mapState.sel) || planetsByIdx().get(mapState.sel) : null;
  const fronts = mapState.style === "fronts";
  let info = fronts ? '<p class="muted center mapHint">Bottom right = nearly done with few divers: the best place to help. Tap a dot for details.</p>'
    : '<p class="muted center mapHint">Tap a planet for details. Drag to pan, pinch or scroll to zoom.</p>';
  if (sel) {
    const r = byIdx.get(sel.index), pct = r ? clamp(r.prog.pct) : null;
    info = `<div class="card" style="--c:${color(r ? r.faction : sel.currentOwner)}">
      <div class="row"><span class="name">${pinBtn(sel.index, sel.name)}${esc(sel.name)}${r?.prog.kind === "defense" ? ' <span class="chip solid">Defense</span>' : ""}${riskCache.get(sel.index)?.risk ? ' <span class="chip warn">At risk</span>' : ""}</span>${pct != null ? `<span class="pct">${pct.toFixed(2)}%</span>` : ""}</div>
      <div class="meta"><span class="muted">${esc(planetStatus(sel.index) || "No active front")}</span></div>
      ${r ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ""}${planetDetail(sel.index)}</div>`;
  }
  const sc = bySec && !sel && mapState.sec ? secs.get(mapState.sec) : null;
  if (sc) {
    const n = sc.planets.length, names = { humans: "Super Earth", terminids: "Terminids", automaton: "Automatons", illuminate: "Illuminate" };
    const seg = FKEYS.filter(k => sc.own[k]).map(k => `<i style="width:${(sc.own[k] / n * 100).toFixed(1)}%;background:${color(k)}" title="${names[k]} ${sc.own[k]}"></i>`).join("");
    const rowsHtml = [...sc.fronts].sort((a, b) => (b.prog.kind === "defense") - (a.prog.kind === "defense") || b.prog.pct - a.prog.pct).map(r =>
      `<button type="button" class="secrow" data-selp="${r.p.index}" style="--c:${color(r.faction)}"><span>${esc(r.p.name)}${r.prog.kind === "defense" ? ' <span class="chip solid">Defense</span>' : ""}</span><b>${clamp(r.prog.pct).toFixed(1)}%</b></button>`).join("");
    info = `<div class="card"><div class="row"><span class="name">${esc(sc.name)} sector</span><span class="muted">${n} planet${n === 1 ? "" : "s"}</span></div>
      <div class="secbar">${seg}</div>
      <div class="meta"><span class="muted">${FKEYS.filter(k => sc.own[k]).map(k => `${sc.own[k]} ${names[k]}`).join(" · ")}</span></div>
      ${rowsHtml ? `<div class="sub-h">Active fronts · ${sc.fronts.length}</div><div class="secrows">${rowsHtml}</div>` : '<div class="faint">No active fronts in this sector.</div>'}</div>`;
  } else if (bySec && !sel) info = '<p class="muted center mapHint">Tap a sector for its status, or a planet for details. Drag to pan, pinch or scroll to zoom.</p>';

  // fixed bar state
  box.querySelectorAll("[data-ms]").forEach(b => { const on = b.dataset.ms === mapState.style; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
  const tog = (id, on, text) => { const b = box.querySelector(`[data-mt="${id}"]`); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); if (text) b.textContent = text; };
  tog("mo", moOn, `Order${moT.size ? " · " + moT.size : ""}`); tog("tl", tl.on);
  box.querySelector('[data-mt="tl"]').hidden = fronts; box.querySelector('[data-mt="png"]').hidden = fronts;   // those two work on the galaxy views
  if (fronts) {
    body.innerHTML = `<div class="mapwrap">${frontsChart(rows, { moT, moOn })}</div>
      <div class="maplegend">${[["Terminids", "Terminids"], ["Automaton", "Automatons"], ["Illuminate", "Illuminate"]].map(([f, l]) => `<span><i style="background:${color(f)}"></i>${l}</span>`).join("")}<span>◆ Defense</span>${moOn ? '<span><b class="mokey">★</b> Major Order target</span>' : ""}<span class="faint">ring: red = at risk, dashed = pinned</span></div>${info}`;
    return;
  }

  const w = 1000 / mapState.s;
  body.innerHTML = `<div class="mapwrap">
    <svg class="gmap ${bySec ? "bysec" : ""}" viewBox="${mapState.vx} ${mapState.vy} ${w} ${w}" role="img" aria-label="Galaxy map">
      <circle class="gal" cx="500" cy="500" r="470"/><g class="blobs">${blobs}</g><g class="lines">${lines}</g><g class="atk">${atk}</g>${dots}${moLayer}<g>${secLabels}</g>${labels}
    </svg>
    <div class="mapctl"><button type="button" data-mz="in" aria-label="Zoom in">+</button><button type="button" data-mz="out" aria-label="Zoom out">−</button><button type="button" data-mz="fit" aria-label="Reset view" title="Reset view">⌖</button><button type="button" data-mz="flip" aria-label="Flip map vertically" title="Flip the map upside down">⇅</button></div></div>
    <div class="maplegend">${[["Humans", "Super Earth"], ["Terminids", "Terminids"], ["Automaton", "Automatons"], ["Illuminate", "Illuminate"]].map(([f, l]) => `<span><i style="background:${color(f)}"></i>${l}</span>`).join("")}${moOn ? '<span><b class="mokey">★</b> Major Order target</span>' : ""}<span class="faint">${bySec ? "shading: who holds most of the sector · " : ""}ring fill: progress · red pulse: defense · dashed: attack</span></div>
    ${tlPanel()}${info}`;
  mapApply();
}

// Save the whole galaxy as a PNG (and try to copy it to the clipboard). The SVG's styles come from the stylesheet, which an image
// can't see, so each element's computed style is written into the copy first.
async function exportMap() {
  const src = document.querySelector("#mapBody svg.gmap"); if (!src) return;
  const SIZE = 1400, HEAD = 78, FOOT = 46, L = 700;
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-99999px;top:0;width:${L}px;height:${L}px;`;
  document.body.append(host);
  try {
    const c = src.cloneNode(true);
    c.setAttribute("viewBox", "0 0 1000 1000"); c.classList.remove("zoomed");
    c.style.cssText = `width:${L}px;height:${L}px;max-width:none;--u:${(1000 / L).toFixed(4)}`;
    host.append(c);
    const PROPS = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity", "font-size", "font-weight", "font-family", "letter-spacing", "text-anchor", "paint-order", "text-transform", "display"];
    const root = getComputedStyle(document.documentElement), v = n => root.getPropertyValue(n).trim();
    const bg = getComputedStyle(src).backgroundColor;
    c.querySelectorAll("*").forEach(el => { const cs = getComputedStyle(el); PROPS.forEach(p => el.style.setProperty(p, cs.getPropertyValue(p))); });
    c.querySelectorAll("*").forEach(el => el.removeAttribute("class"));
    c.removeAttribute("class"); c.setAttribute("width", SIZE); c.setAttribute("height", SIZE); c.removeAttribute("style");
    c.insertAdjacentHTML("afterbegin", `<rect x="0" y="0" width="1000" height="1000" fill="${bg}"/>`);
    const xml = new XMLSerializer().serializeToString(c);
    const img = new Image(); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml); await img.decode();
    const cv = document.createElement("canvas"); cv.width = SIZE; cv.height = SIZE + HEAD + FOOT;
    const g = cv.getContext("2d"), font = 'system-ui, "Segoe UI", sans-serif';
    g.fillStyle = v("--bg") || "#0a1f44"; g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(img, 0, HEAD, SIZE, SIZE);
    g.fillStyle = v("--accent-ink") || "#ffe033"; g.font = `800 34px ${font}`; g.textBaseline = "middle"; g.fillText("HELLDIVERS 2 · GALACTIC WAR", 24, HEAD / 2);
    g.fillStyle = v("--muted") || "#a9d4f5"; g.font = `500 22px ${font}`; g.textAlign = "right";
    g.fillText(new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" }), SIZE - 24, HEAD / 2);
    g.textAlign = "left"; let x = 24; const y = SIZE + HEAD + FOOT / 2; g.font = `600 21px ${font}`;
    for (const [f, label] of [["Humans", "Super Earth"], ["Terminids", "Terminids"], ["Automaton", "Automatons"], ["Illuminate", "Illuminate"]]) {
      g.fillStyle = color(f); g.beginPath(); g.arc(x + 8, y, 8, 0, 7); g.fill();
      g.fillStyle = v("--text") || "#fff"; g.fillText(label, x + 24, y); x += 24 + g.measureText(label).width + 28;
    }
    const blob = await new Promise(res => cv.toBlob(res, "image/png"));
    let copied = false;
    try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); copied = true; } catch { /* clipboard not allowed here: the file still downloads */ }
    const a = document.createElement("a"), d = new Date(), p2 = n => String(n).padStart(2, "0");
    a.href = URL.createObjectURL(blob); a.download = `helldivers2-map-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.png`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    flashNote(copied ? "Map image saved and copied" : "Map image saved");
  } catch (e) { console.error("map export", e); flashNote("Couldn't save the map image"); }
  finally { host.remove(); }
}
function flashNote(text) {
  const u = $("updated"); u.textContent = text;
  setTimeout(() => { if (data) F.paint(data); }, 2600);
}

// Pan and zoom on the SVG viewBox (mouse drag + wheel, one-finger drag + pinch on touch). Set up once.
function mapInit() {
  const box = $("campMap");
  const svgEl = () => box.querySelector("svg.gmap:not(.fchart)");
  const apply = () => {
    const s = svgEl(); if (!s) return;
    const w = 1000 / mapState.s;
    mapState.vx = Math.min(Math.max(mapState.vx, -w * 0.25), 1000 - w * 0.75);
    mapState.vy = Math.min(Math.max(mapState.vy, -w * 0.25), 1000 - w * 0.75);
    s.setAttribute("viewBox", `${mapState.vx} ${mapState.vy} ${w} ${w}`);
    s.style.setProperty("--u", (w / (s.clientWidth || 400)).toFixed(4));
    s.classList.toggle("zoomed", mapState.s >= 2.2);
  };
  mapApply = apply;
  const toUnits = (cx, cy) => { const r = svgEl().getBoundingClientRect(), w = 1000 / mapState.s; return [mapState.vx + (cx - r.left) / r.width * w, mapState.vy + (cy - r.top) / r.height * w]; };
  const zoomAt = (f, ux, uy) => {
    const ns = Math.min(8, Math.max(1, mapState.s * f)), w0 = 1000 / mapState.s, w1 = 1000 / ns;
    mapState.vx = ux - (ux - mapState.vx) * (w1 / w0); mapState.vy = uy - (uy - mapState.vy) * (w1 / w0); mapState.s = ns; apply();
  };
  box.addEventListener("wheel", e => {
    if (!e.target.closest("svg.gmap:not(.fchart)")) return;
    e.preventDefault(); const [ux, uy] = toUnits(e.clientX, e.clientY); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, ux, uy);
  }, { passive: false });
  const ptrs = new Map(); let drag = null, pinch = null;
  box.addEventListener("pointerdown", e => {
    if (!e.target.closest("svg.gmap")) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, vx: mapState.vx, vy: mapState.vy, moved: false, pl: e.target.closest("[data-mp]")?.dataset.mp, sec: e.target.closest("[data-sec]")?.dataset.sec };
    else { drag = null; const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: mapState.s }; }
  });
  box.addEventListener("pointermove", e => {
    if (!ptrs.has(e.pointerId) || !svgEl()) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), [ux, uy] = toUnits((a.x + b.x) / 2, (a.y + b.y) / 2);
      zoomAt((pinch.s * d / pinch.d) / mapState.s, ux, uy); return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    const r = svgEl().getBoundingClientRect(), w = 1000 / mapState.s;
    mapState.vx = drag.vx - dx / r.width * w; mapState.vy = drag.vy - dy / r.height * w; apply();
  });
  const end = e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
    if (drag && !drag.moved && e.type === "pointerup") {
      if (drag.pl != null) { mapState.sel = Number(drag.pl); mapState.sec = null; ensureHistory(mapState.sel); renderMap(); }
      else if (drag.sec != null) { mapState.sec = mapState.sec === drag.sec ? null : drag.sec; mapState.sel = null; renderMap(); }
    }
    if (!ptrs.size) drag = null;
  };
  box.addEventListener("pointerup", end); box.addEventListener("pointercancel", end);
  box.addEventListener("input", e => {
    if (e.target.id === "mapQ") mapSearch(e.target.value);
    else if (e.target.id === "tlRange") { tlPlay(false); tl.t = Number(e.target.value); applyTl(); }
  });
  box.addEventListener("keydown", e => {
    if (e.target.id !== "mapQ") return;
    if (e.key === "Enter") { const first = $("mapHits").querySelector("[data-mhit]"); if (first) mapHit(first.dataset.mhit); }
    else if (e.key === "Escape") { e.target.value = ""; mapSearch(""); }
  });
  box.addEventListener("click", e => {
    const hit = e.target.closest("[data-mhit]");
    if (hit) { mapHit(hit.dataset.mhit); return; }
    if (!e.target.closest(".mapsearch")) { const h = $("mapHits"); if (h && !h.hidden) h.hidden = true; }
    const ms = e.target.closest("[data-ms]");
    if (ms) { mapState.style = ms.dataset.ms; mapState.sec = null; if (mapState.style === "fronts" && tl.on) { tlPlay(false); tl.on = false; tl.loading = false; } chrome.storage.local.set({ mapStyle: mapState.style }); renderMap(); return; }
    const mt = e.target.closest("[data-mt]");
    if (mt) {
      const id = mt.dataset.mt;
      if (id === "mo") { mapOpts.mo = !mapOpts.mo; chrome.storage.local.set({ mapMO: mapOpts.mo }); renderMap(); }
      else if (id === "tl") { tl.on ? stopTimelapse() : startTimelapse(); }
      else if (id === "png") exportMap();
      return;
    }
    const tb = e.target.closest("[data-tl]");
    if (tb) { if (tb.dataset.tl === "close") stopTimelapse(); else tlPlay(!tl.playing); return; }
    const sp = e.target.closest("[data-selp]");
    if (sp) { mapState.sel = Number(sp.dataset.selp); mapState.sec = null; ensureHistory(mapState.sel); renderMap(); return; }
    const b = e.target.closest("[data-mz]"); if (!b) return;
    if (b.dataset.mz === "fit") { mapState.s = 1; mapState.vx = 0; mapState.vy = 0; apply(); }
    else if (b.dataset.mz === "flip") { mapState.flip = !mapState.flip; chrome.storage.local.set({ mapFlip: mapState.flip }); renderMap(); }
    else zoomAt(b.dataset.mz === "in" ? 1.5 : 1 / 1.5, mapState.vx + 500 / mapState.s, mapState.vy + 500 / mapState.s);
  });
}

// ---------- Stats ----------
const fmtInt = n => Math.round(n).toLocaleString();
const fmtSpan = sec => {
  const d = sec / 86400;
  return d >= 365.25 * 2 ? `${fmt(d / 365.25)} years` : d >= 2 ? `${fmt(d)} days` : `${Math.round(sec / 3600)} hours`;
};
const FACTION_COLOR = { Terminids: "#ffb300", Automaton: "#ff5a52", Illuminate: "#b779ff" };

// A note above cached numbers that are old because the latest refresh didn't come through.
function staleNotice(key, mins, extra) {
  const at = data.fetchedAt?.[key];
  if (!at || Date.now() - at < mins * 60e3 || extrasLoading.has(key)) return "";
  return `<div class="notice">Showing numbers from ${ago(at)}; the latest refresh didn't come through. <button type="button" class="link-btn" data-retry="${extra}">Try again</button></div>`;
}

function sourceCheck(key) {
  const note = data.diag?.[key] ? esc(data.diag[key]) : "no status recorded yet";
  return `<details class="src"><summary>Source check</summary><div>${key}: ${note}</div></details>`;
}

function renderStats() {
  const st = data.stats;
  if (!st && extrasLoading.has("stats")) { $("stats").innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>'; return; }
  if (!st) {
    const failed = String(data.diag?.stats || "").startsWith("error");
    $("stats").innerHTML = `<div class="empty">${I.chart}<h3>${failed ? "Statistics unavailable" : "No statistics yet"}</h3>
      <p>${failed ? "The statistics service didn't answer. It may be rate limited or offline, so try again in a minute." : "The galactic totals haven't loaded yet."}</p>
      <button type="button" class="btn" data-retry="stats">Try again</button>${sourceCheck("stats")}</div>`;
    return;
  }
  const has = v => v !== undefined && v !== null;
  const pill = (v, label) => `<div class="pill"><b>${v}</b><span>${label}</span></div>`;

  const kills = Object.entries(st.kills || {}).filter(([, v]) => has(v));
  const maxKill = Math.max(1, ...kills.map(([, v]) => v));
  const killRows = kills.sort((a, b) => b[1] - a[1]).map(([f, v]) => `
    <div class="card stat" style="--c:${FACTION_COLOR[f]}"><div class="row"><span class="name">${esc(f)}</span><span class="pct">${fmt(v)}</span></div>
      <div class="bar"><i style="width:${(v / maxKill) * 100}%"></i></div></div>`).join("");

  // Players per front, worked out from the campaigns we already have.
  const byFaction = {};
  campaignRows().forEach(r => { if (r.players) byFaction[r.faction] = (byFaction[r.faction] || 0) + r.players; });
  const fronts = Object.entries(byFaction).sort((a, b) => b[1] - a[1]);
  const frontTotal = fronts.reduce((s, [, v]) => s + v, 0) || 1;
  const frontRows = fronts.map(([f, v]) => `
    <div class="card stat" style="--c:${color(f)}"><div class="row"><span class="name">${esc(f)}</span>
      <span class="muted">${fmtInt(v)} players · ${((v / frontTotal) * 100).toFixed(0)}%</span></div>
      <div class="bar"><i style="width:${(v / frontTotal) * 100}%"></i></div></div>`).join("");

  const kv = [
    ["Missions won", has(st.won) && fmt(st.won)], ["Missions lost", has(st.lost) && fmt(st.lost)],
    ["Helldiver deaths", has(st.deaths) && fmt(st.deaths)], ["Revives", has(st.revives) && st.revives >= 1000 && fmt(st.revives)], // the API sometimes reports a bogus handful
    ["Time played", has(st.timePlayed) && fmtSpan(st.timePlayed)],
    ["Friendly fire", has(st.friendlies) && fmt(st.friendlies)]
  ].filter(([, v]) => v);

  $("stats").innerHTML = `${staleNotice("stats", 15, "stats")}
    <div class="pills three">
      ${pill(has(st.players) ? fmtInt(st.players) : "–", "Players online")}
      ${pill(has(st.winRate) ? st.winRate.toFixed(1) + "%" : "–", "Mission win rate")}
      ${pill(has(st.won) && has(st.lost) ? fmt(st.won + st.lost) : "–", "Missions played")}
    </div>
    ${kills.length ? `<h4>Enemy kills</h4>${killRows}` : ""}
    ${fronts.length ? `<h4>Players by front</h4>${frontRows}` : ""}
    ${kv.length ? `<h4>Operations</h4><div class="card"><div class="kv wide">${kv.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div></div>` : ""}
    <p class="faint foot">Source: ${esc(st.source || "unknown")} · all-time totals since the war began${data.fetchedAt?.stats ? " · fetched " + ago(data.fetchedAt.stats) : ""}</p>`;
}

// ---------- Democracy Space Station ----------
const ACTION_CHIP = { active: ["Active", "solid"], preparing: ["Preparing", ""], cooldown: ["Cooldown", ""], inactive: ["Inactive", ""] };

function renderStation() {
  const list = data.stations || [];
  if (!list.length && extrasLoading.has("stations")) { $("station").innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>'; return; }
  if (!list.length) {
    const ok = String(data.diag?.stations || "").startsWith("ok"), failed = String(data.diag?.stations || "").startsWith("error");
    $("station").innerHTML = `<div class="empty">${I.station}<h3>${failed ? "Space Station unavailable" : "No Space Station data"}</h3>
      <p>${ok ? "The API reports no active Democracy Space Station right now." : failed ? "The station feed didn't answer. It is the least stable data source, so try again in a minute." : "The station feed hasn't loaded yet."}</p>
      ${ok ? "" : '<button type="button" class="btn" data-retry="stations">Try again</button>'}${sourceCheck("stations")}</div>`;
    return;
  }
  $("station").innerHTML = staleNotice("stations", 25, "stations") + list.map(s => {
    const election = s.electionEnd && new Date(s.electionEnd) > Date.now() ? `${I.clock} Election ends in ${esc(timeLeft(s.electionEnd))}` : "";
    const actions = s.actions.map(a => {
      const [label, cls] = ACTION_CHIP[a.status] || [a.status.replace(/^./, c => c.toUpperCase()), ""];
      const when = a.expire && new Date(a.expire) > Date.now() && ["active", "cooldown", "preparing"].includes(a.status)
        ? `<span class="muted">${I.clock} ${esc(timeLeft(a.expire))}${a.status === "cooldown" ? " until ready" : " left"}</span>` : "";
      const costs = a.costs.filter(c => c.target > 0).map(c => `
        <div class="cost"><div class="row"><span class="faint">${esc(c.label)}</span><span class="muted">${fmt(c.current)} / ${fmt(c.target)} · ${c.pct.toFixed(0)}%</span></div>
          <div class="bar"><i style="width:${c.pct}%"></i></div></div>`).join("");
      return `<div class="card act ${a.status}"><div class="row"><span class="name">${esc(a.name)}</span><span class="chip ${cls}">${esc(label)}</span></div>
        ${a.desc ? `<p class="msg faint">${esc(a.desc)}</p>` : ""}${when ? `<div class="meta">${when}</div>` : ""}${costs}</div>`;
    }).join("");
    return `<div class="card mo"><div class="mo-top"><span class="chip solid">Space Station</span>${s.planet ? `<span class="chip">${esc(s.planet)}</span>` : ""}</div>
      <div class="mo-title">${esc(s.name)}</div>${election ? `<div class="muted">${election}</div>` : ""}</div>
      <h4>Tactical actions${s.actions.length ? ` · ${s.actions.length}` : ""}</h4>
      ${actions || '<p class="muted">No tactical actions are listed for this station.</p>'}`;
  }).join("") + `<p class="faint foot">Station data is unofficial and its format isn't fully documented, so some labels may be approximate.</p>`;
}

// ---------- News ----------
// Dispatches usually start with a headline line (e.g. "NEW MAJOR ORDER"); show it in bold.
const dispatchBody = t => {
  const [head, ...rest] = t.split("\n");
  return rest.join("").trim()
    ? `<p class="msg"><strong>${esc(head)}</strong><br>${esc(rest.join("\n").trim())}</p>`
    : `<p class="msg">${esc(t)}</p>`;
};
function renderNews() {
  const d = [...data.dispatches].sort((a, b) => b.id - a.id).slice(0, 10).map(x =>
    `<div class="card"><div class="when"><span class="chip">Dispatch</span><span class="faint">${ago(x.published)}</span></div>
     ${dispatchBody(dispatchText(x))}</div>`).join("");
  const s = [...data.steam].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)).slice(0, 8).map(x =>
    `<div class="card"><div class="when"><span class="chip">Steam</span><span class="faint">${ago(x.publishedAt)}</span></div>
     <p class="msg"><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a></p></div>`).join("");
  $("news").innerHTML = `<h4>High Command dispatches</h4>${d || '<p class="muted">Nothing yet.</p>'}
    <h4>Steam news</h4>${s || '<p class="muted">Nothing yet.</p>'}`;
}

async function markRead() {
  if (!data) return;
  const newest = Math.max(0, ...data.dispatches.map(d => d.id));
  await chrome.storage.local.set({ seenDispatch: newest });
  applyBadge();
  $("badge").hidden = true;
}

// ---------- Debug: copy the raw numbers so they can be compared with the game ----------
function debugJson() {
  const rows = campaignRows();
  const interesting = rows.filter(r => r.prog.kind !== "parked").slice(0, 20);
  const out = {
    at: new Date().toISOString(), invertDefense: invert, diag: data.diag, enemyNames, stats: data.stats || null,
    stations: (data.stations || []).slice(0, 2), stationRaw: data.stationRaw || "",
    counts: { campaigns: rows.length, parked: rows.filter(r => r.prog.kind === "parked").length },
    campaigns: interesting.map(({ p, prog, players: pl, faction }) => ({
      name: p.name, owner: p.currentOwner, faction, shownPct: +prog.pct.toFixed(2), kind: prog.kind, players: pl,
      planet: { health: p.health, maxHealth: p.maxHealth, regenPerSecond: p.regenPerSecond },
      event: p.event ? { health: p.event.health, maxHealth: p.event.maxHealth, faction: p.event.faction, endTime: p.event.endTime } : null,
      regions: (p.regions || []).slice(0, 6),
      historySamples: history[p.index]?.s?.length ?? 0
    })),
    tmHistory: Object.fromEntries(Object.entries(tmHist).map(([i, h]) => [i, { error: h.error, field: h.field, transform: h.transform, points: h.points?.length, sample: h.sample }])),
    assignments: (data.assignments || []).map(a => ({ title: clean(a.title), briefing: clean(a.briefing), description: clean(a.description), tasks: a.tasks, progress: a.progress, reward: a.reward, expiration: a.expiration }))
  };
  return JSON.stringify(out, null, 1);
}

// ---------- copy a status summary (for pasting into Discord and the like) ----------
function summaryText() {
  const rows = campaignRows(), L = [`Helldivers 2 war status, ${new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`];
  const orders = data.assignments || [];
  if (!orders.length) L.push("Major Order: none active");
  orders.forEach(a => L.push(`Major Order: ${clean(a.title) || "Major Order"}, ${moOverall(a, data, invert).toFixed(0)}% done${a.expiration ? `, ${timeLeft(a.expiration)} left` : ""}`));
  const defs = rows.filter(r => r.prog.kind === "defense").sort((a, b) => new Date(a.prog.event.endTime) - new Date(b.prog.event.endTime));
  if (defs.length) { L.push("Defense:"); defs.forEach(r => { const pr = projFor(r); L.push(`- ${r.p.name} (${r.faction}) ${Math.max(0, Math.min(100, r.prog.pct)).toFixed(1)}%, ${timeLeft(r.prog.event.endTime)} left${pr.status === "ok" ? (pr.etaMs <= pr.leftMs ? `, should hold (~${fmtDuration(pr.etaMs)})` : ", won't hold at this pace") : ""}`); }); }
  const moving = rows.filter(r => !["defense", "parked"].includes(r.prog.kind)).sort((a, b) => b.prog.pct - a.prog.pct || b.players - a.players).slice(0, 4);
  if (moving.length) { L.push("Liberation:"); moving.forEach(r => { const pr = projFor(r); L.push(`- ${r.p.name} (${r.faction}) ${r.prog.pct.toFixed(1)}%, ${fmt(r.players)} players${pr.status === "ok" ? `, ~${fmtDuration(pr.etaMs)} to liberate` : ""}`); }); }
  if (data.stats?.players) L.push(`Players online: ${fmtInt(data.stats.players)}`);
  return L.join("\n");
}
async function copySummary() {
  if (!data) return;
  const text = summaryText();
  let ok = true;
  try { await navigator.clipboard.writeText(text); } catch {
    const t = document.createElement("textarea"); t.value = text; document.body.append(t); t.select();
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    t.remove();
  }
  const u = $("updated");
  u.textContent = ok ? "Summary copied" : "Couldn't copy";
  setTimeout(() => { if (data) F.paint(data); }, 2200);
}

// ---------- theme: set here or in Drills > Themes, applied to every page from tokens.css ----------
const THEME_LIST = [["earth", "Super Earth", 0], ["dark", "Dark", 0], ["light", "Light", 0], ["terminid", "Terminid Amber", 0], ["automaton", "Automaton Red", 0],
  ["illuminate", "Illuminate Violet", 0], ["gold", "Golden Age", 1], ["stealth", "Stealth Ops", 1], ["arctic", "Arctic Frost", 1],
  ["festival", "Festival of Liberty", 1], ["harvest", "Harvest Moon", 1], ["bloom", "Spring Bloom", 1], ["destroyer", "Super Destroyer", 1], ["hive", "Terminid Hive", 1], ["chrome", "Chrome Legion", 1], ["custom", "Custom Colours", 1]];
function fillThemes(current) {
  if (document.activeElement === $("themeSel")) return;   // don't collapse the menu while it is open
  const cur = current || document.documentElement.dataset.theme || "earth";
  $("themeSel").innerHTML = THEME_LIST.map(([id, name, paid]) => {
    const locked = paid && !ownedThemes.includes(id);
    return `<option value="${id}" ${locked ? "disabled" : ""} ${id === cur ? "selected" : ""}>${locked ? "🔒 " : ""}${name}</option>`;
  }).join("");
}
// Pick a theme: applied here first, then saved; the game follows the "theme" key (or has its own choice kept in step when it isn't running).
// "Match system light/dark": while on, the theme follows the computer between Dark and Light. Picking any theme yourself (here or in Drills) switches it off.
let autoTheme = false;
const systemTheme = () => (window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
function setAutoTheme(on, save = true) {
  autoTheme = on; $("autoTheme").checked = on;
  if (save) chrome.storage.local.set({ autoTheme: on });
  if (on && document.documentElement.dataset.theme !== systemTheme()) chooseTheme(systemTheme());
}
if (window.matchMedia) matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => { if (autoTheme) chooseTheme(systemTheme()); });
async function chooseTheme(id) {
  applyTheme(id);   // first, so the list below is rebuilt with the new choice selected
  if (!$("drills").querySelector("iframe")) {
    const { hd2_eco } = await chrome.storage.local.get("hd2_eco");
    if (hd2_eco && typeof hd2_eco === "object") await chrome.storage.local.set({ hd2_eco: { ...hd2_eco, theme: id } });
  }
  await chrome.storage.local.set({ theme: id });
}
$("themeSel").addEventListener("change", e => { if (autoTheme) setAutoTheme(false); chooseTheme(e.target.value); });
$("autoTheme").addEventListener("change", e => setAutoTheme(e.target.checked));

// Toolbar badge follows the setting (unread dispatches or active defenses).
async function applyBadge() {
  if (!data) return;
  const { seenDispatch } = await chrome.storage.local.get("seenDispatch");
  const b = badgeFor(data, seenDispatch ?? Infinity, prefsNow, defHist, invert);
  chrome.action.setBadgeBackgroundColor({ color: b.bg }); chrome.action.setBadgeTextColor?.({ color: b.fg }); chrome.action.setBadgeText({ text: b.text });
}

// ---------- theme: chosen in Drills > Themes, applied to every page from tokens.css ----------
function applyTheme(id) {
  window.hd2ApplyTheme(id || "earth");
  try { localStorage.setItem("theme", id || "earth"); } catch { /* storage blocked: theme still applies this session */ }
}

// ---------- status + tabs ----------
function setStatus(state, text, title = "") {
  $("status").className = "status " + state;
  $("statusText").textContent = text;
  $("status").title = title;
}

function renderAll() {
  if (!data) return;
  riskCache = riskMap(); watchRisk(); renderStreak();
  // One tab failing to draw must not blank the others.
  for (const [fn, id] of [[renderMO, "mo"], [renderCampaigns, "campaigns"], [renderNews, "news"], [renderStats, "stats"], [renderStation, "station"]]) {
    try { fn(); } catch (e) {
      console.error(fn.name, e);
      const box = $(id === "campaigns" ? "campList" : id) || $(id);
      if (box) box.innerHTML = `<div class="empty"><h3>Couldn't draw this tab</h3><p>${esc(e?.message || e)}</p></div>`;
    }
  }
  F.paint(data);
}

// Stats, Station and Steam news are only fetched when you open their tab, which keeps the normal refresh fast.
const TAB_EXTRAS = { stats: ["stats"], station: ["stations"], news: ["steam"] };
const extrasLoading = new Set();
async function loadExtras(force = false) {
  const want = TAB_EXTRAS[tab];
  if (!want) return;
  want.forEach(k => extrasLoading.add(k)); if (data) renderAll();
  try {
    if (force && data?.fetchedAt) {   // make the next fetch due even if the cached copy is recent
      const fa = { ...data.fetchedAt }; want.forEach(k => { fa[k] = 0; });
      await chrome.storage.local.set({ data: { ...data, fetchedAt: fa } });
    }
    await chrome.runtime.sendMessage({ refresh: true, extras: want });
  } catch { /* service worker asleep */ }
  want.forEach(k => extrasLoading.delete(k));
  await load();
}

// Drills tab: the Stratagem Hero game runs in its own frame so its keys, styles and saves stay separate from the tracker.
function showDrills(on) {
  const box = $("drills");
  let frame = box.querySelector("iframe");
  if (on && !frame) {
    frame = document.createElement("iframe");
    frame.title = "Drills: Stratagem Hero practice";
    frame.src = "drills/index.html?embed=1";
    box.append(frame);
    frame.addEventListener("load", () => frame.contentWindow.focus());
  }
  if (!frame) return;
  if (on) frame.contentWindow?.postMessage("hd2:focus", location.origin);
  else frame.contentWindow?.postMessage("hd2:pause", location.origin);
}

// Settings > Tabs: hide the tabs you don't use. At least one always stays.
const TAB_NAMES = { mo: "Order", campaigns: "Campaigns", news: "News", stats: "Stats", station: "Station", drills: "Drills" };
let showStreak = true;
const visibleTabs = () => TABS.filter(t => !hiddenTabs.includes(t));
function applyTabs() {
  document.querySelectorAll("nav button[data-tab]").forEach(b => { b.hidden = hiddenTabs.includes(b.dataset.tab); });
  if (hiddenTabs.includes(tab)) setTab(visibleTabs()[0]);
}
function fillTabSettings() {
  const box = $("tabVis"), left = visibleTabs();
  box.innerHTML = TABS.map((t, i) => `<div class="tabrow"><label class="chk"><input type="checkbox" data-tabvis="${t}" ${hiddenTabs.includes(t) ? "" : "checked"} ${left.length === 1 && left[0] === t ? "disabled" : ""}>${F.t("t_" + t)}</label>
    <span class="mv"><button type="button" data-mv="${t}:-1" ${i === 0 ? "disabled" : ""} aria-label="Move ${TAB_NAMES[t]} earlier">▲</button><button type="button" data-mv="${t}:1" ${i === TABS.length - 1 ? "disabled" : ""} aria-label="Move ${TAB_NAMES[t]} later">▼</button></span></div>`).join("");
  $("streakToggle").checked = showStreak;
  applyTabs();
}
// Best Stratagem Hero streak, from the Drills save, shown next to the status in the header.
function renderStreak() {
  const best = Number(drillStats?.bestStreak) || 0, b = $("streak");
  b.hidden = !showStreak || best < 1 || hiddenTabs.includes("drills");
  if (b.hidden) return;
  const tries = (Number(drillStats.hits) || 0) + (Number(drillStats.misses) || 0);
  $("streakNum").textContent = best;
  b.title = `Best Drills streak: ${best} codes in a row${tries ? ` · ${Math.round(drillStats.hits / tries * 100)}% accuracy over ${fmt(drillStats.codes || drillStats.hits)} codes` : ""}. Click to open Drills.`;
}

function setTab(id, save = true) {
  if (tab === "drills" && id !== "drills") showDrills(false);
  tab = id;
  document.body.dataset.tab = id;
  document.querySelectorAll("nav button[data-tab]").forEach(b => {
    const on = b.dataset.tab === id;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on);
  });
  TABS.forEach(s => ($(s).hidden = s !== id));
  document.querySelector(`nav button[data-tab="${id}"]`)?.scrollIntoView({ inline: "nearest", block: "nearest" });
  if (id === "news") markRead();
  if (id === "drills") showDrills(true);
  if (save) chrome.storage.local.set({ tab: id });
  if (save) loadExtras();
}

// mode: undefined = just show cached data, "auto" = refresh if stale, "force" = refresh now
async function load(mode) {
  if (mode) {
    refreshing = true;
    document.body.classList.add("loading");
    setStatus("busy", "Updating");
    try { await chrome.runtime.sendMessage({ refresh: true, force: mode === "force" }); } catch { /* service worker asleep: cached data still shown */ }
    refreshing = false;
    document.body.classList.remove("loading");
  }
  const s = await chrome.storage.local.get(["data", "notify", "seenDispatch", "invertDefense", "history", "theme", "enemyNames", "notifyPrefs", "pinned", "moPace", "hd2_eco", "defHist", "warLog", "moLog", "snap", "hd2_stats"]);
  data = s.data;
  enemyNames = s.enemyNames || enemyNames;
  history = s.history || {};
  pinned = new Set(s.pinned || []); paceStore = s.moPace || {};
  defHist = s.defHist || {}; warLog = s.warLog || []; moLog = s.moLog || []; drillStats = s.hd2_stats || null;
  ownedThemes = Array.isArray(s.hd2_eco?.themes) ? s.hd2_eco.themes : [];
  fillThemes(s.theme);
  invert = s.invertDefense === true; // default: flipped (the "Flip defense %" switch is on)
  trackSnapshot(s.snap);
  $("notify").checked = s.notify !== false;
  showPrefs(s.notifyPrefs, s.notify !== false);
  if (s.theme && s.theme !== document.documentElement.dataset.theme) applyTheme(s.theme);
  if (data) {
    const unread = data.dispatches.filter(d => d.id > (s.seenDispatch ?? Infinity)).length;
    $("badge").textContent = unread; $("badge").hidden = !unread || tab === "news";
    if (unread && tab === "news" && !refreshing) markRead();   // the panel stays open, so dispatches that arrive while you read News count as read
    const failed = Object.entries(data.diag || {}).filter(([, v]) => JSON.stringify(v).includes("error")).map(([k]) => k);
    const backup = Object.entries(data.diag || {}).filter(([, v]) => JSON.stringify(v).includes("fallback")).map(([k]) => k);
    if (!refreshing) failed.length ? setStatus("warn", "Partial data", failed.join(", ") + " failed to load")
      : backup.length ? setStatus("", "Live · backup", backup.join(", ") + " came from the backup source (Training Manual)")
      : setStatus("", "Live", "All sources responded");
    renderAll();
  } else if (!mode) {
    TABS.filter(id => id !== "drills").forEach(id => ($(id).innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>'));
  }
}

// ---------- wiring ----------
document.querySelectorAll("nav button[data-tab]").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));
// The tab bar can be shrunk to icons only; the choice is remembered.
function setNavMin(min, save = true) {
  document.body.classList.toggle("navmin", min);
  const t = $("navToggle"); t.setAttribute("aria-expanded", String(!min));
  t.setAttribute("aria-label", min ? "Expand the tab bar" : "Minimise the tab bar"); t.title = t.getAttribute("aria-label");
  if (save) chrome.storage.local.set({ navMin: min });
}
$("navToggle").addEventListener("click", () => setNavMin(!document.body.classList.contains("navmin")));
$("refresh").addEventListener("click", () => load("force"));
$("copySummary").addEventListener("click", copySummary);
// The Admin entry stays out of sight: click the skull five times to show it.
let logoClicks = 0, logoTimer = 0;
$("logo").addEventListener("click", e => {
  e.stopPropagation();
  clearTimeout(logoTimer); logoTimer = setTimeout(() => { logoClicks = 0; }, 2500);
  if (++logoClicks >= 5) { logoClicks = 0; setSettings(true); $("adminBtn").hidden = false; }
});
const setSettings = open => { if (!open) { adminView("closed"); $("adminBtn").hidden = true; } $("settings").hidden = !open; $("settingsBtn").setAttribute("aria-expanded", open); };
$("settingsBtn").addEventListener("click", () => setSettings($("settings").hidden));
$("notify").addEventListener("change", e => chrome.storage.local.set({ notify: e.target.checked }));
$("campaigns").addEventListener("toggle", e => {
  const g = e.target.dataset?.g;
  if (g) e.target.open ? openGroups.add(g) : openGroups.delete(g);
}, true);


// ---------- notification settings ----------
const NDEF = { dispatch: true, order: true, defense: true, ending: true, endingHours: 2, planets: true, pinnedOnly: false, badge: "news", quiet: false, quietStart: "22:00", quietEnd: "07:00", interval: 5, stall: true, risk: true, riskBadge: true, riskSound: false };
let prefsNow = { ...NDEF };
function showPrefs(saved, master) {
  prefsNow = { ...NDEF, ...(saved || {}) };
  $("nDispatch").checked = prefsNow.dispatch; $("nOrder").checked = prefsNow.order; $("nDefense").checked = prefsNow.defense;
  $("nEnding").checked = prefsNow.ending; $("nEndingHours").value = String(prefsNow.endingHours); $("nPlanets").checked = prefsNow.planets;
  $("nPinnedOnly").checked = prefsNow.pinnedOnly; $("nBadge").value = prefsNow.badge;
  $("nQuiet").checked = prefsNow.quiet; $("nQuietStart").value = prefsNow.quietStart; $("nQuietEnd").value = prefsNow.quietEnd;
  $("nInterval").value = String(prefsNow.interval);
  $("nStall").checked = prefsNow.stall; $("nRisk").checked = prefsNow.risk; $("nRiskBadge").checked = prefsNow.riskBadge; $("nRiskSound").checked = prefsNow.riskSound;
  $("quietTimes").classList.toggle("off", !prefsNow.quiet);
  $("nset").classList.toggle("off", !master);
}
function savePrefs() {
  prefsNow = { dispatch: $("nDispatch").checked, order: $("nOrder").checked, defense: $("nDefense").checked,
    ending: $("nEnding").checked, endingHours: Number($("nEndingHours").value) || NDEF.endingHours, planets: $("nPlanets").checked,
    pinnedOnly: $("nPinnedOnly").checked, badge: $("nBadge").value === "defense" ? "defense" : "news", quiet: $("nQuiet").checked,
    quietStart: $("nQuietStart").value || NDEF.quietStart, quietEnd: $("nQuietEnd").value || NDEF.quietEnd, interval: Number($("nInterval").value) || NDEF.interval,
    stall: $("nStall").checked, risk: $("nRisk").checked, riskBadge: $("nRiskBadge").checked, riskSound: $("nRiskSound").checked };
  $("quietTimes").classList.toggle("off", !prefsNow.quiet);
  chrome.storage.local.set({ notifyPrefs: prefsNow });
  applyBadge();
}
["nDispatch", "nOrder", "nDefense", "nEnding", "nEndingHours", "nPlanets", "nPinnedOnly", "nBadge", "nQuiet", "nQuietStart", "nQuietEnd", "nInterval", "nStall", "nRisk", "nRiskBadge", "nRiskSound"].forEach(id => $(id).addEventListener("change", savePrefs));
$("notify").addEventListener("change", e => $("nset").classList.toggle("off", !e.target.checked));

// ---------- admin menu (password protected) ----------
// The password is built in: only a salted PBKDF2 hash of it is stored here, never the password itself. This keeps
// casual users out of the debug tools; it isn't strong security, because anyone who can edit the extension's own
// files can remove the check. Five wrong attempts lock the menu for five minutes.
const ADMIN = { salt: "c9f4965af203adf5fd8b2278609d5e7d", hash: "4c203c062118d9fec8a0a431b3b45630353235c96686e95c96350422d04ee5e4", rounds: 150000 };
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
async function checkPassword(pw) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const salt = Uint8Array.from(ADMIN.salt.match(/../g).map(h => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ADMIN.rounds }, key, 256);
  return hex(bits) === ADMIN.hash;
}
function adminView(view) {
  $("adminBox").hidden = view === "closed";
  $("adminBtn").setAttribute("aria-expanded", view !== "closed");
  if (view === "form") { $("adminPw").value = ""; $("adminMsg").textContent = ""; $("adminPw").focus(); }
}
$("adminBtn").addEventListener("click", () => adminView($("adminBox").hidden ? "form" : "closed"));
$("adminCancel").addEventListener("click", () => adminView("closed"));
// One admin menu: the right password jumps to the Drills tab and opens High Command, which holds the game's and the tracker's admin tools together.
let drillsReady = false, pendingAdmin = false;
function openCombinedAdmin() {
  setSettings(false);
  setTab("drills");
  const frame = $("drills").querySelector("iframe");
  if (drillsReady && frame) frame.contentWindow.postMessage("hd2:admin", location.origin); else pendingAdmin = true;
}
window.addEventListener("message", e => {
  const frame = $("drills").querySelector("iframe");
  if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
  if (e.data === "hd2:ready") {
    drillsReady = true;
    if (pendingAdmin) { pendingAdmin = false; frame.contentWindow.postMessage("hd2:admin", location.origin); }
  } else if (e.data === "hd2:debug") frame.contentWindow.postMessage({ t: "hd2:debug", json: data ? debugJson() : null }, location.origin);
});
$("adminForm").addEventListener("submit", async e => {
  e.preventDefault();
  const msg = $("adminMsg"), { adminFail } = await chrome.storage.local.get("adminFail");
  if (adminFail?.until > Date.now()) { msg.textContent = `Too many attempts. Try again in ${Math.ceil((adminFail.until - Date.now()) / 60000)} min.`; return; }
  if (await checkPassword($("adminPw").value)) {
    await chrome.storage.local.remove("adminFail");
    adminView("closed"); openCombinedAdmin();
  } else {
    const n = (adminFail?.n || 0) + 1;
    await chrome.storage.local.set({ adminFail: n >= 5 ? { n: 0, until: Date.now() + 5 * 60e3 } : { n, until: 0 } });
    msg.textContent = n >= 5 ? "Too many attempts. Locked for 5 minutes." : "Wrong password.";
    $("adminPw").select();
  }
});
chrome.storage.local.remove(["adminAuth", "notes"]);   // "notes" came from an earlier 3.5 build // from the earlier build, where you chose the password yourself


// Settings: tabs to show, header streak
$("tabVis").addEventListener("change", e => {
  const t = e.target.dataset?.tabvis; if (!t) return;
  hiddenTabs = e.target.checked ? hiddenTabs.filter(x => x !== t) : [...new Set([...hiddenTabs, t])];
  if (hiddenTabs.length >= TABS.length) hiddenTabs = hiddenTabs.filter(x => x !== t);
  chrome.storage.local.set({ hiddenTabs }); fillTabSettings(); renderStreak();
});
$("streakToggle").addEventListener("change", e => { showStreak = e.target.checked; chrome.storage.local.set({ showStreak }); renderStreak(); });
$("streak").addEventListener("click", () => setTab("drills"));
// A map repaint held back while the search box had focus runs once you leave it.
document.addEventListener("focusout", () => setTimeout(() => { if (repaintPending && !typing() && data) { repaintPending = false; renderAll(); } }, 0));
document.addEventListener("toggle", e => {
  const t = e.target;
  if (t.dataset?.fn) { const i = Number(t.dataset.fn); t.open ? openFN.add(i) : openFN.delete(i); }
  else if (t.id === "recapBox") t.open ? openGroups.add("__recap") : openGroups.delete("__recap");
}, true);

// Click a planet to open or close its details; click anywhere else to close settings.
document.addEventListener("click", e => {
  if (!$("settings").hidden && !e.composedPath().some(n => n.id === "settings" || n.id === "settingsBtn")) setSettings(false);   // composedPath: a button that re-draws itself (tab arrows) is already detached when this runs
  const go = e.target.closest("[data-goto]");
  if (go) { gotoPlanet(Number(go.dataset.goto)); return; }
  if (e.target.closest("[data-since]")) { sinceDismissed = true; renderMO(); return; }
  const pin = e.target.closest("[data-pin]");
  if (pin) { togglePin(Number(pin.dataset.pin)); return; }
  const retry = e.target.closest("[data-retry]");
  if (retry) { loadExtras(true); return; }
  if (e.target.closest(".detail") || !data) return;
  const el = e.target.closest("[data-pl]");
  if (el) togglePlanet(Number(el.dataset.pl));
});
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("[data-pl]") && data) { e.preventDefault(); togglePlanet(Number(e.target.dataset.pl)); }
});

// The background saves results as each source arrives; repaint straight away.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.customTheme) { window.hd2Custom.sync(changes.customTheme.newValue); }
  if (changes.theme?.newValue) { applyTheme(changes.theme.newValue); if (autoTheme && changes.theme.newValue !== systemTheme()) setAutoTheme(false); }   // picked in Drills > Themes
  if (changes.invertDefense) { invert = changes.invertDefense.newValue === true; if (data) renderAll(); }   // toggled in High Command
  if (changes.hd2_eco && Array.isArray(changes.hd2_eco.newValue?.themes)) { ownedThemes = changes.hd2_eco.newValue.themes; fillThemes(); }
  if (changes.hd2_stats) { drillStats = changes.hd2_stats.newValue || null; renderStreak(); }
  if (changes.data || changes.history || changes.moPace || changes.defHist || changes.warLog || changes.moLog) load();
});

(async () => {
  const saved = await chrome.storage.local.get(["autoTheme", "tab", "theme", "campView", "mapFlip", "mapStyle", "mapMO", "hiddenTabs", "showStreak", "navMin"]);
  if (saved.campView === "map") campView = "map";
  mapState.flip = saved.mapFlip === true; mapState.style = ["stars", "sectors", "fronts"].includes(saved.mapStyle) ? saved.mapStyle : "fronts"; mapOpts.mo = saved.mapMO === true;
  hiddenTabs = Array.isArray(saved.hiddenTabs) ? saved.hiddenTabs.filter(t => TABS.includes(t)) : []; showStreak = saved.showStreak !== false;
  if (hiddenTabs.length >= TABS.length) hiddenTabs = [];
  await F.init({ TABS, visibleTabs, setTab, setSettings, load, tab: () => tab, data: () => data, prefs: () => prefsNow, refillTabs: fillTabSettings, relabel: fillTabSettings });
  setNavMin(saved.navMin === true, false);
  applyTheme(saved.theme || document.documentElement.dataset.theme);
  if (saved.autoTheme === true) setAutoTheme(true, false);
  const want = saved.tab === "training" ? "drills" : TABS.includes(saved.tab) ? saved.tab : "mo";
  setTab(hiddenTabs.includes(want) ? visibleTabs()[0] : want, false); fillTabSettings();
  await load();          // cached data appears instantly
  await load("auto");    // then refresh (the background skips it if data is under 45s old)
  loadExtras();          // and the saved tab's extra data, if it has any
  setInterval(() => data && renderAll(), 30000); // keep countdowns ticking
})();
