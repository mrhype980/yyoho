// Helldivers 2 War Tracker: Mac app. This is the "browser" around the extension code in ./app:
// it serves the files, keeps the saved data on disk, runs the background check in a hidden window,
// and turns the Chrome extension calls into Mac ones (Dock badge, notifications, links).
const { app, BrowserWindow, ipcMain, Menu, Notification, Tray, nativeImage, screen, net, protocol, shell, session, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const APP_DIR = path.join(__dirname, "app");
const ORIGIN = "app://hd2";
const FETCH_HOSTS = new Set(["api.helldivers2.dev", "helldiverstrainingmanual.com"]);   // the only sites the app talks to
const isMac = process.platform === "darwin";
const isInternal = u => u.protocol === "app:" && u.host === "hd2";      // (new URL("app://...").origin is "null", so compare the parts)

protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

if (!app.requestSingleInstanceLock()) { app.quit(); }

/* ---------- saved data (the extension's chrome.storage.local) ---------- */
let store = {}, storeFile, metaFile, saveTimer = null;
function loadStore() {
  storeFile = path.join(app.getPath("userData"), "storage.json");
  metaFile = path.join(app.getPath("userData"), "meta.json");
  try { store = JSON.parse(fs.readFileSync(storeFile, "utf8")) || {}; }
  catch (e) {
    if (e.code !== "ENOENT") { try { fs.renameSync(storeFile, storeFile + ".broken-" + Date.now()); } catch { /* ignore */ } }
    store = {};
  }
}
function flushStore() {
  clearTimeout(saveTimer); saveTimer = null;
  try { const tmp = storeFile + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(store)); fs.renameSync(tmp, storeFile); }
  catch (e) { console.error("could not save data:", e.message); }
}
const queueSave = () => { if (!saveTimer) saveTimer = setTimeout(flushStore, 400); };
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function broadcast(channel, ...args) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue;
    try { for (const f of w.webContents.mainFrame.framesInSubtree) f.send(channel, ...args); } catch { /* window closing */ }
  }
}
ipcMain.handle("storage:get", (_e, keys) => {
  if (keys == null) return clone(store);
  const out = {};
  for (const k of [].concat(keys)) if (k in store) out[k] = clone(store[k]);
  return out;
});
ipcMain.handle("storage:set", (_e, obj) => {
  const changes = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const nv = clone(v);
    changes[k] = { oldValue: clone(store[k]), newValue: nv };
    if (nv === undefined) delete store[k]; else store[k] = nv;
  }
  queueSave(); broadcast("storage:changed", changes);
  if ("widgetPrefs" in changes) applyWidgetPrefs();
});
ipcMain.handle("storage:remove", (_e, keys) => {
  const changes = {};
  for (const k of [].concat(keys)) if (k in store) { changes[k] = { oldValue: clone(store[k]) }; delete store[k]; }
  queueSave(); if (Object.keys(changes).length) broadcast("storage:changed", changes);
});
ipcMain.handle("storage:clear", () => {
  const changes = {};
  for (const k of Object.keys(store)) changes[k] = { oldValue: clone(store[k]) };
  store = {}; queueSave(); broadcast("storage:changed", changes);
});

/* ---------- install / update / start-up (the extension's onInstalled and onStartup) ---------- */
let launchInfo = { reason: "startup" };
function detectLaunch() {
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(metaFile, "utf8")) || {}; } catch { /* first run */ }
  const v = app.getVersion();
  if (!meta.lastVersion) launchInfo = { reason: "install" };
  else if (meta.lastVersion !== v) launchInfo = { reason: "update", previous: meta.lastVersion };
  try { fs.writeFileSync(metaFile, JSON.stringify({ lastVersion: v })); } catch { /* ignore */ }
}
ipcMain.on("app:version", e => { e.returnValue = app.getVersion(); });
ipcMain.on("app:launch", e => { e.returnValue = launchInfo; });

