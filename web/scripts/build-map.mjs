// Genera src/data/map.js a partir de Natural Earth (dominio público) y ETOPO1 (NOAA).
// Uso: node scripts/build-map.mjs <carpeta-con-geojson-y-etopo.csv>
// Se ejecuta una sola vez en desarrollo; el resultado es un módulo JS estático (sin red en tiempo de uso).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAW = process.argv[2];
if (!RAW) { console.error('Falta la carpeta de datos crudos'); process.exit(1); }
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'map.js');

// ---------- Proyección equirectangular centrada en Bolivia ----------
const LON_MIN = -70.4, LON_MAX = -57.0, LAT_MIN = -23.6, LAT_MAX = -9.0;
const COS = Math.cos((-16.3 * Math.PI) / 180);
const W = 1000;
const K = W / ((LON_MAX - LON_MIN) * COS);
const H = Math.round((LAT_MAX - LAT_MIN) * K);
const px = (lon) => (lon - LON_MIN) * COS * K;
const py = (lat) => (LAT_MAX - lat) * K;
const P = ([lon, lat]) => [px(lon), py(lat)];

// ---------- Utilidades geométricas ----------
function dp(points, tol) { // Douglas–Peucker (los anillos cerrados se parten en dos mitades)
  if (points.length < 3) return points;
  const [fx, fy] = points[0], [lx, ly] = points[points.length - 1];
  if (fx === lx && fy === ly && points.length > 4) {
    let far = 1, best = 0;
    for (let i = 1; i < points.length - 1; i++) { const d = Math.hypot(points[i][0] - fx, points[i][1] - fy); if (d > best) { best = d; far = i; } }
    const a = dpOpen(points.slice(0, far + 1), tol), b = dpOpen(points.slice(far), tol);
    return a.concat(b.slice(1));
  }
  return dpOpen(points, tol);
}
function dpOpen(points, tol) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [x1, y1] = points[a], [x2, y2] = points[b];
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1e-9;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * points[i][0] - dx * points[i][1] + x2 * y1 - y2 * x1) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return points.filter((_, i) => keep[i]);
}
const r1 = (n) => Math.round(n * 10) / 10;
function toPath(lines, closed) {
  return lines.filter((l) => l.length > 1).map((l) => {
    let s = 'M' + l.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L');
    return closed ? s + 'Z' : s;
  }).join('');
}
// Recorte de polígono contra el rectángulo de la vista (Sutherland–Hodgman)
function clipRing(ring, xmin, ymin, xmax, ymax) {
  const edges = [
    (p) => p[0] >= xmin, (p) => p[0] <= xmax, (p) => p[1] >= ymin, (p) => p[1] <= ymax,
  ];
  const inter = (a, b, k) => {
    const [x1, y1] = a, [x2, y2] = b;
    if (k < 2) { const x = k === 0 ? xmin : xmax; const t = (x - x1) / (x2 - x1); return [x, y1 + t * (y2 - y1)]; }
    const y = k === 2 ? ymin : ymax; const t = (y - y1) / (y2 - y1); return [x1 + t * (x2 - x1), y];
  };
  let out = ring;
  for (let k = 0; k < 4; k++) {
    const inp = out; out = [];
    if (!inp.length) break;
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i], prev = inp[(i + inp.length - 1) % inp.length];
      const ci = edges[k](cur), pi = edges[k](prev);
      if (ci) { if (!pi) out.push(inter(prev, cur, k)); out.push(cur); }
      else if (pi) out.push(inter(prev, cur, k));
    }
  }
  return out;
}
// Recorte de líneas: corta en tramos dentro del rectángulo (con margen)
function clipLine(line, m = 20) {
  const inside = ([x, y]) => x >= -m && x <= W + m && y >= -m && y <= H + m;
  const parts = []; let cur = [];
  for (const p of line) { if (inside(p)) cur.push(p); else { if (cur.length > 1) parts.push(cur); cur = []; } }
  if (cur.length > 1) parts.push(cur);
  return parts;
}
const polys = (geom) => geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
const lines = (geom) => geom.type === 'LineString' ? [geom.coordinates] : geom.type === 'MultiLineString' ? geom.coordinates : [];
const prop = (f, k) => f.properties[k] ?? f.properties[k.toLowerCase()];
const load = (name) => JSON.parse(readFileSync(join(RAW, name), 'utf8'));

// ---------- Países ----------
const countries = load('ne_10m_admin_0_countries.geojson');
const bolF = countries.features.find((f) => prop(f, 'ADM0_A3') === 'BOL');
const bolRings = polys(bolF.geometry).map((poly) => dp(poly[0].map(P), 0.6));
const bolivia = toPath(bolRings, true);

const NEIGH = { PER: 'Perú', BRA: 'Brasil', PRY: 'Paraguay', ARG: 'Argentina', CHL: 'Chile' };
const neighbors = countries.features
  .filter((f) => NEIGH[prop(f, 'ADM0_A3')])
  .map((f) => {
    const rings = polys(f.geometry)
      .map((poly) => clipRing(dp(poly[0].map(P), 0.9), -30, -30, W + 30, H + 30))
      .filter((r) => r.length > 2);
    return { name: NEIGH[prop(f, 'ADM0_A3')], d: toPath(rings, true) };
  })
  .filter((n) => n.d);

// ---------- Departamentos ----------
const adm1 = load('ne_10m_admin_1_states_provinces_lines.geojson');
const deptLines = adm1.features
  .filter((f) => prop(f, 'ADM0_A3') === 'BOL' || prop(f, 'ADM0_NAME') === 'Bolivia')
  .flatMap((f) => lines(f.geometry).map((l) => dp(l.map(P), 0.7)));
const departments = toPath(deptLines, false);

