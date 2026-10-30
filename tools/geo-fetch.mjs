// Тягне полігони районів Києва та водойм з OSM (Nominatim), кешує сирі відповіді.
// Дані © OpenStreetMap contributors (ODbL).
import fs from 'node:fs';
import path from 'node:path';

const CACHE = path.resolve('tools/geo-cache');
fs.mkdirSync(CACHE, { recursive: true });
const UA = 'svitlo-ye-game-dev/1.0 (hobby game; contact via github baklak1)';

const queries = {
  kyiv: 'q=Київ&featuretype=city',
  obolonskyi: 'q=Оболонський район, Київ',
  podilskyi: 'q=Подільський район, Київ',
  shevchenkivskyi: 'q=Шевченківський район, Київ',
  pecherskyi: 'q=Печерський район, Київ',
  holosiivskyi: 'q=Голосіївський район, Київ',
  solomianskyi: "q=Солом'янський район, Київ",
  sviatoshynskyi: 'q=Святошинський район, Київ',
  desnianskyi: 'q=Деснянський район, Київ',
  dniprovskyi: 'q=Дніпровський район, Київ',
  darnytskyi: 'q=Дарницький район, Київ',
  kyivReservoir: 'q=Київське водосховище',
  kanivReservoir: 'q=Канівське водосховище',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [key, q] of Object.entries(queries)) {
  const file = path.join(CACHE, key + '.json');
  if (fs.existsSync(file)) continue;
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&limit=1&' +
    q.replace(/=([^&]+)/g, (_, v) => '=' + encodeURIComponent(v));
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const json = await res.json();
  fs.writeFileSync(file, JSON.stringify(json));
  console.log(key, json[0]?.display_name?.slice(0, 60), json[0]?.geojson?.type);
  await sleep(1300);
}
