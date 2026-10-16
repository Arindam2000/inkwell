"""THROWAWAY SPIKE 02 - can Inkwell make a Google Drive scan print cleaner and cheaper?

Steps: smart gray -> flatten paper to pure white (kills gray tint + show-through) -> keep ink dark.
Usage: python clean.py scan.pdf  -> before/after PNG per page + toner % for each.
"""
import sys
from pathlib import Path
import numpy as np
import pypdfium2 as pdfium
from PIL import Image, ImageFilter

OUT = Path(__file__).parent


def clean(rgb):
    g = np.asarray(rgb.convert("L"), dtype=np.float64)
    # paper brightness map: blur away text, so uneven light/shadow becomes a smooth background
    small = rgb.convert("L").resize((rgb.width // 8, rgb.height // 8))
    bg = small.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(6)).resize(rgb.size)
    flat = np.clip(g / np.maximum(np.asarray(bg, dtype=np.float64), 1) * 255, 0, 255)
    # levels: anything lighter than 82% of paper -> pure white (gray tint, show-through), ink -> darker
    WHITE, BLACK = 0.82 * 255, 0.35 * 255   # calibration knobs, tune on real prints
    out = np.clip((flat - BLACK) / (WHITE - BLACK), 0, 1) * 255
    return out.astype(np.uint8)


def toner(gray_u8):
    return 100 * (1 - gray_u8.mean() / 255)


if __name__ == "__main__":
    doc = pdfium.PdfDocument(sys.argv[1])
    for i, page in enumerate(doc):
        rgb = page.render(scale=260 / 72).to_pil().convert("RGB")
        before = np.asarray(rgb.convert("L"))
        after = clean(rgb)
        print(f"page {i + 1}: toner as-is {toner(before):.1f}%  ->  cleaned {toner(after):.1f}%")
        pair = Image.new("L", (rgb.width * 2 + 40, rgb.height), 255)
        pair.paste(Image.fromarray(before), (0, 0)); pair.paste(Image.fromarray(after), (rgb.width + 40, 0))
        pair.resize((pair.width // 3, pair.height // 3), Image.LANCZOS).save(OUT / f"before-after-p{i + 1}.png")