/* ---------- messages from the panel to the background check ---------- */
let bgWin = null, mainWin = null, msgId = 0;
const pending = new Map();
ipcMain.handle("runtime:send", (_e, msg) => new Promise(resolve => {
  if (!bgWin || bgWin.isDestroyed()) return resolve(undefined);
  const id = ++msgId, t = setTimeout(() => { pending.delete(id); resolve(undefined); }, 180000);
  pending.set(id, v => { clearTimeout(t); resolve(v); });
  bgWin.webContents.send("runtime:message", id, msg);
}));
ipcMain.on("runtime:reply", (_e, id, v) => { const f = pending.get(id); if (f) { pending.delete(id); f(v); } });

/* ---------- notifications, Dock badge, links ---------- */
ipcMain.on("notify", (_e, { id, title, body }) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title: String(title || "Helldivers 2"), body: String(body || ""), silent: false });
  n.on("click", showMain); n.show();
});
let lastBadge = "";
ipcMain.on("badge", (_e, text) => {
  lastBadge = String(text || "");
  if (isMac && app.dock) app.dock.setBadge(lastBadge);
  if (tray && !tray.isDestroyed()) tray.setTitle(lastBadge ? " " + lastBadge : "");   // the same count the Dock icon shows
});

const webPrefs = () => ({ preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false });
function openInternal(url, opts = {}) {
  const w = new BrowserWindow({ width: Number(opts.width) || 460, height: Number(opts.height) || 780, minWidth: 340, minHeight: 480, backgroundColor: "#0b1426", title: "Helldivers 2 War Tracker", webPreferences: webPrefs() });
  w.setMenuBarVisibility(false); w.loadURL(url);
}
ipcMain.on("open-url", (_e, { url, opts }) => {
  let u; try { u = new URL(String(url)); } catch { return; }
  if (u.protocol === "https:" || u.protocol === "http:") shell.openExternal(u.href);
  else if (isInternal(u)) openInternal(u.href, opts || {});
});

/* ---------- network: the page asks, the main process fetches (no browser cross-origin limits) ---------- */
ipcMain.handle("net:fetch", async (_e, req) => {
  try {
    const u = new URL(String(req.url));
    const testHost = process.env.HD2_TEST_HOST && u.host === process.env.HD2_TEST_HOST;     // used only by the automated tests
    if (!testHost && (u.protocol !== "https:" || !FETCH_HOSTS.has(u.hostname))) return { error: "blocked host " + u.hostname };
    const res = await net.fetch(u.href, { method: req.method || "GET", headers: req.headers || {}, body: req.body, signal: AbortSignal.timeout(30000) });
    const buf = Buffer.from(await res.arrayBuffer());
    const headers = []; res.headers.forEach((v, k) => { if (!["content-encoding", "content-length", "transfer-encoding"].includes(k)) headers.push([k, v]); });
    return { status: res.status, statusText: res.statusText, headers, body: new Uint8Array(buf) };
  } catch (e) { return { error: String(e && e.message || e) }; }
});

