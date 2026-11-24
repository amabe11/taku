// Vista «Imágenes satelitales» (módulo con internet). Sentinel-2 L2A por Earth Search STAC:
// dos fechas comparables, recorte en color real (TCI), NDVI con máscara SCL y cambio entre fechas.
// HLS v2 por NASA CMR (vistas previas). Lo calculado se guarda en el navegador para verlo sin internet.
// Las imágenes muestran cobertura y cambios superficiales: NO miden mercurio.
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { announce } from '../lib/announce.js';
import * as fmt from '../lib/format.js';
import { AOIS, EARTH_SEARCH, CDSE_STAC, stacSearch, cmrGranules, itemEpsg, online } from '../geo/apis.js';
import { trueColor, ndvi, ndviImage, ndviChange, imageToCanvas } from '../geo/raster.js';
import { putItem, listItems, deleteItem } from '../store.js';
import { downloadText } from '../csv.js';
import { viewHeader, emptyState } from './common.js';

const nf1 = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function aoiPicker(prefix) {
  const sel = h('select', { class: 'select', id: `${prefix}-aoi` },
    AOIS.map((a) => h('option', { value: a.id }, a.nombre)), h('option', { value: 'custom' }, 'Personalizada (lon/lat WGS84)'));
  const inputs = ['oeste', 'sur', 'este', 'norte'].map((k, i) => h('div', { class: 'field' },
    h('label', { for: `${prefix}-${k}` }, k[0].toUpperCase() + k.slice(1)),
    h('input', { class: 'input mono', id: `${prefix}-${k}`, inputmode: 'decimal', value: String(AOIS[0].bbox[i]) })));
  const custom = h('div', { class: 'fields', hidden: true }, inputs);
  const note = h('p', { class: 'meta', style: { margin: 0 } }, AOIS[0].nota);
  sel.addEventListener('change', () => {
    const a = AOIS.find((x) => x.id === sel.value);
    custom.hidden = sel.value !== 'custom';
    note.textContent = a ? a.nota : 'Área definida por el equipo. Indica fuente y permiso si corresponde a un sitio acordado.';
    if (a) inputs.forEach((f, i) => { f.querySelector('input').value = String(a.bbox[i]); });
  });
  const el = h('div', { class: 'field' }, h('label', { for: `${prefix}-aoi` }, 'Área de interés'), h('div', { class: 'select-wrap' }, sel, icon('chevron')), custom, note);
  return {
    el,
    get() {
      const a = AOIS.find((x) => x.id === sel.value);
      const bbox = inputs.map((f) => Number(f.querySelector('input').value.replace(',', '.')));
      if (bbox.some((v) => !Number.isFinite(v)) || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) throw new Error('Revisa el área: oeste < este y sur < norte, en grados decimales.');
      return { id: sel.value, nombre: a?.nombre || 'Área personalizada', bbox, ejemplo: a ? a.ejemplo : false };
    },
  };
}

const dateField = (id, label, value) => h('div', { class: 'field' }, h('label', { for: id }, label), h('input', { class: 'input mono', type: 'date', id, value }));

function sceneCard(item, group, onPick) {
  const p = item.properties; const thumb = item.assets?.thumbnail?.href;
  const id = `${group}-${item.id}`;
  return h('label', { class: 'scene-card' },
    h('input', { type: 'radio', name: group, value: item.id, onchange: () => onPick(item) }),
    thumb && thumb.startsWith('https') ? h('img', { src: thumb, alt: '', loading: 'lazy', width: 96, height: 96 }) : h('span', { class: 'scene-ph' }, icon('satellite')),
    h('span', { class: 'scene-txt', id },
      h('b', null, fmt.dateTime(p.datetime)),
      h('span', { class: 'meta' }, `Nubes ${p['eo:cloud_cover'] != null ? nf1.format(p['eo:cloud_cover']) : '—'} % · ${item.id.split('_').slice(0, 2).join(' ')}`)));
}

