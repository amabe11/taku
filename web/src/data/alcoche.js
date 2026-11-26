// Sitio piloto: ALCOCHE (municipio de Caranavi, provincia Caranavi, La Paz), a orillas del río Coroico.
// Datos REALES y verificables: ubicación, ríos y localidades (OpenStreetMap), huellas de minería aurífera
// detectadas por satélite (Amazon Mining Watch) y antecedentes publicados. Ninguna cifra de mercurio de esta
// lista se mide en Alcoche: no hay análisis públicos del sitio, por eso el proyecto empieza aquí.
import GEO from './alcoche-geo.js';
import { posicionEnEje } from '../model.js';

export { GEO };

export const SITIO = {
  id: 'alcoche',
  nombre: 'Alcoche',
  municipio: 'Caranavi', provincia: 'Caranavi', departamento: 'La Paz',
  lat: -15.75109, lon: -67.67481,
  elevacion_m: 529, // modelo de elevación usado por Open-Meteo (Copernicus DEM 90 m) en la celda del sitio
  poblacion: 775, poblacion_fuente: 'OpenStreetMap (etiqueta population, censo INE 2012)',
  rio: 'Río Coroico',
  cuenca: 'Coroico → Kaka → Beni → Madeira (Amazonas)',
  descripcion: 'Comunidad agrícola (café, cítricos, banano, palta, mango) sobre el río Coroico, en la ruta Caranavi–Guanay. Aguas abajo, en Guanay, el Coroico recibe al Mapiri y al Tipuani, zonas auríferas históricas, y forma el río Kaka.',
};

// ------------------------------------------------------------------ cuenca real (eje Coroico → Kaka)
const ejeLargo = posicionEnEje(GEO.eje, ...GEO.eje[0]).largo;
export const CUENCA_ALCOCHE = {
  id: 'coroico-kaka',
  nombre: 'Río Coroico → Kaka · Alcoche (Caranavi)',
  nota: 'Eje trazado con la geometría de OpenStreetMap del río Coroico y del Kaka (sentido del flujo). Comunidades y población: OpenStreetMap. Frentes: grupos de huellas de Amazon Mining Watch a menos de 6 km del eje.',
  radio_km: 6,
  largo_km: ejeLargo,
  eje: GEO.eje,
  comunidades: GEO.localidades
    .map((l) => ({ ...l, p: posicionEnEje(GEO.eje, l.lon, l.lat) }))
    .filter((l) => l.p.dist < 4 && l.poblacion)
    .map(({ p, ...l }) => ({ id: l.nombre, nombre: l.nombre, lon: l.lon, lat: l.lat, poblacion: l.poblacion })),
  frentes: GEO.frentes
    .map((f, i) => ({ ...f, i, p: posicionEnEje(GEO.eje, f.lon, f.lat) }))
    .filter((f) => f.p.dist < 6 && f.parches >= 3)
    .map((f) => ({ id: `amw-${f.i}`, nombre: `Huella minera · ${f.parches} parches desde ${f.desde}`, lon: f.lon, lat: f.lat })),
};

// ------------------------------------------------------------------ zonas públicas (celdas de 0,1°)
const celdaDe = (lat, lon) => {
  const f = (v) => Math.floor(v * 10) / 10;
  return { lat_min: +f(lat).toFixed(1), lon_min: +f(lon).toFixed(1), lat_max: +(f(lat) + 0.1).toFixed(1), lon_max: +(f(lon) + 0.1).toFixed(1) };
};
export const zonaId = (c) => `z-${c.lat_min.toFixed(1)}_${c.lon_min.toFixed(1)}`;
const ZONAS_NOMBRE = [['Alcoche', 'Caranavi'], ['Santa Fe', 'Caranavi'], ['Caranavi', 'Caranavi'], ['Guanay', 'Guanay'], ['Teoponte', 'Teoponte'], ['Mayaya', 'Teoponte'], ['Tipuani', 'Tipuani']];
export const ZONAS = (() => {
  const m = new Map();
  for (const [nombre, municipio] of ZONAS_NOMBRE) {
    const l = GEO.localidades.find((x) => x.nombre === nombre);
    if (!l) continue;
    const celda = celdaDe(l.lat, l.lon);
    const id = zonaId(celda);
    if (!m.has(id)) m.set(id, { id, nombre: `Zona ${nombre}`, municipio, sitio: 'alcoche', celda, contacto: 'Por definir con el Gobierno Municipal y el centro de salud de la zona (demostración)', demostracion: true });
  }
  return [...m.values()];
})();

