// GET /api/public/avisos  (público, sin clave) — contrato de la guía, sección 09, para Ahgora Comunidad.
//   ?zona_id=z-…        solo los avisos de esa zona
//   ?desde=<cursor ISO> solo lo actualizado después (sincronización incremental; incluye retiros)
//   ?id=av-…            detalle de un aviso
// Respuesta: { items: [aviso], cursor } — el cursor es el `actualizado_en` más reciente entregado.
// Reglas: una versión más antigua nunca reemplaza a una nueva (la app compara `version`); un aviso retirado
// llega con `retirado: true` para quitarlo de la lista vigente. Sin coordenadas exactas, códigos ni lecturas.
import { cors, db } from '../../lib/core.js';

const CAMPOS = { _id: 0 };

export default async function avisos(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: `Método no permitido: ${req.method}` });
  try {
    const d = await db();
    const col = d.collection('avisos');
    if (req.query?.id) {
      const doc = await col.findOne({ id: String(req.query.id) }, { projection: CAMPOS });
      return doc ? res.status(200).json(doc) : res.status(404).json({ error: 'Aviso no encontrado' });
    }
    const filtro = {};
    if (req.query?.zona_id) filtro.zona_id = String(req.query.zona_id);
    const desde = req.query?.desde ? new Date(String(req.query.desde)) : null;
    if (desde && !Number.isNaN(desde.getTime())) filtro.actualizado_en = { $gt: desde };
    else filtro.retirado = { $ne: true }; // primera descarga: solo lo vigente
    const items = await col.find(filtro, { projection: CAMPOS }).sort({ actualizado_en: 1 }).limit(500).toArray();
    const cursor = items.length ? items.at(-1).actualizado_en : desde || null;
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.status(200).json({ aviso: 'Primera señal, no un diagnóstico ni una prueba legal.', items, cursor });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno de la API' });
  }
}