export function sateliteView() {
  const aoi = aoiPicker('sat');
  const status = h('div', { role: 'status', class: 'meta' });
  const netNote = h('div');
  const results = h('div', { class: 'two-col' });
  const compareSlot = h('div');
  const hlsSlot = h('div');
  const savedSlot = h('div');
  const today = new Date();
  const y = today.getFullYear();
  const catalog = h('select', { class: 'select', id: 'sat-cat' },
    h('option', { value: EARTH_SEARCH }, 'Earth Search STAC (Element84) · sentinel-2-c1-l2a'),
    h('option', { value: CDSE_STAC }, 'Copernicus Data Space STAC · sentinel-2-l2a (solo búsqueda)'));
  const cloud = h('input', { class: 'input mono', id: 'sat-cloud', type: 'number', min: 0, max: 100, value: 40 });
  const picked = { a: null, b: null };
  const compareBtn = h('button', { class: 'btn btn-primary', type: 'button', disabled: true, onclick: () => compare() }, icon('satellite'), 'Comparar recortes');

  const form = h('form', { class: 'card', 'aria-labelledby': 'sat-f', onsubmit: (e) => { e.preventDefault(); search(); } },
    h('h2', { class: 'card-title', id: 'sat-f' }, 'Área y fechas comparables'),
    h('p', { class: 'meta' }, 'Busca dos fechas de época comparable (por ejemplo, la misma estación seca de dos años). Se recortan con la misma extensión y el mismo criterio de visualización.'),
    h('div', { class: 'fields' }, aoi.el,
      h('div', { class: 'field' }, h('label', { for: 'sat-cat' }, 'Catálogo'), h('div', { class: 'select-wrap' }, catalog, icon('chevron')))),
    h('div', { class: 'fields' },
      dateField('sat-a1', 'Fecha 1 · desde', `${y - 2}-06-01`), dateField('sat-a2', 'Fecha 1 · hasta', `${y - 2}-09-30`),
      dateField('sat-b1', 'Fecha 2 · desde', `${y - 1}-06-01`), dateField('sat-b2', 'Fecha 2 · hasta', `${y - 1}-09-30`),
      h('div', { class: 'field' }, h('label', { for: 'sat-cloud' }, 'Nubes máximas (%)'), cloud)),
    h('div', { class: 'view-actions' }, h('button', { class: 'btn btn-primary', type: 'submit' }, icon('satellite'), 'Buscar escenas'), compareBtn),
    status);

  const val = (id) => form.querySelector(`#${id}`).value;
  async function search() {
    let area; try { area = aoi.get(); } catch (e) { status.textContent = e.message; return; }
    status.textContent = 'Buscando escenas…'; picked.a = picked.b = null; compareBtn.disabled = true; mount(compareSlot, null);
    const cat = catalog.value; const coll = cat === EARTH_SEARCH ? 'sentinel-2-c1-l2a' : 'sentinel-2-l2a';
    try {
      const [A, B] = await Promise.all([
        stacSearch({ catalog: cat, collection: coll, bbox: area.bbox, datetime: `${val('sat-a1')}T00:00:00Z/${val('sat-a2')}T23:59:59Z`, cloudMax: Number(cloud.value) }),
        stacSearch({ catalog: cat, collection: coll, bbox: area.bbox, datetime: `${val('sat-b1')}T00:00:00Z/${val('sat-b2')}T23:59:59Z`, cloudMax: Number(cloud.value) }),
      ]);
      const pick = (k) => (it) => { picked[k] = it; compareBtn.disabled = !(picked.a && picked.b) || cat !== EARTH_SEARCH; };
      const list = (title, items, k) => h('section', { class: 'card', 'aria-label': title },
        h('h3', { class: 'card-title' }, `${title} · ${items.length} escenas`),
        items.length ? h('div', { class: 'scene-list', role: 'radiogroup', 'aria-label': title }, items.map((it) => sceneCard(it, `sat-${k}`, pick(k))))
          : h('p', { class: 'meta' }, 'Sin escenas con esas condiciones. Amplía la ventana o el máximo de nubes.'));
      mount(results, list('Fecha 1', A, 'a'), list('Fecha 2', B, 'b'));
      status.textContent = `${A.length + B.length} escenas encontradas en ${new URL(cat).host}. ${cat === EARTH_SEARCH ? 'Elige una por fecha y compara.' : 'Este catálogo exige cuenta para leer el archivo: úsalo para ubicar escenas; la comparación usa Earth Search.'}`;
      searchHls(area);
    } catch (e) { status.textContent = `No se pudo consultar el catálogo (${e.message}). Revisa la conexión a internet.`; }
  }

  async function compare() {
    const area = aoi.get(); const [a, b] = [picked.a, picked.b];
    if (itemEpsg(a) !== itemEpsg(b)) announce('Las escenas están en zonas UTM distintas; el recorte se hace en la zona de cada escena.');
    mount(compareSlot, h('section', { class: 'card' }, h('p', { class: 'meta', role: 'status' }, 'Leyendo recortes de los COG (lectura por rangos, solo el área pedida)…')));
    try {
      const [rgbA, rgbB] = await Promise.all([trueColor(a, area.bbox), trueColor(b, area.bbox)]);
      const size = [rgbA.width, rgbA.height];
      const [ndA, ndB] = await Promise.all([ndvi(a, area.bbox, size), ndvi(b, area.bbox, size)]);
      const ch = ndviChange(ndA, ndB);
      const manifest = {
        generado_utc: new Date().toISOString(), area: area.nombre, bounds_wgs84: area.bbox, is_reference_example: !!area.ejemplo,
        nota: 'Contexto de cobertura y cambios superficiales. No mide mercurio.',
        valid_overlap_pct: +ch.valid_overlap_pct.toFixed(1),
        escenas: [a, b].map((it, i) => ({
          provider: 'Copernicus Sentinel-2 · Earth Search (Element84)', collection: 'sentinel-2-c1-l2a', scene_id: it.id,
          acquired_at_utc: it.properties.datetime, cloud_cover_pct: it.properties['eo:cloud_cover'], epsg: itemEpsg(it),
          pixel_size_m: +(i ? rgbB : rgbA).pixel_m.toFixed(1), ndvi_valid_pct: +(i ? ndB : ndA).valid_pct.toFixed(1), ndvi_media: (i ? ndB : ndA).mean,
        })),
        ndvi: { formula: '(B08 - B04) / (B08 + B04) en reflectancia', mascara: 'SCL: sin dato, saturado, sombra de nube, nube media/alta, cirro', perdida_pct: +ch.perdida_pct.toFixed(1), ganancia_pct: +ch.ganancia_pct.toFixed(1), umbral_cambio: 0.15 },
      };
      const imgs = {
        rgb1: imageToCanvas(rgbA.image).toDataURL('image/jpeg', 0.86), rgb2: imageToCanvas(rgbB.image).toDataURL('image/jpeg', 0.86),
        ndvi1: imageToCanvas(ndviImage(ndA)).toDataURL('image/png'), ndvi2: imageToCanvas(ndviImage(ndB)).toDataURL('image/png'),
        cambio: imageToCanvas(ch.image).toDataURL('image/png'),
      };
      showComparison({ id: `ESC-${Date.now().toString(36).toUpperCase()}`, creada: Date.now(), manifest, imagenes: imgs }, true);
    } catch (e) {
      mount(compareSlot, h('section', { class: 'card' }, h('p', { class: 'form-error' }, `No se pudieron leer los recortes: ${e.message}. Prueba con un área más pequeña o revisa la conexión.`)));
    }
  }

  function showComparison(esc, fresh = false) {
    const m = esc.manifest; const [ea, eb] = m.escenas;
    const fig = (src, cap, alt) => h('figure', { class: 'sat-fig' }, h('img', { src, alt }), h('figcaption', null, cap));
    const saveBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => { await putItem('escenas', esc); saveBtn.disabled = true; saveBtn.replaceChildren(icon('check'), 'Guardada en este navegador'); announce('Comparación guardada para usar sin internet.'); renderSaved(); } }, icon('save'), 'Guardar para usar sin internet');
    if (!fresh) { saveBtn.disabled = true; saveBtn.replaceChildren(icon('check'), 'Guardada en este navegador'); }
    mount(compareSlot, h('section', { class: 'card', 'aria-labelledby': 'cmp-t' },
      h('div', { class: 'card-head' },
        h('h2', { class: 'card-title', id: 'cmp-t' }, `Comparación · ${m.area}`),
        h('div', { class: 'badge-row' },
          m.is_reference_example ? h('span', { class: 'badge', dataset: { tone: 'info' } }, icon('info'), h('span', { class: 'badge-text' }, 'Ejemplo satelital')) : null,
          h('span', { class: 'prov', dataset: { prov: 'historico' } }, 'Copernicus Sentinel-2'))),
      h('div', { class: 'sat-grid' },
        fig(esc.imagenes.rgb1, `Color real · ${fmt.dateTime(ea.acquired_at_utc)} · nubes ${nf1.format(ea.cloud_cover_pct)} %`, `Color real, fecha 1, ${m.area}`),
        fig(esc.imagenes.rgb2, `Color real · ${fmt.dateTime(eb.acquired_at_utc)} · nubes ${nf1.format(eb.cloud_cover_pct)} %`, `Color real, fecha 2, ${m.area}`),
        fig(esc.imagenes.ndvi1, `NDVI fecha 1 · media ${ea.ndvi_media != null ? nf2.format(ea.ndvi_media) : '—'} · válidos ${nf1.format(ea.ndvi_valid_pct)} %`, 'NDVI fecha 1'),
        fig(esc.imagenes.ndvi2, `NDVI fecha 2 · media ${eb.ndvi_media != null ? nf2.format(eb.ndvi_media) : '—'} · válidos ${nf1.format(eb.ndvi_valid_pct)} %`, 'NDVI fecha 2'),
        fig(esc.imagenes.cambio, `Cambio de NDVI (2 − 1) · pérdida ${nf1.format(m.ndvi.perdida_pct)} % · ganancia ${nf1.format(m.ndvi.ganancia_pct)} %`, 'Cambio de NDVI entre fechas: pardo pérdida, verde azulado ganancia, gris sin dato')),
      h('div', { class: 'chart-legend' },
        h('span', { class: 'key' }, h('span', { class: 'ramp ramp-ndvi' }), 'NDVI: suelo → vegetación densa'),
        h('span', { class: 'key' }, h('span', { class: 'ramp ramp-diff' }), 'Cambio: pérdida ← sin cambio → ganancia (|Δ| ≥ 0,15)'),
        h('span', { class: 'key' }, h('span', { class: 'sym', style: { background: 'rgb(70 70 80)' } }), 'Sin dato válido (nube, sombra o fuera de escena)')),
      h('p', { class: 'meta' }, `Cobertura válida común: ${nf1.format(m.valid_overlap_pct)} %. Píxel de salida ≈ ${ea.pixel_size_m} m. Fuente: Copernicus Sentinel-2 L2A (ESA), vía Earth Search; escenas ${ea.scene_id} y ${eb.scene_id}. Los cauces estrechos se mezclan con orillas y vegetación en un mismo píxel. Cambios superficiales: no indican mercurio.`),
      h('div', { class: 'view-actions' }, saveBtn,
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => downloadText(JSON.stringify(m, null, 2), `manifest_${esc.id}.json`, 'application/json') }, icon('download'), 'Descargar manifest.json'),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => Object.entries(esc.imagenes).forEach(([k, url], i) => setTimeout(() => { const a = document.createElement('a'); a.href = url; a.download = `${esc.id}_${k}.${url.startsWith('data:image/png') ? 'png' : 'jpg'}`; a.click(); }, i * 250)) }, icon('download'), 'Descargar imágenes')),
    ));
    compareSlot.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  async function searchHls(area) {
    mount(hlsSlot, h('p', { class: 'meta', role: 'status' }, 'Consultando NASA CMR (HLS)…'));
    try {
      const [l, s2] = await Promise.all([
        cmrGranules('hlsl', { bbox: area.bbox, start: `${val('sat-b1')}T00:00:00Z`, end: `${val('sat-b2')}T23:59:59Z`, pageSize: 6 }),
        cmrGranules('hlss', { bbox: area.bbox, start: `${val('sat-b1')}T00:00:00Z`, end: `${val('sat-b2')}T23:59:59Z`, pageSize: 6 }),
      ]);
      const all = [...l, ...s2].filter((g) => g.browse).sort((a, b) => (a.cloud ?? 100) - (b.cloud ?? 100)).slice(0, 8);
      mount(hlsSlot, h('section', { class: 'card', 'aria-labelledby': 'hls-t' },
        h('h2', { class: 'card-title', id: 'hls-t' }, 'NASA HLS v2 (Landsat y Sentinel-2 armonizados, 30 m) · Fecha 2'),
        h('p', { class: 'meta' }, 'Vistas previas públicas de LP DAAC encontradas con NASA CMR. Sirven para ampliar el historial; la descarga de bandas requiere Earthdata Login.'),
        all.length ? h('div', { class: 'hls-grid' }, all.map((g) => h('figure', { class: 'sat-fig' },
          h('img', { src: g.browse, alt: `Vista previa HLS ${g.title}`, loading: 'lazy' }),
          h('figcaption', null, `${fmt.dateTime(g.start)} · nubes ${g.cloud ?? '—'} % · ${g.title.split('.').slice(1, 3).join(' ')}`))))
          : h('p', { class: 'meta' }, 'Sin gránulos HLS con vista previa en esa ventana.')));
    } catch (e) { mount(hlsSlot, h('p', { class: 'meta' }, `NASA CMR no respondió (${e.message}).`)); }
  }

  async function renderSaved() {
    const list = await listItems('escenas');
    mount(savedSlot, list.length ? h('section', { class: 'card', 'aria-labelledby': 'saved-t' },
      h('h2', { class: 'card-title', id: 'saved-t' }, 'Comparaciones guardadas (disponibles sin internet)'),
      h('ul', { class: 'saved-list' }, list.map((e) => h('li', null,
        h('button', { class: 'link-btn', type: 'button', onclick: () => showComparison(e) }, `${e.manifest.area} · ${e.manifest.escenas.map((x) => x.acquired_at_utc.slice(0, 10)).join(' vs ')}`),
        h('span', { class: 'meta' }, ` · ${fmt.dateTime(new Date(e.creada).toISOString())} `),
        h('button', { class: 'btn btn-quiet', type: 'button', 'aria-label': `Eliminar comparación ${e.id}`, onclick: async () => { await deleteItem('escenas', e.id); renderSaved(); } }, 'Eliminar'))))) : null);
  }

  const el = h('div', { class: 'view view-wide' },
    viewHeader('Imágenes satelitales', 'Contexto territorial con datos abiertos: Copernicus Sentinel-2 (STAC) y NASA HLS (CMR). Necesita internet; la estación sigue funcionando por Wi-Fi local. Las imágenes no miden mercurio.'),
    netNote, form, results, compareSlot, hlsSlot, savedSlot,
    h('section', { class: 'card future-card', 'aria-labelledby': 'dron-t' },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title', id: 'dron-t' }, 'Imágenes multiespectrales con dron'),
        h('span', { class: 'badge', dataset: { tone: 'info' } }, icon('clock'), h('span', { class: 'badge-text' }, 'Escenario futuro · no operativo'))),
      h('p', { class: 'meta', style: { margin: 0 } }, 'Extensión de campo para observar riberas y cambios superficiales con más detalle. Requiere un objetivo concreto, un sitio acordado y un operador habilitado según la DGAC. Las imágenes serían datos propios o cedidos, con acceso según el acuerdo territorial.')));

  online().then((ok) => {
    if (!ok) mount(netNote, emptyState({ iconName: 'wifi_off', title: 'Sin internet', text: 'Esta vista consulta catálogos externos. Ábrela desde un equipo con conexión; mientras tanto, puedes ver aquí las comparaciones guardadas.' }));
  });
  renderSaved();
  return { el };
}
