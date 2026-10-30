"""Генерує піксельну іконку застосунку (24x24, масштаб найближчим сусідом) у mipmap-*."""
import os
from PIL import Image

ROWS = [
    "........................",
    "..BBBBBBBBBBBBBBBBBBBB..",
    ".BBBBBBBBBBBBBBBBBBBBBB.",
    ".BBBBBBBBBkkkkkBBBBBBBB.",
    ".BBBBBBBkkyyyyykkBBBBBB.",
    ".BBBBBBkyyywwyyyykBBBBB.",
    ".BBBBBkyyywwyyyyyykBBBB.",
    ".BBBBBkyyywyyyyyyykBBBB.",
    ".BBBBkyyyyyyyyyyyyykBBB.",
    ".BBBBkyyyyyyyyyyyyykBBB.",
    ".BBBBkyyyyyyoyyyyyykBBB.",
    ".BBBBkyyyyyooyyyyyykBBB.",
    ".YYYYYkyyyoooooyyykYYYY.",
    ".YYYYYkyyyyyoyyyyykYYYY.",
    ".YYYYYYkyyyoyyyyykYYYYY.",
    ".YYYYYYYkyyoyyyykYYYYYY.",
    ".YYYYYYYYkyyyyykYYYYYYY.",
    ".YYYYYYYYklllllkYYYYYYY.",
    ".YYYYYYYYkgggggkYYYYYYY.",
    ".YYYYYYYYklllllkYYYYYYY.",
    ".YYYYYYYYkgggggkYYYYYYY.",
    ".YYYYYYYYYkkkkkYYYYYYYY.",
    "..YYYYYYYYYYYYYYYYYYYY..",
    "........................",
]
PAL = {
    '.': (0, 0, 0, 0), 'B': (0, 87, 183, 255), 'Y': (255, 212, 0, 255), 'k': (17, 19, 26, 255),
    'y': (255, 230, 110, 255), 'w': (255, 252, 230, 255), 'o': (255, 140, 66, 255),
    'l': (190, 196, 208, 255), 'g': (110, 116, 130, 255),
}

def make(scale):
    n = len(ROWS)
    img = Image.new('RGBA', (n, n))
    for y, row in enumerate(ROWS):
        for x, ch in enumerate(row):
            img.putpixel((x, y), PAL[ch])
    return img.resize((n * scale, n * scale), Image.NEAREST)

sizes = {'mdpi': 2, 'hdpi': 3, 'xhdpi': 4, 'xxhdpi': 6, 'xxxhdpi': 8}
for name, sc in sizes.items():
    d = f'android/app/src/main/res/mipmap-{name}'
    os.makedirs(d, exist_ok=True)
    make(sc).save(f'{d}/ic_launcher.png')
os.makedirs('release', exist_ok=True)
make(21).resize((512, 512), Image.NEAREST).save('release/icon-512.png')
print('icons ok')
