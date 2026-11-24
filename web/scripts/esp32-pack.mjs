// Prepara la carpeta para LittleFS: comprime a .gz (nivel 9) en data/ solo lo que la estación necesita.
// Las vistas con internet (Imágenes satelitales y Análisis espacial, con geotiff.js) quedan fuera de la
// placa: se usan desde la copia completa de dist/ en un equipo con conexión. ESPAsyncWebServer sirve
// automáticamente «ruta.gz» con Content-Encoding: gzip cuando se pide «ruta».
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { gzipSync, constants } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const out = join(root, 'data');
const ONLINE = ['src/views/satelite.js', 'src/views/espacial.js'];
rmSync(out, { recursive: true, force: true });

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const all = walk(dist).map((f) => relative(dist, f).replace(/\\/g, '/')).filter((f) => !f.startsWith('.vite/'));

// Archivos alcanzables desde la entrada sin pasar por las vistas con internet.
const manPath = join(dist, '.vite', 'manifest.json');
let keep = new Set(all);
if (existsSync(manPath)) {
  const man = JSON.parse(readFileSync(manPath, 'utf8'));
  const reach = new Set(['index.html']);
  const visit = (key) => {
    const e = man[key]; if (!e || ONLINE.includes(key)) return;
    if (reach.has(e.file) && key !== 'index.html') return;
    reach.add(e.file);
    for (const f of [...(e.css || []), ...(e.assets || [])]) reach.add(f);
    for (const k of [...(e.imports || []), ...(e.dynamicImports || [])]) visit(k);
  };
  visit('index.html');
  keep = new Set(all.filter((f) => reach.has(f) || !f.endsWith('.js')));
}

let raw = 0, gz = 0, longest = '', skipped = 0, skippedGz = 0;
const rows = [];
for (const rel of all) {
  const buf = readFileSync(join(dist, rel));
  const z = gzipSync(buf, { level: constants.Z_BEST_COMPRESSION });
  if (!keep.has(rel)) { skipped++; skippedGz += z.length; continue; }
  const target = join(out, rel + '.gz');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, z);
  raw += buf.length; gz += z.length;
  if (('/' + rel + '.gz').length > longest.length) longest = '/' + rel + '.gz';
  rows.push([rel, buf.length, z.length]);
}
rows.sort((a, b) => b[2] - a[2]);
for (const [rel, a, b] of rows) console.log(`${rel.padEnd(28)} ${(a / 1024).toFixed(1).padStart(7)} KB → ${(b / 1024).toFixed(1).padStart(6)} KB gz`);
console.log(`\nEn la placa: ${(raw / 1024).toFixed(1)} KB → ${(gz / 1024).toFixed(1)} KB gzip (objetivo < 300 KB)`);
console.log(`Fuera de la placa (vistas con internet, en dist/): ${skipped} archivos, ${(skippedGz / 1024).toFixed(1)} KB gzip`);
console.log(`Ruta más larga en LittleFS: ${longest} (${longest.length} caracteres)`);
console.log(`Carpeta lista para subir: ${out}`);
