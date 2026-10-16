"""Scan test lab: fake phone photos / Drive scans of documents whose perfect answer we know.

Each case writes two zlib-compressed gray images (tiny header: width, height as uint32 BE):
  <name>.in.gz    what the phone gives Inkwell
  <name>.truth.gz the perfect clean page (white paper, black ink), at 150 dpi A4
Camera cases also write <name>.corners.json: where the page corners really are in the photo.
Deterministic (seeded), so scores are comparable run to run.  Usage: python scan-lab/make_lab.py
"""
import json, random, struct, zlib
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).parent / "cases"
W, H = 1240, 1754  # A4 at 150 dpi
WORDS = "the of and to in is you that it he was for on are as with his they at be this have from or one had by word but not what all were we when your can said there use an each which she do how their if will up other about out many then them these so some her would make like him into time has look two more write go see number no way could people my than first water been call who oil its now find long down day did get come made may part".split()


def font(px):
    try:
        return ImageFont.truetype("arial.ttf", px)
    except OSError:
        return ImageFont.load_default()


def page(rng, kind):
    """The perfect page (L mode, 255 paper) plus an RGB 'ink colour' version for camera realism."""
    rgb = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(rgb)
    y = 90
    d.text((90, y), " ".join(rng.choice(WORDS).capitalize() for _ in range(4)), font=font(34), fill=(0, 0, 0)); y += 70
    size = rng.choice([16, 18, 21, 24])  # 16 px at 150 dpi ~ 7.7 pt: small print on bills
    lines = rng.randint(18, 30) if kind != "photo" else 10
    for _ in range(lines):
        x = 90
        while x < W - 160:
            w = rng.choice(WORDS)
            d.text((x, y), w, font=font(size), fill=(20, 20, 20))
            x += d.textlength(w + " ", font=font(size))
        y += int(size * 1.6)
        if y > H - 300:
            break
    if kind in ("table", "bill"):
        top = y + 20
        for r in range(6):
            d.line((90, top + r * 40, W - 90, top + r * 40), fill=(0, 0, 0), width=2)
        for c in range(5):
            d.line((90 + c * (W - 180) // 4, top, 90 + c * (W - 180) // 4, top + 200), fill=(0, 0, 0), width=2)
        y = top + 230
    if kind in ("bill", "letter"):  # blue pen signature + red stamp: must stay dark
        pts = [(W - 420 + i * 6, H - 260 + int(25 * np.sin(i / 4)) + rng.randint(-3, 3)) for i in range(50)]
        d.line(pts, fill=(20, 40, 170), width=4)
        d.ellipse((120, H - 330, 330, H - 120), outline=(190, 30, 30), width=6)
        d.text((150, H - 240), "PAID", font=font(44), fill=(190, 30, 30))
    if kind == "photo":
        ph = Image.linear_gradient("L").resize((W - 180, 500)).convert("RGB")
        rgb.paste(ph, (90, y + 20))
    truth = rgb.convert("L")
    return rgb, truth


def degrade(rgb, rng, show_through, light, tint):
    a = np.asarray(rgb, dtype=np.float64)
    if show_through:  # text from the back page, mirrored, faint and blurry
        back, _ = page(random.Random(rng.random()), "plain")
        b = np.asarray(back.transpose(Image.FLIP_LEFT_RIGHT).convert("L").filter(ImageFilter.GaussianBlur(2.2)), dtype=np.float64)
        a = a * (1 - show_through * (1 - b / 255))[..., None]
    paper = np.array(tint, dtype=np.float64) / 255
    a = a * paper
    yy, xx = np.mgrid[0:H, 0:W] / max(W, H)
    shade = 1 - light * (0.6 * xx + 0.4 * yy + 0.5 * np.exp(-((xx - 0.7) ** 2 + (yy - 0.3) ** 2) / 0.02) * rng.random())
    a = a * np.clip(shade, 0.2, 1)[..., None]
    a += np.random.default_rng(rng.randint(0, 1 << 30)).normal(0, 4, a.shape)
    for _ in range(rng.randint(30, 120)):  # specks
        x, y = rng.randrange(W), rng.randrange(H)
        a[y:y + 2, x:x + 2] *= 0.6
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def finger(img, rng):
    """A thumb holding the page: a skin-toned rounded blob coming in from a side edge, with a soft shadow."""
    im = img.convert("RGB")
    layer = Image.new("L", im.size, 0)
    d = ImageDraw.Draw(layer)
    side = rng.choice(["left", "right", "bottom"])
    y = rng.randint(300, H - 300); x = rng.randint(250, W - 250)
    box = {"left": (-120, y - 70, 170, y + 70), "right": (W - 170, y - 70, W + 120, y + 70),
           "bottom": (x - 70, H - 170, x + 70, H + 120)}[side]
    d.rounded_rectangle(box, radius=70, fill=255)
    shadow = layer.filter(ImageFilter.GaussianBlur(14))
    a = np.asarray(im, dtype=np.float64) * (1 - 0.35 * np.asarray(shadow, dtype=np.float64)[..., None] / 255)
    skin = np.array(rng.choice([(205, 150, 120), (170, 115, 85), (225, 180, 150)]), dtype=np.float64)
    m = (np.asarray(layer.filter(ImageFilter.GaussianBlur(2)), dtype=np.float64) / 255)[..., None]
    a = a * (1 - m) + skin * m * (0.85 + 0.15 * np.random.default_rng(1).random(a.shape[:2]))[..., None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def hard_shadow(img, rng):
    """A phone or hand shadow: a soft dark band across part of the page."""
    a = np.asarray(img, dtype=np.float64)
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    ang = rng.uniform(0, np.pi)
    d = (xx - a.shape[1] * rng.uniform(0.3, 0.7)) * np.cos(ang) + (yy - a.shape[0] * rng.uniform(0.3, 0.7)) * np.sin(ang)
    band = 1 - 0.45 / (1 + np.exp(-d / 25))  # half the page in shadow, soft edge
    a = a * (band[..., None] if a.ndim == 3 else band)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def on_table(img, rng, table=None):
    """Photo of the page lying on a table: tilted perspective, background around it, slight blur."""
    PW, PH = 1500, 2000
    bg = np.random.default_rng(rng.randint(0, 1 << 30)).normal(table or rng.choice([60, 90, 120]), 18, (PH, PW, 3))
    bg = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))
    j = lambda v: v + rng.randint(-90, 90)
    corners = [(j(170), j(180)), (j(1330), j(160)), (j(1350), j(1850)), (j(150), j(1830))]  # TL TR BR BL
    coeffs = _persp(corners, [(0, 0), (W, 0), (W, H), (0, H)])
    warped = img.transform((PW, PH), Image.PERSPECTIVE, coeffs, Image.BICUBIC, fillcolor=None)
    mask = Image.new("L", img.size, 255).transform((PW, PH), Image.PERSPECTIVE, coeffs, Image.BICUBIC)
    bg.paste(warped, (0, 0), mask)
    return bg.filter(ImageFilter.GaussianBlur(0.7)), corners


def _persp(src_pts, dst_pts):
    """Coefficients mapping output (photo) coords back to page coords, for PIL's PERSPECTIVE."""
    m = []
    for (x, y), (u, v) in zip(src_pts, dst_pts):
        m.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); m.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    return np.linalg.solve(np.array(m, float), np.array([c for p in dst_pts for c in p], float)).tolist()


