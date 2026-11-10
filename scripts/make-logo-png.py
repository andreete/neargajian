"""Builds the SentFund logo files from the official artwork (Andre, 10 Nov 2026):
  public/brand/sentfund-logo-source.jpg  the artwork as delivered (white background)
  public/brand/sentfund-logo.png         transparent, trimmed: used by the app header and landing
  src/app/icon.png                       512x512 favicon/app icon: the shield mark only
Only the white that touches the image border becomes transparent (flood fill), so the white
"S" and arrow inside the shield stay white. Anti-aliased edges are un-blended against white.
Run: python3 -I scripts/make-logo-png.py
"""
from collections import deque
from PIL import Image

SRC = "public/brand/sentfund-logo-source.jpg"
WHITE_MIN = 236  # a pixel is "background white" when every channel is at least this


def transparent(img: Image.Image) -> Image.Image:
    img = img.convert("RGB")
    w, h = img.size
    px = img.load()
    bg = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.extend(((x, 0), (x, h - 1)))
    for y in range(h):
        q.extend(((0, y), (w - 1, y)))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if bg[i] or min(px[x, y]) < WHITE_MIN:
            continue
        bg[i] = 1
        if x > 0: q.append((x - 1, y))
        if x < w - 1: q.append((x + 1, y))
        if y > 0: q.append((x, y - 1))
        if y < h - 1: q.append((x, y + 1))
    out = Image.new("RGBA", (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if bg[y * w + x]:
                op[x, y] = (255, 255, 255, 0)
                continue
            near_bg = any(
                0 <= x + dx < w and 0 <= y + dy < h and bg[(y + dy) * w + x + dx]
                for dx in (-2, -1, 0, 1, 2) for dy in (-2, -1, 0, 1, 2)
            )
            if not near_bg:
                op[x, y] = (r, g, b, 255)
                continue
            # Edge pixel blended with the white background: colour-to-alpha against white.
            a = max(255 - r, 255 - g, 255 - b) / 255
            if a <= 0:
                op[x, y] = (255, 255, 255, 0)
                continue
            un = lambda c: max(0, min(255, round((c - 255 * (1 - a)) / a)))
            op[x, y] = (un(r), un(g), un(b), round(a * 255))
    return out


logo = transparent(Image.open(SRC))
logo = logo.crop(logo.getbbox())
logo.save("public/brand/sentfund-logo.png", optimize=True)
print("wrote public/brand/sentfund-logo.png", logo.size)

# Favicon: the shield mark is the left part of the artwork, up to the first gap before "Sent".
alpha = logo.getchannel("A")
w, h = logo.size
col_has_ink = [any(alpha.getpixel((x, y)) > 40 for y in range(0, h, 2)) for x in range(w)]
end = next(x for x in range(int(h * 0.6), w) if not col_has_ink[x])
mark = logo.crop((0, 0, end, h))
mark = mark.crop(mark.getbbox())
side = max(mark.size)
pad = round(side * 0.06)
icon = Image.new("RGBA", (side + 2 * pad, side + 2 * pad), (255, 255, 255, 0))
icon.paste(mark, ((icon.width - mark.width) // 2, (icon.height - mark.height) // 2), mark)
icon = icon.resize((512, 512), Image.LANCZOS)
icon.save("src/app/icon.png", optimize=True)
print("wrote src/app/icon.png", icon.size, "from mark", mark.size)
