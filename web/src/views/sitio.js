// Vista «Sitio Alcoche»: por qué empezar aquí y qué dicen los datos abiertos del lugar.
//   · Antecedentes publicados (estudios, AJAM, Concejo Municipal, prensa) con su tipo de fuente.
//   · Huella minera por año a menos de 10 km (Amazon Mining Watch).
//   · Río Coroico hoy: caudal GloFAS (Copernicus, vía Open-Meteo) y lluvia — el mercurio viaja con la crecida.
//   · Suelo (SoilGrids): arcilla, carbono y pH — el mercurio viaja con la arcilla.
//   · Peces registrados en la cuenca (GBIF), con su gremio trófico, para el cabezal PEZ.
import { h, s, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import * as fmt from '../lib/format.js';
import { state, on } from '../state.js';
import { distanciaKm, posicionEnEje } from '../model.js';
import { SITIO, GEO, REFERENCIAS, TIPO_REF, huellasPorAnio } from '../data/alcoche.js';
import { PECES } from '../data/simulacion.js';
import { caudalGlofas, lluviaOpenMeteo, sueloSoilGrids, pecesGbif } from '../geo/apis.js';
import { viewHeader, dl } from './common.js';

const nf1 = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 });

/** Barras verticales simples (una serie): 4 px de radio en el extremo, base anclada, etiqueta en la mayor. */
function barras(datos, { alto = 160, etiqueta, unidad = '', titulo }) {
  const W = 560, H = alto, pad = { l: 34, r: 8, t: 18, b: 26 };
  const max = Math.max(1, ...datos.map((d) => d.v));
  const bw = (W - pad.l - pad.r) / datos.length;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const readout = h('p', { class: 'chart-readout meta', 'aria-live': 'polite' }, ' ');
  const ticks = [0, Math.round(max / 2), max];
  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': titulo },
    ticks.map((t) => s('g', null, s('line', { class: 'chart-grid', x1: pad.l, x2: W - pad.r, y1: y(t), y2: y(t) }), s('text', { class: 'chart-axis', x: pad.l - 6, y: y(t) + 4, 'text-anchor': 'end' }, String(t)))),
    datos.map((d, i) => {
      const x = pad.l + i * bw + bw * 0.2, w = bw * 0.6, top = y(d.v), hgt = H - pad.b - top;
      const g = s('g', { class: 'bar', tabindex: '0', 'aria-label': `${d.x}: ${d.v} ${unidad}` },
        s('rect', { class: 'bar-hit', x: pad.l + i * bw, y: pad.t, width: bw, height: H - pad.t - pad.b }),
        d.v ? s('path', { class: 'bar-mark', d: `M${x} ${H - pad.b}V${top + Math.min(4, hgt)}q0 -4 4 -4h${w - 8}q4 0 4 4V${H - pad.b}Z` }) : null,
        s('text', { class: 'chart-axis', x: x + w / 2, y: H - pad.b + 16, 'text-anchor': 'middle' }, String(d.x)),
        d.v === max && etiqueta ? s('text', { class: 'chart-label', x: x + w / 2, y: top - 5, 'text-anchor': 'middle' }, String(d.v)) : null);
      const show = () => { readout.textContent = `${d.x}: ${d.v} ${unidad}`; };
      g.addEventListener('pointerenter', show); g.addEventListener('focus', show);
      return g;
    }));
  return h('figure', { class: 'chart-fig' }, svg, readout);
}

