"""Перетворює кеш OSM (tools/geo-cache) у src/data/kyivGeo.ts у світових пікселях.
Проєкція: 1 px ~ 125 м, центр Києва (30.5234, 50.4501) -> (350, 200).
Дані (c) OpenStreetMap contributors, ODbL."""
import json, math, os, sys

W, H = 640, 576
LON0, LAT0, X0, Y0 = 30.5234, 50.4501, 350.0, 200.0
KX, KY = 567.1, 889.6

def proj(lon, lat):
    return (X0 + (lon - LON0) * KX, Y0 - (lat - LAT0) * KY)

def load(key):
    d = json.load(open(f'tools/geo-cache/{key}.json'))
    return d[0]['geojson']

def rings_of(geo):
    if geo['type'] == 'Polygon':
        return [geo['coordinates']]
    if geo['type'] == 'MultiPolygon':
        return geo['coordinates']
    raise ValueError(geo['type'])

def dp(pts, eps):
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy) or 1e-9
    imax, dmax = 0, -1
    for i in range(1, len(pts) - 1):
        x, y = pts[i]
        d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / L
        if d > dmax:
            imax, dmax = i, d
    if dmax > eps:
        a = dp(pts[: imax + 1], eps)
        b = dp(pts[imax:], eps)
        return a[:-1] + b
    return [pts[0], pts[-1]]

def simplify_ring(ring, eps):
    pts = [proj(*p) for p in ring]
    # закрите кільце: розбиваємо на дві половини, щоб DP не вироджувався
    n = len(pts)
    if n < 8:
        return pts
    half = n // 2
    a = dp(pts[: half + 1], eps)
    b = dp(pts[half:], eps)
    out = a[:-1] + b[:-1]
    return out

def clip(ring, xmin, ymin, xmax, ymax):
    def clip_edge(pts, inside, inter):
        out = []
        if not pts:
            return out
        prev = pts[-1]
        for cur in pts:
            if inside(cur):
                if not inside(prev):
                    out.append(inter(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(inter(prev, cur))
            prev = cur
        return out
    def ix(x):
        return lambda p, q: (x, p[1] + (q[1] - p[1]) * (x - p[0]) / (q[0] - p[0]))
    def iy(y):
        return lambda p, q: (p[0] + (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]), y)
    pts = ring
    pts = clip_edge(pts, lambda p: p[0] >= xmin, ix(xmin))
    pts = clip_edge(pts, lambda p: p[0] <= xmax, ix(xmax))
    pts = clip_edge(pts, lambda p: p[1] >= ymin, iy(ymin))
    pts = clip_edge(pts, lambda p: p[1] <= ymax, iy(ymax))
    return pts

def area(r):
    s = 0
    for i in range(len(r)):
        x1, y1 = r[i]; x2, y2 = r[(i + 1) % len(r)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2

def fmt(r):
    return '[' + ','.join(f'{round(x*2)/2:g},{round(y*2)/2:g}' for x, y in r) + ']'

DISTRICTS = [
    ('obolonskyi', 'Оболонський'), ('podilskyi', 'Подільський'), ('shevchenkivskyi', 'Шевченківський'),
    ('pecherskyi', 'Печерський'), ('holosiivskyi', 'Голосіївський'), ('solomianskyi', "Солом'янський"),
    ('sviatoshynskyi', 'Святошинський'), ('desnianskyi', 'Деснянський'), ('dniprovskyi', 'Дніпровський'),
    ('darnytskyi', 'Дарницький'),
]

out = ['// Згенеровано tools/geo-bake.py з даних (c) OpenStreetMap contributors (ODbL).',
       '// Координати у світових пікселях (1 px ~ 125 м). Плоскі масиви [x0,y0,x1,y1,...].',
       'export const WORLD_W = 640;', 'export const WORLD_H = 576;']

city = rings_of(load('kyiv'))
city_ring = max((simplify_ring(p[0], 0.7) for p in city), key=area)
out.append(f'export const CITY: number[] = {fmt(city_ring)};')

out.append('export const DISTRICT_POLYS: Record<string, number[]> = {')
for key, name in DISTRICTS:
    polys = rings_of(load(key))
    ring = max((simplify_ring(p[0], 0.6) for p in polys), key=area)
    out.append(f'  {key}: {fmt(ring)},')
out.append('};')

water = []
islands = []
for key in ('kyivReservoir', 'kanivReservoir'):
    for poly in rings_of(load(key)):
        outer = clip(simplify_ring(poly[0], 0.5), -8, -8, W + 8, H + 8)
        if len(outer) >= 3 and area(outer) > 6:
            water.append(outer)
        for hole in poly[1:]:
            h = clip(simplify_ring(hole, 0.5), -8, -8, W + 8, H + 8)
            if len(h) >= 3 and area(h) > 3:
                islands.append(h)
out.append('export const WATER: number[][] = [')
for r in water:
    out.append('  ' + fmt(r) + ',')
out.append('];')
out.append('export const ISLANDS: number[][] = [')
for r in islands:
    out.append('  ' + fmt(r) + ',')
out.append('];')

open('src/data/kyivGeo.ts', 'w').write('\n'.join(out) + '\n')
print('water rings', len(water), 'islands', len(islands), 'bytes', os.path.getsize('src/data/kyivGeo.ts'))

# превʼю
from PIL import Image, ImageDraw
img = Image.new('RGB', (W, H), (40, 60, 40))
d = ImageDraw.Draw(img)
for r in water:
    d.polygon(r, fill=(40, 90, 150))
for r in islands:
    d.polygon(r, fill=(60, 100, 60))
cols = [(200,80,80),(80,200,80),(80,80,200),(200,200,80),(200,80,200),(80,200,200),(220,140,60),(140,60,220),(60,220,140),(220,220,220)]
for i, (key, name) in enumerate(DISTRICTS):
    polys = rings_of(load(key))
    ring = max((simplify_ring(p[0], 0.6) for p in polys), key=area)
    d.polygon(ring, outline=cols[i])
d.polygon(city_ring, outline=(255, 255, 255))
img = img.resize((W * 2, H * 2), Image.NEAREST)
img.save('tools/out/geo-preview.png')
