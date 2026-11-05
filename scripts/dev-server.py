#!/usr/bin/env python3
"""Serve the hub with the seven courses beside it, the way Pages does.

On GitHub Pages every course is a folder of this one origin, which is the
whole reason the hub works: same origin, one manifest scope, one install.
Locally each course is a separate checkout in a sibling directory whose name
does not match its folder on Pages -- "data analysis and implementation" on
disk, `data-analysis-and-implementation/` when served. Opening index.html from
disk therefore gives seven dead links, and no way to exercise the only part of
this repository with real logic in it: asking a course to save itself offline.

So this maps each slug in assets/js/hub.js onto its checkout and serves them
all from one origin, over http, which is also what service workers need.

    python3 scripts/dev-server.py            # http://localhost:8099/
    python3 scripts/dev-server.py 8100
    python3 scripts/dev-server.py -v         # log every request

A slug with no checkout beside this one is reported at startup and then 404s,
which is what a course missing from Pages would do too.
"""
import io
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIBLINGS = os.path.dirname(ROOT)

VERBOSE = "-v" in sys.argv or "--verbose" in sys.argv

# Slug on Pages -> directory name beside this checkout. Only the ones that
# differ need an entry; anything else is looked up under its own slug.
ALIASES = {
    "data-analysis-and-implementation": "data analysis and implementation",
    "programming-ai": "Programming-AI",
    "database-sql": "database sql",
    "ESL": "English-Second-Language",
    # Discrete maths is not a checkout of its published repository: the folder
    # beside this one is a working directory, and the site that is actually
    # deployed sits in dm_site/ inside it.
    "discrete-math": os.path.join("discrete math", "dm_site"),
}


def slugs():
    text = io.open(os.path.join(ROOT, "assets", "js", "hub.js"),
                   encoding="utf-8").read()
    return sorted(set(re.findall(r'^\s*slug:\s*"([^"]+)"', text, re.M)))


def mounts():
    out = {}
    for slug in slugs():
        candidate = os.path.join(SIBLINGS, ALIASES.get(slug, slug))
        if os.path.isdir(candidate):
            out[slug] = candidate
    return out


class Handler(SimpleHTTPRequestHandler):
    MOUNTS = {}

    def translate_path(self, path):
        # Strip query and fragment the way the base class does, then look at
        # the first segment to decide which checkout answers.
        clean = path.split("?", 1)[0].split("#", 1)[0]
        parts = [p for p in clean.split("/") if p not in ("", ".", "..")]
        if parts and parts[0] in self.MOUNTS:
            base = self.MOUNTS[parts[0]]
            rest = parts[1:]
        else:
            base = ROOT
            rest = parts
        full = os.path.join(base, *rest)
        if clean.endswith("/") or not rest:
            index = os.path.join(full, "index.html")
            if os.path.isfile(index):
                return index
        return full

    def end_headers(self):
        # A worker updated between reloads should be picked up, and a cached
        # sw.js is the classic reason a change does not appear.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Quiet unless asked. Under the test suite this server answers many
        # thousands of requests -- seven courses precaching themselves -- and a
        # line each buries the test report it is printed beside.
        if VERBOSE:
            sys.stderr.write("  %s\n" % (fmt % args))

    def log_error(self, fmt, *args):
        # A browser that navigates away mid-response leaves an aborted
        # connection behind. It is normal, it is not this server's problem,
        # and a stack trace for each one is pure noise.
        if VERBOSE:
            sys.stderr.write("  %s\n" % (fmt % args))


class Server(ThreadingHTTPServer):
    """Threaded, and quiet about connections the browser drops.

    A page that navigates away while a response is still being written
    leaves an aborted socket behind, and the default handler prints a
    full traceback for each one. During a test run there are hundreds.
    """

    def handle_error(self, request, client_address):
        kind = sys.exc_info()[0]
        if kind in (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            return
        if VERBOSE:
            super().handle_error(request, client_address)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    port = int(args[0]) if args else 8099
    found = mounts()
    Handler.MOUNTS = found

    print("hub          %s" % ROOT)
    for slug in slugs():
        if slug in found:
            print("  /%-34s %s" % (slug + "/", found[slug]))
        else:
            print("  /%-34s (no checkout beside this one -- will 404)" % (slug + "/"))
    print("\nhttp://localhost:%d/  -- ctrl-c to stop" % port)

    # Threaded on purpose. The hub asks seven courses to save themselves, each
    # in its own iframe, and each course's worker then precaches a hundred-odd
    # files at once; a single-threaded server serialises all of that behind one
    # request at a time and the page appears to hang.
    Server(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
