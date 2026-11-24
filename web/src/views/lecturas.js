// Vista «Lecturas»: la corrida a pantalla completa (qué se midió y cómo), comparación con otra
// corrida en la misma unidad y la tabla equivalente de 121 filas.
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import * as fmt from '../lib/format.js';
import { state, on, emit, summarize, N_ROWS } from '../state.js';
import { show, rowsOf, ESTADO_LABEL } from '../runs.js';
import { createRunChart } from '../components/run-chart.js';
import { createReadingsTable } from '../components/readings-table.js';
import { provTag, acquisitionBadge, controlBadge, hgBadge, connectionPill } from '../components/badges.js';
import { hgStatusCard } from '../components/hg-card.js';
import { openRunFlow, openSaveDialog, exportRun } from '../components/run-dialog.js';
import { viewHeader, runOptionLabel, tipoLabel, matrizLabel, emptyState, dl } from './common.js';
import { ranges } from '../lib/format.js';
import { seriesSwitch, seriesLegend, fmtDelta, referenceText } from '../components/strip-ui.js';

const PERMISO = { interno: 'Uso interno del equipo', institucional: 'Remisión institucional (requiere autorización)', publico_acordado: 'Divulgación acordada' };
const BLANCO = { registrado: 'Registrado antes de la corrida', es_blanco: 'Esta corrida es el blanco', pendiente: 'Pendiente (incidencia)' };
const yes = (b) => (b ? 'Sí' : 'No');

