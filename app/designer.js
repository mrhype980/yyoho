// Widget designer: build your own desktop widget by dragging parts onto a preview, then tune size, corners, font and colours.
// Every change is saved straight away, and the desktop widget (another window) redraws as it arrives.
import { SAMPLE, PARTS, GROUPS, PRESETS, FONTS, REPEATABLE, PART_NAMES, STYLE_NAMES, renderItems, applyBox, normaliseLayout, normalisePrefs, makeThemer } from "./widget-core.js";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const KEYS = ["widgetPrefs", "widgetLayout", "theme", "autoTheme", "customTheme"];
const MAX_ITEMS = 40;

let S = {}, prefs = normalisePrefs(), layout = normaliseLayout();
const applyTheme = makeThemer(() => S);
const paints = [];                                   // refresh the controls from the current settings
const paintAll = () => { paints.forEach(f => f()); paintStatus(); };

/* ---------- saving ---------- */
const saveLayout = () => chrome.storage.local.set({ widgetLayout: layout });
function savePrefs(patch, repaint = true) {
  prefs = normalisePrefs({ ...prefs, ...patch });
  chrome.storage.local.set({ widgetPrefs: prefs });
  if (repaint) paintAll();
}
function itemsChanged() {                            // the parts changed: remember it, and make sure the widget is showing "My layout"
  saveLayout();
  if (prefs.style !== "custom") savePrefs({ style: "custom" }, false);
  renderStage(); renderPalette(); paintStatus();
}

/* ---------- preview ---------- */
function renderStage() {
  const pv = $("pv");
  applyBox(pv, layout, prefs);
  pv.style.width = layout.width + "px";
  $("pvBody").innerHTML = renderItems(layout.items, SAMPLE, { editor: true, align: layout.align });
}
function renderPalette() {
  const pal = $("pal"); pal.textContent = "";
  for (const [gid, gname] of GROUPS) {
    const h = document.createElement("div"); h.className = "pg"; h.textContent = gname;
    const grid = document.createElement("div"); grid.className = "pgrid";
    for (const [k, sym, name] of PARTS.filter(p => p[3] === gid)) {
      const used = !REPEATABLE.has(k) && layout.items.includes(k);
      const t = document.createElement("div"); t.className = "pt" + (used ? " used" : ""); t.dataset.t = k;
      t.title = used ? "Already on the widget" : "Drag onto the preview, or click to add at the end";
      t.innerHTML = `<div class="pi">${esc(sym)}</div><div class="pn">${esc(name)}</div>`;
      if (!used) {
        t.draggable = true;
        t.addEventListener("dragstart", e => { e.dataTransfer.setData("text/plain", "new:" + k); e.dataTransfer.effectAllowed = "move"; });
        t.addEventListener("click", () => { if (layout.items.length < MAX_ITEMS) { layout.items.push(k); itemsChanged(); } });
      }
      grid.append(t);
    }
    pal.append(h, grid);
  }
}
function paintStatus() {
  const custom = prefs.style === "custom";
  $("dStatus").innerHTML = `<span>Desktop widget is showing: <b>${esc(STYLE_NAMES[prefs.style])}</b></span>`
    + (custom ? "" : `<button class="btn ghost" id="useMine">Show my layout instead</button>`)
    + `<button class="btn ghost" id="showW">Show widget on desktop</button>`;
  if (!custom) $("useMine").onclick = () => savePrefs({ style: "custom" });
  $("showW").onclick = () => window.hd2Native.widgetAction("show-widget");
}

/* ---------- drag and drop (the same moves as the palette: add, reorder, drag off to remove) ---------- */
(() => {
  const cv = $("pvBody"), body = document.body;
  const parts = () => [...cv.querySelectorAll(".cp")];
  const insIdx = e => {
    for (const p of parts()) {
      const i = Number(p.dataset.i), r = p.parentElement.getBoundingClientRect(), b = p.getBoundingClientRect();
      if (e.clientY < r.top) return i;
      if (e.clientY <= r.bottom && (layout.items[i] === "br" || e.clientX < b.left + b.width / 2)) return i;
    }
    return layout.items.length;
  };
  const mark = i => {
    parts().forEach(p => { p.style.boxShadow = ""; });
    if (i < 0) return;
    const at = parts().find(p => Number(p.dataset.i) === i);
    if (at) at.style.boxShadow = "-3px 0 0 var(--accent)";
    else { const ps = parts(); if (ps.length) ps[ps.length - 1].style.boxShadow = "3px 0 0 var(--accent)"; }
  };
  cv.addEventListener("dragstart", e => {
    const p = e.target.closest && e.target.closest(".cp"); if (!p) return;
    e.dataTransfer.setData("text/plain", "move:" + p.dataset.i); e.dataTransfer.effectAllowed = "move";
  });
  cv.addEventListener("dragover", e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; mark(insIdx(e)); });
  cv.addEventListener("dragleave", () => mark(-1));
  cv.addEventListener("drop", e => {
    e.preventDefault(); e.stopPropagation();
    const d = e.dataTransfer.getData("text/plain"); let idx = insIdx(e); mark(-1);
    if (d.startsWith("new:")) {
      const t = d.slice(4);
      if (PART_NAMES[t] && layout.items.length < MAX_ITEMS && (REPEATABLE.has(t) || !layout.items.includes(t))) layout.items.splice(idx, 0, t);
    } else if (d.startsWith("move:")) {
      const o = Number(d.slice(5));
      if (o >= 0 && o < layout.items.length) { const [t] = layout.items.splice(o, 1); if (o < idx) idx--; layout.items.splice(idx, 0, t); }
    }
    itemsChanged();
  });
  cv.addEventListener("dblclick", e => { const p = e.target.closest(".cp"); if (p) { layout.items.splice(Number(p.dataset.i), 1); itemsChanged(); } });
  // dropping a placed part anywhere else in the window takes it off the widget
  body.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
  body.addEventListener("drop", e => {
    e.preventDefault(); const d = e.dataTransfer.getData("text/plain");
    if (d.startsWith("move:")) { layout.items.splice(Number(d.slice(5)), 1); itemsChanged(); }
  });
})();

