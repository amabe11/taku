// Piezas compartidas de la lectura de tiras: selector de serie, leyenda, métricas y lista de controles.
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import * as fmt from '../lib/format.js';
import { state, emit } from '../state.js';

const nf1 = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmtDelta = (v) => (v == null ? '—' : nf1.format(v));

/** Botones persistentes de serie; devuelve { el, sync } para actualizar aria-pressed sin recrearlos. */
export function seriesSwitch(labels = { delta: 'Δ color', rgb: 'RGB', temp: '°C' }) {
  const btns = Object.entries(labels).map(([key, text]) => {
    const b = h('button', { type: 'button', onclick: () => { state.ui.series = key; emit('ui'); } }, text);
    b.dataset.key = key; return b;
  });
  const el = h('div', { class: 'seg', role: 'group', 'aria-label': 'Magnitud mostrada en la gráfica' }, btns);
  return { el, sync() { for (const b of btns) b.setAttribute('aria-pressed', String(state.ui.series === b.dataset.key)); } };
}

export function referenceText(run) {
  return run?.referencia?.tipo === 'blanco' ? `referencia: blanco ${run.referencia.run_id}` : 'referencia: inicio de la corrida (sin blanco del día)';
}

export function seriesLegend(run, series, compare = null) {
  const keys = [];
  if (series === 'delta') keys.push(h('span', { class: 'key' }, h('span', { class: 'swatch-line' }), `Δ cromático (${referenceText(run)})`));
  if (series === 'rgb') keys.push(
    h('span', { class: 'key' }, h('span', { class: 'swatch-r' }), 'R'),
    h('span', { class: 'key' }, h('span', { class: 'swatch-g' }), 'G'),
    h('span', { class: 'key' }, h('span', { class: 'swatch-b' }), 'B'),
    h('span', { class: 'key' }, 'cuentas del TCS34725, sin unidad física'));
  if (series === 'temp') keys.push(h('span', { class: 'key' }, h('span', { class: 'swatch-line', style: { borderTopColor: 'var(--chart-line-temp)', borderTopStyle: 'dashed' } }), 'Temperatura DS18B20 (°C)'));
  if (compare) keys.push(h('span', { class: 'key' }, h('span', { class: 'swatch-compare' }), compare.label));
  keys.push(h('span', { class: 'key' }, h('span', { class: 'swatch-gap' }), 'Sin lectura o inválida'));
  return keys;
}

export function metricCard({ iconName, label, value, unit, note, missing }) {
  return h('div', { class: 'card metric', dataset: missing ? { missing: '' } : {} },
    h('div', { class: 'metric-head' }, icon(iconName), label),
    h('div', null, h('span', { class: 'metric-value' }, value), unit ? h('span', { class: 'metric-unit' }, unit) : null),
    h('div', { class: 'metric-note' }, missing ? 'sin lectura válida' : note));
}

export function stripMetrics(s, run) {
  const d = s?.deltaFinal ?? s?.lastDelta;
  return [
    metricCard({ iconName: 'beaker_demo', label: 'Lectura de tira', value: fmtDelta(d), unit: 'Δ', note: `Δ cromático · ${run?.estado === 'captura' ? 'en desarrollo' : 'final'} · no es concentración`, missing: d == null }),
    metricCard({ iconName: 'thermo', label: 'Temperatura', value: fmt.tc(s?.lastT), unit: '°C', note: 'Sonda DS18B20', missing: s?.lastT == null }),
  ];
}

export function controlItems(run) {
  const c = run?.controles || {};
  const item = (ok, text) => h('li', { dataset: { ok: String(ok) } }, icon(ok === true ? 'check' : ok === false ? 'cross' : 'pending'), text);
  const blanco = item(c.blanco === 'pendiente' ? 'pending' : true, c.blanco === 'es_blanco' ? 'Esta corrida es el blanco de tira' : c.blanco === 'pendiente' ? 'Blanco de tira del día pendiente' : 'Blanco de tira del día registrado');
  if (run?.esquema !== 2) {
    return [item(!!run.volumen_confirmado, 'Volumen confirmado'), item(!!c.vaso, 'Vaso en posición (versión anterior)'), item(!!c.sondas, 'Sondas a la marca'), item(!!c.sensores, 'Sensores respondiendo'), blanco];
  }
  return [
    item(!!run.volumen_confirmado, `Volumen ${run.volumen_ml ?? '—'} mL medido`),
    item(!!c.camara, 'Cámara oscura cerrada, tira en posición'),
    item(!!c.tira, `Tira vigente · lote ${run.lote_tira || '—'}`),
    item(!!c.sondas, 'Sonda de temperatura en la muestra'),
    item(!!c.sensores, 'Lector y sonda respondiendo al inicio'),
    blanco,
  ];
}
