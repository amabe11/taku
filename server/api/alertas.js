// GET /api/alertas  (público, sin clave) — para Ahgora Comunidad (secciones 7.2 y 7.7).
// Solo mensajes APROBADOS por un responsable, de muestras públicas, con la zona agregada (celda de 0,1°):
// nunca la coordenada exacta, el código de la muestra, el responsable ni las lecturas.
// Cada aviso lleva `id` público estable y `version` (sube con cada corrección). Los avisos retirados en los
// últimos 90 días se informan con `retirado: true` para que la app los quite de la lista vigente.
import { cors, db, idPublico, vistaPublica } from '../lib/core.js';

const LIMITE = 200;
const RETIROS_DIAS = 90;

export default async function alertas(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: `Método no permitido: ${req.method}` });
  try {
    const d = await db();
    const desde = new Date(Date.now() - RETIROS_DIAS * 86400000);
    const docs = await d.collection('muestras').find(
      { $or: [{ 'alerta.estado': 'aprobada', visibilidad: 'publico' }, { 'publicacion.retirado_en': { $gte: desde } }] },
      { projection: { _id: 0, codigo: 1, matriz: 1, lat: 1, lon: 1, certeza: 1, alerta: 1, demostracion: 1, visibilidad: 1, publicacion: 1, 'laboratorio.laboratorio': 1 } },
    ).sort({ 'alerta.fecha': -1 }).limit(LIMITE).toArray();
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).json({ aviso: 'Primera señal, no un diagnóstico ni una prueba legal.', items: docs.map(itemPublico).filter(Boolean) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno de la API' });
  }
}

export function itemPublico(m) {
  const vista = vistaPublica(m);
  const pub = m.publicacion;
  if (vista) {
    return { id: pub?.id || idPublico(m.codigo), version: pub?.version || 1, ...vista, actualizado_en: pub?.actualizado_en || m.alerta.fecha };
  }
  if (pub?.retirado_en && pub.zona) {
    // Retiro: solo lo mínimo para identificarlo, con la zona que ya era pública.
    return { id: pub.id, version: pub.version, matriz: m.matriz, zona: pub.zona, retirado: true, fecha: pub.retirado_en, actualizado_en: pub.retirado_en, demostracion: !!m.demostracion };
  }
  return null;
}