/* ---------- native macOS widget (the one in the widget gallery) ---------- */
// The widget is a separate, sandboxed program inside the app (Contents/PlugIns). It cannot see this app's storage, so the
// background check hands over a small JSON snapshot and we write it here, in the one folder the widget is allowed to read.
// The path is repeated in widget/Sources/Store.swift and widget/HD2Widget.entitlements: change all three together.
const widgetDir = () => path.join(app.getPath("appData"), "Helldivers 2 War Tracker", "Widget");
ipcMain.on("widget:export", (e, json) => {
  try {
    if (typeof json !== "string" || json.length > 65536) return;
    if (!String(e.sender.getURL()).startsWith(ORIGIN + "/")) return;     // only our own pages
    const snap = JSON.parse(json);
    if (!snap || snap.version !== 1) return;
    const dir = widgetDir(); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "widget.json"), tmp = file + ".tmp";
    fs.writeFileSync(tmp, json); fs.renameSync(tmp, file);               // swap in whole, so the widget never reads half a file
  } catch (err) { console.error("could not write widget data:", err.message); }
});
const hasNativeWidget = () => isMac && fs.existsSync(path.join(process.resourcesPath, "..", "PlugIns", "HD2Widget.appex"));
function showWidgetHelp() {
  const ok = hasNativeWidget();
  dialog.showMessageBox({
    type: "info", buttons: ["OK"], title: "Helldivers 2 widget",
    message: ok ? "Add the widget to your desktop" : "This build has no gallery widget",
    detail: ok
      ? "1. Right-click the desktop (or open Notification Center) and choose Edit Widgets.\n2. Search for Helldivers 2 War Tracker.\n3. Drag the small, medium or large widget where you want it.\n\nIf it is not listed, drag the app into the Applications folder, open it once, and look again. The widget shows what this app last saw, so keep the app running."
      : "The gallery widget is built by the GitHub project and comes inside the app it makes. This copy of the app was packaged without it, but the floating desktop widget and the menu bar item still work."
  });
}

/* ---------- menu bar item and desktop mini-widget ---------- */
let tray = null, popover = null, widgetWin = null, popoverHiddenAt = 0;
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const onScreen = (x, y) => Number.isFinite(x) && Number.isFinite(y) && screen.getAllDisplays().some(d => { const a = d.workArea; return x >= a.x - 40 && x < a.x + a.width - 40 && y >= a.y - 10 && y < a.y + a.height - 40; });
const widgetOpts = () => ({ frame: false, transparent: true, backgroundColor: "#00000000", resizable: false, minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, show: false, webPreferences: webPrefs() });

function trayImage() {
  const img = nativeImage.createFromPath(path.join(APP_DIR, "icons", "trayTemplate.png"));   // picks up trayTemplate@2x.png on Retina screens
  img.setTemplateImage(true);
  return img;
}
function trayMenu() {
  const st = readState();
  return Menu.buildFromTemplate([
    { label: "Open War Tracker", click: showMain },
    { label: "Desktop widget", type: "checkbox", checked: !!st.widgetOn, click: i => setWidget(i.checked) },
    { label: "Customise widget…", click: openDesigner },
    { label: "Add to the macOS widget gallery…", click: showWidgetHelp },
    { type: "separator" },
    { label: "Hide menu bar item", click: () => setTrayOn(false) },
    { label: "Quit Helldivers 2 War Tracker", role: "quit" }
  ]);
}
function setupTray() {
  if (tray && !tray.isDestroyed()) return;
  tray = new Tray(trayImage());
  tray.setToolTip("Helldivers 2 War Tracker");
  if (lastBadge) tray.setTitle(" " + lastBadge);
  tray.on("click", togglePopover);
  tray.on("right-click", () => tray.popUpContextMenu(trayMenu()));
}
function removeTray() {
  if (popover && !popover.isDestroyed()) popover.destroy();
  popover = null;
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
}
function setTrayOn(on) { writeState({ trayOn: !!on }); if (on) setupTray(); else removeTray(); buildMenu(); }

function positionPopover() {
  if (!tray || tray.isDestroyed() || !popover || popover.isDestroyed()) return;
  const tb = tray.getBounds(), wb = popover.getBounds(), area = screen.getDisplayNearestPoint({ x: tb.x, y: tb.y }).workArea;
  const x = clampN(Math.round(tb.x + tb.width / 2 - wb.width / 2), area.x + 6, area.x + area.width - wb.width - 6);
  popover.setPosition(x, Math.round(tb.y + tb.height + 4), false);
}
function togglePopover() {
  if (popover && !popover.isDestroyed() && popover.isVisible()) return popover.hide();
  if (Date.now() - popoverHiddenAt < 250) return;     // the click that closed it (focus loss) also lands here
  if (!popover || popover.isDestroyed()) {
    popover = new BrowserWindow({ ...widgetOpts(), width: 320, height: 380, movable: false, hasShadow: true, alwaysOnTop: true });
    popover.setAlwaysOnTop(true, "pop-up-menu");
    popover.on("blur", () => { if (!popover.webContents.isDevToolsOpened()) { popoverHiddenAt = Date.now(); popover.hide(); } });
    popover.on("closed", () => { popover = null; });
    popover.loadURL(ORIGIN + "/widget.html?mode=menubar");
  }
  positionPopover(); popover.show(); popover.focus();
}

