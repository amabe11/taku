// Servidor Ahgora: Vercel Functions + MongoDB Atlas M0. Estructura de la base en lib/esquema.js.
// Variables de entorno (se configuran en Vercel, nunca en el repositorio):
//   MONGODB_URI                    cadena de conexión de Atlas (mongodb+srv://…)
//   AHG_TEAM_KEY (o HG_TEAM_KEY)   clave del equipo; se envía en la cabecera «x-ahg-key» para leer o escribir
//   AHG_DB                         nombre de la base (opcional; por defecto «ahgora»; si el usuario de Atlas no tiene
//                                  permiso sobre ella, se usa «hgguard», con la estructura nueva junto a las colecciones
//                                  viejas de Hg-Guard, que no se tocan ni se leen).
import { createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { inicializar } from './esquema.js';

export const BASE_POR_DEFECTO = 'ahgora';
export const BASE_RESPALDO = 'hgguard';
let clientPromise = globalThis.__ahgMongo;
export async function db() {
  if (!process.env.MONGODB_URI) throw Object.assign(new Error('Falta MONGODB_URI en las variables de entorno'), { status: 500 });
  if (!clientPromise) {
    // Conexión reutilizada entre invocaciones (evita agotar las 500 conexiones del plan gratuito).
    clientPromise = globalThis.__ahgMongo = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 }).connect()
      .catch((e) => { globalThis.__ahgMongo = clientPromise = null; throw e; });
  }
  const client = await clientPromise;
  // Base elegida una vez por arranque en frío: la preferida («ahgora» o AHG_DB) y, si el usuario de Atlas no tiene
  // permiso sobre ella, la base histórica «hgguard» (donde el usuario sí puede escribir) con la estructura nueva.
  if (!globalThis.__ahgBase) globalThis.__ahgBase = elegirBase(client).catch((e) => { globalThis.__ahgBase = null; throw e; });
  return client.db(await globalThis.__ahgBase);
}

const sinPermiso = (e) => /not (allowed|authorized)|unauthorized/i.test(`${e?.codeName} ${e?.message}`);
async function elegirBase(client) {
  const candidatas = [process.env.AHG_DB || BASE_POR_DEFECTO];
  if (!process.env.AHG_DB) candidatas.push(BASE_RESPALDO);
  globalThis.__ahgInitError = null;
  for (const nombre of candidatas) {
    try {
      // Colecciones con validador e índices antes de la primera escritura.
      await inicializar(client.db(nombre));
      globalThis.__ahgAviso = nombre === BASE_RESPALDO
        ? `Sin permiso sobre «${BASE_POR_DEFECTO}» en Atlas: se usa «${BASE_RESPALDO}» con la estructura nueva. Para separar, da al usuario de Atlas el rol «Read and write to any database».`
        : null;
      return nombre;
    } catch (e) {
      globalThis.__ahgInitError = { base: nombre, codigo: e.codeName || e.code || 'error', mensaje: String(e.message).slice(0, 200) };
      if (!sinPermiso(e)) return nombre; // otro problema: se usa igual y /api/health lo informa
    }
  }
  return candidatas.at(-1);
}

/** CORS abierto: la protección es la clave del equipo (no hay cookies). */
export function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ahg-key, x-hg-key');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

export function authorized(req, res) {
  const key = keyOf();
  if (!key) { res.status(500).json({ error: 'Falta AHG_TEAM_KEY en las variables de entorno' }); return false; }
  if ((req.headers['x-ahg-key'] || req.headers['x-hg-key']) !== key) { res.status(401).json({ error: 'Clave del equipo inválida o ausente (cabecera x-ahg-key)' }); return false; }
  return true;
}

export function handler(fn, { auth = true, methods = ['GET'] } = {}) {
  return async (req, res) => {
    if (cors(req, res)) return;
    if (!methods.includes(req.method)) return res.status(405).json({ error: `Método no permitido: ${req.method}` });
    if (auth && !authorized(req, res)) return;
    try { await fn(req, res); } catch (e) {
      console.error(e);
      res.status(e.status || 500).json({ error: e.status ? e.message : 'Error interno de la API' });
    }
  };
}

export const keyOf = () => process.env.AHG_TEAM_KEY || process.env.HG_TEAM_KEY;

