// Estado de la aplicación + bus de eventos por tema ('conn', 'run', 'runs', 'ui', 'mode', 'lemna', 'escenas').
import { derive, finalDelta } from './lib/optics.js';
export const N_ROWS = 121; // seq 0..120

export const STATION = {
  id: 'EST-01',
  nombre: 'Banco de demostración',
  localidad: 'La Paz',
  nota: 'Ubicación del banco de prueba, no de un punto de muestreo.',
  lat: -16.4955,
  lon: -68.1336,
  estado: 'activa',
};

// Antecedente documental: solo contexto histórico, sin resultados atribuidos al proyecto.
export const BACKGROUND_SITES = [
  {
    id: 'ANT-ALCOCHE',
    nombre: 'Alcoche–Caranavi',
    lat: -15.836,
    lon: -67.565,
    estado: 'antecedente',
    fuente: 'Monitoreo de agua de Alcoche, 2024 (fuente histórica externa)',
  },
];

function readPref(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function writePref(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
}

export const state = {
  mode: 'demo',            // 'demo' | 'device'
  api: null,
  persistent: true,        // IndexedDB disponible
  conn: { status: 'checking', info: null, lastOk: 0, failingSince: 0 },
  runs: [],                // metadatos de corridas guardadas (más reciente primero)
  current: null,           // { run, rows: Array(121) } corrida mostrada (activa o última)
  tracking: false,
  ui: {
    series: 'delta',
    sheet: 'peek',
    territory: 'general',
    hidden: new Set(readPref('hg.layers.hidden', [])),
    sidebar: readPref('hg.sidebar', null),
    sim: { failure: 'ninguna', speed: 8, respuesta: 'alta', ...readPref('hg.demo.sim', {}) },
  },
};

const subs = new Map();
export function on(topic, fn) {
  if (!subs.has(topic)) subs.set(topic, new Set());
  subs.get(topic).add(fn);
  return () => subs.get(topic).delete(fn);
}
export function emit(topic, payload) {
  for (const fn of subs.get(topic) || []) {
    try { fn(payload); } catch (e) { console.error(e); }
  }
}

// Zona de interés del proyecto (datos.jpeg): Yungas bolivianos. Contorno aproximado, NO es un sitio piloto.
export const ZONA_INTERES = {
  nombre: 'Yungas de La Paz',
  nota: 'Zona de interés aproximada (Nor y Sud Yungas, Caranavi). No es un sitio piloto ni tiene coordenadas de campo.',
  // [lon, lat] en sentido horario, trazado a mano sobre la vertiente oriental de la cordillera
  contorno: [[-68.45, -15.55], [-67.95, -15.2], [-67.35, -15.15], [-66.95, -15.45], [-67.05, -16.05], [-67.55, -16.55], [-68.05, -16.7], [-68.35, -16.35], [-68.55, -15.95]],
  bbox: [-68.55, -16.7, -66.95, -15.15],
};

// Criterio operativo de priorización para la lectura de tiras (guía, p. 5: «Criterio futuro»).
// Sin criterio acordado, el estado de Hg permanece pendiente.
export const DEMO_CRITERIO = {
  activo: true, umbral: 8, banda: 1.5, metodo: 'Tira de cribado de Hg (demostración)',
  validado_por: 'Criterio ficticio de demostración — no validado', demostracion: true,
};
export function getCriterio(mode = state.mode) {
  const saved = readPref(`hg.criterio.${mode}`, null);
  if (saved) return saved;
  return mode === 'demo' ? DEMO_CRITERIO : { activo: false, umbral: null, banda: null, metodo: '', validado_por: '', demostracion: false };
}
export const setCriterio = (c, mode = state.mode) => writePref(`hg.criterio.${mode}`, c);

/** Resumen de validez de una corrida a partir de sus 121 posiciones (temperatura + cuentas ópticas). */
export function summarize(rows, run = null) {
  const missing = [], invalid = [];
  const d = derive(run, rows);
  let nRecv = 0, nValid = 0, tMin = Infinity, tMax = -Infinity, dMax = -Infinity, lastT = null, lastDelta = null, lastCounts = null;
  for (let seq = 0; seq < N_ROWS; seq++) {
    const r = d[seq];
    if (!r) { missing.push(seq); continue; }
    nRecv++;
    const ok = r.temp_c != null && r.r != null && r.g != null && r.b != null && r.c != null && !r.motivo;
    if (ok) nValid++; else invalid.push(seq);
    if (r.temp_c != null) { tMin = Math.min(tMin, r.temp_c); tMax = Math.max(tMax, r.temp_c); lastT = r.temp_c; }
    if (r.delta != null) { dMax = Math.max(dMax, r.delta); lastDelta = r.delta; }
    if (r.c != null) lastCounts = { r: r.r, g: r.g, b: r.b, c: r.c };
  }
  return {
    nRecv, nValid, missing, invalid, derived: d,
    temp: Number.isFinite(tMin) ? [tMin, tMax] : null,
    deltaMax: Number.isFinite(dMax) ? dMax : null,
    deltaFinal: finalDelta(d),
    lastT, lastDelta, lastCounts,
    firstMissing: missing.length ? missing[0] : N_ROWS,
  };
}