def _jpeg(img):
    import io
    b = io.BytesIO(); img.save(b, "JPEG", quality=80); return b.getvalue()


def save(name, gray):
    a = np.asarray(gray.convert("L"), dtype=np.uint8)
    (OUT / name).write_bytes(zlib.compress(struct.pack(">II", a.shape[1], a.shape[0]) + a.tobytes(), 6))


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    cases = []
    kinds = ["plain", "table", "bill", "letter", "photo"]
    for i in range(20):
        rng = random.Random(1000 + i)
        kind = kinds[i % len(kinds)]
        rgb, truth = page(rng, kind)
        route = "camera" if i % 2 else "drive"
        st = rng.choice([0, 0.12, 0.22, 0.3])
        light = rng.uniform(0.05, 0.2) if route == "drive" else rng.uniform(0.15, 0.45)
        tint = rng.choice([(250, 250, 248), (240, 236, 222), (228, 228, 228), (245, 238, 210)])
        img = degrade(rgb, rng, st, light, tint)
        name = f"{i:02d}-{route}-{kind}"
        if route == "camera":
            img, corners = on_table(img, rng)
            (OUT / f"{name}.corners.json").write_text(json.dumps(corners))
        else:
            img = Image.open(__import__("io").BytesIO(_jpeg(img)))  # Drive scans are JPEG pages
        save(f"{name}.in.gz", img)
        save(f"{name}.truth.gz", truth)
        cases.append({"name": name, "route": route, "kind": kind, "showThrough": st, "light": round(light, 2)})
        if i < 2 or i in (7, 11):
            img.convert("RGB").resize((img.width // 4, img.height // 4)).save(OUT.parent / f"peek-{name}.png")
    # Hard cases: things that go wrong in real homes.
    hard = [
        ("shadow", "camera", dict(st=0.15, light=0.2), "letter"),
        ("lighttable", "camera", dict(st=0, light=0.15, table=175), "plain"),
        ("thinpaper", "drive", dict(st=0.4, light=0.1), "bill"),
        ("pencil", "drive", dict(st=0.12, light=0.15, pencil=True), "plain"),
        ("gallery", "gallery", dict(st=0.1, light=0.5), "table"),
        ("darkroom", "camera", dict(st=0.2, light=0.6), "bill"),
        ("finger", "gallery", dict(st=0.1, light=0.2, finger=True), "plain"),
        ("finger2", "camera", dict(st=0.1, light=0.2, finger=True), "letter"),
        ("finger3", "drive", dict(st=0.0, light=0.1, finger=True), "table"),
        ("faded", "drive", dict(st=0.0, light=0.1, ink=150), "bill"),
        ("gray-text", "gallery", dict(st=0.0, light=0.25, ink=120), "plain"),
        ("lowres", "gallery", dict(st=0.05, light=0.2, scale=0.45), "plain"),
        ("narrow-margin", "gallery", dict(st=0.0, light=0.15, crop=70), "table"),
    ]
    for j, (tag, route, o, kind) in enumerate(hard):
        rng = random.Random(5000 + j)
        rgb, truth = page(rng, kind)
        if o.get("pencil"):  # light pencil-like ink: must still print
            a = np.asarray(rgb, dtype=np.float64); a = np.where(a < 128, 85, a)
            rgb = Image.fromarray(a.astype(np.uint8)); truth = rgb.convert("L")
        if o.get("ink"):  # faded receipt / grey print: real text, just light
            a = np.asarray(rgb, dtype=np.float64); a = np.where(a < 128, o["ink"], a)
            rgb = Image.fromarray(a.astype(np.uint8))
        if o.get("finger"):
            rgb = finger(rgb, rng)
        img = degrade(rgb, rng, o["st"], o["light"], (238, 234, 222))
        name = f"h{j}-{route}-{tag}"
        if tag in ("shadow", "darkroom"):
            img = hard_shadow(img, rng)
        if route == "camera":
            img, corners = on_table(img, rng, o.get("table"))
            (OUT / f"{name}.corners.json").write_text(json.dumps(corners))
        if o.get("crop"):  # photo cropped tight: text right at the edge
            c = o["crop"]; img = img.crop((c, c, W - c, H - c)); truth = truth.crop((c, c, W - c, H - c))
        if o.get("scale"):  # small, blurry photo (old phone, WhatsApp-compressed)
            sz = (int(img.width * o["scale"]), int(img.height * o["scale"]))
            img = img.resize(sz, Image.BILINEAR); truth = truth.resize(sz, Image.NEAREST)
        save(f"{name}.in.gz", img)
        save(f"{name}.truth.gz", truth)
        cases.append({"name": name, "route": route, "kind": kind, "showThrough": o["st"], "light": o["light"], "ink": o.get("ink", 0)})
        img.convert("RGB").resize((img.width // 4, img.height // 4)).save(OUT.parent / f"peek-{name}.png")
    (OUT / "cases.json").write_text(json.dumps(cases, indent=1))
    print(len(cases), "cases")

