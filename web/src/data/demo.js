// SIMULACIÓN sobre el sitio piloto real (Alcoche, río Coroico). El lugar, los ríos, las comunidades y las
// huellas mineras son reales (OpenStreetMap, Amazon Mining Watch). Las MUESTRAS, sus lecturas, los resultados de
// laboratorio y el registro de estado legal de las unidades mineras son SIMULADOS: van marcados
// `demostracion: true` y se muestran con el sello «Demostración». Ninguna cifra de mercurio es una medición.
// Los valores siguen el orden de magnitud de la literatura de la cuenca (ver «Sitio Alcoche»): sedimento de
// fondo bajo aguas arriba, más alto junto a los frentes nuevos y en el Kaka; colas muy altas; peces depredadores
// por encima de los no depredadores.
import { puntoEnEje, posicionEnEje, ALERTAS, alertaSugerida } from '../model.js';
import { CUENCA_ALCOCHE, GEO, SITIO } from './alcoche.js';
import { registroSimulado, rng, CRITERIO_DEMO, PECES } from './simulacion.js';

export const DEMO_CUENCA = CUENCA_ALCOCHE;
export const DEMO_CRITERIO = CRITERIO_DEMO;
const BASE = Date.parse('2026-11-25T09:00:00-04:00');
const RESPONSABLES = ['Técnico de campo 1', 'Técnico de campo 2'];

// [n, matriz, km en el eje, desplazamiento lateral km, días atrás, estimado mg/kg (objetivo), certeza, laboratorio mg/kg, control fallido, alerta, especie]
const T = [
  [1, 'sedimento', 42, 0.1, 20, 0.06, 'confirmado', 0.05, null, null],
  [2, 'sedimento', 50, 0.15, 20, 0.08, 'cribado', null, null, null],
  [3, 'sedimento', 57, 0.1, 19, 0.19, 'cribado', null, null, null],
  [4, 'cola', 61.5, 1.4, 18, 18.5, 'en_verificacion', null, null, null],
  [5, 'sedimento', 62.5, 0.05, 18, 0.44, 'en_verificacion', null, null, 'aprobada'],
  [6, 'cola', 69.2, 0.35, 16, 42, 'confirmado', 51, null, null],
  [7, 'sedimento', 68.3, 0.1, 16, 0.38, 'cribado', null, null, 'sin_revisar'],
  [8, 'sedimento', 70, 0.1, 15, 0.92, 'confirmado', 1.08, null, 'aprobada'],
  [9, 'pescado', 68.8, 0, 15, 0.81, 'en_verificacion', null, null, 'aprobada', 'Pseudoplatystoma fasciatum'],
  [10, 'pescado', 68.8, 0, 15, 0.12, 'cribado', null, null, null, 'Prochilodus nigricans'],
  [11, 'sedimento', 71.5, 0.2, 14, null, 'cribado', null, 'cloro_libre_cero', null],
  [12, 'sedimento', 73.5, 0.1, 13, 0.21, 'confirmado', 0.58, null, null], // falso negativo declarado
  [13, 'cola', 73.2, 0.6, 13, 9.5, 'cribado', null, null, null],
  [14, 'sedimento', 80, 0.1, 12, 0.62, 'cribado', null, null, 'sin_revisar'],
  [15, 'sedimento', 89, 0.1, 10, 0.33, 'cribado', null, null, null],
  [16, 'pescado', 95, 0, 9, 0.27, 'cribado', null, null, null, 'Pygocentrus nattereri'],
  [17, 'sedimento', 108, 0.2, 8, 1.35, 'en_verificacion', null, null, 'aprobada'],
  [18, 'sedimento', 113.5, 0.1, 6, 0.7, 'cribado', null, null, 'sin_revisar'],
  [19, 'pescado', 114, 0, 6, 1.12, 'cribado', null, null, 'sin_revisar', 'Brachyplatystoma rousseauxii'],
  [20, 'pescado', 114, 0, 6, 0.08, 'confirmado', 0.06, null, 'aprobada', 'Piaractus brachypomus'],
  [21, 'sedimento', 121, 0.1, 4, null, 'cribado', null, 'referencia_blanca', null],
  [22, 'sedimento', 126, 0.1, 3, 0.48, 'cribado', null, null, null],
  [23, 'cola', 140, 0.5, 2, 27, 'cribado', null, null, null],
  [24, 'sedimento', 144, 0.1, 1, 0.55, 'cribado', null, null, 'sin_revisar'],
  [25, 'pescado', 144, 0, 1, 0.46, 'cribado', null, null, null, 'Zungaro zungaro'],
];

