// Simulador del lector Ahgora (ESP32) para la demostración y para probar el servidor.
// Produce registros con la misma forma que envía la app modo técnico (web/README.md, «Registro de muestra»):
//   · Cabezal SED: sensor TCS34725 (ganancia 4x, 154 ms, promedio de 10) sobre la referencia blanca, la casilla
//     sin usar y la casilla reaccionada de la tira. ΔE (CIELAB 1976) se calcula de los canales crudos y la
//     concentración del extracto sale de una curva de DEMOSTRACIÓN (ΔE = 4,2·C_ext + 1,1). Luego C_sed (4.6).
//   · Cabezal PEZ: voltametría de redisolución (onda cuadrada) sobre oro; pico de Hg cerca de +0,61 V con una
//     sensibilidad de demostración de 95 µA por mg/L, y la curva completa para graficar.
// Todo lo simulado lleva `demostracion: true`, firmware «ahgora-fw-sim» y origen «simulador».
import { cSed, cPez, MATRICES } from '../model.js';

/** PRNG determinista (mulberry32): la demostración es reproducible. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const round = (v, d = 3) => (v == null ? null : Number(Number(v).toFixed(d)));

// ------------------------------------------------------------------ color: RGBC crudo → CIELAB
const lin = (v) => Math.min(1, Math.max(0, v));
/** Canales crudos normalizados por la referencia blanca → L*a*b* (D65, aproximación lineal del sensor). */
export function labDe(px, blanco) {
  const r = lin(px.r / blanco.r), g = lin(px.g / blanco.g), b = lin(px.b / blanco.b);
  const X = 0.4124 * r + 0.3576 * g + 0.1805 * b, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X / 0.95047), fy = f(Y), fz = f(Z / 1.08883);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}
export function deltaE(p1, p2, blanco) {
  const a = labDe(p1, blanco), b = labDe(p2, blanco);
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
}
/** Color aproximado (CSS) de una lectura cruda, para dibujar la casilla en pantalla. */
export function cssDe(px, blanco) {
  const enc = (v) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  return `rgb(${enc(lin(px.r / blanco.r))} ${enc(lin(px.g / blanco.g))} ${enc(lin(px.b / blanco.b))})`;
}

export const CURVA_DEMO = { pendiente: 4.2, ordenada: 1.1, delta_max: 60, version: 'SED-CAL-demo-0.2' };
export const cExtDeDelta = (d) => Math.max(0, (d - CURVA_DEMO.ordenada) / CURVA_DEMO.pendiente);

const BLANCO = { r: 21480, g: 23310, b: 20120, c: 65000 };
const claro = (r, g, b) => Math.round(0.9 * r + g + 0.85 * b); // canal «clear» ≈ suma ponderada de R, G y B
const SIN_USAR = { r: 20350, g: 21110, b: 15420, c: claro(20350, 21110, 15420) }; // casilla amarillo pálido
const ABS = [0.18, 0.62, 1.0]; // la casilla vira a naranja-pardo: absorbe sobre todo azul y verde

function reaccionar(x) {
  const [kr, kg, kb] = ABS.map((a) => Math.exp(-a * x));
  const r = SIN_USAR.r * kr, g = SIN_USAR.g * kg, b = SIN_USAR.b * kb;
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b), c: claro(r, g, b) };
}
/** Lecturas TCS34725 para un ΔE objetivo (bisección sobre la intensidad de la reacción). */
export function lecturaSED(deltaObjetivo, rand = Math.random) {
  let lo = 0, hi = 6;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; (deltaE(SIN_USAR, reaccionar(mid), BLANCO) < deltaObjetivo ? (lo = mid) : (hi = mid)); }
  const ruido = (v) => Math.round(v * (1 + (rand() - 0.5) * 0.0008));
  const px = reaccionar((lo + hi) / 2);
  const reaccionada = { r: ruido(px.r), g: ruido(px.g), b: ruido(px.b), c: ruido(px.c) };
  return {
    n_promedio: 10, ganancia: '4x', integracion_ms: 154, sensor: 'TCS34725', direccion_i2c: '0x29',
    referencia_blanca: { ...BLANCO }, casilla_sin_usar: { ...SIN_USAR }, casilla_reaccionada: reaccionada,
    blanco_matriz_delta: round(0.4 + rand() * 0.5, 2),
    delta_e: round(deltaE(SIN_USAR, reaccionada, BLANCO), 2),
  };
}

/** Voltamograma de onda cuadrada (µA vs V) con el pico de Hg. */
export function lecturaPEZ(c_ext, rand = Math.random) {
  const pico = 95 * c_ext;
  const E0 = 0.605 + (rand() - 0.5) * 0.02;
  const curva = [];
  for (let k = 0; k <= 50; k++) {
    const E = 0.3 + k * 0.01;
    const i = 0.8 + 0.9 * (E - 0.3) + pico * Math.exp(-((E - E0) ** 2) / (2 * 0.022 ** 2)) + (rand() - 0.5) * 0.08;
    curva.push([round(E, 2), round(i, 3)]);
  }
  return { tecnica: 'SW-ASV sobre electrodo de oro', deposicion_s: 120, potencial_deposicion_v: -0.4, potencial_pico_v: round(E0, 3), pico_ua: round(pico, 2), curva };
}

