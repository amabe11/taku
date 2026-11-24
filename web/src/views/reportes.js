// Vista «Reportes»: ficha de revisión por corrida (imprimible / PDF del navegador), CSV y JSON.
// No hay publicación automática: la ficha se entrega para revisión técnica antes de cualquier remisión.
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { announce } from '../lib/announce.js';
import * as fmt from '../lib/format.js';
import { state, on, summarize, N_ROWS } from '../state.js';
import { rowsOf, markExported } from '../runs.js';
import { createRunChart } from '../components/run-chart.js';
import { provTag, acquisitionBadge, controlState, HG } from '../components/badges.js';
import { hgDetails } from '../components/hg-card.js';
import { exportRun } from '../components/run-dialog.js';
import { downloadText } from '../csv.js';
import { viewHeader, emptyState, runOptionLabel, tipoLabel, matrizLabel, dl } from './common.js';
import { lemnaSummary } from './bioindicador.js';

const nf1 = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const PLAIN_HG = {
  pendiente: 'Todavía no sabemos si hay mercurio. Eso solo lo puede decir un laboratorio.',
  indeterminado: 'La prueba rápida no fue concluyente. Se repetirá o se enviará la muestra al laboratorio.',
  prioridad_confirmacion: 'La prueba rápida pide revisar esta muestra primero. Un laboratorio confirmará si hay mercurio y cuánto.',
  resultado_disponible: 'El laboratorio ya respondió. El resultado y cómo se midió están en la ficha técnica.',
};

export const LIMITACIONES = [
  'La tira es un cribado colorimétrico leído en cuentas R, G, B y C; el Δ cromático es una magnitud óptica, no una concentración de Hg.',
  'Sin curva de calibración validada para la matriz, la lectura no se convierte a mg/L ni a mg/kg.',
  'El estado de Hg solo cambia con un ensayo específico o un informe de laboratorio documentado.',
  'Sitio piloto por definir: no hay coordenadas de campo asociadas a esta corrida.',
];

async function exportJson(runIds) {
  const runs = state.runs.filter((r) => runIds.includes(r.run_id));
  const payload = { generado: new Date().toISOString(), fuente: 'Web local Hg-Guard', advertencia: LIMITACIONES[0], corridas: [] };
  for (const r of runs) payload.corridas.push({ ...r, filas: (await rowsOf(r.run_id)).map((x, seq) => x || { seq, t_seg: seq, temp_c: null, r: null, g: null, b: null, c: null, motivo: 'sin_recibir' }) });
  const name = runIds.length === 1 ? `${runIds[0]}_ficha.json` : `hg-guard_corridas_${new Date().toISOString().slice(0, 10)}.json`;
  downloadText(JSON.stringify(payload, null, 2), name, 'application/json');
  announce(`JSON descargado: ${name}.`);
}

