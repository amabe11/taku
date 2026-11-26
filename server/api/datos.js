// GET /api/datos?coleccion=<nombre>[&codigo=…|&id=…][&limit=…][&desde=ISO]   (requiere x-ahg-key)
// Lectura para el equipo y las autoridades (Ahgora Web). Las muestras incluyen la ubicación exacta.
//   muestras · mape · avisos · bitacora · zonas · reportes · sitios · referencias
import { handler, db } from '../lib/core.js';

const ORDEN = {
  muestras: { fecha_iso: -1 }, mape: { estado_legal: 1, nombre: 1 }, avisos: { actualizado_en: -1 }, bitacora: { fecha: -1 },
  zonas: { id: 1 }, reportes: { recibido_en: -1 }, sitios: { id: 1 }, referencias: { anio: -1 },
};
const CLAVE = { muestras: 'codigo' };
const FECHA = { muestras: 'sincronizado_en', mape: 'sincronizado_en', avisos: 'actualizado_en', bitacora: 'fecha', reportes: 'recibido_en' };

export default handler(async (req, res) => {
  const col = String(req.query.coleccion || 'muestras');
  if (!ORDEN[col]) return res.status(400).json({ error: `coleccion debe ser una de: ${Object.keys(ORDEN).join(', ')}` });
  const d = await db();
  const projection = { _id: 0, origen_hash: 0 };
  const clave = CLAVE[col] || 'id';
  const uno = req.query[clave] ?? req.query.id;
  if (uno) {
    const doc = await d.collection(col).findOne({ [clave]: String(uno) }, { projection });
    return doc ? res.status(200).json(doc) : res.status(404).json({ error: 'No encontrado' });
  }
  const filtro = {};
  // Sincronización incremental: solo lo cambiado desde una fecha.
  if (req.query.desde && FECHA[col]) {
    const f = new Date(String(req.query.desde));
    if (!Number.isNaN(f.getTime())) filtro[FECHA[col]] = { $gt: f };
  }
  const limit = Math.min(2000, Math.max(1, Number(req.query.limit) || 500));
  const items = await d.collection(col).find(filtro, { projection }).sort(ORDEN[col]).limit(limit).toArray();
  res.status(200).json({ coleccion: col, total: items.length, items });
});
