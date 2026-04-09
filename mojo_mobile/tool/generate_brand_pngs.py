#!/usr/bin/env python3
"""Regenerate placeholder app_icon.png and splash_logo.png (replace with design assets when ready)."""
from __future__ import annotations

import os
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError as e:
    raise SystemExit("Install Pillow: pip install pillow") from e

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "images"


def make_app_icon() -> None:
    s = 1024
    img = Image.new("RGB", (s, s), "#F25129")
    d = ImageDraw.Draw(img)
    inset = 120
    d.rounded_rectangle(
        [inset, inset, s - inset, s - inset],
        radius=180,
        fill="#FFFFFF",
        outline="#8B5CF6",
        width=24,
    )
    try:
        font = ImageFont.truetype("arial.ttf", 260)
    except OSError:
        font = ImageFont.load_default()
    d.text((s // 2, s // 2), "MFM", fill="#F25129", anchor="mm", font=font)
    img.save(OUT / "app_icon.png", "PNG")


def make_splash_logo() -> None:
    s = 512
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([40, 40, s - 40, s - 40], fill=(255, 255, 255, 255), outline=(139, 92, 246, 255), width=12)
    try:
        font = ImageFont.truetype("arial.ttf", 130)
    except OSError:
        font = ImageFont.load_default()
    d.text((s // 2, s // 2), "MFM", fill=(242, 81, 41, 255), anchor="mm", font=font)
    img.save(OUT / "splash_logo.png", "PNG")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    make_app_icon()
    make_splash_logo()
    print(f"Wrote {OUT / 'app_icon.png'} and {OUT / 'splash_logo.png'}")


if __name__ == "__main__":
    main()
