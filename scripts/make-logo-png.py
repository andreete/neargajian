"""Draws the SentFund logo: public/brand/sentfund-logo.png (transparent, trimmed).

Mark: a navy rounded square with a sky "coin" and a white arrow leaving it (money sent).
Wordmark: "SentFund" in Plus Jakarta Sans ExtraBold (SIL Open Font License, the app's UI font),
navy "Sent" + blue "Fund", and ".my.id" in sky, the palette of src/app/globals.css.
Run: python3 -I scripts/make-logo-png.py <path/to/PlusJakartaSans[wght].ttf>
(the font file from github.com/google/fonts, ofl/plusjakartasans; not committed)."""
import sys
from PIL import Image, ImageDraw, ImageFont

NAVY, BLUE, SKY, WHITE = (10, 60, 144), (37, 119, 254), (87, 181, 253), (255, 255, 255)
S = 4  # supersampling
H = 330 * S

font = ImageFont.truetype(sys.argv[1], 210 * S)
font.set_variation_by_name("ExtraBold")
img = Image.new("RGBA", (2000 * S, H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Mark
m = 300 * S
x0, y0 = 10 * S, (H - m) // 2
d.rounded_rectangle([x0, y0, x0 + m, y0 + m], radius=72 * S, fill=NAVY)
cx, cy, r = x0 + int(m * 0.40), y0 + int(m * 0.60), int(m * 0.19)
d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=SKY)
# arrow from the coin to the top right corner
w = int(m * 0.085)
tip = (x0 + int(m * 0.80), y0 + int(m * 0.20))
start = (cx + int(r * 0.35), cy - int(r * 0.35))
d.line([start, (tip[0] - int(w * 0.9), tip[1] + int(w * 0.9))], fill=WHITE, width=w)
head = int(m * 0.25)
d.polygon([tip, (tip[0] - head, tip[1]), (tip[0], tip[1] + head)], fill=WHITE)

# Wordmark
x = x0 + m + 50 * S
base = H // 2
for text, colour in (("Sent", NAVY), ("Fund", BLUE), (".my.id", SKY)):
    d.text((x, base), text, font=font, fill=colour, anchor="lm")
    x += int(d.textlength(text, font=font))

out = img.crop(img.getbbox())
out = out.resize((out.width // S, out.height // S), Image.LANCZOS)
out.save("public/brand/sentfund-logo.png", optimize=True)
print("wrote public/brand/sentfund-logo.png", out.size)
