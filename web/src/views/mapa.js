// Vista «Mapa de muestras»: dónde (mapa con semáforo, certeza y capas NASA) → resumen y qué sigue.
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import * as fmt from '../lib/format.js';
import { createMap } from '../components/map-canvas.js';
import { state, on, filtradas, hayFiltros } from '../state.js';
import { SEMAFORO, colaPriorizacion, estimado, MATRICES } from '../model.js';
import { semaforoBadge, demoSeal } from '../components/badges.js';
import { legalNote } from './common.js';

export function mapaView(focus) {
  const map = createMap({ focus });
  const panel = h('section', { class: 'map-panel', 'aria-labelledby': 'map-panel-title' });
  function render() {
    const list = filtradas();
    const total = list.length;
    const { enCola, enVerificacion, repetir } = colaPriorizacion(list, state.cuenca);
    const bar = h('div', { class: 'sem-bar', role: 'img', 'aria-label': Object.entries(SEMAFORO).map(([k, v]) => `${v.label}: ${list.filter((m) => m.semaforo === k).length}`).join(', ') },
      Object.keys(SEMAFORO).map((k) => { const n = list.filter((m) => m.semaforo === k).length; return n ? h('span', { dataset: { sem: k }, style: { flexGrow: n } }) : null; }));
    mount(panel,
      h('div', { class: 'card' },
        h('h2', { class: 'card-title', id: 'map-panel-title' }, hayFiltros() ? `Muestras filtradas · ${total}` : `Todas las muestras · ${total}`),
        h('p', { class: 'card-sub' }, state.mode === 'demo' ? 'Datos de demostración' : `Servidor Ahgora · ${state.nube.mensaje || ''}`),
        total ? bar : null,
        h('ul', { class: 'sem-list' }, Object.entries(SEMAFORO).map(([k, v]) => h('li', null, semaforoBadge(k), h('span', { class: 'mono' }, String(list.filter((m) => m.semaforo === k).length))))),
      ),
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Primeras en la cola de laboratorio'), h('a', { class: 'btn btn-quiet', href: '#/priorizacion' }, 'Ver cola', icon('arrow_right'))),
        enCola.length ? h('ol', { class: 'mini-queue' }, enCola.slice(0, 5).map(({ m, poblacion }) => h('li', null,
          h('a', { class: 'row-link', href: `#/muestra/${encodeURIComponent(m.codigo)}` }, m.codigo),
          semaforoBadge(m.semaforo),
          h('span', { class: 'meta' }, `${MATRICES[m.matriz].label}${estimado(m) != null ? ` · ${fmt.conc(estimado(m))} mg/kg est.` : ''}${poblacion ? ` · ${fmt.int(poblacion)} hab. aguas abajo` : ''}`))))
          : h('p', { class: 'meta', style: { margin: 0 } }, 'No hay muestras por enviar.'),
        h('p', { class: 'meta', style: { margin: 'var(--sp-2) 0 0' } }, `${enVerificacion.length} en verificación · ${repetir.length} por repetir (inválidas).`)),
      legalNote(),
    );
  }
  const offs = [on('muestras', render), on('filtros', render), on('nube', render)];
  render();
  const el = h('div', { class: 'view-map' }, h('h1', { class: 'sr-only', tabindex: '-1', 'data-view-title': '' }, 'Mapa de muestras'), map.el, panel);
  return { el, destroy() { map.destroy(); offs.forEach((f) => f()); } };
}
