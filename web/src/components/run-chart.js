// RunChart: líneas SVG propias (121 puntos, 0–120 s). Una magnitud por vista (sin doble eje):
//   delta → Δ cromático de la tira (adimensional) · rgb → cuentas R, G y B del TCS34725 · temp → °C.
// Huecos visibles: la línea se corta y el intervalo se cubre con trama; nunca se interpola.
// Cruz de lectura con puntero y teclado (←/→, Inicio/Fin); la lectura muestra todas las magnitudes.
import { s, h } from '../lib/dom.js';
import * as fmt from '../lib/format.js';
import { N_ROWS } from '../state.js';
import { derive } from '../lib/optics.js';

let uid = 0;
const nf0 = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const SERIES = {
  delta: { title: 'Δ cromático', unit: 'adimensional', fmt: (v) => nf1.format(v), minSpan: 4, lines: [{ key: 'delta', cls: 'chart-line' }] },
  rgb: { title: 'Cuentas R, G, B', unit: 'TCS34725', fmt: (v) => nf0.format(v), minSpan: 200,
    lines: [{ key: 'r', cls: 'chart-line ch-r', label: 'R' }, { key: 'g', cls: 'chart-line ch-g', label: 'G' }, { key: 'b', cls: 'chart-line ch-b', label: 'B' }] },
  temp: { title: 'Temperatura', unit: '°C', fmt: fmt.tc, minSpan: 1, lines: [{ key: 'temp_c', cls: 'chart-line ch-temp' }] },
};

function niceTicks(min, max, count = 4) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= step0) || step0;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