/** Línea de una serie con tramo de pronóstico punteado y lectura al pasar el puntero. */
function linea(datos, { alto = 170, unidad, titulo, marca }) {
  const W = 560, H = alto, pad = { l: 40, r: 10, t: 14, b: 26 };
  const vals = datos.map((d) => d.v).filter((v) => v != null);
  const max = Math.max(...vals) * 1.08, min = 0;
  const x = (i) => pad.l + (W - pad.l - pad.r) * (i / Math.max(1, datos.length - 1));
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - (v - min) / (max - min || 1));
  const p = (sel) => datos.map((d, i) => (sel(d, i) && d.v != null ? `${x(i).toFixed(1)},${y(d.v).toFixed(1)}` : null)).filter(Boolean);
  const iHoy = datos.findIndex((d) => d.pronostico);
  const pasado = p((d, i) => iHoy < 0 || i <= iHoy);
  const futuro = iHoy < 0 ? [] : p((d, i) => i >= iHoy - 1);
  const readout = h('p', { class: 'chart-readout meta', 'aria-live': 'polite' }, ' ');
  const cursor = s('line', { class: 'chart-cursor', y1: pad.t, y2: H - pad.b, x1: 0, x2: 0, visibility: 'hidden' });
  const dot = s('circle', { class: 'chart-dot', r: 4, cx: 0, cy: 0, visibility: 'hidden' });
  const ticks = [0, max / 2, max].map((t) => Math.round(t));
  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': titulo },
    ticks.map((t) => s('g', null, s('line', { class: 'chart-grid', x1: pad.l, x2: W - pad.r, y1: y(t), y2: y(t) }), s('text', { class: 'chart-axis', x: pad.l - 6, y: y(t) + 4, 'text-anchor': 'end' }, fmt.int(t)))),
    iHoy > 0 ? s('rect', { class: 'chart-forecast', x: x(iHoy - 1), y: pad.t, width: W - pad.r - x(iHoy - 1), height: H - pad.t - pad.b }) : null,
    s('polyline', { class: 'chart-line', points: pasado.join(' ') }),
    futuro.length ? s('polyline', { class: 'chart-line forecast', points: futuro.join(' ') }) : null,
    [0, Math.floor(datos.length / 2), datos.length - 1].map((i) => s('text', { class: 'chart-axis', x: x(i), y: H - 8, 'text-anchor': i === 0 ? 'start' : i === datos.length - 1 ? 'end' : 'middle' }, fmt.dateOnly(datos[i].fecha))),
    iHoy > 0 ? s('text', { class: 'chart-axis', x: x(iHoy - 1) + 4, y: pad.t + 10 }, 'pronóstico') : null,
    cursor, dot);
  svg.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(datos.length - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (datos.length - 1))));
    const d = datos[i];
    cursor.setAttribute('x1', x(i)); cursor.setAttribute('x2', x(i)); cursor.setAttribute('visibility', 'visible');
    if (d.v != null) { dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(d.v)); dot.setAttribute('visibility', 'visible'); }
    readout.textContent = `${fmt.dateOnly(d.fecha)}${d.pronostico ? ' (pronóstico)' : ''}: ${d.v == null ? 'sin dato' : `${nf1.format(d.v)} ${unidad}`}${marca ? marca(d) : ''}`;
  });
  svg.addEventListener('pointerleave', () => { cursor.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); });
  return h('figure', { class: 'chart-fig' }, svg, readout);
}

