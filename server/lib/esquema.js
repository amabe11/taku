// Estructura de la base «ahgora» según la guía vigente:
//   · Ahgora · Descripción de la solución (7.6: registro de muestra) y
//   · Guía definitiva y Android Comunidad (08: publicación y trazabilidad, 09: contrato de avisos y zonas).
// Cada colección tiene un validador $jsonSchema: MongoDB rechaza documentos que no cumplan lo mínimo.
// Los esquemas exigen solo lo indispensable y aceptan campos adicionales para no romper la app ni el firmware.

const str = { bsonType: 'string' };
const num = { bsonType: ['double', 'int', 'long', 'decimal'] };
const numONull = { bsonType: ['double', 'int', 'long', 'decimal', 'null'] };
const fecha = { bsonType: ['date', 'string'] };
const bool = { bsonType: 'bool' };
const celda = {
  bsonType: 'object', required: ['lat_min', 'lon_min', 'lat_max', 'lon_max'],
  properties: { lat_min: num, lon_min: num, lat_max: num, lon_max: num },
};

export const ESQUEMAS = {
  // Registro técnico (protegido): lo envía la app modo técnico; Ahgora Web agrega laboratorio, alerta y visibilidad.
  muestras: {
    bsonType: 'object',
    required: ['codigo', 'matriz', 'cabezal', 'fecha_iso', 'semaforo', 'certeza'],
    properties: {
      codigo: { ...str, maxLength: 80 },
      matriz: { enum: ['sedimento', 'cola', 'pescado'] },
      cabezal: { enum: ['SED', 'PEZ'] },
      fecha_iso: str,
      lat: numONull, lon: numONull,
      sitio: str, cuenca: str, responsable: str,
      semaforo: { enum: ['rojo', 'amarillo', 'verde', 'invalido'] },
      certeza: { enum: ['cribado', 'en_verificacion', 'confirmado'] },
      visibilidad: { enum: ['publico', 'restringido'] },
      lecturas: { bsonType: ['object', 'null'] },
      calculo: { bsonType: ['object', 'null'] },
      controles: { bsonType: ['object', 'null'] },
      laboratorio: { bsonType: ['object', 'null'] },
      alerta: { bsonType: ['object', 'null'] },
      calibracion: str, firmware: str,
      origen: str,
      demostracion: bool,
    },
  },
  // Versión pública del aviso (guía 09): lo único que recibe Ahgora Comunidad.
  avisos: {
    bsonType: 'object',
    required: ['id', 'zona_id', 'version', 'estado', 'titulo', 'resumen', 'accion', 'actualizado_en'],
    properties: {
      id: { ...str, pattern: '^av-' },
      zona_id: { ...str, pattern: '^z-' },
      version: { bsonType: ['int', 'long', 'double'], minimum: 1 },
      estado: { enum: ['confirmacion_pendiente', 'en_analisis', 'resultado_confirmado', 'retirado'] },
      titulo: str, resumen: str, accion: str, mensaje_aprobado: str,
      entidad: str, contacto: str, matriz: { enum: ['sedimento', 'cola', 'pescado'] },
      zona: celda,
      publicado_en: fecha, actualizado_en: fecha,
      retirado: bool,
      demostracion: bool,
    },
  },
  // Bitácora interna de publicación (guía 08): cada acción con responsable y fecha.
  bitacora: {
    bsonType: 'object',
    required: ['fecha', 'accion'],
    properties: {
      fecha: fecha,
      accion: { enum: ['publicar', 'actualizar', 'retirar', 'sincronizar', 'inicializar', 'borrar_demostracion', 'registro_mape'] },
      aviso_id: str, codigo: str, version: numONull, por: str, detalle: str,
    },
  },
  // Zonas generalizadas (celda de 0,1°) con su contacto oficial (guía 09: GET /public/zonas).
  zonas: {
    bsonType: 'object',
    required: ['id', 'nombre', 'celda'],
    properties: { id: { ...str, pattern: '^z-' }, nombre: str, municipio: str, sitio: str, celda, contacto: str, demostracion: bool },
  },
  // Reportes comunitarios voluntarios (guía 06): orientan el muestreo, nunca se publican.
  reportes: {
    bsonType: 'object',
    required: ['tipo', 'estado', 'recibido_en'],
    properties: {
      tipo: { enum: ['agua_turbia', 'peces', 'actividad_minera', 'residuos', 'otro'] },
      descripcion: str, zona: { bsonType: ['object', 'null'] }, estado: { enum: ['en_revision', 'revisado', 'descartado'] },
      recibido_en: fecha, creado_en: { bsonType: ['date', 'null'] }, origen: str,
    },
  },
  // Unidades mineras (MAPE) y su estado legal. Semáforo propio, distinto del de las muestras:
  //   al_dia (verde): contrato administrativo minero / licencia vigente · en_tramite (amarillo): solicitud o
  //   adecuación en curso ante la AJAM · ilegal (rojo): sin derecho minero, por denuncia, inspección o presunción.
  mape: {
    bsonType: 'object',
    required: ['id', 'nombre', 'estado_legal', 'base_estado', 'lat', 'lon'],
    properties: {
      id: { ...str, maxLength: 80 },
      nombre: str,
      tipo: { enum: ['cooperativa', 'empresa', 'unipersonal', 'sin_identificar'] },
      estado_legal: { enum: ['al_dia', 'en_tramite', 'ilegal'] },
      base_estado: { enum: ['registro_ajam', 'tramite_ajam', 'inspeccion_ajam', 'denuncia', 'presuncion_satelital', 'demostracion'] },
      fuente: str, verificado_en: str,
      lat: num, lon: num, area_ha: numONull,
      rio: str, municipio: str,
      mercurio: { enum: ['declarado', 'presunto', 'sin_mercurio', 'desconocido'] },
      huella: { bsonType: ['object', 'null'] },
      demostracion: bool,
    },
  },
  // Sitio piloto: Alcoche (Caranavi). Eje del río, comunidades, frentes y antecedentes.
  sitios: {
    bsonType: 'object',
    required: ['id', 'nombre', 'lat', 'lon'],
    properties: { id: str, nombre: str, municipio: str, lat: num, lon: num, eje: { bsonType: 'array' }, comunidades: { bsonType: 'array' } },
  },
  // Antecedentes publicados (estudios, normas, notas oficiales) que respaldan la elección del sitio.
  referencias: {
    bsonType: 'object',
    required: ['id', 'tipo', 'titulo', 'anio'],
    properties: { id: str, tipo: { enum: ['estudio', 'norma', 'institucional', 'prensa', 'datos'] }, titulo: str, anio: num, url: str, hallazgos: { bsonType: 'array' } },
  },
};

