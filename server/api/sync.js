// POST /api/sync  (requiere x-ahg-key)
// Cuerpo: { origen_web, muestras: [registro de muestra] } — lo envían la app modo técnico y Ahgora Web.
// Inserta o actualiza por `codigo`: repetir la sincronización no duplica datos.
import { handler, db, cleanMuestra } from '../lib/core.js';

export default handler(async (req, res) => {
  const body = req.body || {};
  const muestras = Array.isArray(body.muestras) ? body.muestras.filter((m) => m?.codigo) : [];
  if (muestras.length > 500) return res.status(413).json({ error: 'Demasiadas muestras en un envío (máx. 500)' });
  if (!muestras.length) return res.status(200).json({ ok: true, muestras: 0 });
  const d = await db();
  const now = new Date();
  const meta = { sincronizado_en: now, sincronizado_desde: String(body.origen_web || '').slice(0, 200) };
  const ops = muestras.map((m) => { const c = cleanMuestra(m); return { updateOne: { filter: { codigo: c.codigo }, update: { $set: { ...c, ...meta } }, upsert: true } }; });
  const r = await d.collection('muestras').bulkWrite(ops, { ordered: false });
  res.status(200).json({ ok: true, muestras: r.upsertedCount + r.matchedCount, sincronizado_en: now.toISOString() });
}, { methods: ['POST'] });
