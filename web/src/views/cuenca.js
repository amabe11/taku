// Vista de cuenca (7.3): qué está aguas arriba de un punto (posibles fuentes) y qué comunidades están
// aguas abajo (posibles expuestos). Perfil lineal del eje principal, de la cabecera a la desembocadura.
import { h, s, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import * as fmt from '../lib/format.js';
import { state, on } from '../state.js';
import { SEMAFORO, MATRICES, posicionEnEje, contextoCuenca } from '../model.js';
import { semaforoBadge, matrizTag, demoSeal } from '../components/badges.js';
import { viewHeader, emptyState, dl } from './common.js';

export function cuencaView(codigo) {
  const host = h('div', { class: 'view view-wide' });
  let sel = codigo || null;
  function render() {
    const c = state.cuenca;
    if (!c) {
      mount(host, viewHeader('Vista de cuenca'), emptyState({ iconName: 'river', title: 'No hay una cuenca configurada',
        text: 'Para ubicar las muestras aguas arriba o aguas abajo hace falta el eje del río (trazado con SRTM), las comunidades y los frentes mineros del sitio piloto. Se definen con el equipo y las autoridades; en la demostración se usa una cuenca ficticia.' }));
      return;
    }
    const pos = (x) => ({ ...x, ...posicionEnEje(c.eje, x.lon, x.lat) });
    const largo = posicionEnEje(c.eje, c.eje[0][0], c.eje[0][1]).largo;
    const muestras = state.muestras.filter((m) => m.lat != null).map(pos).filter((m) => m.dist <= (c.radio_km ?? 15)).sort((a, b) => a.km - b.km);
    const comunidades = c.comunidades.map(pos), frentes = c.frentes.map(pos);
    if (!muestras.some((m) => m.codigo === sel)) sel = muestras.find((m) => m.semaforo === 'rojo')?.codigo || muestras[0]?.codigo || null;
    const m = muestras.find((x) => x.codigo === sel);
    const ctx = m ? contextoCuenca(m, c) : null;

    // ---------------- perfil SVG
    const W = 1000, H = 250, X0 = 40, X1 = W - 40, Y = 130;
    const x = (km) => X0 + (km / largo) * (X1 - X0);
    const svg = s('svg', { class: 'basin-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-labelledby': 'basin-t basin-d' },
      s('title', { id: 'basin-t' }, `Perfil de ${c.nombre}`),
      s('desc', { id: 'basin-d' }, `Eje de ${fmt.int(largo)} km de aguas arriba (izquierda) a aguas abajo (derecha), con ${muestras.length} muestras arriba de la línea y ${comunidades.length} comunidades y ${frentes.length} frentes mineros debajo.${m ? ` Muestra de referencia ${m.codigo} en el km ${fmt.int(m.km)}.` : ''}`),
      m ? s('rect', { class: 'basin-up', x: X0, y: Y - 70, width: x(m.km) - X0, height: 140 }) : null,
      m ? s('rect', { class: 'basin-down', x: x(m.km), y: Y - 70, width: X1 - x(m.km), height: 140 }) : null,
      s('line', { class: 'basin-river', x1: X0, y1: Y, x2: X1, y2: Y }),
      s('path', { class: 'basin-arrow', d: `M${X1 - 14} ${Y - 7}L${X1} ${Y}L${X1 - 14} ${Y + 7}` }),
      s('text', { class: 'basin-cap', x: X0, y: 24 }, 'Aguas arriba'),
      s('text', { class: 'basin-cap', x: X1, y: 24, 'text-anchor': 'end' }, 'Aguas abajo →'),
      [0, 50, 100, 150, 200, 250].filter((k) => k <= largo).map((k) => [s('line', { class: 'basin-tick', x1: x(k), y1: Y + 4, x2: x(k), y2: Y + 10 }), s('text', { class: 'basin-km', x: x(k), y: H - 6, 'text-anchor': 'middle' }, `${k} km`)]),
      muestras.map((p, i) => s('g', { class: 'basin-smp', 'data-sem': p.semaforo, 'data-matriz': p.matriz, 'data-sel': String(p.codigo === sel) },
        s('line', { x1: x(p.km), y1: Y, x2: x(p.km), y2: Y - 22 - (i % 3) * 14 }),
        p.matriz === 'pescado' ? s('path', { d: `M${x(p.km)} ${Y - 30 - (i % 3) * 14}l7 7l-7 7l-7-7z` })
          : p.matriz === 'cola' ? s('rect', { x: x(p.km) - 6, y: Y - 29 - (i % 3) * 14, width: 12, height: 12 })
            : s('circle', { cx: x(p.km), cy: Y - 23 - (i % 3) * 14, r: 6.5 }))),
      frentes.map((f) => s('g', { class: 'basin-frente' }, s('path', { d: `M${x(f.km)} ${Y + 18}l7 7l-7 7l-7-7z` }), s('text', { x: x(f.km), y: Y + 50, 'text-anchor': 'middle' }, f.nombre.replace(' (ficticio)', '')))),
      comunidades.map((co) => s('g', { class: 'basin-com', 'data-down': String(!!ctx && !ctx.fuera && co.km > ctx.km) }, s('circle', { cx: x(co.km), cy: Y + 25, r: 6 }), s('text', { x: x(co.km), y: Y + 68, 'text-anchor': 'middle' }, co.nombre.replace(' (ficticia)', '')))),
    );

    const picker = h('div', { class: 'field', style: { maxWidth: '520px' } },
      h('label', { for: 'basin-sel' }, 'Muestra de referencia'),
      h('div', { class: 'select-wrap' }, h('select', { class: 'select', id: 'basin-sel', onchange: (e) => { sel = e.target.value; history.replaceState(null, '', `#/cuenca/${encodeURIComponent(sel)}`); render(); document.getElementById('basin-sel')?.focus(); } },
        muestras.map((p) => h('option', { value: p.codigo, selected: p.codigo === sel || null }, `km ${fmt.int(p.km)} · ${p.codigo} · ${SEMAFORO[p.semaforo].label} · ${MATRICES[p.matriz].label}`))), icon('chevron')));

    mount(host,
      viewHeader('Vista de cuenca', 'Qué hay aguas arriba de un punto (posibles fuentes) y qué comunidades están aguas abajo (posibles expuestos).'),
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('div', null, h('h2', { class: 'card-title' }, c.nombre), h('p', { class: 'card-sub' }, c.nota)), state.mode === 'demo' ? h('span', { class: 'prov', dataset: { prov: 'archivo_prueba' } }, 'Demostración') : null),
        picker,
        h('div', { class: 'basin-wrap' }, svg),
        h('p', { class: 'meta', style: { margin: 0 } }, 'Cada punto se proyecta sobre el eje principal (los afluentes cuentan en el punto donde se unen). Que un punto esté aguas abajo de otro no prueba una causa.')),
      m ? h('div', { class: 'two-col' },
        h('section', { class: 'card', 'aria-labelledby': 'up-t' },
          h('h2', { class: 'card-title', id: 'up-t' }, `Aguas arriba de ${m.codigo}: posibles fuentes`),
          h('div', { class: 'badge-row', style: { margin: 'var(--sp-2) 0' } }, semaforoBadge(m.semaforo), matrizTag(m.matriz), demoSeal(m)),
          ctx.fuentes.length ? h('ul', { class: 'reasons' }, ctx.fuentes.map((f) => h('li', null, `${f.nombre} · ${fmt.int(ctx.km - f.km)} km aguas arriba`))) : h('p', { class: 'meta' }, 'No hay frentes mineros registrados aguas arriba.'),
          h('p', { class: 'meta', style: { margin: 0 } }, 'Para ver el avance de los frentes, activa HLS en el mapa y compara fechas.')),
        h('section', { class: 'card', 'aria-labelledby': 'down-t' },
          h('h2', { class: 'card-title', id: 'down-t' }, 'Aguas abajo: posibles expuestos'),
          ctx.comunidades.length ? h('ul', { class: 'reasons' }, ctx.comunidades.map((co) => h('li', null, `${co.nombre} · ${fmt.int(co.km - ctx.km)} km aguas abajo · ${fmt.int(co.poblacion)} hab.`))) : h('p', { class: 'meta' }, 'No hay comunidades registradas aguas abajo.'),
          dl([['Población aguas abajo', `${fmt.int(ctx.poblacion)} hab.${state.mode === 'demo' ? ' (ficticio; en un caso real se estima con SEDAC GPW)' : ''}`]]),
          h('div', { class: 'view-actions', style: { marginTop: 'var(--sp-2)' } },
            h('a', { class: 'btn btn-ghost', href: `#/muestra/${encodeURIComponent(m.codigo)}` }, icon('evidence'), 'Ficha de la muestra'),
            h('a', { class: 'btn btn-ghost', href: `#/mapa/${encodeURIComponent(m.codigo)}` }, icon('map'), 'Ver en el mapa')))) : null,
      h('section', { class: 'card' },
        h('h2', { class: 'card-title' }, 'Muestras en el eje (de aguas arriba a aguas abajo)'),
        h('div', { class: 'table-wrap', role: 'region', 'aria-label': 'Muestras en el eje', tabindex: '0' }, h('table', { class: 'data-table compact' },
          h('thead', null, h('tr', null, ['km', 'Código', 'Matriz', 'Semáforo', 'Distancia al cauce'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', null, muestras.map((p) => h('tr', null,
            h('td', { class: 'num' }, fmt.int(p.km)),
            h('th', { scope: 'row' }, h('a', { class: 'row-link', href: `#/cuenca/${encodeURIComponent(p.codigo)}`, onclick: (e) => { e.preventDefault(); sel = p.codigo; history.replaceState(null, '', `#/cuenca/${encodeURIComponent(sel)}`); render(); } }, p.codigo)),
            h('td', null, matrizTag(p.matriz)), h('td', null, semaforoBadge(p.semaforo)), h('td', { class: 'num' }, `${fmt.mv(p.dist)} km`))))))));
  }
  const off = on('muestras', render);
  render();
  return { el: host, destroy: off };
}
