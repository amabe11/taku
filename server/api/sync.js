// POST /api/sync  (requiere x-ahg-key)
// Cuerpo: { origen_web, muestras: [registro de muestra] } — lo envían la app modo técnico y Ahgora Web.
// Inserta o actualiza por `codigo`: repetir la sincronización no duplica datos.
// Si cambia lo que ve la comunidad (aviso aprobado y público), sube `publicacion.version`; si deja de
// publicarse, marca `publicacion.retirado_en` para que Ahgora Comunidad lo quite de la lista vigente.
import { handler, db, cleanMuestra, versionar } from '../lib/core.js';

export default handler(async (req, res) => {
  const body = req.body || {};
  const muestras = Array.isArray(body.muestras) ? body.muestras.filter((m) => m?.codigo) : [];
  if (muestras.length > 500) return res.status(413).json({ error: 'Demasiadas muestras en un envío (máx. 500)' });
  if (!muestras.length) return res.status(200).json({ ok: true, muestras: 0 });
  const d = await db();
  const col = d.collection('muestras');
  const now = new Date();
  const meta = { sincronizado_en: now, sincronizado_desde: String(body.origen_web || '').slice(0, 200) };

  const limpias = muestras.map(cleanMuestra);
  const actuales = new Map(
    (await col.find({ codigo: { $in: limpias.map((c) => c.codigo) } }, { projection: { _id: 0 } }).toArray())
      .map((p) => [p.codigo, p]),
  );
  let avisos = 0;
  const ops = limpias.map((c) => {
    const anterior = actuales.get(c.codigo);
    // $set reemplaza cada campo de primer nivel: la combinación superficial reproduce el documento resultante.
    const resultado = { ...anterior, ...c };
    const publicacion = versionar(anterior, resultado, now);
    if (publicacion) { avisos++; resultado.publicacion = publicacion; }
    actuales.set(c.codigo, resultado); // por si la misma muestra viene repetida en el envío
    return { updateOne: { filter: { codigo: c.codigo }, update: { $set: { ...c, ...meta, ...(publicacion ? { publicacion } : {}) } }, upsert: true } };
  });
  const r = await col.bulkWrite(ops, { ordered: false });
  res.status(200).json({ ok: true, muestras: r.upsertedCount + r.matchedCount, avisos_actualizados: avisos, sincronizado_en: now.toISOString() });
}, { methods: ['POST'] });