export function lecturasView(param) {
  const chart = createRunChart();
  const table = createReadingsTable();
  let compare = null; // { run, rows, label }

  // ---------------- controles persistentes
  const runSelect = h('select', { class: 'select', id: 'run-select', onchange: async (e) => { await show(e.target.value); history.replaceState(null, '', `#/lecturas/${e.target.value}`); } });
  const cmpSelect = h('select', { class: 'select', id: 'cmp-select', onchange: async (e) => {
    const id = e.target.value;
    if (!id) { compare = null; render(); return; }
    const run = state.runs.find((r) => r.run_id === id);
    compare = { run, rows: await rowsOf(id), label: `${id} (${tipoLabel(run.tipo_corrida).toLowerCase()})` };
    render();
  } });
  const startBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openRunFlow() }, icon('play'), 'Iniciar corrida');
  const saveBtn = h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => state.current && openSaveDialog(state.current.run) });
  const csvBtn = h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => exportRun(state.current) }, icon('download'), 'Descargar CSV');
  const seg = seriesSwitch({ delta: 'Δ cromático', rgb: 'Canales RGB', temp: 'Temperatura (°C)' });

  const head = viewHeader('Lecturas', 'Lectura de tira de 120 s: desarrollo del color (cuentas R, G, B y C del lector), temperatura, controles y las 121 lecturas. El Δ cromático es una magnitud óptica, no una concentración de Hg.', startBtn);
  const picker = h('div', { class: 'toolbar' },
    h('div', { class: 'field' }, h('label', { for: 'run-select' }, 'Corrida mostrada'), h('div', { class: 'select-wrap' }, runSelect, icon('chevron'))),
    h('div', { class: 'field' }, h('label', { for: 'cmp-select' }, 'Comparar con (misma unidad)'), h('div', { class: 'select-wrap' }, cmpSelect, icon('chevron'))),
    h('div', { class: 'toolbar-actions' }, saveBtn, csvBtn));

  const statusRow = h('div', { class: 'badge-row' });
  const motivos = h('div');
  const legend = h('div', { class: 'chart-legend' });
  const stats = h('div', { class: 'stat-grid' });
  const fichaBody = h('div');
  const hgSlot = h('div');
  const chartCard = h('section', { class: 'card', 'aria-labelledby': 'lect-chart-title' },
    h('div', { class: 'card-head' },
      h('h2', { class: 'card-title', id: 'lect-chart-title' }, 'Desarrollo de la lectura'),
      seg.el),
    statusRow, h('div', { class: 'chart-lg' }, chart.el), legend, motivos);
  const fichaCard = h('section', { class: 'card', 'aria-labelledby': 'ficha-title' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title', id: 'ficha-title' }, 'Ficha de la muestra')), fichaBody);

  const content = h('div', { class: 'lect-grid' },
    h('div', { class: 'lect-main' }, chartCard, stats,
      h('section', { class: 'card', 'aria-labelledby': 'tabla-title' },
        h('div', { class: 'card-head' }, h('h2', { class: 'card-title', id: 'tabla-title' }, 'Tabla de lecturas'),
          h('p', { class: 'card-sub' }, 'Equivalente textual de la curva. Las faltantes o inválidas quedan sin valor.')),
        table.el)),
    h('div', { class: 'lect-side' }, fichaCard, hgSlot));
  const emptySlot = h('div');
  const el = h('div', { class: 'view view-wide' }, head, picker, emptySlot, content);

  // ---------------- render
  let lastFicha = '';
  function render() {
    const cur = state.current;
    const run = cur?.run || null;
    const has = !!run;
    content.hidden = !has; picker.hidden = !state.runs.length;
    mount(emptySlot, has ? null : emptyState({
      iconName: 'readings', title: 'Aún no hay corridas',
      text: 'Inicia la primera corrida de 120 s. Antes, confirma el volumen de 150 mL, la posición del vaso y la inmersión de las sondas.',
      actions: [h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openRunFlow() }, icon('play'), 'Iniciar corrida')],
    }));
    const capturing = run?.estado === 'captura';
    const reachable = state.conn.status === 'online' || state.conn.status === 'demo';
    startBtn.disabled = capturing || !reachable;
    startBtn.title = !reachable ? 'Sin conexión con la estación' : '';

    // selectores (se reconstruyen solo si cambia la lista)
    const key = state.runs.map((r) => `${r.run_id}${r.estado}${r.descartada}`).join('|') + (run?.run_id || '');
    if (runSelect.dataset.key !== key) {
      runSelect.dataset.key = key;
      mount(runSelect, state.runs.map((r) => h('option', { value: r.run_id, selected: r.run_id === run?.run_id || null }, runOptionLabel(r))));
      mount(cmpSelect, h('option', { value: '' }, 'Sin comparación'),
        state.runs.filter((r) => r.run_id !== run?.run_id && r.estado !== 'captura').map((r) => h('option', { value: r.run_id, selected: compare?.run.run_id === r.run_id || null }, runOptionLabel(r))));
      if (compare && compare.run.run_id === run?.run_id) compare = null;
    }
    if (!has) return;

    const s = summarize(cur.rows, run);
    runSelect.disabled = capturing;
    runSelect.title = capturing ? 'Disponible al terminar la corrida en captura' : '';
    saveBtn.hidden = capturing;
    saveBtn.disabled = !!run.guardada;
    saveBtn.replaceChildren(icon('save'), run.guardada ? 'Corrida guardada' : 'Guardar corrida');
    csvBtn.replaceChildren(icon('download'), capturing ? 'Descargar CSV parcial' : 'Descargar CSV');
    seg.sync();

    mount(statusRow, provTag(run.origen), acquisitionBadge(run, s), controlBadge(run), hgBadge(run.estado_hg),
      capturing ? connectionPill(state.conn.status) : null);
    chart.update(run, cur.rows, state.ui.series, compare);
    mount(legend, seriesLegend(run, state.ui.series, compare));
    mount(motivos, run.motivos?.length
      ? h('ul', { class: 'meta', style: { margin: 'var(--sp-2) 0 0', paddingInlineStart: '1.1em' } }, run.motivos.map((m) => h('li', null, m)))
      : null);

    const stat = (k, v, note) => h('div', { class: 'card stat' }, h('div', { class: 'stat-k' }, k), h('div', { class: 'stat-v' }, v), note ? h('div', { class: 'metric-note' }, note) : null);
    mount(stats,
      stat('Lecturas válidas', `${s.nValid}/${N_ROWS}`, capturing ? `${s.nRecv} recibidas` : ESTADO_LABEL[run.estado]),
      stat('Faltantes', String(s.missing.length), s.missing.length ? `seq ${ranges(s.missing)}` : 'ninguna'),
      stat('Δ cromático final', fmtDelta(s.deltaFinal), referenceText(run)),
      stat('Δ máximo', fmtDelta(s.deltaMax), 'adimensional ×100'),
      stat('Rango T°', s.temp ? `${fmt.tc(s.temp[0])}–${fmt.tc(s.temp[1])}` : '—', '°C'));
    table.update(run, cur.rows);

    const fichaKey = JSON.stringify([run.run_id, run.estado, run.guardada, run.exportada, run.incidencias, run.motivos, run.estado_hg, run.hg]);
    if (fichaKey !== lastFicha) {
      lastFicha = fichaKey;
      const c = run.controles || {};
      mount(fichaBody, dl([
        ['Caso', h('span', { class: 'mono' }, run.id_caso)],
        ['Muestra', h('span', { class: 'mono' }, run.id_muestra)],
        ['Corrida', h('span', { class: 'mono' }, run.run_id)],
        ['Tipo', tipoLabel(run.tipo_corrida)],
        ['Matriz objetivo', matrizLabel(run.matriz)],
        ['Fecha y hora', fmt.dateTime(run.fecha_iso)],
        ['Estación', `${run.estacion} · banco La Paz`],
        ['config_id', h('span', { class: 'mono' }, run.config_id || '—')],
        ['build', h('span', { class: 'mono' }, run.build || '—')],
        ['Volumen', `${run.volumen_ml ?? '—'} mL · medido: ${yes(run.volumen_confirmado)}`],
        ['Lote de tiras', run.lote_tira ? h('span', { class: 'mono' }, run.lote_tira) : '—'],
        ['Lector óptico', run.optica ? `${run.optica.sensor} · ganancia ${run.optica.ganancia} · ${run.optica.integracion_ms} ms` : 'TCS34725'],
        ['Referencia Δ', referenceText(run)],
        ['Blanco de tira', BLANCO[c.blanco] || '—'],
        ['Controles', run.esquema === 2 ? `Cámara: ${yes(c.camara)} · Tira: ${yes(c.tira)} · Sonda: ${yes(c.sondas)} · Sensores: ${yes(c.sensores)}` : `Formato anterior (turbidez) · Sensores: ${yes(c.sensores)}`],
        ['Operador', (run.operador || '').replace(/_/g, ' ').replace('ing ', 'Ing. ')],
        ['Origen', provTag(run.origen)],
        ['Permiso de uso', PERMISO[run.permiso_uso] || run.permiso_uso],
        ['Incidencias', run.incidencias || 'Ninguna registrada'],
        ['Ficha', `${run.guardada ? 'Guardada' : 'Sin guardar'} · ${run.exportada ? 'CSV descargado' : 'CSV sin descargar'}${run.descartada ? ' · Descartada' : ''}`],
      ]));
      mount(hgSlot, hgStatusCard(run));
    }
  }

  // Enlace directo #/lecturas/<run_id>: se aplica en cuanto la lista de corridas está cargada.
  let pending = param && state.current?.run.run_id !== param ? param : null;
  const tryParam = async () => {
    if (pending && state.runs.some((r) => r.run_id === pending)) { const id = pending; pending = null; await show(id); }
    render();
  };
  const offs = [on('run', render), on('runs', tryParam), on('ui', render), on('conn', render)];
  tryParam();
  return { el, destroy: () => offs.forEach((f) => f()) };
}