// ------------------------------------------------------------------ huellas mineras cerca del sitio
const km = (a, b) => Math.hypot((a[0] - b[0]) * 111.32 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110.57);
/** Parches de Amazon Mining Watch a menos de `radio` km de un punto, contados por año de inicio. */
export function huellasPorAnio(lon = SITIO.lon, lat = SITIO.lat, radio = 10) {
  const por = new Map();
  let total = 0;
  for (const c of GEO.amw.celdas) {
    if (km([c[0], c[1]], [lon, lat]) > radio) continue;
    total++;
    por.set(c[2], (por.get(c[2]) || 0) + 1);
  }
  const anios = [];
  for (let y = 2018; y <= 2026; y++) anios.push({ anio: y, nuevos: por.get(y) || 0 });
  return { total, anios, radio_km: radio, ha_aprox: Math.round(total * 23) }; // 480 m × 480 m ≈ 23 ha por parche (tope; el área minada real es menor)
}

// ------------------------------------------------------------------ antecedentes (verificados el 25 nov 2026)
// tipo: estudio (revisado por pares) · institucional · norma · prensa (no verificado de forma independiente) · datos
export const REFERENCIAS = [
  {
    id: 'amw-2026', tipo: 'datos', anio: 2026,
    titulo: 'Amazon Mining Watch: detecciones de minería aurífera artesanal en imágenes Sentinel-2 (2018–2026)',
    autores: 'Earth Genome, Amazon Conservation y Pulitzer Center', url: 'https://source.coop/earthgenome/amazon-mining-watch',
    licencia: 'CC BY 4.0',
    hallazgos: [
      { texto: 'Huellas de minería detectadas a menos de 10 km de Alcoche, casi todas desde 2021 y con un salto en 2023 (ver gráfico del sitio).', calculado: true },
      { texto: 'Entre Santa Fe y Alcoche la minería es reciente (desde 2021); aguas abajo, de Guanay a Mayaya, hay huellas desde el inicio del registro (2018).', calculado: true },
      { texto: 'Detecta cicatrices de minería en parches de 480 m; no mide mercurio ni dice si la operación es legal.' },
    ],
  },
  {
    id: 'ajam-2025', tipo: 'institucional', anio: 2025,
    titulo: 'Inspección de la AJAM cerca de la comunidad de Alcoche (octubre de 2025)',
    autores: 'Autoridad Jurisdiccional Administrativa Minera, citada por la Agencia de Noticias Ambientales (ANA)', url: 'https://anabolivia.org/promulgan-ley-que-declara-a-caranavi-municipio-ecologico/',
    hallazgos: [{ texto: 'Registró maquinaria pesada, volquetas y lavado de oro a gran escala en las riberas del río Coroico, ruta Caranavi–Guanay.' }],
  },
  {
    id: 'denuncia-2026', tipo: 'prensa', anio: 2026,
    titulo: 'Denuncian operaciones mineras ilegales y mercurio en Caranavi (El Diario, 16 oct 2026)',
    autores: 'Concejo Municipal de Caranavi (denuncia de un concejal)', url: 'https://www.eldiario.net/portal/2026/10/16/denuncian-operaciones-mineras-ilegales-y-mercurio-en-caranavi/',
    hallazgos: [{ texto: 'Más de 60 operaciones mineras presuntamente ilegales en Alcoche y Santa Fe; se piden inspecciones, clausuras y análisis oficiales de mercurio. El número no está confirmado por otra fuente.' }],
  },
  {
    id: 'ley-caranavi-2026', tipo: 'norma', anio: 2026,
    titulo: 'Ley Autonómica Municipal de Cero Actividad y Contaminación Minera, Caranavi (aprobada el 8 abr 2026)',
    autores: 'Concejo Municipal de Caranavi', url: 'https://eju.tv/2026/04/concejo-de-caranavi-aprueba-ley-de-cero-actividad-y-contaminacion-minera/',
    hallazgos: [{ texto: 'Busca frenar la contaminación por mercurio, la deforestación y el desvío de ríos. Caranavi es el tercer municipio que se declara libre de minería, después de Alto Beni y Palos Blancos. Según ANA, se promulgó como Ley Municipal N.º 04/2026.' }],
  },
  {
    id: 'defensoria-2022', tipo: 'institucional', anio: 2022,
    titulo: 'Informe de la Defensoría del Pueblo sobre el cumplimiento del Convenio de Minamata',
    autores: 'Defensoría del Pueblo de Bolivia (citado por eju.tv, 2026)', url: 'https://eju.tv/2026/04/concejo-de-caranavi-aprueba-ley-de-cero-actividad-y-contaminacion-minera/',
    hallazgos: [{ texto: 'Incluye a Caranavi entre los municipios con minería aurífera y riesgos ambientales y de salud por mercurio.' }],
  },
  {
    id: 'maurice-2002', tipo: 'estudio', anio: 2002,
    titulo: 'Sediment-associated mercury distribution within a major Amazon tributary: century-scale contamination history and importance of flood plain accumulation',
    autores: 'Maurice-Bourgoin L., Aalto R., Guyot J. L. · IAHS Publ. 276, 161–168', url: 'https://iahs.info/uploads/dms/12428.22-pp-161-168-Maurice-AS23-.pdf',
    hallazgos: [
      { texto: 'Mercurio total en el agua del río Beni: 19 ng/L en época seca y 460 ng/L en el pico de crecida; entre 59 % y 98 % viaja pegado a partículas.', valor: [19, 460], unidad: 'ng/L', matriz: 'agua' },
      { texto: 'En 139 muestras de sedimento de la llanura del Beni, el mercurio sigue a la arcilla (r² = 0,74): el sedimento fino es el que lo transporta y lo guarda.', matriz: 'sedimento' },
      { texto: 'La minería aurífera introduce entre 0,25 y 0,5 t de mercurio por año en la cuenca del Beni desde los años setenta; más de 330 t liberadas en Bolivia desde 1952.', unidad: 't/año' },
      { texto: 'Los testigos de sedimento fechados con ²¹⁰Pb muestran un aumento del mercurio desde la década de 1970.' },
    ],
  },
  {
    id: 'maurice-1999', tipo: 'estudio', anio: 1999,
    titulo: 'Mercury pollution in the upper Beni River basin, Bolivia',
    autores: 'Maurice-Bourgoin L., Quiroga I., Guyot J. L., Malm O. · Ambio 28(4), 302–306', url: 'https://www.semanticscholar.org/paper/1e441e589f234b3c93a1809bfb2e3d4da6426215',
    hallazgos: [{ texto: 'Aguas abajo del río Tipuani, por el Kaka y el Alto Beni, la contaminación alcanza unos 150 km desde la zona minera; en peces carnívoros puede superar los niveles seguros (según el resumen).' }],
  },
  {
    id: 'maurice-2000', tipo: 'estudio', anio: 2000,
    titulo: 'Mercury distribution in waters and fishes of the upper Madeira rivers and mercury exposure in riparian Amazonian populations',
    autores: 'Maurice-Bourgoin L., Quiroga I., Chincheros J., Courau P. · Sci. Total Environ. 260, 73–86', url: 'https://pubmed.ncbi.nlm.nih.gov/11032117/',
    hallazgos: [{ texto: 'Estudio de referencia de agua, peces y personas en los ríos andinos del Madeira (incluye la cuenca alta del Beni). Las tablas por sitio se consultan en el artículo original.' }],
  },
  {
    id: 'mongabay-2026', tipo: 'prensa', anio: 2026,
    titulo: 'Mercury threatens over 160 communities in Bolivia’s Beni River basin (Mongabay, 8 sep 2026)',
    autores: 'Mongabay; base de 42 estudios publicados entre 1995 y 2024', url: 'https://news.mongabay.com/2026/09/mercury-threatens-over-160-communities-in-bolivias-beni-river-basin/',
    hallazgos: [
      { texto: '186 muestras de peces de 17 comunidades de la cuenca del Beni: 15 especies de alto consumo tienen mercurio en sus tejidos (surubí, sábalo, boga, pacú, tucunaré, dorado, palometa).', matriz: 'pescado' },
      { texto: 'Mercurio en cabello de 8,1 mg/kg en Eyiyoquibo (47 personas) y hasta 19 mg/kg en comunidades del Beni (Tschirhart et al., 2012). Referencia citada por la nota: 2,0 mg/kg (OMS).', matriz: 'cabello' },
      { texto: 'CPILAP (2023): 74,5 % de 302 personas de 36 comunidades indígenas supera los valores de referencia.' },
      { texto: 'Bolivia figura como el mayor comprador de mercurio del mundo (boletín de importaciones, 2021). El Plan de Acción Nacional busca reducir su uso en 60 % hasta 2031.' },
    ],
  },
  {
    id: 'tschirhart-2012', tipo: 'estudio', anio: 2012,
    titulo: 'Estudio de exposición al mercurio en comunidades ribereñas del río Beni (Human Ecology, 2012)',
    autores: 'Tschirhart C., Handschumacher P., Laffly D. et al. · Human Ecology 40(4), 511–523', url: 'https://doi.org/10.1007/s10745-012-9500-9',
    hallazgos: [{ texto: 'Mercurio en cabello de hasta 19 mg/kg en comunidades ribereñas del Beni (citado por Mongabay, 2026).', matriz: 'cabello' }],
  },
];

export const TIPO_REF = {
  estudio: 'Estudio revisado por pares', institucional: 'Fuente institucional', norma: 'Norma', prensa: 'Nota de prensa (no verificada aparte)', datos: 'Datos abiertos',
};
