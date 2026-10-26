/* v3.8 panel features, kept out of popup.js: freshness + offline banner, first-run tour, what's-new, error log, backup (export/import),
   languages, tab order, compact mode and font size. popup.js calls F.init() once at start-up. */
const LANGS = [["en", "English"], ["es", "Español"], ["fr", "Français"], ["de", "Deutsch"], ["pt", "Português"]];
// Interface text only (tabs, settings, banners). Planet names, news and the Drills game stay as the game and the API provide them.
const TX = {
  t_mo: ["Order", "Orden", "Ordre", "Befehl", "Ordem"], t_campaigns: ["Campaigns", "Campañas", "Campagnes", "Kampagnen", "Campanhas"],
  t_news: ["News", "Noticias", "Actualités", "Nachrichten", "Notícias"], t_stats: ["Stats", "Estadísticas", "Stats", "Statistik", "Estatísticas"],
  t_station: ["Station", "Estación", "Station", "Station", "Estação"], t_drills: ["Drills", "Prácticas", "Exercices", "Übungen", "Treinos"],
  sub: ["Galactic War Tracker", "Rastreador de la Guerra Galáctica", "Suivi de la guerre galactique", "Galaktischer Kriegs-Tracker", "Rastreador da Guerra Galáctica"],
  settings: ["Settings", "Ajustes", "Réglages", "Einstellungen", "Ajustes"],
  theme: ["Theme", "Tema", "Thème", "Design", "Tema"], theme_s: ["Locked themes are bought with Super Credits in Drills", "Los temas bloqueados se compran con Super Créditos en Prácticas", "Les thèmes verrouillés s'achètent avec des Super Crédits dans Exercices", "Gesperrte Designs kauft man mit Super-Credits unter Übungen", "Temas bloqueados são comprados com Super Créditos em Treinos"],
  notif: ["Notifications", "Notificaciones", "Notifications", "Benachrichtigungen", "Notificações"], notif_s: ["Desktop alerts from the background check", "Alertas de escritorio de la comprobación en segundo plano", "Alertes sur le bureau issues de la vérification en arrière-plan", "Desktop-Meldungen der Hintergrundprüfung", "Alertas da verificação em segundo plano"],
  tabs: ["Tabs", "Pestañas", "Onglets", "Tabs", "Abas"], streak: ["Drills streak in header", "Racha de Prácticas en la cabecera", "Série d'exercices dans l'en-tête", "Übungsserie in der Kopfzeile", "Sequência de Treinos no cabeçalho"],
  streak_s: ["Your best Stratagem Hero streak, next to the status", "Tu mejor racha de Stratagem Hero, junto al estado", "Votre meilleure série Stratagem Hero, à côté du statut", "Deine beste Stratagem-Hero-Serie neben dem Status", "Sua melhor sequência de Stratagem Hero, ao lado do estado"],
  look: ["Look and feel", "Aspecto", "Apparence", "Darstellung", "Aparência"], compact: ["Compact mode", "Modo compacto", "Mode compact", "Kompaktmodus", "Modo compacto"],
  compact_s: ["Tighter cards and spacing", "Tarjetas y espacios más ajustados", "Cartes et espacements plus serrés", "Engere Karten und Abstände", "Cartões e espaços mais compactos"],
  fsize: ["Text size", "Tamaño del texto", "Taille du texte", "Textgröße", "Tamanho do texto"], lang: ["Language", "Idioma", "Langue", "Sprache", "Idioma"],
  lang_s: ["Tabs, settings and banners. Game and news text stay as they are.", "Pestañas, ajustes y avisos. El texto del juego y las noticias no cambia.", "Onglets, réglages et bandeaux. Le texte du jeu et des actualités ne change pas.", "Tabs, Einstellungen und Hinweise. Spiel- und Nachrichtentexte bleiben unverändert.", "Abas, ajustes e avisos. O texto do jogo e das notícias não muda."],
  order: ["Tab order", "Orden de pestañas", "Ordre des onglets", "Tab-Reihenfolge", "Ordem das abas"], order_s: ["Use the arrows, or drag the tabs at the top", "Usa las flechas o arrastra las pestañas de arriba", "Utilisez les flèches ou faites glisser les onglets en haut", "Pfeile benutzen oder die Tabs oben ziehen", "Use as setas ou arraste as abas no topo"],
  backup: ["Backup", "Copia de seguridad", "Sauvegarde", "Sicherung", "Cópia de segurança"], export: ["Export settings", "Exportar ajustes", "Exporter les réglages", "Einstellungen exportieren", "Exportar ajustes"],
  import: ["Import settings", "Importar ajustes", "Importer les réglages", "Einstellungen importieren", "Importar ajustes"], help: ["Help", "Ayuda", "Aide", "Hilfe", "Ajuda"],
  tour: ["Take the tour", "Ver la visita guiada", "Voir la visite guidée", "Rundgang starten", "Ver o tour"], whatsnew: ["What's new", "Novedades", "Nouveautés", "Neuigkeiten", "Novidades"],
 
  errlog: ["Error log", "Registro de errores", "Journal d'erreurs", "Fehlerprotokoll", "Registro de erros"],
  updated: ["Updated", "Actualizado", "Mis à jour", "Aktualisiert", "Atualizado"], offline: ["Offline", "Sin conexión", "Hors ligne", "Offline", "Offline"],
  saved: ["saved", "guardado", "enregistré", "gespeichert", "salvo"], now: ["just now", "ahora mismo", "à l'instant", "gerade eben", "agora mesmo"], ago: ["ago", "hace", "il y a", "vor", "há"],
  down: ["Can't reach the war data. Showing the last saved copy from", "No se puede acceder a los datos de la guerra. Se muestra la última copia guardada de", "Impossible d'atteindre les données de guerre. Dernière copie enregistrée :", "Kriegsdaten nicht erreichbar. Zuletzt gespeicherter Stand von", "Sem acesso aos dados da guerra. Mostrando a última cópia salva de"],
  retry: ["Retry", "Reintentar", "Réessayer", "Erneut", "Tentar de novo"]
};
const KEYS = { theme: "string", autoTheme: "boolean", customTheme: "object", hd2_eco: "object", hd2_stats: "object", hd2_scores: "object", hd2_muted: "boolean", hd2_daily: "object",
  hd2_challenges: "object", notifyPrefs: "object", notify: "boolean", invertDefense: "boolean", pinned: "array",
  hiddenTabs: "array", tabOrder: "array", showStreak: "boolean", navMin: "boolean", compact: "boolean", fontScale: "number", lang: "string",
  mapFlip: "boolean", mapStyle: "string", mapMO: "boolean", campView: "string", tab: "string" };
