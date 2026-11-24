// Núcleo de la API en la nube (Vercel Functions + MongoDB Atlas M0).
// Variables de entorno (se configuran en Vercel, nunca en el repositorio):
//   MONGODB_URI   cadena de conexión de Atlas (mongodb+srv://…)
//   HG_TEAM_KEY   clave del equipo; se envía en la cabecera «x-hg-key» para leer o escribir datos
//   HG_DB         nombre de la base (opcional, por defecto «hgguard»)
import { MongoClient } from 'mongodb';

let clientPromise = globalThis.__hgMongo;
export async function db() {
  if (!process.env.MONGODB_URI) throw Object.assign(new Error('Falta MONGODB_URI en las variables de entorno'), { status: 500 });
  if (!clientPromise) {
    // Conexión reutilizada entre invocaciones (evita agotar las 500 conexiones del plan gratuito).
    clientPromise = globalThis.__hgMongo = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 }).connect();
  }
  const client = await clientPromise;
  const d = client.db(process.env.HG_DB || 'hgguard');
  if (!globalThis.__hgIndexes) {
    globalThis.__hgIndexes = Promise.all([
      d.collection('corridas').createIndex({ run_id: 1 }, { unique: true }),
      d.collection('corridas').createIndex({ id_muestra: 1, fecha_iso: -1 }),
      d.collection('lemna').createIndex({ id: 1 }, { unique: true }),
      d.collection('lemna').createIndex({ id_muestra: 1, dia: 1 }),
      d.collection('escenas').createIndex({ id: 1 }, { unique: true }),
    ]);
  }
  await globalThis.__hgIndexes;
  return d;
}

/** CORS abierto: la protección es la clave del equipo (no hay cookies). Incluye la web del ESP32 (http://192.168.4.1). */
export function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-hg-key');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

export function authorized(req, res) {
  const key = process.env.HG_TEAM_KEY;
  if (!key) { res.status(500).json({ error: 'Falta HG_TEAM_KEY en las variables de entorno' }); return false; }
  if (req.headers['x-hg-key'] !== key) { res.status(401).json({ error: 'Clave del equipo inválida o ausente (cabecera x-hg-key)' }); return false; }
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

// Campos permitidos: lo que llega del navegador se limpia antes de guardarse.
const strip = (o) => { if (!o || typeof o !== 'object') return o; const { _id, ...rest } = o; return rest; };
export const cleanRun = (r) => ({ ...strip(r), filas: Array.isArray(r.filas) ? r.filas.slice(0, 121).map(strip) : [] });
export const cleanLemna = (o) => strip(o);
export const cleanEscena = (e) => { const { imagenes, ...rest } = strip(e); return rest; }; // solo el manifiesto (las imágenes quedan en el navegador)
