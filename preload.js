// Runs in every page of the app (the Drills frame inside the panel shares the panel's bridge). It hands the page a small, fixed set of calls to the main process
// (storage, notifications, badge, messages between windows, network). The pages themselves never get Node.
const { contextBridge, ipcRenderer } = require("electron");

const listeners = { storage: new Set(), message: new Set() };
ipcRenderer.on("storage:changed", (_e, changes) => listeners.storage.forEach(f => { try { f(changes); } catch (err) { console.error(err); } }));
ipcRenderer.on("runtime:message", async (_e, id, msg) => {
  let replied = false;
  const reply = v => { if (replied) return; replied = true; ipcRenderer.send("runtime:reply", id, v); };
  let async = false;
  for (const f of listeners.message) { try { if (f(msg, reply) === true) async = true; } catch (err) { console.error(err); } }
  if (!async) reply(undefined);
});

contextBridge.exposeInMainWorld("hd2Native", {
  version: ipcRenderer.sendSync("app:version"),
  launch: ipcRenderer.sendSync("app:launch"),            // { reason: "install" | "update" | "startup", previous }
  storageGet: keys => ipcRenderer.invoke("storage:get", keys),
  storageSet: obj => ipcRenderer.invoke("storage:set", obj),
  storageRemove: keys => ipcRenderer.invoke("storage:remove", keys),
  storageClear: () => ipcRenderer.invoke("storage:clear"),
  onStorageChanged: f => { listeners.storage.add(f); },
  onMessage: f => { listeners.message.add(f); },
  sendMessage: msg => ipcRenderer.invoke("runtime:send", msg),
  notify: (id, title, body) => ipcRenderer.send("notify", { id, title, body }),
  badge: text => ipcRenderer.send("badge", String(text || "")),
  openUrl: (url, opts) => ipcRenderer.send("open-url", { url, opts }),
  fetch: req => ipcRenderer.invoke("net:fetch", req),
  widgetResize: (h, w) => ipcRenderer.send("widget:resize", Number(h) || 0, Number(w) || 0),   // the widget windows ask to fit their content (width only for the desktop widget)
  widgetExport: snap => ipcRenderer.send("widget:export", JSON.stringify(snap)),     // the snapshot the native macOS widget reads (written by main.js)
  widgetAction: name => ipcRenderer.send("widget:action", String(name))     // "open-main" | "toggle-widget" | "hide-widget" | "show-widget" | "open-designer" | "close-designer"
});
