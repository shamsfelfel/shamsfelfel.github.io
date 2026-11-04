/* ============================================================
   Light / dark.

   Follows the operating system until the student picks a side,
   after which the choice is remembered and the OS is ignored.
   The attribute is written on <html> by a tiny inline script in
   the page head as well, before first paint, so a dark reader
   never sees a white flash on the way in.

   Like the language key, "hub.theme" is the hub's own and not
   shared with the courses.
   ============================================================ */
(function () {
  "use strict";

  var KEY = "hub.theme";
  var LIGHT = "#1e293b";
  var DARK = "#0b1020";
  var root = document.documentElement;

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function put(v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
  }

  function systemPrefersDark() {
    return !!(window.matchMedia &&
              window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  function current() {
    return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function apply(theme, remember) {
    theme = theme === "dark" ? "dark" : "light";
    root.setAttribute("data-theme", theme);
    if (remember !== false) put(theme);

    /* Keep the browser chrome (address bar, task switcher) in step. */
    var meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) meta.setAttribute("content", theme === "dark" ? DARK : LIGHT);

    var els = document.querySelectorAll("[data-theme-label]");
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = theme === "dark" ? "☀︎" : "☾";
    }

    try {
      document.dispatchEvent(new CustomEvent("hub:theme", { detail: theme }));
    } catch (e) {}
  }

  function toggle() { apply(current() === "dark" ? "light" : "dark"); }

  function init() {
    var saved = stored();
    if (saved === "light" || saved === "dark") apply(saved, false);
    else apply(systemPrefersDark() ? "dark" : "light", false);

    /* Keep following the OS for as long as no explicit choice exists. */
    if (!saved && window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      var onChange = function (e) {
        if (!stored()) apply(e.matches ? "dark" : "light", false);
      };
      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  window.THEME = { init: init, apply: apply, toggle: toggle, current: current };
})();
