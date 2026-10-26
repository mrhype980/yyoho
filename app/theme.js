/* Shared by the panel and the Drills page: sets the theme before anything is drawn, and builds the purchasable "Custom Colours" theme
   (pick an accent and a background colour; every other colour in the extension is derived from those two). */
(function () {
  var KEY = "customTheme", DEF = { accent: "#ff7a3d", bg: "#14181f" }, root = document.documentElement;
  var HEX = /^#[0-9a-f]{6}$/i;
  function rgb(h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function toHsl(h) {
    var c = rgb(h).map(function (v) { return v / 255; }), mx = Math.max.apply(0, c), mn = Math.min.apply(0, c), l = (mx + mn) / 2, d = mx - mn, hh = 0, s = 0;
    if (d) { s = d / (1 - Math.abs(2 * l - 1)); hh = mx === c[0] ? ((c[1] - c[2]) / d + 6) % 6 : mx === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4; hh *= 60; }
    return [hh, s * 100, l * 100];
  }
  var cl = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var hsl = function (h, s, l) { return "hsl(" + Math.round(((h % 360) + 360) % 360) + "," + Math.round(cl(s, 0, 100)) + "%," + Math.round(cl(l, 0, 100)) + "%)"; };
  var lum = function (h) { var c = rgb(h).map(function (v) { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
  var ink = function (h) { return lum(h) > .42 ? "#10151f" : "#ffffff"; };
  function valid(c) { return c && HEX.test(c.accent) && HEX.test(c.bg); }
  function read() { try { var j = JSON.parse(localStorage.getItem(KEY)); if (valid(j)) return j; } catch (e) { /* none saved */ } return { accent: DEF.accent, bg: DEF.bg }; }
  function build(c) {
    c = valid(c) ? c : DEF;
    var b = toHsl(c.bg), a = toHsl(c.accent), dark = lum(c.bg) < .4, H = b[0], S = Math.min(b[1], 70), L = b[2], v = {};
    var lightCol = hsl(a[0] + 180, 85, dark ? 72 : 36);
    v["--bg"] = c.bg;
    if (dark) {
      v["--panel"] = hsl(H, S, L + 5); v["--header-top"] = hsl(H, S, L + 9); v["--card"] = hsl(H, S, L + 8); v["--card-hi"] = hsl(H, S, L + 13);
      v["--line"] = hsl(H, S, L + 24); v["--track"] = hsl(H, S, Math.max(2, L - 4));
      v["--text"] = "#ffffff"; v["--muted"] = hsl(H, Math.min(S, 45), 80); v["--faint"] = hsl(H, Math.min(S, 30), 64);
      v["--card-line"] = "rgba(255,255,255,.1)"; v["--chip-bg"] = "rgba(255,255,255,.08)"; v["--shadow"] = "rgba(0,0,0,.45)"; v["--accent-ink"] = c.accent;
    } else {
      v["--panel"] = hsl(H, S * .5, Math.min(99, L + 5)); v["--header-top"] = hsl(H, S * .5, Math.min(98, L + 3)); v["--card"] = hsl(H, S * .4, Math.min(99, L + 6)); v["--card-hi"] = hsl(H, S * .5, Math.min(98, L + 2));
      v["--line"] = hsl(H, S * .6, L - 14); v["--track"] = hsl(H, S * .6, L - 7);
      v["--text"] = hsl(H, 40, 14); v["--muted"] = hsl(H, 25, 36); v["--faint"] = hsl(H, 20, 48);
      v["--card-line"] = hsl(H, S * .5, L - 9); v["--chip-bg"] = "rgba(0,0,0,.06)"; v["--shadow"] = "rgba(0,0,0,.22)"; v["--accent-ink"] = hsl(a[0], a[1], Math.min(a[2], 32));
    }
    v["--light"] = lightCol; v["--accent"] = c.accent; v["--on-accent"] = ink(c.accent); v["--on-light"] = dark ? "#0b0d12" : "#ffffff";
    return { vars: v, dark: dark, y: c.accent, lb: lightCol, b: v["--line"], hi: lightCol, bg: c.bg, panel: v["--panel"], dim: v["--muted"], g1: v["--card"], hov: v["--card-hi"], dk: v["--track"], arr: v["--faint"], ink: v["--on-accent"] };
  }
  function paint(id) {
    var s = root.style, names = Object.keys(build(DEF).vars);
    names.forEach(function (n) { s.removeProperty(n); }); s.removeProperty("color-scheme");
    root.dataset.theme = id || "earth";
    if (id === "custom") { var t = build(read()); names.forEach(function (n) { s.setProperty(n, t.vars[n]); }); s.setProperty("color-scheme", t.dark ? "dark" : "light"); }
  }
  window.hd2ApplyTheme = paint;
  window.hd2Custom = {
    def: DEF, read: read, build: build,
    sync: function (c) { try { if (valid(c)) localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* storage blocked */ } if (root.dataset.theme === "custom") paint("custom"); },
    set: function (c) { if (!valid(c)) return; this.sync(c); try { chrome.storage.local.set({ customTheme: c }); } catch (e) { /* plain page */ } }
  };
  var id = "superearth"; try { id = localStorage.getItem("theme") || id; } catch (e) { /* storage blocked */ }
  paint(id);
})();
