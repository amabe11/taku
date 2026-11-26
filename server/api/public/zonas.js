// GET /api/public/zonas  (público, sin clave) — contrato de la guía, sección 09.
// Lista de zonas generalizadas (celdas de 0,1°, ~11 km) para que la persona elija la suya en Ahgora Comunidad,
// con su contacto oficial y cuántos avisos vigentes tiene.
import { cors, db } from '../../lib/core.js';

export default async function zonas(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: `Método no permitido: ${req.method}` });
  try {
    const d = await db();
    const [lista, conteo] = await Promise.all([
      d.collection('zonas').find({}, { projection: { _id: 0 } }).sort({ nombre: 1 }).toArray(),
      d.collection('avisos').aggregate([{ $match: { retirado: { $ne: true } } }, { $group: { _id: '$zona_id', n: { $sum: 1 } } }]).toArray(),
    ]);
    const n = new Map(conteo.map((c) => [c._id, c.n]));
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json({ items: lista.map((z) => ({ ...z, avisos_vigentes: n.get(z.id) || 0 })) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno de la API' });
  }
}
