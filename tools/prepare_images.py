"""Build the site's image set from the client's source folder and Unsplash downloads.

Every photo is renamed for what it shows, resized to a sensible web size and
re-encoded as progressive JPEG. The logo is turned into three brand files:
the original (teal + gold, for light grounds), a light version (teal -> ivory,
gold kept, for dark grounds) and the PV monogram on its own (favicon, marks).

    python tools/prepare_images.py <client folder> <unsplash folder>

iStock files are the client's comp downloads and still carry the iStock
watermark. Replace them with the licensed files (same source name) and rerun.
"""
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "assets", "img")
BRAND = os.path.join(ROOT, "assets", "brand")

# site name               source file                                   long side
CLIENT = {
    "hero-handshake.jpg":   ("abt3.jpg",                                  2400),
    "about-handshake.jpg":  ("abt1.jpg",                                  1600),
    "leadership-group.jpg": ("abt2.jpg",                                  None),
    "team-kathleen.jpg":    ("team1.jpg",                                 None),
    "team-patrick.jpg":     ("team2.jpg",                                 None),
    "team-nomsa.jpg":       ("team4.jpg",                                 None),
    "property-estate.jpg":  ("000_par8321605-scaled.jpg",                 1800),
    "research-desk.jpg":    ("istockphoto-2227848511-2048x2048.jpg",      1800),
    "research-desk-mirror.jpg": ("istockphoto-2227848511-2048x2048.jpg",  1800, "mirror"),
    "boardroom.jpg":        ("istockphoto-2227526961-2048x2048.jpg",      2048),
    "advisor-tablet.jpg":   ("istockphoto-2291317295-2048x2048.jpg",      1600),
    "advisor-portrait.jpg": ("istockphoto-2284224243-2048x2048.jpg",      1600),
    "goal-retire.jpg":      ("istockphoto-2238016926-2048x2048.jpg",      2048),
    "goal-family.jpg":      ("istockphoto-2294558951-2048x2048.jpg",      2048),
    "goal-safari.jpg":      ("istockphoto-2254799983-2048x2048.jpg",      2048),
    "goal-next-gen.jpg":    ("istockphoto-1450298215-2048x2048.jpg",      2048),
    "goal-business.jpg":    ("istockphoto-2250655889-2048x2048.jpg",      2048),
    "exec-office.jpg":      ("istockphoto-1166561376-2048x2048.jpg",      2048),
    "retired-terrace.jpg":  ("istockphoto-1437859117-2048x2048.jpg",      2048),
    "remote-desk.jpg":      ("istockphoto-1438774457-2048x2048.jpg",      2048, "mirror"),
    "beach-couple.jpg":     ("istockphoto-1916985906-2048x2048.jpg",      2048),
    "terrace-lunch.jpg":    ("istockphoto-2215078678-2048x2048.jpg",      2048),
    "holiday-friends.jpg":  ("istockphoto-2243777740-2048x2048.jpg",      2048),
    "boardroom-call.jpg":   ("istockphoto-2260131999-2048x2048.jpg",      2048),
}
UNSPLASH = {
    "harare-skyline.jpg":   ("harare-skyline.jpg",                        2000),
    "victoria-falls.jpg":   ("victoria-falls.jpg",                        2000),
    "markets-tablet.jpg":   ("markets-tablet.jpg",                        1400),
}


def save_photo(src, dst, long_side, *opts):
    im = Image.open(src).convert("RGB")
    if "mirror" in opts:
        # subject faces the wrong way for a page hero with copy on the left
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if long_side and max(im.size) > long_side:
        im.thumbnail((long_side, long_side), Image.LANCZOS)
    im.save(dst, "JPEG", quality=80, optimize=True, progressive=True)
    print(f"{os.path.basename(dst):24} {im.size[0]}x{im.size[1]}  {os.path.getsize(dst) // 1024} KB")


def is_teal(r, g, b):
    return g > r + 40 and b > r + 40


def brand(logo_path):
    logo = Image.open(logo_path).convert("RGBA")
    logo = logo.crop(logo.getbbox())
    logo.save(os.path.join(BRAND, "logo.png"), optimize=True)

    # Light version: teal strokes become ivory, gold stays gold
    light = logo.copy()
    px = light.load()
    for y in range(light.size[1]):
        for x in range(light.size[0]):
            r, g, b, a = px[x, y]
            if a and is_teal(r, g, b):
                px[x, y] = (250, 246, 238, a)
    light.save(os.path.join(BRAND, "logo-light.png"), optimize=True)

    # Monogram: the PV mark is the left block, ending at the first wide empty
    # column run past 15% of the width (narrower gaps sit inside the monogram)
    alpha = logo.getchannel("A")
    w, h = logo.size
    filled = [any(alpha.getpixel((x, y)) > 20 for y in range(h)) for x in range(w)]
    run, end = 0, w
    for x in range(int(w * 0.15), w):
        run = 0 if filled[x] else run + 1
        if run >= 6:
            end = x - run + 1
            break
    for name, src in (("mark.png", logo), ("mark-light.png", light)):
        m = src.crop((0, 0, end, h))
        m.crop(m.getbbox()).save(os.path.join(BRAND, name), optimize=True)
    print("brand: logo", logo.size, "mark width", end)


def main():
    client, unsplash = sys.argv[1], sys.argv[2]
    os.makedirs(IMG, exist_ok=True)
    os.makedirs(BRAND, exist_ok=True)
    for dst, (src, side, *opts) in CLIENT.items():
        save_photo(os.path.join(client, src), os.path.join(IMG, dst), side, *opts)
    for dst, (src, side) in UNSPLASH.items():
        save_photo(os.path.join(unsplash, src), os.path.join(IMG, dst), side)
    brand(os.path.join(client, "logo_a.png"))


if __name__ == "__main__":
    main()
