// Vista «Muestras»: filtros + tabla ordenable + exportación (CSV, GeoJSON, versión pública agregada).
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { announce } from '../lib/announce.js';
import * as fmt from '../lib/format.js';
import { state, on, filtradas } from '../state.js';
import { MATRICES, SEMAFORO, CERTEZA, estimado } from '../model.js';
import { semaforoBadge, certezaBadge, matrizTag, demoSeal } from '../components/badges.js';
import { filtersForm } from '../components/filters.js';
import { buildCsv, buildGeoJson, downloadText, stamp } from '../csv.js';
import { viewHeader, emptyState, legalNote } from './common.js';

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const COLS = [
  ['codigo', 'Código', 'text'], ['matriz', 'Matriz', 'text'], ['fecha', 'Fecha', 'number'], ['responsable', 'Responsable', 'text'],
  ['estimado', 'Estimado (mg/kg)', 'number'], ['semaforo', 'Semáforo', 'number'], ['certeza', 'Nivel de certeza', 'text'], ['lab', 'Laboratorio (mg/kg)', 'number'],
];

export function muestrasView() {
  const filt = filtersForm('mt');
  const status = h('p', { class: 'sr-only', role: 'status' });
  const count = h('p', { class: 'meta', style: { margin: 0 } });
  const tableHost = h('div');
  const exportBtn = (label, ic, fn) => h('button', { class: 'btn btn-ghost', type: 'button', onclick: fn }, icon(ic), label);
  const demo = () => state.mode === 'demo';
  const exports = h('div', { class: 'view-actions' },
    exportBtn('CSV', 'download', () => { downloadText(buildCsv(filtradas()), `ahgora_muestras_${stamp(demo())}.csv`); announce('CSV descargado.'); }),
    exportBtn('GeoJSON', 'map', () => { downloadText(buildGeoJson(filtradas()), `ahgora_muestras_${stamp(demo())}.geojson`, 'application/geo+json'); announce('GeoJSON descargado.'); }),
    exportBtn('Versión pública', 'shield', () => { downloadText(buildGeoJson(filtradas(), { publico: true }), `ahgora_publico_${stamp(demo())}.geojson`, 'application/geo+json'); announce('Versión pública descargada: solo muestras públicas, en zonas agregadas.'); }),
  );

  let table, tbody;
  function build() {
    if (!state.muestras.length) {
      mount(tableHost, emptyState({ iconName: 'table', title: 'Todavía no hay muestras', text: state.mode === 'demo' ? 'Restablece la demostración en Configuración.' : 'Las muestras llegan cuando la app modo técnico sincroniza con el servidor. También puedes importar un CSV o JSON en Configuración.' }));
      table = null; return;
    }
    tbody = h('tbody');
    for (const m of state.muestras) {
      const est = estimado(m);
      const lab = m.laboratorio?.resultado_mg_kg;
      tbody.append(h('tr', { dataset: { codigo: m.codigo } },
        h('th', { scope: 'row', 'data-value': m.codigo }, h('a', { class: 'row-link', href: `#/muestra/${encodeURIComponent(m.codigo)}` }, m.codigo), m.demostracion ? h('div', null, demoSeal(m)) : null),
        h('td', { 'data-value': MATRICES[m.matriz]?.label || m.matriz }, matrizTag(m.matriz)),
        h('td', { 'data-value': String(Date.parse(m.fecha_iso) || 0) }, fmt.dateShort(m.fecha_iso)),
        h('td', null, m.responsable || '—'),
        h('td', { class: 'num', 'data-value': String(est ?? -1) }, fmt.conc(est)),
        h('td', { 'data-value': String(SEMAFORO[m.semaforo]?.orden ?? 9) }, semaforoBadge(m.semaforo)),
        h('td', { 'data-value': CERTEZA[m.certeza]?.label || '' }, certezaBadge(m.certeza)),
        h('td', { class: 'num', 'data-value': String(lab ?? -1) }, lab != null ? fmt.conc(lab) : '—')));
    }
    table = h('table', { class: 'data-table samples', id: 'samples-table' },
      h('caption', { id: 'samples-cap' }, 'Muestras de cribado. Estimado = valor del lector con su calibración; laboratorio = confirmación.'),
      h('thead', null, h('tr', null, COLS.map(([key, label, type], i) => h('th', { scope: 'col', dataset: { type, key } },
        h('button', { type: 'button', class: 'sort-btn', commandfor: 'samples-table', command: '--sort', dataset: { col: String(i) } }, label, icon('chevron', { cls: 'sort-icon' })))))),
      tbody);
    table.addEventListener('command', (e) => { if (e.command === '--sort') sortBy(e.source); });
    if (!('commandForElement' in HTMLButtonElement.prototype)) {
      for (const b of table.tHead.querySelectorAll('button[command="--sort"]')) b.addEventListener('click', () => sortBy(b));
    }
    mount(tableHost, h('div', { class: 'table-wrap', role: 'region', 'aria-labelledby': 'samples-cap', tabindex: '0' }, table));
    applyFilter();
  }
  function sortBy(button) {
    const th = button.closest('th');
    const dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
    for (const c of table.tHead.rows[0].cells) c.removeAttribute('aria-sort');
    th.setAttribute('aria-sort', dir);
    const f = dir === 'ascending' ? 1 : -1, idx = th.cellIndex, num = th.dataset.type === 'number';
    const val = (r) => r.cells[idx].dataset.value ?? r.cells[idx].textContent.trim();
    const rows = [...tbody.rows].map((r) => [r, val(r)]).sort((a, b) => f * (num ? Number(a[1]) - Number(b[1]) : collator.compare(a[1], b[1])));
    for (const [r] of rows) (tbody.moveBefore ? tbody.moveBefore(r, null) : tbody.append(r));
    status.textContent = `Ordenado por ${button.textContent.trim()}, ${dir === 'ascending' ? 'ascendente' : 'descendente'}.`;
  }
  function applyFilter() {
    const vis = new Set(filtradas().map((m) => m.codigo));
    if (tbody) for (const r of tbody.rows) r.hidden = !vis.has(r.dataset.codigo);
    count.textContent = `${vis.size} de ${state.muestras.length} muestras.`;
  }

  const offs = [on('muestras', build), on('filtros', applyFilter)];
  build();
  const el = h('div', { class: 'view view-wide' },
    viewHeader('Muestras', 'Todas las muestras con su semáforo y su nivel de certeza. «Cribado» y «confirmado» nunca se mezclan.', exports),
    h('details', { class: 'filters-box', open: window.matchMedia('(width >= 48rem)').matches }, h('summary', null, 'Filtros', icon('chevron')), filt.el),
    count, tableHost, status,
    h('p', { class: 'meta', style: { margin: 0 } }, 'La versión pública excluye las muestras restringidas, quita responsables y coordenadas exactas, y agrupa en celdas de 0,1° (sección 7.7).'),
    legalNote());
  return { el, destroy() { offs.forEach((f) => f()); filt.destroy(); } };
}
