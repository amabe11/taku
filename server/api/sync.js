// POST /api/sync  (requiere x-hg-key)
// Cuerpo: { origen_web, corridas: [run + filas], lemna: [obs], escenas: [manifiestos] }
// Inserta o actualiza por clave natural (run_id, id): repetir la sincronización no duplica datos.
import { handler, db, cleanRun, cleanLemna, cleanEscena } from '../lib/core.js';

export default handler(async (req, res) => {
  const body = req.body || {};
  const corridas = Array.isArray(body.corridas) ? body.corridas.filter((r) => r?.run_id) : [];
  const lemna = Array.isArray(body.lemna) ? body.lemna.filter((o) => o?.id) : [];
  const escenas = Array.isArray(body.escenas) ? body.escenas.filter((e) => e?.id) : [];
  if (corridas.length + lemna.length + escenas.length > 500) return res.status(413).json({ error: 'Demasiados elementos en un envío (máx. 500)' });
  const d = await db();
  const now = new Date();
  const meta = { sincronizado_en: now, sincronizado_desde: String(body.origen_web || '').slice(0, 200) };
  const bulk = async (col, items, key, clean) => {
    if (!items.length) return 0;
    const ops = items.map((it) => ({ updateOne: { filter: { [key]: it[key] }, update: { $set: { ...clean(it), ...meta } }, upsert: true } }));
    const r = await d.collection(col).bulkWrite(ops, { ordered: false });
    return r.upsertedCount + r.matchedCount;
  };
  const [nc, nl, ne] = await Promise.all([
    bulk('corridas', corridas, 'run_id', cleanRun),
    bulk('lemna', lemna, 'id', cleanLemna),
    bulk('escenas', escenas, 'id', cleanEscena),
  ]);
  res.status(200).json({ ok: true, corridas: nc, lemna: nl, escenas: ne, sincronizado_en: now.toISOString() });
}, { methods: ['POST'] });
