/* ============================================================
   Language.

   The same arrangement the six courses use, so a student who has
   set a language in one of them meets the same switch here: the
   prose is written twice in the markup - <span class="en"> beside
   <span class="ar"> - and hub.css hides one of them based on
   html[lang]. Switching is one attribute flip, nothing to fetch.

   Labels the shell draws at run time - the download buttons, the
   storage line - ask t() instead, because they do not exist in
   the markup to be written twice.

   The flip raises `hub:lang` on document; the course list listens
   and relabels itself.

   The key is deliberately NOT shared with the courses. Each app
   under this origin keeps its own: localStorage is per-origin, so
   a single key would have the hub silently reach into six courses
   and overwrite a choice the student made inside one of them.
   ============================================================ */
(function () {
  "use strict";

  var KEY = "hub.lang";
  var root = document.documentElement;

  function get() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function put(v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
  }

  function current() {
    return root.getAttribute("lang") === "ar" ? "ar" : "en";
  }

  /* A UI string by key, with {placeholders} filled from `vars`. */
  function t(key, vars) {
    var table = (window.HUB && window.HUB.UI) || {};
    var entry = table[key];
    var s = entry ? (entry[current()] || entry.en) : key;
    if (vars) {
      for (var k in vars) {
        if (Object.prototype.hasOwnProperty.call(vars, k)) {
          s = s.split("{" + k + "}").join(vars[k]);
        }
      }
    }
    return s;
  }

  /* Pick the right half of a bilingual {en, ar} value. */
  function pick(o) {
    if (!o) return "";
    if (typeof o === "string") return o;
    return o[current()] || o.en || "";
  }

  function relabel(scope) {
    var els = (scope || document).querySelectorAll("[data-ui]");
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = t(els[i].getAttribute("data-ui"));
    }
  }

  function apply(lang) {
    lang = lang === "ar" ? "ar" : "en";
    root.setAttribute("lang", lang);
    root.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    put(lang);

    relabel();

    var title = document.querySelector("title");
    if (title && title.getAttribute("data-" + lang)) {
      document.title = title.getAttribute("data-" + lang);
    }

    try {
      document.dispatchEvent(new CustomEvent("hub:lang", { detail: lang }));
    } catch (e) {}
  }

  function toggle() { apply(current() === "ar" ? "en" : "ar"); }

  function init() { apply(get() || root.getAttribute("lang") || "en"); }

  window.I18N = {
    init: init,
    apply: apply,
    relabel: relabel,
    toggle: toggle,
    t: t,
    pick: pick,
    get lang() { return current(); }
  };
})();
