// Pastillas, insignias y sellos: siempre icono + texto (el color nunca va solo).
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { N_ROWS } from '../state.js';

export const CONN = {
  online: { icon: 'wifi', text: 'En línea' },
  offline: { icon: 'wifi_off', text: 'Sin conexión' },
  reconnecting: { icon: 'sync', text: 'Reconectando…' },
  checking: { icon: 'sync', text: 'Comprobando…' },
  demo: { icon: 'beaker_demo', text: 'Estación simulada' },
};
export function connectionPill(status) {
  const c = CONN[status] || CONN.offline;
  return h('span', { class: 'pill', dataset: { conn: status } }, icon(c.icon), h('span', { class: 'pill-text' }, c.text));
}

export const PROV = {
  banco_real: 'Banco real',
  archivo_prueba: 'Demostración',
  historico: 'Histórico',
  ensayo_validado: 'Ensayo validado',
};
export const provTag = (origen) => h('span', { class: 'prov', dataset: { prov: origen } }, PROV[origen] || origen);

/** Estado de adquisición de la corrida. */
export function acquisitionBadge(run, summary) {
  if (!run) return null;
  const n = summary ? summary.nRecv : run.n_recibidas ?? 0;
  const map = {
    captura: { tone: 'accent', icon: 'dot', text: `Capturando · ${n}/${N_ROWS}` },
    completa: { tone: 'ok', icon: 'check', text: `Válida · ${run.n_validas ?? n}/${N_ROWS}` },
    invalida: { tone: 'fail', icon: 'cross', text: 'Inválida' },
    interrumpida: { tone: 'warn', icon: 'pause', text: `Interrumpida · ${run.n_recibidas ?? n}/${N_ROWS}` },
  };
  const m = map[run.estado] || map.interrumpida;
  return h('span', { class: 'badge', dataset: { tone: m.tone } }, icon(m.icon), h('span', { class: 'badge-text' }, m.text));
}

/** Control válido / inválido a partir de la lista de comprobación y del resultado de la adquisición. */
export function controlState(run) {
  if (!run) return { ok: null, text: 'Sin controles registrados' };
  const c = run.controles || {};
  const items = run.esquema === 2 ? [run.volumen_confirmado, c.camara, c.tira, c.sondas, c.sensores] : [run.volumen_confirmado, c.vaso, c.sondas, c.sensores];
  if (run.estado === 'invalida') return { ok: false, text: `Control inválido: ${(run.motivos || [])[0] || 'motivo no informado'}` };
  if (items.some((v) => !v)) return { ok: false, text: 'Control inválido: faltan confirmaciones' };
  if (c.blanco === 'pendiente') return { ok: null, text: 'Control con incidencia: blanco del día pendiente' };
  return { ok: true, text: 'Control válido' };
}
export function controlBadge(run) {
  const s = controlState(run);
  const tone = s.ok === true ? 'ok' : s.ok === false ? 'fail' : 'neutral';
  const ic = s.ok === true ? 'check' : s.ok === false ? 'cross' : 'pending';
  return h('span', { class: 'badge', dataset: { tone } }, icon(ic), h('span', { class: 'badge-text' }, s.text));
}

export const HG = {
  pendiente: { icon: 'hourglass', tone: 'neutral', label: 'Pendiente de laboratorio', short: 'Hg pendiente' },
  indeterminado: { icon: 'question', tone: 'warn', label: 'Hg indeterminado', short: 'Hg indeterminado' },
  prioridad_confirmacion: { icon: 'flag', tone: 'info', label: 'Prioridad de confirmación', short: 'Prioridad de confirmación' },
  resultado_disponible: { icon: 'doc_check', tone: 'ok', label: 'Resultado disponible', short: 'Resultado disponible' },
};
export function hgBadge(estado = 'pendiente') {
  const m = HG[estado] || HG.pendiente;
  return h('span', { class: 'badge', dataset: { tone: m.tone } }, icon(m.icon), h('span', { class: 'badge-text' }, m.short));
}
