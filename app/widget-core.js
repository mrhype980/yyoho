// Shared by the desktop widget and the widget designer: turns the saved war data into plain "state",
// draws it either as the classic cards or as a layout built from parts (a preset, or the player's own),
// and keeps the layout / preference settings valid. Same maths as the tracker panel, no extra requests.
import { campaignProgress, projection, fmtDuration, moOverall, moPace, timeLeft, clean } from "./api.js";
import { defenseRisk } from "./insights.js";

export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const clampPct = v => Math.max(0, Math.min(100, Number(v) || 0));
const COLORS = { humans: "#6ec6ff", terminids: "#ffb300", automaton: "#ff5a52", illuminate: "#b779ff" };
export const factionColor = f => { const k = String(f || "").toLowerCase(); return Object.entries(COLORS).find(([n]) => k.startsWith(n))?.[1] || "#6ec6ff"; };

/* ---------- state: everything a part can show ---------- */
export function ago(ms) {
  if (!(ms >= 0)) return "";
  const m = Math.floor(ms / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
}
const chipOf = (cls, text) => ({ cls, text });
function etaChip(pr, def, leftMs) {
  if (pr.status === "ok") {
    if (def) return pr.etaMs <= leftMs ? chipOf("ok", `Holds in ~${fmtDuration(pr.etaMs)}`) : chipOf("bad", "Won't hold at this pace");
    return chipOf("", `~${fmtDuration(pr.etaMs)} to liberate`);
  }
  if (pr.status === "losing") return chipOf("bad", "Losing ground");
  if (pr.status === "stalled") return chipOf(def ? "bad" : "", "Stalled");
  if (pr.status === "parked") return chipOf("", "No progress yet");
  return null;
}
const hm = ms => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function buildState(S = {}, now = Date.now()) {
  const st = { has: false, clock: hm(now), updated: "", dot: "", dotTitle: "", sub: "Waiting for data", mo: [], defs: [], defTotal: 0, pins: [], pinCount: (S.pinned || []).length };
  const data = S.data, invert = S.invertDefense === true;
  if (!data || !data.campaigns) return st;
  st.has = true;
  const age = now - (data.updated || 0), idx = new Map((data.planets || []).map(p => [p.index, p]));
  st.defTotal = (data.campaigns || []).filter(c => campaignProgress(c, idx, invert).kind === "defense").length;
  st.updated = `updated ${ago(age)}`;
  st.sub = `${st.defTotal} defense${st.defTotal === 1 ? "" : "s"} · ${st.updated}`;
  st.dot = age < 10 * 60e3 ? "g" : age < 30 * 60e3 ? "a" : "r";
  st.dotTitle = data.updated ? "Last updated " + new Date(data.updated).toLocaleTimeString() : "";

  // Major Order(s)
  st.mo = (data.assignments || []).filter(a => !a.expiration || new Date(a.expiration) > now).map(a => {
    const pct = clampPct(moOverall(a, data, invert)), p = moPace((S.moPace || {})[String(a.id ?? a.expiration ?? "")], pct, a.expiration, now);
    const chip = !p ? null : p.status === "done" ? chipOf("ok", "Complete") : p.status === "ahead" ? chipOf("ok", "On track")
      : p.status === "behind" ? chipOf("bad", "Behind pace") : p.status === "stalled" || p.status === "losing" ? chipOf("bad", p.status === "losing" ? "Losing ground" : "Stalled") : null;
    return { title: clean(a.title) || "Major Order", pct, left: a.expiration ? `${timeLeft(a.expiration)} left` : "", expires: a.expiration ? (new Date(a.expiration).getTime() || 0) : 0, chip };
  });

  // Defenses, most urgent first
  const byFaction = new Map((data.campaigns || []).map(c => [c.planet?.index, c.planet?.event?.faction || c.faction]));
  st.defs = defenseRisk(data.campaigns, data.planets, S.defHist || {}, invert, now).map(r => {
    const pr = { status: r.status, perHour: r.perHour, etaMs: r.status === "ok" && r.perHour > 0 ? ((100 - r.pct) / r.perHour) * 3.6e6 : undefined };
    return { name: r.name, pct: r.pct, leftMs: r.leftMs, left: fmtDuration(r.leftMs), risk: !!r.risk, color: factionColor(byFaction.get(r.idx)), chip: r.risk ? chipOf("bad", "Won't hold") : etaChip(pr, true, r.leftMs) };
  });

  // Pinned planets that have a (non-defense) campaign
  const pinned = new Set(S.pinned || []);
  st.pins = (data.campaigns || []).map(c => ({ c, prog: campaignProgress(c, idx, invert) }))
    .filter(r => pinned.has(r.c.planet?.index) && r.prog.kind !== "defense")
    .map(({ c, prog }) => {
      const p = prog.planet, pr = prog.kind === "parked" ? { status: "parked" } : projection((S.history || {})[p.index], prog.pct, now);
      return { name: p.name || "Planet " + p.index, pct: clampPct(prog.pct), region: prog.kind === "region" ? (prog.region || "") : "", chip: etaChip(pr, false, 0), color: factionColor(p.currentOwner !== "Humans" ? p.currentOwner : c.faction) };
    });
  return st;
}

// What the designer shows (and what a part shows when you are just trying things out): fixed, believable numbers.
export const SAMPLE = {
  has: true, clock: "10:21", updated: "updated 2m ago", dot: "g", dotTitle: "", sub: "2 defenses · updated 2m ago", defTotal: 2, pinCount: 2,
  mo: [{ title: "Liberate Meridia", pct: 63, left: "2d 4h left", chip: chipOf("ok", "On track") }],
  defs: [
    { name: "Tibit", pct: 42.1, leftMs: 72 * 60e3, left: "1h 12m", risk: true, color: "#ff5a52", chip: chipOf("bad", "Won't hold") },
    { name: "Fenmire", pct: 78.4, leftMs: 185 * 60e3, left: "3h 5m", risk: false, color: "#ffb300", chip: chipOf("ok", "Holds in ~43m") }
  ],
  pins: [
    { name: "Mort", pct: 55.4, region: "", chip: chipOf("", "~2h 10m to liberate"), color: "#ffb300" },
    { name: "Hellmire", pct: 12, region: "", chip: chipOf("", "Stalled"), color: "#ffb300" }
  ]
};

/* ---------- classic cards ---------- */
const chipHTML = c => c ? `<span class="chip${c.cls ? " " + c.cls : ""}">${esc(c.text)}</span>` : "";
export function moCardsHTML(s) {
  if (!s.mo.length) return `<div class="sec">Major Order</div><div class="card empty">No Major Order right now.</div>`;
  return `<div class="sec">Major Order</div>` + s.mo.map(m => `<div class="card mo"><div class="row"><b>${esc(m.title)}</b><span class="r">${m.pct.toFixed(0)}%</span></div>
      <div class="bar"><i style="width:${m.pct}%"></i></div>
      <div class="meta"><span>${esc(m.left)}</span>${chipHTML(m.chip)}</div></div>`).join("");
}
export function defCardsHTML(s) {
  if (!s.defs.length) return `<div class="sec">Defenses</div><div class="card empty">No planets under attack.</div>`;
  return `<div class="sec">Defenses (${s.defs.length})</div>` + s.defs.map(d => `<div class="card" style="--c:${d.color}"><div class="row"><b>${esc(d.name)}</b><span class="r">${esc(d.left)} left</span></div>
      <div class="bar"><i style="width:${clampPct(d.pct)}%"></i></div>
      <div class="meta"><span>${d.pct.toFixed(1)}% held</span>${chipHTML(d.chip)}</div></div>`).join("");
}
export function pinCardsHTML(s) {
  if (!s.pinCount) return `<div class="sec">Pinned planets</div><div class="card empty">Pin planets in the tracker to follow them here.</div>`;
  if (!s.pins.length) return `<div class="sec">Pinned planets</div><div class="card empty">None of your pinned planets has a campaign right now.</div>`;
  return `<div class="sec">Pinned planets</div>` + s.pins.map(p => `<div class="card" style="--c:${p.color}"><div class="row"><b>${esc(p.name)}</b><span class="r">${p.pct.toFixed(1)}%</span></div>
      <div class="bar"><i style="width:${p.pct}%"></i></div>
      <div class="meta"><span>${esc(p.region)}</span>${chipHTML(p.chip)}</div></div>`).join("");
}
export function cardsHTML(s, prefs) {
  if (!s.has) return `<div class="card empty">Waiting for the first war update. This fills in within a minute of opening the tracker.</div>`;
  const html = (prefs.mo ? moCardsHTML(s) : "") + (prefs.defense ? defCardsHTML(s) : "") + (prefs.pinned ? pinCardsHTML(s) : "");
  return html || `<div class="card empty">Nothing selected. Use the gear to pick what to show.</div>`;
}

/* ---------- parts ---------- */
// [key, symbol on the palette tile, name, group]. "br" (new line) and "space" can be used any number of times; every other part once.
export const GROUPS = [["basics", "Basics"], ["mo", "Major Order"], ["def", "Defenses"], ["pin", "Pinned planets"], ["blk", "Whole sections"]];
export const PARTS = [
  ["icon", "◆", "App icon", "basics"], ["title", "Aa", "HELLDIVERS 2", "basics"], ["clock", "🕐", "Clock", "basics"], ["updated", "⟳", "Last updated", "basics"],
  ["dot", "●", "Status dot", "basics"], ["space", "↔", "Space", "basics"], ["br", "↵", "New line", "basics"],
  ["moTitle", "★", "Order name", "mo"], ["moBig", "63%", "Order % (big)", "mo"], ["moPct", "%", "Order %", "mo"], ["moLeft", "⏳", "Order time left", "mo"],
  ["moChip", "✔", "Order pace", "mo"], ["moBar", "▬▬", "Order bar", "mo"], ["moRing", "◔", "Order ring", "mo"],
  ["defCount", "🛡", "Defense count", "def"], ["defName", "Abc", "Top defense", "def"], ["defBig", "1h", "Defense timer (big)", "def"], ["defLeft", "⏱", "Defense time left", "def"],
  ["defPct", "42%", "Defense held", "def"], ["defChip", "!", "Defense verdict", "def"], ["defBar", "▬▬", "Defense bar", "def"], ["defList", "☰", "Defense list", "def"],
  ["pinName", "📍", "Pinned planet", "pin"], ["pinPct", "55%", "Pinned %", "pin"], ["pinEta", "~2h", "Pinned estimate", "pin"], ["pinBar", "▬▬", "Pinned bar", "pin"], ["pinList", "☰", "Pinned list", "pin"],
  ["moCard", "▭", "Major Order card", "blk"], ["defCards", "▭", "Defense cards", "blk"], ["pinCards", "▭", "Pinned cards", "blk"]
];
export const PART_NAMES = Object.fromEntries(PARTS.map(([k, , n]) => [k, n]));
export const REPEATABLE = new Set(["br", "space"]);

const sp = (cls, inner, a, extra = "") => `<span class="lp cp ${cls}"${a}${extra}>${inner}</span>`;
const barOf = (cls, pct, color, a) => sp(`barp ${cls}`, `<i style="width:${clampPct(pct)}%"></i>`, a, color ? ` style="--c:${color}"` : "");
const ringOf = (frac, label, a) => {
  const C = 138.2;
  return sp("ringp", `<svg width="56" height="56" viewBox="0 0 56 56"><circle cx="28" cy="28" r="22" class="rt"/><circle cx="28" cy="28" r="22" class="rf" stroke-dasharray="${C}" stroke-dashoffset="${(C * (1 - frac)).toFixed(1)}" transform="rotate(-90 28 28)"/></svg><span class="rl">${esc(label)}</span>`, a);
};
const when = (x, f) => (x ? f(x) : "");
const mo0 = s => s.mo[0], d0 = s => s.defs[0], p0 = s => s.pins[0];
const R = {
  icon: (s, a) => sp("ic", `<img src="icons/icon48.png" alt="" width="22" height="22" draggable="false">`, a),
  title: (s, a) => sp("ttl", "HELLDIVERS 2", a),
  clock: (s, a) => sp("mut", esc(s.clock), a),
  updated: (s, a) => when(s.has, () => sp("mut", esc(s.updated), a)),
  dot: (s, a) => sp("dotp", `<i class="dot ${s.dot}" title="${esc(s.dotTitle)}"></i>`, a),
  space: (s, a) => sp("sp", "", a),
  moTitle: (s, a) => sp("nm", esc(mo0(s) ? mo0(s).title : "No Major Order"), a),
  moBig: (s, a) => when(mo0(s), m => sp("big", `${m.pct.toFixed(0)}%`, a)),
  moPct: (s, a) => when(mo0(s), m => sp("val", `${m.pct.toFixed(0)}%`, a)),
  moLeft: (s, a) => when(mo0(s)?.left, t => sp("mut", esc(t), a)),
  moChip: (s, a) => when(mo0(s)?.chip, c => sp("chipw", chipHTML(c), a)),
  moBar: (s, a) => when(mo0(s), m => barOf("mo", m.pct, "", a)),
  moRing: (s, a) => when(mo0(s), m => ringOf(m.pct / 100, `${m.pct.toFixed(0)}%`, a)),
  defCount: (s, a) => sp("val", s.defTotal ? `${s.defTotal} defense${s.defTotal === 1 ? "" : "s"}` : "No defenses", a),
  defName: (s, a) => sp("nm", esc(d0(s) ? d0(s).name : "No defenses"), a),
  defBig: (s, a) => when(d0(s), d => sp(`big${d.risk ? " risk" : ""}`, esc(d.left), a)),
  defLeft: (s, a) => when(d0(s), d => sp(`val${d.risk ? " risk" : ""}`, `${esc(d.left)} left`, a)),
  defPct: (s, a) => when(d0(s), d => sp("val", `${d.pct.toFixed(1)}% held`, a)),
  defChip: (s, a) => when(d0(s)?.chip, c => sp("chipw", chipHTML(c), a)),
  defBar: (s, a) => when(d0(s), d => barOf("", d.pct, d.color, a)),
  defList: (s, a) => s.defs.length
    ? sp("blk", `<div class="lst">${s.defs.map(d => `<div class="li" style="--c:${d.color}"><span class="nm"><i class="sw"></i>${esc(d.name)}</span><span class="v">${d.pct.toFixed(0)}%</span><span class="v${d.risk ? " risk" : ""}">${esc(d.left)}</span></div>`).join("")}</div>`, a)
    : sp("blk mut", "No planets under attack", a),
  pinName: (s, a) => sp("nm", esc(p0(s) ? p0(s).name : s.pinCount ? "No pinned campaign" : "No pinned planets"), a),
  pinPct: (s, a) => when(p0(s), p => sp("val", `${p.pct.toFixed(1)}%`, a)),
  pinEta: (s, a) => when(p0(s)?.chip, c => sp("chipw", chipHTML(c), a)),
  pinBar: (s, a) => when(p0(s), p => barOf("", p.pct, p.color, a)),
  pinList: (s, a) => s.pins.length
    ? sp("blk", `<div class="lst">${s.pins.map(p => `<div class="li" style="--c:${p.color}"><span class="nm"><i class="sw"></i>${esc(p.name)}</span><span class="v">${p.pct.toFixed(1)}%</span><span class="v mut">${p.chip ? esc(p.chip.text) : ""}</span></div>`).join("")}</div>`, a)
    : sp("blk mut", s.pinCount ? "No pinned campaign right now" : "Pin planets in the tracker", a),
  moCard: (s, a) => sp("blk", `<div class="stack">${moCardsHTML(s)}</div>`, a),
  defCards: (s, a) => sp("blk", `<div class="stack">${defCardsHTML(s)}</div>`, a),
  pinCards: (s, a) => sp("blk", `<div class="stack">${pinCardsHTML(s)}</div>`, a)
};

// Lines are separated by "br"; a line with nothing to show disappears (except in the designer, which shows every part).
export function renderItems(items, s, { editor = false, align = "left" } = {}) {
  const lines = [{ items: [] }];
  items.forEach((t, i) => { if (t === "br") { lines[lines.length - 1].br = i; lines.push({ items: [] }); } else lines[lines.length - 1].items.push([t, i]); });
  const ctr = align === "center" ? " ctr" : "";
  const rows = lines.map(l => {
    const pieces = l.items.map(([t, i]) => [t, R[t] ? R[t](s, editor ? ` draggable="true" data-i="${i}"` : "") : ""]);
    const html = pieces.map(p => p[1]).join("");
    if (editor) return `<div class="lrow${ctr}">${html}${l.br !== undefined ? `<span class="lp cp brm" draggable="true" data-i="${l.br}">↵</span>` : ""}</div>`;
    return pieces.some(([t, h]) => h && t !== "space") ? `<div class="lrow${ctr}">${html}</div>` : "";
  }).filter(Boolean);
  if (editor) return `<div class="lbody">${items.length ? rows.join("") : `<div class="lhint">Blank layout. Drag parts here.</div>`}</div>`;
  if (!rows.length) return `<div class="lbody"><div class="lhint">${items.length ? "Nothing to show right now" : "Blank layout. Open the gear and choose Customise layout."}</div></div>`;
  return `<div class="lbody${rows.length === 1 ? " one" : ""}">${rows.join("")}</div>`;
}

/* ---------- ready-made styles, and settings that are always kept valid ---------- */
export const PRESETS = {
  stack:   { name: "Stacked",       items: ["title", "space", "dot", "br", "moTitle", "br", "moBig", "space", "moLeft", "br", "moBar", "br", "moChip", "space", "defCount"] },
  row:     { name: "One line",      items: ["moPct", "moTitle", "space", "defCount"] },
  compact: { name: "Compact",       items: ["moTitle", "space", "moPct", "br", "moBar", "br", "defName", "space", "defLeft", "br", "defBar"] },
  ring:    { name: "Ring",          items: ["moRing", "moTitle", "space", "defCount", "br", "moLeft", "space", "moChip"] },
  alert:   { name: "Defense alert", items: ["title", "space", "dot", "br", "defBig", "br", "defName", "space", "defPct", "br", "defBar", "br", "defChip"] },
  planets: { name: "Planets",       items: ["title", "space", "dot", "br", "pinList"] },
  full:    { name: "Full sections", items: ["icon", "title", "space", "dot", "br", "moCard", "defCards", "pinCards"], designerOnly: true },
  blank:   { name: "Blank",         items: [], designerOnly: true }
};
// What the widget's style picker offers: the classic cards, the ready-made layouts, and the player's own.
export const STYLES = [["cards", "Cards"], ...Object.entries(PRESETS).filter(([, v]) => !v.designerOnly).map(([k, v]) => [k, v.name]), ["custom", "My layout"]];
export const STYLE_NAMES = Object.fromEntries(STYLES);
export const FONTS = {
  system: ["Standard", `-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`],
  rounded: ["Rounded", `ui-rounded, "SF Pro Rounded", -apple-system, sans-serif`],
  serif: ["Serif", `ui-serif, Georgia, "Times New Roman", serif`],
  mono: ["Mono", `ui-monospace, "SF Mono", Menlo, monospace`]
};
const HEX = /^#[0-9a-f]{6}$/i, num = (v, lo, hi, d) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : d);

export const LAYOUT_DEFAULT = { items: PRESETS.stack.items, size: 34, width: 300, radius: 14, align: "left", font: "system", border: 1, own: 0, bg: "#14181f", fg: "#e8eaf2", acc: "#ff7a3d" };
export function normaliseLayout(x) {
  const o = { ...LAYOUT_DEFAULT, items: [...LAYOUT_DEFAULT.items] };
  if (!x || typeof x !== "object") return o;
  if (Array.isArray(x.items)) {
    const seen = new Set();
    o.items = x.items.filter(t => { if (!R[t] && t !== "br") return false; if (REPEATABLE.has(t)) return true; if (seen.has(t)) return false; seen.add(t); return true; }).slice(0, 40);
  }
  o.size = num(x.size, 18, 64, o.size); o.width = num(x.width, 240, 420, o.width); o.radius = num(x.radius, 0, 32, o.radius);
  o.align = x.align === "center" ? "center" : "left"; o.font = FONTS[x.font] ? x.font : "system";
  o.border = x.border === 0 || x.border === false ? 0 : 1; o.own = x.own ? 1 : 0;
  for (const k of ["bg", "fg", "acc"]) if (HEX.test(x[k])) o[k] = x[k];
  return o;
}
export const PREFS_DEFAULT = { mo: true, defense: true, pinned: true, opacity: 92, allSpaces: true, style: "cards", level: "top" };
export function normalisePrefs(x) {
  const o = { ...PREFS_DEFAULT, ...(x && typeof x === "object" ? x : {}) };
  o.opacity = num(o.opacity, 40, 100, 92); o.style = STYLE_NAMES[o.style] ? o.style : "cards"; o.level = o.level === "desktop" ? "desktop" : "top";
  o.mo = o.mo !== false; o.defense = o.defense !== false; o.pinned = o.pinned !== false; o.allSpaces = o.allSpaces !== false;
  return o;
}
export const itemsFor = (style, layout) => (style === "custom" ? layout.items : PRESETS[style]?.items || []);

// Sets the look of one widget box: transparency, big-number size, corners, font, outline and (optionally) the player's own colours.
export function applyBox(el, layout, prefs, { parts = true } = {}) {
  const s = el.style;
  s.setProperty("--a", String(prefs.opacity / 100));
  const own = ["--panel", "--header-top", "--card", "--text", "--muted", "--faint", "--accent", "--accent-ink", "--light", "--on-accent", "--track", "--card-line", "--chip-bg"];
  own.forEach(n => s.removeProperty(n));
  s.removeProperty("--big"); s.fontFamily = ""; s.borderRadius = ""; s.borderColor = "";
  if (!parts) return;
  s.setProperty("--big", layout.size + "px");
  s.borderRadius = layout.radius + "px";
  s.fontFamily = FONTS[layout.font][1];
  if (!layout.border) s.borderColor = "transparent";
  if (layout.own) {
    const { bg, fg, acc } = layout, mix = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
    s.setProperty("--panel", bg); s.setProperty("--header-top", bg); s.setProperty("--card", `color-mix(in srgb, ${fg} 8%, ${bg})`);
    s.setProperty("--text", fg); s.setProperty("--muted", mix(fg, 72)); s.setProperty("--faint", mix(fg, 50));
    s.setProperty("--accent", acc); s.setProperty("--accent-ink", acc); s.setProperty("--light", acc); s.setProperty("--on-accent", bg);
    s.setProperty("--track", mix(fg, 16)); s.setProperty("--card-line", mix(fg, 14)); s.setProperty("--chip-bg", mix(fg, 11));
  }
}

/* ---------- theme (shared by both pages): follows the panel, or the system when "Match system light/dark" is on ---------- */
export function makeThemer(getS) {
  const systemTheme = () => (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  const apply = () => {
    const S = getS() || {};
    let id = "superearth", saved = null;
    try { saved = localStorage.getItem("theme"); } catch { /* storage blocked */ }
    id = saved || id;
    if (S.autoTheme) id = systemTheme();
    else if (S.theme && !saved) id = S.theme;
    if (S.customTheme && window.hd2Custom) window.hd2Custom.sync(S.customTheme);
    window.hd2ApplyTheme(id);
  };
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => { if ((getS() || {}).autoTheme) apply(); });
  addEventListener("storage", e => { if (e.key === "theme" || e.key === "customTheme") apply(); });
  return apply;
}
