// Vista «Cola de priorización» (7.3): lista ordenada de muestras para enviar al laboratorio, con reglas
// transparentes. La decisión la toma la autoridad; la web no combina el contexto satelital en un índice (7.5).
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import * as fmt from '../lib/format.js';
import { state, on } from '../state.js';
import { MATRICES, SEMAFORO, UMBRALES_REFERENCIA, colaPriorizacion, estimado, controlesFallidos, umbralDe } from '../model.js';
import { semaforoBadge, certezaBadge, matrizTag, demoSeal } from '../components/badges.js';
import { enviarALaboratorio, cargarResultado } from './muestra.js';
import { viewHeader, emptyState, legalNote } from './common.js';

export function priorizacionView() {
  const host = h('div');
  function item(rank, { m, ctx, poblacion }) {
    const est = estimado(m), ref = umbralDe(m);
    const reasons = [
      `Semáforo ${SEMAFORO[m.semaforo].label.toLowerCase()}: ${SEMAFORO[m.semaforo].accion.toLowerCase()}`,
      est != null && ref ? `Estimado ${fmt.conc(est)} mg/kg frente a la referencia de ${fmt.conc(ref.valor)} mg/kg (${fmt.mv((est / ref.valor) * 100)} %).` : null,
      ctx && !ctx.fuera ? (ctx.comunidades.length ? `${ctx.comunidades.length} comunidades aguas abajo (${fmt.int(poblacion)} hab., OSM).` : 'Sin comunidades registradas aguas abajo.') : null,
      ctx && !ctx.fuera && ctx.fuentes.length ? `Aguas arriba: ${ctx.fuentes.map((f) => f.nombre).join(', ')}.` : null,
      `Tomada el ${fmt.dateOnly(m.fecha_iso)} por ${m.responsable || '—'}.`,
    ].filter(Boolean);
    return h('li', { class: 'card prio-item' },
      h('div', { class: 'prio-rank', 'aria-hidden': 'true' }, String(rank)),
      h('div', { class: 'prio-body' },
        h('div', { class: 'card-head' },
          h('div', null, h('h3', { class: 'card-title' }, h('span', { class: 'sr-only' }, `Puesto ${rank}: `), h('a', { class: 'row-link', href: `#/muestra/${encodeURIComponent(m.codigo)}` }, m.codigo)),
            h('div', { class: 'badge-row', style: { marginTop: '6px' } }, semaforoBadge(m.semaforo), matrizTag(m.matriz), demoSeal(m))),
          h('div', { class: 'view-actions' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => enviarALaboratorio(m) }, icon('flask'), 'Enviar al laboratorio'))),
        h('ul', { class: 'reasons' }, reasons.map((r) => h('li', null, r)))));
  }
  function render() {
    const { enCola, enVerificacion, repetir } = colaPriorizacion(state.muestras, state.cuenca);
    mount(host,
      h('section', { class: 'card' },
        h('h2', { class: 'card-title' }, 'Cómo se ordena'),
        h('ol', { class: 'reasons' },
          h('li', null, 'Semáforo: primero rojo, luego amarillo y al final verde. En la versión 1 un verde no permite dejar de enviar muestras.'),
          h('li', null, 'Población aguas abajo dentro de la cuenca (más expuestos primero).'),
          h('li', null, 'Valor estimado frente al umbral de referencia de su matriz (sin copiar umbrales entre matrices).'),
          h('li', null, 'Antigüedad: a igualdad, la muestra más antigua primero.')),
        h('p', { class: 'meta', style: { margin: 0 } }, 'Es una sugerencia ordenada con reglas a la vista: no es un resultado. Un índice que combine el cribado con el contexto satelital solo se propondrá con datos validados.')),
      enCola.length
        ? h('section', { 'aria-labelledby': 'cola-t' }, h('h2', { id: 'cola-t', class: 'section-title' }, `Por enviar al laboratorio · ${enCola.length}`), h('ol', { class: 'prio-list' }, enCola.map((x, i) => item(i + 1, x))))
        : emptyState({ iconName: 'queue', title: 'No hay muestras por enviar', text: 'Todas las muestras están en verificación, confirmadas o deben repetirse.' }),
      h('div', { class: 'two-col' },
        h('section', { class: 'card', 'aria-labelledby': 'ver-t' },
          h('h2', { class: 'card-title', id: 'ver-t' }, `En verificación · ${enVerificacion.length}`),
          enVerificacion.length ? h('ul', { class: 'mini-queue' }, enVerificacion.map((m) => h('li', null,
            h('a', { class: 'row-link', href: `#/muestra/${encodeURIComponent(m.codigo)}` }, m.codigo), semaforoBadge(m.semaforo),
            h('span', { class: 'meta' }, `${m.laboratorio?.laboratorio || '—'} · enviada ${fmt.dateOnly(m.laboratorio?.enviada_en)}`),
            h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => cargarResultado(m) }, 'Cargar resultado')))) : h('p', { class: 'meta', style: { margin: 0 } }, 'Ninguna.')),
        h('section', { class: 'card', 'aria-labelledby': 'rep-t' },
          h('h2', { class: 'card-title', id: 'rep-t' }, `Repetir en campo (inválidas) · ${repetir.length}`),
          repetir.length ? h('ul', { class: 'mini-queue' }, repetir.map((m) => h('li', null,
            h('a', { class: 'row-link', href: `#/muestra/${encodeURIComponent(m.codigo)}` }, m.codigo), semaforoBadge(m.semaforo),
            h('span', { class: 'meta' }, controlesFallidos(m).join('; ') || 'Control fallido')))) : h('p', { class: 'meta', style: { margin: 0 } }, 'Ninguna.'))),
      legalNote());
  }
  const off = on('muestras', render);
  render();
  return { el: h('div', { class: 'view' }, viewHeader('Cola de priorización', 'Qué muestras enviar primero al laboratorio y por qué. El rojo sirve para priorizar; el verde no descarta.'), host), destroy: off };
}
