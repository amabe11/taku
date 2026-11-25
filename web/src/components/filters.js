// Filtros por matriz, fecha, cuenca, estado y responsable (sección 7.3). Compartidos por el mapa y la tabla.
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { state, setFiltros, FILTROS_VACIOS, on } from '../state.js';
import { MATRICES, SEMAFORO, CERTEZA } from '../model.js';

const uniq = (k) => [...new Set(state.muestras.map((m) => m[k]).filter(Boolean))].sort();

export function filtersForm(prefix = 'f') {
  const select = (name, label, options) => h('div', { class: 'field' },
    h('label', { for: `${prefix}-${name}` }, label),
    h('div', { class: 'select-wrap' },
      h('select', { class: 'select', id: `${prefix}-${name}`, name },
        h('option', { value: '' }, 'Todos'), options.map(([v, l]) => h('option', { value: v, selected: state.filtros[name] === v || null }, l))),
      icon('chevron')));
  const date = (name, label) => h('div', { class: 'field' }, h('label', { for: `${prefix}-${name}` }, label),
    h('input', { class: 'input mono', type: 'date', id: `${prefix}-${name}`, name, value: state.filtros[name] }));
  const form = h('form', { class: 'filters', role: 'search', 'aria-label': 'Filtrar muestras', onsubmit: (e) => e.preventDefault() });
  function build() {
    form.replaceChildren(
      h('div', { class: 'field' }, h('label', { for: `${prefix}-texto` }, 'Buscar'),
        h('input', { class: 'input', type: 'search', id: `${prefix}-texto`, name: 'texto', placeholder: 'Código, responsable…', value: state.filtros.texto })),
      select('matriz', 'Matriz', Object.entries(MATRICES).map(([k, v]) => [k, v.label])),
      select('semaforo', 'Semáforo', Object.entries(SEMAFORO).map(([k, v]) => [k, v.label])),
      select('certeza', 'Nivel de certeza', Object.entries(CERTEZA).map(([k, v]) => [k, v.label])),
      select('cuenca', 'Cuenca', uniq('cuenca').map((v) => [v, v])),
      select('responsable', 'Responsable', uniq('responsable').map((v) => [v, v])),
      date('desde', 'Desde'), date('hasta', 'Hasta'),
      h('div', { class: 'field' }, h('span', { class: 'field-label', 'aria-hidden': 'true' }, ' '),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { setFiltros({ ...FILTROS_VACIOS }); build(); } }, 'Quitar filtros')));
  }
  form.addEventListener('input', (e) => { if (e.target.name) setFiltros({ [e.target.name]: e.target.value }); });
  build();
  const off = on('muestras', () => { if (!form.contains(document.activeElement)) build(); });
  return { el: form, destroy: off };
}
