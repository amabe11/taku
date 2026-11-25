// /api/reportes — reportes comunitarios voluntarios de Ahgora Comunidad (guía, sección 06).
//   POST  público (sin clave): { tipo, descripcion, zona?: { lat_min, lon_min, … }, creado_en, origen }
//         Se guarda «en_revision». Nunca se publica como aviso: orienta el muestreo del equipo.
//   GET   requiere x-ahg-key: lista los reportes más recientes (?limit=…).
// Privacidad: solo la zona agregada de 0,1°, sin datos personales. La IP no se guarda: solo una huella
// con la clave del equipo para limitar envíos repetidos (20 por hora).
import { createHash } from 'node:crypto';
import { cors, db, authorized, keyOf, limpiarReporte } from '../lib/core.js';

const MAX_POR_HORA = 20;

export default async function reportes(req, res) {
  if (cors(req, res)) return;
  try {
    if (req.method === 'GET') {
      if (!authorized(req, res)) return;
      const d = await db();
      const limit = Math.min(1000, Math.max(1, Number(req.query?.limit) || 200));
      const items = await d.collection('reportes').find({}, { projection: { _id: 0, origen_hash: 0 } })
        .sort({ recibido_en: -1 }).limit(limit).toArray();
      return res.status(200).json({ total: items.length, items });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: `Método no permitido: ${req.method}` });

    const { error, reporte } = limpiarReporte(req.body);
    if (error) return res.status(400).json({ error });

    const d = await db();
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    const origen_hash = createHash('sha256').update(`${keyOf() || ''}:${ip}`).digest('hex').slice(0, 24);
    const recientes = await d.collection('reportes').countDocuments({ origen_hash, recibido_en: { $gte: new Date(Date.now() - 3600000) } });
    if (recientes >= MAX_POR_HORA) return res.status(429).json({ error: 'Demasiados reportes seguidos. Intenta más tarde.' });

    const recibido_en = new Date();
    await d.collection('reportes').insertOne({ ...reporte, recibido_en, origen_hash });
    res.status(201).json({ ok: true, estado: 'en_revision', recibido_en: recibido_en.toISOString() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno de la API' });
  }
}
