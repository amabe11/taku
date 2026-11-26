// Capas satelitales (sección 7.4 y guía definitiva 02): la capa de CONTEXTO. Los satélites no detectan mercurio.
//   · EOX Sentinel-2 cloudless (WMS, EPSG:4326, sin registro): mosaicos anuales de 10 m, 2016–2025.
//   · NASA GIBS (WMS, EPSG:4326): imágenes listas para el mapa web, sin registro. Verificadas el 2026-11-24.
//   · NASA POWER: lluvia diaria en un punto, sin registro (serie por punto; no es IMERG y se rotula así).
export const GIBS_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
export const POWER = 'https://power.larc.nasa.gov/api/temporal/daily/point';

const LANDSAT_YEARS = ['1983', '1984', '1985', '1988', '1989', '1990', '1998', '1999', '2000'];

// tiempo: 'dia' (fecha elegida) · 'anio' (archivo anual) · null (capa estática o siempre la más reciente)
export const EOX_WMS = 'https://tiles.maps.eox.at/wms';
export const NASA_LAYERS = [
  { id: 's2', proveedor: 'eox', wms: 's2cloudless-2025', nombre: 'Sentinel-2 sin nubes 2025 (10 m)', fuente: 'Sentinel-2 cloudless 2025 · EOX (Copernicus, CC BY 4.0)',
    muestra: 'Mosaico anual de color real sin nubes', resolucion: '10 m, mosaico anual', tiempo: null, base: true,
    decision: 'Ver las cicatrices mineras (playas de grava, pozas) que Amazon Mining Watch detecta, y su relación con el río.' },
  { id: 's2_2018', proveedor: 'eox', wms: 's2cloudless-2018', nombre: 'Sentinel-2 sin nubes 2018 (comparar)', fuente: 'Sentinel-2 cloudless 2018 · EOX (Copernicus, CC BY 4.0)',
    muestra: 'El mismo mosaico, siete años antes', resolucion: '10 m, mosaico anual', tiempo: null, base: true,
    decision: 'Comparar antes y después: dónde apareció la minería nueva (Alcoche y Santa Fe).' },
  { id: 'hls_s30', gibs: 'HLS_S30_Nadir_BRDF_Adjusted_Reflectance', nombre: 'HLS Sentinel-2 (30 m)', fuente: 'HLS: Landsat + Sentinel-2 armonizados',
    muestra: 'Cobertura del suelo y color del agua', resolucion: '30 m, cada 2–3 días', tiempo: 'dia',
    decision: 'Avance de frentes mineros, deforestación ribereña y plumas de sedimento; comparar antes y después.' },
  { id: 'hls_l30', gibs: 'HLS_L30_Nadir_BRDF_Adjusted_Reflectance', nombre: 'HLS Landsat (30 m)', fuente: 'HLS: Landsat + Sentinel-2 armonizados',
    muestra: 'Cobertura del suelo y color del agua', resolucion: '30 m', tiempo: 'dia',
    decision: 'Igual que HLS Sentinel-2; sirve para llenar huecos por nubes en otra fecha.' },
  { id: 'landsat', gibs: 'Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual', nombre: 'Archivo histórico de Landsat', fuente: 'Landsat WELD (anual)',
    muestra: 'Imágenes de hace décadas', resolucion: '30 m', tiempo: 'anio', anios: LANDSAT_YEARS,
    decision: 'Reconstruir la historia de la actividad minera en un sitio.' },
  { id: 'imerg', gibs: 'IMERG_Precipitation_Rate', nombre: 'Lluvia · GPM IMERG', fuente: 'GPM IMERG (precipitación)',
    muestra: 'Lluvia estimada', resolucion: '~10 km, cada 30 min (vista diaria)', tiempo: 'dia', leyenda: 'https://gibs.earthdata.nasa.gov/legends/GPM_Precipitation_Rate_H.png',
    decision: 'Lluvias y crecidas movilizan sedimentos: interpretar resultados y planificar campañas.' },
  { id: 'firms', gibs: 'VIIRS_SNPP_Thermal_Anomalies_375m_All', nombre: 'Focos de calor · FIRMS', fuente: 'FIRMS (VIIRS, incendios activos)',
    muestra: 'Focos de calor', resolucion: '375 m, casi en tiempo real (GIBS muestra los más recientes)', tiempo: null,
    decision: 'Quemas asociadas al desbosque y a la expansión de nuevas áreas.' },
  { id: 'flood', gibs: 'MODIS_Combined_Flood_2-Day', nombre: 'Inundaciones (2 días)', fuente: 'Producto global de inundaciones MODIS (LANCE)',
    muestra: 'Áreas inundadas', resolucion: '~250 m, diario', tiempo: 'dia', leyenda: 'https://gibs.earthdata.nasa.gov/legends/MODIS_Flood_H.png',
    decision: 'Dónde una inundación pudo llevar sedimentos contaminados a chacos o comunidades.' },
  { id: 'srtm', gibs: 'SRTM_Color_Index', nombre: 'Relieve · SRTM', fuente: 'SRTM (modelo de elevación)',
    muestra: 'Relieve del terreno', resolucion: '30 m', tiempo: null, leyenda: 'https://gibs.earthdata.nasa.gov/legends/SRTM_Color_Index_H.png',
    decision: 'Delimitar cuencas y dirección del flujo: qué comunidades están aguas abajo.' },
  { id: 'gpw', gibs: 'GPW_Population_Density_2020', nombre: 'Población · SEDAC GPW 2020', fuente: 'SEDAC GPW v4 (población)',
    muestra: 'Densidad de población', resolucion: '~1 km', tiempo: null, leyenda: 'https://gibs.earthdata.nasa.gov/legends/GPW_Population_Density_2020_H.png',
    decision: 'Estimar la población potencialmente expuesta aguas abajo.' },
];

