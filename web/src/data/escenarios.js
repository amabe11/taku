// Escenarios del «Simulador de datos»: generan lotes de muestras SIMULADAS sobre el sitio real (Alcoche, río
// Coroico → Kaka) con el mismo generador del lector ESP32 (simulacion.js). Todo sale `demostracion: true`.
// Los niveles siguen el orden de magnitud de la cuenca (ver data/demo.js): sedimento de fondo bajo, más alto junto
// a los frentes (km 60–75) y aguas abajo de Guanay (km > 108); colas muy altas; depredadores sobre no depredadores.
import { puntoEnEje } from '../model.js';
import { CUENCA_ALCOCHE, GEO, SITIO } from './alcoche.js';
import { registroSimulado, rng, PECES } from './simulacion.js';

export const KM_MIN = 40;
export const KM_MAX = 150;
export const NIVELES = { 0.35: 'Bajo (línea base)', 1: 'Medio (como la campaña)', 2.2: 'Alto (frente activo)', 4: 'Muy alto (derrame)' };

const BASE = { n: 20, matrices: ['sedimento', 'cola', 'pescado'], km: [50, 145], nivel: 1, fallas: 7, lab: 20, dias: 20 };

export const ESCENARIOS = [
  { id: 'campana', nombre: 'Campaña Alcoche', texto: 'Las 25 muestras preparadas para la demostración, con resultados de laboratorio y avisos ya aprobados.', fijo: true },
  { id: 'base', nombre: 'Línea base · río limpio', texto: 'Valores de fondo en todo el tramo: casi todo verde. Algún pez depredador puede salir alto: acumula mercurio aun lejos de la minería.',
    p: { ...BASE, n: 18, matrices: ['sedimento', 'pescado'], km: [40, 150], nivel: 0.35, fallas: 5, lab: 25, dias: 30 } },
  { id: 'frente', nombre: 'Frente minero activo', texto: 'Muestreo concentrado entre Santa Fe y Alcoche (km 56–78), junto a los frentes nuevos: muchas muestras en rojo.',
    p: { ...BASE, n: 24, km: [56, 78], nivel: 2.2, fallas: 8, lab: 15, dias: 14 } },
  { id: 'abajo', nombre: 'Aguas abajo de Guanay', texto: 'El río Kaka recibe lo de varios frentes: sedimento alto y peces depredadores sobre el límite.',
    p: { ...BASE, n: 20, km: [105, 148], nivel: 1.8, lab: 20, dias: 21 } },
  { id: 'peces', nombre: 'Solo peces (cabezal PEZ)', texto: 'Campaña de pescado en todo el tramo: depredadores (surubí, dorado) frente a sábalo o pacú.',
    p: { ...BASE, n: 18, matrices: ['pescado'], km: [50, 145], nivel: 1, fallas: 5, lab: 30, dias: 30 } },
  { id: 'custom', nombre: 'Personalizado', texto: 'Empieza desde la campaña media y ajusta cada valor.', p: { ...BASE } },
];

function lugar(lon, lat) {
  const l = GEO.localidades.map((x) => ({ x, d: Math.hypot((x.lon - lon) * 107, (x.lat - lat) * 110.6) })).sort((a, b) => a.d - b.d)[0];
  return l.d < 4 ? `cerca de ${l.x.nombre}` : `a ${Math.round(l.d)} km de ${l.x.nombre}`;
}
/** Localidad más cercana a un km del eje (para rotular el tramo elegido). */
export function lugarDeKm(km) {
  const [lon, lat] = puntoEnEje(CUENCA_ALCOCHE.eje, km, 0);
  return GEO.localidades.map((x) => ({ x, d: Math.hypot((x.lon - lon) * 107, (x.lat - lat) * 110.6) })).sort((a, b) => a.d - b.d)[0].x.nombre;
}

/**
 * Lote de muestras simuladas.
 * @param {object} p { n, matrices[], km:[desde,hasta], nivel, fallas (%), lab (% con laboratorio), dias, semilla, escenario }
 */
