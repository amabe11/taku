// Genera src/data/alcoche-geo.js: datos geográficos REALES del sitio piloto Alcoche (Caranavi, La Paz).
//   · Ríos y localidades: OpenStreetMap (ODbL) vía Overpass API. Población = etiqueta `population` de OSM.
//   · Huellas de minería aurífera: Amazon Mining Watch (Earth Genome, CC BY 4.0), detecciones sobre Sentinel-2
//     en parches de 480 m (amazon_basin_detections.geojson, versión del 16 oct 2026).
// Uso:  node scripts/build-alcoche.mjs [--amw ruta/detections.geojson] [--osm ruta/overpass.json]
// Sin rutas, descarga ambas fuentes (la de Amazon Mining Watch pesa ~110 MB).
import { readFileSync, writeFileSync } from 'node:fs';

const BBOX = { latMin: -16.05, latMax: -15.35, lonMin: -68.05, lonMax: -67.35 };
const AMW_URL = 'https://data.source.coop/earthgenome/amazon-mining-watch/amazon_basin_detections.geojson';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };

async function getJson(path, url, init) {
  if (path) return JSON.parse(readFileSync(path, 'utf8'));
  for (const u of Array.isArray(url) ? url : [url]) {
    try {
      const r = await fetch(u, { ...init, headers: { 'User-Agent': 'ahgora-build/1.0', ...(init?.headers || {}) } });
      if (r.ok) return await r.json();
      console.warn(`${u}: HTTP ${r.status}`);
    } catch (e) { console.warn(`${u}: ${e.message}`); }
  }
  throw new Error(`No se pudo descargar ${url}`);
}

// ---------------------------------------------------------------- OSM
const q = `[out:json][timeout:90];(way["waterway"="river"](${BBOX.latMin},${BBOX.lonMin},${BBOX.latMax},${BBOX.lonMax});node["place"~"^(city|town|village)$"](${BBOX.latMin},${BBOX.lonMin},${BBOX.latMax},${BBOX.lonMax}););out geom tags;`;
const osm = await getJson(arg('--osm'), OVERPASS, { method: 'POST', body: new URLSearchParams({ data: q }) });

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^Rio /i, 'Río ');
const fix = (s) => norm(s).replace(/^Río /, 'Río ');
const PRINCIPALES = /Coroico|Kaka|Alto Beni|Tipuani|Mapiri|Challana|Zongo|Yara|Suapi|Boncini|Broncini|Taypiplaya/i;

function dp(pts, eps) { // Douglas-Peucker en grados
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts.at(-1)];
  let idx = 0, max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
    const d = Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    if (d > max) { max = d; idx = i; }
  }
  return max > eps ? [...dp(pts.slice(0, idx + 1), eps).slice(0, -1), ...dp(pts.slice(idx), eps)] : [a, b];
}
const r5 = (v) => Math.round(v * 1e5) / 1e5;

const ways = osm.elements.filter((e) => e.type === 'way' && e.geometry?.length > 1);
const rios = ways
  .filter((w) => PRINCIPALES.test(norm(w.tags?.name)))
  .map((w) => ({ nombre: fix(w.tags.name), principal: /Coroico|Kaka|Alto Beni/i.test(norm(w.tags.name)), linea: dp(w.geometry.map((g) => [g.lon, g.lat]), 0.0007).map(([x, y]) => [r5(x), r5(y)]) }));
// afluentes sin nombre: trazo fino
const menores = ways.filter((w) => !PRINCIPALES.test(norm(w.tags?.name))).map((w) => dp(w.geometry.map((g) => [g.lon, g.lat]), 0.0012).map(([x, y]) => [r5(x), r5(y)]));

