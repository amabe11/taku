// Servidor Ahgora (secciones 3 y 7.6 de la guía): Vercel Functions + MongoDB Atlas M0.
// Reúne las muestras que sincroniza la app modo técnico y las confirmaciones/alertas que agrega Ahgora Web.
// Variables de entorno (se configuran en Vercel, nunca en el repositorio):
//   MONGODB_URI                    cadena de conexión de Atlas (mongodb+srv://…)
//   AHG_TEAM_KEY (o HG_TEAM_KEY)   clave del equipo; se envía en la cabecera «x-ahg-key» para leer o escribir
//   AHG_DB (o HG_DB)               nombre de la base (opcional; por defecto «hgguard», la ya creada)
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
  const { _id, pendiente_sync, sincronizado_en, sincronizado_desde, ...rest } = m;
  return {
    ...rest,
    codigo: String(m.codigo).slice(0, 80),
    semaforo: SEM.has(m.semaforo) ? m.semaforo : 'invalido',
    certeza: CERT.has(m.certeza) ? m.certeza : 'cribado',
    visibilidad: m.visibilidad === 'publico' ? 'publico' : 'restringido',
  };
}