export function generarLote(p) {
  const rand = rng(p.semilla >>> 0 || 1);
  const matrices = p.matrices?.length ? p.matrices : ['sedimento'];
  const [k0, k1] = [Math.min(...p.km), Math.max(...p.km)];
  const especies = Object.keys(PECES);
  const tag = `${(p.escenario || 'sim').slice(0, 3).toUpperCase()}${(p.semilla >>> 0).toString(36).toUpperCase().slice(-4)}`;
  const ahora = Date.now();
  const out = [];
  for (let i = 0; i < p.n; i++) {
    const matriz = matrices[Math.floor(rand() * matrices.length)];
    const km = k0 + rand() * (k1 - k0);
    const [lon, lat] = puntoEnEje(CUENCA_ALCOCHE.eje, km, matriz === 'cola' ? 0.3 + rand() : rand() * 0.2);
    const factor = (km > 60 && km < 75) || km > 108 ? 2.2 : 1;
    const especie = especies[Math.floor(rand() * especies.length)];
    const pez = PECES[especie];
    const falla = rand() * 100 < p.fallas;
    const est = falla ? null
      : matriz === 'cola' ? (5 + rand() * 40) * (0.5 + 0.5 * p.nivel)
        : matriz === 'pescado' ? (pez.gremio === 'depredador' ? 0.25 + rand() * 0.6 : 0.04 + rand() * 0.15) * (0.4 + 0.6 * p.nivel)
          : (0.06 + rand() * 0.25) * factor * p.nivel;
    const cab = matriz === 'pescado' ? 'PEZ' : 'SED';
    const fecha = ahora - rand() * p.dias * 86400000;
    const m = registroSimulado({
      codigo: `SIM-${tag}-${cab}-${String(i + 1).padStart(3, '0')}`, matriz, lat, lon, fecha, est, rand,
      falla: falla ? (cab === 'SED' ? 'cloro_libre_cero' : 'patron_electrodo') : null,
      responsable: `Técnico de campo ${1 + Math.floor(rand() * 2)}`, sitio: SITIO.id, cuenca: CUENCA_ALCOCHE.nombre, origen: 'simulador-web',
      muestreo: cab === 'SED'
        ? { tipo: 'compuesta', porciones: 5 + Math.floor(rand() * 5), profundidad_cm: 5, fino_pct: Math.round(20 + rand() * 40), lugar: lugar(lon, lat),
          observaciones: matriz === 'cola' ? 'Cola de lavado junto a un frente (simulado).' : '' }
        : { especie, nombre_comun: pez.comun, gremio: pez.gremio, talla_cm: Math.round(28 + rand() * 30), porcion: 'músculo dorsal sin piel', lugar: lugar(lon, lat) },
    });
    m.creada = fecha;
    // Laboratorio: una parte confirmada (con su resultado) y otra en verificación.
    const r = rand() * 100;
    if (!falla && r < p.lab) {
      const confirmada = r < p.lab * 0.6;
      m.certeza = confirmada ? 'confirmado' : 'en_verificacion';
      m.laboratorio = { laboratorio: 'Laboratorio aliado (simulado)', enviada_en: new Date(fecha + 1.5 * 86400000).toISOString() };
      if (confirmada && m.calculo?.c_estimada_mg_kg != null) {
        Object.assign(m.laboratorio, {
          fecha_resultado: new Date(Math.min(ahora, fecha + 9 * 86400000)).toISOString(),
          metodo: cab === 'SED' ? 'Analizador directo de mercurio (EPA 7473)' : 'CV-AAS, mercurio total',
          resultado_mg_kg: Number((m.calculo.c_estimada_mg_kg * (0.8 + rand() * 0.45)).toFixed(3)), base: cab === 'SED' ? 'seco' : 'fresco', incertidumbre: '± 10 %',
        });
      }
    }
    // Las rojas quedan esperando que una autoridad revise el aviso (vista «Avisos comunitarios»).
    if (m.semaforo === 'rojo') m.alerta = { estado: 'sin_revisar' };
    out.push(m);
  }
  return out.sort((a, b) => b.fecha_iso.localeCompare(a.fecha_iso));
}
