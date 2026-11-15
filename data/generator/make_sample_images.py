#!/usr/bin/env python3
"""
Illustrative sample photos for the Image log demo (crew A). Drawn by code, not real patient images.
Output: app/img/samples/*.jpg   Usage: uv run --with pillow python data/generator/make_sample_images.py
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "app", "img", "samples")
W, H = 640, 480
random.seed(7)


def font(size):
    for f in ("/System/Library/Fonts/Supplemental/Arial.ttf", "/Library/Fonts/Arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


def stamp(im, text):
    d = ImageDraw.Draw(im)
    d.rectangle([0, H - 26, W, H], fill=(0, 0, 0))
    d.text((10, H - 22), "ILLUSTRATIVE SAMPLE (drawn by code) · " + text, fill=(255, 255, 255), font=font(14))
    return im


def skin_base():
    im = Image.new("RGB", (W, H), (214, 168, 138))
    px = im.load()
    for y in range(H):
        for x in range(W):
            n = random.randint(-7, 7)
            r, g, b = px[x, y]
            px[x, y] = (r + n, g + n, b + n)
    return im.filter(ImageFilter.GaussianBlur(1.2))


def ruler(d, x0, y0, mm=40, step=8):
    d.rectangle([x0, y0, x0 + mm * step // 2 + 10, y0 + 34], fill=(245, 240, 220), outline=(80, 80, 80))
    for i in range(mm // 2 + 1):
        x = x0 + 5 + i * step
        d.line([x, y0, x, y0 + (16 if i % 5 == 0 else 9)], fill=(30, 30, 30), width=1)
        if i % 10 == 0:
            d.text((x - 4, y0 + 18), f"{i // 10}", fill=(30, 30, 30), font=font(12))
    d.text((x0 + mm * step // 2 - 18, y0 + 18), "cm", fill=(30, 30, 30), font=font(12))


def skin_patch(name, radius, redness, text):
    im = skin_base()
    over = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    o = ImageDraw.Draw(over)
    cx, cy = 330, 210
    for i in range(240):  # irritation: many small red papules in an oval (strap print)
        a, r = random.uniform(0, 2 * math.pi), radius * math.sqrt(random.random())
        x, y = cx + 1.8 * r * math.cos(a), cy + 0.8 * r * math.sin(a)
        s = random.uniform(2, 5)
        o.ellipse([x - s, y - s, x + s, y + s], fill=(190, 60, 60, int(110 * redness)))
    o.ellipse([cx - 1.8 * radius, cy - 0.8 * radius, cx + 1.8 * radius, cy + 0.8 * radius], fill=(200, 80, 80, int(60 * redness)))
    im = Image.alpha_composite(im.convert("RGBA"), over.filter(ImageFilter.GaussianBlur(2))).convert("RGB")
    ruler(ImageDraw.Draw(im), 40, 380)
    return stamp(im, text)


def fundus(name, text):
    im = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(im)
    cx, cy, R = W // 2, (H - 26) // 2, 215
    for r in range(R, 0, -1):  # orange-red retina, darker at the edge
        k = r / R
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(int(205 - 80 * k), int(95 - 50 * k), int(40 - 20 * k)))
    dx, dy = cx + 95, cy  # optic disc with sharp margin (Frisén grade 0)
    d.ellipse([dx - 34, dy - 38, dx + 34, dy + 38], fill=(240, 200, 140))
    d.ellipse([dx - 14, dy - 16, dx + 14, dy + 16], fill=(250, 230, 190))
    for ang, ln in [(110, 230), (-110, 230), (160, 200), (-160, 200), (60, 140), (-60, 140)]:
        pts, x, y, a = [], dx, dy, math.radians(ang + 180)
        for i in range(30):
            a += math.radians(random.uniform(-4, 4))
            x += ln / 30 * math.cos(a); y += ln / 30 * math.sin(a)
            pts.append((x, y))
        d.line([(dx, dy)] + pts, fill=(140, 30, 20), width=5)
        d.line([(dx, dy)] + pts, fill=(170, 45, 30), width=2)
    d.ellipse([cx - 60 - 18, cy - 18, cx - 60 + 18, cy + 18], fill=(150, 60, 25))  # macula
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).ellipse([cx - R, cy - R, cx + R, cy + R], fill=255)
    im = Image.composite(im, Image.new("RGB", (W, H), (0, 0, 0)), mask).filter(ImageFilter.GaussianBlur(1.5))
    return stamp(im, text)


def wound(text):
    im = skin_base()
    d = ImageDraw.Draw(im)
    for k, (cx, cy) in enumerate([(240, 190), (330, 175), (420, 195)]):  # knuckle folds
        d.arc([cx - 50, cy - 30, cx + 50, cy + 30], 200, 340, fill=(170, 120, 95), width=3)
    for i in range(70):  # abrasion: parallel scratches over the middle knuckle
        x = 300 + random.uniform(-40, 40); y = 200 + random.uniform(-14, 14)
        d.line([x, y, x + random.uniform(15, 30), y + random.uniform(-3, 3)], fill=(170, 40, 40), width=2)
    d.ellipse([290, 185, 360, 220], outline=(150, 40, 40), width=2)
    im = im.filter(ImageFilter.GaussianBlur(0.8))
    ruler(ImageDraw.Draw(im), 40, 380)
    return stamp(im, text)


def ultrasound(text):
    im = Image.new("L", (W, H), 0)
    px = im.load()
    ax, ay, R0, R1, half = W // 2, 20, 30, 430, math.radians(36)
    for y in range(H - 26):
        for x in range(W):
            r, a = math.hypot(x - ax, y - ay), math.atan2(x - ax, y - ay)
            if R0 < r < R1 and abs(a) < half:
                v = random.gauss(45, 22)
                ex, ey = (x - ax) / 150, (y - 250) / 85  # kidney: bright capsule, darker cortex, bright sinus
                e = math.hypot(ex, ey)
                if 0.93 < e < 1.05:
                    v += 110
                elif e < 0.93:
                    v -= 10
                    if math.hypot(ex / 1.5, ey * 1.4) < 0.45:
                        v += 70
                v *= 1 - 0.35 * (r - R0) / (R1 - R0)  # depth attenuation
                px[x, y] = max(0, min(255, int(v)))
    im = im.filter(ImageFilter.GaussianBlur(0.9)).convert("RGB")
    d = ImageDraw.Draw(im)
    f = font(14)
    d.text((14, 12), "R KIDNEY  LONG", fill=(220, 220, 220), font=f)
    d.text((W - 150, 12), "5 MHz  D 14 cm", fill=(220, 220, 220), font=f)
    for i in range(0, 15, 2):
        d.line([W - 30, 20 + i * 29, W - 22, 20 + i * 29], fill=(200, 200, 200))
    return stamp(im, text)


def urine(text):
    im = Image.new("RGB", (W, H), (225, 228, 232))
    d = ImageDraw.Draw(im)
    cols = [(250, 248, 210), (250, 240, 170), (245, 225, 120), (235, 200, 70), (215, 165, 40), (190, 130, 30), (160, 100, 25), (130, 80, 20)]
    for i, c in enumerate(cols):  # hydration colour chart (1-3 well hydrated)
        d.rectangle([40 + i * 60, 40, 90 + i * 60, 120], fill=c, outline=(120, 120, 120))
        d.text((60 + i * 60, 126), str(i + 1), fill=(40, 40, 40), font=font(14))
    d.text((40, 150), "1-3 well hydrated · 4-5 drink more · 6-8 dehydrated", fill=(40, 40, 40), font=font(15))
    d.rectangle([250, 210, 390, 400], fill=(248, 244, 200), outline=(140, 140, 140), width=3)  # sample bag, colour 2
    d.rectangle([250, 210, 390, 240], fill=(235, 235, 235), outline=(140, 140, 140), width=3)
    d.line([395, 300, 435, 300], fill=(60, 60, 60), width=2); d.text((440, 290), "≈ 2", fill=(40, 40, 40), font=font(20))
    return stamp(im, text)


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = {
        "skin_d52.jpg": skin_patch("", 46, 1.0, "skin under headband strap, day 52"),
        "skin_d56.jpg": skin_patch("", 30, 0.45, "skin under headband strap, day 56"),
        "eye_d30.jpg": fundus("", "right eye fundus, day 30"),
        "eye_d58.jpg": fundus("", "right eye fundus, day 58"),
        "wound_d44.jpg": wound("ARED knuckle abrasion, day 44"),
        "us_d33.jpg": ultrasound("right kidney ultrasound, day 33"),
        "other_d25.jpg": urine("urine colour vs hydration chart, day 25"),
    }
    for n, im in jobs.items():
        im.save(os.path.join(OUT, n), quality=82)
        print(n, os.path.getsize(os.path.join(OUT, n)) // 1024, "KB")


if __name__ == "__main__":
    main()
