// Copia en la nube (MongoDB Atlas vía la API de server/ en Vercel).
// Los datos se guardan primero en el navegador (IndexedDB); la nube es la copia compartida del equipo.
// La clave del equipo se escribe en Configuración y queda solo en este navegador (nunca en el repositorio).
import { state, writePref } from './state.js';
import * as store from './store.js';
import { rowsOf, refreshList } from './runs.js';
import { loadLemna } from './views/bioindicador.js';
import { N_ROWS } from './state.js';

export const DEFAULT_API = (import.meta.env.VITE_CLOUD_API || '').replace(/\/$/, '');

export function cloudCfg() {
  try { return { api: DEFAULT_API, key: '', ultima: null, ...JSON.parse(localStorage.getItem('hg.cloud') || '{}') }; } catch { return { api: DEFAULT_API, key: '', ultima: null }; }
}
export const saveCloudCfg = (c) => writePref('hg.cloud', c);

async function call(path, { method = 'GET', body, cfg = cloudCfg(), timeout = 20000 } = {}) {
  if (!cfg.api) throw new Error('Falta la dirección de la API en Configuración.');
  const res = await fetch(`${cfg.api}${path}`, {
    method, signal: AbortSignal.timeout(timeout), cache: 'no-store',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cfg.key ? { 'x-hg-key': cfg.key } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export async function testCloud(cfg) {
  const h = await call('/api/health', { cfg });
  await call('/api/datos?coleccion=corridas&limit=1', { cfg }); // comprueba la clave
  return h;
}

/** Envía corridas (con sus filas), observaciones de Lemna y manifiestos satelitales. Idempotente. */
export async function syncAll(onProgress = () => {}) {
  const corridas = [];
  for (const r of state.runs.filter((x) => x.estado !== 'captura')) corridas.push({ ...r, filas: (await rowsOf(r.run_id)).filter(Boolean) });
  const lemna = await store.listItems('lemna');
  const escenas = (await store.listItems('escenas')).map(({ imagenes, ...m }) => m);
  const total = { corridas: 0, lemna: 0, escenas: 0 };
  const chunks = [];
  for (let i = 0; i < corridas.length; i += 40) chunks.push({ corridas: corridas.slice(i, i + 40) });
  for (let i = 0; i < lemna.length; i += 40) chunks.push({ lemna: lemna.slice(i, i + 40) });
  if (escenas.length) chunks.push({ escenas });
  for (const [i, c] of chunks.entries()) {
    onProgress(`Enviando ${i + 1} de ${chunks.length}…`);
    const r = await call('/api/sync', { method: 'POST', body: { origen_web: location.origin, ...c }, timeout: 45000 });
    total.corridas += r.corridas; total.lemna += r.lemna; total.escenas += r.escenas;
  }
  const now = new Date().toISOString();
  for (const r of corridas) { const { filas, ...meta } = r; await store.putRun({ ...meta, sincronizada_en: now }); }
  await refreshList();
  saveCloudCfg({ ...cloudCfg(), ultima: now });
  return total;
}

/** Trae a este navegador las corridas y observaciones del equipo que aún no estén aquí. */
export async function pullAll() {
  const local = new Set(state.runs.map((r) => r.run_id));
  const { items } = await call('/api/datos?coleccion=corridas&filas=1&limit=500', { timeout: 45000 });
  let n = 0;
  for (const doc of items) {
    if (local.has(doc.run_id)) continue;
    const { filas = [], sincronizado_en, sincronizado_desde, ...run } = doc;
    await store.putRun({ ...run, desde_nube: true });
    await store.putRows(run.run_id, filas.filter((f) => f && f.seq >= 0 && f.seq < N_ROWS));
    n++;
  }
  const lem = await call('/api/datos?coleccion=lemna&limit=500');
  const localLem = new Set((await store.listItems('lemna')).map((o) => o.id));
  let nl = 0;
  for (const o of lem.items) if (!localLem.has(o.id)) { const { sincronizado_en, sincronizado_desde, ...x } = o; await store.putItem('lemna', x); nl++; }
  await refreshList(); await loadLemna();
  return { corridas: n, lemna: nl };
}

/** Respaldo JSON completo de este navegador (corridas + filas + Lemna). */
export async function exportBackup() {
  const corridas = [];
  for (const r of state.runs) corridas.push({ ...r, filas: (await rowsOf(r.run_id)).filter(Boolean) });
  return { generado: new Date().toISOString(), origen_web: location.origin, corridas, lemna: await store.listItems('lemna') };
}

/** Importa un respaldo JSON (por ejemplo, descargado desde la web del ESP32) sin sobrescribir lo existente. */
export async function importBackup(text) {
  const data = JSON.parse(text);
  const local = new Set(state.runs.map((r) => r.run_id));
  let n = 0, nl = 0;
  for (const doc of data.corridas || []) {
    if (!doc?.run_id || local.has(doc.run_id)) continue;
    const { filas = [], ...run } = doc;
    await store.putRun(run); await store.putRows(run.run_id, filas.filter((f) => f && f.seq >= 0 && f.seq < N_ROWS)); n++;
  }
  const localLem = new Set((await store.listItems('lemna')).map((o) => o.id));
  for (const o of data.lemna || []) if (o?.id && !localLem.has(o.id)) { await store.putItem('lemna', o); nl++; }
  await refreshList(); await loadLemna();
  return { corridas: n, lemna: nl };
}
