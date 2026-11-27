// Vista «Mapas»: dos mapas separados del mismo territorio (Alcoche, río Coroico).
//   1. Muestras: semáforo de priorización (qué enviar primero al laboratorio).
//   2. MAPE: estado legal de las unidades mineras (al día · en trámite · ilegal o presunta ilegal).
// Se ve uno por pantalla (teléfono y PC), con un selector Muestras / MAPE. Con «Mismo encuadre» el otro abre en el
// mismo lugar, para comparar: ¿dónde coinciden frentes ilegales y muestras rojas?
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import * as fmt from '../lib/format.js';
import { createMap } from '../components/map-canvas.js';
import { state, on, filtradas, readPref, writePref } from '../state.js';
import { SEMAFORO, LEGAL, colaPriorizacion, estimado, MATRICES, distanciaKm } from '../model.js';
import { semaforoBadge, legalBadge } from '../components/badges.js';
import { legalNote } from './common.js';

export function mapaView(focus) {
  let bloqueo = false;
  const vincular = (origen) => (v) => {
    if (!state.ui.vincular || bloqueo) return;
    bloqueo = true;
    (origen === 'a' ? mapB : mapA).setView(v);
    bloqueo = false;
  };
  const mapA = createMap({ id: 'm-muestras', modo: 'muestras', focus, titulo: 'Muestras · semáforo de priorización', onView: vincular('a') });
  const mapB = createMap({ id: 'm-mape', modo: 'mape', focus, titulo: 'MAPE · estado legal', onView: vincular('b') });

  const linkIn = h('input', { type: 'checkbox', id: 'map-link', checked: state.ui.vincular, onchange: (e) => {
    state.ui.vincular = e.target.checked; writePref('ahg.mapas.vincular', state.ui.vincular);
    if (state.ui.vincular) mapB.setView(mapA.getView());
  } });
  // Un mapa por pantalla: el selector elige cuál se ve (se recuerda). Con «Mismo encuadre», el otro mapa abre
  // donde quedó este.
  const inicial = focus && state.mape.some((u) => u.id === focus) ? 'mape' : readPref('ahg.mapas.ver', 'muestras') === 'mape' ? 'mape' : 'muestras';
  const grid = h('div', { class: 'map-pair', dataset: { ver: inicial } }, mapA.el, mapB.el);
  const ver = (v) => {
    grid.dataset.ver = v; writePref('ahg.mapas.ver', v);
    window.dispatchEvent(new Event('resize'));
    if (state.ui.vincular) requestAnimationFrame(() => (v === 'mape' ? mapB.setView(mapA.getView()) : mapA.setView(mapB.getView())));
  };
  const tab = (v, label, ic) => h('label', { class: 'seg-opt' },
    h('input', { type: 'radio', name: 'map-ver', value: v, checked: v === inicial || null, onchange: () => ver(v) }),
    icon(ic), label);
  const head = h('div', { class: 'map-head' },
    h('div', { class: 'map-head-text' },
      h('h1', { tabindex: '-1', 'data-view-title': '' }, 'Mapas · Alcoche, Caranavi'),
      h('p', null, 'Río Coroico → Kaka. Mapa de muestras: qué enviar primero al laboratorio. Mapa MAPE: la minería y su situación legal.')),
    h('fieldset', { class: 'seg', 'aria-label': 'Mapa visible' }, h('legend', { class: 'sr-only' }, 'Mapa visible'), tab('muestras', 'Muestras', 'flask'), tab('mape', 'MAPE', 'pick')),
    h('label', { class: 'check check-inline', for: 'map-link' }, linkIn, h('span', null, icon('link'), ' Mismo encuadre en los dos mapas')));

  const resumen = h('section', { class: 'map-summary', 'aria-label': 'Resumen' });
  function render() {
    const list = filtradas();
    const { enCola, repetir } = colaPriorizacion(list, state.cuenca);
    const bar = h('div', { class: 'sem-bar', role: 'img', 'aria-label': Object.entries(SEMAFORO).map(([key, v]) => `${v.label}: ${list.filter((m) => m.semaforo === key).length}`).join(', ') },
      Object.keys(SEMAFORO).map((key) => { const n = list.filter((m) => m.semaforo === key).length; return n ? h('span', { dataset: { sem: key }, style: { flexGrow: n } }) : null; }));
    const nL = (key) => state.mape.filter((u) => u.estado_legal === key).length;
    // Cruce de los dos mapas: muestras rojas a menos de 3 km de una unidad ilegal o presunta ilegal.
    const ilegales = state.mape.filter((u) => u.estado_legal === 'ilegal');
    const cruce = list.filter((m) => m.semaforo === 'rojo' && m.lat != null && ilegales.some((u) => distanciaKm(m.lon, m.lat, u.lon, u.lat) <= 3));
    mount(resumen,
      h('div', { class: 'card' },
        h('h2', { class: 'card-title' }, `Muestras · ${list.length}`),
        list.length ? bar : null,
        h('ul', { class: 'sem-list' }, Object.entries(SEMAFORO).map(([key]) => h('li', null, semaforoBadge(key), h('span', { class: 'mono' }, String(list.filter((m) => m.semaforo === key).length))))),
        h('p', { class: 'meta', style: { margin: 'var(--sp-2) 0 0' } }, state.mode === 'demo' ? 'Muestras simuladas sobre el sitio real.' : state.nube.mensaje || 'Servidor Ahgora')),
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Primero al laboratorio'), h('a', { class: 'btn btn-quiet', href: '#/priorizacion' }, 'Cola completa', icon('arrow_right'))),
        enCola.length ? h('ol', { class: 'mini-queue' }, enCola.slice(0, 4).map(({ m, poblacion }) => h('li', null,
          h('a', { class: 'row-link', href: `#/muestra/${encodeURIComponent(m.codigo)}` }, m.codigo), semaforoBadge(m.semaforo),
          h('span', { class: 'meta' }, `${MATRICES[m.matriz].label}${estimado(m) != null ? ` · ${fmt.conc(estimado(m))} mg/kg est.` : ''}${poblacion ? ` · ${fmt.int(poblacion)} hab. aguas abajo` : ''}`))))
          : h('p', { class: 'meta', style: { margin: 0 } }, 'No hay muestras por enviar.'),
        repetir.length ? h('p', { class: 'meta', style: { margin: 'var(--sp-2) 0 0' } }, `${repetir.length} por repetir (control fallido).`) : null),
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, `Minería (MAPE) · ${state.mape.length} unidades`), h('a', { class: 'btn btn-quiet', href: '#/mape' }, 'Registro', icon('arrow_right'))),
        h('ul', { class: 'sem-list' }, ['al_dia', 'en_tramite', 'ilegal'].map((key) => h('li', null, legalBadge({ estado_legal: key }), h('span', { class: 'mono' }, String(nL(key)))))),
        h('p', { class: 'meta', style: { margin: 'var(--sp-2) 0 0' } }, cruce.length
          ? `${cruce.length} muestra${cruce.length > 1 ? 's' : ''} con prioridad alta a menos de 3 km de un frente ilegal o presunto ilegal.`
          : 'Ninguna muestra roja junto a un frente ilegal.')),
      legalNote());
  }
  const offs = [on('muestras', render), on('filtros', render), on('nube', render), on('mape', render)];
  render();
  const el = h('div', { class: 'view-maps' }, head, grid, resumen);
  return { el, destroy() { mapA.destroy(); mapB.destroy(); offs.forEach((f) => f()); } };
}
