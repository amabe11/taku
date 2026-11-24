// EvidenceTable: historial de corridas. Tabla semántica; los filtros ocultan filas (hidden) y el orden
// mueve los <tr> existentes (no se reconstruye el <tbody>), así se conservan foco y estado.
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import * as fmt from '../lib/format.js';
import { N_ROWS } from '../state.js';
import { provTag, acquisitionBadge, hgBadge, PROV, HG } from './badges.js';
import { tipoLabel, matrizLabel, estadoLabel } from '../views/common.js';
import { TIPOS } from './run-dialog.js';

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const COLS = [
  { key: 'run_id', label: 'Corrida', type: 'text', sortable: true },
  { key: 'fecha', label: 'Fecha', type: 'number', sortable: true },
  { key: 'muestra', label: 'Caso / muestra', type: 'text', sortable: true },
  { key: 'tipo', label: 'Tipo y matriz', type: 'text' },
  { key: 'origen', label: 'Origen', type: 'text' },
  { key: 'adq', label: 'Adquisición', type: 'text' },
  { key: 'validas', label: 'Válidas', type: 'number', sortable: true },
  { key: 'hg', label: 'Hg', type: 'text' },
  { key: 'ficha', label: 'Ficha y archivo', type: 'text' },
];

export function createEvidenceTable({ onExport }) {
  const capId = 'ev-caption';
  const status = h('p', { class: 'sr-only', role: 'status', 'aria-atomic': 'true' });
  const visibleCount = h('p', { class: 'meta', style: { margin: 0 } });
  const tableId = 'evidence-table';
  const thead = h('thead', null, h('tr', null, COLS.map((c) => {
    if (!c.sortable) return h('th', { scope: 'col' }, c.label);
    return h('th', { scope: 'col', dataset: { type: c.type, key: c.key } },
      h('button', { type: 'button', class: 'sort-btn', commandfor: tableId, command: '--sort' }, c.label, icon('chevron', { cls: 'sort-icon' })));
  })));
  const tbody = h('tbody');
  const table = h('table', { class: 'data-table evidence', id: tableId, style: COLS.reduce((o, c, i) => ({ ...o, [`--label-${i + 1}`]: `"${c.label}"` }), {}) },
    h('caption', { id: capId }, 'Historial de corridas guardadas en este navegador'), thead, tbody);
  const wrap = h('div', { class: 'table-wrap evidence-wrap', role: 'region', tabindex: '0', 'aria-labelledby': capId }, table);

  // ---------------- filtros
  const fText = h('input', { class: 'input', type: 'search', id: 'f-texto', name: 'q', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', placeholder: 'DEMO-B-001, M-002, DEMO-01…' });
  const opt = (pairs) => [h('option', { value: '' }, 'Todos'), ...pairs.map(([v, l]) => h('option', { value: v }, l))];
  const fOrigen = h('select', { class: 'select', id: 'f-origen', name: 'origen' }, opt(Object.entries(PROV)));
  const fEstado = h('select', { class: 'select', id: 'f-estado', name: 'estado' }, opt([['captura', 'Capturando'], ['completa', 'Válida'], ['invalida', 'Inválida'], ['interrumpida', 'Interrumpida']]));
  const fHg = h('select', { class: 'select', id: 'f-hg', name: 'hg' }, opt(Object.entries(HG).map(([k, v]) => [k, v.label])));
  const fTipo = h('select', { class: 'select', id: 'f-tipo-ev', name: 'tipo' }, opt(TIPOS.map(([v, l]) => [v, l])));
  const fDesc = h('input', { type: 'checkbox', id: 'f-desc', name: 'descartadas' });
  const lab = (id, text, control) => h('div', { class: 'field' }, h('label', { for: id }, text), control.tagName === 'SELECT' ? h('div', { class: 'select-wrap' }, control, icon('chevron')) : control);
  const form = h('form', { class: 'filters', onsubmit: (e) => e.preventDefault(), oninput: () => applyFilters(), onchange: () => applyFilters() },
    lab('f-texto', 'Buscar por ID', fText), lab('f-origen', 'Origen', fOrigen), lab('f-estado', 'Adquisición', fEstado),
    lab('f-hg', 'Estado de Hg', fHg), lab('f-tipo-ev', 'Tipo de corrida', fTipo),
    h('label', { class: 'check', style: { alignSelf: 'end' } }, fDesc, h('span', null, 'Incluir descartadas')),
    h('button', { class: 'btn btn-ghost', type: 'reset', style: { alignSelf: 'end' }, onclick: () => setTimeout(applyFilters) }, 'Limpiar filtros'));
  const search = h('search', { 'aria-label': 'Filtros del historial' },
    h('details', { class: 'filters-box', open: window.matchMedia('(width >= 48rem)').matches },
      h('summary', null, 'Filtros', icon('chevron')), form));

  const el = h('div', { class: 'evidence-block' }, search, visibleCount, wrap, status);
  let runs = [];

  function rowFor(r) {
    const n = r.n_validas ?? (r.estado === 'captura' ? null : 0);
    const td = (key, value, content) => h('td', { dataset: { key, ...(value !== undefined ? { value } : {}) } }, h('div', { class: 'cell' }, content));
    const tr = h('tr', { dataset: { id: r.run_id } },
      h('th', { scope: 'row', dataset: { key: 'run_id' } }, h('a', { class: 'mono row-link', href: `#/lecturas/${r.run_id}` }, r.run_id)),
      td('fecha', String(new Date(r.fecha_iso).getTime()), h('time', { datetime: r.fecha_iso, title: fmt.dateTime(r.fecha_iso) }, fmt.dateShort(r.fecha_iso))),
      td('muestra', `${r.id_caso} ${r.id_muestra}`, h('span', { class: 'mono' }, `${r.id_caso} / ${r.id_muestra}`)),
      td('tipo', undefined, [tipoLabel(r.tipo_corrida), h('br'), h('small', { class: 'meta' }, matrizLabel(r.matriz))]),
      td('origen', undefined, provTag(r.origen)),
      td('adq', undefined, [acquisitionBadge(r), r.motivos?.length ? h('small', { class: 'meta motivo' }, r.motivos[0]) : null]),
      td('validas', String(n ?? -1), h('span', { class: 'mono' }, n == null ? '—' : `${n}/${N_ROWS}`)),
      td('hg', undefined, hgBadge(r.estado_hg)),
      td('ficha', undefined, [
        r.guardada ? 'Guardada' : 'Sin guardar',
        h('small', { class: 'meta', style: { display: 'block' } }, `${r.exportada ? 'CSV descargado' : 'CSV pendiente'}${r.descartada ? ' · descartada' : ''}`),
        h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => onExport(r.run_id), 'aria-label': `Descargar CSV de ${r.run_id}` }, icon('download'), 'CSV'),
      ]),
    );
    tr._run = r;
    return tr;
  }

  function applyFilters() {
    const q = fText.value.trim().toUpperCase();
    let shown = 0;
    for (const tr of tbody.rows) {
      const r = tr._run;
      const ok = (!q || `${r.run_id} ${r.id_muestra} ${r.id_caso}`.toUpperCase().includes(q))
        && (!fOrigen.value || r.origen === fOrigen.value)
        && (!fEstado.value || r.estado === fEstado.value)
        && (!fHg.value || (r.estado_hg || 'pendiente') === fHg.value)
        && (!fTipo.value || r.tipo_corrida === fTipo.value)
        && (fDesc.checked || !r.descartada);
      tr.hidden = !ok; if (ok) shown++;
    }
    visibleCount.textContent = runs.length ? `Mostrando ${shown} de ${runs.length} corridas.` : '';
    status.textContent = visibleCount.textContent;
  }

  // ---------------- orden (invoker commands con respaldo por click)
  const move = (row) => (tbody.moveBefore ? tbody.moveBefore(row, null) : tbody.append(row));
  function sortBy(button, silent = false) {
    const th = button.closest('th');
    const dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
    for (const cell of thead.rows[0].cells) cell.removeAttribute('aria-sort');
    th.setAttribute('aria-sort', dir);
    const f = dir === 'ascending' ? 1 : -1;
    const key = th.dataset.key, type = th.dataset.type;
    const val = (row) => { const c = row.querySelector(`[data-key="${key}"]`); return c.dataset.value ?? c.textContent.trim(); };
    const rows = [...tbody.rows].map((row) => [row, val(row)]);
    rows.sort((a, b) => f * (type === 'number' ? Number(a[1]) - Number(b[1]) : collator.compare(a[1], b[1])));
    for (const [row] of rows) move(row);
    if (!silent) status.textContent = `Ordenado por ${button.textContent.trim()}, ${dir === 'ascending' ? 'ascendente' : 'descendente'}.`;
  }
  table.addEventListener('command', (e) => { if (e.command === '--sort') sortBy(e.source); });
  if (!('commandForElement' in HTMLButtonElement.prototype)) {
    for (const b of thead.querySelectorAll('button[command="--sort"]')) b.addEventListener('click', () => sortBy(b));
  }

  const rowKey = (r) => JSON.stringify([r.estado, r.n_validas, r.motivos, r.estado_hg, r.guardada, r.exportada, r.descartada]);
  function update(list) {
    runs = list;
    const existing = new Map([...tbody.rows].map((tr) => [tr.dataset.id, tr]));
    const active = document.activeElement;
    const activeRow = tbody.contains(active) ? active.closest('tr') : null;
    const activeCell = activeRow ? active.closest('[data-key]')?.dataset.key : null;
    let refocus = null;
    const ordered = list.map((r) => {
      const old = existing.get(r.run_id);
      existing.delete(r.run_id);
      if (old && old._k === rowKey(r)) return old;
      const nr = rowFor(r); nr._k = rowKey(r);
      if (old) { old.replaceWith(nr); if (old === activeRow) refocus = nr; } else tbody.append(nr);
      return nr;
    });
    for (const tr of existing.values()) tr.remove();
    const sorted = thead.querySelector('th[aria-sort]');
    if (sorted) { const dir = sorted.getAttribute('aria-sort'); sorted.setAttribute('aria-sort', dir === 'ascending' ? 'descending' : 'ascending'); sortBy(sorted.querySelector('button'), true); }
    else ordered.forEach(move);
    if (refocus && activeCell) refocus.querySelector(`[data-key="${activeCell}"] :is(a, button)`)?.focus();
    applyFilters();
  }
  return { el, update };
}