// ------------------------------------------------------------------ registro completo
const R_DEMO = 0.5; // recuperación supuesta (se determina en la validación con el laboratorio aliado)
/**
 * Registro de muestra simulado.
 * @param {object} o { codigo, matriz, lat, lon, fecha, est (mg/kg objetivo, null si falló), falla, responsable, sitio, cuenca, muestreo, rand }
 */
export function registroSimulado(o) {
  const rand = o.rand || Math.random;
  const cab = MATRICES[o.matriz].cabezal;
  let calculo, lecturas;
  if (cab === 'SED') {
    const f_seco = o.matriz === 'cola' ? 0.78 : 0.62;
    const m = o.matriz === 'cola' ? 0.001 : 0.005; // las colas se analizan con 1 g para no saturar la tira
    const cObj = o.est != null ? (o.est * m * f_seco * R_DEMO) / 0.005 : 0;
    lecturas = lecturaSED(Math.min(CURVA_DEMO.delta_max, CURVA_DEMO.pendiente * cObj + CURVA_DEMO.ordenada), rand);
    const c_ext = o.est != null ? cExtDeDelta(lecturas.delta_e) : null;
    calculo = { c_ext_mg_l: round(c_ext, 3), v_ext_l: 0.005, m_humeda_kg: m, f_seco, recuperacion_r: R_DEMO, base: 'seco', curva: CURVA_DEMO.version };
    calculo.c_estimada_mg_kg = o.est != null ? round(cSed(calculo), 3) : null;
  } else {
    const m_tejido = 0.0008;
    const c_ext = o.est != null ? (o.est * m_tejido * R_DEMO) / 0.01 : 0;
    lecturas = lecturaPEZ(c_ext, rand);
    const cMed = o.est != null ? lecturas.pico_ua / 95 : null;
    calculo = { c_ext_mg_l: round(cMed, 4), v_ext_l: 0.01, m_tejido_kg: m_tejido, recuperacion_r: R_DEMO, base: 'fresco', curva: 'PEZ-CAL-demo-0.2' };
    calculo.c_estimada_mg_kg = o.est != null ? round(cPez(calculo), 3) : null;
  }
  const controles = cab === 'SED'
    ? { blanco_procedimiento: 'ok', cloro_libre_cero: 'ok', referencia_blanca: 'ok', blanco_matriz: 'restado', ph: 'ok' }
    : { patron_electrodo: 'ok', blanco_procedimiento: 'ok' };
  if (o.falla) controles[o.falla] = 'falla';
  const crit = CRITERIO_DEMO[o.matriz];
  const est = calculo.c_estimada_mg_kg;
  const semaforo = o.falla || est == null ? 'invalido' : est >= crit.rojo ? 'rojo' : est >= crit.amarillo ? 'amarillo' : 'verde';
  return {
    codigo: o.codigo, matriz: o.matriz, cabezal: cab, fecha_iso: new Date(o.fecha).toISOString(),
    lat: round(o.lat, 5), lon: round(o.lon, 5), sitio: o.sitio || 'alcoche', cuenca: o.cuenca || '',
    responsable: o.responsable || 'Técnico de campo 1', muestreo: o.muestreo || {},
    lecturas, calculo, semaforo, controles,
    calibracion: calculo.curva, firmware: 'ahgora-fw-sim-0.2', origen: o.origen || 'simulador',
    certeza: 'cribado', laboratorio: {}, visibilidad: o.matriz === 'cola' ? 'restringido' : 'publico', alerta: null,
    demostracion: true,
  };
}

// Criterio de cribado de DEMOSTRACIÓN (6.3: corte bajo a propósito). El criterio real se acuerda con el laboratorio.
export const CRITERIO_DEMO = {
  sedimento: { rojo: 0.5, amarillo: 0.25 }, cola: { rojo: 0.5, amarillo: 0.25 }, pescado: { rojo: 0.4, amarillo: 0.2 },
};

// Peces de la cuenca registrados en GBIF (ver «Sitio Alcoche»). Gremio trófico: los depredadores acumulan más
// mercurio (Codex: 1,0 mg/kg depredadores; 0,5 mg/kg los demás).
export const PECES = {
  'Pseudoplatystoma fasciatum': { comun: 'Surubí', gremio: 'depredador' },
  'Brachyplatystoma rousseauxii': { comun: 'Dorado', gremio: 'depredador' },
  'Zungaro zungaro': { comun: 'Muturo (bagre)', gremio: 'depredador' },
  'Pygocentrus nattereri': { comun: 'Palometa (piraña)', gremio: 'depredador' },
  'Prochilodus nigricans': { comun: 'Sábalo', gremio: 'detritívoro' },
  'Piaractus brachypomus': { comun: 'Pacú', gremio: 'omnívoro' },
  'Colossoma macropomum': { comun: 'Tambaquí', gremio: 'omnívoro' },
};
