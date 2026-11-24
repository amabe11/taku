// MapCanvas: Bolivia en SVG propio (Natural Earth + isolíneas ETOPO1), sin teselas ni librerías.
// Marcadores = <button> superpuestos (foco, nombre accesible, 44 px). Ficha con popover + anchor positioning.
import MAP from '../data/map.js';
import { h, s, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import * as fmt from '../lib/format.js';
import { state, on, writePref, summarize, STATION, BACKGROUND_SITES, ZONA_INTERES } from '../state.js';
import { connectionPill, provTag, acquisitionBadge, hgBadge } from './badges.js';
import { openRunFlow } from './run-dialog.js';

const { lonMin, latMax, cos, k } = MAP.proj;
const project = (lon, lat) => [(lon - lonMin) * cos * k, (latMax - lat) * k];

const STATUS_LABEL = { activa: 'Activa', en_revision: 'En revisión', planificada: 'Planificada', antecedente: 'Antecedente documental' };
const CONTOUR_OPACITY = { 500: 0.1, 1000: 0.12, 2000: 0.14, 3000: 0.17, 4000: 0.22, 5000: 0.28 };
const NEIGHBOR_LABELS = [['Perú', -69.9, -12.6], ['Brasil', -60.2, -11.3], ['Paraguay', -59.6, -21.6], ['Argentina', -65.6, -23.3], ['Chile', -70.25, -21.2, 'start']];
const LAYERS = [
  ['zona', 'Zona de interés: Yungas (aprox.)'],
  ['relieve', 'Relieve (isolíneas cada 1000 m)'],
  ['rios', 'Ríos y lagos'],
  ['departamentos', 'Límites departamentales'],
  ['reticula', 'Retícula cada 2°'],
  ['antecedentes', 'Antecedentes documentales'],
];

export function createMap() {
  const hidden = state.ui.hidden;
  const root = h('section', { class: 'map-area', 'aria-label': 'Mapa de monitoreo de Bolivia' });
  const full = { x: -20, y: -20, w: MAP.w + 40, h: MAP.h + 40 };
  let vb = { ...full };

  // ---------------- SVG base
  const svg = s('svg', {
    class: 'map-svg', role: 'img', tabindex: '0',
    'aria-label': 'Mapa de Bolivia con ríos, lagos, límites departamentales y relieve. Usa las flechas para desplazar y + o − para acercar.',
    preserveAspectRatio: 'xMidYMid meet',
  });
  const defs = s('defs', null, s('clipPath', { id: 'clip-bol' }, s('path', { d: MAP.bolivia })));
  const gGrat = s('g', { class: 'layer-reticula' }, MAP.graticule.map((g) => s('path', { class: 'map-grat', d: g.d })));
  const gNeighbors = s('g', null, MAP.neighbors.map((n) => s('path', { class: 'map-neighbor', d: n.d })));
  const gLand = s('path', { class: 'map-land', d: MAP.bolivia });
  const gRelief = s('g', { class: 'layer-relieve', 'clip-path': 'url(#clip-bol)' },
    MAP.contours.map((c) => s('path', { class: 'map-contour', d: c.d, 'stroke-opacity': CONTOUR_OPACITY[c.level] ?? 0.15 })));
  const gDept = s('path', { class: 'map-dept layer-departamentos', d: MAP.departments });
  const gWater = s('g', { class: 'layer-rios' },
    MAP.rivers.map((r) => s('path', { class: 'map-river', d: r.d, 'data-major': r.major })),
    MAP.lakes.map((l) => s('path', { class: 'map-lake', d: l.d })));
  const gOutline = s('g', null, s('path', { class: 'map-outline-glow', d: MAP.bolivia }), s('path', { class: 'map-outline', d: MAP.bolivia }));
  const gLabels = s('g', { 'aria-hidden': 'true' }, NEIGHBOR_LABELS.map(([t, lon, lat, anchor]) => {
    const [x, y] = project(lon, lat);
    return s('text', { class: 'map-neighbor-label', x, y, 'text-anchor': anchor || 'middle' }, t);
  }));
  const zonaD = 'M' + ZONA_INTERES.contorno.map(([lo, la]) => project(lo, la).map((v) => v.toFixed(1)).join(' ')).join('L') + 'Z';
  const [zx, zy] = project(-67.55, -15.18);
  const gZona = s('g', { class: 'layer-zona' }, s('path', { class: 'map-zona', d: zonaD }),
    s('text', { class: 'map-zona-label', x: zx, y: zy, 'text-anchor': 'middle' }, 'Yungas · zona de interés'));
  svg.append(defs, gGrat, gNeighbors, gLand, gRelief, gDept, gWater, gZona, gOutline, gLabels);

  // ---------------- marcadores
  const markersLayer = h('div', { class: 'markers' });
  const popup = document.getElementById('station-popup');
  const sites = () => [
    { ...STATION, kind: 'estacion' },
    ...BACKGROUND_SITES.map((b) => ({ ...b, kind: 'antecedente' })),
  ];
  const markerEls = new Map();
  for (const site of sites()) {
    const btn = h('button', {
      class: 'marker', type: 'button', popovertarget: 'station-popup',
      dataset: { kind: site.kind, status: site.estado, id: site.id },
      'aria-label': site.kind === 'estacion'
        ? `${site.id}, estación ${STATUS_LABEL[site.estado].toLowerCase()}, ${site.nombre}, ${site.localidad}. Abrir ficha.`
        : `${site.nombre}, antecedente documental sin resultados atribuidos. Abrir ficha.`,
      onclick: () => { fillPopup(site); selected = site.id; },
    },
    site.kind === 'estacion' ? h('span', { class: 'halo', 'aria-hidden': 'true' }) : null,
    h('span', { class: 'glyph', 'aria-hidden': 'true' }),
    h('span', { class: 'marker-label', 'aria-hidden': 'true' }, site.kind === 'estacion' ? site.id : `${site.nombre} (antecedente)`));
    markerEls.set(site.id, { btn, site });
    markersLayer.append(btn);
  }
  let selected = null;
  popup.addEventListener('toggle', (e) => {
    for (const { btn } of markerEls.values()) btn.setAttribute('aria-expanded', String(e.newState === 'open' && btn.dataset.id === selected));
    if (e.newState === 'closed') selected = null;
  });

  function fillPopup(site) {
    const close = h('button', { class: 'icon-btn popup-close', type: 'button', popovertarget: 'station-popup', popovertargetaction: 'hide', 'aria-label': 'Cerrar ficha' }, icon('close'));
    if (site.kind === 'antecedente') {
      mount(popup, h('div', { class: 'popup-inner' },
        h('div', { class: 'popup-head' },
          h('div', null, h('p', { class: 'popup-kicker' }, 'Antecedente documental'), h('h2', { class: 'popup-title', style: { fontFamily: 'var(--font-sans)' } }, site.nombre)), close),
        h('dl', { class: 'popup-dl' },
          h('dt', null, 'Qué es'), h('dd', null, 'Referencia histórica externa; no es el sitio piloto.'),
          h('dt', null, 'Resultados'), h('dd', null, 'Ninguno atribuido a este proyecto.'),
          h('dt', null, 'Fuente'), h('dd', null, site.fuente),
          h('dt', null, 'Ubicación'), h('dd', null, 'Aproximada (localidad de referencia).'),
        ),
        h('span', { class: 'prov', dataset: { prov: 'historico' } }, 'Histórico'),
      ));
      return;
    }
    const cur = state.current;
    const run = cur?.run;
    const sm = cur ? summarize(cur.rows, run) : null;
    mount(popup, h('div', { class: 'popup-inner' },
      h('div', { class: 'popup-head' },
        h('div', null, h('p', { class: 'popup-kicker' }, `${site.nombre} · ${site.localidad}`), h('h2', { class: 'popup-title' }, site.id)), close),
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } }, connectionPill(state.conn.status), run ? provTag(run.origen) : null),
      h('dl', { class: 'popup-dl' },
        h('dt', null, 'Estado'), h('dd', null, `${STATUS_LABEL[site.estado]} (banco de prueba)`),
        h('dt', null, 'Última lectura'), h('dd', { class: 'mono' }, sm && (sm.deltaFinal ?? sm.lastDelta) != null ? `Δ ${fmt.tc(sm.deltaFinal ?? sm.lastDelta).replace(/0$/, '')} · ${fmt.tc(sm.lastT)} °C` : '—'),
        h('dt', null, 'Fecha'), h('dd', null, run ? fmt.dateTime(run.fecha_iso) : 'Sin corridas'),
        h('dt', null, 'Adquisición'), h('dd', null, run ? acquisitionBadge(run, sm) : '—'),
        h('dt', null, 'Hg'), h('dd', null, hgBadge(run?.estado_hg)),
      ),
      h('p', { class: 'meta', style: { margin: 0 } }, site.nota),
      h('div', { style: { display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
        h('a', { class: 'btn btn-ghost', href: '#/lecturas', onclick: () => popup.hidePopover() }, icon('readings'), 'Ver lecturas'),
        h('button', {
          class: 'btn btn-primary', type: 'button',
          disabled: run?.estado === 'captura' || !(state.conn.status === 'online' || state.conn.status === 'demo'),
          onclick: () => { popup.hidePopover(); openRunFlow(); },
        }, icon('play'), 'Iniciar corrida'),
      ),
    ));
  }

  // ---------------- capas superpuestas
  const territory = h('div', { class: 'select-wrap' },
    h('label', { class: 'sr-only', for: 'territory' }, 'Territorio mostrado'),
    h('select', { class: 'select', id: 'territory', onchange: (e) => { state.ui.territory = e.target.value; renderTerritory(); } },
      h('option', { value: 'general', selected: state.ui.territory === 'general' || null }, 'Bolivia (general)'),
      h('option', { value: 'tramo', selected: state.ui.territory === 'tramo' || null }, 'Tramo de interés (esquema)')),
    icon('chevron'));
  const pilotChip = h('span', { class: 'chip chip-dashed' }, icon('pin_off'), 'Sitio piloto por definir · sin coordenadas');
  const top = h('div', { class: 'map-overlay map-top' }, territory, pilotChip);

  const zoomIn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Acercar', onclick: () => zoom(1 / 1.5) }, icon('plus'));
  const zoomOut = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Alejar', onclick: () => zoom(1.5) }, icon('minus'));
  const reset = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Ver Bolivia completa', onclick: () => setVb({ ...full }) }, icon('target'));
  const layersBtn = h('button', { class: 'icon-btn', type: 'button', popovertarget: 'layers-pop', 'aria-label': 'Capas del mapa' }, icon('layers'));
  const layersPop = h('div', { class: 'layers-pop', id: 'layers-pop', popover: 'auto', role: 'group', 'aria-labelledby': 'layers-title' },
    h('h2', { id: 'layers-title' }, 'Capas'),
    LAYERS.map(([key, label]) => h('label', null,
      h('input', { type: 'checkbox', checked: !hidden.has(key), onchange: (e) => { e.target.checked ? hidden.delete(key) : hidden.add(key); applyLayers(); } }),
      label)));
  const controls = h('div', { class: 'map-overlay map-controls' }, zoomIn, zoomOut, reset, layersBtn);

  const count = (st) => sites().filter((x) => x.estado === st).length;
  const legend = h('details', { class: 'map-overlay map-legend', open: window.matchMedia('(width >= 75rem)').matches },
    h('summary', null, 'Leyenda', icon('chevron')),
    h('div', { class: 'legend-body' },
      ['activa', 'en_revision', 'planificada', 'antecedente'].map((st) =>
        h('div', { class: 'legend-row' }, h('span', { class: `sym sym-${st}`, 'aria-hidden': 'true' }), STATUS_LABEL[st], h('span', { class: 'count' }, String(count(st))))),
      h('div', { class: 'legend-row' }, h('span', { class: 'sym sym-zona', 'aria-hidden': 'true' }), 'Zona de interés (Yungas, aprox.)'),
      h('p', { class: 'legend-note', style: { margin: 0 } }, 'Los marcadores indican el estado de la estación, no contaminación. La zona de interés no es un sitio piloto.')),
  );
  const sources = h('p', { class: 'map-sources', style: { margin: 0 } }, 'Natural Earth · ETOPO1 (NOAA)');

  // esquema conceptual del tramo (si no hay sitio confirmado)
  const reach = buildReach();

  // Orden del DOM = orden de lectura: controles de arriba, mapa y marcadores, leyenda (la capa visual la fija z-index).
  root.append(top, controls, layersPop, svg, markersLayer, reach, legend, sources);

  // ---------------- vista: zoom, desplazamiento, posición de marcadores
  function screenFit() {
    const r = svg.getBoundingClientRect();
    const sc = Math.min(r.width / vb.w, r.height / vb.h);
    return { sc, ox: (r.width - vb.w * sc) / 2, oy: (r.height - vb.h * sc) / 2, r };
  }
  function placeMarkers() {
    const { sc, ox, oy } = screenFit();
    for (const { btn, site } of markerEls.values()) {
      const [x, y] = project(site.lon, site.lat);
      btn.style.setProperty('--x', `${(x - vb.x) * sc + ox}px`);
      btn.style.setProperty('--y', `${(y - vb.y) * sc + oy}px`);
    }
  }
  function setVb(next) {
    const minW = 110, maxW = full.w * 1.4;
    const ratio = next.h / next.w;
    if (next.w < minW) { const c = [next.x + next.w / 2, next.y + next.h / 2]; next = { w: minW, h: minW * ratio, x: c[0] - minW / 2, y: c[1] - (minW * ratio) / 2 }; }
    if (next.w > maxW) { const c = [next.x + next.w / 2, next.y + next.h / 2]; next = { w: maxW, h: maxW * ratio, x: c[0] - maxW / 2, y: c[1] - (maxW * ratio) / 2 }; }
    next.x = Math.max(-MAP.w * 0.5, Math.min(MAP.w * 1.5 - next.w, next.x));
    next.y = Math.max(-MAP.h * 0.5, Math.min(MAP.h * 1.5 - next.h, next.y));
    vb = next;
    svg.setAttribute('viewBox', `${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}`);
    placeMarkers();
    const { sc } = screenFit();
    if (sc > 0) { gLabels.setAttribute('font-size', (12.5 / sc).toFixed(1)); gZona.setAttribute('font-size', (12 / sc).toFixed(1)); } // rótulos a ~12,5 px en pantalla
  }
  function zoom(f, cx, cy) {
    const px = cx ?? vb.x + vb.w / 2, py = cy ?? vb.y + vb.h / 2;
    setVb({ x: px - (px - vb.x) * f, y: py - (py - vb.y) * f, w: vb.w * f, h: vb.h * f });
  }
  function clientToMap(clientX, clientY) {
    const { sc, ox, oy, r } = screenFit();
    return [vb.x + (clientX - r.left - ox) / sc, vb.y + (clientY - r.top - oy) / sc];
  }
  let drag = null;
  svg.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, vb: { ...vb } }; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const { sc } = screenFit();
    setVb({ ...drag.vb, x: drag.vb.x - (e.clientX - drag.x) / sc, y: drag.vb.y - (e.clientY - drag.y) / sc });
  });
  const endDrag = () => { drag = null; };
  svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('wheel', (e) => { e.preventDefault(); const [mx, my] = clientToMap(e.clientX, e.clientY); zoom(e.deltaY > 0 ? 1.2 : 1 / 1.2, mx, my); }, { passive: false });
  svg.addEventListener('keydown', (e) => {
    const step = vb.w * 0.12;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) { e.preventDefault(); setVb({ ...vb, x: vb.x + moves[e.key][0], y: vb.y + moves[e.key][1] }); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(1 / 1.5); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoom(1.5); }
    else if (e.key === '0') { e.preventDefault(); setVb({ ...full }); }
  });
  new ResizeObserver(() => setVb({ ...vb })).observe(root);

  function applyLayers() {
    const list = [...hidden].join(' ');
    svg.setAttribute('data-hide', list);
    root.setAttribute('data-hide', list);
    writePref('hg.layers.hidden', [...hidden]);
  }
  function renderTerritory() {
    const t = state.ui.territory === 'tramo';
    svg.style.display = t ? 'none' : '';
    markersLayer.style.display = t ? 'none' : '';
    legend.hidden = t; sources.hidden = t;
    zoomIn.disabled = zoomOut.disabled = reset.disabled = t;
    reach.hidden = !t;
    if (t && popup.matches(':popover-open')) popup.hidePopover();
  }

  // Al actualizarse la corrida, la ficha abierta se refresca (texto, sin mover el foco).
  const off = on('run', () => { if (selected === STATION.id && popup.matches(':popover-open') && !popup.contains(document.activeElement)) fillPopup({ ...STATION, kind: 'estacion' }); });

  applyLayers();
  renderTerritory();
  setVb({ ...full });
  requestAnimationFrame(placeMarkers);
  return { el: root, destroy() { off(); if (popup.matches(':popover-open')) popup.hidePopover(); } };
}