export const NASA_LIMITES = [
  'Nubosidad frecuente en la Amazonía y los Yungas: HLS y Landsat pueden tener huecos. La lluvia (GPM) y el relieve (SRTM) no se ven afectados.',
  'Resolución: un río angosto o una operación minera pequeña pueden no verse bien a 30 m.',
  'El color del agua indica sedimento en suspensión, no mercurio.',
  'Coincidir en el mapa no prueba una causa.',
];

/** URL de GetMap (WMS 1.3.0, EPSG:4326: el orden de BBOX es lat_min, lon_min, lat_max, lon_max). */
export function gibsUrl(layer, { lonMin, latMin, lonMax, latMax }, width, height, fecha) {
  const eox = layer.proveedor === 'eox';
  const q = new URLSearchParams({
    SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.3.0', LAYERS: eox ? layer.wms : layer.gibs, STYLES: '', CRS: 'EPSG:4326',
    BBOX: [latMin, lonMin, latMax, lonMax].map((v) => v.toFixed(4)).join(','),
    WIDTH: String(Math.round(width)), HEIGHT: String(Math.round(height)), FORMAT: eox ? 'image/jpeg' : 'image/png', ...(eox ? {} : { TRANSPARENT: 'true' }),
  });
  if (eox) return `${EOX_WMS}?${q}`;
  if (layer.tiempo === 'dia' && fecha) q.set('TIME', fecha);
  if (layer.tiempo === 'anio') q.set('TIME', `${fecha && layer.anios.includes(fecha.slice(0, 4)) ? fecha.slice(0, 4) : layer.anios.at(-1)}-12-01`);
  return `${GIBS_WMS}?${q}`;
}
/** Enlace a NASA Worldview con la capa y la fecha, para ver más detalle. */
export function worldviewUrl(layer, lon, lat, fecha) {
  if (!layer.gibs) return `https://s2maps.eu/#lat=${lat}&lng=${lon}&zoom=13`;
  const d = 0.25;
  const q = new URLSearchParams({ l: `${layer.gibs},Reference_Features_15m`, v: [lon - d, lat - d, lon + d, lat + d].join(',') });
  if (layer.tiempo === 'dia' && fecha) q.set('t', fecha);
  return `https://worldview.earthdata.nasa.gov/?${q}`;
}

export async function powerPrecip(lon, lat, startYmd, endYmd) {
  const q = new URLSearchParams({ parameters: 'PRECTOTCORR', community: 'AG', longitude: lon.toFixed(4), latitude: lat.toFixed(4), start: startYmd, end: endYmd, format: 'JSON' });
  const res = await fetch(`${POWER}?${q}`, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} en NASA POWER`);
  const d = await res.json();
  const v = d.properties?.parameter?.PRECTOTCORR || {};
  const fill = d.header?.fill_value ?? -999;
  return Object.entries(v).map(([k, mm]) => ({ fecha: `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`, mm: mm === fill ? null : mm }));
}

// ------------------------------------------------------------------ otras APIs públicas, sin registro
// Todas responden con CORS abierto y se consultan desde el navegador. Verificadas el 25 nov 2026 en Alcoche.


// GloFAS tiene celdas de ~5 km: el punto exacto puede caer en un arroyo. Se consultan las 9 celdas vecinas en una
// sola llamada y se toma la de mayor caudal medio, que es el cauce principal (el Coroico o el Kaka).
function vecinas(lon, lat, paso = 0.05) {
  const pts = [];
  for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) pts.push([lon + dx * paso, lat + dy * paso]);
  return pts;
}
async function floodCauce(lon, lat, params) {
  const pts = vecinas(lon, lat);
  const q = new URLSearchParams({ latitude: pts.map((p) => p[1].toFixed(4)).join(','), longitude: pts.map((p) => p[0].toFixed(4)).join(','), ...params });
  const r = await fetch(`https://flood-api.open-meteo.com/v1/flood?${q}`, { signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} en Open-Meteo Flood`);
  const data = [].concat(await r.json());
  const media = (d) => { const v = (d.daily?.river_discharge || []).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : -1; };
  return data.sort((a, b) => media(b) - media(a))[0];
}