function applyWidgetPrefs() {
  if (!widgetWin || widgetWin.isDestroyed()) return;
  const p = store.widgetPrefs || {};
  widgetWin.setVisibleOnAllWorkspaces(p.allSpaces !== false);
  if (p.level === "desktop") widgetWin.setAlwaysOnTop(true, "normal", -1);     // above the wallpaper and icons, below every normal window
  else widgetWin.setAlwaysOnTop(true, "floating");
}
function showWidget() {
  if (widgetWin && !widgetWin.isDestroyed()) { widgetWin.showInactive(); return; }
  const st = readState().widget || {}, area = screen.getPrimaryDisplay().workArea, width = 300;
  const x = onScreen(st.x, st.y) ? st.x : area.x + area.width - width - 24, y = onScreen(st.x, st.y) ? st.y : area.y + 48;
  widgetWin = new BrowserWindow({ ...widgetOpts(), x, y, width, height: 320, hasShadow: false, alwaysOnTop: true, title: "Helldivers 2 widget" });
  applyWidgetPrefs();
  widgetWin.once("ready-to-show", () => widgetWin.showInactive());
  widgetWin.on("moved", () => { const b = widgetWin.getBounds(); writeState({ widget: { x: b.x, y: b.y } }); });
  widgetWin.on("closed", () => { widgetWin = null; });
  widgetWin.loadURL(ORIGIN + "/widget.html?mode=desktop");
}
function setWidget(on) {
  writeState({ widgetOn: !!on });
  if (on) showWidget(); else if (widgetWin && !widgetWin.isDestroyed()) widgetWin.close();
  buildMenu();
}
ipcMain.on("widget:resize", (e, h, wd) => {
  const w = BrowserWindow.fromWebContents(e.sender); h = Math.round(Number(h)); wd = Math.round(Number(wd));
  if (!w || !Number.isFinite(h)) return;
  if (w === widgetWin) w.setContentSize(wd > 0 ? clampN(wd, 200, 560) : w.getContentSize()[0], clampN(h, 40, 700));
  else if (w === popover) { w.setContentSize(w.getContentSize()[0], clampN(h, 80, 640)); positionPopover(); }
});
ipcMain.on("widget:action", (_e, name) => {
  if (name === "open-main") { if (popover && !popover.isDestroyed()) popover.hide(); showMain(); }
  else if (name === "toggle-widget") { if (popover && !popover.isDestroyed()) popover.hide(); setWidget(!readState().widgetOn); }
  else if (name === "hide-widget") setWidget(false);
  else if (name === "show-widget") setWidget(true);
  else if (name === "open-designer") { if (popover && !popover.isDestroyed()) popover.hide(); openDesigner(); }
  else if (name === "close-designer") { if (designerWin && !designerWin.isDestroyed()) designerWin.close(); }
});
let designerWin = null;
function openDesigner() {
  if (designerWin && !designerWin.isDestroyed()) { if (designerWin.isMinimized()) designerWin.restore(); designerWin.show(); designerWin.focus(); return; }
  designerWin = new BrowserWindow({ width: 940, height: 700, minWidth: 760, minHeight: 560, backgroundColor: "#0b1426", title: "Customise widget", show: false, webPreferences: webPrefs() });
  designerWin.setMenuBarVisibility(false);
  designerWin.once("ready-to-show", () => designerWin.show());
  designerWin.on("closed", () => { designerWin = null; });
  designerWin.loadURL(ORIGIN + "/designer.html");
}

