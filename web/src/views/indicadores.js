// Panel de indicadores (7.3 y 9): número de muestras, porcentaje en cada color, tiempos y, cuando haya
// datos, desempeño del cribado frente al laboratorio. La transparencia sobre el método es parte del sistema.
import { h, mount } from '../lib/dom.js';
import * as fmt from '../lib/format.js';
import { state, on, filtradas, hayFiltros } from '../state.js';
import { SEMAFORO, CERTEZA, MATRICES, UMBRALES_REFERENCIA, indicadores } from '../model.js';
import { semaforoBadge } from '../components/badges.js';
import { viewHeader, legalNote } from './common.js';

const stat = (k, v, note) => h('div', { class: 'card stat' }, h('span', { class: 'stat-k' }, k), h('span', { class: 'stat-v' }, v), note ? h('span', { class: 'metric-note' }, note) : null);

function semBar(counts, total, label) {
  return h('div', { class: 'sem-bar', role: 'img', 'aria-label': `${label}: ${Object.entries(SEMAFORO).map(([k, v]) => `${v.label} ${counts[k] || 0}`).join(', ')}` },
    Object.keys(SEMAFORO).map((k) => (counts[k] ? h('span', { dataset: { sem: k }, style: { flexGrow: counts[k] }, title: `${SEMAFORO[k].label}: ${counts[k]} (${fmt.pct(counts[k] / total)})` }) : null)));
}