/** Caudal diario del río modelado por GloFAS (Copernicus, vía Open-Meteo): 30 días atrás + 7 de pronóstico. */
export async function caudalGlofas(lon, lat, { pasado = 30, futuro = 7 } = {}) {
  const d = await floodCauce(lon, lat, { daily: 'river_discharge,river_discharge_max', past_days: String(pasado), forecast_days: String(futuro) });
  const hoy = new Date().toISOString().slice(0, 10);
  return d.daily.time.map((t, i) => ({ fecha: t, m3s: d.daily.river_discharge[i], max: d.daily.river_discharge_max?.[i] ?? null, pronostico: t > hoy }));
}

/** Lluvia diaria (ERA5 / pronóstico) en un punto, de Open-Meteo. */
export async function lluviaOpenMeteo(lon, lat, { pasado = 30 } = {}) {
  const q = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), daily: 'precipitation_sum', past_days: String(pasado), forecast_days: '7', timezone: 'America/La_Paz' });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} en Open-Meteo`);
  const d = await r.json();
  return d.daily.time.map((t, i) => ({ fecha: t, mm: d.daily.precipitation_sum[i] }));
}

/** Suelo (0–5 cm) de SoilGrids 2.0 (ISRIC, 250 m): arcilla %, carbono orgánico g/kg y pH. El Hg viaja con la arcilla. */
export async function sueloSoilGrids(lon, lat) {
  const q = new URLSearchParams({ lon: lon.toFixed(4), lat: lat.toFixed(4), depth: '0-5cm', value: 'mean' });
  for (const p of ['clay', 'soc', 'phh2o', 'sand']) q.append('property', p);
  const r = await fetch(`https://rest.isric.org/soilgrids/v2.0/properties/query?${q}`, { signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} en SoilGrids`);
  const d = await r.json();
  const val = (n) => { const L = d.properties.layers.find((x) => x.name === n); const v = L?.depths?.[0]?.values?.mean; return v == null ? null : v / (L.unit_measure.d_factor || 1); };
  return { arcilla_pct: val('clay'), arena_pct: val('sand'), carbono_g_kg: val('soc'), ph: val('phh2o') };
}

// Órdenes de peces en el árbol de GBIF: Characiformes, Siluriformes, Gymnotiformes.
const ORDENES_PECES = ['537', '708', '1165'];
/** Especies de peces con registros en GBIF dentro de un recuadro, con su número de registros. */
export async function pecesGbif({ lonMin, latMin, lonMax, latMax }, limite = 15) {
  const poly = `POLYGON((${lonMin} ${latMin},${lonMax} ${latMin},${lonMax} ${latMax},${lonMin} ${latMax},${lonMin} ${latMin}))`;
  const q = new URLSearchParams({ geometry: poly, facet: 'speciesKey', facetLimit: String(limite), limit: '0' });
  for (const k of ORDENES_PECES) q.append('taxonKey', k);
  const r = await fetch(`https://api.gbif.org/v1/occurrence/search?${q}`, { signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} en GBIF`);
  const d = await r.json();
  const counts = d.facets?.[0]?.counts || [];
  const especies = await Promise.all(counts.map(async (c) => {
    try {
      const s = await (await fetch(`https://api.gbif.org/v1/species/${c.name}`, { signal: AbortSignal.timeout(15000) })).json();
      return { key: c.name, nombre: s.canonicalName || s.scientificName, familia: s.family, registros: c.count };
    } catch { return { key: c.name, nombre: `Especie ${c.name}`, registros: c.count }; }
  }));
  return { total: d.count, especies };
}

/** Caudal GloFAS en los días previos a una fecha (para anotar si la muestra se tomó en crecida). */
export async function caudalEnFecha(lon, lat, fechaIso, dias = 10) {
  const fin = new Date(fechaIso), ini = new Date(fin.getTime() - (dias - 1) * 86400000);
  const ymd = (d) => d.toISOString().slice(0, 10);
  const d = await floodCauce(lon, lat, { daily: 'river_discharge', start_date: ymd(ini), end_date: ymd(fin) });
  return d.daily.time.map((t, i) => ({ fecha: t, m3s: d.daily.river_discharge[i] }));
}
