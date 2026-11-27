// /api/lecturas — señal del lector Ahgora (ESP32 + TCS34725) que llega por WiFi (hotspot del celular).
//   POST  (cabecera x-ahg-nodo con AHG_NODE_KEY, o x-ahg-key)  cuerpo: { node_id, firmware?, rssi?, lecturas: [...] }
//         Guarda cada lectura en la colección `lecturas` (respaldo de 30 días). Reintentar un envío no duplica.
//   GET   (x-ahg-key)  ?node_id=AHG-SED-01&desde=<ISO o ms>&limit=200
//         Lecturas más recientes primero + resumen por lector (última lectura y cuántas en 24 h).
//         Lo usan Ahgora Web («Lector en vivo») y la app modo técnico («Lector WiFi»).
// Las lecturas son señal óptica cruda: NO son concentración de mercurio.
import { handler, db, authorized, esLector, limpiarLecturas } from '../lib/core.js';

export default handler(async (req, res) => {
  if (req.method === 'POST') {
    if (!esLector(req)) return res.status(401).json({ error: 'Clave del lector inválida o ausente (cabecera x-ahg-nodo)' });
    const r = limpiarLecturas(req.body);
    if (r.error) return res.status(400).json({ error: r.error });
    const col = (await db()).collection('lecturas');
    // Si el ESP32 reintenta un envío que sí había llegado: misma lectura = mismo nodo, seq y hora de medición.
    const ops = r.docs.map((doc) => (doc.medido_en
      ? { updateOne: { filter: { node_id: doc.node_id, seq: doc.seq, medido_en: doc.medido_en }, update: { $setOnInsert: doc }, upsert: true } }
      : { insertOne: { document: doc } }));
    const w = await col.bulkWrite(ops, { ordered: false });
    return res.status(200).json({
      ok: true, recibidas: r.docs.length, guardadas: (w.insertedCount || 0) + (w.upsertedCount || 0),
      recibido_en: r.docs[0].recibido_en.toISOString(),
    });
  }

  if (!authorized(req, res)) return;
  const col = (await db()).collection('lecturas');
  const filtro = {};
  if (req.query.node_id) filtro.node_id = String(req.query.node_id).slice(0, 40);
  if (req.query.desde) {
    const q = String(req.query.desde);
    const v = /^\d+$/.test(q) ? new Date(Number(q)) : new Date(q);
    if (!Number.isNaN(v.getTime())) filtro.recibido_en = { $gte: v };
  }
  const limit = Math.min(2000, Math.max(1, Number(req.query.limit) || 200));
  const items = await col.find(filtro, { projection: { _id: 0 } }).sort({ recibido_en: -1, seq: -1 }).limit(limit).toArray();
  const hace24 = new Date(Date.now() - 86400000);
  const nodos = await col.aggregate([
    { $sort: { recibido_en: -1, seq: -1 } },
    { $group: { _id: '$node_id', ultima: { $first: '$$ROOT' }, total_24h: { $sum: { $cond: [{ $gte: ['$recibido_en', hace24] }, 1, 0] } } } },
    { $project: { _id: 0, node_id: '$_id', total_24h: 1, ultima: { $unsetField: { field: '_id', input: '$ultima' } } } },
    { $sort: { 'ultima.recibido_en': -1 } },
  ]).toArray();
  res.status(200).json({ coleccion: 'lecturas', total: items.length, items, nodos, ahora: new Date().toISOString() });
}, { auth: false, methods: ['GET', 'POST'] });
