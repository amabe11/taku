// Datos de DEMOSTRACIÓN (sección 14: «Mapa con las muestras de la demo»). Todo va marcado
// `demostracion: true` y se muestra con el sello «Demostración». No son mediciones reales.
// Las comunidades y los frentes mineros son ficticios; el eje sigue de forma aproximada ríos de los
// Yungas hacia el Beni solo para dar forma al ejemplo. Ningún resultado se atribuye a un lugar real.
import { puntoEnEje, posicionEnEje, cSed, cPez, MATRICES, ALERTAS, alertaSugerida } from '../model.js';

export const DEMO_CUENCA = {
  id: 'demo-yungas-beni',
  nombre: 'Cuenca de demostración · Yungas → Beni',
  nota: 'Eje principal trazado a mano y de forma aproximada. Comunidades, población y frentes mineros son ficticios.',
  radio_km: 18,
  // [lon, lat] de aguas arriba hacia aguas abajo
  eje: [[-67.74, -16.21], [-67.63, -16.02], [-67.57, -15.84], [-67.55, -15.67], [-67.5, -15.53], [-67.42, -15.38], [-67.39, -15.08], [-67.47, -14.76], [-67.53, -14.45]],
  comunidades: [],
  frentes: [],
};
// Las posiciones se escriben sobre un eje nominal de 280 km y se escalan al largo real del trazado.
const ESCALA = posicionEnEje(DEMO_CUENCA.eje, ...DEMO_CUENCA.eje[0]).largo / 280;
// comunidades y frentes, colocados por distancia a lo largo del eje (km) y desplazamiento lateral (km)
const COM = [['Comunidad A', 38, 2.5, 640], ['Comunidad B', 96, -3, 1450], ['Comunidad C', 150, 2, 820], ['Comunidad D', 205, -2.5, 2300], ['Comunidad E', 262, 3, 5100]];
const FRE = [['Frente minero 1', 20, -4], ['Frente minero 2', 72, 5], ['Frente minero 3', 128, -5], ['Frente minero 4', 176, 4]];
for (const [nombre, km, lat, poblacion] of COM) {
  const [lon, la] = puntoEnEje(DEMO_CUENCA.eje, km * ESCALA, lat);
  DEMO_CUENCA.comunidades.push({ id: nombre, nombre: `${nombre} (ficticia)`, lon, lat: la, poblacion });
}
for (const [nombre, km, lat] of FRE) {
  const [lon, la] = puntoEnEje(DEMO_CUENCA.eje, km * ESCALA, lat);
  DEMO_CUENCA.frentes.push({ id: nombre, nombre: `${nombre} (ficticio)`, lon, lat: la });
}

// Criterio de cribado ficticio (6.3: corte bajo a propósito). Solo para generar la demostración.
export const DEMO_CRITERIO = {
  sedimento: { rojo: 0.5, amarillo: 0.25 }, cola: { rojo: 0.5, amarillo: 0.25 }, pescado: { rojo: 0.4, amarillo: 0.2 },
};
const RESPONSABLES = ['Técnico de campo 1', 'Técnico de campo 2', 'Técnico de campo 3'];
const BASE = Date.parse('2026-11-24T10:00:00-04:00');

