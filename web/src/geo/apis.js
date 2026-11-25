// Capas satelitales de la NASA (sección 7.4): la capa de CONTEXTO. Los satélites no detectan mercurio.
//   · NASA GIBS (WMS, EPSG:4326): imágenes listas para el mapa web, sin registro. Verificadas el 2026-11-24.
//   · NASA POWER: lluvia diaria en un punto, sin registro (serie por punto; no es IMERG y se rotula así).
export const GIBS_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
export const POWER = 'https://power.larc.nasa.gov/api/temporal/daily/point';

const LANDSAT_YEARS = ['1983', '1984', '1985', '1988', '1989', '1990', '1998', '1999', '2000'];

// tiempo: 'dia' (fecha elegida) · 'anio' (archivo anual) · null (capa estática o siempre la más reciente)
export const NASA_LAYERS = [
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
  const q = new URLSearchParams({
    SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.3.0', LAYERS: layer.gibs, STYLES: '', CRS: 'EPSG:4326',
    BBOX: [latMin, lonMin, latMax, lonMax].map((v) => v.toFixed(4)).join(','),
    WIDTH: String(Math.round(width)), HEIGHT: String(Math.round(height)), FORMAT: 'image/png', TRANSPARENT: 'true',
  });
  if (layer.tiempo === 'dia' && fecha) q.set('TIME', fecha);
  if (layer.tiempo === 'anio') q.set('TIME', `${fecha && layer.anios.includes(fecha.slice(0, 4)) ? fecha.slice(0, 4) : layer.anios.at(-1)}-12-01`);
  return `${GIBS_WMS}?${q}`;
}
/** Enlace a NASA Worldview con la capa y la fecha, para ver más detalle. */
export function worldviewUrl(layer, lon, lat, fecha) {
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