// Eje principal Coroico → Kaka encadenando tramos (en OSM, los ríos se dibujan en el sentido del flujo).
function encadenar(nombreRe) {
  const tramos = ways.filter((w) => nombreRe.test(norm(w.tags?.name))).map((w) => w.geometry.map((g) => [g.lon, g.lat]));
  const key = (p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  const finales = new Set(tramos.map((t) => key(t.at(-1))));
  let actual = tramos.find((t) => !finales.has(key(t[0]))) || tramos[0];
  const usados = new Set([actual]);
  const linea = [...actual];
  for (;;) {
    const sig = tramos.find((t) => !usados.has(t) && key(t[0]) === key(linea.at(-1)));
    if (!sig) break;
    usados.add(sig); linea.push(...sig.slice(1));
  }
  return linea;
}
const coroico = encadenar(/Coroico/i);
const kaka = encadenar(/Kaka/i);
const eje = dp([...coroico, ...kaka.slice(1)], 0.004).map(([x, y]) => [r5(x), r5(y)]);

const localidades = osm.elements
  .filter((e) => e.type === 'node' && e.tags?.name)
  .map((e) => ({ nombre: e.tags.name, lat: r5(e.lat), lon: r5(e.lon), poblacion: e.tags.population ? Number(e.tags.population) : null, tipo: e.tags.place }))
  .sort((a, b) => (b.poblacion || 0) - (a.poblacion || 0));
// Capital del municipio (OSM la etiqueta como place=city; se asegura aunque falle esa parte de la consulta).
if (!localidades.some((l) => l.nombre === 'Caranavi')) localidades.unshift({ nombre: 'Caranavi', lat: -15.834, lon: -67.56593, poblacion: 13569, tipo: 'city' });

// ---------------------------------------------------------------- Amazon Mining Watch
const amwRaw = await getJson(arg('--amw'), AMW_URL);
const celdas = [];
for (const f of amwRaw.features) {
  const c = f.geometry.coordinates[0];
  const lon = (c[0][0] + c[2][0]) / 2, lat = (c[0][1] + c[2][1]) / 2;
  if (lat < BBOX.latMin || lat > BBOX.latMax || lon < BBOX.lonMin || lon > BBOX.lonMax) continue;
  const p = f.properties;
  celdas.push([r5(lon), r5(lat), p.onset_year, p.status === 'provisional' ? 1 : 0, Math.round(p.confidence * 100) / 100]);
}
const half = (() => { const c = amwRaw.features[0].geometry.coordinates[0]; return [r5(Math.abs(c[2][0] - c[0][0]) / 2), r5(Math.abs(c[2][1] - c[0][1]) / 2)]; })();

// Frentes = grupos de parches contiguos (centros a menos de 0,75 km).
const km = (a, b) => Math.hypot((a[0] - b[0]) * 111.32 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110.57);
const padre = celdas.map((_, i) => i);
const raiz = (i) => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
for (let i = 0; i < celdas.length; i++) for (let j = i + 1; j < celdas.length; j++) if (km(celdas[i], celdas[j]) < 0.75) padre[raiz(i)] = raiz(j);
const grupos = new Map();
celdas.forEach((c, i) => { const r = raiz(i); if (!grupos.has(r)) grupos.set(r, []); grupos.get(r).push(i); });
const frentes = [...grupos.values()]
  .map((idx) => {
    const cs = idx.map((i) => celdas[i]);
    const lon = cs.reduce((s, c) => s + c[0], 0) / cs.length, lat = cs.reduce((s, c) => s + c[1], 0) / cs.length;
    return { celdas: idx, lon: r5(lon), lat: r5(lat), desde: Math.min(...cs.map((c) => c[2])), hasta: Math.max(...cs.map((c) => c[2])), parches: cs.length, provisional: cs.every((c) => c[3] === 1) };
  })
  .sort((a, b) => b.parches - a.parches);

const out = {
  generado: new Date().toISOString().slice(0, 10),
  bbox: BBOX,
  fuentes: {
    osm: 'OpenStreetMap contributors (ODbL 1.0), vía Overpass API',
    amw: 'Amazon Mining Watch · Earth Genome (CC BY 4.0), amazon_basin_detections.geojson, 16 oct 2026',
  },
  eje, rios, menores, localidades,
  amw: { medio_lado: half, campos: ['lon', 'lat', 'desde', 'provisional', 'confianza'], celdas },
  frentes,
};
const txt = `// Generado por scripts/build-alcoche.mjs el ${out.generado}. No editar a mano.\n// ${out.fuentes.osm}\n// ${out.fuentes.amw}\nexport default ${JSON.stringify(out)};\n`;
writeFileSync(new URL('../src/data/alcoche-geo.js', import.meta.url), txt);
console.log(`ríos ${rios.length} · menores ${menores.length} · localidades ${localidades.length} · eje ${eje.length} pts · parches ${celdas.length} · frentes ${frentes.length} · ${(txt.length / 1024).toFixed(0)} KB`);
console.log('eje', eje[0], '→', eje.at(-1));
