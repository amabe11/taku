// GET /api/health → estado de la API y de la conexión con MongoDB (público, sin datos).
import { cors, db, keyOf } from '../lib/core.js';

export default async function health(req, res) {
  if (cors(req, res)) return;
  try {
    const d = await db();
    await d.command({ ping: 1 });
    res.status(200).json({ ok: true, servicio: 'ahgora-api', version: '2.0.1', base: d.databaseName, clave_configurada: !!keyOf(), esquema: globalThis.__ahgInitError && globalThis.__ahgInitError.base === d.databaseName ? { ok: false, ...globalThis.__ahgInitError } : { ok: true, validadores: true }, ...(globalThis.__ahgAviso ? { aviso: globalThis.__ahgAviso } : {}), endpoints: ['/api/sync', '/api/datos', '/api/admin', '/api/public/zonas', '/api/public/avisos', '/api/alertas', '/api/reportes'] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message.includes('MONGODB_URI') ? e.message : 'Sin conexión con MongoDB', codigo: e.codeName || e.code || e.name, detalle: String(e.message).replace(/mongodb(\+srv)?:\/\/[^\s]+/g, '<uri>').slice(0, 200) });
  }
}