export function sitioView() {
  const hp = huellasPorAnio(SITIO.lon, SITIO.lat, 10);
  const loc = (n) => GEO.localidades.find((l) => l.nombre === n);
  const kmSitio = posicionEnEje(state.cuenca.eje, SITIO.lon, SITIO.lat).km;
  const abajo = (state.cuenca.comunidades || []).filter((c) => c.nombre !== SITIO.nombre && posicionEnEje(state.cuenca.eje, c.lon, c.lat).km > kmSitio);
  const dist = (n) => { const l = loc(n); return l ? `${nf1.format(distanciaKm(l.lon, l.lat, SITIO.lon, SITIO.lat))} km` : '—'; };

  const ficha = h('section', { class: 'card' },
    h('h2', { class: 'card-title' }, 'El lugar'),
    h('p', { class: 'meta' }, SITIO.descripcion),
    dl([
      ['Ubicación', `${Math.abs(SITIO.lat).toFixed(4)}° S, ${Math.abs(SITIO.lon).toFixed(4)}° O · ${SITIO.municipio}, ${SITIO.departamento}`],
      ['Población', `${fmt.int(SITIO.poblacion)} hab. (${SITIO.poblacion_fuente})`],
      ['Altitud', `${SITIO.elevacion_m} m`],
      ['Río', `${SITIO.rio} · ${SITIO.cuenca}`],
      ['Distancias', `Caranavi ${dist('Caranavi')} · Santa Fe ${dist('Santa Fe')} · Guanay ${dist('Guanay')}`],
      ['Aguas abajo', `${fmt.int(abajo.reduce((a, c) => a + (c.poblacion || 0), 0))} hab. en ${abajo.length} localidades junto al río hasta Mayaya (OSM)`],
      ['Mediciones de Hg', 'Ninguna pública en Alcoche. El Concejo pidió análisis oficiales (oct. 2026).'],
    ]));

  const huella = h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Minería aurífera nueva a menos de 10 km'), h('a', { class: 'btn btn-quiet', href: '#/mapa' }, 'Ver en el mapa', icon('arrow_right'))),
    h('p', { class: 'stat-v' }, `${hp.total} parches`, h('span', { class: 'meta' }, ` de 480 m con huella minera (Amazon Mining Watch, Sentinel-2). Año en que se confirmó cada uno:`)),
    barras(hp.anios.map((a) => ({ x: a.anio, v: a.nuevos })), { etiqueta: true, unidad: 'parches nuevos', titulo: `Parches nuevos con huella minera por año a menos de 10 km de Alcoche. Total ${hp.total}.` }),
    h('p', { class: 'meta', style: { margin: 0 } }, 'Antes de 2021 no hay huellas junto a Alcoche; el salto de 2023 coincide con la inspección de la AJAM (2025) y la denuncia del Concejo (2026). Un parche es un recuadro de 480 m donde el modelo ve minería: el área minada real es menor.'));

  const rio = h('section', { class: 'card' }, h('h2', { class: 'card-title' }, 'Río Coroico hoy'), h('p', { class: 'meta' }, 'Consultando caudal y lluvia…'));
  const suelo = h('section', { class: 'card' }, h('h2', { class: 'card-title' }, 'Suelo en Alcoche'), h('p', { class: 'meta' }, 'Consultando SoilGrids…'));
  const peces = h('section', { class: 'card' }, h('h2', { class: 'card-title' }, 'Peces registrados en la cuenca'), h('p', { class: 'meta' }, 'Consultando GBIF…'));

  (async () => {
    try {
      const [q, ll] = await Promise.all([caudalGlofas(SITIO.lon, SITIO.lat), lluviaOpenMeteo(SITIO.lon, SITIO.lat).catch(() => null)]);
      const hoy = q.filter((d) => !d.pronostico).at(-1);
      const base = [...q.filter((d) => !d.pronostico)].sort((a, b) => a.m3s - b.m3s)[Math.floor(q.filter((d) => !d.pronostico).length / 2)]?.m3s;
      const picoPron = Math.max(...q.filter((d) => d.pronostico).map((d) => d.m3s));
      const lluvia30 = ll ? ll.filter((d) => d.fecha <= hoy.fecha).slice(-30).reduce((a, d) => a + (d.mm || 0), 0) : null;
      const crecida = hoy && base && (hoy.m3s > base * 1.8 || picoPron > base * 1.8);
      mount(rio,
        h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Río Coroico hoy · caudal modelado'), crecida ? h('span', { class: 'badge', dataset: { tone: 'warn' } }, icon('drop'), h('span', { class: 'badge-text' }, 'Crecida en curso')) : null),
        h('div', { class: 'stat-grid' },
          h('div', { class: 'stat' }, h('span', { class: 'stat-k' }, 'Caudal último día'), h('span', { class: 'stat-v' }, `${fmt.int(hoy?.m3s)} m³/s`)),
          h('div', { class: 'stat' }, h('span', { class: 'stat-k' }, 'Mediana 30 días'), h('span', { class: 'stat-v' }, `${fmt.int(base)} m³/s`)),
          h('div', { class: 'stat' }, h('span', { class: 'stat-k' }, 'Pico del pronóstico'), h('span', { class: 'stat-v' }, `${fmt.int(picoPron)} m³/s`)),
          lluvia30 != null ? h('div', { class: 'stat' }, h('span', { class: 'stat-k' }, 'Lluvia 30 días'), h('span', { class: 'stat-v' }, `${fmt.int(lluvia30)} mm`)) : null),
        linea(q.map((d) => ({ fecha: d.fecha, v: d.m3s, pronostico: d.pronostico })), { unidad: 'm³/s', titulo: 'Caudal diario del río Coroico en Alcoche, últimos 30 días y 7 de pronóstico (GloFAS).' }),
        h('p', { class: 'warn-note' }, icon('info', { cls: 'inline-ic' }), ' En el río Beni el mercurio total del agua pasó de 19 ng/L en estiaje a 460 ng/L en el pico de crecida, casi todo pegado al sedimento (Maurice-Bourgoin et al., 2002). Anota el caudal del día en cada muestra: una muestra en crecida no se compara con una de estiaje.'),
        h('p', { class: 'meta', style: { margin: 0 } }, 'Fuentes: GloFAS v4 (Copernicus Emergency Management Service, ~5 km) y lluvia ERA5/pronóstico, ambos vía Open-Meteo. Es un modelo, no un aforo.'));
    } catch (e) { mount(rio, h('h2', { class: 'card-title' }, 'Río Coroico hoy'), h('p', { class: 'form-error' }, `No se pudo consultar Open-Meteo: ${e.message}`)); }
  })();
  (async () => {
    try {
      const sg = await sueloSoilGrids(SITIO.lon, SITIO.lat);
      mount(suelo,
        h('h2', { class: 'card-title' }, 'Suelo en Alcoche (0–5 cm)'),
        h('div', { class: 'stat-grid' },
          h('div', { class: 'stat' }, h('span', { class: 'stat-k' }, 'Arcilla'), h('span', { class: 'stat-v' }, `${nf1.format(sg.arcilla_pct)} %`)),
          h('div', { class: 'stat' }, h('span', { class: 'stat-k' }, 'Arena'), h('span', { class: 'stat-v' }, `${nf1.format(sg.arena_pct)} %`)),
          h('div', { class: 'stat' }, h('span', { class: 'stat-k' }, 'Carbono orgánico'), h('span', { class: 'stat-v' }, `${nf1.format(sg.carbono_g_kg)} g/kg`)),
          h('div', { class: 'stat' }, h('span', { class: 'stat-k' }, 'pH'), h('span', { class: 'stat-v' }, nf1.format(sg.ph)))),
        h('p', { class: 'meta' }, 'En la llanura del Beni el mercurio sigue a la arcilla (r² = 0,74 en 139 muestras). Para el cabezal SED: tomar la fracción fina y anotar el % de finos, porque una muestra arenosa puede salir verde sin que el río esté limpio. El pH ácido y el carbono orgánico favorecen que el mercurio se movilice y se metile.'),
        h('p', { class: 'meta', style: { margin: 0 } }, 'Fuente: SoilGrids 2.0, ISRIC (mapa global de 250 m; es el suelo de la ladera, no el sedimento del río).'));
    } catch (e) { mount(suelo, h('h2', { class: 'card-title' }, 'Suelo en Alcoche'), h('p', { class: 'form-error' }, `No se pudo consultar SoilGrids: ${e.message}`)); }
  })();
  (async () => {
    try {
      const g = await pecesGbif({ lonMin: -68.2, latMin: -16.1, lonMax: -67.3, latMax: -15.3 }, 14);
      mount(peces,
        h('h2', { class: 'card-title' }, 'Peces registrados en la cuenca (GBIF)'),
        h('p', { class: 'meta' }, `${fmt.int(g.total)} registros de Characiformes, Siluriformes y Gymnotiformes en el recuadro Caranavi–Guanay–Alto Beni. Los depredadores acumulan más mercurio: son los que se muestrean primero con el cabezal PEZ.`),
        h('table', { class: 'data-table compact' },
          h('caption', { class: 'sr-only' }, 'Especies de peces con más registros en GBIF cerca de Alcoche'),
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Especie'), h('th', { scope: 'col' }, 'Familia'), h('th', { scope: 'col' }, 'Gremio'), h('th', { scope: 'col', class: 'num' }, 'Registros'))),
          h('tbody', null, g.especies.map((e) => h('tr', null,
            h('th', { scope: 'row' }, h('a', { class: 'row-link', href: `https://www.gbif.org/species/${e.key}`, target: '_blank', rel: 'noopener' }, h('i', null, e.nombre)), PECES[e.nombre] ? h('div', { class: 'meta' }, PECES[e.nombre].comun) : null),
            h('td', null, e.familia || '—'),
            h('td', null, PECES[e.nombre]?.gremio || (e.familia === 'Pimelodidae' ? 'depredador (familia)' : '—')),
            h('td', { class: 'num mono' }, fmt.int(e.registros)))))),
        h('p', { class: 'meta', style: { margin: 0 } }, 'Referencia Codex CXS 193: 1,0 mg/kg en peces depredadores y 0,5 mg/kg en los demás. Fuente: GBIF.org, consulta en vivo.'));
    } catch (e) { mount(peces, h('h2', { class: 'card-title' }, 'Peces registrados en la cuenca'), h('p', { class: 'form-error' }, `No se pudo consultar GBIF: ${e.message}`)); }
  })();

  const refs = h('section', { class: 'card' },
    h('h2', { class: 'card-title' }, 'Antecedentes'),
    h('p', { class: 'meta' }, 'Lo que ya se sabe de la zona, con el tipo de fuente. Las cifras de mercurio son de la cuenca del Beni, no de Alcoche.'),
    h('ol', { class: 'refs' }, REFERENCIAS.map((r) => h('li', { class: 'ref' },
      h('div', { class: 'ref-head' }, h('span', { class: 'ref-tipo', dataset: { tipo: r.tipo } }, TIPO_REF[r.tipo]), h('span', { class: 'mono meta' }, String(r.anio))),
      h('a', { class: 'ref-title', href: r.url, target: '_blank', rel: 'noopener' }, r.titulo, icon('external', { cls: 'inline-ic' })),
      h('p', { class: 'meta', style: { margin: 0 } }, r.autores),
      h('ul', { class: 'ref-hallazgos' }, r.hallazgos.map((x) => h('li', null, x.texto, x.calculado ? h('span', { class: 'meta' }, ' (calculado por Ahgora con los datos abiertos)') : null)))))));

  const plan = h('section', { class: 'card' },
    h('h2', { class: 'card-title' }, 'Plan de muestreo propuesto'),
    h('ol', { class: 'reasons' },
      h('li', null, 'Referencia aguas arriba de Caranavi (sin huellas cercanas): sedimento fino, 3 puntos.'),
      h('li', null, 'Entre Santa Fe y Alcoche, junto a cada frente nuevo: sedimento aguas arriba y aguas abajo del frente, y cola si hay acceso.'),
      h('li', null, 'Alcoche: sedimento en la toma de agua y en la playa de pesca; peces de consumo (surubí, sábalo, pacú) con el cabezal PEZ.'),
      h('li', null, 'Yurumani y Guanay: control aguas abajo antes de la entrada del Tipuani y el Mapiri, para separar sus aportes.'),
      h('li', null, 'Repetir en estiaje y en crecida, con el caudal del día anotado. Las rojas y amarillas van primero al laboratorio aliado (EPA 7473).')));

  const el = h('div', { class: 'view' },
    viewHeader('Sitio piloto: Alcoche (Caranavi)', 'Por qué empezamos aquí: minería aurífera nueva sobre el río Coroico, una comunidad agrícola que pesca y usa el río, y ninguna medición pública de mercurio.'),
    h('div', { class: 'two-col' }, ficha, huella),
    h('div', { class: 'two-col' }, rio, h('div', { class: 'stack' }, suelo, plan)),
    peces, refs);
  const offs = [on('muestras', () => {})];
  return { el, destroy() { offs.forEach((f) => f()); } };
}
