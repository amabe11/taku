// GET /api/alertas  (público, sin clave) — para Ahgora Comunidad (secciones 7.2 y 7.7).
// Solo mensajes APROBADOS por un responsable, de muestras públicas, con la zona agregada (celda de 0,1°):
// nunca la coordenada exacta, el responsable ni las lecturas.
import { cors, db } from '../lib/core.js';

const zona = (lat, lon, paso = 0.1) => {
  const f = (v) => Math.floor(v / paso) * paso;
  return { lat_min: +f(lat).toFixed(2), lon_min: +f(lon).toFixed(2), lat_max: +(f(lat) + paso).toFixed(2), lon_max: +(f(lon) + paso).toFixed(2) };
};
const NIVEL = { cribado: 'CRIBADO — requiere confirmación', en_verificacion: 'EN VERIFICACIÓN', confirmado: 'CONFIRMADO POR LABORATORIO' };

export default async function alertas(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: `Método no permitido: ${req.method}` });
  try {
    const d = await db();
    const docs = await d.collection('muestras').find({ 'alerta.estado': 'aprobada', visibilidad: 'publico' },
      { projection: { _id: 0, matriz: 1, lat: 1, lon: 1, certeza: 1, alerta: 1, demostracion: 1, 'laboratorio.laboratorio': 1 } })
      .sort({ 'alerta.fecha': -1 }).limit(200).toArray();
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).json({
      aviso: 'Primera señal, no un diagnóstico ni una prueba legal.',
      items: docs.filter((m) => m.lat != null && m.lon != null).map((m) => ({
        matriz: m.matriz, zona: zona(m.lat, m.lon), nivel: NIVEL[m.certeza] || NIVEL.cribado,
        tipo: m.alerta.tipo, mensaje: m.alerta.mensaje, fecha: m.alerta.fecha,
        laboratorio: m.certeza === 'confirmado' ? m.laboratorio?.laboratorio : undefined, demostracion: !!m.demostracion,
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno de la API' });
  }
}
