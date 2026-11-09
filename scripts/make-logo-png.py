"""Derives public/brand/gajian-logo-trim.png from the original JPEG: near-white background
made transparent (soft edge), then trimmed to the artwork. Run: python3 -I scripts/make-logo-png.py"""
from PIL import Image

src = Image.open("public/brand/gajian-logo.jpeg").convert("RGB")
out = Image.new("RGBA", src.size)
px_in, px_out = src.load(), out.load()
for y in range(src.height):
    for x in range(src.width):
        r, g, b = px_in[x, y]
        lightness = min(r, g, b)
        # Pixels close to white become transparent; anti-aliased edges keep partial alpha.
        alpha = 255 if lightness < 200 else max(0, int(255 * (245 - lightness) / 45))
        px_out[x, y] = (r, g, b, alpha)
bbox = out.getbbox()
out.crop(bbox).save("public/brand/gajian-logo-trim.png", optimize=True)
print("trimmed to", out.crop(bbox).size)
