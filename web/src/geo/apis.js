// Clientes de APIs abiertas (todas con CORS verificado). Solo funcionan con internet.
//   · Earth Search STAC v1 (Element84) — Sentinel-2 L2A Collection 1 y Copernicus DEM GLO-30
//   · Copernicus Data Space STAC — catálogo de respaldo (solo búsqueda; el archivo exige cuenta)
//   · NASA CMR — gránulos de GPM IMERG diario (GPM_3IMERGDE v07), HLS v2 (HLSL30/HLSS30) y SRTMGL1 v003
//   · NASA POWER — precipitación diaria en un punto sin autenticación (PRECTOTCORR; no es IMERG)
//   · AWS Terrain Tiles (Terrarium) — elevación en teselas PNG para relieve, pendiente y drenaje

export const EARTH_SEARCH = 'https://earth-search.aws.element84.com/v1';
export const CDSE_STAC = 'https://stac.dataspace.copernicus.eu/v1';
export const CMR = 'https://cmr.earthdata.nasa.gov/search';
export const POWER = 'https://power.larc.nasa.gov/api/temporal/daily/point';
export const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';

// Áreas de interés. La zona de interés del proyecto son los Yungas; el sitio piloto sigue por definir.
export const AOIS = [
  { id: 'ejemplo', nombre: 'Ejemplo satelital · río Coroico, Caranavi (antecedente)', bbox: [-67.66, -15.9, -67.5, -15.78], ejemplo: true,
    nota: 'Ejemplo satelital alrededor de un antecedente documental. No es el sitio piloto ni se le atribuyen resultados.' },
  { id: 'yungas', nombre: 'Zona de interés · Yungas de La Paz (aprox.)', bbox: [-68.55, -16.7, -66.95, -15.15], ejemplo: true,
    nota: 'Extensión aproximada de la zona de interés. Demasiado amplia para comparar riberas: úsala para buscar escenas.' },
  { id: 'banco', nombre: 'Banco de prueba · La Paz', bbox: [-68.18, -16.54, -68.08, -16.46], ejemplo: true, nota: 'Ubicación del banco, no un punto de muestreo.' },
];

async function json(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: opts.signal || AbortSignal.timeout(opts.timeout || 25000) });
  if (!res.ok) { const e = new Error(`HTTP ${res.status} en ${new URL(url).host}`); e.status = res.status; throw e; }
  return res.json();
}

/** ¿Hay internet real? (la red Wi-Fi de la estación no tiene salida) */
export async function online() {
  if (!navigator.onLine) return false;
  try { await fetch(`${CMR}/collections.json?page_size=1`, { signal: AbortSignal.timeout(5000), cache: 'no-store' }); return true; } catch { return false; }
}

// ------------------------------------------------------------------ STAC
export async function stacSearch({ catalog = EARTH_SEARCH, collection, bbox, datetime, cloudMax = 60, limit = 12 }) {
  const body = { collections: [collection], bbox, limit };
  if (datetime) body.datetime = datetime;
  if (cloudMax != null && collection.startsWith('sentinel-2')) body.query = { 'eo:cloud_cover': { lt: cloudMax } };
  if (catalog === EARTH_SEARCH && collection.startsWith('sentinel-2')) body.sortby = [{ field: 'properties.eo:cloud_cover', direction: 'asc' }];
  const d = await json(`${catalog}/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return d.features || [];
}
export const itemEpsg = (it) => Number(String(it.properties['proj:code'] || it.properties['proj:epsg'] || '').replace('EPSG:', '')) || null;
export const s3ToHttps = (href) => href.replace(/^s3:\/\/([^/]+)\//, 'https://$1.s3.amazonaws.com/');

// ------------------------------------------------------------------ NASA CMR
export const CMR_PRODUCTS = {
  imerg: { short_name: 'GPM_3IMERGDE', version: '07', nombre: 'GPM IMERG Early diario V07', res: '0,1° (~10 km)', variable: 'precipitation (mm/día)' },
  hlsl: { short_name: 'HLSL30', version: '2.0', nombre: 'HLS Landsat 30 m v2', res: '30 m' },
  hlss: { short_name: 'HLSS30', version: '2.0', nombre: 'HLS Sentinel-2 30 m v2', res: '30 m' },
  srtm: { short_name: 'SRTMGL1', version: '003', nombre: 'NASA SRTM GL1 v003', res: '~30 m' },
};
export async function cmrGranules(product, { bbox, start, end, pageSize = 10 }) {
  const p = CMR_PRODUCTS[product];
  const q = new URLSearchParams({ short_name: p.short_name, version: p.version, page_size: String(pageSize), sort_key: '-start_date' });
  if (bbox) q.set('bounding_box', bbox.join(','));
  if (start && end) q.set('temporal', `${start},${end}`);
  const d = await json(`${CMR}/granules.json?${q}`);
  return (d.feed?.entry || []).map((e) => {
    const links = e.links || [];
    return {
      id: e.id, title: e.title, start: e.time_start, end: e.time_end,
      cloud: e.cloud_cover != null ? Number(e.cloud_cover) : null,
      data: links.find((l) => l.rel?.endsWith('/data#') && l.href.startsWith('https'))?.href || null,
      browse: links.find((l) => /\.(jpe?g|png)$/i.test(l.href) && l.href.startsWith('https'))?.href || null,
      opendap: links.find((l) => l.href.includes('opendap'))?.href || null,
      size: e.granule_size ? Number(e.granule_size) : null,
    };
  });
}

// ------------------------------------------------------------------ NASA POWER
export async function powerPrecip(lon, lat, startYmd, endYmd) {
  const q = new URLSearchParams({ parameters: 'PRECTOTCORR', community: 'AG', longitude: lon.toFixed(4), latitude: lat.toFixed(4), start: startYmd, end: endYmd, format: 'JSON' });
  const d = await json(`${POWER}?${q}`);
  const v = d.properties?.parameter?.PRECTOTCORR || {};
  const fill = d.header?.fill_value ?? -999;
  return { elevacion_m: d.geometry?.coordinates?.[2] ?? null, dias: Object.entries(v).map(([k, mm]) => ({ fecha: `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`, mm: mm === fill ? null : mm })), fuente: d.header?.title || 'NASA POWER' };
}
