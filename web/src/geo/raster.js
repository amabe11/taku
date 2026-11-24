// Lectura de rásteres en el navegador:
//  · Sentinel-2 L2A (COG en UTM): color real (TCI), NDVI con B08/B04 y máscara SCL, cambio entre fechas.
//  · Terrarium (PNG): elevación → sombreado, pendiente y dirección de drenaje D8.
import { itemEpsg, TERRARIUM } from './apis.js';

let geotiffP = null;
const geotiff = () => (geotiffP ||= import('geotiff'));

// ------------------------------------------------------------------ WGS84 → UTM (Transversa de Mercator)
export function toUtm(lon, lat, zone, south) {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const lon0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
  const φ = lat * Math.PI / 180, λ = lon * Math.PI / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(φ) ** 2), T = Math.tan(φ) ** 2, C = ep2 * Math.cos(φ) ** 2, A = Math.cos(φ) * (λ - lon0);
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * φ - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * φ)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * φ) - (35 * e2 ** 3 / 3072) * Math.sin(6 * φ));
  const x = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  let y = k0 * (M + N * Math.tan(φ) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720));
  if (south) y += 10000000;
  return [x, y];
}
export function bboxToUtm(bbox, epsg) {
  const zone = epsg % 100, south = Math.floor(epsg / 100) === 327;
  const pts = [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[0], bbox[3]], [bbox[2], bbox[3]]].map(([lo, la]) => toUtm(lo, la, zone, south));
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
}

/** Tamaño de salida que conserva la proporción del recorte (máx. maxPx de lado). */
export function outSize(ub, maxPx = 520) {
  const w = ub[2] - ub[0], hgt = ub[3] - ub[1];
  return w >= hgt ? [maxPx, Math.max(1, Math.round(maxPx * hgt / w))] : [Math.max(1, Math.round(maxPx * w / hgt)), maxPx];
}

async function readCrop(href, ub, width, height, opts = {}) {
  const { fromUrl } = await geotiff();
  const tiff = await fromUrl(href, { allowFullFile: false });
  return tiff.readRasters({ bbox: ub, width, height, resampleMethod: opts.resample || 'nearest', interleave: false, fillValue: 0, signal: opts.signal });
}

/** Píxel en metros del recorte producido (para el manifiesto). */
export const pixelSize = (ub, width) => (ub[2] - ub[0]) / width;

/** Color real a partir del activo `visual` (TCI, 8 bits): mismo criterio de visualización en ambas fechas. */
export async function trueColor(item, bbox, maxPx = 720) {
  const epsg = itemEpsg(item); const ub = bboxToUtm(bbox, epsg); const [w, hgt] = outSize(ub, maxPx);
  const r = await readCrop(item.assets.visual.href, ub, w, hgt, { resample: 'bilinear' });
  const img = new ImageData(w, hgt);
  let nodata = 0;
  for (let i = 0; i < w * hgt; i++) {
    const R = r[0][i], G = r[1][i], B = r[2][i];
    if (!R && !G && !B) nodata++;
    img.data[i * 4] = R; img.data[i * 4 + 1] = G; img.data[i * 4 + 2] = B; img.data[i * 4 + 3] = 255;
  }
  return { image: img, width: w, height: hgt, ub, epsg, pixel_m: pixelSize(ub, w), nodata_pct: (100 * nodata) / (w * hgt) };
}

// SCL: 0 sin dato, 1 saturado, 3 sombra de nube, 8 y 9 nube, 10 cirro (inválidos para NDVI)
const SCL_INVALID = new Set([0, 1, 3, 8, 9, 10]);
const scaleOf = (asset) => { const b = asset['raster:bands']?.[0] || {}; return [b.scale ?? 0.0001, b.offset ?? -0.1, b.nodata ?? 0]; };

/** NDVI = (B08 − B04) / (B08 + B04) en reflectancia, con píxeles válidos según SCL. */
export async function ndvi(item, bbox, size) {
  const epsg = itemEpsg(item); const ub = bboxToUtm(bbox, epsg); const [w, hgt] = size || outSize(ub);
  const [red, nir, scl] = await Promise.all([
    readCrop(item.assets.red.href, ub, w, hgt), readCrop(item.assets.nir.href, ub, w, hgt), readCrop(item.assets.scl.href, ub, w, hgt),
  ]);
  const [rs, ro, rn] = scaleOf(item.assets.red); const [ns, no, nn] = scaleOf(item.assets.nir);
  const out = new Float32Array(w * hgt); const valid = new Uint8Array(w * hgt); let nv = 0, sum = 0;
  for (let i = 0; i < w * hgt; i++) {
    const R = red[0][i], N = nir[0][i];
    if (R === rn || N === nn || SCL_INVALID.has(scl[0][i])) { out[i] = NaN; continue; }
    const r = R * rs + ro, n = N * ns + no;
    if (n + r <= 0) { out[i] = NaN; continue; }
    out[i] = (n - r) / (n + r); valid[i] = 1; nv++; sum += out[i];
  }
  return { values: out, valid, width: w, height: hgt, ub, epsg, valid_pct: (100 * nv) / (w * hgt), mean: nv ? sum / nv : null };
}

// Rampas: NDVI secuencial de un solo tono (suelo → vegetación); cambio divergente con punto medio neutro.
function lerp(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }
const NDVI_RAMP = [[60, 48, 40], [140, 120, 80], [120, 170, 90], [40, 140, 70], [10, 90, 50]];
function ramp(stops, t) { t = Math.max(0, Math.min(1, t)); const k = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(k)); return lerp(stops[i], stops[i + 1], k - i); }

