#!/usr/bin/env python3
"""Draw the hub's icons.

The seven course apps each have their own colour and their own mark. The hub is
the shelf they sit on, so its icon says "several things, one place" rather than
naming any subject: a grid of tiles on the neutral slate the hub chrome uses,
each tile carrying one course's real theme colour.

Generated rather than hand-drawn so that adding a course is a one-line change
here instead of a trip through an image editor. The grid shapes itself to the
number of tiles: two columns, as many rows as it takes, and a short last row
centred rather than left over.

    python3 scripts/build-icons.py
"""
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "icons")

# The courses' own theme colours, in the order the home page lists them.
TILES = [
    "#0d6f6a",  # Data Analysis
    "#1f6feb",  # Programming for AI
    "#4338ca",  # Linear Algebra
    "#9d174d",  # Probability & Statistics
    "#0d7d72",  # SQL Lab
    "#15607a",  # English
    "#b45309",  # Discrete Mathematics
]

COLS = 2

SLATE = "#1e293b"


def rounded(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def icon(size, maskable=False):
    """One square icon.

    A maskable icon is cropped to a circle by the launcher, so everything has
    to sit inside the middle 80% -- the safe zone -- or Android will shave the
    corner tiles off.
    """
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # The plate. Maskable icons bleed to the edge because the launcher supplies
    # the shape; the plain icon keeps its own rounded corners.
    if maskable:
        d.rectangle([0, 0, size, size], fill=SLATE)
        inset = size * 0.20
    else:
        rounded(d, [0, 0, size - 1, size - 1], radius=int(size * 0.18), fill=SLATE)
        inset = size * 0.14

    # A two-column grid of tiles inside the safe area, as tall as it needs.
    rows = -(-len(TILES) // COLS)
    area = size - inset * 2
    gap = area * 0.08
    tw = (area - gap * (COLS - 1)) / float(COLS)
    th = (area - gap * (rows - 1)) / float(rows)
    radius = max(2, int(min(tw, th) * 0.22))

    for i, colour in enumerate(TILES):
        col, row = i % COLS, i // COLS
        # A last row with a gap in it would read as a missing tile, so a short
        # row is centred instead.
        in_row = min(COLS, len(TILES) - row * COLS)
        shift = (COLS - in_row) * (tw + gap) / 2.0
        x0 = inset + shift + col * (tw + gap)
        y0 = inset + row * (th + gap)
        rounded(d, [x0, y0, x0 + tw, y0 + th], radius=radius, fill=colour)

    return img


def main():
    if not os.path.isdir(OUT):
        os.makedirs(OUT)
    wrote = []
    for name, size, maskable in [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-maskable-512.png", 512, True),
        ("apple-touch-icon.png", 180, False),
    ]:
        icon(size, maskable).save(os.path.join(OUT, name))
        wrote.append(name)
    print("wrote %d icons: %s" % (len(wrote), ", ".join(wrote)))


if __name__ == "__main__":
    main()