export const INDICES = {
  muestras: [[{ codigo: 1 }, { unique: true }], [{ fecha_iso: -1 }], [{ 'alerta.estado': 1 }], [{ sitio: 1 }], [{ demostracion: 1 }]],
  avisos: [[{ id: 1 }, { unique: true }], [{ zona_id: 1, actualizado_en: -1 }], [{ actualizado_en: -1 }]],
  bitacora: [[{ fecha: -1 }], [{ aviso_id: 1, fecha: -1 }]],
  zonas: [[{ id: 1 }, { unique: true }]],
  reportes: [[{ recibido_en: -1 }], [{ origen_hash: 1, recibido_en: -1 }]],
  mape: [[{ id: 1 }, { unique: true }], [{ estado_legal: 1 }]],
  sitios: [[{ id: 1 }, { unique: true }]],
  referencias: [[{ id: 1 }, { unique: true }]],
};

/** Crea las colecciones con su validador (o lo actualiza) y los índices. Idempotente. */
export async function inicializar(d, { forzar = false } = {}) {
  const existentes = new Set((await d.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const hechas = [];
  for (const [nombre, schema] of Object.entries(ESQUEMAS)) {
    const opts = { validator: { $jsonSchema: schema }, validationLevel: 'moderate', validationAction: 'error' };
    let validador = 'creado';
    if (!existentes.has(nombre)) await d.createCollection(nombre, opts);
    else if (forzar) {
      // collMod necesita el rol dbAdmin; con «Read and write to any database» puede fallar sin romper nada.
      try { await d.command({ collMod: nombre, ...opts }); validador = 'actualizado'; } catch (e) { validador = `sin actualizar (${e.codeName || e.message})`; }
    } else validador = 'existente';
    for (const [keys, o] of INDICES[nombre] || []) await d.collection(nombre).createIndex(keys, o || {});
    hechas.push({ coleccion: nombre, validador });
  }
  return hechas;
}