export function ndviImage(nd) {
  const img = new ImageData(nd.width, nd.height);
  for (let i = 0; i < nd.values.length; i++) {
    const v = nd.values[i];
    const c = Number.isNaN(v) ? [70, 70, 80] : ramp(NDVI_RAMP, (v + 0.1) / 1.0);
    img.data.set([c[0], c[1], c[2], Number.isNaN(v) ? 110 : 255], i * 4);
  }
  return img;
}

/** Cambio de NDVI (fecha 2 − fecha 1) solo donde ambas fechas son válidas. */
export function ndviChange(a, b) {
  const n = a.values.length; const img = new ImageData(a.width, a.height);
  let both = 0, loss = 0, gain = 0;
  for (let i = 0; i < n; i++) {
    const ok = a.valid[i] && b.valid[i];
    if (!ok) { img.data.set([70, 70, 80, 110], i * 4); continue; }
    both++;
    const d = b.values[i] - a.values[i];
    if (d <= -0.15) loss++; else if (d >= 0.15) gain++;
    const t = Math.max(-1, Math.min(1, d / 0.4));
    const c = t < 0 ? lerp([235, 235, 235], [166, 97, 26], -t) : lerp([235, 235, 235], [1, 133, 113], t);
    img.data.set([c[0], c[1], c[2], 255], i * 4);
  }
  return { image: img, valid_overlap_pct: (100 * both) / n, perdida_pct: both ? (100 * loss) / both : 0, ganancia_pct: both ? (100 * gain) / both : 0 };
}

export function imageToCanvas(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  c.getContext('2d').putImageData(img, 0, 0); return c;
}

// ------------------------------------------------------------------ Terrarium: relieve
const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const lat2y = (lat, z) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z;

function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('tesela')); i.src = src; });
}

/** Elevación del área en una malla (≤ ~512 px) a partir de teselas Terrarium. */
export async function terrain(bbox) {
  let z = 13;
  const span = () => (lon2x(bbox[2], z) - lon2x(bbox[0], z)) * 256;
  while (z > 8 && span() > 900) z--;
  const x0 = Math.floor(lon2x(bbox[0], z)), x1 = Math.floor(lon2x(bbox[2], z));
  const y0 = Math.floor(lat2y(bbox[3], z)), y1 = Math.floor(lat2y(bbox[1], z));
  const W = (x1 - x0 + 1) * 256, H = (y1 - y0 + 1) * 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const jobs = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push(loadImg(`${TERRARIUM}/${z}/${x}/${y}.png`).then((im) => ctx.drawImage(im, (x - x0) * 256, (y - y0) * 256)));
  await Promise.all(jobs);
  const px0 = Math.round((lon2x(bbox[0], z) - x0) * 256), px1 = Math.round((lon2x(bbox[2], z) - x0) * 256);
  const py0 = Math.round((lat2y(bbox[3], z) - y0) * 256), py1 = Math.round((lat2y(bbox[1], z) - y0) * 256);
  const w = px1 - px0, hgt = py1 - py0;
  const d = ctx.getImageData(px0, py0, w, hgt).data;
  const elev = new Float32Array(w * hgt);
  for (let i = 0; i < w * hgt; i++) elev[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
  const latMid = (bbox[1] + bbox[3]) / 2;
  const cell = (40075016.686 * Math.cos((latMid * Math.PI) / 180)) / 2 ** (z + 8); // metros por píxel
  return { elev, width: w, height: hgt, zoom: z, cell_m: cell };
}

/** Sombreado, pendiente media y dirección D8 (flechas) a partir de la malla de elevación. */
export function reliefAnalysis(t) {
  const { elev, width: w, height: hgt, cell_m: cs } = t;
  const img = new ImageData(w, hgt);
  let mn = Infinity, mx = -Infinity, sum = 0, slopeSum = 0, ns = 0;
  for (const v of elev) { mn = Math.min(mn, v); mx = Math.max(mx, v); sum += v; }
  const az = (315 * Math.PI) / 180, alt = (45 * Math.PI) / 180;
  const at = (x, y) => elev[Math.max(0, Math.min(hgt - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];
  for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) {
    const dzdx = (at(x + 1, y) - at(x - 1, y)) / (2 * cs), dzdy = (at(x, y + 1) - at(x, y - 1)) / (2 * cs);
    const slope = Math.atan(Math.hypot(dzdx, dzdy)); const aspect = Math.atan2(dzdy, -dzdx);
    const hs = Math.max(0, Math.cos(alt) * Math.cos(slope) + Math.sin(alt) * Math.sin(slope) * Math.cos(az - aspect));
    slopeSum += slope; ns++;
    const e = (elev[y * w + x] - mn) / (mx - mn || 1);
    const base = lerp([42, 40, 92], [196, 184, 255], e);
    const k = 0.35 + 0.65 * hs;
    img.data.set([base[0] * k, base[1] * k, base[2] * k, 255], (y * w + x) * 4);
  }
  // D8 en una rejilla gruesa: dirección hacia la celda vecina más baja
  const step = Math.max(12, Math.round(Math.min(w, hgt) / 14)); const arrows = [];
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  for (let y = step / 2; y < hgt; y += step) for (let x = step / 2; x < w; x += step) {
    const z0 = at(Math.round(x), Math.round(y)); let best = null, bd = 0;
    for (const [dx, dy] of dirs) { const dz = (z0 - at(Math.round(x + dx * step / 2), Math.round(y + dy * step / 2))) / Math.hypot(dx, dy); if (dz > bd) { bd = dz; best = [dx, dy]; } }
    if (best) arrows.push({ x, y, dx: best[0], dy: best[1] });
  }
  return { image: img, min: mn, max: mx, mean: sum / elev.length, slope_deg: (slopeSum / ns) * 180 / Math.PI, arrows, step };
}
