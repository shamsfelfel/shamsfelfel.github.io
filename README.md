# Shams's Courses — the hub

The landing page for seven bilingual course apps, served at
<https://shamsfelfel.github.io/>.

Its job is to make seven progressive web apps installable as one. Each course
remains its own repository, its own deployment and its own service worker;
nothing here duplicates a course's content.

## Why one install works

A web app's reach is its manifest `scope`: an origin plus a path prefix. Each
course declares `"scope": "./"`, which claims only its own folder — so
installing them separately gives seven icons.

This repository is a GitHub Pages **user site**, which means its name must be
exactly `shamsfelfel.github.io` and it is served at the origin root. Its
manifest declares `"scope": "/"`, claiming every path on the origin, including
all seven course folders. Inside the installed window a link to
`/linear-algebra/` is an in-scope, same-origin navigation, so it stays in the
app: one icon, seven courses.

Rename this repository and that stops working — it becomes a project page under
`/<name>/` and can no longer claim the origin root.

## Saving a course for offline use

Per course, by choice. Nothing is downloaded until the student asks.

Tapping **Save offline** loads that course in a hidden iframe. That runs the
course's own bootstrapper, which registers the course's own service worker,
whose `install` event precaches the whole course from the file list its own
build generates. The hub therefore never needs to know what any course is made
of, and a lesson added to a course needs no change here.

Reporting and removal work because the Cache Storage API is **origin-wide**, not
scope-wide: from `/` this page can enumerate every course's caches. Each course
names its caches with its own prefix, and that prefix is the whole basis of
measuring and deleting one course without touching the other six:

| Course | Folder | Cache prefix |
|---|---|---|
| Data Analysis & Implementation | `data-analysis-and-implementation/` | `da-` |
| Programming for AI — Python OOP | `programming-ai/` | `oop-` |
| Linear Algebra for AI & Data Science | `linear-algebra/` | `la-` |
| Probability & Statistics | `probability-and-statistics/` | `ps-` |
| SQL Lab | `database-sql/` | `sqllab-` |
| English A1+ to B2 | `ESL/` | `esl-` |
| Discrete Mathematics | `discrete-math/` | — not an app yet |

Two courses behave differently from the rest, and the page says so rather than
pretending otherwise:

- **English** precaches only its shell. Its lessons are PDFs and audio, and its
  worker deliberately leaves them for the student to save one at a time, so one
  tap here saves the app and not the lessons.
- **Discrete Mathematics** has no manifest and no service worker, so it can be
  opened online and nothing more. It also has no `index.html` at its folder
  root, so the hub links `index.en.html` directly.

## The sibling-cache rule, and why it is a rule

A service worker's `activate` handler is where it clears out its previous
version's caches. Every course used to clear out *everything*:

```js
return k === CACHE ? null : caches['delete'](k);   // every cache on the origin
```

That was harmless while each course was the only app on its own origin. On a
shared one it is not: `caches.keys()` returns all seven courses' caches and
the hub's, so whenever one course activated — when it was first saved, and
again after every deployment — it wiped the other six and the hub with them.
Saving a second course deleted the first.

Every course now guards by its own prefix:

```js
var PREFIX = 'la-';
return k.indexOf(PREFIX) === 0 ? caches['delete'](k) : null;
```

`e2e/hub.spec.js` carries the regression guard: it saves two courses and then
makes one of them activate again, and fails if the other's caches are gone.
A new course joining this origin has to do the same thing, and its own suite
should plant a sibling cache and prove it survives — `probability-and-statistics`
does.

A second, smaller matter: each course page links its own manifest, so a browser
may offer to install an individual course while the student is already inside
the hub — seven icons, which is the thing this repository exists to avoid.
Guarding each course's install button with
`matchMedia('(display-mode: standalone)').matches` suppresses it.

## Layout

```
index.html              the course list
manifest.webmanifest    scope "/", which is what makes this one app
sw.js                   generated; the hub's own shell only
assets/css/hub.css
assets/js/hub.js        the course registry and the offline controls
assets/js/i18n.js       EN/AR
assets/js/theme.js      light/dark
icons/                  generated
scripts/build-sw.py     writes sw.js
scripts/build-icons.py  writes icons/
```

## Rebuilding

```sh
python3 scripts/build-icons.py        # after changing the course colours
python3 scripts/build-sw.py           # after adding or removing a hub file
python3 scripts/build-sw.py --check   # verify sw.js is in step
```

`build-sw.py` reads the course slugs out of `assets/js/hub.js` rather than
keeping a second copy, so the worker's pass-through list cannot drift from the
list the page draws.

## Adding a course

1. Add it to `COURSES` in `assets/js/hub.js`: folder `slug`, its service
   worker's cache `prefix`, its theme `colour`, and a bilingual name and blurb.
2. Add its colour to `TILES` in `scripts/build-icons.py`.
3. Run both build scripts.

A course with `prefix: null` is treated as online-only.
