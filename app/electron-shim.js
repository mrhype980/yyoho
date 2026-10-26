/* Gives the extension code the small part of the Chrome extension API it uses, backed by the Mac app (see preload.js and main.js).
   Loaded first in every page. */
(function () {
  "use strict";
  var N = window.hd2Native;
  if (!N) {   // inside the panel's Drills frame: no bridge of its own, so share the panel's (same origin)
    try { if (window.parent !== window && window.parent.chrome && window.parent.chrome.storage) { window.chrome = window.parent.chrome; } } catch (e) { /* not available */ }
    return;
  }
  if (window.chrome && window.chrome.storage) return;
  var cb = function (cbk, v) { if (typeof cbk === "function") { try { cbk(v); } catch (e) { console.error(e); } } return v; };
  var noop = function () {};
  var evt = function () { var fs = []; return { addListener: function (f) { fs.push(f); }, removeListener: function (f) { fs = fs.filter(function (x) { return x !== f; }); }, hasListener: function (f) { return fs.indexOf(f) >= 0; }, _fire: function () { var a = arguments; fs.slice().forEach(function (f) { try { f.apply(null, a); } catch (e) { console.error(e); } }); } }; };

  /* ---- storage ---- */
  var onChanged = evt();
  N.onStorageChanged(function (changes) { onChanged._fire(changes, "local"); });
  var local = {
    get: function (keys, cbk) {
      var defaults = null;
      if (typeof keys === "function") { cbk = keys; keys = null; }
      if (keys && typeof keys === "object" && !Array.isArray(keys)) { defaults = keys; keys = Object.keys(keys); }
      return N.storageGet(keys == null ? null : keys).then(function (got) {
        if (defaults) Object.keys(defaults).forEach(function (k) { if (!(k in got)) got[k] = defaults[k]; });
        return cb(cbk, got);
      });
    },
    set: function (obj, cbk) { return N.storageSet(obj).then(function () { return cb(cbk); }); },
    remove: function (keys, cbk) { return N.storageRemove(keys).then(function () { return cb(cbk); }); },
    clear: function (cbk) { return N.storageClear().then(function () { return cb(cbk); }); },
    onChanged: onChanged
  };

  /* ---- runtime ---- */
  var onMessage = evt(), onInstalled = evt(), onStartup = evt();
  var msgListeners = [];
  N.onMessage(function (msg, reply) {
    var async = false;
    msgListeners.slice().forEach(function (f) { try { if (f(msg, { id: "hd2" }, reply) === true) async = true; } catch (e) { console.error(e); } });
    return async;
  });
  onMessage.addListener = function (f) { msgListeners.push(f); };
  var launch = N.launch || { reason: "startup" };
  setTimeout(function () {
    if (launch.reason === "install" || launch.reason === "update") onInstalled._fire({ reason: launch.reason, previousVersion: launch.previous });
    else onStartup._fire();
  }, 0);

  /* ---- alarms (the background page stays alive, so plain timers do the job) ---- */
  var alarms = {}, onAlarm = evt();
  var Alarms = {
    create: function (name, info) {
      Alarms.clear(name);
      var period = Number(info && info.periodInMinutes) || 0, delay = Number(info && (info.delayInMinutes != null ? info.delayInMinutes : info.periodInMinutes)) || period || 1;
      var rec = { name: name, periodInMinutes: period || undefined, scheduledTime: Date.now() + delay * 60000 };
      rec.timer = setTimeout(function fire() {
        onAlarm._fire({ name: name, periodInMinutes: rec.periodInMinutes, scheduledTime: rec.scheduledTime });
        if (period) { rec.scheduledTime = Date.now() + period * 60000; rec.timer = setTimeout(fire, period * 60000); } else delete alarms[name];
      }, delay * 60000);
      alarms[name] = rec;
    },
    get: function (name, cbk) { var r = alarms[name]; return Promise.resolve(cb(cbk, r ? { name: r.name, periodInMinutes: r.periodInMinutes, scheduledTime: r.scheduledTime } : undefined)); },
    clear: function (name, cbk) { var r = alarms[name]; if (r) { clearTimeout(r.timer); delete alarms[name]; } return Promise.resolve(cb(cbk, !!r)); },
    onAlarm: onAlarm
  };

  window.chrome = {
    storage: { local: local, onChanged: onChanged },
    runtime: {
      id: "hd2-war-tracker-mac", lastError: undefined,
      getManifest: function () { return { name: "Helldivers 2 War Tracker", version: N.version, manifest_version: 3 }; },
      getURL: function (p) { return new URL(String(p).replace(/^\//, ""), "app://hd2/").href; },
      sendMessage: function (msg, cbk) { return N.sendMessage(msg).then(function (v) { return cb(cbk, v); }); },
      onMessage: onMessage, onInstalled: onInstalled, onStartup: onStartup
    },
    alarms: Alarms,
    action: {
      setBadgeText: function (o) { N.badge(o && o.text); }, setBadgeBackgroundColor: noop, setBadgeTextColor: noop, setPopup: noop
    },
    sidePanel: { setPanelBehavior: noop },
    notifications: { create: function (id, o) { N.notify(id, o && o.title, o && o.message); } },
    tabs: { create: function (o) { N.openUrl(o && o.url); } },
    windows: { create: function (o) { N.openUrl(o && o.url, o); } }
  };

  /* ---- network: requests to the web go through the main process, so the browser's cross-origin rules don't apply ---- */
  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    init = init || {};
    var url = String(input && input.url ? input.url : input);
    if (!/^https?:/i.test(url)) return realFetch(input, init);
    var signal = init.signal || (input && input.signal);
    var abortErr = function () { return (signal && signal.reason) || new DOMException("The operation was aborted.", "AbortError"); };
    if (signal && signal.aborted) return Promise.reject(abortErr());
    var headers = {};
    try { new Headers(init.headers || (input && input.headers) || {}).forEach(function (v, k) { headers[k] = v; }); } catch (e) { /* ignore */ }
    var req = { url: url, method: init.method || (input && input.method) || "GET", headers: headers, body: typeof init.body === "string" ? init.body : undefined };
    var work = N.fetch(req).then(function (r) {
      if (r.error) throw new TypeError("Failed to fetch (" + r.error + ")");
      var nullBody = [101, 204, 205, 304].indexOf(r.status) >= 0;
      return new Response(nullBody ? null : r.body, { status: r.status, statusText: r.statusText, headers: r.headers });
    });
    if (!signal) return work;
    return new Promise(function (resolve, reject) {
      var onAbort = function () { reject(abortErr()); };
      signal.addEventListener("abort", onAbort, { once: true });
      work.then(function (v) { signal.removeEventListener("abort", onAbort); resolve(v); }, function (e) { signal.removeEventListener("abort", onAbort); reject(e); });
    });
  };
})();