/* ---------- side panel ---------- */
const side = $("dSide");
function label(text) { const l = document.createElement("div"); l.className = "lbl"; l.innerHTML = `<span style="text-transform:uppercase;letter-spacing:.1em;color:var(--faint)">${esc(text)}</span><span></span>`; return l; }
function seg(title, get, set, opts, cols) {
  const wrap = document.createElement("div"), g = document.createElement("div");
  g.className = "styles" + (cols === 2 ? " two" : ""); if (cols === 2) g.style.gridTemplateColumns = "repeat(2,1fr)";
  opts.forEach(([v, l]) => { const b = document.createElement("button"); b.dataset.v = v; b.textContent = l; b.onclick = () => { set(v); }; g.append(b); });
  paints.push(() => [...g.children].forEach(b => b.classList.toggle("on", b.dataset.v === String(get()))));
  wrap.append(label(title), g); return wrap;
}
function range(title, key, min, max, unit, target = "layout") {
  const wrap = document.createElement("div"), l = label(title), val = l.lastElementChild;
  const inp = document.createElement("input"); inp.type = "range"; inp.min = min; inp.max = max; inp.step = target === "prefs" ? 5 : 1;
  const get = () => (target === "prefs" ? prefs : layout)[key];
  inp.oninput = () => {
    const v = Number(inp.value);
    if (target === "prefs") savePrefs({ [key]: v }, false); else { layout[key] = v; saveLayout(); }
    val.textContent = get() + unit; renderStage();
  };
  paints.push(() => { if (document.activeElement !== inp) inp.value = get(); val.textContent = get() + unit; });
  wrap.append(l, inp); return wrap;
}
function check(text, get, set) {
  const l = document.createElement("label"); l.className = "chk"; l.innerHTML = `<input type="checkbox"> ${esc(text)}`;
  const i = l.querySelector("input"); i.onchange = () => set(i.checked);
  paints.push(() => { i.checked = !!get(); }); return l;
}
const edit = fn => { fn(); saveLayout(); renderStage(); paintAll(); };

(() => {
  side.append(label("Start from"));
  const sg = document.createElement("div"); sg.className = "styles two"; sg.style.gridTemplateColumns = "repeat(2,1fr)";
  Object.entries(PRESETS).forEach(([k, v]) => { const b = document.createElement("button"); b.textContent = v.name; b.onclick = () => { layout.items = [...v.items]; itemsChanged(); }; sg.append(b); });
  side.append(sg);
  side.append(range("Big number size", "size", 18, 64, "px"));
  side.append(range("Width", "width", 240, 420, "px"));
  side.append(range("Corner roundness", "radius", 0, 32, "px"));
  side.append(range("Transparency (100 = solid)", "opacity", 40, 100, "%", "prefs"));
  side.append(seg("Text alignment", () => layout.align, v => edit(() => { layout.align = v; }), [["left", "Left"], ["center", "Centre"]], 2));
  side.append(seg("Font", () => layout.font, v => edit(() => { layout.font = v; }), Object.entries(FONTS).map(([k, [n]]) => [k, n]), 2));
  side.append(check("Outline", () => layout.border, v => edit(() => { layout.border = v ? 1 : 0; })));
  side.append(check("Use my own colours", () => layout.own, v => edit(() => { layout.own = v ? 1 : 0; })));
  const cw = document.createElement("div"); cw.className = "cols";
  cw.innerHTML = [["bg", "Background"], ["fg", "Text"], ["acc", "Accent"]].map(([k, n]) => `<div>${n}<input type="color" data-k="${k}"></div>`).join("");
  cw.querySelectorAll("input").forEach(i => { i.oninput = () => { layout[i.dataset.k] = i.value; saveLayout(); renderStage(); }; });
  paints.push(() => { cw.hidden = !layout.own; cw.querySelectorAll("input").forEach(i => { if (document.activeElement !== i) i.value = layout[i.dataset.k]; }); });
  side.append(cw);
  const reset = document.createElement("button"); reset.className = "btn ghost"; reset.textContent = "Reset layout";
  reset.onclick = () => { layout = normaliseLayout(null); saveLayout(); renderStage(); renderPalette(); paintAll(); };
  side.append(reset);
})();
$("dDone").onclick = () => window.hd2Native.widgetAction("close-designer");

/* ---------- start ---------- */
function refresh() { renderStage(); renderPalette(); paintAll(); }
chrome.storage.local.get(KEYS).then(s => {
  S = s || {}; prefs = normalisePrefs(S.widgetPrefs); layout = normaliseLayout(S.widgetLayout);
  applyTheme(); refresh();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !KEYS.some(k => k in changes)) return;
  for (const k of KEYS) if (k in changes) S[k] = changes[k].newValue;
  if ("theme" in changes || "autoTheme" in changes || "customTheme" in changes) applyTheme();
  let redraw = false;
  if ("widgetPrefs" in changes) { const n = normalisePrefs(S.widgetPrefs); if (JSON.stringify(n) !== JSON.stringify(prefs)) { prefs = n; redraw = true; } }
  if ("widgetLayout" in changes) { const n = normaliseLayout(S.widgetLayout); if (JSON.stringify(n) !== JSON.stringify(layout)) { layout = n; redraw = true; } }
  if (redraw) refresh();
});
