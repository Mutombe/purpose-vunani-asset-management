"""Pre-launch audit: the checks that are cheap to prove rather than assume.

    python -P tools/audit.py            (serves the site itself on 8093)

- console errors and failed requests on every page
- horizontal overflow at 1280 and 390
- every local href/src in the built HTML and every url() in styles.css resolves
- the hero's last element is on screen at six real viewport sizes
- small text that is one line on desktop but wraps on a phone, and
  paragraphs longer than four lines at 390 (headings are exempt)
- the page still shows its content with JavaScript disabled
- the mobile menu opens, locks page scroll and closes
- no dash characters in the built HTML
"""
import functools
import http.server
import os
import re
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "http://127.0.0.1:8093/"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PAGES = ["index", "about", "solutions", "process", "fees", "team", "documents", "contact"]
HEROES = [(1440, 900), (1366, 768), (1280, 720), (1280, 640), (1440, 1080), (390, 844)]
problems = []


def flag(msg):
    problems.append(msg)
    print("FAIL", msg)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def static_checks():
    for page in PAGES:
        html = open(os.path.join(ROOT, page + ".html"), encoding="utf-8").read()
        for ref in re.findall(r'(?:href|src)="([^"#?]+)', html):
            if re.match(r"(https?:|mailto:|tel:|data:)", ref):
                continue
            if not os.path.exists(os.path.join(ROOT, ref)):
                flag(f"{page}: missing {ref}")
        text = re.sub(r"<[^>]+>", " ", re.sub(r"<(script|style)\b.*?</\1>", "", html, flags=re.S))
        for ch in ("\u2014", "\u2013", "&mdash;", "&ndash;"):
            if ch in text:
                flag(f"{page}: dash character {ch!r}")
    css = open(os.path.join(ROOT, "styles.css"), encoding="utf-8").read()
    for ref in re.findall(r'url\("?([^")]+)"?\)', css):
        if not ref.startswith("data:") and not os.path.exists(os.path.join(ROOT, ref)):
            flag(f"styles.css: missing {ref}")


LINES = """() => {
  const out = {};
  document.querySelectorAll('p, li, small, b, a, span, figcaption, label, button, td, th').forEach((el, i) => {
    if (el.closest('h1, h2, h3, h4, nav, .strip, svg, [aria-hidden="true"], .cycle__panel:not(.is-on), .years__panel:not(.is-on), [hidden]')) return;
    if (!el.offsetParent || el.children.length > 3) return;
    const t = el.textContent.trim().replace(/\\s+/g, ' ');
    if (t.length < 4) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'inline') return;
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
    const h = el.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    out[i] = [Math.max(1, Math.round(h / lh)), el.tagName.toLowerCase(), t.slice(0, 70)];
  });
  return out;
}"""


def main():
    os.chdir(ROOT)
    static_checks()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8093), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME)
        for page in PAGES:
            pg = b.new_page(viewport={"width": 1280, "height": 800})
            errs, fails = [], []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
            pg.on("requestfailed", lambda r: fails.append(r.url))
            pg.on("response", lambda r: r.status >= 400 and fails.append(f"{r.status} {r.url}"))
            pg.goto(URL + page + ".html", wait_until="networkidle")
            for e in errs:
                flag(f"{page}: console {e[:120]}")
            for f in fails:
                if "google." not in f and "gstatic" not in f:
                    flag(f"{page}: request {f[:120]}")
            for w, h in [(1280, 800), (390, 844)]:
                pg.set_viewport_size({"width": w, "height": h}); pg.wait_for_timeout(250)
                sw = pg.evaluate("document.documentElement.scrollWidth")
                if sw > w:
                    flag(f"{page} {w}: horizontal overflow {sw}")
            # line budgets: compare desktop with phone
            pg.set_viewport_size({"width": 1280, "height": 800}); pg.wait_for_timeout(300)
            desk = pg.evaluate(LINES)
            pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(300)
            mob = pg.evaluate(LINES)
            for k, (n, tag, t) in mob.items():
                d = desk.get(k)
                if d and d[0] == 1 and n >= 2 and tag != "p" and len(t) < 60:
                    flag(f"{page}: wraps on phone ({n} lines) <{tag}> {t}")
                if tag == "p" and n > 4:
                    flag(f"{page}: {n} lines at 390 <p> {t}")
            pg.close()
            # hero fits the screen
            for w, h in HEROES:
                pg = b.new_page(viewport={"width": w, "height": h})
                pg.goto(URL + page + ".html", wait_until="networkidle")
                bottom = pg.evaluate("""() => { const hero = document.querySelector('.hero, .phero');
                  const copy = hero.querySelector('.hero__btns, .phero__stats, .hero__content, .phero__copy');
                  return copy.getBoundingClientRect().bottom; }""")
                if bottom > h:
                    flag(f"{page} {w}x{h}: hero copy ends at {bottom:.0f}px, below the fold")
                pg.close()
            # no JavaScript
            ctx = b.new_context(java_script_enabled=False, viewport={"width": 1280, "height": 800})
            pg = ctx.new_page()
            pg.goto(URL + page + ".html")
            pg.wait_for_timeout(1500)  # let entrance animations finish
            hidden = pg.evaluate("""() => [...document.querySelectorAll('main section h2, main section h3')]
                .filter(e => getComputedStyle(e).visibility === 'hidden' || parseFloat(getComputedStyle(e).opacity) < .5
                  || parseFloat(getComputedStyle(e.closest('.reveal') || e).opacity) < .5).length""")
            if hidden:
                flag(f"{page}: {hidden} headings hidden without JavaScript")
            ctx.close()
            print("audited", page)
        # mobile menu
        pg = b.new_page(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
        pg.goto(URL + "about.html", wait_until="networkidle")
        pg.click("#navToggle"); pg.wait_for_timeout(350)
        opened = pg.evaluate("document.getElementById('navLinks').classList.contains('open')")
        locked = pg.evaluate("getComputedStyle(document.body).overflow === 'hidden' || getComputedStyle(document.documentElement).overflow === 'hidden'")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        closed = not pg.evaluate("document.getElementById('navLinks').classList.contains('open')")
        if not (opened and locked and closed):
            flag(f"mobile menu: opened={opened} locked={locked} closed={closed}")
        b.close()
    srv.shutdown()
    print(f"\n{len(problems)} problem(s)")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