// ---------- Ríos y lagos ----------
const riversRaw = load('ne_10m_rivers_lake_centerlines.geojson');
const MAJOR = /Beni|Mamor|Madre de Dios|Guapor|Iténez|Itenez|Pilcomayo|Grande|Paraguay|Ichilo|Desaguadero|Madeira|Orthon|Yacuma|Abuná|Abuna|Kaka|Coroico/i;
const rivers = [];
for (const f of riversRaw.features) {
  const segs = lines(f.geometry).flatMap((l) => clipLine(dp(l.map(P), 0.6)));
  if (!segs.length) continue;
  const name = prop(f, 'name') || '';
  rivers.push({ name, major: MAJOR.test(name) ? 1 : 0, d: toPath(segs, false) });
}
const lakesRaw = load('ne_10m_lakes.geojson');
const lakes = lakesRaw.features
  .map((f) => {
    const rings = polys(f.geometry).map((poly) => clipRing(dp(poly[0].map(P), 0.5), -30, -30, W + 30, H + 30)).filter((r) => r.length > 2);
    return { name: prop(f, 'name') || '', d: toPath(rings, true) };
  })
  .filter((l) => l.d);

// ---------- Relieve (ETOPO1) → isolíneas por marching squares ----------
const csv = readFileSync(join(RAW, 'etopo.csv'), 'utf8').trim().split(/\r?\n/).slice(2);
const pts = csv.map((r) => r.split(',').map(Number));
const lats = [...new Set(pts.map((p) => p[0].toFixed(2)))].map(Number).sort((a, b) => a - b);
const lons = [...new Set(pts.map((p) => p[1].toFixed(2)))].map(Number).sort((a, b) => a - b);
const li = new Map(lats.map((v, i) => [v.toFixed(2), i])), lo = new Map(lons.map((v, i) => [v.toFixed(2), i]));
const grid = lats.map(() => new Float32Array(lons.length));
for (const [la, ln, z] of pts) grid[li.get(la.toFixed(2))][lo.get(ln.toFixed(2))] = z;

function isolines(level) {
  const segs = [];
  const key = (p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
  for (let i = 0; i < lats.length - 1; i++) {
    for (let j = 0; j < lons.length - 1; j++) {
      const v = [grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]];
      const c = [[lats[i], lons[j]], [lats[i], lons[j + 1]], [lats[i + 1], lons[j + 1]], [lats[i + 1], lons[j]]];
      let idx = 0; v.forEach((z, k) => { if (z >= level) idx |= 1 << k; });
      if (idx === 0 || idx === 15) continue;
      const e = (a, b) => { const t = (level - v[a]) / (v[b] - v[a]); return [c[a][1] + t * (c[b][1] - c[a][1]), c[a][0] + t * (c[b][0] - c[a][0])]; };
      const E = [e(0, 1), e(1, 2), e(2, 3), e(3, 0)];
      const table = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[3, 0]] };
      for (const [a, b] of table[idx]) segs.push([E[a], E[b]]);
    }
  }
  // Unir segmentos en polilíneas
  const ends = new Map();
  const used = new Uint8Array(segs.length);
  segs.forEach((s, n) => { for (const p of s) { const k = key(p); (ends.get(k) || ends.set(k, []).get(k)).push(n); } });
  const out = [];
  for (let n = 0; n < segs.length; n++) {
    if (used[n]) continue; used[n] = 1;
    const line = [...segs[n]];
    for (const dir of [1, 0]) {
      for (;;) {
        const tip = dir ? line[line.length - 1] : line[0];
        const cand = (ends.get(key(tip)) || []).find((m) => !used[m]);
        if (cand === undefined) break;
        used[cand] = 1;
        const [a, b] = segs[cand];
        const next = key(a) === key(tip) ? b : a;
        if (dir) line.push(next); else line.unshift(next);
      }
    }
    out.push(line);
  }
  return out
    .map((l) => l.map(P))
    .filter((l) => l.length > 4)
    .map((l) => dp(l, 0.9));
}
const LEVELS = [500, 1000, 2000, 3000, 4000, 5000];
const contours = LEVELS.map((level) => ({ level, d: toPath(isolines(level), false) }));

// ---------- Retícula geográfica cada 2° ----------
const graticule = [];
for (let lon = -70; lon <= -57; lon += 2) graticule.push({ axis: 'lon', v: lon, d: `M${r1(px(lon))} 0V${H}` });
for (let lat = -22; lat <= -10; lat += 2) graticule.push({ axis: 'lat', v: lat, d: `M0 ${r1(py(lat))}H${W}` });

const data = {
  w: W, h: H,
  proj: { lonMin: LON_MIN, latMax: LAT_MAX, cos: +COS.toFixed(6), k: +K.toFixed(4) },
  bolivia, neighbors, departments,
  rivers: rivers.filter((r) => r.major).concat(rivers.filter((r) => !r.major)),
  lakes, contours, graticule,
  sources: 'Natural Earth 1:10m (dominio público) · Relieve ETOPO1, NOAA NCEI (0,1°)',
};
mkdirSync(dirname(OUT), { recursive: true });
const js = '// Generado por scripts/build-map.mjs — no editar a mano.\n// Fuentes: ' + data.sources + '\nexport default ' + JSON.stringify(data) + ';\n';
writeFileSync(OUT, js);
console.log('map.js', (js.length / 1024).toFixed(1), 'KB', {
  bolivia: bolivia.length, neighbors: neighbors.map((n) => n.d.length), departments: departments.length,
  rivers: rivers.length, riversLen: rivers.reduce((a, r) => a + r.d.length, 0), lakes: lakes.map((l) => l.name + ':' + l.d.length),
  contours: contours.map((c) => c.level + ':' + c.d.length),
});