// Lo que llega del navegador o de la app se limpia antes de guardarse.
const SEM = new Set(['rojo', 'amarillo', 'verde', 'invalido']);
const CERT = new Set(['cribado', 'en_verificacion', 'confirmado']);
const MATRIZ_CABEZAL = { sedimento: 'SED', cola: 'SED', pescado: 'PEZ' };
const numero = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Muestra lista para guardar, o { error } si le falta lo indispensable (codigo, matriz, fecha). */
export function cleanMuestra(m) {
  if (!m || typeof m !== 'object' || !m.codigo) return { error: 'falta codigo' };
  if (!MATRIZ_CABEZAL[m.matriz]) return { error: `${m.codigo}: matriz debe ser sedimento, cola o pescado` };
  if (Number.isNaN(new Date(m.fecha_iso).getTime())) return { error: `${m.codigo}: fecha_iso inválida` };
  // Los campos de publicación (id público, versión, retiro) los calcula solo el servidor.
  const { _id, pendiente_sync, sincronizado_en, sincronizado_desde, publicacion, creada, ...rest } = m;
  return {
    ...rest,
    codigo: String(m.codigo).slice(0, 80),
    cabezal: MATRIZ_CABEZAL[m.matriz],
    fecha_iso: String(m.fecha_iso),
    lat: numero(m.lat), lon: numero(m.lon),
    semaforo: SEM.has(m.semaforo) ? m.semaforo : 'invalido',
    certeza: CERT.has(m.certeza) ? m.certeza : 'cribado',
    visibilidad: m.visibilidad === 'publico' ? 'publico' : 'restringido',
    demostracion: !!m.demostracion,
  };
}

// Unidades mineras (MAPE). El estado legal se acompaña siempre de su base: registro o trámite en la AJAM,
// inspección, denuncia, o presunción por huella satelital fuera de un derecho minero registrado.
const ESTADO_LEGAL = new Set(['al_dia', 'en_tramite', 'ilegal']);
const BASE_ESTADO = new Set(['registro_ajam', 'tramite_ajam', 'inspeccion_ajam', 'denuncia', 'presuncion_satelital', 'demostracion']);
const TIPO_MAPE = new Set(['cooperativa', 'empresa', 'unipersonal', 'sin_identificar']);
const MERCURIO = new Set(['declarado', 'presunto', 'sin_mercurio', 'desconocido']);
export function cleanMape(u) {
  if (!u || typeof u !== 'object' || !u.id || !u.nombre) return { error: 'falta id o nombre' };
  const lat = numero(u.lat), lon = numero(u.lon);
  if (lat == null || lon == null) return { error: `${u.id}: falta ubicación` };
  if (!ESTADO_LEGAL.has(u.estado_legal)) return { error: `${u.id}: estado_legal debe ser al_dia, en_tramite o ilegal` };
  const { _id, ...rest } = u;
  return {
    ...rest,
    id: String(u.id).slice(0, 80), nombre: String(u.nombre).slice(0, 160), lat, lon,
    tipo: TIPO_MAPE.has(u.tipo) ? u.tipo : 'sin_identificar',
    base_estado: BASE_ESTADO.has(u.base_estado) ? u.base_estado : 'demostracion',
    mercurio: MERCURIO.has(u.mercurio) ? u.mercurio : 'desconocido',
    area_ha: numero(u.area_ha),
    demostracion: !!u.demostracion,
  };
}

// ------------------------------------------------------------------ avisos públicos (Ahgora Comunidad)
// Contrato de la guía (sección 09): cada aviso tiene id estable y versión; una corrección sube la versión y un
// retiro se informa con `retirado: true`. El estado se guarda en `muestra.publicacion` y solo lo escribe el servidor:
//   { id, version, huella, zona, actualizado_en, retirado_en }

const NIVEL = { cribado: 'CRIBADO — requiere confirmación', en_verificacion: 'EN VERIFICACIÓN', confirmado: 'CONFIRMADO POR LABORATORIO' };

/** Zona agregada para el público: celda de 0,1° (~11 km). Nunca la coordenada exacta. */
export const zonaPublica = (lat, lon, paso = 0.1) => {
  const f = (v) => Math.floor(v / paso) * paso;
  return { lat_min: +f(lat).toFixed(2), lon_min: +f(lon).toFixed(2), lat_max: +(f(lat) + paso).toFixed(2), lon_max: +(f(lon) + paso).toFixed(2) };
};

/** Id público y estable del aviso: no revela el código de la muestra. */
export const idPublico = (codigo) => 'av-' + createHash('sha256').update(`ahgora-aviso:${codigo}`).digest('hex').slice(0, 16);

/** Lo que la comunidad puede ver de una muestra, o null si no hay un aviso aprobado y público. */
export function vistaPublica(m) {
  if (m?.alerta?.estado !== 'aprobada' || m.visibilidad !== 'publico' || m.lat == null || m.lon == null) return null;
  const certeza = CERT.has(m.certeza) ? m.certeza : 'cribado';
  return {
    matriz: m.matriz, zona: zonaPublica(Number(m.lat), Number(m.lon)), certeza, nivel: NIVEL[certeza],
    tipo: m.alerta.tipo, mensaje: m.alerta.mensaje, fecha: m.alerta.fecha,
    laboratorio: certeza === 'confirmado' ? m.laboratorio?.laboratorio || undefined : undefined,
    demostracion: !!m.demostracion,
  };
}

/** Id de la zona pública (celda de 0,1°). */
export const zonaId = (z) => `z-${Number(z.lat_min).toFixed(1)}_${Number(z.lon_min).toFixed(1)}`;

