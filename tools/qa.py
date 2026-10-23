"""Photo framing and page QA.

Checks every page at four widths (and each page hero at six screen sizes) that
every subject box is fully inside its frame with zero obstacle overlap, every
carousel slide included; that no photo is stretched; that every image loads;
that nothing scrolls sideways; and that no script throws.

Serves the site itself on http://127.0.0.1:8091/ unless something already is.

    python tools/qa.py
"""
import functools
import http.server
import os
import sys
import threading
import urllib.request

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "http://127.0.0.1:8091/"
PAGES = sys.argv[1:] or ["index", "about", "solutions", "process", "fees", "team", "documents", "contact"]
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

MEASURE = r"""
(only) => {
  const out = [];
  document.querySelectorAll('img[data-focus]').forEach(img => {
    if (only && !img.matches(only)) return;
    const slide = img.closest('.slide');
    if (slide && !slide.classList.contains('is-active')) return;
    const W = img.offsetWidth, H = img.offsetHeight;
    if (!W || !H) return;
    const br = img.getBoundingClientRect();
    const fx = br.left + br.width / 2 - W / 2, fy = br.top + br.height / 2 - H / 2;
    const nw = img.naturalWidth, nh = img.naturalHeight;
    const s = Math.max(W / nw, H / nh), rw = nw * s, rh = nh * s;
    const [px, py] = getComputedStyle(img).objectPosition.split(' ').map(v =>
      v.endsWith('%') ? null : parseFloat(v));
    const [L, T, R, B] = img.dataset.focus.split(/\s+/).map(Number);
    const box = {l: px + L / 100 * rw, t: py + T / 100 * rh, r: px + R / 100 * rw, b: py + B / 100 * rh};
    const area = (box.r - box.l) * (box.b - box.t);
    const iw = Math.max(0, Math.min(box.r, W) - Math.max(box.l, 0));
    const ih = Math.max(0, Math.min(box.b, H) - Math.max(box.t, 0));
    const inside = iw * ih / area;
    const scope = img.closest('[data-photo-scope]');
    let cov = 0; const hits = [];
    (scope ? [...scope.querySelectorAll('[data-obstacle]')] : []).forEach(el => {
      const other = el.closest('.slide');
      if (other && other !== slide) return;
      if (!el.getClientRects().length) return;
      if (getComputedStyle(el).opacity === '0' && !el.closest('.reveal')) return;
      let rects;
      if (el.dataset.obstacle === 'text') { const r = document.createRange(); r.selectNodeContents(el); rects = [...r.getClientRects()]; }
      else rects = [el.getBoundingClientRect()];
      rects.forEach(o => {
        const a = Math.max(0, Math.min(box.r, o.right - fx) - Math.max(box.l, o.left - fx)) *
                  Math.max(0, Math.min(box.b, o.bottom - fy) - Math.max(box.t, o.top - fy));
        if (a > 0.5) { cov += a; hits.push(el.className || el.tagName); }
      });
    });
    out.push({src: img.getAttribute('src').split('/').pop(), inside, covered: cov / area,
              hits: [...new Set(hits)], fit: getComputedStyle(img).objectFit, pos: getComputedStyle(img).objectPosition});
  });
  return out;
}"""

fails = []


def report(tag, rows):
    for r in rows:
        ok = r["inside"] > 0.999 and r["covered"] < 0.001 and r["fit"] == "cover"
        line = f"{'PASS' if ok else 'FAIL'} {tag:22} {r['src']:22} inside={r['inside']*100:5.1f}% covered={r['covered']*100:4.1f}% {r['hits'] if r['hits'] else ''}"
        if not ok:
            print(line)
            fails.append(line)


def settle(pg):
    pg.add_style_tag(content=".reveal{opacity:1!important;transform:none!important;transition:none!important}")
    H = pg.evaluate("document.body.scrollHeight")
    for y in range(0, H, 600):
        pg.evaluate(f"scrollTo(0,{y})")
        pg.wait_for_timeout(25)
    pg.evaluate("scrollTo(0,0)")
    pg.evaluate("dispatchEvent(new Event('resize'))")
    pg.wait_for_timeout(400)


def check_page(pg, page, w):
    report(f"{page} {w}", pg.evaluate(MEASURE, None))
    n = pg.evaluate("document.querySelectorAll('.carousel__dots button').length")
    for i in range(n):
        pg.click(f".carousel__dots button:nth-child({i + 1})", force=True)
        pg.wait_for_timeout(250)
        report(f"{page} {w} s{i + 1}", pg.evaluate(MEASURE, ".slide img"))
    broken = pg.evaluate("[...document.images].filter(i => i.getAttribute('src') && !i.naturalWidth).map(i => i.getAttribute('src'))")
    stretched = pg.evaluate("""[...document.images].filter(i => i.naturalWidth && i.offsetWidth).filter(i => {
        const f = getComputedStyle(i).objectFit; if (f === 'cover' || f === 'contain') return false;
        return Math.abs(i.naturalWidth / i.naturalHeight - i.offsetWidth / i.offsetHeight) / (i.naturalWidth / i.naturalHeight) > .02;
      }).map(i => i.getAttribute('src'))""")
    wide = pg.evaluate("document.documentElement.scrollWidth > innerWidth ? [document.documentElement.scrollWidth] : []")
    for kind, lst in (("broken images", broken), ("stretched images", stretched), ("sideways scroll", wide)):
        if lst:
            fails.append(f"FAIL {page} {w} {kind}: {lst}")
            print(fails[-1])


def serve_if_needed():
    try:
        urllib.request.urlopen(URL, timeout=2)
        return None
    except OSError:
        class Quiet(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *a):
                pass
        handler = functools.partial(Quiet, directory=ROOT)
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 8091), handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        return server


server = serve_if_needed()
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME)
    for page in PAGES:
        checked = 0
        for w, h in [(1440, 900), (1280, 800), (820, 1180), (390, 844)]:
            pg = b.new_page(viewport={"width": w, "height": h})
            errors = []
            pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(URL + page + ".html", wait_until="networkidle")
            settle(pg)
            check_page(pg, page, f"{w}px")
            checked += pg.evaluate("document.querySelectorAll('img[data-focus]').length")
            for e in errors:
                fails.append(f"FAIL {page} {w}px script error: {e}")
                print(fails[-1])
            pg.close()
        for w, h in [(1920, 1080), (1440, 900), (1366, 768), (1024, 768), (390, 844), (375, 667)]:
            pg = b.new_page(viewport={"width": w, "height": h})
            pg.goto(URL + page + ".html", wait_until="networkidle")
            settle(pg)
            report(f"{page} hero {w}x{h}", pg.evaluate(MEASURE, ".hero__bg, .phero__media img"))
            pg.close()
        print(f"checked {page}: {checked} framed photos across 4 widths, hero at 6 sizes")
    b.close()
if server:
    server.shutdown()

print(f"\n{len(fails)} failure(s)")
