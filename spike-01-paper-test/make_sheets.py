"""THROWAWAY SPIKE 01 - paper test for the HP LaserJet Pro MFP M126nw.

Answers three questions before any real build:
  1. Do our dot patterns survive toner + the generic IPP driver? (5 lenses x 3 dot sizes)
  2. Does the phone/laptop print path keep 100% scale? (100 mm rulers)
  3. How far does a re-fed sheet drift? (pass 2 lines land on pass 1 mm scales)

Usage: python make_sheets.py [photo.jpg]   -> pass1.pdf, pass2.pdf, preview PNGs
Pages are 600 dpi grayscale rasters wrapped in a hand-written PDF (lossless Flate),
so no library resamples or JPEG-blurs the dots.
"""
import sys, zlib
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

DPI = 600
MM = DPI / 25.4
W, H = round(210 * MM), round(297 * MM)
OUT = Path(__file__).parent
PHOTO = sys.argv[1] if len(sys.argv) > 1 else r"C:\Windows\Web\Wallpaper\ThemeC\img28.jpg"
COLORFUL = r"C:\Windows\Web\Wallpaper\ThemeB\img24.jpg"


def px(mm):
    return round(mm * MM)


def font(pt):
    return ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf", round(pt / 72 * DPI))


def fit(img, w, h):
    """Center-crop to w:h then resize."""
    iw, ih = img.size
    if iw / ih > w / h:
        nw = round(ih * w / h); img = img.crop(((iw - nw) // 2, 0, (iw - nw) // 2 + nw, ih))
    else:
        nh = round(iw * h / w); img = img.crop((0, (ih - nh) // 2, iw, (ih - nh) // 2 + nh))
    return img.resize((w, h), Image.LANCZOS)


# ---------- colour -> gray ----------
def naive_gray(rgb):
    return np.asarray(rgb.convert("L"), dtype=np.float64) / 255


def smart_gray(rgb):
    """Lab lightness + the main colour axis, so different hues stop collapsing to one gray."""
    a = np.asarray(rgb, dtype=np.float64) / 255
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    xyz = lin @ np.array([[0.4124, 0.2126, 0.0193], [0.3576, 0.7152, 0.1192], [0.1805, 0.0722, 0.9505]])
    f = lambda t: np.where(t > 0.008856, np.cbrt(t), 7.787 * t + 16 / 116)
    fx, fy, fz = f(xyz[..., 0] / 0.9505), f(xyz[..., 1]), f(xyz[..., 2] / 1.089)
    L, A, B = 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)
    ab = np.stack([A.ravel(), B.ravel()], 1)
    axis = np.linalg.eigh(np.cov(ab.T))[1][:, -1]          # strongest colour direction
    proj = (ab @ axis).reshape(L.shape)
    if np.corrcoef(proj.ravel(), L.ravel())[0, 1] < 0:
        proj = -proj
    g = L + 0.5 * proj
    g = (g - np.percentile(g, 0.5)) / (np.percentile(g, 99.5) - np.percentile(g, 0.5))
    return np.clip(g, 0, 1)


# ---------- lenses: gray (0 black..1 white) -> uint8 page pixels ----------
def at_scale(g, s, fn):
    h, w = g.shape
    small = np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((max(1, w // s), max(1, h // s)), Image.LANCZOS)) / 255
    out = fn(small).repeat(s, 0).repeat(s, 1)
    return np.pad(out, ((0, max(0, h - out.shape[0])), (0, max(0, w - out.shape[1]))), constant_values=255)[:h, :w]


def plain(g, s):
    return (g * 255).astype(np.uint8)


def diffusion(g, s):
    return at_scale(g, s, lambda x: np.asarray(Image.fromarray((x * 255).astype(np.uint8)).convert("1"), dtype=np.uint8) * 255)


BAYER = np.array([[0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26], [12, 44, 4, 36, 14, 46, 6, 38],
                  [60, 28, 52, 20, 62, 30, 54, 22], [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
                  [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21]]) / 64 + 1 / 128


def ordered(g, s):
    def fn(x):
        h, w = x.shape
        t = np.tile(BAYER, (h // 8 + 1, w // 8 + 1))[:h, :w]
        return np.where(x > t, 255, 0).astype(np.uint8)
    return at_scale(g, s, fn)


def dots(g, s):
    cell = {1: 6, 2: 9, 4: 13}[s]                       # 100 / 67 / 46 lines per inch, 45 degrees
    h, w = g.shape
    y, x = np.mgrid[0:h, 0:w]
    u, v = (x + y) / (cell * 1.4142), (x - y) / (cell * 1.4142)
    spot = 0.5 - (np.cos(2 * np.pi * u) + np.cos(2 * np.pi * v)) / 4
    return np.where(spot < 1 - g, 0, 255).astype(np.uint8)


def lines(g, s):
    pitch = {1: 12, 2: 19, 4: 28}[s]                    # 0.5 / 0.8 / 1.2 mm engraving lines
    h, w = g.shape
    y = np.mgrid[0:h, 0:w][0]
    d = np.abs((y % pitch) / pitch - 0.5) * 2
    return np.where(d < 1 - g, 0, 255).astype(np.uint8)


LENSES = [("Plain gray (printer decides)", plain), ("Diffusion / stipple", diffusion),
          ("Ordered pattern", ordered), ("Halftone dots", dots), ("Engraving lines", lines)]
SIZES = [(1, "fine"), (2, "medium"), (4, "coarse")]


# ---------- drawing helpers ----------
def put(page, arr, x_mm, y_mm):
    x, y = px(x_mm), px(y_mm)
    page[y:y + arr.shape[0], x:x + arr.shape[1]] = arr


def hline(page, x0, x1, y, t=0.15):
    page[px(y - t / 2):px(y + t / 2) + 1, px(x0):px(x1)] = 0


def vline(page, x, y0, y1, t=0.15):
    page[px(y0):px(y1), px(x - t / 2):px(x + t / 2) + 1] = 0


def ruler(page, d, x0, y0, length, vertical=False):
    for i in range(length + 1):
        tick = 3 if i % 10 == 0 else (2 if i % 5 == 0 else 1.2)
        if vertical:
            hline(page, x0, x0 + tick, y0 + i)
        else:
            vline(page, x0 + i, y0, y0 + tick)
    if vertical:
        vline(page, x0, y0, y0 + length)
        d.text((px(x0 + 3.5), px(y0 + length / 2)), f"{length} mm", font=font(6), fill=0, anchor="lm")
    else:
        hline(page, x0, x0 + length, y0)
        d.text((px(x0 + length + 2), px(y0 + 1.5)), f"<- must measure exactly {length} mm", font=font(6), fill=0, anchor="lm")


def reg_block(page, d, ox, oy, name, pass_no):
    """Pass 1: two mm scales (-5..+5). Pass 2: one line across each. Read where it lands."""
    cx, cy = ox + 12, oy + 9
    if pass_no == 1:
        d.text((px(ox), px(oy)), f"Drift check {name}", font=font(6), fill=0)
        for i in range(-5, 6):
            tick = 3 if i in (-5, 0, 5) else 1.8
            vline(page, cx + i, oy + 12 - tick, oy + 12)
            hline(page, ox + 30 - tick, ox + 30, cy + i)
        hline(page, cx - 5, cx + 5, oy + 12); vline(page, ox + 30, cy - 5, cy + 5)
        d.text((px(cx), px(oy + 13)), "X: left -5 ... 0 ... +5 right", font=font(5), fill=0, anchor="mt")
        d.text((px(ox + 31), px(cy)), "Y", font=font(5), fill=0, anchor="lm")
    else:
        vline(page, cx, oy + 6, oy + 12.5, 0.25)
        hline(page, ox + 26, ox + 31, cy, 0.25)


def mystery(page, rgb, x0, y0, pass_no):
    w_mm, h_mm, n, gut = 56, 30, 4, 1.0
    g = smart_gray(fit(rgb, px(w_mm), px(h_mm)))
    art = diffusion(g, 2)
    tw, th = (w_mm - gut * (n - 1)) / n, (h_mm - gut * (n - 1)) / n
    for i in range(n):
        for j in range(n):
            if (i + j) % 2 == pass_no - 1:
                sx, sy = px(j * (tw + gut)), px(i * (th + gut))
                tile = art[sy:sy + px(th), sx:sx + px(tw)]
                put(page, tile, x0 + j * (tw + gut), y0 + i * (th + gut))


def hatch_strip(page, d, x0, y0):
    w_, h_ = 8.5, 18
    pats = ["solid", "diag /", "diag \\", "cross", "dots", "vertical"]
    for k, name in enumerate(pats):
        sw = np.full((px(h_), px(w_)), 255, np.uint8)
        y, x = np.mgrid[0:sw.shape[0], 0:sw.shape[1]]
        p = px(1.2)
        mask = {"solid": np.ones_like(x, bool), "diag /": (x + y) % p < px(0.35), "diag \\": (x - y) % p < px(0.35),
                "cross": ((x + y) % p < px(0.3)) | ((x - y) % p < px(0.3)),
                "dots": ((x % p - p / 2) ** 2 + (y % p - p / 2) ** 2) < px(0.3) ** 2, "vertical": x % p < px(0.35)}[name]
        sw[mask] = 0
        put(page, sw, x0 + k * (w_ + 1.5), y0)
        d.text((px(x0 + k * (w_ + 1.5) + w_ / 2), px(y0 + h_ + 1)), name, font=font(5), fill=0, anchor="mt")


# ---------- pages ----------
def make(pass_no, photo, colorful):
    page = np.full((H, W), 255, np.uint8)             # rasters go here
    text = Image.new("L", (W, H), 255)                 # words go here, merged at the end
    d = ImageDraw.Draw(text)
    if pass_no == 1:
        d.text((px(10), px(9)), "Inkwell paper test - pass 1 of 2", font=font(12), fill=0)
        d.text((px(10), px(15)), "Print at 100% / Actual size. Throwaway spike, nothing here is final.", font=font(7), fill=0)
        tw, th = 58, 34
        grays = naive_gray(fit(photo, px(tw), px(th)))
        for c, (s, sname) in enumerate(SIZES):
            d.text((px(10 + c * 60 + tw / 2), px(30)), sname, font=font(8), fill=0, anchor="mm")
        for r, (lname, fn) in enumerate(LENSES):
            y = 33 + r * 38
            d.text((px(10), px(y)), f"{r + 1}. {lname}", font=font(7), fill=0)
            for c, (s, sname) in enumerate(SIZES):
                tile = fn(grays, s)
                put(page, tile, 10 + c * 60, y + 3.5)
                d.text((px(10 + c * 60 + tw), px(y)), f"toner {100 * (1 - tile.mean() / 255):.0f}%", font=font(6), fill=0, anchor="ra")
        ramp = np.repeat(np.repeat(np.linspace(0, 1, 16), px(178) // 16)[None, :], px(6), 0)
        d.text((px(10), px(225)), "Gray steps: count how many you can tell apart (plain / diffusion)", font=font(7), fill=0)
        put(page, plain(ramp, 1), 10, 228.5)
        put(page, diffusion(ramp, 1), 10, 235.5)
        ruler(page, d, 10, 20.5, 100)
        ruler(page, d, 193, 30, 100, vertical=True)
        cw, ch = 30, 26
        d.text((px(10), px(244)), "Colour: normal vs smart gray", font=font(7), fill=0)
        put(page, plain(naive_gray(fit(colorful, px(cw), px(ch))), 1), 10, 247)
        put(page, plain(smart_gray(fit(colorful, px(cw), px(ch))), 1), 42, 247)
        d.text((px(76), px(244)), "Chart-safe patterns", font=font(7), fill=0)
        hatch_strip(page, d, 76, 247)
    else:
        d.text((px(193), px(140)), "P2", font=font(7), fill=0)   # only lands in empty space
    if pass_no == 1:
        d.text((px(142), px(244)), "Mystery: half now, half on pass 2", font=font(6), fill=0)
    reg_block(page, d, 150, 4, "A", pass_no)
    reg_block(page, d, 10, 275, "B", pass_no)
    mystery(page, photo, 142, 247, pass_no)
    return np.minimum(page, np.asarray(text))


def write_pdf(page, path):
    h, w = page.shape
    data = zlib.compress(page.tobytes(), 9)
    content = b"q 595.276 0 0 841.89 0 0 cm /Im0 Do Q"
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>",
            b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.276 841.89] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>",
            b"<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceGray /BitsPerComponent 8 /Interpolate false /Filter /FlateDecode /Length %d >>\nstream\n" % (w, h, len(data)) + data + b"\nendstream",
            b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream"]
    out, offs = bytearray(b"%PDF-1.4\n"), []
    for i, o in enumerate(objs, 1):
        offs.append(len(out)); out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1) + b"".join(b"%010d 00000 n \n" % o for o in offs)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    path.write_bytes(out)


if __name__ == "__main__":
    photo, colorful = (Image.open(p).convert("RGB") for p in (PHOTO, COLORFUL))
    p1, p2 = make(1, photo, colorful), make(2, photo, colorful)
    assert p1.shape == (W, H)[::-1] and abs(px(100) - 100 * DPI / 25.4) < 1   # page is A4 @600dpi, ruler is true mm
    write_pdf(p1, OUT / "pass1.pdf"); write_pdf(p2, OUT / "pass2.pdf")
    both = np.minimum(p1, p2)
    for name, arr in [("preview-pass1.png", p1), ("preview-both-passes.png", both)]:
        Image.fromarray(arr).resize((W // 4, H // 4), Image.LANCZOS).save(OUT / name)
    print("ok", W, H)