const CHANGELOG = {
  "3.8.0": ["Offline cache notice and a data freshness dot: you always see how old the numbers are.",
    "Tour for new installs, this What's new card after updates, and an Error log in Settings.",
    "Compact mode, a text size slider and tab order (drag the tabs or use the arrows).",
    "Languages for the interface, and Export / Import of your settings and Drills progress.",
    "Campaign cards show a time-to-liberate chip (or a warning that a defense will not hold), and the Major Order checks each objective against its deadline.",
    "Optional Match system light/dark theme (Settings). The header button copies a status summary, now with time estimates.",
    "Drills: Practice, daily and weekly Challenges, two arcade games, six new themes, a daily play streak with bonus credits and colour-blind arrows (Themes)."]
};
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let X = null, lang = "en", compact = false, fontScale = 1;
const li = () => Math.max(0, LANGS.findIndex(l => l[0] === lang));
const t = k => (TX[k] || [k])[li()] || TX[k][0];

function ageText(ms) {
  const m = Math.max(0, ms / 60000);
  if (m < 1) return t("now");
  const n = m < 60 ? Math.round(m) + "m" : m < 1440 ? Math.round(m / 60) + "h" : Math.round(m / 1440) + "d";
  return lang === "de" || lang === "es" || lang === "fr" || lang === "pt" ? `${t("ago")} ${n}` : `${n} ${t("ago")}`;
}
const lastGood = d => Math.max(0, d.fetchedAt?.campaigns || 0, d.fetchedAt?.planets || 0, d.fetchedAt?.dispatches || 0) || d.updated || 0;
function paint(data) {
  const u = $("updated"), bar = $("cacheBar"); if (!u || !data) return;
  const diag = String(data.diag?.campaigns || ""), down = !navigator.onLine || (diag.startsWith("error") && !diag.startsWith("fallback"));
  const ms = Date.now() - lastGood(data), mins = ms / 60000, iv = Math.max(1, X?.prefs().interval || 5);
  const cls = down ? "stale" : mins <= Math.max(3, iv * 1.5 + 1) ? "fresh" : mins < 30 ? "aging" : "stale";
  u.className = "fresh-" + cls;
  u.textContent = down ? `${t("offline")} · ${t("saved")} ${ageText(ms)}` : `${t("updated")} ${ageText(ms)}`;
  const src = Object.entries(data.fetchedAt || {}).map(([k, v]) => `${k}: ${v ? ageText(Date.now() - v) : "never"}`).join("\n");
  u.title = "Freshness of each source\n" + src;
  bar.hidden = !down;
  if (down) bar.innerHTML = `<span>${t("down")} ${esc(ageText(ms))}.</span><button type="button" id="cacheRetry" class="link-btn">${t("retry")}</button>`;
}

