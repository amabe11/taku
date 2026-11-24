// Vista «Bioindicador Lemna»: observaciones por fotografía propia o por simulación, analizadas con
// visión artificial (crecimiento, coloración y necrosis) y comparadas con un control del mismo día.
// La respuesta de Lemna es evidencia complementaria para priorizar: no detecta ni cuantifica mercurio.
import { h, s, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { announce } from '../lib/announce.js';
import * as fmt from '../lib/format.js';
import { state, emit, on } from '../state.js';
import { putItem, listItems, deleteItem } from '../store.js';
import { toImageData, analyze, classCanvas, respuesta, CLASS_COLORS } from '../lemna/vision.js';
import { lemnaImage, ESTRES } from '../lemna/simulate.js';
import { provTag } from '../components/badges.js';
import { downloadText } from '../csv.js';
import { viewHeader, emptyState } from './common.js';

const nf1 = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (v) => (v == null ? '—' : `${nf1.format(v)} %`);
export let lemnaObs = [];
export async function loadLemna() { lemnaObs = await listItems('lemna'); emit('lemna'); return lemnaObs; }

function thumb(canvas, maxW, type = 'image/jpeg') {
  const sc = Math.min(1, maxW / canvas.width);
  const c = document.createElement('canvas'); c.width = Math.round(canvas.width * sc); c.height = Math.round(canvas.height * sc);
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL(type, 0.82);
}

export async function analyzeAndSave({ source, id_muestra, tratamiento, dia, origen, notas, estres }) {
  const { canvas, data } = toImageData(source, 360);
  const res = analyze(data);
  const { cls, ...metricas } = res;
  const obs = {
    id: `LEM-${Date.now().toString(36).toUpperCase()}`,
    id_muestra, id_caso: state.runs.find((r) => r.id_muestra === id_muestra)?.id_caso || 'DEMO-01',
    tratamiento, dia, origen, estres: estres ?? null, notas: notas || '',
    demostracion: origen === 'simulacion' || state.mode === 'demo',
    fecha_iso: new Date().toISOString(), creada: Date.now(),
    metricas, imagen: thumb(canvas, 240), clasificacion: thumb(classCanvas(res), 240, 'image/png'),
  };
  await putItem('lemna', obs);
  await loadLemna();
  return obs;
}

/** Control del mismo id_muestra y día más cercano (≤ 1 día). */
export function controlFor(obs, list = lemnaObs) {
  return list.filter((o) => o.id_muestra === obs.id_muestra && o.tratamiento === 'control')
    .sort((a, b) => Math.abs(a.dia - obs.dia) - Math.abs(b.dia - obs.dia)).find((o) => Math.abs(o.dia - obs.dia) <= 1) || null;
}

/** Resumen por muestra: última observación expuesta y su respuesta frente al control. */
export function lemnaSummary(id_muestra, list = lemnaObs) {
  const exp = list.filter((o) => o.id_muestra === id_muestra && o.tratamiento === 'muestra').sort((a, b) => b.dia - a.dia)[0];
  if (!exp) return null;
  return { obs: exp, ...respuesta(exp, controlFor(exp, list)) };
}

function seriesChart(list) {
  const W = 560, H = 220, m = { l: 48, r: 90, t: 16, b: 30 };
  const days = list.map((o) => o.dia); const maxD = Math.max(7, ...days);
  const maxY = Math.max(10, ...list.map((o) => o.metricas.cobertura_pct)) * 1.1;
  const x = (d) => m.l + (d / maxD) * (W - m.l - m.r), y = (v) => m.t + (1 - v / maxY) * (H - m.t - m.b);
  const g = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg lemna-chart', role: 'img', 'aria-label': 'Cobertura vegetal por día de exposición: control y muestra' });
  for (const t of [0, maxY / 2, maxY].map((v) => Math.round(v))) {
    g.append(s('line', { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), stroke: 'var(--chart-grid)' }), s('text', { x: m.l - 6, y: y(t) + 4, 'text-anchor': 'end' }, `${t} %`));
  }
  for (let d = 0; d <= maxD; d += Math.max(1, Math.round(maxD / 7))) g.append(s('text', { x: x(d), y: H - 8, 'text-anchor': 'middle' }, `${d}`));
  g.append(s('text', { class: 'axis-title', x: W - m.r, y: H - 8, 'text-anchor': 'start' }, ' día'));
  for (const [trat, cls, label] of [['control', 'lemna-control', 'Control'], ['muestra', 'lemna-muestra', 'Muestra']]) {
    const pts = list.filter((o) => o.tratamiento === trat).sort((a, b) => a.dia - b.dia);
    if (!pts.length) continue;
    g.append(s('path', { class: cls, d: pts.map((o, i) => `${i ? 'L' : 'M'}${x(o.dia)} ${y(o.metricas.cobertura_pct)}`).join('') }));
    for (const o of pts) g.append(s(trat === 'control' ? 'rect' : 'circle', trat === 'control'
      ? { class: `${cls}-pt`, x: x(o.dia) - 4, y: y(o.metricas.cobertura_pct) - 4, width: 8, height: 8 }
      : { class: `${cls}-pt`, cx: x(o.dia), cy: y(o.metricas.cobertura_pct), r: 4.5 }));
    const last = pts[pts.length - 1];
    g.append(s('text', { class: 'ch-label', x: x(last.dia) + 8, y: y(last.metricas.cobertura_pct) + 4 }, label));
  }
  return g;
}

