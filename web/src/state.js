// Estado de Ahgora Web + bus de eventos por tema ('muestras', 'filtros', 'nube', 'ui').
import { DEMO_CUENCA } from './data/demo.js';

export function readPref(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function writePref(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
}

export const FILTROS_VACIOS = { matriz: '', semaforo: '', certeza: '', responsable: '', cuenca: '', desde: '', hasta: '', texto: '' };

export const state = {
  mode: 'demo',            // 'demo' | 'nube'
  persistent: true,
  muestras: [],            // registros (más reciente primero)
  cuenca: null,            // cuenca configurada (en demostración: DEMO_CUENCA)
  nube: { status: 'idle', mensaje: '', ultima: null },
  filtros: { ...FILTROS_VACIOS },
  ui: {
    hidden: new Set(readPref('ahg.layers.hidden', [])),
    sidebar: readPref('ahg.sidebar', null),
    nasa: { capa: '', fecha: '', opacidad: 0.85, ...readPref('ahg.nasa', {}) },
  },
};

export function setMode(mode) {
  state.mode = mode;
  state.cuenca = mode === 'demo' ? DEMO_CUENCA : readPref('ahg.cuenca', null);
}

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

/** Muestras que cumplen los filtros activos (matriz, fecha, cuenca, estado, responsable — sección 7.3). */
export function filtradas(f = state.filtros) {
  const q = f.texto.trim().toLowerCase();
  return state.muestras.filter((m) =>
    (!f.matriz || m.matriz === f.matriz)
    && (!f.semaforo || m.semaforo === f.semaforo)
    && (!f.certeza || m.certeza === f.certeza)
    && (!f.responsable || m.responsable === f.responsable)
    && (!f.cuenca || m.cuenca === f.cuenca)
    && (!f.desde || m.fecha_iso.slice(0, 10) >= f.desde)
    && (!f.hasta || m.fecha_iso.slice(0, 10) <= f.hasta)
    && (!q || `${m.codigo} ${m.responsable} ${m.cuenca}`.toLowerCase().includes(q)));
}
export const hayFiltros = () => Object.entries(state.filtros).some(([, v]) => v);
export function setFiltros(next) { state.filtros = { ...state.filtros, ...next }; emit('filtros'); }
