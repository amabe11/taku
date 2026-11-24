// Lectura colorimétrica de tiras (TCS34725: cuentas R, G, B y C, sin unidad física).
// Cromaticidad normalizada r = R/(R+G+B) … y Δ cromático = 100 × distancia euclídea a una referencia
// (blanco de tira del día o, si no existe, el inicio de la misma corrida). Es una magnitud óptica
// adimensional: no es una concentración de Hg y no se convierte a mg/L sin una curva validada.

export function chroma(row) {
  if (!row || row.r == null || row.g == null || row.b == null) return null;
  const s = row.r + row.g + row.b;
  if (!(s > 0)) return null;
  return [row.r / s, row.g / s, row.b / s];
}

export const deltaOf = (c, ref) => (c && ref ? 100 * Math.hypot(c[0] - ref[0], c[1] - ref[1], c[2] - ref[2]) : null);

/** Mediana por componente de la cromaticidad de las filas válidas indicadas. */
export function medianChroma(rows) {
  const cs = rows.map(chroma).filter(Boolean);
  if (!cs.length) return null;
  const med = (i) => { const v = cs.map((c) => c[i]).sort((a, b) => a - b); const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
  return [med(0), med(1), med(2)];
}

/** Referencia para Δ: la del run (blanco del día) o los 5 primeros segundos válidos de la corrida. */
export function referenceFor(run, rows) {
  if (run?.referencia?.croma) return run.referencia.croma;
  return medianChroma(rows.filter(Boolean).slice(0, 5));
}

/** Filas enriquecidas con delta (para gráfica, tabla y CSV). */
export function derive(run, rows) {
  const ref = referenceFor(run, rows);
  return rows.map((r) => (r ? { ...r, delta: deltaOf(chroma(r), ref) } : null));
}

/** Δ final = mediana de los últimos 10 Δ válidos (lectura al final del tiempo de reacción). */
export function finalDelta(derived) {
  const v = derived.filter((r) => r && r.delta != null).slice(-10).map((r) => r.delta).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
