"""Photo framing data, stamped onto every page by tools/build.py.

The FOCUS map is the single source of truth for every photo's subject box:
the rectangle (left, top, right, bottom, as % of the image) that must never be
cut off or covered. This script writes it onto each <img> as data-focus, adds the
file's real pixel size as width/height, and sets a no-JS fallback
object-position at the centre of the box. Safe to run repeatedly.

    python tools/focus.py      lists the subject boxes
"""
import os
import re

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FOCUS = {
    # photo                   subject                                    L   T   R   B
    "hero-handshake.jpg":     ("his smile and the handshake",          (42, 19, 68, 50)),
    "about-handshake.jpg":    ("both women's smiling faces",           (16, 26, 80, 42)),
    "research-desk.jpg":      ("both analysts' faces",                 (2, 8, 40, 50)),
    "goal-retire.jpg":        ("the couple's faces",                   (48, 2, 85, 45)),
    "goal-family.jpg":        ("all four faces",                       (22, 8, 63, 32)),
    "goal-safari.jpg":        ("both faces",                           (38, 12, 64, 42)),
    "goal-next-gen.jpg":      ("mother's and daughter's faces",        (36, 14, 56, 33)),
    "goal-business.jpg":      ("her face",                             (26, 14, 40, 40)),
    "property-estate.jpg":    ("the estate building",                  (40, 8, 98, 40)),
    "markets-tablet.jpg":     ("the candlestick chart",                (50, 38, 92, 62)),
    "advisor-tablet.jpg":     ("his face",                             (65, 14, 83, 36)),
    "boardroom.jpg":          ("the people around the table",          (28, 30, 72, 52)),
    "advisor-portrait.jpg":   ("his face",                             (54, 6, 74, 26)),
    "team-kathleen.jpg":      ("her face",                             (20, 5, 80, 66)),
    "team-patrick.jpg":       ("his face",                             (25, 0, 75, 70)),
    "team-nomsa.jpg":         ("her face",                             (28, 0, 70, 58)),
    "research-desk-mirror.jpg": ("both analysts' faces",               (60, 8, 98, 50)),
    "exec-office.jpg":        ("his face and shoulders",               (44, 9, 58, 30)),
    "retired-terrace.jpg":    ("the couple's faces",                   (37, 24, 73, 45)),
    "remote-desk.jpg":        ("his face and the phone",               (71, 37, 84, 53)),
    "beach-couple.jpg":       ("the couple's faces",                   (34, 18, 62, 46)),
    "terrace-lunch.jpg":      ("the faces around the table",           (13, 27, 86, 49)),
    "holiday-friends.jpg":    ("the three friends' faces",             (30, 36, 66, 56)),
    "boardroom-call.jpg":     ("his face",                             (55, 37, 67, 57)),
    "harare-skyline.jpg":     ("the tallest towers of the skyline",    (47, 30, 81, 58)),
    # victoria-falls.jpg is a texture behind the closing banner's text, and
    # leadership-group.jpg is shown whole: no subject box.
}


def stamp(tag: str) -> str:
    src = re.search(r'src="assets/img/([^"]+)"', tag)
    if not src:
        return tag
    name = src.group(1)
    w, h = Image.open(os.path.join(ROOT, "assets", "img", name)).size
    # drop anything a previous run wrote, then write it fresh
    tag = re.sub(r'\s(width|height|data-focus|data-subject)="[^"]*"', "", tag)
    tag = re.sub(r'\sstyle="object-position:[^"]*"', "", tag)
    extra = f' width="{w}" height="{h}"'
    if name in FOCUS:
        subject, (l, t, r, b) = FOCUS[name]
        extra += f' data-focus="{l} {t} {r} {b}" data-subject="{subject}"'
        extra += f' style="object-position: {(l + r) / 2:g}% {(t + b) / 2:g}%"'
    if "hero__bg" not in tag and "loading=" not in tag:
        extra += ' loading="lazy"'
    return tag[:-1].rstrip() + extra + ">"


def stamp_html(html: str) -> str:
    return re.sub(r'<img\b[^>]*src="assets/img/[^"]+"[^>]*>', lambda m: stamp(m.group(0)), html)


if __name__ == "__main__":
    for name, (subject, box) in FOCUS.items():
        print(f"{name:24} {subject:36} {box}")
    print("\nThis map is applied by tools/build.py. Run that to rebuild the pages.")