/* ---------- windows ---------- */
const stateFile = () => path.join(app.getPath("userData"), "window.json");
function readState() { try { return JSON.parse(fs.readFileSync(stateFile(), "utf8")) || {}; } catch { return {}; } }
function writeState(patch) { try { fs.writeFileSync(stateFile(), JSON.stringify({ ...readState(), ...patch })); } catch { /* ignore */ } }

function showMain() {
  if (mainWin && !mainWin.isDestroyed()) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.show(); mainWin.focus(); }
  else createMain();
}
function createMain() {
  const st = readState();
  mainWin = new BrowserWindow({
    width: st.width || 460, height: st.height || 880, x: st.x, y: st.y, minWidth: 340, minHeight: 520,
    title: "Helldivers 2 War Tracker", backgroundColor: "#0b1426", show: false, webPreferences: webPrefs()
  });
  if (st.onTop) mainWin.setAlwaysOnTop(true, "floating");
  mainWin.once("ready-to-show", () => mainWin.show());
  mainWin.loadURL(ORIGIN + "/popup.html");
  mainWin.on("close", () => { if (!mainWin.isDestroyed() && !mainWin.isMaximized()) writeState(mainWin.getBounds()); });
  mainWin.on("closed", () => { mainWin = null; });
}
function createBackground() {
  bgWin = new BrowserWindow({ show: false, width: 400, height: 300, webPreferences: webPrefs() });
  bgWin.loadURL(ORIGIN + "/background.html");
  bgWin.on("closed", () => { bgWin = null; });
}

function buildMenu() {
  const onTop = !!readState().onTop;
  const tpl = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    { role: "editMenu" },
    { label: "View", submenu: [
      { label: "Keep on top of other windows", type: "checkbox", checked: onTop, click: i => { writeState({ onTop: i.checked }); if (mainWin) mainWin.setAlwaysOnTop(i.checked, "floating"); } },
      { label: "Desktop widget", type: "checkbox", checked: !!readState().widgetOn, click: i => setWidget(i.checked) },
      { label: "Customise widget…", click: openDesigner },
      { label: "Add to the macOS widget gallery…", click: showWidgetHelp },
      { label: "Menu bar item", type: "checkbox", checked: readState().trayOn !== false, click: i => setTrayOn(i.checked) },
      { type: "separator" },
      { role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" },
      { type: "separator" },
      { role: "reload" }, { role: "toggleDevTools" }
    ] },
    { role: "windowMenu" }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

app.on("web-contents-created", (_e, wc) => {
  wc.setWindowOpenHandler(({ url }) => {
    try { const u = new URL(url); if (u.protocol === "http:" || u.protocol === "https:") shell.openExternal(u.href); else if (isInternal(u)) openInternal(u.href); } catch { /* ignore */ }
    return { action: "deny" };
  });
  wc.on("will-navigate", (e, url) => {
    let u; try { u = new URL(url); } catch { return e.preventDefault(); }
    if (!isInternal(u)) { e.preventDefault(); if (u.protocol === "http:" || u.protocol === "https:") shell.openExternal(u.href); }
  });
});

app.whenReady().then(() => {
  loadStore(); detectLaunch();
  protocol.handle("app", req => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname); if (p === "/" || p === "") p = "/popup.html";
    const file = path.normalize(path.join(APP_DIR, p));
    if (!file.startsWith(APP_DIR)) return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(["clipboard-sanitized-write", "notifications", "fullscreen"].includes(permission)));
  buildMenu(); createBackground(); createMain();
  const st0 = readState();
  if (st0.trayOn !== false) setupTray();
  if (st0.widgetOn) showWidget();
  app.on("activate", showMain);
});
app.on("second-instance", showMain);
app.on("window-all-closed", () => { if (!isMac) app.quit(); });     // on a Mac the app keeps checking the war in the background, like a menu-bar app
app.on("before-quit", () => { flushStore(); });
