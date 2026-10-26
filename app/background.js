import "./errlog.js";
import { startWidgetExport } from "./widget-export.js";
import { refreshAll, clean, dispatchText, recordHistory, moOverall, recordMoPace, fmtDuration, projection, campaignProgress } from "./api.js";
import { recordDefense, defenseRisk, recordMoLog, pushWarLog, badgeFor } from "./insights.js";

// ---- user settings (saved by the popup / side panel) ----
const DEFAULT_PREFS = { dispatch: true, order: true, defense: true, ending: true, endingHours: 2, planets: true, pinnedOnly: false, badge: "news", quiet: false, quietStart: "22:00", quietEnd: "07:00", interval: 5, stall: true, risk: true, riskBadge: true, riskSound: false };
async function getPrefs() {
  const { notifyPrefs } = await chrome.storage.local.get("notifyPrefs");
  const p = { ...DEFAULT_PREFS, ...(notifyPrefs || {}) };
  p.interval = Math.max(1, Number(p.interval) || DEFAULT_PREFS.interval);
  p.endingHours = Math.max(1, Number(p.endingHours) || DEFAULT_PREFS.endingHours);
  if (!["news", "defense"].includes(p.badge)) p.badge = "news";
  return p;
}

// Quiet hours can wrap past midnight (22:00 - 07:00). Alerts are skipped during them; the unread badge still updates.
const mins = t => { const [h, m] = String(t).split(":").map(Number); return (h || 0) * 60 + (m || 0); };
export function inQuietHours(p, now = new Date()) {
  if (!p.quiet) return false;
  const a = mins(p.quietStart), b = mins(p.quietEnd), n = now.getHours() * 60 + now.getMinutes();
  if (a === b) return false;
  return a < b ? n >= a && n < b : n >= a || n < b;
}

// How often the background check runs follows the "Check every" setting.
async function ensureAlarm() {
  const { interval } = await getPrefs();
  const a = await chrome.alarms.get("poll");
  if (!a || a.periodInMinutes !== interval) chrome.alarms.create("poll", { periodInMinutes: interval, delayInMinutes: interval });
}

// The toolbar icon opens the side panel (there is no popup any more). Clear any popup left over from older builds.
function resetPopup() {
  try { chrome.action.setPopup({ popup: "" }); } catch { /* ignore */ }
  try { chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); } catch { /* ignore */ }
  chrome.storage.local.remove("sideOnClick");
}

chrome.runtime.onInstalled.addListener(d => { if (d.reason === "update") chrome.storage.local.set({ updatedFrom: d.previousVersion || "unknown" }); ensureAlarm(); resetPopup(); poll(true); });
chrome.runtime.onStartup.addListener(() => { ensureAlarm(); resetPopup(); });
ensureAlarm(); resetPopup(); // also whenever the service worker wakes up
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.notifyPrefs) { ensureAlarm(); refreshBadge(); }
});
chrome.alarms.onAlarm.addListener(a => { if (a.name === "poll") poll(false); });
chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (msg?.refresh) {
    poll(!!msg.force, Array.isArray(msg.extras) ? msg.extras : []).then(() => send(true)).catch(() => send(false));
    return true; // keep channel open for async reply
  }
});

// Only one refresh at a time (the API is rate limited), and skip if data is under 45s old unless forced.
// Requests for a tab's extra data (stats, station, Steam news) wait their turn behind a running refresh.
let inflight = null;
function poll(force, extras = []) {
  if (inflight && !extras.length) return inflight;
  const next = (inflight || Promise.resolve()).catch(() => {}).then(() => run(force, extras));
  inflight = next;
  next.catch(() => {}).finally(() => { if (inflight === next) inflight = null; });
  return next;
}

function notify(id, title, message, extra = {}) {
  chrome.notifications.create(id, { type: "basic", iconUrl: "icons/icon128.png", title, message, ...extra });
}

// Toolbar badge: unread dispatches or active defenses, depending on the setting.
async function refreshBadge() {
  const { data, seenDispatch, defHist, invertDefense } = await chrome.storage.local.get(["data", "seenDispatch", "defHist", "invertDefense"]);
  if (!data) return;
  setBadge(badgeFor(data, seenDispatch ?? Infinity, await getPrefs(), defHist || {}, invertDefense === true));
}
function setBadge(b) {
  chrome.action.setBadgeBackgroundColor({ color: b.bg });
  chrome.action.setBadgeTextColor?.({ color: b.fg });
  chrome.action.setBadgeText({ text: b.text });
}