export function createRunChart({ compactQuery = null } = {}) {
  const id = ++uid;
  const titleId = `chart-t-${id}`, descId = `chart-d-${id}`, readId = `chart-r-${id}`;
  const svg = s('svg', { class: 'chart-svg', role: 'img', tabindex: '0', 'aria-labelledby': titleId, 'aria-describedby': `${descId} ${readId}` });
  const title = h('span', { id: titleId, class: 'sr-only' });
  const desc = h('span', { id: descId, class: 'sr-only' });
  const empty = h('div', { class: 'chart-empty' }, 'Sin corrida todavía. Inicia una lectura para ver la curva de 120 s.');
  const box = h('div', { class: 'chart-box' }, svg, empty);
  const readout = h('output', { id: readId, class: 'chart-readout', 'aria-live': 'polite' }, '');
  const el = h('div', { class: 'chart' }, title, desc, box, readout);

  let data = { run: null, rows: [], series: 'delta', compare: null };
  let cursor = null;
  let geom = null;

  function render() {
    const { run, series } = data;
    const S = SERIES[series] || SERIES.delta;
    const rows = data.rows;
    svg.dataset.series = series;
    const W = Math.max(240, box.clientWidth || 320), H = Math.max(72, box.clientHeight || 190);
    const compact = H < 120 || (compactQuery && compactQuery());
    const m = compact ? { l: 48, r: 8, t: 8, b: 18 } : { l: 60, r: 12, t: 20, b: 28 };
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    empty.hidden = !!(run && rows.some(Boolean));
    if (!run) { svg.replaceChildren(); title.textContent = `Gráfica de ${S.title.toLowerCase()} sin datos`; desc.textContent = ''; readout.textContent = ''; return; }

    const valsBy = S.lines.map((ln) => rows.map((r) => (r && r[ln.key] != null ? r[ln.key] : null)));
    const cmpVals = data.compare ? data.compare.rows.map((r) => (r && r[S.lines[0].key] != null ? r[S.lines[0].key] : null)) : [];
    const present = valsBy.flat().filter((v) => v != null).concat(cmpVals.filter((v) => v != null));
    let lo = present.length ? Math.min(...present) : 0, hi = present.length ? Math.max(...present) : 1;
    if (series === 'delta') lo = Math.min(lo, 0);
    if (hi - lo < S.minSpan) { const c = (hi + lo) / 2; lo = series === 'delta' ? 0 : c - S.minSpan / 2; hi = series === 'delta' ? Math.max(hi, S.minSpan) : c + S.minSpan / 2; }
    const pad = (hi - lo) * 0.08; hi += pad; if (series !== 'delta') lo -= pad;
    const x = (seq) => m.l + (seq / (N_ROWS - 1)) * pw;
    const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * ph;
    geom = { m, pw, W };

    const capturing = run.estado === 'captura';
    let extent = -1;
    rows.forEach((r, i) => { if (r) extent = i; });
    if (!capturing) extent = N_ROWS - 1;

    const hatchId = `gap-hatch-${id}`;
    const defs = s('defs', null,
      s('pattern', { id: hatchId, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
        s('rect', { width: 6, height: 6, fill: 'rgb(255 143 163 / 0.06)' }),
        s('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: 'rgb(255 143 163 / 0.45)', 'stroke-width': 2 })));

    const grid = s('g', { class: 'chart-grid' });
    const xt = compact ? [0, 60, 120] : [0, 20, 40, 60, 80, 100, 120];
    for (const t of xt) grid.append(s('line', { x1: x(t), x2: x(t), y1: m.t, y2: m.t + ph }));
    const yt = niceTicks(lo, hi, compact ? 2 : 4);
    for (const v of yt) grid.append(s('line', { x1: m.l, x2: m.l + pw, y1: y(v), y2: y(v) }));
    const labels = s('g', null);
    for (const t of xt) labels.append(s('text', { x: x(t), y: H - (compact ? 3 : 8), 'text-anchor': 'middle' }, `${t}`));
    for (const v of yt) labels.append(s('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, S.fmt(v)));
    if (!compact) {
      labels.append(s('text', { class: 'axis-title', x: m.l, y: 12 }, `${S.title} · ${S.unit}`));
      labels.append(s('text', { class: 'axis-title', x: m.l + pw, y: 12, 'text-anchor': 'end' }, 't (s)'));
    }

    // huecos: posiciones sin valor válido en la magnitud mostrada
    const main = valsBy[0];
    const gaps = s('g', null);
    const gapRuns = [];
    for (let i = 0; i <= extent; i++) {
      if (valsBy.every((v) => v[i] != null)) continue;
      const kind = rows[i] ? 'inválida' : 'sin lectura';
      const last = gapRuns[gapRuns.length - 1];
      if (last && last.b === i - 1 && last.kind === kind) last.b = i; else gapRuns.push({ a: i, b: i, kind });
    }
    for (const g of gapRuns) {
      const x0 = Math.max(m.l, x(g.a - 0.5)), x1 = Math.min(m.l + pw, x(g.b + 0.5));
      gaps.append(s('rect', { class: 'chart-gap', x: x0, y: m.t, width: Math.max(2, x1 - x0), height: ph, fill: `url(#${hatchId})` }));
      gaps.append(s('line', { class: 'chart-gap-mark', x1: x0, x2: x0 + Math.max(2, x1 - x0), y1: m.t + ph, y2: m.t + ph }));
      if (!compact && x1 - x0 > 52) gaps.append(s('text', { x: (x0 + x1) / 2, y: m.t + 14, 'text-anchor': 'middle' }, g.kind));
    }

    const pathOf = (arr) => {
      let d = '', pen = false;
      for (let i = 0; i < N_ROWS; i++) {
        const v = arr[i];
        if (v == null) { pen = false; continue; }
        d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`; pen = true;
      }
      return d;
    };
    const line = s('g', null,
      data.compare ? s('path', { class: 'chart-line-compare', d: pathOf(cmpVals) }) : null,
      S.lines.length === 1 ? s('path', { class: 'chart-glow', d: pathOf(main) }) : null,
      ...S.lines.map((ln, i) => s('path', { class: ln.cls, d: pathOf(valsBy[i]) })));
    // rótulos directos de canal (identidad nunca solo por color)
    if (S.lines.length > 1 && !compact) {
      S.lines.forEach((ln, i) => {
        let li = N_ROWS - 1; while (li >= 0 && valsBy[i][li] == null) li--;
        if (li >= 0) line.append(s('text', { class: 'ch-label', x: Math.min(x(li) + 4, m.l + pw - 2), y: y(valsBy[i][li]) - 4, 'text-anchor': 'end' }, ln.label));
      });
    }
    const live = s('g', null);
    if (capturing && extent >= 0) {
      let li = extent; while (li >= 0 && main[li] == null) li--;
      if (li >= 0) live.append(s('circle', { class: 'chart-live', cx: x(li), cy: y(main[li]), r: 4 }));
    }
    const cur = s('g', { 'aria-hidden': 'true' });
    if (cursor != null && cursor <= Math.max(extent, 0)) {
      cur.append(s('line', { class: 'chart-cursor', x1: x(cursor), x2: x(cursor), y1: m.t, y2: m.t + ph }));
      for (const v of valsBy) if (v[cursor] != null) cur.append(s('circle', { class: 'chart-cursor-dot', cx: x(cursor), cy: y(v[cursor]), r: 4 }));
    }
    svg.replaceChildren(defs, grid, gaps, line, live, labels, cur);

    const n = rows.filter(Boolean).length;
    const nGap = gapRuns.reduce((a, g) => a + g.b - g.a + 1, 0);
    const pm = main.filter((v) => v != null);
    title.textContent = `${S.title} (${S.unit}) de la corrida ${run.run_id}, 0 a 120 segundos${data.compare ? `, comparada con ${data.compare.label}` : ''}`;
    desc.textContent = pm.length
      ? `${n} de ${N_ROWS} lecturas recibidas; rango ${S.fmt(Math.min(...pm))} a ${S.fmt(Math.max(...pm))}; ${nGap} posiciones sin valor válido. Usa las flechas para recorrer la curva.`
      : 'Aún sin lecturas válidas.';
    updateReadout();
  }

  function updateReadout() {
    const { rows } = data;
    if (cursor == null || !data.run) { readout.textContent = ''; return; }
    const r = rows[cursor];
    if (!r) { readout.textContent = `seq ${cursor} · t = ${cursor} s · sin lectura`; return; }
    const parts = [`seq ${cursor}`, `t = ${r.t_seg ?? cursor} s`, `Δ ${r.delta != null ? nf1.format(r.delta) : '—'}`,
      `R/G/B/C ${[r.r, r.g, r.b, r.c].map((v) => (v == null ? '—' : v)).join('/')}`, `${fmt.tc(r.temp_c)} °C`];
    if (r.motivo) parts.push(`motivo: ${r.motivo}`);
    if (data.compare) {
      const c = data.compare.rows[cursor];
      parts.push(`${data.compare.label}: ${c ? `Δ ${c.delta != null ? nf1.format(c.delta) : '—'} · ${fmt.tc(c.temp_c)} °C` : 'sin lectura'}`);
    }
    readout.textContent = parts.join(' · ');
  }

  function seqAt(clientX) {
    if (!geom) return null;
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * geom.W;
    return Math.max(0, Math.min(N_ROWS - 1, Math.round(((px - geom.m.l) / geom.pw) * (N_ROWS - 1))));
  }
  svg.addEventListener('pointermove', (e) => { const sq = seqAt(e.clientX); if (sq !== cursor) { cursor = sq; render(); } });
  svg.addEventListener('pointerleave', () => { if (document.activeElement !== svg) { cursor = null; render(); } });
  svg.addEventListener('blur', () => { cursor = null; render(); });
  svg.addEventListener('keydown', (e) => {
    const last = N_ROWS - 1;
    const map = { ArrowRight: 1, ArrowLeft: -1, PageUp: 10, PageDown: -10 };
    if (e.key in map) cursor = Math.max(0, Math.min(last, (cursor ?? -1 * Math.sign(map[e.key])) + map[e.key]));
    else if (e.key === 'Home') cursor = 0;
    else if (e.key === 'End') cursor = last;
    else return;
    e.preventDefault(); render();
  });
  new ResizeObserver(() => render()).observe(box);

  return {
    el,
    /** rows: filas crudas; se calcula Δ con la referencia del run. compare: { run, rows, label }. */
    update(run, rows, series = 'delta', compare = null) {
      data = {
        run, series: SERIES[series] ? series : 'delta',
        rows: run ? derive(run, rows || []) : [],
        compare: compare ? { ...compare, rows: derive(compare.run, compare.rows) } : null,
      };
      render();
    },
  };
}
