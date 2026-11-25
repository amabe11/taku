// Mapa de muestras: Bolivia en SVG propio (Natural Earth + isolíneas ETOPO1) con capas de imagen de la NASA
// (GIBS, WMS en EPSG:4326). Como la proyección del mapa es lineal en lon/lat, cada imagen WMS del recuadro
// visible se coloca exacta sobre el SVG. Marcadores = <button> (foco, nombre accesible, 44 px).
// Color = semáforo · forma = matriz · anillo = nivel de certeza. Ficha con popover + anchor positioning.
import MAP from '../data/map.js';
import { h, s, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import * as fmt from '../lib/format.js';
import { state, on, writePref, filtradas, hayFiltros } from '../state.js';
import { SEMAFORO, CERTEZA, MATRICES, estimado } from '../model.js';
import { semaforoBadge, certezaBadge, matrizTag, demoSeal } from './badges.js';
import { NASA_LAYERS, NASA_LIMITES, gibsUrl } from '../geo/apis.js';
import { filtersForm } from './filters.js';

const { lonMin, latMax, cos, k } = MAP.proj;
export const project = (lon, lat) => [(lon - lonMin) * cos * k, (latMax - lat) * k];
const unproject = (x, y) => [x / (cos * k) + lonMin, latMax - y / k];

const CONTOUR_OPACITY = { 500: 0.1, 1000: 0.12, 2000: 0.14, 3000: 0.17, 4000: 0.22, 5000: 0.28 };
const NEIGHBOR_LABELS = [['Perú', -69.9, -12.6], ['Brasil', -60.2, -11.3], ['Paraguay', -59.6, -21.6], ['Argentina', -65.6, -23.3], ['Chile', -70.25, -21.2, 'start']];
const BASE_LAYERS = [
  ['cuenca', 'Cuenca: eje, comunidades y frentes'],
  ['relieve', 'Relieve (isolíneas cada 1000 m)'],
  ['rios', 'Ríos y lagos'],
  ['departamentos', 'Límites departamentales'],
  ['reticula', 'Retícula cada 2°'],
];
const hoy = () => new Date().toISOString().slice(0, 10);
const haceDias = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export function createMap({ focus } = {}) {
  const hidden = state.ui.hidden;
  const nasa = state.ui.nasa;
  if (!Array.isArray(nasa.activas)) nasa.activas = [];
  if (!nasa.fecha) nasa.fecha = haceDias(5);
  const root = h('section', { class: 'map-area', 'aria-label': 'Mapa de muestras' });
  const full = { x: -20, y: -20, w: MAP.w + 40, h: MAP.h + 40 };
  let vb = { ...full };

  // ---------------- SVG base
  const svg = s('svg', {
    class: 'map-svg', role: 'img', tabindex: '0',
    'aria-label': 'Mapa de Bolivia con las muestras, ríos, límites y capas satelitales. Usa las flechas para desplazar y + o − para acercar.',
    preserveAspectRatio: 'xMidYMid meet',
  });
  const defs = s('defs', null, s('clipPath', { id: 'clip-bol' }, s('path', { d: MAP.bolivia })));
  const gGrat = s('g', { class: 'layer-reticula' }, MAP.graticule.map((g) => s('path', { class: 'map-grat', d: g.d })));
  const gNeighbors = s('g', null, MAP.neighbors.map((n) => s('path', { class: 'map-neighbor', d: n.d })));
  const gLand = s('path', { class: 'map-land', d: MAP.bolivia });
  const gNasa = s('g', { class: 'nasa-layers' });
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
  const gCuenca = s('g', { class: 'layer-cuenca', 'aria-hidden': 'true' });
  svg.append(defs, gGrat, gNeighbors, gLand, gNasa, gRelief, gDept, gWater, gOutline, gCuenca, gLabels);

  let symU = 1; // unidades del mapa por píxel de pantalla: símbolos de tamaño constante al hacer zoom
  function drawCuenca() {
    const c = state.cuenca;
    gCuenca.replaceChildren();
    if (!c) return;
    const u = symU;
    const d = 'M' + c.eje.map(([lo, la]) => project(lo, la).map((v) => v.toFixed(2)).join(' ')).join('L');
    gCuenca.append(s('path', { class: 'map-eje', d }));
    const label = (x, y, t) => s('text', { class: 'map-poi-label', x: x + 7 * u, y: y + 4 * u }, t);
    for (const f of c.frentes) { const [x, y] = project(f.lon, f.lat); const r = 5 * u; gCuenca.append(s('path', { class: 'map-frente', d: `M${x - r} ${y}L${x} ${y - r}L${x + r} ${y}L${x} ${y + r}Z` }), label(x, y, f.nombre)); }
    for (const m of c.comunidades) { const [x, y] = project(m.lon, m.lat); gCuenca.append(s('circle', { class: 'map-comunidad', cx: x, cy: y, r: 4 * u }), label(x, y, m.nombre)); }
  }

  // ---------------- marcadores de muestras
  const markersLayer = h('div', { class: 'markers' });
  const popup = document.getElementById('station-popup');
  let markerEls = new Map();
  let selected = null;
  function renderMarkers() {
    const list = filtradas().filter((m) => m.lat != null && m.lon != null);
    markerEls = new Map();
    markersLayer.replaceChildren(...list.map((m) => {
      const sem = SEMAFORO[m.semaforo] || SEMAFORO.invalido;
      const btn = h('button', {
        class: 'marker smp', type: 'button', popovertarget: 'station-popup',
        dataset: { sem: m.semaforo, matriz: m.matriz, cert: m.certeza, id: m.codigo },
        'aria-label': `${m.codigo}, ${MATRICES[m.matriz]?.label || m.matriz}, semáforo ${sem.label}, ${CERTEZA[m.certeza]?.label || ''}${m.demostracion ? ', demostración' : ''}. Abrir ficha.`,
        onclick: () => { fillPopup(m); selected = m.codigo; },
      }, h('span', { class: 'ring', 'aria-hidden': 'true' }), h('span', { class: 'glyph', 'aria-hidden': 'true' }));
      markerEls.set(m.codigo, { btn, m });
      return btn;
    }));
    placeMarkers();
    renderLegend(list);
  }
  popup.addEventListener('toggle', (e) => {
    for (const { btn } of markerEls.values()) btn.setAttribute('aria-expanded', String(e.newState === 'open' && btn.dataset.id === selected));
    if (e.newState === 'closed') selected = null;
  });

  function fillPopup(m) {
    const close = h('button', { class: 'icon-btn popup-close', type: 'button', popovertarget: 'station-popup', popovertargetaction: 'hide', 'aria-label': 'Cerrar ficha' }, icon('close'));
    const est = estimado(m);
    mount(popup, h('div', { class: 'popup-inner' },
      h('div', { class: 'popup-head' },
        h('div', null, h('p', { class: 'popup-kicker' }, `${MATRICES[m.matriz]?.label || m.matriz} · cabezal ${m.cabezal}`), h('h2', { class: 'popup-title' }, m.codigo)), close),
      h('div', { class: 'badge-row' }, semaforoBadge(m.semaforo), demoSeal(m)),
      certezaBadge(m.certeza),
      h('dl', { class: 'popup-dl' },
        h('dt', null, 'Fecha'), h('dd', null, fmt.dateTime(m.fecha_iso)),
        h('dt', null, 'Responsable'), h('dd', null, m.responsable || '—'),
        h('dt', null, 'Estimado'), h('dd', { class: 'mono' }, est != null ? `${fmt.conc(est)} ${MATRICES[m.matriz]?.unidad || 'mg/kg'}` : '—'),
        m.laboratorio?.resultado_mg_kg != null ? [h('dt', null, 'Laboratorio'), h('dd', { class: 'mono' }, `${fmt.conc(m.laboratorio.resultado_mg_kg)} mg/kg`)] : null,
      ),
      h('p', { class: 'meta', style: { margin: 0 } }, SEMAFORO[m.semaforo]?.accion),
      h('div', { class: 'view-actions' },
        h('a', { class: 'btn btn-primary', href: `#/muestra/${encodeURIComponent(m.codigo)}`, onclick: () => popup.hidePopover() }, icon('evidence'), 'Abrir ficha'),
        state.cuenca ? h('a', { class: 'btn btn-ghost', href: `#/cuenca/${encodeURIComponent(m.codigo)}`, onclick: () => popup.hidePopover() }, icon('river'), 'Cuenca') : null),
    ));
  }

  // ---------------- controles superpuestos
  const filt = filtersForm('mf');
  const filtPop = h('div', { class: 'layers-pop filters-pop', id: 'filters-pop', popover: 'auto', role: 'group', 'aria-labelledby': 'filters-pop-title' },
    h('h2', { id: 'filters-pop-title' }, 'Filtrar muestras'), filt.el);
  const filtBtn = h('button', { class: 'chip', type: 'button', popovertarget: 'filters-pop' });
  const nasaChip = h('span');
  const top = h('div', { class: 'map-overlay map-top' }, filtBtn, nasaChip);

  const zoomIn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Acercar', onclick: () => zoom(1 / 1.6) }, icon('plus'));
  const zoomOut = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Alejar', onclick: () => zoom(1.6) }, icon('minus'));
  const reset = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Encuadrar las muestras', onclick: () => fitSamples() }, icon('target'));
  const layersBtn = h('button', { class: 'icon-btn', type: 'button', popovertarget: 'layers-pop', 'aria-label': 'Capas del mapa y capas satelitales NASA' }, icon('layers'));

  const dateIn = h('input', { class: 'input mono', type: 'date', id: 'nasa-fecha', max: hoy(), value: nasa.fecha,
    onchange: (e) => { nasa.fecha = e.target.value || haceDias(5); savePrefs(); requestNasa(); } });
  const opIn = h('input', { type: 'range', id: 'nasa-op', min: '0.2', max: '1', step: '0.05', value: String(nasa.opacidad),
    oninput: (e) => { nasa.opacidad = Number(e.target.value); gNasa.setAttribute('opacity', String(nasa.opacidad)); savePrefs(); } });
  const legends = h('div', { class: 'nasa-legends' });
  const nasaStatus = h('p', { class: 'meta', role: 'status', style: { margin: 0 } });
  const layersPop = h('div', { class: 'layers-pop', id: 'layers-pop', popover: 'auto', role: 'group', 'aria-labelledby': 'layers-title' },
    h('h2', { id: 'layers-title' }, 'Capas satelitales NASA'),
    h('p', { class: 'layers-warn' }, icon('info'), 'Los satélites no detectan mercurio: aportan contexto. Coincidir en el mapa no prueba una causa.'),
    NASA_LAYERS.map((L) => h('label', null,
      h('input', { type: 'checkbox', value: L.id, checked: nasa.activas.includes(L.id), onchange: (e) => {
        nasa.activas = e.target.checked ? [...nasa.activas, L.id] : nasa.activas.filter((x) => x !== L.id);
        savePrefs(); requestNasa();
      } }),
      h('span', null, L.nombre, h('small', null, L.tiempo === 'dia' ? ` · ${L.resolucion}` : L.tiempo === 'anio' ? ' · año más cercano del archivo' : ` · ${L.resolucion}`)))),
    h('div', { class: 'fields', style: { marginTop: 'var(--sp-2)' } },
      h('div', { class: 'field' }, h('label', { for: 'nasa-fecha' }, 'Fecha de las imágenes'), dateIn),
      h('div', { class: 'field' }, h('label', { for: 'nasa-op' }, 'Opacidad'), opIn)),
    legends, nasaStatus,
    h('h2', { style: { marginTop: 'var(--sp-3)' } }, 'Capas base'),
    BASE_LAYERS.map(([key, label]) => h('label', null,
      h('input', { type: 'checkbox', checked: !hidden.has(key), onchange: (e) => { e.target.checked ? hidden.delete(key) : hidden.add(key); applyLayers(); } }),
      label)),
    h('details', { class: 'layers-limits' }, h('summary', null, 'Limitaciones declaradas'), h('ul', { class: 'limits' }, NASA_LIMITES.map((t) => h('li', null, t)))));
  const controls = h('div', { class: 'map-overlay map-controls' }, zoomIn, zoomOut, reset, layersBtn);

  const legend = h('details', { class: 'map-overlay map-legend', open: window.matchMedia('(width >= 75rem)').matches });
  function renderLegend(list) {
    const count = (sem) => list.filter((m) => m.semaforo === sem).length;
    filtBtn.replaceChildren(icon('filter'), hayFiltros() ? `Filtros activos · ${list.length} de ${state.muestras.length}` : `Filtrar · ${list.length} muestras`);
    mount(legend,
      h('summary', null, 'Leyenda', icon('chevron')),
      h('div', { class: 'legend-body' },
        h('p', { class: 'legend-cap' }, 'Color · semáforo'),
        Object.entries(SEMAFORO).map(([k, v]) => h('div', { class: 'legend-row' }, h('span', { class: 'sym sym-sem', dataset: { sem: k }, 'aria-hidden': 'true' }), v.label, h('span', { class: 'count' }, String(count(k))))),
        h('p', { class: 'legend-cap' }, 'Forma · matriz'),
        Object.entries(MATRICES).map(([k, v]) => h('div', { class: 'legend-row' }, h('span', { class: `msym msym-${k}`, 'aria-hidden': 'true' }), v.label)),
        h('p', { class: 'legend-cap' }, 'Anillo · certeza'),
        Object.entries(CERTEZA).map(([k, v]) => h('div', { class: 'legend-row' }, h('span', { class: 'sym sym-cert', dataset: { cert: k }, 'aria-hidden': 'true' }), v.label)),
        state.cuenca ? [h('p', { class: 'legend-cap' }, 'Cuenca'),
          h('div', { class: 'legend-row' }, h('span', { class: 'sym sym-com', 'aria-hidden': 'true' }), 'Comunidad'),
          h('div', { class: 'legend-row' }, h('span', { class: 'sym sym-frente', 'aria-hidden': 'true' }), 'Frente minero'),
          h('div', { class: 'legend-row' }, h('span', { class: 'sym sym-eje', 'aria-hidden': 'true' }), 'Eje principal (aprox.)')] : null,
        h('p', { class: 'legend-note', style: { margin: 0 } }, 'Cribado no es diagnóstico ni evidencia legal. Un verde no descarta mercurio.')));
  }
  const sources = h('p', { class: 'map-sources', style: { margin: 0 } });
  root.append(top, controls, layersPop, filtPop, svg, markersLayer, legend, sources);

  // ---------------- capas NASA (GIBS)
  let nasaTimer;
  function savePrefs() { writePref('ahg.nasa', { activas: nasa.activas, fecha: nasa.fecha, opacidad: nasa.opacidad }); }
  function requestNasa() {
    clearTimeout(nasaTimer);
    nasaTimer = setTimeout(loadNasa, 350);
    const act = NASA_LAYERS.filter((L) => nasa.activas.includes(L.id));
    mount(legends, act.filter((L) => L.leyenda).map((L) => h('figure', { class: 'nasa-legend' }, h('img', { src: L.leyenda, alt: `Leyenda de ${L.nombre}`, loading: 'lazy' }), h('figcaption', null, L.nombre))));
    mount(nasaChip, act.length ? h('span', { class: 'chip' }, icon('satellite'), `NASA: ${act.map((L) => L.nombre.split(' · ')[0]).join(', ')}${act.some((L) => L.tiempo === 'dia') ? ` · ${fmt.dateOnly(nasa.fecha)}` : ''}`) : null);
    sources.textContent = act.length ? `Natural Earth · ETOPO1 · NASA GIBS (${act.map((L) => L.fuente).join('; ')})` : 'Natural Earth · ETOPO1 (NOAA)';
  }
  function loadNasa() {
    const act = NASA_LAYERS.filter((L) => nasa.activas.includes(L.id));
    const r = svg.getBoundingClientRect();
    if (!act.length || !r.width) { gNasa.replaceChildren(); nasaStatus.textContent = ''; return; }
    const { sc } = screenFit();
    // recuadro visible en coordenadas del mapa → lon/lat; resolución ≈ píxeles de pantalla (máx. 2048)
    const x0 = Math.max(vb.x, -MAP.w), y0 = Math.max(vb.y, -MAP.h), x1 = Math.min(vb.x + vb.w, MAP.w * 2), y1 = Math.min(vb.y + vb.h, MAP.h * 2);
    const [lo0, la1] = unproject(x0, y0), [lo1, la0] = unproject(x1, y1);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = (x1 - x0) * sc * dpr, H = (y1 - y0) * sc * dpr;
    const f = Math.min(1, 2048 / Math.max(W, H)); W *= f; H *= f;
    const bbox = { lonMin: lo0, latMin: la0, lonMax: lo1, latMax: la1 };
    gNasa.setAttribute('opacity', String(nasa.opacidad));
    const keep = new Map([...gNasa.children].map((el) => [el.dataset.id, el]));
    let pending = act.length, failed = [];
    nasaStatus.textContent = 'Cargando imágenes de NASA GIBS…';
    act.forEach((L) => {
      const img = s('image', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, preserveAspectRatio: 'none' });
      img.dataset.id = L.id;
      const finish = (ok) => {
        if (ok) { keep.get(L.id)?.remove(); keep.delete(L.id); } else { img.remove(); failed.push(L.nombre); }
        if (--pending === 0) nasaStatus.textContent = failed.length ? `No se pudo cargar: ${failed.join(', ')}. Revisa la fecha (puede no haber imagen ese día) o la conexión.` : `Imágenes NASA GIBS de ${act.some((x) => x.tiempo === 'dia') ? fmt.dateOnly(nasa.fecha) : 'la versión más reciente'}.`;
      };
      img.addEventListener('load', () => finish(true), { once: true });
      img.addEventListener('error', () => finish(false), { once: true });
      img.setAttribute('href', gibsUrl(L, bbox, W, H, nasa.fecha));
      gNasa.append(img);
    });
    for (const [id, el] of keep) if (!nasa.activas.includes(id)) el.remove();
  }

  // ---------------- vista: zoom, desplazamiento, posición de marcadores
  function screenFit() {
    const r = svg.getBoundingClientRect();
    const sc = Math.min(r.width / vb.w, r.height / vb.h);
    return { sc, ox: (r.width - vb.w * sc) / 2, oy: (r.height - vb.h * sc) / 2, r };
  }
  function placeMarkers() {
    const { sc, ox, oy } = screenFit();
    for (const { btn, m } of markerEls.values()) {
      const [x, y] = project(m.lon, m.lat);
      btn.style.setProperty('--x', `${(x - vb.x) * sc + ox}px`);
      btn.style.setProperty('--y', `${(y - vb.y) * sc + oy}px`);
    }
  }
  function setVb(next, { load = true } = {}) {
    const minW = 2.5, maxW = full.w * 1.4;
    const ratio = next.h / next.w;
    if (next.w < minW) { const c = [next.x + next.w / 2, next.y + next.h / 2]; next = { w: minW, h: minW * ratio, x: c[0] - minW / 2, y: c[1] - (minW * ratio) / 2 }; }
    if (next.w > maxW) { const c = [next.x + next.w / 2, next.y + next.h / 2]; next = { w: maxW, h: maxW * ratio, x: c[0] - maxW / 2, y: c[1] - (maxW * ratio) / 2 }; }
    next.x = Math.max(-MAP.w * 0.5, Math.min(MAP.w * 1.5 - next.w, next.x));
    next.y = Math.max(-MAP.h * 0.5, Math.min(MAP.h * 1.5 - next.h, next.y));
    vb = next;
    svg.setAttribute('viewBox', `${vb.x.toFixed(3)} ${vb.y.toFixed(3)} ${vb.w.toFixed(3)} ${vb.h.toFixed(3)}`);
    placeMarkers();
    const { sc } = screenFit();
    if (sc > 0) {
      gLabels.setAttribute('font-size', (12.5 / sc).toFixed(2));
      gCuenca.setAttribute('font-size', (11.5 / sc).toFixed(2));
      if (Math.abs(symU - 1 / sc) / symU > 0.02) { symU = 1 / sc; drawCuenca(); }
      root.dataset.zoom = sc > 2.5 ? 'near' : 'far'; // los rótulos de la cuenca solo al acercar
    }
    if (load && nasa.activas.length) requestNasa();
  }
  function zoom(f, cx, cy) {
    const px = cx ?? vb.x + vb.w / 2, py = cy ?? vb.y + vb.h / 2;
    setVb({ x: px - (px - vb.x) * f, y: py - (py - vb.y) * f, w: vb.w * f, h: vb.h * f });
  }
  function fitTo(points, pad = 0.25) {
    if (!points.length) { setVb({ ...full }); return; }
    const xy = points.map(([lo, la]) => project(lo, la));
    let x0 = Math.min(...xy.map((p) => p[0])), x1 = Math.max(...xy.map((p) => p[0])), y0 = Math.min(...xy.map((p) => p[1])), y1 = Math.max(...xy.map((p) => p[1]));
    const w = Math.max(x1 - x0, 12), hh = Math.max(y1 - y0, 12);
    const r = svg.getBoundingClientRect();
    const aspect = r.width && r.height ? r.height / r.width : full.h / full.w;
    let W = w * (1 + pad * 2), H = hh * (1 + pad * 2);
    if (H / W < aspect) H = W * aspect; else W = H / aspect;
    setVb({ x: (x0 + x1) / 2 - W / 2, y: (y0 + y1) / 2 - H / 2, w: W, h: H });
  }
  function fitSamples() {
    const pts = filtradas().filter((m) => m.lat != null).map((m) => [m.lon, m.lat]);
    if (state.cuenca && !hayFiltros()) pts.push(...state.cuenca.eje);
    fitTo(pts);
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
    setVb({ ...drag.vb, x: drag.vb.x - (e.clientX - drag.x) / sc, y: drag.vb.y - (e.clientY - drag.y) / sc }, { load: false });
  });
  const endDrag = () => { if (drag && nasa.activas.length) requestNasa(); drag = null; };
  svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('wheel', (e) => { e.preventDefault(); const [mx, my] = clientToMap(e.clientX, e.clientY); zoom(e.deltaY > 0 ? 1.2 : 1 / 1.2, mx, my); }, { passive: false });
  svg.addEventListener('keydown', (e) => {
    const step = vb.w * 0.12;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) { e.preventDefault(); setVb({ ...vb, x: vb.x + moves[e.key][0], y: vb.y + moves[e.key][1] }); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(1 / 1.6); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoom(1.6); }
    else if (e.key === '0') { e.preventDefault(); fitSamples(); }
  });
  let fitted = false;
  new ResizeObserver(() => {
    if (!fitted && svg.getBoundingClientRect().width) { fitted = true; focusOrFit(); return; }
    setVb({ ...vb });
  }).observe(root);
  function focusOrFit() {
    const m = focus && state.muestras.find((x) => x.codigo === focus);
    if (m) { fitTo([[m.lon - 0.15, m.lat - 0.15], [m.lon + 0.15, m.lat + 0.15]], 0.1); } else fitSamples();
  }

  function applyLayers() {
    const list = [...hidden].join(' ');
    svg.setAttribute('data-hide', list);
    root.setAttribute('data-hide', list);
    writePref('ahg.layers.hidden', [...hidden]);
  }

  const offs = [on('muestras', () => { drawCuenca(); renderMarkers(); }), on('filtros', renderMarkers)];
  applyLayers();
  drawCuenca();
  renderMarkers();
  requestNasa();
  setVb({ ...full }, { load: false });
  return {
    el: root, fitTo,
    destroy() { offs.forEach((f) => f()); filt.destroy(); clearTimeout(nasaTimer); if (popup.matches(':popover-open')) popup.hidePopover(); },
  };
}