// ---------------------------------------------------------------- tramo conceptual
function buildReach() {
  const W = 1000, H = 620;
  const river = 'M-20 120 C 160 90, 230 220, 360 230 S 560 170, 640 300 S 780 470, 1020 520';
  const svg = s('svg', { class: 'reach-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-labelledby': 'reach-title reach-desc', preserveAspectRatio: 'xMidYMid meet' },
    s('title', { id: 'reach-title' }, 'Esquema conceptual de un tramo de interés'),
    s('desc', { id: 'reach-desc' }, 'Río que fluye de izquierda a derecha con un tramo de comparación aguas arriba, una ribera de interés, un depósito candidato y un tramo aguas abajo. No tiene coordenadas de campo.'),
    s('defs', null, s('pattern', { id: 'dep-hatch', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      s('line', { x1: 0, y1: 0, x2: 0, y2: 8, stroke: 'rgb(180 154 255 / 0.55)', 'stroke-width': 2 }))),
    s('path', { d: river, fill: 'none', stroke: 'rgb(91 127 214 / 0.25)', 'stroke-width': 46, 'stroke-linecap': 'round' }),
    s('path', { d: river, fill: 'none', stroke: 'var(--map-water)', 'stroke-width': 3 }),
    s('path', { d: 'M470 160 C 540 150, 610 200, 650 270 L 700 255 C 650 170, 560 120, 470 130 Z', fill: 'rgb(139 92 246 / 0.14)', stroke: 'var(--color-accent)', 'stroke-dasharray': '6 5' }),
    s('path', { d: 'M560 330 l70 -20 l40 60 l-60 40 l-60 -30 Z', fill: 'url(#dep-hatch)', stroke: 'var(--color-accent-soft)' }),
    s('circle', { cx: 170, cy: 118, r: 9, fill: 'var(--color-bg)', stroke: 'var(--color-text-muted)', 'stroke-width': 2.5, 'stroke-dasharray': '4 3' }),
    s('circle', { cx: 860, cy: 470, r: 9, fill: 'var(--color-bg)', stroke: 'var(--color-text-muted)', 'stroke-width': 2.5, 'stroke-dasharray': '4 3' }),
    s('path', { d: 'M820 560 l60 0 m-12 -8 l12 8 l-12 8', stroke: 'var(--color-text-muted)', fill: 'none', 'stroke-width': 2 }),
    s('text', { x: 120, y: 80 }, 'Aguas arriba · tramo de comparación'),
    s('text', { x: 470, y: 112 }, 'Ribera de interés'),
    s('text', { x: 690, y: 368 }, 'Depósito candidato'),
    s('text', { x: 760, y: 440 }, 'Aguas abajo'),
    s('text', { class: 'muted', x: 640, y: 565 }, 'sentido del flujo'),
  );
  return h('div', { class: 'reach', hidden: true, style: { position: 'absolute', inset: '64px 0 0 0' } },
    svg,
    h('div', { class: 'map-overlay map-legend', style: { position: 'absolute' } },
      h('h2', null, 'Esquema conceptual'),
      h('p', { style: { margin: 0 } }, 'Sin coordenadas de campo. Se reemplaza por un tramo real solo cuando exista un sitio piloto acordado, con fuente, fecha y permiso de uso.'),
      h('p', { class: 'legend-note', style: { margin: 0 } }, 'La revisión espacial depende de una señal específica de Hg con controles válidos; el contexto satelital no mide mercurio.'),
    ));
}
