// Puente: carga lecturas del lector Ahgora guardadas en archivos .jsonl a la base (colección «lecturas»,
// POST /api/lecturas), las mismas que envía el lector WiFi. Las ve Ahgora Web en «Lector en vivo».
//
// Sirve para:
//   · los archivos del simulador en PC (firmware/lecturas_AHG-SED-01.jsonl y lecturas_AHG-PEZ-01.jsonl);
//   · lo que se copió del Monitor Serie de una placa real (las líneas que no son JSON se ignoran).
//
// Uso (desde server/):
//   node scripts/cargar-jsonl.mjs ../firmware/lecturas_AHG-SED-01.jsonl ../firmware/lecturas_AHG-PEZ-01.jsonl --key <clave>
//   AHG_TEAM_KEY=<clave> node scripts/cargar-jsonl.mjs <archivos…>
// Opciones:
//   --key <clave>   clave del equipo (AHG_TEAM_KEY) o del lector (AHG_NODE_KEY). También por variable de entorno.
//   --api <url>     servidor (por defecto https://taku-server.vercel.app o AHG_API)
//   --seco          solo cuenta y muestra qué se enviaría, sin enviar
//   --real          lecturas de una placa real: NO se marcan como simuladas (por defecto se marcan `simulado: true`,
//                   y «Borrar simulación» en Configuración las quita)
//
// Repetir la carga no duplica: cada lectura lleva su hora de medición `t` (el simulador la escribe; si falta, se
// deduce de la fecha del archivo, una por segundo) y el servidor no guarda dos veces el mismo nodo + seq + hora.
// Son señal óptica cruda: NO son concentración de mercurio.
import { readFileSync, statSync, existsSync } from 'node:fs';
import { basename } from 'node:path';

const args = process.argv.slice(2);
const valor = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const API = valor('api', process.env.AHG_API || 'https://taku-server.vercel.app').replace(/\/$/, '');
const KEY = valor('key', process.env.AHG_TEAM_KEY || process.env.AHG_NODE_KEY || process.env.HG_TEAM_KEY);
const SECO = args.includes('--seco');
const REAL = args.includes('--real');
const LOTE = 120; // máximo por envío en /api/lecturas
const archivos = args.filter((a, i) => !a.startsWith('--') && !['--key', '--api'].includes(args[i - 1]));

if (!archivos.length) {
  console.error('Uso: node scripts/cargar-jsonl.mjs <archivo.jsonl> [más archivos] [--key <clave>] [--api <url>] [--seco] [--real]');
  process.exit(1);
}
if (!KEY && !SECO) { console.error('Falta la clave: --key <clave> o la variable AHG_TEAM_KEY (o AHG_NODE_KEY).'); process.exit(1); }

// ---------------------------------------------------------------- leer
const porNodo = new Map(); // node_id -> { firmware, lecturas[] }
let ignoradas = 0;
for (const archivo of archivos) {
  if (!existsSync(archivo)) { console.warn(`· ${archivo}: no existe, se salta.`); continue; }
  const mtime = statSync(archivo).mtimeMs;
  const filas = [];
  for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const t = linea.trim();
    if (!t.startsWith('{')) { if (t) ignoradas++; continue; }
    try {
      const l = JSON.parse(t);
      if (!l.node_id || ![l.r, l.g, l.b, l.c].every(Number.isFinite)) { ignoradas++; continue; }
      filas.push(l);
    } catch { ignoradas++; }
  }
  // Sin hora del equipo: se reparte hacia atrás desde la fecha del archivo, una lectura por segundo.
  const sinHora = filas.filter((l) => !Number.isFinite(Number(l.t)));
  sinHora.forEach((l, i) => { l.t = Math.round(mtime - (sinHora.length - 1 - i) * 1000); });
  for (const l of filas) {
    const n = porNodo.get(l.node_id) || { lecturas: [] };
    n.lecturas.push(l);
    porNodo.set(l.node_id, n);
  }
  console.log(`· ${basename(archivo)}: ${filas.length} lecturas${sinHora.length ? ` (${sinHora.length} sin hora: se usó la fecha del archivo)` : ''}`);
}
if (ignoradas) console.log(`· ${ignoradas} líneas que no son lecturas JSON (mensajes de estado) se ignoraron.`);
if (!porNodo.size) { console.log('No hay lecturas para enviar.'); process.exit(0); }

// ---------------------------------------------------------------- enviar
let total = 0, guardadas = 0, errores = 0;
for (const [node_id, { lecturas }] of porNodo) {
  const cubetas = [...new Set(lecturas.map((l) => l.cubeta).filter(Boolean))];
  console.log(`\n${node_id}: ${lecturas.length} lecturas${cubetas.length ? ` · cubetas: ${cubetas.join(', ')}` : ''}${REAL ? '' : ' · marcadas como simuladas'}`);
  if (SECO) { console.log('  (--seco) primera:', JSON.stringify(lecturas[0])); total += lecturas.length; continue; }
  for (let i = 0; i < lecturas.length; i += LOTE) {
    const parte = lecturas.slice(i, i + LOTE);
    const cuerpo = { node_id, firmware: REAL ? 'monitor-serie' : 'ahgora-pc-sim', origen: REAL ? 'puente-jsonl' : 'simulador-pc', simulado: !REAL, lecturas: parte };
    try {
      const res = await fetch(`${API}/api/lecturas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ahg-nodo': KEY }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(30000),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      total += d.recibidas; guardadas += d.guardadas;
      process.stdout.write(`  ✔ ${i + parte.length}/${lecturas.length} enviadas (${d.guardadas} nuevas)\n`);
    } catch (e) {
      errores++;
      console.error(`  ✘ lote ${i / LOTE + 1}: ${e.message}`);
      if (/401|clave/i.test(e.message)) { console.error('  Revisa la clave (AHG_TEAM_KEY o AHG_NODE_KEY de Vercel).'); process.exit(1); }
    }
  }
}
console.log(SECO
  ? `\n--seco: ${total} lecturas listas para enviar a ${API}/api/lecturas.`
  : `\nListo: ${total} lecturas enviadas, ${guardadas} nuevas en la base${total - guardadas ? ` (${total - guardadas} ya estaban)` : ''}${errores ? `, ${errores} lotes con error` : ''}.\nMíralas en Ahgora Web → «Lector en vivo (ESP32)».`);
if (errores) process.exitCode = 1;
