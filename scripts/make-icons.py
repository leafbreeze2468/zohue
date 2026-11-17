"""產生 PWA 圖示（PNG）。圖形與 src/icons.js 的 LOGO 相同：兩個杯子輕碰。
執行：python scripts/make-icons.py（需要 Pillow），輸出到 public/。
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

BG = (245, 235, 223)      # --milk-soft
INK = (156, 106, 58)      # --milk
OUT = Path(__file__).resolve().parent.parent / 'public'
N = 2048                  # 先畫大圖再縮小，邊緣比較平滑


def rotate(points, deg, cx, cy):
    r = math.radians(deg)
    return [(cx + (x - cx) * math.cos(r) - (y - cy) * math.sin(r),
             cy + (x - cx) * math.sin(r) + (y - cy) * math.cos(r)) for x, y in points]


def strokes(scale):
    """回傳 (折線點列, 是否閉合) 清單，座標是 Logo 的 48×48 viewBox"""
    out = []
    for sign, x0, cx in ((-1, 9, 16), (1, 25, 32)):
        cup = [(x0, 16), (x0 + 14, 16), (x0 + 12.4, 38), (x0 + 1.6, 38)]
        lid = [(x0 - 1, 16), (x0 + 15, 16)]
        straw = [(x0 + 8, 16), (x0 + 11, 9)] if sign < 0 else [(x0 + 6, 16), (x0 + 3, 9)]
        for pts, closed in ((cup, True), (lid, False), (straw, False)):
            out.append((rotate(pts, 14 * sign, cx, 28), closed))
    for pts in ([(24, 6), (24, 3)], [(19.5, 7.5), (18, 5.5)], [(28.5, 7.5), (30, 5.5)]):
        out.append((pts, False))
    return out


def draw(content_ratio):
    img = Image.new('RGB', (N, N), BG)
    d = ImageDraw.Draw(img)
    s = N * content_ratio / 38          # 圖形約 38 單位寬
    ox, oy = N / 2 - 24 * s, N / 2 - 21.5 * s
    w = round(2.4 * s)
    for pts, closed in strokes(s):
        p = [(ox + x * s, oy + y * s) for x, y in pts]
        if closed:
            p.append(p[0])
        d.line(p, fill=INK, width=w, joint='curve')
        for x, y in p:                  # 圓頭
            d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=INK)
    return img


def save(img, size, name):
    img.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)


regular = draw(0.62)
maskable = draw(0.48)   # Android 會裁成圓形或圓角，圖形要留在中間 80% 的安全區
save(regular, 192, 'icon-192.png')
save(regular, 512, 'icon-512.png')
save(maskable, 512, 'icon-maskable-512.png')
save(regular, 180, 'apple-touch-icon.png')
print('icons written to', OUT)
