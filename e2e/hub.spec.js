const { test, expect } = require("@playwright/test");

/* ============================================================
   The hub.

   Two things are worth testing here, and they are both about
   coexistence rather than about this page's own content:

     1. one install reaches every course -- the manifest claims the
        whole origin; and
     2. the hub can save, measure and delete ONE course's storage
        without disturbing the other six, and without the hub's own
        worker shadowing a course's.

   Everything that matters therefore involves Cache Storage, which is
   origin-wide. Playwright gives each test a fresh context, so caches
   and registrations do not leak between tests.
   ============================================================ */

const LA = "linear-algebra";
const SQL = "database-sql";
const PS = "probability-and-statistics";

/* Every course the hub is supposed to show, in the order it shows them.
   Named rather than counted: a course silently dropped from hub.js has to
   fail here, and "the right number of cards" would not notice. */
const SLUGS = [
  "data-analysis-and-implementation", "programming-ai", LA,
  PS, SQL, "ESL", "discrete-math",
];

/* The hub's own worker, in control. */
async function hubWorkerReady(page) {
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration("/");
    return !!(reg && reg.active && navigator.serviceWorker.controller);
  }, null, { timeout: 30000 });
}

function cacheNames(page) {
  return page.evaluate(() => caches.keys());
}

function card(page, slug) {
  return page.locator(`.card[data-slug="${slug}"]`);
}

async function save(page, slug) {
  const c = card(page, slug);
  await c.locator(".card-btn").click();
  await expect(c).toHaveClass(/is-saved/, { timeout: 80000 });
}

test.describe("the course list", () => {
  test("draws every course, with its name and blurb", async ({ page }) => {
    await page.goto("/");
    const cards = page.locator(".card");
    await expect(cards).toHaveCount(SLUGS.length);

    for (const slug of SLUGS) {
      const c = card(page, slug);
      await expect(c).toHaveCount(1);
      await expect(c.locator(".card-name")).not.toBeEmpty();
      await expect(c.locator(".card-blurb")).not.toBeEmpty();
    }
  });

  test("every card links into its own course folder", async ({ page }) => {
    await page.goto("/");
    for (const slug of [LA, PS, SQL, "ESL", "programming-ai"]) {
      await expect(card(page, slug).locator(".card-open"))
        .toHaveAttribute("href", slug + "/");
    }
    /* Discrete maths has no index.html at its folder root, so the hub
       has to name the page itself or the link 404s. */
    await expect(card(page, "discrete-math").locator(".card-open"))
      .toHaveAttribute("href", "discrete-math/index.en.html");
  });

  test("each course link actually resolves", async ({ page, request }) => {
    await page.goto("/");
    const hrefs = await page.locator(".card-open").evaluateAll(
      (as) => as.map((a) => a.getAttribute("href")));
    expect(hrefs).toHaveLength(SLUGS.length);
    for (const href of hrefs) {
      const res = await request.get("/" + href);
      expect(res.status(), href).toBe(200);
    }
  });

  test("a course that is not an app offers no save button", async ({ page }) => {
    await page.goto("/");
    const c = card(page, "discrete-math");
    await expect(c.locator(".card-btn")).toBeHidden();
    await expect(c.locator(".card-remove")).toBeHidden();
    await expect(c.locator(".card-status")).toContainText("Not an offline app yet");
  });

  test("language switches both the prose and the shell's own labels",
    async ({ page }) => {
      await page.goto("/");
      await expect(card(page, LA).locator(".card-btn")).toHaveText("Save offline");

      await page.locator("#lang").click();
      await expect(page.locator("html")).toHaveAttribute("lang", "ar");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(card(page, LA).locator(".card-btn")).toHaveText("حفظ للعمل دون اتصال");
      await expect(card(page, LA).locator(".card-name"))
        .toContainText("الجبر الخطي");
    });

  test("the theme toggle sticks and repaints the chrome", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    const before = await html.getAttribute("data-theme");
    await page.locator("#theme").click();
    await expect(html).not.toHaveAttribute("data-theme", before);

    const after = await html.getAttribute("data-theme");
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", after);
  });
});

