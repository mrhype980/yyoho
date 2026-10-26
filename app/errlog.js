/* Collects uncaught errors so Settings > Error log can list them. A plain script: the panel and the Drills page load it with <script>,
   the background worker imports it. Entries are kept on this device only (chrome.storage.local, newest 60). */
(function (g) {
  if (g.__hd2Err) return; g.__hd2Err = true;
  const KEY = "errorLog", MAX = 60;
  const where = g.document ? (g.location.pathname.indexOf("/drills/") >= 0 ? "drills" : "panel") : "background";
  const queue = []; let busy = false, lastMsg = "", lastAt = 0;
  const clip = (s, n) => String(s == null ? "" : s).slice(0, n);
  async function flush() {
    if (busy) return; busy = true;
    try {
      while (queue.length) {
        const batch = queue.splice(0), got = await chrome.storage.local.get(KEY);
        await chrome.storage.local.set({ [KEY]: (Array.isArray(got[KEY]) ? got[KEY] : []).concat(batch).slice(-MAX) });
      }
    } catch (e) { /* storage unavailable: nothing to do */ }
    busy = false;
  }
  function log(msg, src) {
    msg = clip(msg, 300); const now = Date.now();
    if (!msg || (msg === lastMsg && now - lastAt < 2000)) return;   // a loop that throws every frame logs once
    lastMsg = msg; lastAt = now;
    queue.push({ t: now, w: where, m: msg, s: clip(src, 160) }); flush();
  }
  g.addEventListener("error", e => log(e.message || (e.error && e.error.message), e.filename ? String(e.filename).split("/").pop() + ":" + e.lineno : ""));
  g.addEventListener("unhandledrejection", e => log("Unhandled promise: " + ((e.reason && e.reason.message) || e.reason), ""));
  const ce = console.error;
  console.error = function () {
    try { log([].map.call(arguments, x => (x && x.message) || (typeof x === "object" ? JSON.stringify(x) : x)).join(" "), "console.error"); } catch (e) { /* ignore */ }
    return ce.apply(this, arguments);
  };
  g.hd2LogError = log;
})(globalThis);