// Estados públicos y textos de interfaz propuestos por la guía (sección 05, «Mensajes y acciones»).
const ESTADO_PUBLICO = { cribado: 'confirmacion_pendiente', en_verificacion: 'en_analisis', confirmado: 'resultado_confirmado' };
const MATRIZ_TXT = { sedimento: 'sedimento', cola: 'cola minera', pescado: 'pescado' };
export const TEXTOS_AVISO = {
  confirmacion_pendiente: { titulo: 'Confirmación pendiente', resumen: (m) => `Una muestra de ${m} de tu zona necesita análisis de laboratorio. Publicaremos una actualización cuando se revise el resultado.`, accion: 'Ver el detalle o consultar el contacto oficial.' },
  en_analisis: { titulo: 'En análisis', resumen: () => 'La muestra fue enviada al laboratorio. El resultado todavía está pendiente.', accion: 'Consultar fecha y canal de seguimiento.' },
  resultado_confirmado: { titulo: 'Resultado confirmado', resumen: (m) => `El laboratorio emitió un resultado para una muestra de ${m}. Consulta el aviso revisado y su fecha.`, accion: 'Leer el resultado comunicado y las indicaciones aprobadas, si las hay.' },
  retirado: { titulo: 'Actualizado o retirado', resumen: () => 'Este aviso cambió. Consulta la fecha y el motivo de la actualización.', accion: 'Abrir la versión vigente si está disponible.' },
};

/** Documento de la colección `avisos` (contrato de la guía, sección 09) a partir de la muestra y su publicación. */
export function avisoDe(m, pub, anterior) {
  const estado = pub.retirado_en ? 'retirado' : ESTADO_PUBLICO[m.certeza] || 'confirmacion_pendiente';
  const t = TEXTOS_AVISO[estado];
  const matriz = MATRIZ_TXT[m.matriz] || 'sedimento';
  return {
    id: pub.id, zona_id: zonaId(pub.zona), zona: pub.zona, version: pub.version, estado,
    titulo: t.titulo, resumen: t.resumen(matriz), accion: t.accion,
    mensaje_aprobado: pub.retirado_en ? '' : String(m.alerta?.mensaje || ''),
    entidad: String(m.alerta?.entidad || m.alerta?.aprobada_por || 'Equipo Ahgora'),
    matriz: m.matriz,
    ...(estado === 'resultado_confirmado' && m.laboratorio?.laboratorio ? { referencia_informe: `${m.laboratorio.laboratorio}${m.laboratorio.fecha_resultado ? ` · ${String(m.laboratorio.fecha_resultado).slice(0, 10)}` : ''}` } : {}),
    publicado_en: anterior?.publicado_en || pub.actualizado_en,
    actualizado_en: pub.actualizado_en,
    retirado: !!pub.retirado_en,
    demostracion: !!m.demostracion,
  };
}

const huellaDe = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 24);

/**
 * Nuevo estado de `publicacion` tras guardar `nueva` (muestra ya combinada con lo anterior), o undefined si no
 * cambia nada visible para la comunidad. Repetir la misma sincronización no sube la versión.
 */
export function versionar(anterior, nueva, ahora = new Date()) {
  const prev = anterior?.publicacion;
  const vista = vistaPublica(nueva);
  const huella = vista ? huellaDe(vista) : null;
  if (huella === (prev?.huella ?? null)) return undefined;
  const version = (prev?.version || 0) + 1;
  const id = prev?.id || idPublico(nueva.codigo);
  if (vista) return { id, version, huella, zona: vista.zona, actualizado_en: ahora, retirado_en: null };
  // Estaba publicado y dejó de estarlo: retiro (se informa a la app para quitarlo de la lista vigente).
  return { ...prev, id, version, huella: null, actualizado_en: ahora, retirado_en: ahora };
}

// ------------------------------------------------------------------ reportes comunitarios
export const TIPOS_REPORTE = new Set(['agua_turbia', 'peces', 'actividad_minera', 'residuos', 'otro']);

/** Valida un reporte de Ahgora Comunidad. Devuelve { error } o { reporte } listo para guardar. */
export function limpiarReporte(b) {
  if (!b || typeof b !== 'object') return { error: 'Cuerpo vacío' };
  if (!TIPOS_REPORTE.has(b.tipo)) return { error: `tipo debe ser uno de: ${[...TIPOS_REPORTE].join(', ')}` };
  let zona = null;
  if (b.zona != null) {
    const lat = Number(b.zona.lat_min), lon = Number(b.zona.lon_min);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { error: 'zona inválida' };
    // Se vuelve a agregar a la celda de 0,1°: aunque llegue algo más preciso, no se guarda.
    zona = zonaPublica(lat + 0.05, lon + 0.05);
  }
  const creado = new Date(b.creado_en);
  return {
    reporte: {
      tipo: b.tipo,
      descripcion: String(b.descripcion ?? '').trim().slice(0, 500),
      zona,
      creado_en: Number.isNaN(creado.getTime()) ? null : creado,
      origen: String(b.origen ?? '').slice(0, 60),
      estado: 'en_revision',
    },
  };
}