test.describe("the manifest", () => {
  test("claims the whole origin, which is what makes this one app",
    async ({ request }) => {
      const res = await request.get("/manifest.webmanifest");
      expect(res.status()).toBe(200);
      const m = JSON.parse(await res.text());

      /* The entire design rests on these two lines: a scope of "/" is
         what puts every course folder inside this app's reach. */
      expect(m.scope).toBe("/");
      expect(m.start_url).toBe("/");
      expect(m.display).toBe("standalone");
    });

  test("names icons that exist, including a maskable one", async ({ request }) => {
    const m = JSON.parse(await (await request.get("/manifest.webmanifest")).text());
    expect(m.icons.length).toBeGreaterThanOrEqual(3);
    for (const icon of m.icons) {
      const res = await request.get("/" + icon.src);
      expect(res.status(), icon.src).toBe(200);
    }
    expect(m.icons.some((i) => i.purpose === "maskable")).toBe(true);
  });

  test("its shortcuts point at real pages", async ({ request }) => {
    const m = JSON.parse(await (await request.get("/manifest.webmanifest")).text());
    for (const s of m.shortcuts || []) {
      const res = await request.get(s.url);
      expect(res.status(), s.url).toBe(200);
    }
  });
});

test.describe("the hub's own worker", () => {
  test("registers, takes control, and caches under its own prefix",
    async ({ page }) => {
      await page.goto("/");
      await hubWorkerReady(page);

      const names = await cacheNames(page);
      const mine = names.filter((n) => n.startsWith("hub-"));
      expect(mine).toHaveLength(1);

      /* Nothing else may be in there: the courses own their own caches. */
      expect(names.filter((n) => !n.startsWith("hub-"))).toEqual([]);
    });

  test("the hub opens with the network off", async ({ page, context }) => {
    await page.goto("/");
    await hubWorkerReady(page);

    await context.setOffline(true);
    try {
      /* goto rather than reload: a reload is a validating navigation and
         Chromium fails it outright when the network is emulated down,
         without ever consulting the worker. The courses' own suites use
         goto for the same reason. */
      await page.goto("/");
      await expect(page.locator(".card")).toHaveCount(SLUGS.length);
      await expect(page.locator("#offline")).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test("it does not cache course pages, which belong to the course",
    async ({ page }) => {
      await page.goto("/");
      await hubWorkerReady(page);

      /* Visit a course while only the hub's worker exists. Its scope is
         "/", so this navigation passes through it -- and must not be
         stored, or the hub would hold a second, ageing copy of a page
         the course's own worker already owns. */
      await page.goto("/" + LA + "/");
      await page.goto("/");

      const hub = (await cacheNames(page)).find((n) => n.startsWith("hub-"));
      const keys = await page.evaluate(async (name) => {
        const c = await caches.open(name);
        return (await c.keys()).map((r) => new URL(r.url).pathname);
      }, hub);

      expect(keys.some((p) => p.startsWith("/" + LA + "/"))).toBe(false);
      expect(keys).toContain("/");
    });

  test("a course that was never saved does not open offline, and says so",
    async ({ page, context }) => {
      await page.goto("/");
      await hubWorkerReady(page);
      await expect(card(page, LA).locator(".card-status")).toContainText("Online only");

      /* The honest behaviour: the hub must not answer a course URL with
         its own shell, which would render the hub under that path with
         every relative link one directory too deep. */
      await context.setOffline(true);
      const res = await page.goto("/" + LA + "/").catch(() => null);
      expect(res).toBeNull();
      await context.setOffline(false);
    });
});

test.describe("saving a course", () => {
  test("fills that course's own cache, under its own prefix",
    async ({ page }) => {
      await page.goto("/");
      await hubWorkerReady(page);
      await save(page, LA);

      const names = await cacheNames(page);
      expect(names.filter((n) => n.startsWith("la-")).length).toBeGreaterThan(0);

      /* The course's worker precaches the whole course, not a handful. */
      const files = await page.evaluate(async () => {
        const mine = (await caches.keys()).filter((n) => n.startsWith("la-"));
        let n = 0;
        for (const name of mine) {
          const cache = await caches.open(name);
          n += (await cache.keys()).length;
        }
        return n;
      });
      expect(files).toBeGreaterThan(40);
    });

  /* The newest course on the origin, saved the same way. A course joining
     this shelf has to work through the hub as well as on its own, and that
     is a different path: a hidden iframe, the course's own bootstrapper, and
     the course's own worker filling a cache this page can then measure. */
  test("works for the newest course on the origin too", async ({ page }) => {
    await page.goto("/");
    await hubWorkerReady(page);
    await save(page, PS);

    const names = await cacheNames(page);
    expect(names.filter((n) => n.startsWith("ps-")).length).toBeGreaterThan(0);

    const files = await page.evaluate(async () => {
      const mine = (await caches.keys()).filter((n) => n.startsWith("ps-"));
      let n = 0;
      for (const name of mine) {
        const cache = await caches.open(name);
        n += (await cache.keys()).length;
      }
      return n;
    });
    expect(files).toBeGreaterThan(40);

    await expect(card(page, PS).locator(".card-status")).toContainText("Saved");
  });

  test("reports what it saved, and offers to remove it", async ({ page }) => {
    await page.goto("/");
    await hubWorkerReady(page);
    await save(page, LA);

    const c = card(page, LA);
    await expect(c.locator(".card-status")).toContainText("Saved");
    await expect(c.locator(".card-status")).toContainText(/\d+ files/);
    await expect(c.locator(".card-status")).toContainText(/\d+(\.\d+)? (KB|MB)/);
    await expect(c.locator(".card-btn")).toBeHidden();
    await expect(c.locator(".card-remove")).toBeVisible();
  });

  test("survives a reload -- the state is the cache, not the page",
    async ({ page }) => {
      await page.goto("/");
      await hubWorkerReady(page);
      await save(page, LA);

      await page.reload();
      await expect(card(page, LA)).toHaveClass(/is-saved/, { timeout: 30000 });
      await expect(card(page, LA).locator(".card-status")).toContainText("Saved");
    });

  test("that course then opens with the network off", async ({ page, context }) => {
    await page.goto("/");
    await hubWorkerReady(page);
    await save(page, LA);

    await context.setOffline(true);
    const res = await page.goto("/" + LA + "/");
    expect(res.status()).toBe(200);
    await expect(page.locator("body")).not.toBeEmpty();
    await context.setOffline(false);
  });

  test("leaves every other course alone", async ({ page }) => {
    await page.goto("/");
    await hubWorkerReady(page);
    await save(page, LA);

    const names = await cacheNames(page);
    expect(names.filter((n) => n.startsWith("sqllab-"))).toEqual([]);
    expect(names.filter((n) => n.startsWith("da-"))).toEqual([]);
    expect(names.filter((n) => n.startsWith("oop-"))).toEqual([]);

    await expect(card(page, SQL).locator(".card-status")).toContainText("Online only");
    await expect(card(page, SQL)).not.toHaveClass(/is-saved/);
  });

  test("English is labelled as shell-only, because that is what it saves",
    async ({ page }) => {
      await page.goto("/");
      await hubWorkerReady(page);
      await save(page, "ESL");

      /* Its worker fills a shell cache and leaves the PDFs and audio to
         the student, so the hub must not claim the course is saved. */
      await expect(card(page, "ESL").locator(".card-status"))
        .toContainText("choose lessons inside");
    });
});

test.describe("removing a course", () => {
  test("deletes that course's caches and leaves the hub's alone", async ({ page }) => {
    await page.goto("/");
    await hubWorkerReady(page);
    await save(page, LA);

    await card(page, LA).locator(".card-remove").click();
    await expect(card(page, LA)).not.toHaveClass(/is-saved/, { timeout: 30000 });

    const names = await cacheNames(page);
    expect(names.filter((n) => n.startsWith("la-"))).toEqual([]);
    expect(names.filter((n) => n.startsWith("hub-")).length).toBe(1);
  });

  /* The one that matters on a shared origin.
   *
   * Every course used to activate like this:
   *
   *     return k === CACHE ? null : caches['delete'](k);
   *
   * -- every cache that is not its own. Harmless while each course had an
   * origin to itself; on this one it meant saving a second course deleted
   * the first, and any course's next deployment deleted all of them. All
   * five now guard by prefix instead:
   *
   *     return k.indexOf(PREFIX) === 0 ? caches['delete'](k) : null;
   *
   * This test is the regression guard. If it fails, some course has gone
   * back to clearing caches it does not own.
   */
  test("saving a second course does not wipe the first", async ({ page }) => {
    await page.goto("/");
    await hubWorkerReady(page);
    await save(page, LA);
    await save(page, SQL);

    const names = await cacheNames(page);
    expect(names.filter((n) => n.startsWith("la-")).length).toBeGreaterThan(0);
    expect(names.filter((n) => n.startsWith("sqllab-")).length).toBeGreaterThan(0);
    expect(names.filter((n) => n.startsWith("hub-")).length).toBe(1);
    await expect(card(page, LA)).toHaveClass(/is-saved/);
    await expect(card(page, SQL)).toHaveClass(/is-saved/);
  });

  /* ESL is the awkward one: its shell cache is retired on update but its
     content cache holds PDFs and audio the student chose to save, and that
     must survive both its own updates and every sibling's. */
  test("English keeps its content cache when another course activates",
    async ({ page }) => {
      await page.goto("/");
      await hubWorkerReady(page);
      await save(page, "ESL");

      /* Stand in for the student having saved a lesson. */
      await page.evaluate(async () => {
        const c = await caches.open("esl-content-v1");
        await c.put(new Request("/ESL/lessons/pretend.pdf"),
                    new Response("pdf", { headers: { "content-length": "3" } }));
      });

      await save(page, LA);

      const kept = await page.evaluate(async () => {
        const c = await caches.open("esl-content-v1");
        return (await c.keys()).length;
      });
      expect(kept).toBe(1);
    });

  test("puts the card back to offering a save", async ({ page }) => {
    await page.goto("/");
    await hubWorkerReady(page);
    await save(page, LA);

    await card(page, LA).locator(".card-remove").click();
    await expect(card(page, LA)).not.toHaveClass(/is-saved/, { timeout: 30000 });
    await expect(card(page, LA).locator(".card-btn")).toBeVisible();
    await expect(card(page, LA).locator(".card-status")).toContainText("Online only");
  });
});

test.describe("by construction", () => {
  test("nothing is loaded from another origin", async ({ page }) => {
    const foreign = [];
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (u.origin !== "http://localhost:8099" && u.protocol !== "data:") {
        foreign.push(r.url());
      }
    });
    await page.goto("/");
    await hubWorkerReady(page);
    expect(foreign).toEqual([]);
  });

  test("the worker's course list is in step with the page's", async ({ page, request }) => {
    const sw = await (await request.get("/sw.js")).text();
    const listed = [...sw.matchAll(/^ {2}'([^']+)',?$/gm)].map((m) => m[1]).sort();

    await page.goto("/");
    const drawn = await page.locator(".card").evaluateAll(
      (els) => els.map((e) => e.getAttribute("data-slug")).sort());

    /* Two copies of the same list is a bug waiting to happen, so the
       build script derives one from the other; this is the guard. */
    expect(listed).toEqual(drawn);
  });
});
