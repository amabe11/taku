// GET /api/datos?coleccion=corridas|lemna|escenas[&id=…][&limit=…][&filas=1]   (requiere x-hg-key)
// Lista los documentos del equipo (más recientes primero). Con id devuelve uno solo.
import { handler, db } from '../lib/core.js';

const COLS = { corridas: 'run_id', lemna: 'id', escenas: 'id' };

export default handler(async (req, res) => {
  const col = String(req.query.coleccion || 'corridas');
  if (!COLS[col]) return res.status(400).json({ error: 'coleccion debe ser corridas, lemna o escenas' });
  const d = await db();
  const projection = { _id: 0 };
  if (col === 'corridas' && req.query.filas !== '1' && !req.query.id) projection.filas = 0;
  if (req.query.id) {
    const doc = await d.collection(col).findOne({ [COLS[col]]: String(req.query.id) }, { projection });
    return doc ? res.status(200).json(doc) : res.status(404).json({ error: 'No encontrado' });
  }
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  const items = await d.collection(col).find({}, { projection }).sort({ creada: -1 }).limit(limit).toArray();
  res.status(200).json({ coleccion: col, total: items.length, items });
});