function lugar(lon, lat) {
  const l = GEO.localidades.map((x) => ({ x, d: Math.hypot((x.lon - lon) * 107, (x.lat - lat) * 110.6) })).sort((a, b) => a.d - b.d)[0];
  return l && l.d < 4 ? `cerca de ${l.x.nombre}` : `a ${Math.round(l.d)} km de ${l.x.nombre}`;
}

export function demoMuestras() {
  const rand = rng(2026);
  return T.map(([n, matriz, km, lateral, dias, est, certeza, lab, falla, alerta, especie]) => {
    const [lon, lat] = puntoEnEje(DEMO_CUENCA.eje, km, lateral);
    const fecha = BASE - dias * 86400000 - (n % 5) * 3600000;
    const cab = matriz === 'pescado' ? 'PEZ' : 'SED';
    const pez = especie ? PECES[especie] : null;
    const m = registroSimulado({
      codigo: `SIM-${cab}-${String(n).padStart(3, '0')}`, matriz, lat, lon, fecha, est, falla, rand,
      responsable: RESPONSABLES[n % 2], sitio: SITIO.id, cuenca: DEMO_CUENCA.nombre,
      muestreo: cab === 'SED'
        ? { tipo: 'compuesta', porciones: 6 + (n % 5), profundidad_cm: 5, fino_pct: 25 + ((n * 7) % 40), lugar: lugar(lon, lat),
          observaciones: matriz === 'cola' ? 'Cola de lavado junto a un frente activo (simulado).' : '' }
        : { especie, nombre_comun: pez.comun, gremio: pez.gremio, talla_cm: 30 + (n % 9) * 4, peso_g: 420 + (n % 7) * 110, porcion: 'músculo dorsal sin piel', lugar: lugar(lon, lat) },
    });
    m.certeza = certeza;
    m.creada = fecha;
    if (certeza !== 'cribado') m.laboratorio = { laboratorio: 'Laboratorio aliado (simulado)', enviada_en: new Date(fecha + 1.5 * 86400000).toISOString() };
    if (certeza === 'confirmado') {
      Object.assign(m.laboratorio, {
        fecha_resultado: new Date(fecha + (9 + (n % 4)) * 86400000).toISOString(),
        metodo: cab === 'SED' ? 'Analizador directo de mercurio (EPA 7473)' : 'CV-AAS, mercurio total',
        resultado_mg_kg: lab, base: cab === 'SED' ? 'seco' : 'fresco', incertidumbre: '± 10 %',
      });
    }
    if (alerta) {
      m.alerta = { estado: alerta };
      if (alerta === 'aprobada') {
        const tipo = alertaSugerida(m);
        Object.assign(m.alerta, {
          tipo, aprobada_por: 'Responsable de demostración', entidad: 'Equipo Ahgora (demostración)', fecha: new Date(fecha + 2 * 86400000).toISOString(),
          mensaje: tipo === 'alerta_confirmada'
            ? 'Texto de demostración. En un caso real, las recomendaciones (consumo de pescado, grupos vulnerables) las redacta y aprueba la autoridad de salud.'
            : ALERTAS[tipo]?.texto || '',
        });
      }
    }
    return m;
  });
}

// ------------------------------------------------------------------ registro MAPE de demostración
// Unidades mineras = grupos reales de huellas (Amazon Mining Watch). El NOMBRE y el ESTADO LEGAL de las unidades
// marcadas «ficticia» son inventados para mostrar la vista. Solo dos estados tienen respaldo público:
//   · el frente de Alcoche (inspección de la AJAM, oct. 2025) y el de Santa Fe (denuncia en el Concejo, oct. 2026).
// La legalidad la determina la AJAM: aquí no se acusa a nadie con nombre.
const FICTICIAS = [
  ['Cooperativa Aurífera Demo «Río de Oro» (ficticia)', 'al_dia'],
  ['Cooperativa Aurífera Demo «Kaka» (ficticia)', 'al_dia'],
  ['Cooperativa Aurífera Demo «Nueva Esperanza» (ficticia)', 'en_tramite'],
  ['Cooperativa Aurífera Demo «San Juan» (ficticia)', 'al_dia'],
  ['Cooperativa Aurífera Demo «Los Andes» (ficticia)', 'en_tramite'],
  ['Empresa minera Demo «Teoponte» (ficticia)', 'al_dia'],
  ['Cooperativa Aurífera Demo «Mapiri» (ficticia)', 'en_tramite'],
];
const BASE_LEGAL = {
  al_dia: { base_estado: 'demostracion', fuente: 'Estado ficticio. En operación real: contrato administrativo minero y licencia ambiental vigentes (AJAM, catastro minero).' },
  en_tramite: { base_estado: 'demostracion', fuente: 'Estado ficticio. En operación real: solicitud o adecuación en trámite ante la AJAM.' },
};

