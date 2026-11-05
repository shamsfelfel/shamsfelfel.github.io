#!/usr/bin/env python3
"""Stamp each course's app icon from the mark the hub already gives it.

The home page draws a mark and a colour for every course. Those same two
things should be the course's own icon on a phone's home screen, so a student
who installs one course sees the tile they just tapped -- and so the family
looks like a family.

The assignment of mark and colour to course lives in assets/js/hub.js and is
read from there, not copied: one source of truth, and adding a course is still
a one-line change in that file. Only the glyph geometry lives here, because
that is fixed artwork rather than a decision.

Each repo gets the filenames its own manifest already names -- they differ --
so nothing has to be edited in the courses themselves.

    python3 scripts/build-course-icons.py
    python3 scripts/build-course-icons.py --dry-run

Icons are Lucide (ISC); see LICENSE-ICONS.
"""
import io
import os
import re
import sys

import fitz

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIBLINGS = os.path.dirname(ROOT)

# The glyph geometry, on Lucide's 24x24 grid. Keys match `icon:` in hub.js.
GLYPHS = {
    "chart-column":
        '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/>'
        '<path d="M13 17V5"/><path d="M8 17v-3"/>',
    "braces":
        '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/>'
        '<path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
    "grid":
        '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/>'
        '<path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/>',
    "dice":
        '<rect width="12" height="12" x="2" y="10" rx="2" ry="2"/>'
        '<path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6"/>'
        '<path d="M6 18h.01"/><path d="M10 14h.01"/><path d="M15 6h.01"/><path d="M18 9h.01"/>',
    "database":
        '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/>'
        '<path d="M3 12A9 3 0 0 0 21 12"/>',
    "languages":
        '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/>'
        '<path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
    "graph":
        '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/>'
        '<circle cx="18" cy="19" r="3"/>'
        '<line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/>'
        '<line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
}

# slug -> (directory beside this one, icon directory, [(filename, size, maskable)])
PLAIN = [("icon-192.png", 192, False), ("icon-512.png", 512, False),
         ("icon-maskable-512.png", 512, True), ("apple-touch-icon.png", 180, False)]

TARGETS = {
    "data-analysis-and-implementation": ("data analysis and implementation", "icons", PLAIN),
    "programming-ai": ("Programming-AI", "icons", PLAIN),
    "linear-algebra": ("linear-algebra", "icons", PLAIN),
    "probability-and-statistics": ("probability-and-statistics", "icons", PLAIN),
    # These two named their files differently; follow each manifest rather
    # than renaming files the course already points at.
    "database-sql": ("database sql", os.path.join("assets", "icons"), [
        ("icon-192.png", 192, False), ("icon-512.png", 512, False),
        ("icon-512-maskable.png", 512, True), ("apple-touch-icon.png", 180, False),
        ("favicon-32.png", 32, False)]),
    "ESL": ("English-Second-Language", os.path.join("app", "icons"), [
        ("icon-192.png", 192, False), ("icon-512.png", 512, False),
        ("maskable-512.png", 512, True)]),
}

# A plain icon keeps its own rounded plate; a maskable one bleeds to the edge
# because the launcher supplies the shape, and its glyph shrinks to stay
# inside the circle the launcher may crop to.
PLAIN_SCALE, MASK_SCALE = 0.55, 0.42
STROKE = 1.45      # effective stroke width in grid units, before scaling


def courses():
    """slug -> (colour, glyph name), read out of hub.js.

    Scanned forward from each `slug:` rather than matched as a brace-
    delimited block: the course objects contain nested ones (the bilingual
    name and blurb), which a simple brace match cannot span. `colour` and
    `icon` sit within a few lines of the slug in every entry.
    """
    text = io.open(os.path.join(ROOT, "assets", "js", "hub.js"), encoding="utf-8").read()
    found = {}
    for m in re.finditer(r'slug:\s*"([^"]+)"', text):
        window = text[m.end():m.end() + 500]
        colour = re.search(r'colour:\s*"([^"]+)"', window)
        icon = re.search(r'icon:\s*"([^"]+)"', window)
        if colour and icon:
            found[m.group(1)] = (colour.group(1), icon.group(1))
    return found


def svg(colour, glyph, size, maskable):
    scale = MASK_SCALE if maskable else PLAIN_SCALE
    offset = (24 - 24 * scale) / 2.0
    plate = ('<rect width="24" height="24" fill="%s"/>' % colour if maskable
             else '<rect width="24" height="24" rx="4.3" fill="%s"/>' % colour)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
        'width="%d" height="%d">%s'
        '<g transform="translate(%.3f %.3f) scale(%.3f)" fill="none" stroke="#ffffff" '
        'stroke-width="%.3f" stroke-linecap="round" stroke-linejoin="round">%s</g></svg>'
        % (size, size, plate, offset, offset, scale, STROKE / scale, glyph))


def main():
    dry = "--dry-run" in sys.argv
    found = courses()
    written = skipped = 0

    for slug, (folder, icondir, files) in TARGETS.items():
        if slug not in found:
            print("  %-34s not listed in hub.js -- skipped" % slug)
            skipped += 1
            continue
        colour, glyph_name = found[slug]
        glyph = GLYPHS.get(glyph_name)
        if not glyph:
            print("  %-34s unknown glyph %r -- skipped" % (slug, glyph_name))
            skipped += 1
            continue

        out = os.path.join(SIBLINGS, folder, icondir)
        if not os.path.isdir(out):
            print("  %-34s no %s -- skipped" % (slug, icondir))
            skipped += 1
            continue

        for name, size, maskable in files:
            if not dry:
                doc = fitz.open(stream=svg(colour, glyph, size, maskable).encode("utf-8"),
                                filetype="svg")
                doc[0].get_pixmap(alpha=True).save(os.path.join(out, name))
                doc.close()
            written += 1
        print("  %-34s %-8s %s  (%d files)"
              % (slug, colour, glyph_name, len(files)))

    print("\n%s %d icons across %d courses%s"
          % ("would write" if dry else "wrote", written,
             len(TARGETS) - skipped, ", %d skipped" % skipped if skipped else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
