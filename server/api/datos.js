// GET /api/datos?coleccion=muestras[&codigo=…][&limit=…]   (requiere x-ahg-key)
// Lista las muestras (más recientes primero) con ubicación exacta: solo para el equipo y las autoridades.
import { handler, db } from '../lib/core.js';

export default handler(async (req, res) => {
  const col = String(req.query.coleccion || 'muestras');
  if (col !== 'muestras') return res.status(400).json({ error: 'coleccion debe ser muestras' });
  const d = await db();
  const projection = { _id: 0 };
  if (req.query.codigo) {
    const doc = await d.collection(col).findOne({ codigo: String(req.query.codigo) }, { projection });
    return doc ? res.status(200).json(doc) : res.status(404).json({ error: 'No encontrado' });
  }
  const limit = Math.min(2000, Math.max(1, Number(req.query.limit) || 500));
  const items = await d.collection(col).find({}, { projection }).sort({ fecha_iso: -1 }).limit(limit).toArray();
  res.status(200).json({ coleccion: col, total: items.length, items });
});