export function demoMape() {
  const frentes = GEO.frentes.map((f, i) => ({ ...f, i, p: posicionEnEje(GEO.eje, f.lon, f.lat) }));
  const out = [];
  const usados = new Set();
  const unidad = (f, extra) => {
    usados.add(f.i);
    return {
      id: `mape-amw-${f.i}`, lat: f.lat, lon: f.lon, area_ha: Math.round(f.parches * 23 * 0.35),
      rio: f.p.dist < 3 ? (f.p.km < 108 ? 'Río Coroico' : 'Río Kaka') : 'Afluente',
      municipio: f.p.km < 100 && f.lat < -15.6 ? 'Caranavi' : 'Por verificar',
      huella: { parches: f.parches, desde: f.desde, hasta: f.hasta, fuente: 'Amazon Mining Watch' },
      mercurio: 'presunto', demostracion: true, ...extra,
    };
  };
  // Respaldo público: frente de Alcoche y frente de Santa Fe (los más grandes en cada tramo).
  const alcoche = frentes.filter((f) => f.p.dist < 2 && f.p.km > 66 && f.p.km < 72).sort((a, b) => b.parches - a.parches)[0];
  if (alcoche) out.push(unidad(alcoche, {
    nombre: 'Frente de Alcoche · ribera del Coroico (operador sin identificar)', tipo: 'sin_identificar', estado_legal: 'ilegal', base_estado: 'inspeccion_ajam',
    fuente: 'AJAM, inspección de octubre de 2025 cerca de Alcoche: maquinaria pesada y lavado a gran escala en la ribera del Coroico (citada por ANA).', verificado_en: '2025-10',
  }));
  const santaFe = frentes.filter((f) => f.p.km > 58 && f.p.km < 64 && f.p.dist < 4).sort((a, b) => b.parches - a.parches);
  santaFe.slice(0, 2).forEach((f, k) => out.push(unidad(f, {
    nombre: `Frente de Santa Fe ${k + 1} (operador sin identificar)`, tipo: 'sin_identificar', estado_legal: 'ilegal', base_estado: 'denuncia',
    fuente: 'Denuncia en el Concejo Municipal de Caranavi (El Diario, 16 oct 2026): más de 60 operaciones presuntamente ilegales en Alcoche y Santa Fe. Sin verificación independiente.', verificado_en: '2026-10',
  })));
  // Huellas nuevas (desde 2023) en el tramo Caranavi–Guanay, fuera del registro: presunción, no acusación.
  frentes.filter((f) => !usados.has(f.i) && f.desde >= 2023 && f.p.km > 55 && f.p.km < 100 && f.p.dist < 3 && f.parches >= 3).forEach((f) => out.push(unidad(f, {
    nombre: `Huella nueva km ${Math.round(f.p.km)} del Coroico (sin registro)`, tipo: 'sin_identificar', estado_legal: 'ilegal', base_estado: 'presuncion_satelital',
    fuente: `Huella detectada desde ${f.desde} en el municipio de Caranavi (ley municipal de cero actividad minera, 2026) y ausente del registro cargado. Presunción para verificar con la AJAM.`,
  })));
  // Frentes antiguos y grandes aguas abajo (Guanay–Mayaya): cooperativas ficticias con estado al día o en trámite.
  frentes.filter((f) => !usados.has(f.i) && f.parches >= 10 && f.desde <= 2019).slice(0, FICTICIAS.length).forEach((f, k) => {
    const [nombre, estado] = FICTICIAS[k];
    out.push(unidad(f, { nombre, tipo: nombre.startsWith('Empresa') ? 'empresa' : 'cooperativa', estado_legal: estado, ...BASE_LEGAL[estado], mercurio: 'declarado' }));
  });
  return out;
}
