"""Turns the rarity badge pictures (white background) into transparent PNGs.

Usage: python3 scripts/rarity-badges.py <folder with the original PNGs> src/assets/rarities
The white around the badge is removed by flood fill from the borders, so white
letters inside the badge stay. Edge pixels get a matching partial transparency.
"""
import re
import sys
from collections import deque
from pathlib import Path

from PIL import Image

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower().replace("'", "")).strip("-")


def near_white(pixel, limit=232):
    r, g, b, a = pixel
    return a < 10 or min(r, g, b) >= limit


for path in sorted(src.glob("*.png")):
    image = Image.open(path).convert("RGBA")
    w, h = image.size
    px = image.load()
    background = [[False] * w for _ in range(h)]
    queue = deque((x, y) for x in range(w) for y in (0, h - 1)) 
    queue.extend((x, y) for y in range(h) for x in (0, w - 1))
    while queue:
        x, y = queue.popleft()
        if not (0 <= x < w and 0 <= y < h) or background[y][x] or not near_white(px[x, y]):
            continue
        background[y][x] = True
        queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    result = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    rp = result.load()
    for y in range(h):
        for x in range(w):
            if background[y][x]:
                continue
            r, g, b, _ = px[x, y]
            touches = any(
                0 <= x + dx < w and 0 <= y + dy < h and background[y + dy][x + dx]
                for dx in (-1, 0, 1)
                for dy in (-1, 0, 1)
            )
            if not touches:
                rp[x, y] = (r, g, b, 255)
                continue
            # Anti-aliased edge: unmix from white using the nearest solid badge colour.
            base = None
            for radius in (2, 3, 4):
                candidates = [
                    px[x + dx, y + dy]
                    for dx in range(-radius, radius + 1)
                    for dy in range(-radius, radius + 1)
                    if 0 <= x + dx < w and 0 <= y + dy < h and not background[y + dy][x + dx] and min(px[x + dx, y + dy][:3]) < 200
                ]
                if candidates:
                    base = sorted(candidates, key=lambda c: sum(c[:3]))[len(candidates) // 2]
                    break
            if base is None:
                rp[x, y] = (r, g, b, 255)
                continue
            alphas = [(255 - c) / max(1, 255 - bc) for c, bc in zip((r, g, b), base[:3]) if 255 - bc > 30]
            alpha = max(0.0, min(1.0, sum(alphas) / len(alphas))) if alphas else 1.0
            rp[x, y] = (*base[:3], round(alpha * 255))

    box = result.getbbox()
    if box:
        result = result.crop(box)
    target = out / f"{slug(path.stem)}.png"
    result.save(target, optimize=True)
    print(f"{path.name:36} -> {target.name} {result.size}")