export function bioindicadorView() {
  const preview = h('div', { class: 'lemna-preview' });
  const seriesSlot = h('div');
  const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const fileInput = h('input', { type: 'file', id: 'lm-foto', name: 'foto', accept: 'image/*', capture: 'environment', class: 'input', style: { paddingTop: '8px' } });
  const idList = h('datalist', { id: 'lm-ids' });
  const form = h('form', { class: 'card', 'aria-labelledby': 'lm-new', novalidate: true },
    h('h2', { class: 'card-title', id: 'lm-new' }, 'Nueva observación'),
    h('div', { class: 'fields', style: { marginTop: 'var(--sp-3)' } },
      h('div', { class: 'field' }, h('label', { for: 'lm-id' }, 'ID de muestra'), h('input', { class: 'input mono', id: 'lm-id', name: 'id_muestra', list: 'lm-ids', required: true, autocomplete: 'off', value: state.runs[0]?.id_muestra || 'M-001' }), idList),
      h('div', { class: 'field' }, h('label', { for: 'lm-dia' }, 'Día de exposición'), h('input', { class: 'input mono', id: 'lm-dia', name: 'dia', type: 'number', min: 0, max: 30, step: 1, required: true, value: 0 })),
      h('fieldset', { class: 'radio-group' }, h('legend', null, 'Tratamiento'),
        h('label', { class: 'check' }, h('input', { type: 'radio', name: 'tratamiento', value: 'control', checked: true }), h('span', null, 'Control', h('small', null, 'Mismo medio, sin la muestra'))),
        h('label', { class: 'check' }, h('input', { type: 'radio', name: 'tratamiento', value: 'muestra' }), h('span', null, 'Expuesto a la muestra'))),
      h('fieldset', { class: 'radio-group' }, h('legend', null, 'Origen de la imagen'),
        h('label', { class: 'check' }, h('input', { type: 'radio', name: 'origen', value: 'simulacion', checked: true }), h('span', null, 'Simulación', h('small', null, 'Imagen sintética para ensayar el análisis'))),
        h('label', { class: 'check' }, h('input', { type: 'radio', name: 'origen', value: 'foto_propia' }), h('span', null, 'Fotografía propia', h('small', null, 'Cámara del teléfono, encuadre fijo y luz difusa')))),
    ),
    h('div', { class: 'fields' },
      h('div', { class: 'field', dataset: { for: 'simulacion' } }, h('label', { for: 'lm-estres' }, 'Estrés simulado'),
        h('select', { id: 'lm-estres', name: 'estres' }, [['ninguno', 'Ninguno'], ['leve', 'Leve'], ['alto', 'Alto']].map(([v, l]) => h('option', { value: v }, l)))),
      h('div', { class: 'field', dataset: { for: 'foto_propia' }, hidden: true }, h('label', { for: 'lm-foto' }, 'Fotografía'), fileInput),
      h('div', { class: 'field' }, h('label', { for: 'lm-notas' }, 'Notas (opcional)'), h('input', { class: 'input', id: 'lm-notas', name: 'notas', autocomplete: 'off' }))),
    err,
    h('div', { class: 'view-actions' },
      h('button', { class: 'btn btn-primary', type: 'submit' }, icon('evidence'), 'Analizar y guardar'),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: demoSeries }, 'Generar serie simulada (días 0–7)')),
  );
  form.addEventListener('change', (e) => {
    if (e.target.name !== 'origen') return;
    for (const f of form.querySelectorAll('[data-for]')) f.hidden = f.dataset.for !== e.target.value;
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements;
    const origen = f.origen.value;
    const id = f.id_muestra.value.trim().toUpperCase(); const dia = Number(f.dia.value);
    if (!id || !(dia >= 0)) { err.hidden = false; err.textContent = 'Indica el ID de muestra y el día de exposición.'; return; }
    let source;
    if (origen === 'foto_propia') {
      const file = fileInput.files?.[0];
      if (!file) { err.hidden = false; err.textContent = 'Elige o toma una fotografía.'; fileInput.focus(); return; }
      source = await createImageBitmap(file);
    } else {
      const estres = f.tratamiento.value === 'control' ? 0 : ESTRES[f.estres.value];
      source = lemnaImage({ dia, estres, semilla: dia + (f.tratamiento.value === 'control' ? 1 : 101) + id.length });
    }
    err.hidden = true;
    const obs = await analyzeAndSave({ source, id_muestra: id, tratamiento: f.tratamiento.value, dia, origen, notas: f.notas.value.trim(), estres: origen === 'simulacion' ? f.estres.value : null });
    showPreview(obs);
    announce(`Observación ${obs.id} guardada: cobertura ${pct(obs.metricas.cobertura_pct)}, clorosis ${pct(obs.metricas.clorosis_pct)}, necrosis ${pct(obs.metricas.necrosis_pct)}.`);
  });

  async function demoSeries() {
    const id = form.elements.id_muestra.value.trim().toUpperCase() || 'M-001';
    for (const dia of [0, 2, 4, 7]) {
      for (const [trat, est] of [['control', 0], ['muestra', ESTRES.alto]]) {
        await analyzeAndSave({ source: lemnaImage({ dia, estres: est, semilla: dia + (trat === 'control' ? 1 : 101) }), id_muestra: id, tratamiento: trat, dia, origen: 'simulacion', estres: trat === 'control' ? 'ninguno' : 'alto' });
      }
    }
    announce(`Serie simulada generada para ${id}: control y muestra, días 0, 2, 4 y 7.`);
  }

  function showPreview(o) {
    const m = o.metricas;
    mount(preview, h('section', { class: 'card', 'aria-labelledby': 'lm-res' },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title', id: 'lm-res' }, `Análisis · ${o.id}`), provTag(o.demostracion ? 'archivo_prueba' : 'banco_real')),
      h('div', { class: 'lemna-pair' },
        h('figure', null, h('img', { src: o.imagen, alt: `Imagen ${o.origen === 'simulacion' ? 'simulada' : 'fotografiada'} de Lemna, día ${o.dia}, ${o.tratamiento}` }), h('figcaption', null, o.origen === 'simulacion' ? 'Imagen simulada' : 'Fotografía')),
        h('figure', null, h('img', { src: o.clasificacion, alt: 'Clasificación de píxeles: verde sano, amarillo clorosis, rosa necrosis, oscuro fondo' }), h('figcaption', null, 'Clasificación'))),
      h('div', { class: 'chart-legend' }, Object.entries({ verde: 'Tejido verde', clorosis: 'Clorosis', necrosis: 'Necrosis', fondo: 'Fondo' }).map(([k, l]) =>
        h('span', { class: 'key' }, h('span', { class: 'sym', style: { background: `rgb(${CLASS_COLORS[k].join(' ')})`, borderRadius: '2px', outline: '1px solid var(--color-border)' } }), l))),
      h('div', { class: 'stat-grid' },
        [['Cobertura vegetal', pct(m.cobertura_pct), 'de la imagen'], ['Frondas (aprox.)', String(m.frondas_aprox), 'componentes'], ['Clorosis', pct(m.clorosis_pct), 'de la planta'], ['Necrosis', pct(m.necrosis_pct), 'de la planta']]
          .map(([k, v, n]) => h('div', { class: 'card stat' }, h('div', { class: 'stat-k' }, k), h('div', { class: 'stat-v' }, v), h('div', { class: 'metric-note' }, n))))));
  }

  function renderSeries() {
    mount(idList, [...new Set([...state.runs.map((r) => r.id_muestra), ...lemnaObs.map((o) => o.id_muestra)])].map((v) => h('option', { value: v })));
    if (!lemnaObs.length) { mount(seriesSlot, emptyState({ iconName: 'spatial', title: 'Sin observaciones de Lemna', text: 'Registra un control y una muestra el mismo día para comparar crecimiento, coloración y necrosis. Puedes empezar con la serie simulada.' })); return; }
    const ids = [...new Set(lemnaObs.map((o) => o.id_muestra))];
    mount(seriesSlot, ids.map((id) => {
      const list = lemnaObs.filter((o) => o.id_muestra === id);
      const sum = lemnaSummary(id);
      return h('section', { class: 'card', 'aria-labelledby': `lm-s-${id}` },
        h('div', { class: 'card-head' },
          h('h2', { class: 'card-title', id: `lm-s-${id}` }, `Serie de ${id}`),
          sum ? h('span', { class: 'badge', dataset: { tone: sum.nivel === 'respuesta marcada' ? 'warn' : sum.nivel === 'respuesta leve' ? 'info' : 'neutral' } }, icon('info'), h('span', { class: 'badge-text' }, `Bioindicador: ${sum.nivel}`)) : null),
        h('div', { class: 'lemna-chart-box' }, seriesChart(list)),
        h('div', { class: 'table-wrap', role: 'region', tabindex: '0', 'aria-labelledby': `lm-cap-${id}` },
          h('table', { class: 'data-table' },
            h('caption', { id: `lm-cap-${id}` }, 'Observaciones (la inhibición compara con el control del mismo día)'),
            h('thead', null, h('tr', null, ['Día', 'Tratamiento', 'Imagen', 'Cobertura', 'Frondas', 'Clorosis', 'Necrosis', 'Inhibición', 'Origen', 'Acción'].map((t) => h('th', { scope: 'col' }, t)))),
            h('tbody', null, list.sort((a, b) => a.dia - b.dia || a.tratamiento.localeCompare(b.tratamiento)).map((o) => {
              const r = o.tratamiento === 'muestra' ? respuesta(o, controlFor(o)) : null;
              return h('tr', null,
                h('th', { scope: 'row', class: 'num' }, String(o.dia)),
                h('td', null, o.tratamiento === 'control' ? 'Control' : 'Muestra'),
                h('td', null, h('img', { class: 'lemna-thumb', src: o.clasificacion, alt: `Clasificación, día ${o.dia}` })),
                h('td', { class: 'num' }, pct(o.metricas.cobertura_pct)), h('td', { class: 'num' }, String(o.metricas.frondas_aprox)),
                h('td', { class: 'num' }, pct(o.metricas.clorosis_pct)), h('td', { class: 'num' }, pct(o.metricas.necrosis_pct)),
                h('td', { class: 'num' }, r ? pct(r.inhibicion_pct) : '—'),
                h('td', null, o.origen === 'simulacion' ? 'Simulación' : 'Foto propia'),
                h('td', null, h('button', { class: 'btn btn-quiet', type: 'button', 'aria-label': `Eliminar observación ${o.id}`, onclick: async () => { await deleteItem('lemna', o.id); await loadLemna(); } }, 'Eliminar')));
            })))));
    }));
  }

  const exportBtn = h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => {
    const cols = ['id', 'id_muestra', 'id_caso', 'tratamiento', 'dia', 'fecha_iso', 'origen', 'demostracion', 'cobertura_pct', 'frondas_aprox', 'verde_pct', 'clorosis_pct', 'necrosis_pct', 'notas'];
    const rows = lemnaObs.map((o) => [o.id, o.id_muestra, o.id_caso, o.tratamiento, o.dia, o.fecha_iso, o.origen, o.demostracion ? 'si' : 'no',
      o.metricas.cobertura_pct.toFixed(2), o.metricas.frondas_aprox, o.metricas.verde_pct.toFixed(2), o.metricas.clorosis_pct.toFixed(2), o.metricas.necrosis_pct.toFixed(2), `"${(o.notas || '').replace(/"/g, '""')}"`].join(','));
    downloadText('﻿' + [cols.join(','), ...rows].join('\r\n') + '\r\n', `lemna_observaciones_${new Date().toISOString().slice(0, 10)}.csv`);
    announce('CSV de observaciones de Lemna descargado.');
  } }, icon('download'), 'Descargar CSV de Lemna');

  const el = h('div', { class: 'view view-wide' },
    viewHeader('Bioindicador Lemna', 'Respuesta biológica de la lenteja de agua (crecimiento, coloración y necrosis) medida por visión artificial en el navegador. Evidencia complementaria para priorizar: no es específica de mercurio.', exportBtn),
    h('div', { class: 'two-col' }, form, preview),
    h('p', { class: 'meta', style: { margin: 0, maxWidth: '85ch' } }, h('b', null, 'Interpretación. '),
      'La inhibición del área y el aumento de clorosis o necrosis frente al control indican estrés en la planta. La luz, los nutrientes, el pH, la temperatura y otros metales también los producen. La respuesta se usa para ordenar qué muestras confirmar primero en laboratorio, nunca como resultado de Hg.'),
    seriesSlot);
  const off = on('lemna', renderSeries);
  loadLemna();
  renderSeries();
  return { el, destroy: off };
}
