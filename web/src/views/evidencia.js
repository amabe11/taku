// Vista «Evidencia»: historial y búsqueda de corridas (MVP ampliado).
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { state, on } from '../state.js';
import { rowsOf } from '../runs.js';
import { createEvidenceTable } from '../components/evidence-table.js';
import { exportRun, openRunFlow } from '../components/run-dialog.js';
import { viewHeader, emptyState } from './common.js';

export function evidenciaView() {
  const table = createEvidenceTable({
    onExport: async (run_id) => {
      const run = state.runs.find((r) => r.run_id === run_id);
      if (run) exportRun({ run, rows: await rowsOf(run_id) });
    },
  });
  const note = h('p', { class: 'meta', style: { margin: 0, maxWidth: '75ch' } },
    'Cada corrida conserva su procedencia: ', h('b', null, 'Banco real'), ' (medida en la estación), ', h('b', null, 'Demostración'),
    ' (archivo de prueba), ', h('b', null, 'Histórico'), ' (fuente externa documentada) y ', h('b', null, 'Ensayo validado'),
    ' (resultado con comprobación). Las corridas descartadas no se borran: se ocultan salvo que las incluyas.');
  const emptySlot = h('div');
  const el = h('div', { class: 'view view-wide' },
    viewHeader('Evidencia', 'Muestras, corridas, controles y procedencia guardados en este navegador. Filtra por origen, estado de adquisición o estado de Hg.'),
    note, emptySlot, table.el);

  function render() {
    const has = state.runs.length > 0;
    table.el.hidden = !has;
    mount(emptySlot, has ? null : emptyState({
      iconName: 'evidence', title: 'Sin evidencia registrada',
      text: 'Cada corrida que inicies queda aquí con su ficha, controles, incidencias y archivo exportable.',
      actions: [h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openRunFlow() }, icon('play'), 'Iniciar corrida')],
    }));
    if (has) table.update(state.runs);
  }
  const off = on('runs', render);
  render();
  return { el, destroy: off };
}
