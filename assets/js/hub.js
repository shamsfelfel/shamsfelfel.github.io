/* ============================================================
   The hub.

   Seven courses, one installable app.

   Every course is already a progressive web app of its own, served
   from a folder of this same origin (shamsfelfel.github.io). What
   makes them one app rather than seven is this page's manifest: its
   scope is "/", the whole origin, so inside the installed window a
   link to /linear-algebra/ is an in-scope navigation and stays in
   the app. One icon on the home screen, seven courses behind it.

   Nothing here duplicates a course. Each course keeps its own
   service worker, its own precache list and its own cache, and
   stays independently deployable from its own repository. The hub
   only has to be able to (1) open them, (2) ask one to save itself
   for offline use, and (3) report and undo that.

   How saving works, and why it needs no cooperation from the
   course: loading a course's page in a hidden iframe runs that
   course's own bootstrapper, which registers its own service
   worker, whose install event precaches the whole course from its
   own generated file list. So the course remains the single source
   of truth for what "the whole course" means, and adding a lesson
   to a course needs no change here.

   How reporting works: the Cache Storage API is origin-wide, not
   scope-wide, so from "/" this page can see every course's caches.
   Normally that breadth is a nuisance; here it is exactly the
   lever. Each course names its caches with its own prefix, which
   is what lets one course be measured and deleted without touching
   the other six.
   ============================================================ */
