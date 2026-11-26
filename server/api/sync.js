// POST /api/sync  (requiere x-ahg-key)
// Cuerpo: { origen_web?, muestras?: [registro de muestra], mape?: [unidad minera] }
// Lo envían la app modo técnico (muestras del lector ESP32), Ahgora Web (laboratorio, alertas, visibilidad,
// registro MAPE) y el simulador del lector. Inserta o actualiza por `codigo` / `id`: repetir no duplica.
// Si cambia lo que ve la comunidad, sube la versión del aviso, actualiza la colección `avisos` (lo único que lee
// Ahgora Comunidad) y deja la acción en la `bitacora`. Un aviso que deja de estar aprobado y público se retira.
import { handler, db, cleanMuestra, cleanMape, versionar, avisoDe } from '../lib/core.js';

const MAX = 500;

export default handler(async (req, res) => {
  const body = req.body || {};
  const entrada = Array.isArray(body.muestras) ? body.muestras : [];
  const entradaMape = Array.isArray(body.mape) ? body.mape : [];
  if (entrada.length > MAX || entradaMape.length > MAX) return res.status(413).json({ error: `Demasiados registros en un envío (máx. ${MAX})` });
  const rechazadas = [];
  const limpias = entrada.map(cleanMuestra).filter((c) => (c.error ? (rechazadas.push(c.error), false) : true));
  const mape = entradaMape.map(cleanMape).filter((c) => (c.error ? (rechazadas.push(c.error), false) : true));
  if (!limpias.length && !mape.length) return res.status(rechazadas.length ? 400 : 200).json({ ok: !rechazadas.length, muestras: 0, mape: 0, rechazadas });

  const d = await db();
  const now = new Date();
  const origen = String(body.origen_web || body.origen || '').slice(0, 200);
  const meta = { sincronizado_en: now, sincronizado_desde: origen };
  const resp = { ok: true, muestras: 0, mape: 0, avisos_actualizados: 0, rechazadas, sincronizado_en: now.toISOString() };

  if (limpias.length) {
    const col = d.collection('muestras');
    const actuales = new Map(
      (await col.find({ codigo: { $in: limpias.map((c) => c.codigo) } }, { projection: { _id: 0 } }).toArray()).map((p) => [p.codigo, p]),
    );
    const avisosPrevios = new Map(
      (await d.collection('avisos').find({ id: { $in: [...actuales.values()].map((p) => p.publicacion?.id).filter(Boolean) } }, { projection: { _id: 0, id: 1, publicado_en: 1 } }).toArray()).map((a) => [a.id, a]),
    );
    const avisos = [];
    const bitacora = [];
    const ops = limpias.map((c) => {
      const anterior = actuales.get(c.codigo);
      // $set reemplaza cada campo de primer nivel: la combinación superficial reproduce el documento resultante.
      const resultado = { ...anterior, ...c };
      const publicacion = versionar(anterior, resultado, now);
      if (publicacion) {
        resultado.publicacion = publicacion;
        const aviso = avisoDe(resultado, publicacion, avisosPrevios.get(publicacion.id));
        avisos.push(aviso);
        avisosPrevios.set(aviso.id, aviso);
        bitacora.push({
          fecha: now, accion: aviso.retirado ? 'retirar' : publicacion.version === 1 ? 'publicar' : 'actualizar',
          aviso_id: aviso.id, codigo: c.codigo, version: publicacion.version,
          por: String(resultado.alerta?.aprobada_por || origen || 'sin nombre').slice(0, 120), detalle: aviso.estado,
        });
      }
      actuales.set(c.codigo, resultado); // por si la misma muestra viene repetida en el envío
      return { updateOne: { filter: { codigo: c.codigo }, update: { $set: { ...c, ...meta, ...(publicacion ? { publicacion } : {}) } }, upsert: true } };
    });
    const r = await col.bulkWrite(ops, { ordered: false });
    resp.muestras = r.upsertedCount + r.matchedCount;
    if (avisos.length) {
      await d.collection('avisos').bulkWrite(avisos.map((a) => ({ replaceOne: { filter: { id: a.id }, replacement: a, upsert: true } })), { ordered: false });
      await d.collection('bitacora').insertMany(bitacora, { ordered: false });
    }
    resp.avisos_actualizados = avisos.length;
  }

  if (mape.length) {
    const r = await d.collection('mape').bulkWrite(
      mape.map((u) => ({ updateOne: { filter: { id: u.id }, update: { $set: { ...u, ...meta } }, upsert: true } })), { ordered: false });
    resp.mape = r.upsertedCount + r.matchedCount;
    await d.collection('bitacora').insertOne({ fecha: now, accion: 'registro_mape', por: origen || 'sin nombre', detalle: `${resp.mape} unidades mineras` });
  }
  res.status(200).json(resp);
}, { methods: ['POST'] });
