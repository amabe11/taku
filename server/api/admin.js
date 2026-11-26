// /api/admin  (requiere x-ahg-key) — mantenimiento de la base «ahgora».
//   GET                                  estado: base, colecciones, documentos y validadores
//   POST { accion: 'inicializar', sitio?, referencias?, zonas?, forzar? }
//        crea las colecciones con su validador e índices y carga el sitio piloto (Alcoche), sus antecedentes y
//        las zonas públicas con su contacto. Idempotente: repetirlo actualiza por `id`.
//   POST { accion: 'borrar_demostracion' }
//        borra solo lo marcado `demostracion: true` (muestras, avisos y MAPE simulados). Lo real no se toca.
import { handler, db } from '../lib/core.js';
import { inicializar, ESQUEMAS } from '../lib/esquema.js';

const lista = (v, max = 200) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && x.id).slice(0, max) : []);

async function estado(d) {
  const info = await d.listCollections().toArray();
  const colecciones = {};
  for (const nombre of Object.keys(ESQUEMAS)) {
    const c = info.find((x) => x.name === nombre);
    colecciones[nombre] = {
      existe: !!c,
      validador: !!c?.options?.validator,
      documentos: c ? await d.collection(nombre).estimatedDocumentCount() : 0,
      demostracion: c && ['muestras', 'mape', 'avisos'].includes(nombre) ? await d.collection(nombre).countDocuments({ demostracion: true }) : undefined,
    };
  }
  return { base: d.databaseName, colecciones };
}

export default handler(async (req, res) => {
  const d = await db();
  if (req.method === 'GET') return res.status(200).json(await estado(d));
  const b = req.body || {};
  const ahora = new Date();
  if (b.accion === 'inicializar') {
    const hechas = await inicializar(d, { forzar: !!b.forzar });
    const cargar = async (col, docs) => {
      if (!docs.length) return 0;
      const r = await d.collection(col).bulkWrite(docs.map(({ _id, ...x }) => ({ replaceOne: { filter: { id: x.id }, replacement: { ...x, actualizado_en: ahora }, upsert: true } })), { ordered: false });
      return r.upsertedCount + r.matchedCount;
    };
    const cargados = {
      sitios: await cargar('sitios', b.sitio ? [b.sitio] : []),
      referencias: await cargar('referencias', lista(b.referencias)),
      zonas: await cargar('zonas', lista(b.zonas, 500)),
    };
    await d.collection('bitacora').insertOne({ fecha: ahora, accion: 'inicializar', por: String(b.por || 'Ahgora Web').slice(0, 120), detalle: JSON.stringify(cargados) });
    return res.status(200).json({ ok: true, preparadas: hechas, cargados, ...(await estado(d)) });
  }
  if (b.accion === 'borrar_demostracion') {
    const borrados = {};
    for (const col of ['muestras', 'avisos', 'mape']) borrados[col] = (await d.collection(col).deleteMany({ demostracion: true })).deletedCount;
    await d.collection('bitacora').insertOne({ fecha: ahora, accion: 'borrar_demostracion', por: String(b.por || 'Ahgora Web').slice(0, 120), detalle: JSON.stringify(borrados) });
    return res.status(200).json({ ok: true, borrados, ...(await estado(d)) });
  }
  res.status(400).json({ error: 'accion debe ser inicializar o borrar_demostracion' });
}, { methods: ['GET', 'POST'] });
