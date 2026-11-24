// Estado de Hg a partir de la lectura colorimétrica de la tira (guía ORO-4.1, p. 5).
//   · Sin criterio operativo acordado, o si la corrida es un control (blanco / patrón) → «Hg pendiente».
//   · Control fallido, corrida inválida o interrumpida, o Δ dentro de la banda del criterio → «Hg indeterminado».
//   · Δ por encima del criterio + banda, con controles válidos → «Prioridad de confirmación».
//   · Δ por debajo del criterio → sigue «Hg pendiente» (una lectura baja de cribado no descarta Hg).
// «Resultado disponible» solo lo fija un informe de laboratorio registrado en la vista Laboratorio.
import { controlState } from './components/badges.js';

const fmt = (v) => (v == null ? '—' : v.toFixed(1).replace('.', ','));

export function evaluateStrip(run, summary, criterio) {
  const base = { origen: 'lectura_tira', delta_final: summary.deltaFinal, delta_max: summary.deltaMax, criterio: criterio?.activo ? { ...criterio } : null, evaluado: new Date().toISOString() };
  if (run.tipo_corrida !== 'muestra') return { ...base, estado: 'pendiente', motivo: 'Corrida de control (blanco o patrón): no evalúa Hg en la muestra.' };
  if (!criterio?.activo || criterio.umbral == null) return { ...base, estado: 'pendiente', motivo: 'Sin criterio operativo acordado para la tira: el estado de Hg permanece pendiente.' };
  const ctl = controlState(run);
  if (run.estado !== 'completa' || ctl.ok === false) {
    return { ...base, estado: 'indeterminado', motivo: `Control o adquisición no válidos (${run.estado === 'completa' ? ctl.text : run.motivos?.[0] || run.estado}). Repetir o derivar según el procedimiento.` };
  }
  if (summary.deltaFinal == null) return { ...base, estado: 'indeterminado', motivo: 'Sin lectura óptica final válida.' };
  const lo = criterio.umbral - (criterio.banda || 0), hi = criterio.umbral + (criterio.banda || 0);
  if (summary.deltaFinal >= lo && summary.deltaFinal <= hi) {
    return { ...base, estado: 'indeterminado', motivo: `Δ final ${fmt(summary.deltaFinal)} dentro de la banda del criterio (${fmt(lo)}–${fmt(hi)}).` };
  }
  if (summary.deltaFinal > hi) {
    return { ...base, estado: 'prioridad_confirmacion', motivo: `Δ final ${fmt(summary.deltaFinal)} por encima del criterio (${fmt(criterio.umbral)} ± ${fmt(criterio.banda || 0)}) con controles válidos. Confirmar en laboratorio.` };
  }
  return { ...base, estado: 'pendiente', motivo: `Δ final ${fmt(summary.deltaFinal)} por debajo del criterio. Una lectura baja de cribado no descarta Hg.` };
}
