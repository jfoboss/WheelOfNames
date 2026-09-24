#!/usr/bin/env python3
"""Генерирует иконки PWA (PNG + SVG) в app/icons. Нужен Pillow: pip install pillow"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "app" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

PALETTE = ["#2F5DE0", "#FFC21A", "#E4572E", "#16A08F", "#7B4FD8", "#F08A24"]
INK = "#18213A"
RIM = "#FFFFFF"
HUB = "#FFC21A"
SS = 4  # суперсэмплинг для сглаживания


def draw_wheel(size, wheel_frac, bg_radius_frac, full_bleed=False):
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if full_bleed:
        d.rectangle([0, 0, S, S], fill=INK)
    else:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * bg_radius_frac), fill=INK)
    cy = S / 2
    cx = S / 2 - S * 0.02  # чуть влево, чтобы поместился указатель
    r = S * wheel_frac
    rim = max(2, S * 0.018)
    d.ellipse([cx - r - rim, cy - r - rim, cx + r + rim, cy + r + rim], fill=RIM)
    for i, col in enumerate(PALETTE):
        a0 = i * 60 - 90
        d.pieslice([cx - r, cy - r, cx + r, cy + r], a0, a0 + 60, fill=col)
    hr = r * 0.22
    d.ellipse([cx - hr - rim, cy - hr - rim, cx + hr + rim, cy + hr + rim], fill=RIM)
    d.ellipse([cx - hr, cy - hr, cx + hr, cy + hr], fill=HUB)
    # указатель справа, смотрит влево
    tip_x = cx + r * 0.86
    base_x = cx + r + S * 0.075
    hh = r * 0.17
    d.polygon([(tip_x, cy), (base_x, cy - hh), (base_x, cy + hh)], fill=RIM)
    return img.resize((size, size), Image.LANCZOS)


def svg():
    cx, cy, r = 30.7, 32, 24
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
        f'<rect width="64" height="64" rx="14" fill="{INK}"/>',
        f'<circle cx="{cx}" cy="{cy}" r="{r + 1.2}" fill="{RIM}"/>',
    ]
    for i, col in enumerate(PALETTE):
        a0 = math.radians(i * 60 - 90)
        a1 = math.radians(i * 60 - 30)
        x0, y0 = cx + r * math.cos(a0), cy + r * math.sin(a0)
        x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
        parts.append(f'<path d="M{cx} {cy}L{x0:.2f} {y0:.2f}A{r} {r} 0 0 1 {x1:.2f} {y1:.2f}Z" fill="{col}"/>')
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r * 0.22 + 1.2:.2f}" fill="{RIM}"/>')
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r * 0.22:.2f}" fill="{HUB}"/>')
    parts.append(
        f'<path d="M{cx + r * 0.86:.2f} {cy}L{cx + r + 4.8:.2f} {cy - r * 0.17:.2f}'
        f'V{cy + r * 0.17:.2f}Z" fill="{RIM}"/>'
    )
    parts.append("</svg>")
    return "".join(parts)


if __name__ == "__main__":
    draw_wheel(192, 0.36, 0.22).save(OUT / "icon-192.png", optimize=True)
    draw_wheel(512, 0.36, 0.22).save(OUT / "icon-512.png", optimize=True)
    # maskable: фон до краёв, колесо внутри безопасной зоны (круг 80%)
    draw_wheel(512, 0.30, 0, full_bleed=True).save(OUT / "icon-maskable-512.png", optimize=True)
    # apple-touch-icon: iOS сам скругляет углы, поэтому фон до краёв
    draw_wheel(180, 0.34, 0, full_bleed=True).convert("RGB").save(OUT / "apple-touch-icon.png", optimize=True)
    (OUT / "favicon.svg").write_text(svg(), encoding="utf-8")
    print("icons ->", OUT)