export function reportesView() {
  const chart = createRunChart();
  const select = h('select', { class: 'select', id: 'rep-run', onchange: () => load(select.value) });
  const ficha = h('article', { class: 'card print-area', 'aria-labelledby': 'ficha-rev-title' });
  const community = h('section', { class: 'card community no-print', 'aria-labelledby': 'com-t' });
  const actions = h('div', { class: 'view-actions' });
  const emptySlot = h('div');
  const body = h('div', { class: 'report-grid' },
    h('div', { class: 'toolbar no-print' },
      h('div', { class: 'field' }, h('label', { for: 'rep-run' }, 'Corrida'), h('div', { class: 'select-wrap' }, select, icon('chevron'))),
      actions),
    ficha, community);
  const el = h('div', { class: 'view' },
    viewHeader('Reportes', 'Ficha de revisión por corrida con procedencia, condiciones, curva, controles, estado de Hg y limitaciones. Se imprime o se guarda como PDF desde el navegador; los datos se entregan en CSV o JSON.'),
    emptySlot, body);
  let current = null;

  async function load(run_id) {
    const run = state.runs.find((r) => r.run_id === run_id);
    if (!run) return;
    current = { run, rows: await rowsOf(run_id) };
    paint();
  }
  function paint() {
    const { run, rows } = current;
    const lem = lemnaSummary(run.id_muestra);
    const s = summarize(rows, run);
    const ctl = controlState(run);
    mount(actions,
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => window.print() }, icon('reports'), 'Imprimir o guardar PDF'),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => exportRun(current) }, icon('download'), 'Descargar CSV'),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: async () => { await exportJson([run.run_id]); if (run.estado !== 'captura') markExported(run.run_id); } }, icon('download'), 'Descargar JSON'),
      h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => exportJson(state.runs.map((r) => r.run_id)) }, 'Todas las corridas (JSON)'));
    mount(ficha,
      h('header', { class: 'ficha-head' },
        h('div', null,
          h('p', { class: 'hg-kicker' }, 'Ficha de revisión · Hg-Guard · ORO-4.1'),
          h('h2', { id: 'ficha-rev-title', class: 'station-id' }, run.run_id),
          h('p', { class: 'station-loc' }, `${run.id_caso} · muestra ${run.id_muestra} · ${fmt.dateTime(run.fecha_iso)}`)),
        h('div', { class: 'badge-row' }, provTag(run.origen), acquisitionBadge(run))),
      run.demostracion ? h('p', { class: 'ficha-demo' }, 'DEMOSTRACIÓN — datos simulados (archivo_prueba). No son mediciones reales ni pueden remitirse como evidencia.') : null,
      h('div', { class: 'ficha-cols' },
        h('section', null, h('h3', { class: 'card-title' }, 'Dónde y qué'), dl([
          ['Sitio', 'Sitio piloto por definir (sin coordenadas)'], ['Estación', `${run.estacion} · banco de prueba, La Paz`],
          ['Tipo de corrida', tipoLabel(run.tipo_corrida)], ['Matriz objetivo', matrizLabel(run.matriz)],
          ['Lecturas válidas', `${s.nValid} de ${N_ROWS} (${s.missing.length} faltantes)`],
          ['Δ cromático final', s.deltaFinal != null ? `${fmt.tc(s.deltaFinal)} (adimensional)` : '—'],
          ['Lote de tiras', run.lote_tira || '—'],
          ['Rango T°', s.temp ? `${fmt.tc(s.temp[0])} – ${fmt.tc(s.temp[1])} °C` : '—'],
        ])),
        h('section', null, h('h3', { class: 'card-title' }, 'Cómo se midió'), dl([
          ['Volumen', `${run.volumen_ml} mL ${run.volumen_confirmado ? '(confirmado)' : '(sin confirmar)'}`],
          ['Control', ctl.text], ['config_id', run.config_id || '—'], ['build', run.build || '—'],
          ['Adquisición', run.motivos?.length ? run.motivos.join(' · ') : 'Sin incidencias de adquisición'],
          ['Incidencias', run.incidencias || 'Ninguna registrada'],
          ['Permiso de uso', run.permiso_uso],
        ]))),
      h('section', null, h('h3', { class: 'card-title' }, 'Desarrollo del color de la tira (Δ cromático) · 0 a 120 s'), h('div', { class: 'chart-print' }, chart.el)),
      h('section', null, h('h3', { class: 'card-title' }, 'Qué sabemos de Hg'),
        h('p', { style: { margin: '4px 0' } }, h('b', null, HG[run.estado_hg || 'pendiente'].label), run.hg?.demostracion ? ' (registro de demostración)' : ''),
        hgDetails(run.estado_hg === 'pendiente' ? null : run.hg),
        run.hg_tira ? h('p', { class: 'meta', style: { margin: '4px 0 0' } }, `Base: lectura de tira (cribado). ${run.hg_tira.motivo}`) : null),
      lem ? h('section', null, h('h3', { class: 'card-title' }, 'Bioindicador Lemna (evidencia complementaria)'),
        h('p', { style: { margin: '4px 0' } }, `${lem.nivel[0].toUpperCase()}${lem.nivel.slice(1)} · día ${lem.obs.dia} · cobertura ${nf1.format(lem.obs.metricas.cobertura_pct)} %, clorosis ${nf1.format(lem.obs.metricas.clorosis_pct)} %, necrosis ${nf1.format(lem.obs.metricas.necrosis_pct)} %${lem.inhibicion_pct != null ? `, inhibición frente al control ${nf1.format(lem.inhibicion_pct)} %` : ''}${lem.obs.origen === 'simulacion' ? ' (simulación)' : ''}.`),
        h('p', { class: 'meta', style: { margin: 0 } }, 'Respuesta biológica no específica de mercurio.')) : null,
      h('section', null, h('h3', { class: 'card-title' }, 'Limitaciones y siguiente paso'),
        h('ul', { class: 'limits' }, LIMITACIONES.map((t) => h('li', null, t))),
        h('p', { class: 'meta', style: { margin: 0 } }, 'Revisión técnica antes de cualquier remisión. La autoridad competente define la acción y la difusión; no hay publicación automática.')),
    );
    chart.update(run, rows, 'delta');
    mount(community, h('h2', { class: 'card-title', id: 'com-t' }, 'Versión para la comunidad (lenguaje sencillo)'),
      h('p', { class: 'meta' }, 'Borrador para una devolución acordada. Se comparte solo después de la revisión técnica y con el permiso de uso correspondiente; sin coordenadas exactas ni nombres.'),
      run.demostracion ? h('p', { class: 'ficha-demo' }, 'Ejemplo con datos de demostración: no describe una muestra real.') : null,
      h('p', null, `El ${fmt.dateTime(run.fecha_iso).split(',')[0]} probamos una muestra de ${matrizLabel(run.matriz).toLowerCase()} con una tira que cambia de color. También medimos la temperatura del agua.`),
      h('p', null, h('b', null, PLAIN_HG[run.estado_hg || 'pendiente'])),
      lem ? h('p', null, `Además, unas pequeñas plantas acuáticas (lenteja de agua) se expusieron a la muestra: ${lem.nivel === 'sin respuesta aparente' ? 'no mostraron cambios claros' : 'mostraron cambios en su crecimiento o color'}. Estas plantas reaccionan a muchas cosas, no solo al mercurio.`) : null,
      h('p', null, 'El lugar exacto del muestreo todavía se está acordando. Te contaremos el resultado del laboratorio cuando lo tengamos.'));
  }

  function render() {
    const runs = state.runs.filter((r) => !r.descartada);
    body.hidden = !runs.length;
    mount(emptySlot, runs.length ? null : emptyState({ iconName: 'reports', title: 'Sin fichas para exportar', text: 'Cuando termines una corrida, aquí podrás revisar su ficha, imprimirla o descargar CSV y JSON.' }));
    if (!runs.length) return;
    const key = runs.map((r) => r.run_id + r.estado + r.estado_hg).join('|');
    if (select.dataset.key !== key) {
      select.dataset.key = key;
      const want = current?.run.run_id && runs.some((r) => r.run_id === current.run.run_id) ? current.run.run_id : (state.current?.run.run_id || runs[0].run_id);
      mount(select, runs.map((r) => h('option', { value: r.run_id, selected: r.run_id === want || null }, runOptionLabel(r))));
      load(want);
    }
  }
  const off = on('runs', render);
  render();
  return { el, destroy: off };
}
