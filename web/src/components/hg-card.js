// HgStatusCard: el estado de Hg vive separado de la señal física. Cuatro estados distintos.
// Cualquier estado distinto de «pendiente» exige evidencia analítica documentada (método, matriz, fuente…).
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { HG, provTag } from './badges.js';

export const HG_TEXT = {
  pendiente: 'No existe una determinación de laboratorio para esta muestra. La tira es un cribado colorimétrico: con un criterio acordado puede priorizar la confirmación, pero no la reemplaza ni descarta Hg.',
  indeterminado: 'Un ensayo específico no permite concluir por controles, método o incertidumbre. Se documenta y se deriva o repite según el procedimiento acordado.',
  prioridad_confirmacion: 'La lectura de la tira superó el criterio operativo acordado con controles válidos. Corresponde confirmar la muestra en laboratorio; no es un resultado.',
  resultado_disponible: 'Resultado de laboratorio documentado, con su método, matriz, unidad, base, fuente e incertidumbre.',
};

export function hgDetails(hg) {
  if (!hg) return null;
  const rows = [
    ['Valor', hg.valor != null && hg.valor !== '' ? `${hg.valor} ${hg.unidad || ''}`.trim() : null],
    ['Analito', hg.analito], ['Método', hg.metodo], ['Matriz', hg.matriz], ['Base', hg.base],
    ['Incertidumbre', hg.incertidumbre], ['LOD / LOQ', hg.limites], ['Fuente', hg.fuente], ['Informe', hg.informe], ['Fecha', hg.fecha],
  ].filter(([, v]) => v);
  const dl = h('dl', { class: 'hg-dl' });
  for (const [k, v] of rows) dl.append(h('dt', null, k), h('dd', null, v));
  return dl;
}

/** @param {{estado_hg?: string, hg?: object}|null} run */
export function hgStatusCard(run, { compact = false } = {}) {
  const estado = run?.estado_hg || 'pendiente';
  const m = HG[estado] || HG.pendiente;
  const hg = estado === 'pendiente' ? null : run?.hg;
  return h('section', { class: 'card hg-card', dataset: { hg: estado }, 'aria-label': 'Estado de mercurio' },
    h('span', { class: 'hg-icon' }, icon(m.icon)),
    h('div', null,
      h('p', { class: 'hg-kicker' }, 'Estado de Hg · separado de las lecturas de la estación'),
      h('p', { class: 'hg-state' }, m.label),
      hg ? h('div', { style: { marginTop: '6px' } }, provTag(hg.demostracion ? 'archivo_prueba' : 'ensayo_validado'))
        : run?.hg_tira?.criterio?.demostracion && estado !== 'pendiente' ? h('div', { style: { marginTop: '6px' } }, provTag('archivo_prueba')) : null,
      compact ? null : h('p', { class: 'hg-text' }, HG_TEXT[estado]),
      compact ? null : hgDetails(hg),
      !compact && run?.hg_tira && estado !== 'resultado_disponible' ? h('p', { class: 'hg-text', style: { marginTop: '6px' } },
        h('b', null, 'Base: lectura de tira (cribado). '), run.hg_tira.motivo,
        run.hg_tira.criterio ? ` Criterio: ${run.hg_tira.criterio.metodo} · ${run.hg_tira.criterio.validado_por}.` : '') : null,
    ),
  );
}