// [n, matriz, km, lateral, días atrás, estimado mg/kg, certeza, resultado lab mg/kg, control fallido, alerta]
const T = [
  [1, 'cola', 18, -3.5, 21, 48, 'confirmado', 61, null, 'aprobada'],
  [2, 'sedimento', 24, -1, 21, 6.2, 'confirmado', 7.9, null, 'aprobada'],
  [3, 'sedimento', 30, 0.6, 20, 0.9, 'en_verificacion', null, null, 'aprobada'],
  [4, 'pescado', 42, 0.3, 19, 0.62, 'confirmado', 0.71, null, 'sin_revisar'],
  [5, 'sedimento', 55, 0.4, 18, 0.18, 'confirmado', 0.12, null, null],
  [6, 'cola', 71, 4.6, 16, 112, 'en_verificacion', null, null, 'aprobada'],
  [7, 'sedimento', 78, -0.5, 16, 2.4, 'cribado', null, null, 'sin_revisar'],
  [8, 'sedimento', 84, 0.8, 15, 0.31, 'cribado', null, null, null],
  [9, 'pescado', 98, -0.2, 14, 0.28, 'en_verificacion', null, null, null],
  [10, 'sedimento', 104, 0.3, 13, null, 'cribado', null, 'cloro_libre_cero', null],
  [11, 'sedimento', 112, -0.6, 12, 0.21, 'confirmado', 0.62, null, null], // falso negativo declarado
  [12, 'cola', 127, -4.4, 10, 35, 'cribado', null, null, 'sin_revisar'],
  [13, 'sedimento', 133, 0.5, 9, 1.6, 'cribado', null, null, 'sin_revisar'],
  [14, 'pescado', 148, 0.2, 8, 0.12, 'confirmado', 0.09, null, 'sin_revisar'],
  [15, 'sedimento', 158, -0.4, 7, 0.4, 'cribado', null, null, null],
  [16, 'sedimento', 170, 0.7, 6, 0.16, 'confirmado', 0.2, null, null],
  [17, 'cola', 176, 3.6, 5, 22, 'cribado', null, null, 'sin_revisar'],
  [18, 'sedimento', 188, -0.3, 4, null, 'cribado', null, 'referencia_blanca', null],
  [19, 'pescado', 214, 0.1, 3, 0.52, 'cribado', null, null, 'sin_revisar'],
  [20, 'sedimento', 228, 0.6, 2, 0.14, 'cribado', null, null, null],
  [21, 'sedimento', 246, -0.5, 1, 0.75, 'cribado', null, null, 'sin_revisar'],
  [22, 'pescado', 268, 0.2, 1, 0.18, 'cribado', null, null, null],
];

const ESPECIES = ['Pacú (no depredador, ficticio)', 'Surubí (depredador, ficticio)', 'Sábalo (no depredador, ficticio)'];
const round = (v, d = 3) => (v == null ? null : Number(v.toFixed(d)));

function semaforoDemo(matriz, est, falla) {
  if (falla) return 'invalido';
  const c = DEMO_CRITERIO[matriz];
  return est >= c.rojo ? 'rojo' : est >= c.amarillo ? 'amarillo' : 'verde';
}

export function demoMuestras() {
  return T.map(build).map((m) => {
    if (m.alerta?.estado === 'aprobada') {
      const tipo = alertaSugerida(m);
      m.alerta.tipo = tipo;
      m.alerta.mensaje = tipo === 'alerta_confirmada'
        ? 'Texto de demostración. En un caso real, las recomendaciones (consumo de pescado, grupos vulnerables) las redacta y aprueba la autoridad de salud.'
        : ALERTAS[tipo]?.texto || '';
    }
    return m;
  });
}

