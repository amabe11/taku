// Tabla semántica de las 121 lecturas (temperatura + cuentas del lector + Δ cromático).
// Las filas se crean una vez y se actualizan en su sitio: el foco y el desplazamiento se conservan.
import { h } from '../lib/dom.js';
import * as fmt from '../lib/format.js';
import { N_ROWS } from '../state.js';
import { derive } from '../lib/optics.js';
import { fmtDelta } from './strip-ui.js';

const COLS = ['seq', 't (s)', 'temp_c (°C)', 'R', 'G', 'B', 'C', 'Δ cromático', 'Estado'];

export function createReadingsTable(captionText = 'Lecturas de la corrida (seq 0–120). R, G, B y C son cuentas del TCS34725; Δ es adimensional.') {
  const capId = `rt-cap-${Math.random().toString(36).slice(2, 7)}`;
  const tbody = h('tbody');
  const cells = [];
  for (let seq = 0; seq < N_ROWS; seq++) {
    const c = { v: Array.from({ length: 7 }, () => h('td', { class: 'num' })), st: h('td') };
    const tr = h('tr', null, h('th', { scope: 'row', class: 'num' }, String(seq)), c.v, c.st);
    c.tr = tr; cells.push(c); tbody.append(tr);
  }
  const table = h('table', { class: 'data-table readings' },
    h('caption', { id: capId }, captionText),
    h('thead', null, h('tr', null, COLS.map((t) => h('th', { scope: 'col' }, t)))),
    tbody);
  const el = h('div', { class: 'table-wrap', role: 'region', tabindex: '0', 'aria-labelledby': capId }, table);
  const n = (v) => (v == null ? '—' : String(v));

  function update(run, rawRows) {
    const rows = run ? derive(run, rawRows || []) : [];
    const capturing = run?.estado === 'captura';
    for (let seq = 0; seq < N_ROWS; seq++) {
      const r = rows[seq]; const c = cells[seq];
      let st;
      if (!r) st = capturing ? 'pendiente' : run ? 'sin recibir' : '—';
      else if (r.motivo || r.temp_c == null || r.c == null) st = `inválida${r.motivo ? `: ${r.motivo}` : ''}`;
      else st = 'válida';
      const vals = r ? [String(r.t_seg ?? seq), fmt.tc(r.temp_c), n(r.r), n(r.g), n(r.b), n(r.c), fmtDelta(r.delta)] : Array(7).fill('—');
      vals.forEach((v, i) => { if (c.v[i].textContent !== v) c.v[i].textContent = v; });
      if (c.st.textContent !== st) c.st.textContent = st;
      const kind = !r ? (capturing ? 'pending' : 'missing') : st === 'válida' ? 'ok' : 'invalid';
      if (c.tr.dataset.kind !== kind) c.tr.dataset.kind = kind;
    }
  }
  return { el, update };
}
