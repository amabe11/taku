// Mapa de Ahgora: Bolivia en SVG propio (Natural Earth + isolíneas ETOPO1), detalle del sitio piloto Alcoche
// (ríos y localidades de OpenStreetMap, huellas de Amazon Mining Watch) y capas de imagen WMS en EPSG:4326
// (NASA GIBS, Sentinel-2 de EOX). La proyección es lineal en lon/lat: cada imagen del recuadro visible se coloca
// exacta sobre el SVG. Marcadores = <button> (foco, nombre accesible, 44 px).
//
// Dos modos (dos mapas separados en la vista «Mapas»):
//   · 'muestras' — color = semáforo de priorización · forma = matriz · anillo = certeza.
//   · 'mape'     — estado legal de las unidades mineras (verde al día · amarillo en trámite · rojo ilegal o
//                  presunta ilegal · gris sin verificar), huellas satelitales e intensidad minera.
// Cada instancia tiene sus propios ids, popovers y ficha. `onView` permite vincular dos mapas.
import MAP from '../data/map.js';
import { h, s, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import * as fmt from '../lib/format.js';
import { state, on, writePref, filtradas, hayFiltros } from '../state.js';
import { SEMAFORO, CERTEZA, MATRICES, LEGAL, BASE_LEGAL, estimado, distanciaKm } from '../model.js';
import { semaforoBadge, certezaBadge, demoSeal, legalBadge } from './badges.js';
import { NASA_LAYERS, NASA_LIMITES, gibsUrl } from '../geo/apis.js';
import { GEO, SITIO } from '../data/alcoche.js';
import { filtersForm } from './filters.js';

const { lonMin, latMax, cos, k } = MAP.proj;
export const project = (lon, lat) => [(lon - lonMin) * cos * k, (latMax - lat) * k];
const unproject = (x, y) => [x / (cos * k) + lonMin, latMax - y / k];
const path = (pts) => 'M' + pts.map(([lo, la]) => project(lo, la).map((v) => v.toFixed(3)).join(' ')).join('L');

const CONTOUR_OPACITY = { 500: 0.1, 1000: 0.12, 2000: 0.14, 3000: 0.17, 4000: 0.22, 5000: 0.28 };
const NEIGHBOR_LABELS = [['Perú', -69.9, -12.6], ['Brasil', -60.2, -11.3], ['Paraguay', -59.6, -21.6], ['Argentina', -65.6, -23.3], ['Chile', -70.25, -21.2, 'start']];
const BASE_LAYERS = {
  muestras: [['sitio', 'Ríos y localidades del sitio (OSM)'], ['cuenca', 'Eje Coroico → Kaka y huellas mineras'], ['relieve', 'Relieve (isolíneas cada 1000 m)'], ['departamentos', 'Límites departamentales']],
  mape: [['sitio', 'Ríos y localidades del sitio (OSM)'], ['huellas', 'Huellas mineras (Amazon Mining Watch)'], ['intensidad', 'Intensidad minera (proxy del uso de mercurio)'], ['relieve', 'Relieve (isolíneas cada 1000 m)'], ['departamentos', 'Límites departamentales']],
};
const hoy = () => new Date().toISOString().slice(0, 10);
const haceDias = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

// Huella → unidad MAPE (los frentes son grupos de huellas; la unidad guarda el índice del frente en su id).
function legalDeHuellas() {
  const porCelda = new Map();
  const unidades = new Map(state.mape.map((u) => [u.id, u]));
  GEO.frentes.forEach((f, i) => {
    const u = unidades.get(`mape-amw-${i}`);
    if (u) for (const c of f.celdas) porCelda.set(c, u);
  });
  return porCelda;
}

export function createMap({ id = 'mapa', modo = 'muestras', focus, titulo, onView } = {}) {
  const P = (x) => `${id}-${x}`;
  const hidden = new Set(state.ui.hidden);
  const prefKey = `ahg.capas.${modo}`;
  const guardadas = (() => { try { return JSON.parse(localStorage.getItem(prefKey)); } catch { return null; } })();
  // Por defecto: Sentinel-2 en el mapa MAPE (se ven las cicatrices mineras); nada en el de muestras.
  const nasa = { activas: modo === 'mape' ? ['s2'] : [], fecha: haceDias(5), opacidad: modo === 'mape' ? 0.9 : 0.85, ...(guardadas || {}) };
  if (!Array.isArray(nasa.activas)) nasa.activas = [];
  const root = h('section', { class: 'map-area', dataset: { modo }, 'aria-label': titulo || (modo === 'mape' ? 'Mapa de minería (MAPE) y estado legal' : 'Mapa de muestras') });
  const full = { x: -20, y: -20, w: MAP.w + 40, h: MAP.h + 40 };
  let vb = { ...full };

  // ---------------- SVG base
  const svg = s('svg', {
    class: 'map-svg', role: 'img', tabindex: '0',
    'aria-label': `${titulo || 'Mapa'}: Bolivia y el sitio piloto Alcoche, con ríos, localidades y capas satelitales. Usa las flechas para desplazar y + o − para acercar.`,
    preserveAspectRatio: 'xMidYMid meet',
  });
  const defs = s('defs', null, s('clipPath', { id: P('clip') }, s('path', { d: MAP.bolivia })));
  const gGrat = s('g', { class: 'layer-reticula' }, MAP.graticule.map((g) => s('path', { class: 'map-grat', d: g.d })));
  const gNeighbors = s('g', null, MAP.neighbors.map((n) => s('path', { class: 'map-neighbor', d: n.d })));
  const gLand = s('path', { class: 'map-land', d: MAP.bolivia });
  const gNasa = s('g', { class: 'nasa-layers' });
  const gRelief = s('g', { class: 'layer-relieve', 'clip-path': `url(#${P('clip')})` },
    MAP.contours.map((c) => s('path', { class: 'map-contour', d: c.d, 'stroke-opacity': CONTOUR_OPACITY[c.level] ?? 0.15 })));
  const gDept = s('path', { class: 'map-dept layer-departamentos', d: MAP.departments });
  const gWater = s('g', { class: 'layer-rios' },
    MAP.rivers.map((r) => s('path', { class: 'map-river', d: r.d, 'data-major': r.major })),
    MAP.lakes.map((l) => s('path', { class: 'map-lake', d: l.d })));
  const gOutline = s('g', null, s('path', { class: 'map-outline', d: MAP.bolivia }));
  const gLabels = s('g', { 'aria-hidden': 'true' }, NEIGHBOR_LABELS.map(([t, lon, lat, anchor]) => {
    const [x, y] = project(lon, lat);
    return s('text', { class: 'map-neighbor-label', x, y, 'text-anchor': anchor || 'middle' }, t);
  }));
  // detalle del sitio (OSM): ríos con nombre y afluentes
  const gSitioRios = s('g', { class: 'layer-sitio site-rivers', 'aria-hidden': 'true' },
    GEO.menores.map((l) => s('path', { class: 'site-river minor', d: path(l) })),
    GEO.rios.map((r) => s('path', { class: 'site-river', 'data-principal': r.principal ? '1' : '0', d: path(r.linea) })));
  const gHeat = s('g', { class: 'layer-intensidad', 'aria-hidden': 'true' });
  const gHuellas = s('g', { class: 'layer-huellas', 'aria-hidden': 'true' });
  const gCuenca = s('g', { class: 'layer-cuenca', 'aria-hidden': 'true' });
  const gSitio = s('g', { class: 'layer-sitio site-places', 'aria-hidden': 'true' });
  svg.append(defs, gGrat, gNeighbors, gLand, gNasa, gRelief, gDept, gWater, gOutline, gSitioRios, gHeat, gHuellas, gCuenca, gSitio, gLabels);

  let symU = 1; // unidades del mapa por píxel de pantalla: símbolos de tamaño constante al hacer zoom
  function drawSitio() {
    const u = symU;
    gSitio.replaceChildren();
    for (const l of GEO.localidades) {
      const [x, y] = project(l.lon, l.lat);
      const big = l.nombre === SITIO.nombre || (l.poblacion || 0) >= 1000;
      const r = (l.nombre === SITIO.nombre ? 5 : big ? 3.6 : 2.4) * u;
      gSitio.append(s('circle', { class: 'site-place', 'data-sitio': l.nombre === SITIO.nombre ? '1' : null, 'data-big': big || l.nombre === SITIO.nombre ? '1' : null, cx: x, cy: y, r }));
      if (l.nombre === SITIO.nombre || big || (l.poblacion || 0) >= 300) {
        gSitio.append(s('text', { class: `map-poi-label${big ? ' big' : ''}`, 'data-sitio': l.nombre === SITIO.nombre ? '1' : null, x: x + 6 * u, y: y + 4 * u }, l.nombre));
      }
    }
  }
  function drawCuenca() {
    const c = state.cuenca;
    gCuenca.replaceChildren();
    if (!c || modo !== 'muestras') return;
    const u = symU;
    gCuenca.append(s('path', { class: 'map-eje', d: path(c.eje) }));
    for (const f of c.frentes) { const [x, y] = project(f.lon, f.lat); const r = 4 * u; gCuenca.append(s('path', { class: 'map-frente', d: `M${x - r} ${y}L${x} ${y - r}L${x + r} ${y}L${x} ${y + r}Z` })); }
  }
  // huellas (MAPE): rectángulos de 480 m coloreados por el estado legal de su unidad
  function drawHuellas() {
    gHuellas.replaceChildren(); gHeat.replaceChildren();
    if (modo !== 'mape') return;
    const [hx, hy] = GEO.amw.medio_lado;
    const leg = legalDeHuellas();
    const w = 2 * hx * cos * k, hh = 2 * hy * k;
    GEO.amw.celdas.forEach((c, i) => {
      const [x, y] = project(c[0], c[1]);
      const u = leg.get(i);
      gHuellas.append(s('rect', { class: 'huella', x: x - w / 2, y: y - hh / 2, width: w, height: hh, 'data-legal': u?.estado_legal || 'sin_verificar', 'data-prov': c[3] ? '1' : null }));
    });
    // intensidad: parches por celda de 0,05°
    const paso = 0.05, cnt = new Map();
    for (const c of GEO.amw.celdas) { const key = `${Math.floor(c[0] / paso)}|${Math.floor(c[1] / paso)}`; cnt.set(key, (cnt.get(key) || 0) + 1); }
    const max = Math.max(...cnt.values());
    for (const [key, n] of cnt) {
      const [i, j] = key.split('|').map(Number);
      const [x0, y0] = project(i * paso, (j + 1) * paso), [x1, y1] = project((i + 1) * paso, j * paso);
      gHeat.append(s('rect', { class: 'heat', x: x0, y: y0, width: x1 - x0, height: y1 - y0, 'fill-opacity': (0.08 + 0.42 * Math.sqrt(n / max)).toFixed(2) }));
    }
  }

  // ---------------- marcadores
  const markersLayer = h('div', { class: 'markers' });
  const popup = h('div', { class: 'station-popup', id: P('popup'), popover: 'auto', role: 'dialog', 'aria-label': modo === 'mape' ? 'Ficha de la unidad minera' : 'Ficha de la muestra' });
  let markerEls = new Map();
  let selected = null;
  function renderMarkers() {
    markerEls = new Map();
    if (modo === 'mape') {
      markersLayer.replaceChildren(...state.mape.map((u) => {
        const L = LEGAL[u.estado_legal] || LEGAL.sin_verificar;
        const btn = h('button', {
          class: 'marker mape', type: 'button', popovertarget: P('popup'), dataset: { legal: u.estado_legal, id: u.id },
          'aria-label': `${u.nombre}. ${L.label}. ${BASE_LEGAL[u.base_estado] || ''}${u.demostracion ? ', demostración' : ''}. Abrir ficha.`,
          onclick: () => { fillMape(u); selected = u.id; },
        }, h('span', { class: 'glyph', 'aria-hidden': 'true' }, icon('pick')));
        markerEls.set(u.id, { btn, lon: u.lon, lat: u.lat });
        return btn;
      }));
    } else {
      const list = filtradas().filter((m) => m.lat != null && m.lon != null);
      markersLayer.replaceChildren(...list.map((m) => {
        const sem = SEMAFORO[m.semaforo] || SEMAFORO.invalido;
        const btn = h('button', {
          class: 'marker smp', type: 'button', popovertarget: P('popup'),
          dataset: { sem: m.semaforo, matriz: m.matriz, cert: m.certeza, id: m.codigo },
          'aria-label': `${m.codigo}, ${MATRICES[m.matriz]?.label || m.matriz}, semáforo ${sem.label}, ${CERTEZA[m.certeza]?.label || ''}${m.demostracion ? ', demostración' : ''}. Abrir ficha.`,
          onclick: () => { fillPopup(m); selected = m.codigo; },
        }, h('span', { class: 'ring', 'aria-hidden': 'true' }), h('span', { class: 'glyph', 'aria-hidden': 'true' }));
        markerEls.set(m.codigo, { btn, lon: m.lon, lat: m.lat });
        return btn;
      }));
    }
    placeMarkers();
    renderLegend();
  }
  popup.addEventListener('toggle', (e) => {
    for (const { btn } of markerEls.values()) btn.setAttribute('aria-expanded', String(e.newState === 'open' && btn.dataset.id === selected));
    if (e.newState === 'closed') selected = null;
  });
  const closeBtn = () => h('button', { class: 'icon-btn popup-close', type: 'button', popovertarget: P('popup'), popovertargetaction: 'hide', 'aria-label': 'Cerrar ficha' }, icon('close'));

  function fillPopup(m) {
    const est = estimado(m);
    mount(popup, h('div', { class: 'popup-inner' },
      h('div', { class: 'popup-head' },
        h('div', null, h('p', { class: 'popup-kicker' }, `${MATRICES[m.matriz]?.label || m.matriz} · cabezal ${m.cabezal}`), h('h2', { class: 'popup-title' }, m.codigo)), closeBtn()),
      h('div', { class: 'badge-row' }, semaforoBadge(m.semaforo), demoSeal(m)),
      certezaBadge(m.certeza),
      h('dl', { class: 'popup-dl' },
        h('dt', null, 'Lugar'), h('dd', null, m.muestreo?.lugar || '—'),
        h('dt', null, 'Fecha'), h('dd', null, fmt.dateTime(m.fecha_iso)),
        m.muestreo?.nombre_comun ? [h('dt', null, 'Especie'), h('dd', null, `${m.muestreo.nombre_comun} (${m.muestreo.gremio})`)] : null,
        h('dt', null, 'Estimado'), h('dd', { class: 'mono' }, est != null ? `${fmt.conc(est)} ${MATRICES[m.matriz]?.unidad || 'mg/kg'}` : '—'),
        m.laboratorio?.resultado_mg_kg != null ? [h('dt', null, 'Laboratorio'), h('dd', { class: 'mono' }, `${fmt.conc(m.laboratorio.resultado_mg_kg)} mg/kg`)] : null,
      ),
      h('p', { class: 'meta', style: { margin: 0 } }, SEMAFORO[m.semaforo]?.accion),
      h('div', { class: 'view-actions' },
        h('a', { class: 'btn btn-primary', href: `#/muestra/${encodeURIComponent(m.codigo)}`, onclick: () => popup.hidePopover() }, icon('evidence'), 'Abrir ficha'),
        state.cuenca ? h('a', { class: 'btn btn-ghost', href: `#/cuenca/${encodeURIComponent(m.codigo)}`, onclick: () => popup.hidePopover() }, icon('river'), 'Cuenca') : null),
    ));
  }
  function fillMape(u) {
    const cerca = state.muestras.filter((m) => m.lat != null && distanciaKm(m.lon, m.lat, u.lon, u.lat) <= 3);
    const peor = cerca.map((m) => m.semaforo).sort((a, b) => (SEMAFORO[a]?.orden ?? 9) - (SEMAFORO[b]?.orden ?? 9))[0];
    mount(popup, h('div', { class: 'popup-inner' },
      h('div', { class: 'popup-head' },
        h('div', null, h('p', { class: 'popup-kicker' }, `Unidad minera · ${u.tipo === 'cooperativa' ? 'cooperativa' : u.tipo === 'empresa' ? 'empresa' : 'operador sin identificar'}`), h('h2', { class: 'popup-title sans' }, u.nombre)), closeBtn()),
      h('div', { class: 'badge-row' }, legalBadge(u), demoSeal(u)),
      h('dl', { class: 'popup-dl' },
        h('dt', null, 'Base'), h('dd', null, BASE_LEGAL[u.base_estado] || '—'),
        u.huella ? [h('dt', null, 'Huella'), h('dd', null, `${u.huella.parches} parches de 480 m · desde ${u.huella.desde}`)] : null,
        u.area_ha ? [h('dt', null, 'Área aprox.'), h('dd', { class: 'mono' }, `${fmt.int(u.area_ha)} ha`)] : null,
        h('dt', null, 'Río'), h('dd', null, u.rio || '—'),
        h('dt', null, 'Mercurio'), h('dd', null, { declarado: 'Uso declarado', presunto: 'Uso presunto (amalgamación)', sin_mercurio: 'Declara no usar', desconocido: 'Sin dato' }[u.mercurio] || '—'),
        h('dt', null, 'Muestras ≤ 3 km'), h('dd', null, cerca.length ? h('span', { class: 'badge-row' }, String(cerca.length), peor ? semaforoBadge(peor) : null) : 'Ninguna: candidata para muestrear'),
      ),
      h('p', { class: 'meta', style: { margin: 0 } }, u.fuente || ''),
      h('p', { class: 'legal-note' }, icon('info'), 'El estado legal lo determina la AJAM. «Presunta» no es una acusación.'),
    ));
  }

  // ---------------- controles superpuestos
  const filt = modo === 'muestras' ? filtersForm(P('mf')) : null;
  const filtPop = filt ? h('div', { class: 'layers-pop filters-pop', id: P('filters-pop'), popover: 'auto', role: 'group', 'aria-labelledby': P('filters-title') },
    h('h2', { id: P('filters-title') }, 'Filtrar muestras'), filt.el) : null;
  const filtBtn = filt ? h('button', { class: 'chip', type: 'button', popovertarget: P('filters-pop') }) : null;
  const nasaChip = h('span');
  const titleChip = h('span', { class: 'chip chip-title' }, icon(modo === 'mape' ? 'pick' : 'flask'), titulo || (modo === 'mape' ? 'MAPE · estado legal' : 'Muestras · semáforo'));
  const top = h('div', { class: 'map-overlay map-top' }, titleChip, filtBtn, nasaChip);

  const zoomIn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Acercar', onclick: () => zoom(1 / 1.6) }, icon('plus'));
  const zoomOut = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Alejar', onclick: () => zoom(1.6) }, icon('minus'));
  const reset = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Encuadrar el sitio Alcoche', onclick: () => fitDefault() }, icon('target'));
  const layersBtn = h('button', { class: 'icon-btn', type: 'button', popovertarget: P('layers-pop'), 'aria-label': 'Capas del mapa y capas satelitales' }, icon('layers'));

  const dateIn = h('input', { class: 'input mono', type: 'date', id: P('fecha'), max: hoy(), value: nasa.fecha,
    onchange: (e) => { nasa.fecha = e.target.value || haceDias(5); savePrefs(); requestNasa(); } });
  const opIn = h('input', { type: 'range', id: P('op'), min: '0.2', max: '1', step: '0.05', value: String(nasa.opacidad),
    oninput: (e) => { nasa.opacidad = Number(e.target.value); gNasa.setAttribute('opacity', String(nasa.opacidad)); savePrefs(); } });
  const legends = h('div', { class: 'nasa-legends' });
  const nasaStatus = h('p', { class: 'meta', role: 'status', style: { margin: 0 } });
  const layerCheck = (L) => h('label', null,
    h('input', { type: 'checkbox', value: L.id, checked: nasa.activas.includes(L.id), onchange: (e) => {
      nasa.activas = e.target.checked ? [...nasa.activas, L.id] : nasa.activas.filter((x) => x !== L.id);
      savePrefs(); requestNasa();
    } }),
    h('span', null, L.nombre, h('small', null, ` · ${L.tiempo === 'dia' ? L.resolucion : L.tiempo === 'anio' ? 'año más cercano del archivo' : L.resolucion}`)));
  const layersPop = h('div', { class: 'layers-pop', id: P('layers-pop'), popover: 'auto', role: 'group', 'aria-labelledby': P('layers-title') },
    h('h2', { id: P('layers-title') }, 'Imágenes satelitales'),
    h('p', { class: 'layers-warn' }, icon('info'), 'Los satélites no detectan mercurio: aportan contexto. Coincidir en el mapa no prueba una causa.'),
    h('p', { class: 'legend-cap' }, 'Sentinel-2 (EOX)'),
    NASA_LAYERS.filter((L) => L.proveedor === 'eox').map(layerCheck),
    h('p', { class: 'legend-cap' }, 'NASA GIBS'),
    NASA_LAYERS.filter((L) => L.proveedor !== 'eox').map(layerCheck),
    h('div', { class: 'fields', style: { marginTop: 'var(--sp-2)' } },
      h('div', { class: 'field' }, h('label', { for: P('fecha') }, 'Fecha (capas diarias de la NASA)'), dateIn),
      h('div', { class: 'field' }, h('label', { for: P('op') }, 'Opacidad'), opIn)),
    legends, nasaStatus,
    h('h2', { style: { marginTop: 'var(--sp-3)' } }, 'Capas del mapa'),
    BASE_LAYERS[modo].map(([key, label]) => h('label', null,
      h('input', { type: 'checkbox', checked: !hidden.has(key), onchange: (e) => { e.target.checked ? hidden.delete(key) : hidden.add(key); applyLayers(); } }),
      label)),
    h('details', { class: 'layers-limits' }, h('summary', null, 'Limitaciones declaradas'), h('ul', { class: 'limits' }, NASA_LIMITES.map((t) => h('li', null, t)))));
  const controls = h('div', { class: 'map-overlay map-controls' }, zoomIn, zoomOut, reset, layersBtn);

  const legend = h('details', { class: 'map-overlay map-legend' });
  function renderLegend() {
    if (modo === 'mape') {
      const leg = legalDeHuellas();
      const n = (k) => state.mape.filter((u) => u.estado_legal === k).length;
      const sinVerif = GEO.amw.celdas.length - leg.size;
      mount(legend,
        h('summary', null, 'Leyenda · estado legal', icon('chevron')),
        h('div', { class: 'legend-body' },
          h('p', { class: 'legend-cap' }, 'Unidades mineras (MAPE)'),
          ['al_dia', 'en_tramite', 'ilegal'].map((k) => h('div', { class: 'legend-row' }, h('span', { class: 'sym sym-legal', dataset: { legal: k }, 'aria-hidden': 'true' }), LEGAL[k].label, h('span', { class: 'count' }, String(n(k))))),
          h('p', { class: 'legend-cap' }, 'Huellas satelitales (480 m)'),
          h('div', { class: 'legend-row' }, h('span', { class: 'sym sym-huella', dataset: { legal: 'ilegal' }, 'aria-hidden': 'true' }), 'Del color de su unidad'),
          h('div', { class: 'legend-row' }, h('span', { class: 'sym sym-huella', dataset: { legal: 'sin_verificar' }, 'aria-hidden': 'true' }), LEGAL.sin_verificar.label, h('span', { class: 'count' }, String(sinVerif))),
          h('div', { class: 'legend-row' }, h('span', { class: 'sym sym-heat', 'aria-hidden': 'true' }), 'Intensidad (más parches = más oscuro)'),
          h('p', { class: 'legend-note', style: { margin: 0 } }, 'No es el semáforo de muestras. El estado legal lo determina la AJAM.')));
      return;
    }
    const list = filtradas();
    const count = (sem) => list.filter((m) => m.semaforo === sem).length;
    filtBtn?.replaceChildren(icon('filter'), hayFiltros() ? `Filtros · ${list.length} de ${state.muestras.length}` : `Filtrar · ${list.length}`);
    mount(legend,
      h('summary', null, 'Leyenda · semáforo', icon('chevron')),
      h('div', { class: 'legend-body' },
        h('p', { class: 'legend-cap' }, 'Color · semáforo de priorización'),
        Object.entries(SEMAFORO).map(([key, v]) => h('div', { class: 'legend-row' }, h('span', { class: 'sym sym-sem', dataset: { sem: key }, 'aria-hidden': 'true' }), v.label, h('span', { class: 'count' }, String(count(key))))),
        h('p', { class: 'legend-cap' }, 'Forma · matriz'),
        Object.entries(MATRICES).map(([key, v]) => h('div', { class: 'legend-row' }, h('span', { class: `msym msym-${key}`, 'aria-hidden': 'true' }), v.label)),
        h('p', { class: 'legend-cap' }, 'Anillo · certeza'),
        Object.entries(CERTEZA).map(([key, v]) => h('div', { class: 'legend-row' }, h('span', { class: 'sym sym-cert', dataset: { cert: key }, 'aria-hidden': 'true' }), v.label)),
        h('p', { class: 'legend-cap' }, 'Sitio'),
        h('div', { class: 'legend-row' }, h('span', { class: 'sym sym-com', 'aria-hidden': 'true' }), 'Localidad (OSM)'),
        h('div', { class: 'legend-row' }, h('span', { class: 'sym sym-frente', 'aria-hidden': 'true' }), 'Huella minera (Amazon Mining Watch)'),
        h('div', { class: 'legend-row' }, h('span', { class: 'sym sym-eje', 'aria-hidden': 'true' }), 'Eje Coroico → Kaka'),
        h('p', { class: 'legend-note', style: { margin: 0 } }, 'Cribado no es diagnóstico ni evidencia legal. Un verde no descarta mercurio.')));
  }
  const sources = h('p', { class: 'map-sources', style: { margin: 0 } });
  root.append(top, controls, layersPop, filtPop, popup, svg, markersLayer, legend, sources);

  // ---------------- capas de imagen (GIBS / EOX)
  let nasaTimer;
  function savePrefs() { try { localStorage.setItem(prefKey, JSON.stringify({ activas: nasa.activas, fecha: nasa.fecha, opacidad: nasa.opacidad })); } catch { /* sin almacenamiento */ } }
  const baseFuentes = () => ['OpenStreetMap', ...(modo === 'mape' ? ['Amazon Mining Watch (CC BY 4.0)'] : []), 'Natural Earth'];
  function requestNasa() {
    clearTimeout(nasaTimer);
    nasaTimer = setTimeout(loadNasa, 350);
    const act = NASA_LAYERS.filter((L) => nasa.activas.includes(L.id));
    mount(legends, act.filter((L) => L.leyenda).map((L) => h('figure', { class: 'nasa-legend' }, h('img', { src: L.leyenda, alt: `Leyenda de ${L.nombre}`, loading: 'lazy' }), h('figcaption', null, L.nombre))));
    mount(nasaChip, act.length ? h('span', { class: 'chip' }, icon('satellite'), `${act.map((L) => L.nombre.split(' (')[0].split(' · ')[0]).join(', ')}${act.some((L) => L.tiempo === 'dia') ? ` · ${fmt.dateOnly(nasa.fecha)}` : ''}`) : null);
    sources.textContent = [...baseFuentes(), ...act.map((L) => L.fuente)].join(' · ');
  }
  function loadNasa() {
    const act = NASA_LAYERS.filter((L) => nasa.activas.includes(L.id));
    const r = svg.getBoundingClientRect();
    if (!act.length || !r.width) { gNasa.replaceChildren(); nasaStatus.textContent = ''; return; }
    const { sc } = screenFit();
    const x0 = Math.max(vb.x, -MAP.w), y0 = Math.max(vb.y, -MAP.h), x1 = Math.min(vb.x + vb.w, MAP.w * 2), y1 = Math.min(vb.y + vb.h, MAP.h * 2);
    const [lo0, la1] = unproject(x0, y0), [lo1, la0] = unproject(x1, y1);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = (x1 - x0) * sc * dpr, H = (y1 - y0) * sc * dpr;
    const f = Math.min(1, 2048 / Math.max(W, H)); W *= f; H *= f;
    const bbox = { lonMin: lo0, latMin: la0, lonMax: lo1, latMax: la1 };
    gNasa.setAttribute('opacity', String(nasa.opacidad));
    const keep = new Map([...gNasa.children].map((el) => [el.dataset.id, el]));
    let pending = act.length; const failed = [];
    nasaStatus.textContent = 'Cargando imágenes…';
    // las capas base (Sentinel-2) van debajo de las de la NASA
    [...act].sort((a, b) => Number(!!b.base) - Number(!!a.base)).forEach((L) => {
      const img = s('image', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, preserveAspectRatio: 'none' });
      img.dataset.id = L.id;
      const finish = (ok) => {
        if (ok) { keep.get(L.id)?.remove(); keep.delete(L.id); } else { img.remove(); failed.push(L.nombre); }
        if (--pending === 0) nasaStatus.textContent = failed.length ? `No se pudo cargar: ${failed.join(', ')}. Revisa la fecha o la conexión.` : 'Imágenes cargadas.';
      };
      img.addEventListener('load', () => finish(true), { once: true });
      img.addEventListener('error', () => finish(false), { once: true });
      img.setAttribute('href', gibsUrl(L, bbox, W, H, nasa.fecha));
      gNasa.append(img);
    });
    for (const [lid, el] of keep) if (!nasa.activas.includes(lid)) el.remove();
  }

  // ---------------- vista: zoom, desplazamiento, posición de marcadores
  function screenFit() {
    const r = svg.getBoundingClientRect();
    const sc = Math.min(r.width / vb.w, r.height / vb.h);
    return { sc, ox: (r.width - vb.w * sc) / 2, oy: (r.height - vb.h * sc) / 2, r };
  }
  function placeMarkers() {
    const { sc, ox, oy } = screenFit();
    for (const { btn, lon, lat } of markerEls.values()) {
      const [x, y] = project(lon, lat);
      btn.style.setProperty('--x', `${(x - vb.x) * sc + ox}px`);
      btn.style.setProperty('--y', `${(y - vb.y) * sc + oy}px`);
    }
  }
  function setVb(next, { load = true, silent = false } = {}) {
    const minW = 1.2, maxW = full.w * 1.4;
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
      gSitio.setAttribute('font-size', (11.5 / sc).toFixed(2));
      if (Math.abs(symU - 1 / sc) / symU > 0.02) { symU = 1 / sc; drawCuenca(); drawSitio(); }
      root.dataset.zoom = sc > 40 ? 'detalle' : sc > 2.5 ? 'near' : 'far';
    }
    if (load && nasa.activas.length) requestNasa();
    if (!silent) onView?.({ ...vb });
  }
  function zoom(f, cx, cy) {
    const px = cx ?? vb.x + vb.w / 2, py = cy ?? vb.y + vb.h / 2;
    setVb({ x: px - (px - vb.x) * f, y: py - (py - vb.y) * f, w: vb.w * f, h: vb.h * f });
  }
  function fitTo(points, pad = 0.2) {
    if (!points.length) { setVb({ ...full }); return; }
    const xy = points.map(([lo, la]) => project(lo, la));
    const x0 = Math.min(...xy.map((p) => p[0])), x1 = Math.max(...xy.map((p) => p[0])), y0 = Math.min(...xy.map((p) => p[1])), y1 = Math.max(...xy.map((p) => p[1]));
    const w = Math.max(x1 - x0, 2), hh = Math.max(y1 - y0, 2);
    const r = svg.getBoundingClientRect();
    const aspect = r.width && r.height ? r.height / r.width : full.h / full.w;
    let W = w * (1 + pad * 2), H = hh * (1 + pad * 2);
    if (H / W < aspect) H = W * aspect; else W = H / aspect;
    setVb({ x: (x0 + x1) / 2 - W / 2, y: (y0 + y1) / 2 - H / 2, w: W, h: H });
  }
  // Encuadre por defecto: el tramo Caranavi → Guanay, con Alcoche al centro.
  function fitDefault() {
    if (modo === 'muestras' && hayFiltros()) { fitTo(filtradas().filter((m) => m.lat != null).map((m) => [m.lon, m.lat])); return; }
    fitTo([[-67.9, -15.45], [-67.5, -15.88]], 0.04);
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
    else if (e.key === '0') { e.preventDefault(); fitDefault(); }
  });
  let fitted = false;
  new ResizeObserver(() => {
    if (!fitted && svg.getBoundingClientRect().width) { fitted = true; focusOrFit(); return; }
    setVb({ ...vb }, { silent: true });
  }).observe(root);
  function focusOrFit() {
    const m = focus && (state.muestras.find((x) => x.codigo === focus) || state.mape.find((x) => x.id === focus));
    if (m) fitTo([[m.lon - 0.05, m.lat - 0.05], [m.lon + 0.05, m.lat + 0.05]], 0.1); else fitDefault();
  }

  function applyLayers() {
    const list = [...hidden].join(' ');
    svg.setAttribute('data-hide', list);
    root.setAttribute('data-hide', list);
    state.ui.hidden = new Set([...state.ui.hidden].filter((x) => !BASE_LAYERS[modo].some(([key]) => key === x)).concat([...hidden]));
    writePref('ahg.layers.hidden', [...state.ui.hidden]);
  }

  const offs = [
    on('muestras', () => { drawCuenca(); renderMarkers(); }),
    on('filtros', renderMarkers),
    on('mape', () => { drawHuellas(); renderMarkers(); }),
  ];
  applyLayers();
  drawSitio(); drawCuenca(); drawHuellas();
  renderMarkers();
  requestNasa();
  setVb({ ...full }, { load: false, silent: true });
  return {
    el: root, fitTo,
    getView: () => ({ ...vb }),
    setView: (v) => setVb({ ...v }, { silent: true }),
    destroy() { offs.forEach((f) => f()); filt?.destroy(); clearTimeout(nasaTimer); if (popup.matches(':popover-open')) popup.hidePopover(); },
  };
}