export function indicadoresView() {
  const host = h('div', { class: 'stack' });
  function render() {
    const list = filtradas();
    const I = indicadores(list);
    const D = I.desempeno;
    const pocos = D.n < 30;
    mount(host,
      hayFiltros() ? h('p', { class: 'meta', style: { margin: 0 } }, `Calculado sobre ${I.total} muestras filtradas (de ${state.muestras.length}). Los filtros se cambian en Muestras o en el mapa.`) : null,
      h('div', { class: 'stat-grid' },
        stat('Muestras', fmt.int(I.total), state.mode === 'demo' ? 'Demostración' : null),
        stat('Cribado', fmt.int(I.porCerteza.cribado), 'requieren confirmación'),
        stat('En verificación', fmt.int(I.porCerteza.en_verificacion), 'enviadas, sin resultado'),
        stat('Confirmadas', fmt.int(I.porCerteza.confirmado), 'por laboratorio'),
        stat('Mediana hasta el envío', I.tiempos.envioDias != null ? `${fmt.mv(I.tiempos.envioDias)} días` : '—', `${I.tiempos.nEnvio} muestras`),
        stat('Mediana hasta el resultado', I.tiempos.resultadoDias != null ? `${fmt.mv(I.tiempos.resultadoDias)} días` : '—', `${I.tiempos.nResultado} muestras · cribado ≈ 30 min`)),

      h('section', { class: 'card' },
        h('h2', { class: 'card-title' }, 'Porcentaje en cada color'),
        I.total ? semBar(I.porColor, I.total, 'Todas las matrices') : null,
        h('div', { class: 'table-wrap', style: { marginTop: 'var(--sp-3)' } }, h('table', { class: 'data-table compact' },
          h('caption', null, 'Muestras por matriz y semáforo'),
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Matriz'), Object.keys(SEMAFORO).map((k) => h('th', { scope: 'col' }, semaforoBadge(k))), h('th', { scope: 'col', class: 'num' }, 'Total'))),
          h('tbody', null,
            Object.entries(I.porMatriz).map(([k, r]) => h('tr', null, h('th', { scope: 'row' }, MATRICES[k].label),
              Object.keys(SEMAFORO).map((sk) => h('td', { class: 'num' }, r.total ? `${r[sk]} · ${fmt.pct(r[sk] / r.total)}` : '—')), h('td', { class: 'num' }, String(r.total)))),
            h('tr', null, h('th', { scope: 'row' }, 'Todas'), Object.keys(SEMAFORO).map((sk) => h('td', { class: 'num' }, I.total ? `${I.porColor[sk]} · ${fmt.pct(I.porColor[sk] / I.total)}` : '—')), h('td', { class: 'num' }, String(I.total))))))),

      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Desempeño del cribado frente al laboratorio'), h('span', { class: 'meta' }, `${D.n} muestras confirmadas`)),
        pocos ? h('p', { class: 'warn-note' }, `Con ${D.n} muestras confirmadas no se puede concluir nada. La Fase 2 prevé 30 a 50 muestras reales divididas en dos (mitad Ahgora, mitad laboratorio), incluyendo a propósito muestras cercanas al umbral. No anunciamos porcentajes antes de medirlos.`) : null,
        h('div', { class: 'stat-grid' },
          stat('Sensibilidad', fmt.pct(D.sensibilidad), 'de las realmente preocupantes, cuántas detecta'),
          stat('Tasa de falsos negativos', fmt.pct(D.tasaFN), 'el error más grave del cribado'),
          stat('Especificidad', fmt.pct(D.especificidad), 'de las limpias, cuántas clasifica bien'),
          stat('Sin necesidad de envío', fmt.pct(D.sinEnvio), 'verdes confirmadas bajo el umbral'),
          stat('Correlación (log)', D.correlacion != null ? fmt.tc(D.correlacion) : '—', `estimado vs. laboratorio · ${D.nCorrelacion} pares`)),
        h('div', { class: 'table-wrap', style: { marginTop: 'var(--sp-3)', maxWidth: '640px' } }, h('table', { class: 'data-table compact' },
          h('caption', null, 'Tabla de confusión (positivo de cribado = rojo o amarillo)'),
          h('thead', null, h('tr', null, h('td'), h('th', { scope: 'col' }, 'Laboratorio ≥ umbral'), h('th', { scope: 'col' }, 'Laboratorio < umbral'))),
          h('tbody', null,
            h('tr', null, h('th', { scope: 'row' }, 'Cribado rojo o amarillo'), h('td', { class: 'num' }, `${D.vp} verdaderos positivos`), h('td', { class: 'num' }, `${D.fp} falsos positivos`)),
            h('tr', null, h('th', { scope: 'row' }, 'Cribado verde'), h('td', { class: 'num', dataset: { fn: String(D.fn > 0) } }, `${D.fn} falsos negativos`), h('td', { class: 'num' }, `${D.vn} verdaderos negativos`))))),
        h('p', { class: 'meta' }, 'Umbrales de referencia usados aquí: ', Object.entries(UMBRALES_REFERENCIA).map(([k, u]) => `${MATRICES[k].label} ${fmt.conc(u.valor)} mg/kg (${u.fuente})`).join(' · '), '. Las inválidas no cuentan.'),
        h('p', { class: 'meta', style: { margin: 0 } }, 'Regla de seguridad: mientras la tasa de falsos negativos no esté demostrada como aceptable, ningún verde se usa para descartar una muestra de riesgo.')),

      h('section', { class: 'card' },
        h('h2', { class: 'card-title' }, 'Cómo se medirá el impacto en el piloto'),
        h('ul', { class: 'limits mono' },
          h('li', null, 'Muestras evitadas (%) = muestras que el cribado clasifica sin necesidad de envío / total'),
          h('li', null, 'Tiempo ahorrado = (tiempo hasta el resultado de laboratorio − tiempo del cribado) × muestras priorizadas'),
          h('li', null, 'Costo evitado = muestras no enviadas × (costo de laboratorio + transporte) − costo del cribado')),
        h('p', { class: 'meta', style: { margin: 0 } }, 'Las cifras reales salen de la Fase 2. Costo del cribado SED ≈ Bs 5–6 por prueba (sin mano de obra ni gestión de residuos).')),
      legalNote());
  }
  const offs = [on('muestras', render), on('filtros', render)];
  render();
  return { el: h('div', { class: 'view view-wide' }, viewHeader('Indicadores', 'Cuántas muestras hay, en qué color y, cuando haya confirmaciones, qué tan bien acierta el cribado.'), host), destroy() { offs.forEach((f) => f()); } };
}
