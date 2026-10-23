"""Write the decorative surface patterns into assets/.

guilloche.svg  banknote-style interlaced waves (teal), tiled on pastel grounds
footer-v.svg   nested V chevrons echoing the monogram (gold + ivory), tiled on dark grounds

    python tools/patterns.py
"""
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def wave(phase, amp, mid, w=240, period=120, step=4):
    pts = []
    for x in range(0, w + 1, step):
        y = mid + amp * math.sin(2 * math.pi * x / period + phase)
        pts.append(f"{x},{y:.2f}")
    return "M" + " L".join(pts)


def guilloche():
    paths = []
    for i in range(8):
        ph = i * math.pi / 4
        paths.append(wave(ph, 14 - (i % 2) * 6, 32))
    d = " ".join(paths)
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="64" viewBox="0 0 240 64">'
        f'<path d="{d}" fill="none" stroke="#008A92" stroke-opacity=".10" stroke-width=".8"/>'
        "</svg>"
    )
    open(os.path.join(ROOT, "assets", "guilloche.svg"), "w").write(svg)


def footer_v():
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">'
        '<g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.1">'
        '<path d="M14 18 L40 82 L66 18" stroke="#D29C4A" stroke-opacity=".75"/>'
        '<path d="M24 18 L40 58 L56 18" stroke="#FFFFFF" stroke-opacity=".28"/>'
        '<path d="M74 62 L92 106 L110 62" stroke="#FFFFFF" stroke-opacity=".16"/>'
        "</g></svg>"
    )
    open(os.path.join(ROOT, "assets", "footer-v.svg"), "w").write(svg)


if __name__ == "__main__":
    guilloche()
    footer_v()
    print("patterns written")
