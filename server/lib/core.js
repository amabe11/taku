// Servidor Ahgora (secciones 3 y 7.6 de la guía): Vercel Functions + MongoDB Atlas M0.
// Reúne las muestras que sincroniza la app modo técnico y las confirmaciones/alertas que agrega Ahgora Web.
// Variables de entorno (se configuran en Vercel, nunca en el repositorio):
//   MONGODB_URI                    cadena de conexión de Atlas (mongodb+srv://…)
//   AHG_TEAM_KEY (o HG_TEAM_KEY)   clave del equipo; se envía en la cabecera «x-ahg-key» para leer o escribir
//   AHG_DB (o HG_DB)               nombre de la base (opcional; por defecto «hgguard», la ya creada)
import { createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';

let clientPromise = globalThis.__hgMongo;
export async function db() {
  if (!process.env.MONGODB_URI) throw Object.assign(new Error('Falta MONGODB_URI en las variables de entorno'), { status: 500 });
  if (!clientPromise) {
    // Conexión reutilizada entre invocaciones (evita agotar las 500 conexiones del plan gratuito).
    clientPromise = globalThis.__hgMongo = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 }).connect();
  }
  const client = await clientPromise;
  const d = client.db(process.env.AHG_DB || process.env.HG_DB || 'hgguard');
  if (!globalThis.__hgIndexes) {
    globalThis.__hgIndexes = Promise.all([
      d.collection('muestras').createIndex({ codigo: 1 }, { unique: true }),
      d.collection('muestras').createIndex({ fecha_iso: -1 }),
      d.collection('muestras').createIndex({ 'alerta.estado': 1 }),
      d.collection('muestras').createIndex({ 'publicacion.retirado_en': -1 }, { sparse: true }),
      d.collection('reportes').createIndex({ recibido_en: -1 }),
      d.collection('reportes').createIndex({ origen_hash: 1, recibido_en: -1 }),
    ]);
  }
  await globalThis.__hgIndexes;
  return d;
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
export function cleanMuestra(m) {
  // Los campos de publicación (id público, versión, retiro) los calcula solo el servidor.
  const { _id, pendiente_sync, sincronizado_en, sincronizado_desde, publicacion, ...rest } = m;
  return {
    ...rest,
    codigo: String(m.codigo).slice(0, 80),
    semaforo: SEM.has(m.semaforo) ? m.semaforo : 'invalido',
    certeza: CERT.has(m.certeza) ? m.certeza : 'cribado',
    visibilidad: m.visibilidad === 'publico' ? 'publico' : 'restringido',
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
