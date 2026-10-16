"""THROWAWAY SPIKE 03 - does the re-feed shift repeat? + 32-step gray calibration.

pass1: three drift scales (A top-right, B bottom-left, C bottom-right) + 32-step gray ramp.
pass2: short lines (4.5 mm) on each scale.   pass3: long lines (8.5 mm) on each scale.
Reuses the drawing helpers from spike 01.
"""
import importlib.util
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

here = Path(__file__).parent
spec = importlib.util.spec_from_file_location("s1", here.parent / "spike-01-paper-test" / "make_sheets.py")
s1 = importlib.util.module_from_spec(spec); spec.loader.exec_module(s1)
px, font, put, hline, vline, reg_block, W, H = s1.px, s1.font, s1.put, s1.hline, s1.vline, s1.reg_block, s1.W, s1.H

BLOCKS = [("A", 150, 4), ("B", 10, 275), ("C", 150, 275)]


def pass_lines(page, ox, oy, length):
    cx, cy = ox + 12, oy + 9
    vline(page, cx, oy + 12.5 - length, oy + 12.5, 0.25)
    hline(page, ox + 31 - length, ox + 31, cy, 0.25)


def make(pass_no):
    page = np.full((H, W), 255, np.uint8)
    text = Image.new("L", (W, H), 255)
    d = ImageDraw.Draw(text)
    if pass_no == 1:
        d.text((px(10), px(9)), "Inkwell spike 03 - pass 1 of 3", font=font(12), fill=0)
        steps = [
            "1. Print this page. 2. Put the SAME sheet back: printed side up, top edge first.",
            "3. Print pass 2. Put it back again the same way. 4. Print pass 3.",
            "5. Photo the sheet. Also tell: first box you can tell apart from box 0 (black),",
            "    and the last box you can tell apart from box 31 (white).",
        ]
        for i, line in enumerate(steps):
            d.text((px(10), px(18 + i * 5)), line, font=font(8), fill=0)
        d.text((px(10), px(52)), "Gray boxes 0 (black) to 31 (white)", font=font(9), fill=0)
        cw, ch = 11.5, 12
        for k in range(32):
            row, col = divmod(k, 16)
            x, y = 10 + col * cw, 58 + row * (ch + 9)
            put(page, np.full((px(ch), px(cw) - px(0.6)), round(k * 255 / 31), np.uint8), x, y)
            d.text((px(x + cw / 2), px(y + ch + 1)), str(k), font=font(7), fill=0, anchor="mt")
        for name, ox, oy in BLOCKS:
            reg_block(page, d, ox, oy, name, 1)
    else:
        for name, ox, oy in BLOCKS:
            pass_lines(page, ox, oy, 4.5 if pass_no == 2 else 8.5)
        d.text((px(10), px(150 + pass_no * 8)), f"P{pass_no}", font=font(8), fill=0)
    return np.minimum(page, np.asarray(text))


if __name__ == "__main__":
    pages = [make(n) for n in (1, 2, 3)]
    for n, p in enumerate(pages, 1):
        s1.write_pdf(p, here / f"pass{n}.pdf")
    both = np.minimum.reduce(pages)
    Image.fromarray(both).resize((W // 4, H // 4), Image.LANCZOS).save(here / "preview-all-passes.png")
    print("ok")
