// Reportes comunitarios voluntarios que envía Ahgora Comunidad (guía, sección 06). Orientan dónde tomar
// muestras: no son avisos, no se publican y no son evidencia. Solo traen la zona agregada de 0,1°.
// Demostración: reportes ficticios junto a las comunidades de la cuenca de ejemplo.
// Servidor: GET /api/reportes con la clave del equipo.
import { state } from '../state.js';
import { DEMO_CUENCA } from './demo.js';
import { zonaPublica } from '../model.js';
import { pullReportes } from '../cloud.js';

export const TIPOS_REPORTE = {
  agua_turbia: { label: 'Agua turbia o de color extraño', icon: 'drop' },
  peces: { label: 'Peces muertos o enfermos', icon: 'fish' },
  actividad_minera: { label: 'Actividad minera nueva', icon: 'flag' },
  residuos: { label: 'Residuos o derrame en el río', icon: 'reports' },
  otro: { label: 'Otra cosa', icon: 'question' },
};

export const zonaKey = (z) => (z ? `${Number(z.lat_min).toFixed(1)}|${Number(z.lon_min).toFixed(1)}` : 'sin_zona');

export function demoReportes(ahora = Date.now()) {
  const dia = 86400000;
  const [a, b, c, d, e] = DEMO_CUENCA.comunidades;
  const f4 = DEMO_CUENCA.frentes[3];
  const z = (p, dLat = 0, dLon = 0) => zonaPublica(p.lat + dLat, p.lon + dLon);
  const filas = [
    ['peces', 'Varios sábalos flotando cerca del puerto, sin heridas visibles.', z(b), 1],
    ['agua_turbia', 'El agua bajó color café oscuro durante dos días.', z(b), 3],
    ['actividad_minera', 'Llegaron dos dragas nuevas río arriba de la comunidad.', z(f4, 0.12, 0.08), 2],
    ['actividad_minera', '', z(f4, 0.12, 0.08), 6],
    ['residuos', 'Bolsas y bidones en la orilla, cerca de la planta.', z(a), 9],
    ['agua_turbia', 'Turbio después de la lluvia, más de lo normal.', z(d), 12],
    ['peces', 'Pescadores dicen que el surubí sale con manchas.', z(e), 20],
    ['otro', 'Olor fuerte en la quebrada que baja al río.', z(c, -0.1, 0.1), 34],
  ];
  return filas.map(([tipo, descripcion, zona, hace], i) => ({
    tipo, descripcion, zona, estado: 'en_revision', origen: 'ahgora-comunidad-android', demostracion: true,
    creado_en: new Date(ahora - hace * dia - i * 3600000).toISOString(),
    recibido_en: new Date(ahora - hace * dia - i * 3600000 + 120000).toISOString(),
  }));
}

/** Lista de reportes según el origen de datos activo. */
export async function loadReportes() {
  if (state.mode === 'demo') return demoReportes();
  return pullReportes();
}