async function run(force, extras = []) {
  const store = await chrome.storage.local.get(["data", "notify", "seenDispatch", "history", "invertDefense", "moPace", "pinned", "endingSent", "ended", "defHist", "warLog", "moLog", "stallState", "riskSent"]);
  const old = store.data;
  const only = extras.length > 0; // a tab asked for its extra data: leave the base data alone
  if (!only && !force && old?.updated && Date.now() - old.updated < 45000) return;

  const data = await refreshAll(old, snap => chrome.storage.local.set({ data: snap }), { extras, only }); // popup fills in as each source lands
  await chrome.storage.local.set({ data });
  if (only) return;

  // Remember how fast each front is moving so the popup can estimate time to liberate.
  let hist = store.history || {};
  if (String(data.diag?.campaigns).startsWith("ok")) {
    hist = recordHistory(store.history, data.campaigns, data.planets);
    await chrome.storage.local.set({ history: hist });
  }
  // ...and how fast the Major Order as a whole is moving, for the pace check.
  const invert = store.invertDefense === true;
  await chrome.storage.local.set({ moPace: recordMoPace(store.moPace, data.assignments, data, invert) });
  // ...defense progress, to spot a defense that will not hold, and the Major Order log for the weekly recap.
  const defHist = String(data.diag?.campaigns).startsWith("ok") ? recordDefense(store.defHist, data.campaigns, data.planets, invert) : (store.defHist || {});
  await chrome.storage.local.set({ defHist });
  if (!String(data.diag?.assignments).startsWith("error")) await chrome.storage.local.set({ moLog: recordMoLog(store.moLog, data.assignments || [], data, invert) });

  const prefs = await getPrefs();
  const notifyOn = store.notify !== false; // default on
  const ids = data.dispatches.map(d => d.id);
  const newest = ids.length ? Math.max(...ids) : 0;

  // First run: just remember where we are, don't spam.
  const firstRun = store.seenDispatch === undefined;
  if (firstRun) await chrome.storage.local.set({ seenDispatch: newest });
  setBadge(badgeFor(data, firstRun ? newest : store.seenDispatch, prefs, defHist, invert));
  if (firstRun) return;

  const canNotify = notifyOn && !inQuietHours(prefs);
  const pinned = new Set(store.pinned || []);
  const wanted = idx => !(prefs.pinnedOnly && pinned.size) || pinned.has(idx); // "only pinned planets" setting
  const byIdx = d => new Map((d.planets || []).map(p => [p.index, p]));

  // Planets whose campaign disappeared: wait for the next planet list, then say whether it was liberated, defended or lost.
  let ended = (store.ended || []).filter(e => Date.now() - e.at < 30 * 60e3);
  if (old && String(data.diag?.campaigns).startsWith("ok") && data.campaigns.length && old.campaigns?.length) {
    const nowSet = new Set(data.campaigns.map(c => c.planet?.index));
    const oldPlanets = byIdx(old);
    old.campaigns.forEach(c => {
      const i = c.planet?.index;
      if (i === undefined || nowSet.has(i) || ended.some(e => e.idx === i)) return;
      const p = { ...(oldPlanets.get(i) || {}), ...c.planet };
      ended.push({ idx: i, name: p.name || "A planet", defense: !!p.event, at: Date.now() });
    });
  }
  const settled = ended.filter(e => (data.fetchedAt?.planets || 0) >= e.at + 1);
  ended = ended.filter(e => !settled.includes(e));
  let warLog = store.warLog || [];
  if (settled.length) {
    const pl = byIdx(data);
    for (const e of settled) {
      const owner = pl.get(e.idx)?.currentOwner;
      if (owner) {   // the weekly recap: what happened, whether or not alerts are on
        const kind = owner === "Humans" ? (e.defense ? "defended" : "liberated") : (e.defense ? "lost" : null);
        if (kind) warLog = pushWarLog(warLog, { t: Date.now(), idx: e.idx, kind, name: e.name });
      }
      if (!owner || !prefs.planets || !canNotify || !wanted(e.idx)) continue;
      const id = `pl-${e.idx}-${Date.now()}`;
      if (owner === "Humans") notify(id, e.defense ? "Planet defended" : "Planet liberated", e.defense ? `${e.name} held. The defense campaign is over.` : `${e.name} has been liberated!`);
      else if (e.defense) notify(id, "Planet lost", `${e.name} has fallen to the enemy.`);
    }
  }
  await chrome.storage.local.set({ ended });

  // Major Order close to its deadline and not finished: one alert per order.
  if (prefs.ending && canNotify) {
    const sent = new Set(store.endingSent || []), windowMs = prefs.endingHours * 3.6e6, live = [];
    for (const a of data.assignments || []) {
      const key = String(a.id ?? a.expiration ?? ""), left = a.expiration ? new Date(a.expiration) - Date.now() : NaN;
      live.push(key);
      if (!key || !(left > 0 && left <= windowMs) || sent.has(key)) continue;
      sent.add(key);
      const pct = moOverall(a, data, invert);
      if (pct < 99.9) notify("mo-end-" + key, "Major Order ending soon", `${clean(a.title) || "The Major Order"} is ${Math.round(pct)}% complete with ${fmtDuration(left)} left.`);
    }
    await chrome.storage.local.set({ endingSent: [...sent].filter(k => live.includes(k)) });
  }

  // Defenses that just started, for the recap.
  if (old && String(data.diag?.campaigns).startsWith("ok")) {
    const before = new Set((old.campaigns || []).filter(c => c.planet?.event).map(c => c.planet.index));
    for (const c of data.campaigns) if (c.planet?.event && !before.has(c.planet.index)) warLog = pushWarLog(warLog, { t: Date.now(), idx: c.planet.index, kind: "attacked", name: c.planet.name || "A planet" });
  }
  await chrome.storage.local.set({ warLog });

  // A pinned front that stops moving, or starts losing ground: one alert when it goes from moving to stuck.
  if (String(data.diag?.campaigns).startsWith("ok")) {
    const stall = { ...(store.stallState || {}) }, pl = byIdx(data), live = new Set();
    for (const c of data.campaigns) {
      const idx = c.planet?.index; if (idx === undefined || !pinned.has(idx)) continue;
      const prog = campaignProgress(c, pl, invert);
      if (prog.kind === "defense" || prog.kind === "parked" || prog.pct > 98) { delete stall[idx]; continue; }
      live.add(String(idx));
      const pr = projection(hist[idx], prog.pct, Date.now(), 45 * 60e3);
      if (pr.status === "gathering") continue;
      const stuck = pr.status === "stalled" || pr.status === "losing";
      if (stuck && stall[idx] === "ok" && prefs.stall && canNotify)
        notify(`stall-${idx}-${Date.now()}`, pr.status === "losing" ? "Pinned planet losing ground" : "Pinned planet stalled",
          `${prog.planet?.name || "A planet"} is at ${prog.pct.toFixed(1)}% and ${pr.status === "losing" ? `falling (${pr.perHour.toFixed(2)}%/h)` : "no longer moving"}. It needs more Helldivers.`);
      stall[idx] = stuck ? "stuck" : "ok";
    }
    for (const k of Object.keys(stall)) if (!live.has(k)) delete stall[k];
    await chrome.storage.local.set({ stallState: stall });
  }

  // A defense that will probably not hold before its deadline: one alert per defense.
  {
    const risks = defenseRisk(data.campaigns, data.planets, defHist, invert), sent = new Set(store.riskSent || []);
    for (const r of risks.filter(x => x.risk)) {
      if (sent.has(r.key)) continue;
      if (prefs.risk && canNotify && wanted(r.idx))
        notify("risk-" + r.key, "Defense about to fail", `${r.name} is at ${Math.round(r.pct)}% with ${fmtDuration(r.leftMs)} left and probably won't hold. Divers needed!`,
          { requireInteraction: true, silent: !prefs.riskSound, priority: 2 });
      if (canNotify || !prefs.risk) sent.add(r.key);
    }
    await chrome.storage.local.set({ riskSent: [...sent].filter(k => risks.some(r => r.key === k)) });
  }

  if (!canNotify || !old) return;

  // New dispatches
  if (prefs.dispatch) {
    const oldIds = new Set((old.dispatches || []).map(d => d.id));
    data.dispatches.filter(d => !oldIds.has(d.id)).slice(0, 3).forEach(d =>
      notify("d" + d.id, "High Command Dispatch", dispatchText(d).slice(0, 200))
    );
  }

  // New Major Order
  if (prefs.order) {
    const oldA = new Set((old.assignments || []).map(a => a.id));
    data.assignments.filter(a => !oldA.has(a.id)).forEach(a =>
      notify("mo" + a.id, "New Major Order", clean(a.title || a.briefing || "").slice(0, 200) || "A new Major Order has been issued.")
    );
  }

  // New defense campaigns
  if (prefs.defense) {
    const defs = d => new Map(d.campaigns.filter(c => c.planet?.event).map(c => [c.planet.name, c.planet.index]));
    const before = defs(old);
    [...defs(data)].filter(([n, i]) => !before.has(n) && wanted(i)).slice(0, 3).forEach(([n]) =>
      notify("def-" + n + Date.now(), "Defense campaign", `${n} is under attack - defend it!`)
    );
  }
}

startWidgetExport();     // keeps the native macOS widget fed (does nothing outside the Mac app)
