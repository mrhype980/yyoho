// Shares the war numbers with the native macOS widget (the one in the widget gallery).
// A widget cannot read the app's storage, so whenever the saved war data changes this turns it into a small plain
// JSON snapshot and hands it to the main process, which writes it where the widget can read it (see main.js and widget/).
// Same numbers as the desktop widget (it uses the same buildState), no extra requests.
import { buildState } from "./widget-core.js";

const KEYS = ["data", "history", "defHist", "pinned", "moPace", "invertDefense"];
const r1 = v => Math.round((Number(v) || 0) * 10) / 10;
const chipOf = c => (c && c.text ? { cls: c.cls || "", text: String(c.text) } : null);

// The snapshot format (version 1). Times are epoch milliseconds; 0 means "none".
export function buildExport(S = {}, now = Date.now()) {
  const st = buildState(S, now);
  return {
    version: 1,
    exportedAt: now,
    updatedAt: Number(S?.data?.updated) || 0,
    has: st.has,
    defTotal: st.defTotal,
    pinCount: st.pinCount,
    mo: st.mo.slice(0, 3).map(m => ({ title: m.title, pct: r1(m.pct), expires: m.expires || 0, chip: chipOf(m.chip) })),
    defs: st.defs.slice(0, 6).map(d => ({ name: d.name, pct: r1(d.pct), expires: Number.isFinite(d.leftMs) ? Math.round(now + d.leftMs) : 0, risk: !!d.risk, color: d.color, chip: chipOf(d.chip) })),
    pins: st.pins.slice(0, 6).map(p => ({ name: p.name, pct: r1(p.pct), region: p.region || "", color: p.color, chip: chipOf(p.chip) }))
  };
}

const same = (a, b) => JSON.stringify({ ...a, exportedAt: 0 }) === JSON.stringify({ ...b, exportedAt: 0 });

export function startWidgetExport() {
  const send = window.hd2Native?.widgetExport;
  if (typeof send !== "function" || !window.chrome?.storage?.local) return;
  let last = null, timer = null;
  async function run() {
    timer = null;
    try {
      const S = await chrome.storage.local.get(KEYS);
      const snap = buildExport(S || {}, Date.now());
      if (last && same(last, snap)) return;
      last = snap; send(snap);
    } catch (e) { console.error("widget export:", e); }
  }
  const later = (ms = 1500) => { if (!timer) timer = setTimeout(run, ms); };
  chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && KEYS.some(k => k in changes)) later(); });
  setInterval(later, 5 * 60e3);    // chips like "Holds in ~43m" depend on the clock too
  later(500);
}
