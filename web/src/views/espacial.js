// Vista «Análisis espacial» (módulo con internet): lluvia regional previa a una corrida, relieve y
// drenaje aproximado del área, catálogos de modelos de elevación y referencias territoriales.
import { h, s, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import * as fmt from '../lib/format.js';
import { state } from '../state.js';
import { EARTH_SEARCH, stacSearch, cmrGranules, powerPrecip, s3ToHttps, online, CMR_PRODUCTS } from '../geo/apis.js';
import { terrain, reliefAnalysis, imageToCanvas } from '../geo/raster.js';
import { aoiPicker } from './satelite.js';
import { viewHeader, emptyState } from './common.js';

const nf1 = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 });
const ymd = (d) => d.toISOString().slice(0, 10);

const REFS = [
  ['CEDIB · Minería en áreas protegidas', 'https://www.cedib.org/biblioteca/situacion-de-la-mineria-en-bolivia-en-areas-protegidas/', 'Contexto de superposiciones y categorías mineras. Leer la leyenda de cada mapa y verificar vigencia en fuente oficial.'],
  ['CEDIB · Minería en territorios indígenas', 'https://www.cedib.org/biblioteca/situacion-de-la-mineria-en-bolivia-en-territorios-indigenas/', 'Mismo criterio: contexto, no atribución.'],
  ['AJAM · Autoridad Jurisdiccional Administrativa Minera', 'https://autoridadminera.gob.bo/', 'Títulos, trámites y catastro. Verificar estado, documento y actividad por separado.'],
  ['DGAC · Drones', 'https://www.dgac.gob.bo/drones/', 'Requisitos para un eventual vuelo multiespectral (etapa futura).'],
];

function precipChart(dias) {
  const W = 420, H = 160, m = { l: 40, r: 10, t: 14, b: 28 };
  const max = Math.max(5, ...dias.map((d) => d.mm ?? 0)) * 1.15;
  const bw = (W - m.l - m.r) / dias.length;
  const g = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg mini-chart', role: 'img', 'aria-label': `Precipitación diaria: ${dias.map((d) => `${d.fecha} ${d.mm == null ? 'sin dato' : nf1.format(d.mm) + ' mm'}`).join(', ')}` });
  for (const v of [0, max / 2, max]) g.append(s('line', { x1: m.l, x2: W - m.r, y1: m.t + (1 - v / max) * (H - m.t - m.b), y2: m.t + (1 - v / max) * (H - m.t - m.b), stroke: 'var(--chart-grid)' }),
    s('text', { x: m.l - 6, y: m.t + (1 - v / max) * (H - m.t - m.b) + 4, 'text-anchor': 'end' }, nf0.format(v)));
  dias.forEach((d, i) => {
    const x = m.l + i * bw + bw * 0.2, w = bw * 0.6;
    const hh = d.mm == null ? 0 : (d.mm / max) * (H - m.t - m.b);
    g.append(s('rect', { x, y: H - m.b - hh, width: w, height: Math.max(hh, 1), rx: 3, fill: d.mm == null ? 'var(--color-border)' : 'var(--state-info)' }),
      s('text', { x: x + w / 2, y: H - 10, 'text-anchor': 'middle' }, d.fecha.slice(5)),
      s('text', { x: x + w / 2, y: H - m.b - hh - 4, 'text-anchor': 'middle' }, d.mm == null ? 's/d' : nf1.format(d.mm)));
  });
  g.append(s('text', { class: 'axis-title', x: m.l, y: 10 }, 'mm/día'));
  return g;
}

