// Mini widget: the same war numbers as the tracker panel, in a small always-on-top window (desktop mode) or a menu bar popover.
// The desktop widget has a style picker (classic cards, ready-made layouts, or the player's own layout from the designer).
// It only reads what the background check already saved, so it adds no extra requests.
import { buildState, cardsHTML, renderItems, applyBox, itemsFor, normaliseLayout, normalisePrefs, makeThemer, STYLES } from "./widget-core.js";

const MODE = new URLSearchParams(location.search).get("mode") === "menubar" ? "menubar" : "desktop";
const $ = id => document.getElementById(id);
const KEYS = ["data", "history", "defHist", "pinned", "moPace", "invertDefense", "widgetPrefs", "widgetLayout", "theme", "autoTheme", "customTheme"];

let S = {};                       // saved data, as the panel's background check left it
let prefs = normalisePrefs(), layout = normaliseLayout();
document.body.className = MODE;
$("w").classList.add(MODE);
const applyTheme = makeThemer(() => S);

/* ---------- draw ---------- */
let lastH = 0, lastW = 0;
const style = () => (MODE === "menubar" ? "cards" : prefs.style);       // the menu bar popover always shows the cards
function render() {
  const st = buildState(S, Date.now()), sty = style(), parts = sty !== "cards";
  const w = $("w");
  w.classList.toggle("parts", parts);
  applyBox(w, layout, prefs, { parts });
  $("sub").textContent = st.sub; $("dot").className = "dot " + st.dot; $("dot").title = st.dotTitle;
  $("cards").innerHTML = parts
    ? (st.has ? renderItems(itemsFor(sty, layout), st, { align: layout.align }) : `<div class="lbody"><div class="lhint">Waiting for the first war update. This fills in within a minute of opening the tracker.</div></div>`)
    : cardsHTML(st, prefs);
  $("toggle").textContent = "Desktop widget";
  syncCfg();
  requestAnimationFrame(sizeToContent);
}
function sizeToContent() {
  const h = Math.ceil($("w").getBoundingClientRect().height), wd = MODE === "desktop" ? (style() === "cards" ? 300 : layout.width) : 0;
  if (h && (h !== lastH || wd !== lastW) && window.hd2Native?.widgetResize) { lastH = h; lastW = wd; window.hd2Native.widgetResize(h, wd); }
}

/* ---------- settings (desktop widget) ---------- */
function syncCfg() {
  const sty = style();
  $("secs").hidden = sty !== "cards";
  $("c-mo").checked = !!prefs.mo; $("c-def").checked = !!prefs.defense; $("c-pin").checked = !!prefs.pinned;
  $("c-top").checked = prefs.level !== "desktop";
  $("c-spaces").checked = prefs.allSpaces !== false; $("c-op").value = prefs.opacity; $("c-opv").textContent = prefs.opacity + "%";
  [...$("styles").children].forEach(b => b.classList.toggle("on", b.dataset.id === sty));
}
function savePrefs() { chrome.storage.local.set({ widgetPrefs: prefs }); }
STYLES.forEach(([id, name]) => {
  const b = document.createElement("button"); b.dataset.id = id; b.textContent = name;
  b.addEventListener("click", () => { prefs.style = id; render(); savePrefs(); });
  $("styles").append(b);
});
[["c-mo", "mo"], ["c-def", "defense"], ["c-pin", "pinned"], ["c-spaces", "allSpaces"]].forEach(([id, k]) => $(id).addEventListener("change", e => { prefs[k] = e.target.checked; render(); savePrefs(); }));
$("c-top").addEventListener("change", e => { prefs.level = e.target.checked ? "top" : "desktop"; savePrefs(); });
$("c-op").addEventListener("input", e => { prefs.opacity = Number(e.target.value); render(); });
$("c-op").addEventListener("change", savePrefs);
const toggleCfg = () => { $("cfg").hidden = !$("cfg").hidden; requestAnimationFrame(sizeToContent); };
$("gear").addEventListener("click", toggleCfg); $("gear2").addEventListener("click", toggleCfg);
$("close").addEventListener("click", () => window.hd2Native.widgetAction("hide-widget")); $("close2").addEventListener("click", () => window.hd2Native.widgetAction("hide-widget"));
$("c-design").addEventListener("click", () => window.hd2Native.widgetAction("open-designer"));
$("open").addEventListener("click", () => window.hd2Native.widgetAction("open-main"));
$("toggle").addEventListener("click", () => window.hd2Native.widgetAction("toggle-widget"));

/* ---------- start ---------- */
function load() {
  return chrome.storage.local.get(KEYS).then(s => {
    S = s || {}; prefs = normalisePrefs(S.widgetPrefs); layout = normaliseLayout(S.widgetLayout);
    applyTheme(); render();
  });
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !KEYS.some(k => k in changes)) return;
  for (const k of KEYS) if (k in changes) S[k] = changes[k].newValue;
  if ("widgetPrefs" in changes) prefs = normalisePrefs(S.widgetPrefs);
  if ("widgetLayout" in changes) layout = normaliseLayout(S.widgetLayout);
  if ("theme" in changes || "autoTheme" in changes || "customTheme" in changes) applyTheme();
  render();
});
setInterval(render, 30000);                       // keeps "x left" and "updated x ago" current
document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });
new ResizeObserver(() => sizeToContent()).observe($("w"));
load();