(function () {
  "use strict";

  /* ----------------------------------------------------------------
     The courses.

     `prefix` must match the cache name the course's own service
     worker opens -- that string is the whole basis of measuring and
     deleting one course's storage, and every course's worker deletes
     only caches carrying its own. A course with no prefix is not an
     app yet: it can be opened online and nothing more.

     `entry` is only needed where a course has no index.html at its
     folder root.
     ---------------------------------------------------------------- */
  var COURSES = [
    {
      slug: "data-analysis-and-implementation",
      prefix: "da-",
      colour: "#0d6f6a",
      name: { en: "Data Analysis & Implementation",
              ar: "تحليل البيانات وتطبيقاته" },
      blurb: { en: "Data analysis from first principles to professional practice, with tests, a glossary and a step-through execution lab.",
               ar: "تحليل البيانات من المبادئ الأولى إلى الممارسة المهنية، مع اختبارات ومعجم ومختبر تنفيذ خطوة بخطوة." }
    },
    {
      slug: "programming-ai",
      prefix: "oop-",
      colour: "#1f6feb",
      name: { en: "Programming for AI — Python OOP",
              ar: "البرمجة للذكاء الاصطناعي — كائنات بايثون" },
      blurb: { en: "Object-oriented Python for artificial intelligence, built up from classes to working programs.",
               ar: "بايثون الكائنية للذكاء الاصطناعي، من الأصناف إلى برامج عاملة." }
    },
    {
      slug: "linear-algebra",
      prefix: "la-",
      colour: "#4338ca",
      name: { en: "Linear Algebra for AI & Data Science",
              ar: "الجبر الخطي للذكاء الاصطناعي وعلم البيانات" },
      blurb: { en: "Linear equations worked by hand, then written as code: Gaussian elimination, consistency, independence, and four Python labs.",
               ar: "المعادلات الخطية حلاً يدوياً ثم برمجةً: الحذف الغاوسي والاتساق والاستقلال، وأربعة مختبرات بايثون." }
    },
    {
      slug: "probability-and-statistics",
      prefix: "ps-",
      colour: "#9d174d",
      name: { en: "Probability & Statistics",
              ar: "الاحتمال والإحصاء" },
      blurb: { en: "What a probability claims, where the sample space comes from, and how events combine — with a sample-space builder, a Venn explorer and a relative-frequency simulator.",
               ar: "ماذا يدّعي الاحتمال، ومن أين يأتي فضاء العيّنة، وكيف تجتمع الأحداث — مع باني فضاء عيّنة ومستكشف دوائر فِن ومُحاكٍ للتكرار النسبي." }
    },
    {
      slug: "database-sql",
      prefix: "sqllab-",
      colour: "#0d7d72",
      name: { en: "SQL Lab", ar: "مختبر SQL" },
      blurb: { en: "Standard SQL practised in the browser, one statement at a time.",
               ar: "تدريب على SQL القياسية في المتصفح، عبارةً عبارة." }
    },
    {
      slug: "ESL",
      prefix: "esl-",
      colour: "#15607a",
      /* ESL deliberately precaches only its shell. Its lessons are
         PDFs and audio, and its worker leaves them to the student to
         save one at a time -- "a file she paid data for must not
         disappear on an update". So the hub must not promise that
         one tap here saves the whole course. */
      shellOnly: true,
      name: { en: "English A1+ to B2", ar: "الإنجليزية من A1+ إلى B2" },
      blurb: { en: "English as a second language, A1+ through B2, with audio and printable lessons.",
               ar: "الإنجليزية كلغة ثانية، من A1+ إلى B2، مع صوتيات ودروس قابلة للطباعة." }
    },
    {
      slug: "discrete-math",
      prefix: null,
      entry: "index.en.html",
      colour: "#b45309",
      name: { en: "Discrete Mathematics", ar: "الرياضيات المتقطعة" },
      blurb: { en: "Chapters on logic, sets, relations and counting. Readable online; not yet packaged as an offline app.",
               ar: "فصول في المنطق والمجموعات والعلاقات والعدّ. تُقرأ عبر الإنترنت؛ لم تُحزم بعد كتطبيق يعمل دون اتصال." }
    }
  ];

  /* ---------------------------------------------------------------- strings */

  var UI = {
    save:        { en: "Save offline",    ar: "حفظ للعمل دون اتصال" },
    saving:      { en: "Saving…",         ar: "جارٍ الحفظ…" },
    saved:       { en: "Saved",           ar: "محفوظ" },
    remove:      { en: "Remove",          ar: "إزالة" },
    open:        { en: "Open",            ar: "فتح" },
    saveAll:     { en: "Save all courses", ar: "حفظ كل المواد" },
    online:      { en: "Online only",     ar: "عبر الإنترنت فقط" },
    notApp:      { en: "Not an offline app yet", ar: "ليس تطبيقاً يعمل دون اتصال بعد" },
    shellOnly:   { en: "App saved — choose lessons inside", ar: "التطبيق محفوظ — اختر الدروس بالداخل" },
    install:     { en: "Install",         ar: "تثبيت" },
    offlineNow:  { en: "You are offline. Saved courses still open.",
                  ar: "أنت غير متصل. المواد المحفوظة تُفتح كما هي." },
    files:       { en: "{n} files",       ar: "{n} ملفاً" },
    usage:       { en: "{used} used of about {quota} available",
                  ar: "{used} مستخدمة من نحو {quota} متاحة" },
    usageUnknown:{ en: "Storage use is not reported by this browser.",
                  ar: "هذا المتصفح لا يُبلّغ عن حجم التخزين." },
    persisted:   { en: "Storage is protected from automatic clearing.",
                  ar: "التخزين محميّ من الحذف التلقائي." },
    failed:      { en: "Could not save. Check the connection and try again.",
                  ar: "تعذّر الحفظ. تحقّق من الاتصال وحاول مرة أخرى." }
  };

  /* ---------------------------------------------------------------- helpers */

  function path(course) {
    return course.slug + "/" + (course.entry || "");
  }

  function bytes(n) {
    if (!n) return "0 KB";
    var units = ["B", "KB", "MB", "GB"];
    var i = 0;
    while (n >= 1024 && i < units.length - 1) { n = n / 1024; i++; }
    return (i === 0 ? n : (n < 10 ? n.toFixed(1) : Math.round(n))) + " " + units[i];
  }

  function hasCaches() {
    /* Absent over file:// and in private windows on some browsers. */
    return !!(window.caches && window.isSecureContext !== false);
  }

  /* ------------------------------------------------------- measuring a course

     Sums content-length over the course's caches rather than reading
     each body: a course is 70-160 files, and pulling every blob into
     memory to learn its size would cost more than the number is
     worth. Where a response carries no content-length the file is
     counted but its bytes are not, and the caller is told so, so the
     page can say "about" instead of quietly under-reporting.
     ---------------------------------------------------------------- */
  function measure(course) {
    var empty = { saved: false, files: 0, bytes: 0, unknown: 0 };
    if (!course.prefix || !hasCaches()) return Promise.resolve(empty);

    return caches.keys().then(function (names) {
      var mine = names.filter(function (n) {
        return n.indexOf(course.prefix) === 0;
      });
      if (!mine.length) return empty;

      return Promise.all(mine.map(function (n) {
        return caches.open(n).then(function (c) {
          return c.matchAll();
        }).then(function (list) {
          var total = 0, unknown = 0;
          for (var i = 0; i < list.length; i++) {
            var len = list[i].headers.get("content-length");
            if (len) total += parseInt(len, 10) || 0;
            else unknown++;
          }
          return { files: list.length, bytes: total, unknown: unknown };
        });
      })).then(function (parts) {
        var out = { saved: false, files: 0, bytes: 0, unknown: 0 };
        parts.forEach(function (p) {
          out.files += p.files; out.bytes += p.bytes; out.unknown += p.unknown;
        });
        out.saved = out.files > 0;
        return out;
      });
    })["catch"](function () { return empty; });
  }

  /* --------------------------------------------- the course's own registration

     getRegistration() answers with the registration whose scope best
     matches the URL asked about. This page's own worker is scoped to
     "/", which matches every course folder too, so before a course
     has ever been opened the call answers with the HUB's worker. The
     scope has to be compared or every course would report itself
     installed the moment the hub was.
     ---------------------------------------------------------------- */
  function registrationFor(course) {
    if (!navigator.serviceWorker) return Promise.resolve(null);
    var want = new URL(course.slug + "/", location.href).href;
    return navigator.serviceWorker.getRegistration(want).then(function (reg) {
      return (reg && reg.scope === want) ? reg : null;
    })["catch"](function () { return null; });
  }

  /* ------------------------------------------------------------------ saving */

  /* Watch a course's cache until it stops growing. There is no event
     for "another scope's worker has finished installing", so the file
     count is the signal: three quiet polls in a row means done. The
     ceiling is there so a stalled download releases the button rather
     than spinning for ever. */
  function settle(course, onProgress) {
    return new Promise(function (resolve) {
      var last = -1, quiet = 0, started = Date.now();
      (function tick() {
        measure(course).then(function (s) {
          if (onProgress) onProgress(s);
          if (s.files > 0 && s.files === last) quiet++; else quiet = 0;
          last = s.files;
          if (quiet >= 3 || Date.now() - started > 90000) return resolve(s);
          setTimeout(tick, 600);
        });
      })();
    });
  }

  function save(course, onProgress) {
    if (!course.prefix) return Promise.resolve(null);

    /* Ask once for storage that survives pressure. Chrome grants it
       silently to an installed app; a refusal costs nothing, so the
       result is not waited on. */
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    } catch (e) {}

    return new Promise(function (resolve) {
      var frame = document.createElement("iframe");
      frame.className = "warm";
      frame.setAttribute("aria-hidden", "true");
      frame.setAttribute("tabindex", "-1");
      frame.setAttribute("title", course.slug);
      frame.src = path(course);
      document.body.appendChild(frame);

      var closed = false;
      function finish() {
        if (closed) return;
        closed = true;
        /* The worker installs independently of the page that
           registered it, so the frame can go as soon as the cache has
           settled -- not before, in case the page is still being
           parsed and has not reached its registration call. */
        settle(course, onProgress).then(function (s) {
          if (frame.parentNode) frame.parentNode.removeChild(frame);
          resolve(s);
        });
      }

      frame.addEventListener("load", finish);
      frame.addEventListener("error", finish);
      /* A page that never fires load still gets its chance. */
      setTimeout(finish, 15000);
    });
  }

  function forget(course) {
    var jobs = [];
    if (course.prefix && hasCaches()) {
      jobs.push(caches.keys().then(function (names) {
        return Promise.all(names.filter(function (n) {
          return n.indexOf(course.prefix) === 0;
        }).map(function (n) { return caches["delete"](n); }));
      }));
    }
    jobs.push(registrationFor(course).then(function (reg) {
      return reg ? reg.unregister() : null;
    }));
    return Promise.all(jobs)["catch"](function () {});
  }

  /* ------------------------------------------------------------------ drawing */

  var t = function (k, v) { return window.I18N.t(k, v); };
  var pick = function (o) { return window.I18N.pick(o); };

  function card(course) {
    var el = document.createElement("article");
    el.className = "card";
    el.setAttribute("data-slug", course.slug);
    el.style.setProperty("--accent", course.colour);

    var a = document.createElement("a");
    a.className = "card-open";
    a.href = path(course);
    el.appendChild(a);

    var h = document.createElement("h2");
    h.className = "card-name";
    a.appendChild(h);

    var p = document.createElement("p");
    p.className = "card-blurb";
    a.appendChild(p);

    var foot = document.createElement("div");
    foot.className = "card-foot";
    el.appendChild(foot);

    var status = document.createElement("span");
    status.className = "card-status";
    foot.appendChild(status);

    var button = document.createElement("button");
    button.className = "card-btn";
    button.type = "button";
    foot.appendChild(button);

    var remove = document.createElement("button");
    remove.className = "card-remove";
    remove.type = "button";
    foot.appendChild(remove);

    course.el = {
      root: el, name: h, blurb: p, status: status, button: button, remove: remove
    };

    button.addEventListener("click", function () {
      if (!course.prefix) return;
      button.disabled = true;
      el.classList.add("busy");
      status.textContent = t("saving");
      save(course, function (s) {
        if (s.files) status.textContent = t("files", { n: s.files });
      }).then(function () {
        el.classList.remove("busy");
        return paint(course);
      }).then(usage);
    });

    remove.addEventListener("click", function () {
      remove.disabled = true;
      el.classList.add("busy");
      forget(course).then(function () {
        el.classList.remove("busy");
        return paint(course);
      }).then(usage);
    });

    return el;
  }

  /* Text and controls for one card, from its measured state. */
  function paint(course) {
    var e = course.el;
    if (!e) return Promise.resolve();

    e.name.textContent = pick(course.name);
    e.blurb.textContent = pick(course.blurb);

    if (!course.prefix) {
      e.status.textContent = t("notApp");
      e.button.hidden = true;
      e.remove.hidden = true;
      e.root.classList.add("online-only");
      return Promise.resolve();
    }

    e.button.textContent = t("save");
    e.remove.textContent = t("remove");

    return measure(course).then(function (s) {
      course.state = s;
      e.root.classList.toggle("is-saved", s.saved);
      e.button.disabled = false;
      e.remove.disabled = false;

      if (!s.saved) {
        e.status.textContent = t("online");
        e.button.hidden = false;
        e.remove.hidden = true;
        return;
      }

      var size = (s.unknown ? "≈ " : "") + bytes(s.bytes);
      e.status.textContent = course.shellOnly
        ? t("shellOnly") + " · " + size
        : t("saved") + " · " + size + " · " + t("files", { n: s.files });
      e.button.hidden = true;
      e.remove.hidden = false;
    });
  }

  function paintAll() {
    return Promise.all(COURSES.map(paint));
  }

  /* ------------------------------------------------------------------ storage */

  function usage() {
    var line = document.getElementById("usage");
    if (!line) return Promise.resolve();
    if (!navigator.storage || !navigator.storage.estimate) {
      line.textContent = t("usageUnknown");
      return Promise.resolve();
    }
    return navigator.storage.estimate().then(function (est) {
      line.textContent = t("usage", {
        used: bytes(est.usage || 0),
        quota: bytes(est.quota || 0)
      });
      if (navigator.storage.persisted) {
        navigator.storage.persisted().then(function (ok) {
          if (ok) line.textContent += " · " + t("persisted");
        });
      }
    })["catch"](function () {
      line.textContent = t("usageUnknown");
    });
  }

  /* ------------------------------------------------------------------ save all */

  function saveAll(button) {
    var queue = COURSES.filter(function (c) {
      return c.prefix && !(c.state && c.state.saved);
    });
    button.disabled = true;
    return queue.reduce(function (chain, course) {
      return chain.then(function () {
        course.el.root.classList.add("busy");
        course.el.status.textContent = t("saving");
        return save(course, function (s) {
          if (s.files) course.el.status.textContent = t("files", { n: s.files });
        }).then(function () {
          course.el.root.classList.remove("busy");
          return paint(course);
        }).then(usage);
      });
    }, Promise.resolve()).then(function () {
      button.disabled = false;
    });
  }

  /* ------------------------------------------------------------------ the shell */

  function registerSelf() {
    if (!navigator.serviceWorker) return;
    if (location.protocol !== "http:" && location.protocol !== "https:") return;
    navigator.serviceWorker.register("sw.js", { scope: "./" })["catch"](function () {});
  }

  function setupInstall() {
    var button = document.getElementById("install");
    if (!button) return;
    var deferred = null;

    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferred = e;
      button.hidden = false;
    });

    button.addEventListener("click", function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () {
        deferred = null;
        button.hidden = true;
      });
    });

    window.addEventListener("appinstalled", function () {
      deferred = null;
      button.hidden = true;
    });
  }

  function connection() {
    var note = document.getElementById("offline");
    if (!note) return;
    function show() {
      note.hidden = navigator.onLine !== false;
      note.textContent = t("offlineNow");
    }
    window.addEventListener("online", show);
    window.addEventListener("offline", show);
    show();
  }

  function init() {
    window.I18N.init();
    window.THEME.init();

    var list = document.getElementById("courses");
    COURSES.forEach(function (course) { list.appendChild(card(course)); });

    var all = document.getElementById("save-all");
    if (all) {
      all.textContent = t("saveAll");
      all.addEventListener("click", function () { saveAll(all); });
      all.hidden = !hasCaches();
    }

    document.addEventListener("hub:lang", function () {
      if (all) all.textContent = t("saveAll");
      paintAll().then(usage);
      connection();
    });

    var langToggle = document.getElementById("lang");
    if (langToggle) {
      langToggle.addEventListener("click", function () { window.I18N.toggle(); });
    }
    var themeToggle = document.getElementById("theme");
    if (themeToggle) {
      themeToggle.addEventListener("click", function () { window.THEME.toggle(); });
    }

    setupInstall();
    connection();
    paintAll().then(usage);
    registerSelf();
  }

  window.HUB = { UI: UI, COURSES: COURSES, init: init, measure: measure, bytes: bytes };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