function build(row) {
  return [row].map(([n, matriz, km, lateral, diasAtras, est, certeza, lab, falla, alerta]) => {
    const [lon, lat] = puntoEnEje(DEMO_CUENCA.eje, km * ESCALA, lateral);
    const fecha = new Date(BASE - diasAtras * 86400000 - (n % 5) * 3600000);
    const cab = MATRICES[matriz].cabezal;
    const codigo = `DEMO-${cab}-${String(n).padStart(3, '0')}`;
    const semaforo = semaforoDemo(matriz, est ?? 0, falla);
    const R = 0.5; // recuperación supuesta (a determinar en la validación, Fase 1)
    let calculo, lecturas;
    if (cab === 'SED') {
      const f_seco = matriz === 'cola' ? 0.78 : 0.62;
      const c_ext = est != null ? (est * 0.005 * f_seco * R) / 0.005 : null;
      calculo = { c_ext_mg_l: round(c_ext), v_ext_l: 0.005, m_humeda_kg: 0.005, f_seco, recuperacion_r: R, base: 'seco' };
      calculo.c_estimada_mg_kg = round(cSed(calculo));
      const delta = c_ext != null ? Math.min(60, 4.2 * c_ext + 1.1) : null; // curva ficticia de demostración
      lecturas = {
        n_promedio: 10, ganancia: '4x', integracion_ms: 154,
        referencia_blanca: { r: 21480, g: 23310, b: 20120, c: 65000 },
        casilla_sin_usar: { r: 15820, g: 16950, b: 12730, c: 45210 },
        casilla_reaccionada: delta != null ? { r: Math.round(15820 - 95 * delta), g: Math.round(16950 - 160 * delta), b: Math.round(12730 - 40 * delta), c: Math.round(45210 - 290 * delta) } : null,
        blanco_matriz_delta: 0.6, delta_e: round(delta, 2),
      };
    } else {
      const m_tejido = 0.0008;
      const c_ext = est != null ? (est * m_tejido * R) / 0.01 : null;
      calculo = { c_ext_mg_l: round(c_ext, 4), v_ext_l: 0.01, m_tejido_kg: m_tejido, recuperacion_r: R, base: 'fresco' };
      calculo.c_estimada_mg_kg = round(cPez(calculo));
      lecturas = { tecnica: 'SW-ASV sobre oro', deposicion_s: 120, potencial_pico_v: 0.61, pico_ua: c_ext != null ? round(c_ext * 95, 2) : null, fuente: 'Voltamograma de datos publicados (rotulado así en la demostración)' };
    }
    const controles = cab === 'SED'
      ? { blanco_procedimiento: 'ok', cloro_libre_cero: 'ok', referencia_blanca: 'ok', blanco_matriz: 'restado', ph: 'ok' }
      : { patron_electrodo: 'ok', blanco_procedimiento: 'ok' };
    if (falla) controles[falla] = 'falla';
    const laboratorio = {};
    if (certeza !== 'cribado') {
      laboratorio.enviada_en = new Date(fecha.getTime() + 1.5 * 86400000).toISOString();
      laboratorio.laboratorio = 'Laboratorio aliado (demostración)';
    }
    if (certeza === 'confirmado') {
      Object.assign(laboratorio, {
        fecha_resultado: new Date(fecha.getTime() + (9 + (n % 4)) * 86400000).toISOString(),
        metodo: cab === 'SED' ? 'Analizador directo de mercurio (EPA 7473)' : 'CV-AAS, mercurio total',
        resultado_mg_kg: lab, base: cab === 'SED' ? 'seco' : 'fresco', incertidumbre: '± 10 %',
      });
    }
    return {
      codigo, matriz, cabezal: cab, fecha_iso: fecha.toISOString(), lat: round(lat, 5), lon: round(lon, 5),
      responsable: RESPONSABLES[n % 3], cuenca: DEMO_CUENCA.nombre,
      muestreo: cab === 'SED'
        ? { tipo: 'compuesta', porciones: 6 + (n % 5), profundidad_cm: 5, fino_pct: 20 + ((n * 7) % 45), observaciones: matriz === 'cola' ? 'Cola de amalgamación junto a la planta (ficticio).' : '' }
        : { especie: ESPECIES[n % 3], talla_cm: 28 + (n % 9) * 3, peso_g: 380 + (n % 7) * 90, porcion: 'músculo dorsal sin piel' },
      lecturas, calculo, semaforo, controles,
      calibracion: cab === 'SED' ? 'SED-CAL-demo-0.1' : 'PEZ-CAL-demo-0.1',
      firmware: 'ahgora-fw-demo', certeza, laboratorio,
      visibilidad: matriz === 'cola' ? 'restringido' : 'publico',
      alerta: alerta ? { estado: alerta, ...(alerta === 'aprobada' ? { aprobada_por: 'Responsable de demostración', fecha: new Date(fecha.getTime() + 2 * 86400000).toISOString() } : {}) } : null,
      demostracion: true, creada: fecha.getTime(),
    };
  })[0];
}
