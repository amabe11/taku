// GET /api/health → estado de la API y de la conexión con MongoDB (público, sin datos).
import { cors, db, keyOf } from '../lib/core.js';

export default async function health(req, res) {
  if (cors(req, res)) return;
  try {
    const d = await db();
    await d.command({ ping: 1 });
    res.status(200).json({ ok: true, servicio: 'ahgora-api', base: d.databaseName, clave_configurada: !!keyOf() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message.includes('MONGODB_URI') ? e.message : 'Sin conexión con MongoDB' });
  }
}