export function espacialView() {
  const aoi = aoiPicker('esp');
  const lastRun = state.runs.find((r) => !r.descartada);
  const dateIn = h('input', { class: 'input mono', type: 'date', id: 'esp-fecha', value: (lastRun?.fecha_iso || new Date().toISOString()).slice(0, 10) });
  const rainSlot = h('div'); const reliefSlot = h('div'); const demSlot = h('div'); const netNote = h('div');
  const status = h('p', { class: 'meta', role: 'status' });
  const form = h('form', { class: 'card', 'aria-labelledby': 'esp-f', onsubmit: (e) => { e.preventDefault(); run(); } },
    h('h2', { class: 'card-title', id: 'esp-f' }, 'Área y fecha de referencia'),
    h('div', { class: 'fields' }, aoi.el,
      h('div', { class: 'field' }, h('label', { for: 'esp-fecha' }, 'Fecha de la corrida o muestra'), dateIn,
        h('span', { class: 'hint' }, lastRun ? `Por defecto, la de ${lastRun.run_id}.` : 'Sin corridas: usa la fecha de la muestra.'))),
    h('div', { class: 'view-actions' }, h('button', { class: 'btn btn-primary', type: 'submit' }, icon('spatial'), 'Analizar contexto')), status);

  async function run() {
    let area; try { area = aoi.get(); } catch (e) { status.textContent = e.message; return; }
    status.textContent = 'Consultando NASA POWER, NASA CMR, Earth Search y teselas de relieve…';
    const ref = new Date(`${dateIn.value}T00:00:00Z`);
    const d1 = new Date(ref); d1.setUTCDate(d1.getUTCDate() - 3); const d0 = new Date(ref); d0.setUTCDate(d0.getUTCDate() - 1);
    const [lon, lat] = [(area.bbox[0] + area.bbox[2]) / 2, (area.bbox[1] + area.bbox[3]) / 2];
    await Promise.allSettled([rain(area, lon, lat, d1, d0), relief(area), dems(area)]);
    status.textContent = 'Listo. Cada bloque indica su fuente, fecha y resolución.';
  }

  async function rain(area, lon, lat, d1, d0) {
    mount(rainSlot, h('p', { class: 'meta' }, 'Cargando lluvia…'));
    const [pw, im] = await Promise.allSettled([
      powerPrecip(lon, lat, ymd(d1).replace(/-/g, ''), ymd(d0).replace(/-/g, '')),
      cmrGranules('imerg', { start: `${ymd(d1)}T00:00:00Z`, end: `${ymd(d0)}T23:59:59Z`, pageSize: 5 }),
    ]);
    const p = CMR_PRODUCTS.imerg;
    mount(rainSlot, h('section', { class: 'card', 'aria-labelledby': 'rain-t' },
      h('h2', { class: 'card-title', id: 'rain-t' }, 'Lluvia regional en los 3 días completos anteriores'),
      h('p', { class: 'meta' }, `Punto central del área (${lat.toFixed(3)}, ${lon.toFixed(3)}). Da contexto a una lectura; no se atribuye a una parcela ni reemplaza un pluviómetro.`),
      pw.status === 'fulfilled' ? h('div', null,
        precipChart(pw.value.dias),
        pw.value.dias.every((d) => d.mm == null) ? h('p', { class: 'meta' }, 'NASA POWER publica estos datos con unos días de retraso: elige una fecha anterior para ver valores.') : null,
        h('p', { class: 'meta' }, `NASA POWER, PRECTOTCORR (mm/día), API diaria por punto, sin autenticación. Es una estimación de reanálisis corregida; no es el producto IMERG.`))
        : h('p', { class: 'meta' }, `NASA POWER no respondió (${pw.reason?.message}).`),
      h('h3', { class: 'card-title', style: { marginTop: 'var(--sp-3)' } }, `${p.nombre} (${p.short_name}), ${p.res}`),
      im.status === 'fulfilled' && im.value.length ? h('ul', { class: 'saved-list' }, im.value.map((g) => h('li', null,
        h('span', { class: 'mono' }, g.start.slice(0, 10)), ' · ',
        g.data ? h('a', { href: g.data, rel: 'noopener', target: '_blank' }, 'archivo NetCDF') : 'sin enlace', ' · ',
        h('span', { class: 'meta' }, 'variable precipitation, mm/día')))) : h('p', { class: 'meta' }, 'Sin gránulos IMERG encontrados para esas fechas (el producto Early se publica con unas horas de retraso).'),
      h('p', { class: 'meta' }, 'Los valores de IMERG requieren Earthdata Login. Para guardarlos con la ficha: ', h('code', null, 'earthaccess.login(); earthaccess.download(...)'), ' y anotar fecha, resolución, variable y unidad.')));
  }

  async function relief(area) {
    mount(reliefSlot, h('p', { class: 'meta' }, 'Calculando relieve…'));
    try {
      const t = await terrain(area.bbox); const r = reliefAnalysis(t);
      const cv = imageToCanvas(r.image); const ctx = cv.getContext('2d');
      ctx.strokeStyle = 'rgba(124,200,255,0.95)'; ctx.fillStyle = 'rgba(124,200,255,0.95)'; ctx.lineWidth = 1.6;
      for (const a of r.arrows) {
        const len = r.step * 0.38, n = Math.hypot(a.dx, a.dy), ux = a.dx / n, uy = a.dy / n;
        const x2 = a.x + ux * len, y2 = a.y + uy * len;
        ctx.beginPath(); ctx.moveTo(a.x - ux * len * 0.4, a.y - uy * len * 0.4); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - ux * 5 - uy * 3, y2 - uy * 5 + ux * 3); ctx.lineTo(x2 - ux * 5 + uy * 3, y2 - uy * 5 - ux * 3); ctx.fill();
      }
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', `Relieve sombreado del área con flechas de drenaje aproximado. Elevación de ${nf0.format(r.min)} a ${nf0.format(r.max)} m, pendiente media ${nf1.format(r.slope_deg)} grados.`);
      cv.className = 'relief-canvas';
      mount(reliefSlot, h('section', { class: 'card', 'aria-labelledby': 'rel-t' },
        h('h2', { class: 'card-title', id: 'rel-t' }, 'Relieve, pendiente y drenaje aproximado'),
        h('div', { class: 'relief-wrap' }, cv,
          h('div', { class: 'stat-grid' },
            [['Elevación mínima', `${nf0.format(r.min)} m`], ['Elevación máxima', `${nf0.format(r.max)} m`], ['Elevación media', `${nf0.format(r.mean)} m`], ['Pendiente media', `${nf1.format(r.slope_deg)}°`], ['Celda', `≈ ${nf0.format(t.cell_m)} m`]]
              .map(([k, v]) => h('div', { class: 'card stat' }, h('div', { class: 'stat-k' }, k), h('div', { class: 'stat-v' }, v))))),
        h('p', { class: 'meta' }, `Fuente: AWS Terrain Tiles (Terrarium, zoom ${t.zoom}), compilación pública basada sobre todo en SRTM en esta región. Las flechas indican la dirección de máxima pendiente descendente (D8) en una rejilla gruesa: orientan sobre el drenaje, no trazan cauces.`)));
    } catch (e) { mount(reliefSlot, h('p', { class: 'meta' }, `No se pudo cargar el relieve (${e.message}).`)); }
  }

  async function dems(area) {
    const [glo, srtm] = await Promise.allSettled([
      stacSearch({ catalog: EARTH_SEARCH, collection: 'cop-dem-glo-30', bbox: area.bbox, limit: 8 }),
      cmrGranules('srtm', { bbox: area.bbox, pageSize: 8 }),
    ]);
    mount(demSlot, h('section', { class: 'card', 'aria-labelledby': 'dem-t' },
      h('h2', { class: 'card-title', id: 'dem-t' }, 'Modelos de elevación disponibles para el área'),
      h('p', { class: 'meta' }, 'Elegir un solo producto si la pregunta del tramo requiere relieve detallado. Estos archivos se abren en QGIS o Python.'),
      h('div', { class: 'two-col' },
        h('div', null, h('h3', { class: 'card-title' }, 'Copernicus DEM GLO-30 (Earth Search STAC, 30 m)'),
          glo.status === 'fulfilled' && glo.value.length ? h('ul', { class: 'saved-list' }, glo.value.map((it) => h('li', null, h('a', { href: s3ToHttps(it.assets.data.href), rel: 'noopener', target: '_blank', class: 'mono' }, it.id))))
            : h('p', { class: 'meta' }, 'Sin teselas o sin respuesta.')),
        h('div', null, h('h3', { class: 'card-title' }, 'NASA SRTMGL1 v003 (CMR, ~30 m)'),
          srtm.status === 'fulfilled' && srtm.value.length ? h('ul', { class: 'saved-list' }, srtm.value.map((g) => h('li', null, g.data ? h('a', { href: g.data, rel: 'noopener', target: '_blank', class: 'mono' }, g.title) : g.title, h('span', { class: 'meta' }, ' · requiere Earthdata Login'))))
            : h('p', { class: 'meta' }, 'Sin gránulos o sin respuesta.')))));
  }

  const el = h('div', { class: 'view view-wide' },
    viewHeader('Análisis espacial', 'Contexto del tramo con datos abiertos: lluvia regional, relieve y drenaje aproximado, modelos de elevación y referencias territoriales. Necesita internet. Ningún dato de esta vista mide mercurio.'),
    netNote, form, rainSlot, reliefSlot, demSlot,
    h('section', { class: 'card', 'aria-labelledby': 'refs-t' },
      h('h2', { class: 'card-title', id: 'refs-t' }, 'Referencias territoriales'),
      h('ul', { class: 'ref-list' }, REFS.map(([t, u, n]) => h('li', null, h('a', { href: u, rel: 'noopener', target: '_blank' }, t), h('span', { class: 'meta' }, n)))),
      h('p', { class: 'meta', style: { margin: 0 } }, 'Los mapas y el catastro aportan contexto. Atribuir un hallazgo a una operación exige evidencia específica.')),
    h('section', { class: 'card', 'aria-labelledby': 'tramo-t' },
      h('h2', { class: 'card-title', id: 'tramo-t' }, 'Tramo de interés'),
      h('p', { class: 'meta' }, 'Sin sitio piloto acordado, el tramo se muestra como esquema conceptual (aguas arriba de comparación, ribera de interés, depósito candidato, aguas abajo).'),
      h('a', { class: 'btn btn-ghost', href: '#/mapa' }, icon('map'), 'Abrir el mapa')));

  online().then((ok) => { if (!ok) mount(netNote, emptyState({ iconName: 'wifi_off', title: 'Sin internet', text: 'Esta vista consulta servicios externos (NASA, Copernicus, AWS). Ábrela desde un equipo con conexión; la estación sigue funcionando por Wi-Fi local.' })); });
  return { el };
}
