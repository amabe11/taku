// Cola de priorización para laboratorio (datos.jpeg: evidencias y seguimiento → priorización).
// Ordena las muestras por la evidencia disponible para decidir qué confirmar primero.
// Es una sugerencia operativa: no es un resultado, no clasifica Hg y la decisión final es del equipo
// y del laboratorio. Las muestras con resultado de laboratorio ya registrado salen de la cola.
import { state } from './state.js';
import { lemnaObs, lemnaSummary } from './views/bioindicador.js';

const nf1 = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function priorityQueue() {
  const byId = new Map();
  for (const r of state.runs) {
    if (r.descartada || r.tipo_corrida !== 'muestra' || r.estado === 'captura') continue;
    const cur = byId.get(r.id_muestra);
    if (!cur || (r.creada || 0) > (cur.creada || 0)) byId.set(r.id_muestra, r); // última lectura de tira por muestra
  }
  for (const o of lemnaObs) if (!byId.has(o.id_muestra)) byId.set(o.id_muestra, null);
  const items = [];
  for (const [id, run] of byId) {
    if (run?.estado_hg === 'resultado_disponible') continue;
    const reasons = []; let score = 0;
    if (run?.estado_hg === 'prioridad_confirmacion') { score += 3; reasons.push(`Tira: Δ final ${nf1.format(run.delta_final ?? 0)} sobre el criterio, controles válidos (${run.run_id}).`); }
    else if (run?.estado_hg === 'indeterminado') { score += 2; reasons.push(`Tira: lectura indeterminada (${run.hg_tira?.motivo || 'controles o banda del criterio'}).`); }
    else if (run) reasons.push(`Tira: ${run.hg_tira?.motivo || 'Hg pendiente'}`);
    const lem = lemnaSummary(id, lemnaObs);
    if (lem) {
      if (lem.nivel === 'respuesta marcada') { score += 1.5; reasons.push(`Lemna: respuesta marcada (inhibición ${lem.inhibicion_pct != null ? nf1.format(lem.inhibicion_pct) + ' %' : 's/control'}, necrosis ${nf1.format(lem.obs.metricas.necrosis_pct)} %, día ${lem.obs.dia}).`); }
      else if (lem.nivel === 'respuesta leve') { score += 0.5; reasons.push(`Lemna: respuesta leve (día ${lem.obs.dia}).`); }
      else reasons.push('Lemna: sin respuesta aparente.');
    }
    const demo = !!(run?.demostracion || lem?.obs?.demostracion);
    items.push({ id_muestra: id, run, lemna: lem, score, reasons, demo,
      accion: score >= 3 ? 'Enviar primero a confirmación (método de referencia, p. ej. EPA 7473).' : score >= 2 ? 'Repetir la tira con controles nuevos o derivar según el procedimiento.' : score > 0 ? 'Seguir observando; confirmar si se suma otra evidencia.' : 'Sin evidencia que adelante su confirmación.' });
  }
  return items.sort((a, b) => b.score - a.score || a.id_muestra.localeCompare(b.id_muestra));
}
