// Piezas compartidas por las vistas.
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import * as fmt from '../lib/format.js';
import { TIPOS, MATRICES, label } from '../components/run-dialog.js';
import { ESTADO_LABEL } from '../runs.js';

export function viewHeader(title, desc, ...actions) {
  return h('header', { class: 'view-head' },
    h('div', null,
      h('h1', { tabindex: '-1', 'data-view-title': '' }, title),
      desc ? h('p', null, desc) : null),
    actions.length ? h('div', { class: 'view-actions' }, actions) : null);
}

export const tipoLabel = (v) => label(TIPOS, v);
export const matrizLabel = (v) => label(MATRICES, v);
export const estadoLabel = (v) => ESTADO_LABEL[v] || v;

export function runOptionLabel(r) {
  return `${r.run_id} · ${r.id_muestra} · ${tipoLabel(r.tipo_corrida)} · ${estadoLabel(r.estado)}${r.descartada ? ' (descartada)' : ''} · ${fmt.dateTime(r.fecha_iso)}`;
}

export function emptyState({ iconName = 'info', title, text, actions = [] }) {
  return h('section', { class: 'empty' }, icon(iconName), h('h2', null, title), h('p', null, text),
    actions.length ? h('div', { class: 'view-actions' }, actions) : null);
}

/** Lista de definiciones a partir de pares [término, valor]; omite los vacíos. */
export function dl(pairs, cls = 'kv') {
  const el = h('dl', { class: cls });
  for (const [k, v] of pairs) {
    if (v === undefined || v === null || v === '') continue;
    el.append(h('dt', null, k), h('dd', null, v));
  }
  return el;
}