function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i]").forEach(el => { const k = el.dataset.i; if (TX[k]) el.textContent = t(k); });
  const sel = $("langSel"); if (sel) sel.value = lang;
  X?.relabel();
}
function applyLook() {
  document.body.classList.toggle("compact", compact);
  document.documentElement.style.setProperty("--fs", String(fontScale));
  const c = $("compactToggle"), r = $("fontRange"); if (c) c.checked = compact; if (r) r.value = String(Math.round(fontScale * 100));
  const o = $("fontVal"); if (o) o.textContent = Math.round(fontScale * 100) + "%";
}

/* ---- tab order ---- */
function setOrder(order, save = true) {
  const TABS = X.TABS, ok = order.filter(x => TABS.includes(x)); TABS.forEach(x => { if (!ok.includes(x)) ok.push(x); });
  TABS.splice(0, TABS.length, ...ok);
  const nav = document.querySelector("nav"), tog = $("navToggle");
  ok.forEach(id => { const b = nav.querySelector(`button[data-tab="${id}"]`); if (b) nav.insertBefore(b, tog); });
  if (save) chrome.storage.local.set({ tabOrder: ok });
  X.refillTabs();
}
function moveTab(id, d) {
  const o = X.TABS.slice(), i = o.indexOf(id), j = i + d; if (i < 0 || j < 0 || j >= o.length) return;
  [o[i], o[j]] = [o[j], o[i]]; setOrder(o);
}
function initDrag() {
  const nav = document.querySelector("nav"); let drag = null;
  nav.querySelectorAll("button[data-tab]").forEach(b => { b.draggable = true; });
  nav.addEventListener("dragstart", e => { const b = e.target.closest("button[data-tab]"); if (!b) return; drag = b.dataset.tab; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", drag); b.classList.add("dragging"); });
  nav.addEventListener("dragover", e => {
    if (!drag) return; e.preventDefault();
    const b = e.target.closest("button[data-tab]"); nav.querySelectorAll(".dropat").forEach(x => x.classList.remove("dropat"));
    if (b && b.dataset.tab !== drag) b.classList.add("dropat");
  });
  nav.addEventListener("drop", e => {
    e.preventDefault(); const b = e.target.closest("button[data-tab]");
    if (b && drag && b.dataset.tab !== drag) {
      const o = X.TABS.filter(x => x !== drag), from = X.TABS.indexOf(drag), to = X.TABS.indexOf(b.dataset.tab);
      o.splice(o.indexOf(b.dataset.tab) + (from < to ? 1 : 0), 0, drag); setOrder(o);
    }
  });
  nav.addEventListener("dragend", () => { drag = null; nav.querySelectorAll(".dragging,.dropat").forEach(x => x.classList.remove("dragging", "dropat")); });
}

/* ---- overlays: tour, what's new ---- */
let overlay = null;
function closeOverlay() { overlay?.remove(); overlay = null; document.querySelectorAll(".tour-hl").forEach(x => x.classList.remove("tour-hl")); }
function card(html) { closeOverlay(); overlay = document.createElement("div"); overlay.id = "ovl"; overlay.setAttribute("role", "dialog"); overlay.innerHTML = `<div class="ovl-card">${html}</div>`; document.body.append(overlay); return overlay; }
const TOUR = [
  { sel: null, h: "Welcome, Helldiver", p: "A quick look around. This panel follows the Galactic War live and stays open while you browse." },
  { sel: 'nav [data-tab="mo"]', tab: "mo", h: "Order", p: "The Major Order with a pace check: is it on track before the deadline? Planets named in it are clickable." },
  { sel: 'nav [data-tab="campaigns"]', tab: "campaigns", h: "Campaigns and the map", p: "Every front, ranked. Pin a planet with the star, search, or switch to the galaxy map for a time-lapse of the last 24 hours." },
  { sel: 'nav [data-tab="news"]', tab: "news", h: "News", p: "High Command dispatches and patch notes. The badge counts what you haven't read." },
  { sel: 'nav [data-tab="stats"]', tab: "stats", h: "Stats and Station", p: "Players online, win rates, kills, and the Democracy Space Station with its timers." },
  { sel: 'nav [data-tab="drills"]', tab: "drills", h: "Drills", p: "Stratagem Hero practice with challenges, an arcade, themes and unlockables. Credits you earn buy themes that restyle the whole panel." },
  { sel: "#status", h: "Status and freshness", p: "The pill shows if the data is live. The text at the bottom turns amber, then red, as the numbers get old, and a banner appears if the API is down." },
  { sel: "#settingsBtn", set: true, h: "Settings", p: "Alerts, quiet hours, language, text size, tab order, backups, and this tour again." }
];
function startTour(i = 0) {
  const s = TOUR[i], last = i === TOUR.length - 1;
  if (s.tab && !X.visibleTabs().includes(s.tab)) return startTour(i + (i < TOUR.length - 1 ? 1 : -1));
  if (s.set) X.setSettings(false);
  card(`<div class="ovl-step">${i + 1} / ${TOUR.length}</div><h3>${s.h}</h3><p>${s.p}</p>
    <div class="ovl-btns"><button class="link-btn" data-o="skip">${last ? "" : "Skip"}</button><span></span>
    ${i ? '<button class="btn alt" data-o="back">Back</button>' : ""}<button class="btn" data-o="next">${last ? "Done" : "Next"}</button></div>`).classList.add("tour");
  const el = s.sel && document.querySelector(s.sel); if (el && !el.hidden) el.classList.add("tour-hl");
  overlay.onclick = e => {
    const o = e.target.closest("[data-o]")?.dataset.o; if (!o) return;
    if (o === "next") last ? endTour() : startTour(i + 1); else if (o === "back") startTour(i - 1); else endTour();
  };
}
function endTour() { closeOverlay(); chrome.storage.local.set({ tourDone: true }); }
function showNew(ver) {
  const list = CHANGELOG[ver] || Object.values(CHANGELOG).pop();
  card(`<h3>What's new in ${esc(ver)}</h3><ul>${list.map(x => `<li>${esc(x)}</li>`).join("")}</ul><div class="ovl-btns"><span></span><button class="btn" data-o="ok">Got it</button></div>`)
    .onclick = e => { if (e.target.closest("[data-o]")) closeOverlay(); };
}

/* ---- error log ---- */
function errLines(list) { return list.map(e => `${new Date(e.t).toLocaleString()} · ${e.w} · ${e.m}${e.s ? " (" + e.s + ")" : ""}`); }
async function paintErrors() {
  const box = $("errList"); if (!box) return;
  const { errorLog } = await chrome.storage.local.get("errorLog"), list = Array.isArray(errorLog) ? errorLog : [];
  $("errCount").textContent = list.length ? `(${list.length})` : "";
  box.innerHTML = list.length ? list.slice().reverse().map(e => `<div class="err"><b>${esc(new Date(e.t).toLocaleString())} · ${esc(e.w)}</b><br>${esc(e.m)}${e.s ? `<br><small>${esc(e.s)}</small>` : ""}</div>`).join("") : '<div class="faint">Nothing logged. Good.</div>';
}

/* ---- backup ---- */
async function exportSettings() {
  const all = await chrome.storage.local.get(Object.keys(KEYS)), settings = {};
  Object.keys(KEYS).forEach(k => { if (all[k] !== undefined) settings[k] = all[k]; });
  const blob = new Blob([JSON.stringify({ app: "hd2-war-tracker", format: 1, version: chrome.runtime.getManifest().version, exported: new Date().toISOString(), settings }, null, 1)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `hd2-war-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  note(`Exported ${Object.keys(settings).length} items.`);
}
const kindOf = v => Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
async function importSettings(file) {
  if (!file) return;
  if (file.size > 2e6) return note("That file is too big to be a backup.");
  let j; try { j = JSON.parse(await file.text()); } catch { return note("That isn't a valid backup file."); }
  if (!j || j.app !== "hd2-war-tracker" || j.format !== 1 || !j.settings || typeof j.settings !== "object") return note("That isn't a War Tracker backup.");
  const ok = {}, skipped = [];
  for (const [k, v] of Object.entries(j.settings)) { if (KEYS[k] && kindOf(v) === KEYS[k]) ok[k] = v; else skipped.push(k); }
  if (ok.fontScale !== undefined) ok.fontScale = Math.min(1.3, Math.max(0.85, ok.fontScale));
  if (ok.lang !== undefined && !LANGS.some(l => l[0] === ok.lang)) delete ok.lang;
  const n = Object.keys(ok).length; if (!n) return note("Nothing usable in that file.");
  if (!confirm(`Import ${n} items from this backup?\n\nIt replaces your current settings, themes and Drills progress. Data from the war feeds is not touched.`)) return;
  await chrome.storage.local.set(ok);
  note(`Imported ${n} items${skipped.length ? `, skipped ${skipped.length}` : ""}. Reloading…`); setTimeout(() => location.reload(), 900);
}
function note(msg) { const m = $("backupMsg"); if (m) m.textContent = msg; }

/* ---- Escape closes a card or Settings ---- */
function onKey(e) {
  if (e.key !== "Escape" || e.ctrlKey || e.metaKey || e.altKey) return;
  if (overlay) { e.preventDefault(); closeOverlay(); } else if (!$("settings").hidden) X.setSettings(false);
}

export const F = {
  t, paint, applyLang,
  async init(ctx) {
    X = ctx;
    const s = await chrome.storage.local.get(["lang", "compact", "fontScale", "tabOrder", "tourDone", "lastVersion", "updatedFrom"]);
    lang = LANGS.some(l => l[0] === s.lang) ? s.lang : "en"; compact = s.compact === true;
    fontScale = Math.min(1.3, Math.max(0.85, Number(s.fontScale) || 1));
    if (Array.isArray(s.tabOrder)) setOrder(s.tabOrder.filter(x => typeof x === "string"), false);
    $("langSel").innerHTML = LANGS.map(([c, n]) => `<option value="${c}">${n}</option>`).join("");
    applyLook(); applyLang(); initDrag(); paintErrors();
    $("langSel").addEventListener("change", e => { lang = e.target.value; chrome.storage.local.set({ lang }); applyLang(); paint(X.data()); });
    $("compactToggle").addEventListener("change", e => { compact = e.target.checked; chrome.storage.local.set({ compact }); applyLook(); });
    $("fontRange").addEventListener("input", e => { fontScale = Number(e.target.value) / 100; applyLook(); });
    $("fontRange").addEventListener("change", () => chrome.storage.local.set({ fontScale }));
    $("tabVis").addEventListener("click", e => { const m = e.target.closest("[data-mv]"); if (m) { const [id, d] = m.dataset.mv.split(":"); moveTab(id, +d); } });
    $("tourBtn").addEventListener("click", () => { X.setSettings(false); startTour(0); });
    $("newBtn").addEventListener("click", () => { X.setSettings(false); showNew(chrome.runtime.getManifest().version); });
    $("expBtn").addEventListener("click", exportSettings);
    $("impBtn").addEventListener("click", () => $("impFile").click());
    $("impFile").addEventListener("change", e => { importSettings(e.target.files[0]); e.target.value = ""; });
    $("errCopy").addEventListener("click", async () => { const { errorLog } = await chrome.storage.local.get("errorLog"); try { await navigator.clipboard.writeText(errLines(errorLog || []).join("\n") || "No errors logged."); $("errCopy").textContent = "Copied"; setTimeout(() => { $("errCopy").textContent = "Copy"; }, 1500); } catch { /* clipboard blocked */ } });
    $("errClear").addEventListener("click", async () => { await chrome.storage.local.remove("errorLog"); paintErrors(); });
    $("cacheBar").addEventListener("click", e => { if (e.target.closest("#cacheRetry")) X.load("force"); });
    chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch.errorLog) paintErrors(); });
    window.addEventListener("online", () => paint(X.data())); window.addEventListener("offline", () => paint(X.data()));
    document.addEventListener("keydown", onKey);
    setInterval(() => X.data() && paint(X.data()), 30000);
    // first run -> tour; an update of an existing install -> what's new
    const ver = chrome.runtime.getManifest().version, existing = s.updatedFrom !== undefined || s.lastVersion !== undefined;   // the background notes an update; a brand-new install has neither
    if (s.lastVersion !== ver) chrome.storage.local.set({ lastVersion: ver });
    if (s.updatedFrom !== undefined) chrome.storage.local.remove("updatedFrom");
    if (!s.tourDone && !existing) setTimeout(() => startTour(0), 1200);
    else { if (!s.tourDone) chrome.storage.local.set({ tourDone: true }); if (s.lastVersion !== ver) setTimeout(() => showNew(ver), 1200); }
  }
};
