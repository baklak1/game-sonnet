"""Витягує з OSM-вивантаження Києва (BBBike) дороги, залізниці, метро, воду, промзони й парки
і запікає їх у src/data/kyivOsm.ts у світових пікселях. Дані (c) OpenStreetMap contributors, ODbL."""
import json, math, sys
import osmium

LON0, LAT0, X0, Y0 = 30.5234, 50.4501, 350.0, 200.0
KX, KY = 567.1, 889.6
W, H = 640, 576

def proj(lon, lat):
    return (X0 + (lon - LON0) * KX, Y0 - (lat - LAT0) * KY)

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
        return dp(pts[: imax + 1], eps)[:-1] + dp(pts[imax:], eps)
    return [pts[0], pts[-1]]

def area(r):
    s = 0
    for i in range(len(r)):
        x1, y1 = r[i]; x2, y2 = r[(i + 1) % len(r)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2

ROAD = {'motorway': 0, 'motorway_link': 0, 'trunk': 0, 'trunk_link': 0, 'primary': 1, 'primary_link': 1,
        'secondary': 2, 'secondary_link': 2, 'tertiary': 3}

class Hnd(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.roads, self.rails, self.subway, self.stations = [], [], [], []
        self.water, self.industrial, self.green = [], [], []

    def node(self, n):
        t = n.tags
        if t.get('railway') == 'station' and (t.get('station') == 'subway' or t.get('subway') == 'yes'):
            self.stations.append({'name': t.get('name:uk') or t.get('name') or '', 'p': proj(n.location.lon, n.location.lat)})

    def way(self, w):
        t = w.tags
        hw = t.get('highway')
        try:
            pts = [proj(nd.lon, nd.lat) for nd in w.nodes]
        except osmium.InvalidLocationError:
            return
        if hw in ROAD:
            self.roads.append({'c': ROAD[hw], 'b': 1 if t.get('bridge') in ('yes', 'viaduct') else 0, 'n': t.get('name:uk') or t.get('name') or '', 'p': pts})
        rw = t.get('railway')
        if rw == 'rail' and t.get('service') is None and t.get('usage') in (None, 'main', 'branch'):
            self.rails.append(pts)
        if rw == 'subway':
            self.subway.append(pts)

    def area(self, a):
        t = a.tags
        kind = None
        if t.get('natural') == 'water' or t.get('waterway') == 'riverbank' or t.get('landuse') in ('reservoir', 'basin'):
            kind = 'water'
        elif t.get('landuse') == 'industrial':
            kind = 'industrial'
        elif t.get('leisure') == 'park' or t.get('landuse') == 'forest' or t.get('natural') == 'wood':
            kind = 'green'
        if not kind:
            return
        try:
            for outer in a.outer_rings():
                ring = [proj(n.lon, n.lat) for n in outer]
                holes = [[proj(n.lon, n.lat) for n in inner] for inner in a.inner_rings(outer)]
                getattr(self, kind).append((ring, holes))
        except osmium.InvalidLocationError:
            pass

h = Hnd()
h.apply_file(sys.argv[1], locations=True)
print('raw', len(h.roads), 'roads', len(h.rails), 'rails', len(h.subway), 'subway', len(h.stations), 'stations', len(h.water), 'water', len(h.industrial), 'industrial', len(h.green), 'green')

def fmt(r):
    return '[' + ','.join(f'{round(x * 2) / 2:g},{round(y * 2) / 2:g}' for x, y in r) + ']'

def inside(p):
    return -5 <= p[0] <= W + 5 and -5 <= p[1] <= H + 5

out = ['// Згенеровано tools/osm-extract.py з вивантаження BBBike. Дані (c) OpenStreetMap contributors (ODbL).',
       '// Світові пікселі (1 px ~ 125 м). Плоскі масиви [x0,y0,x1,y1,...].']

# дороги: клас, міст, точки
roads = []
for r in h.roads:
    pts = dp(r['p'], 0.45 if r['c'] <= 1 else 0.6)
    if len(pts) < 2 or not any(inside(p) for p in pts):
        continue
    L = sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1))
    if r['c'] == 3 and L < 2.5:
        continue
    roads.append((r['c'], r['b'], pts))
out.append('/** [клас (0 магістраль, 1 головна, 2 вулиця, 3 мала вулиця), міст 0/1, ...точки] */')
out.append('export const OSM_ROADS: number[][] = [')
for c, b, pts in roads:
    out.append(f'  [{c},{b},' + fmt(pts)[1:] + ',')
out.append('];')

rails = [dp(r, 0.6) for r in h.rails]
rails = [r for r in rails if len(r) >= 2]
out.append('export const OSM_RAILS: number[][] = [')
for r in rails:
    out.append('  ' + fmt(r) + ',')
out.append('];')

def dp_ring(ring, eps):
    if len(ring) < 8:
        return ring[:-1] if ring and ring[0] == ring[-1] else ring
    half = len(ring) // 2
    a = dp(ring[: half + 1], eps)
    b = dp(ring[half:], eps)
    out = a[:-1] + b
    if out and out[0] == out[-1]:
        out = out[:-1]
    return out

def polys(lst, min_area, eps):
    res = []
    for ring, holes in lst:
        r = dp_ring(ring, eps)
        if len(r) < 3 or area(r) < min_area or not any(inside(p) for p in r):
            continue
        hs = [dp_ring(hh, eps) for hh in holes]
        hs = [hh for hh in hs if len(hh) >= 3 and area(hh) > 1.5]
        res.append((r, hs))
    return res

for name, lst, mn, eps in [('OSM_WATER', h.water, 1.2, 0.4), ('OSM_INDUSTRIAL', h.industrial, 8, 0.6), ('OSM_GREEN', h.green, 6, 0.6)]:
    ps = polys(lst, mn, eps)
    out.append(f'/** [зовнішнє кільце, ...дірки] */')
    out.append(f'export const {name}: number[][][] = [')
    for r, hs in ps:
        out.append('  [' + ','.join([fmt(r)] + [fmt(hh) for hh in hs]) + '],')
    out.append('];')
    print(name, len(ps))

st = {}
for s in h.stations:
    if s['name'] and s['name'] not in st:
        st[s['name']] = s['p']
out.append('export const OSM_METRO_STATIONS: Record<string, [number, number]> = {')
for n, p in sorted(st.items()):
    out.append(f'  {json.dumps(n, ensure_ascii=False)}: [{round(p[0], 1)}, {round(p[1], 1)}],')
out.append('};')
open('src/data/kyivOsm.ts', 'w').write('\n'.join(out) + '\n')
import os
print('roads', len(roads), 'rails', len(rails), 'stations', len(st), 'bytes', os.path.getsize('src/data/kyivOsm.ts'))
