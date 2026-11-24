// Panel derecho del mapa (hoja inferior en teléfono). Orden de la jerarquía:
// estación y conexión → qué se midió (gráfica, métricas) → cómo (controles) → Hg → qué sigue (CSV).
// Los controles interactivos se crean una vez y solo se actualizan: el foco no se pierde a 1 Hz.
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import * as fmt from '../lib/format.js';
import { state, on, emit, summarize, N_ROWS, STATION } from '../state.js';
import { connectionPill, provTag, acquisitionBadge, controlBadge, hgBadge } from './badges.js';
import { hgStatusCard } from './hg-card.js';
import { createRunChart } from './run-chart.js';
import { openRunFlow, openSaveDialog, exportRun } from './run-dialog.js';
import { abandonTracking } from '../runs.js';
import { sensorsOk } from '../api.js';
import { seriesSwitch, seriesLegend, stripMetrics, controlItems } from './strip-ui.js';

const MOBILE = window.matchMedia('(width < 48rem)');

function setLabel(btn, iconName, text) { btn.replaceChildren(icon(iconName), text); }

export function createStationPanel() {
  const root = h('section', { class: 'station-panel', 'aria-labelledby': 'station-title', dataset: { sheet: state.ui.sheet } });
  const chart = createRunChart({ compactQuery: () => MOBILE.matches && root.dataset.sheet === 'peek' });

  // ---------------- elementos persistentes
  const handle = h('button', {
    class: 'sheet-handle', type: 'button', 'aria-controls': 'station-body',
    onclick: () => { state.ui.sheet = root.dataset.sheet === 'peek' ? 'expanded' : 'peek'; render(); },
  });
  const pillSlot = h('span');
  const startBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openRunFlow() });
  const progressSlot = h('div');
  const helpSlot = h('div');
  const hgInline = h('span');
  const metaLine = h('p', { class: 'meta sheet-extra', style: { margin: 'var(--sp-2) 0 0' } });
  const head = h('div', { class: 'card span-all' },
    h('div', { class: 'station-head' },
      h('div', null,
        h('div', { class: 'station-tags' }, pillSlot, hgInline),
        h('h2', { class: 'station-id', id: 'station-title' }, STATION.id),
        h('p', { class: 'station-loc' }, `${STATION.nombre} · ${STATION.localidad}`),
      ),
      h('div', { class: 'station-actions' }, startBtn),
    ),
    progressSlot, helpSlot, metaLine,
  );

  const seg = seriesSwitch();
  const runSub = h('p', { class: 'card-sub mono' });
  const badgeSlot = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } });
  const legendSlot = h('div', { class: 'chart-legend sheet-extra' });
  const motivosSlot = h('div', { class: 'sheet-extra' });
  const chartCard = h('section', { class: 'card span-all', 'aria-labelledby': 'run-card-title' },
    h('div', { class: 'card-head' },
      h('div', null, h('h3', { class: 'card-title', id: 'run-card-title' }, 'Última lectura de tira (120 s)'), runSub),
      seg.el,
    ),
    badgeSlot, chart.el, legendSlot, motivosSlot,
  );

  const metrics = h('div', { class: 'panel-metrics span-all sheet-extra' });
  const controls = h('section', { class: 'card sheet-extra', 'aria-labelledby': 'controls-title' });
  const hgSlot = h('div', { class: 'sheet-extra' });
  const csvBtn = h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => exportRun(state.current) });
  const saveBtn = h('button', { class: 'btn btn-ghost btn-block sheet-extra', type: 'button', onclick: () => state.current && openSaveDialog(state.current.run) });
  const actionNote = h('p', { class: 'meta action-note', style: { margin: 0, textAlign: 'center' } });
  const actions = h('div', { class: 'span-all', style: { display: 'grid', gap: 'var(--sp-2)' } }, csvBtn, saveBtn, actionNote);

  const body = h('div', { class: 'panel-stack', id: 'station-body' }, head, chartCard, metrics, controls, hgSlot, actions);
  root.append(handle, body);

  // ---------------- actualizaciones
  function renderHead(s) {
    const info = state.conn.info;
    const run = state.current?.run;
    const capturing = run?.estado === 'captura';
    const sens = sensorsOk(info);
    const reachable = state.conn.status === 'online' || state.conn.status === 'demo';
    mount(pillSlot, connectionPill(state.conn.status));
    startBtn.disabled = !reachable || capturing;
    setLabel(startBtn, 'play', capturing ? `Capturando ${s.nRecv}/${N_ROWS}` : 'Iniciar corrida');

    if (capturing) {
      let bar = progressSlot.firstElementChild;
      if (!bar) {
        bar = h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Avance de la corrida', 'aria-valuemin': '0', 'aria-valuemax': String(N_ROWS) }, h('span'));
        progressSlot.append(bar);
      }
      bar.setAttribute('aria-valuenow', String(s.nRecv));
      bar.style.setProperty('--p', `${(s.nRecv / N_ROWS) * 100}%`);
    } else progressSlot.replaceChildren();

    let help = null;
    if (!reachable && !capturing) {
      help = h('p', { class: 'meta', style: { margin: 'var(--sp-2) 0 0' } },
        state.conn.status === 'checking' ? 'Comprobando la conexión con la estación…' : 'Para iniciar, conecta el teléfono a la red Wi-Fi de la estación.');
    } else if (capturing && state.conn.status === 'reconnecting') {
      help = h('p', { class: 'meta', style: { margin: 'var(--sp-2) 0 0' } },
        'Sin conexión: la placa sigue capturando si está encendida. ',
        h('button', { class: 'link-btn', type: 'button', onclick: () => abandonTracking() }, 'Dar por interrumpida'));
    }
    const prevHelp = helpSlot.firstElementChild?.textContent;
    if ((help?.textContent || null) !== (prevHelp || null)) mount(helpSlot, help);

    const peek = MOBILE.matches && state.ui.sheet !== 'expanded';
    mount(hgInline, peek ? hgBadge(run?.estado_hg) : null);
    metaLine.replaceChildren(
      'config_id ', h('b', { class: 'mono' }, info?.config_id || '—'), ' · build ', h('b', { class: 'mono' }, info?.build || '—'),
      ' · sensores ', h('b', null, info ? (sens.ok ? 'respondiendo' : 'con falla') : '—'),
      ' · última respuesta ', fmt.ago(state.conn.lastOk));
  }

  function renderChart(s) {
    const run = state.current?.run || null;
    seg.sync();
    runSub.textContent = run ? `${run.run_id} · ${fmt.time(run.fecha_iso)}` : 'Sin corridas registradas';
    mount(badgeSlot, run ? [provTag(run.origen), acquisitionBadge(run, s)] : null);
    mount(legendSlot, run ? seriesLegend(run, state.ui.series) : null);
    mount(motivosSlot, run?.motivos?.length
      ? h('ul', { class: 'meta', style: { margin: 'var(--sp-2) 0 0', paddingInlineStart: '1.1em' } }, run.motivos.map((m) => h('li', null, m)))
      : null);
    chart.update(run, state.current?.rows || [], state.ui.series);
  }

  function renderMetrics(s) { mount(metrics, stripMetrics(s, state.current?.run)); }

  function renderControls() {
    const run = state.current?.run;
    const c = run?.controles || {};
    const item = (ok, text) => h('li', { dataset: { ok: String(ok) } }, icon(ok === true ? 'check' : ok === false ? 'cross' : 'pending'), text);
    mount(controls,
      h('div', { class: 'card-head' }, h('h3', { class: 'card-title', id: 'controls-title' }, 'Cómo se midió'), run ? controlBadge(run) : null),
      run
        ? h('ul', { class: 'checks' }, controlItems(run))
        : h('p', { class: 'meta', style: { margin: 0 } }, 'Los controles se confirman al iniciar una corrida.'),
    );
  }

  function renderActions() {
    const run = state.current?.run;
    const capturing = run?.estado === 'captura';
    csvBtn.disabled = !run;
    setLabel(csvBtn, 'download', capturing ? 'Descargar CSV parcial' : 'Descargar CSV');
    saveBtn.hidden = !run || capturing;
    saveBtn.disabled = !!run?.guardada;
    setLabel(saveBtn, 'save', run?.guardada ? 'Corrida guardada' : 'Guardar corrida');
    actionNote.textContent = !run
      ? 'Disponible cuando exista una corrida.'
      : `${run.exportada ? 'CSV ya descargado. ' : ''}${run.demostracion ? 'El archivo queda marcado como demostración.' : 'Incluye ID, config_id, controles y procedencia.'}`;
  }

  let lastHgKey = '';
  function render() {
    root.dataset.sheet = state.ui.sheet;
    const expanded = state.ui.sheet === 'expanded';
    handle.setAttribute('aria-expanded', String(expanded));
    handle.textContent = expanded ? 'Contraer ficha de la estación' : 'Ver ficha completa de la estación';
    const s = state.current ? summarize(state.current.rows, state.current.run) : null;
    renderHead(s); renderChart(s); renderMetrics(s); renderControls(); renderActions();
    const run = state.current?.run || null;
    const hgKey = `${run?.run_id}|${run?.estado_hg}|${run?.hg_tira?.evaluado}`;
    if (hgKey !== lastHgKey) { mount(hgSlot, hgStatusCard(run)); lastHgKey = hgKey; }
    requestAnimationFrame(() => {
      if (MOBILE.matches) document.documentElement.style.setProperty('--sheet-peek', `${Math.min(root.offsetHeight, window.innerHeight * 0.6)}px`);
    });
  }

  const offs = [on('conn', render), on('run', render), on('ui', render)];
  MOBILE.addEventListener('change', render);
  render();
  return { el: root, destroy: () => { offs.forEach((f) => f()); MOBILE.removeEventListener('change', render); } };
}
