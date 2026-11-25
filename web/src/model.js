// Modelo de Ahgora Web (guía «Ahgora — Descripción de la solución», secciones 2.4, 4.6, 5.3, 6, 7 y 9).
// Una muestra es el registro que el lector (ESP32) envía por Bluetooth a la app modo técnico y que la app
// sincroniza con el Servidor Ahgora. La web no mide: muestra, prioriza, traza y gestiona la confirmación.

// ------------------------------------------------------------------ catálogos
export const MATRICES = {
  sedimento: { label: 'Sedimento', cabezal: 'SED', unidad: 'mg/kg seco' },
  cola: { label: 'Cola minera', cabezal: 'SED', unidad: 'mg/kg seco' },
  pescado: { label: 'Pescado (músculo)', cabezal: 'PEZ', unidad: 'mg/kg fresco' },
};
export const CABEZALES = {
  SED: 'Cabezal SED · colorimétrico (extracción + tira + TCS34725)',
  PEZ: 'Cabezal PEZ · electroquímico (voltametría de redisolución sobre oro)',
};

// Semáforo (sección 2.4). El color nunca va solo: siempre icono + texto.
export const SEMAFORO = {
  rojo: { label: 'Prioridad alta', icon: 'sem_rojo', tone: 'fail', orden: 0,
    significa: 'La señal supera el criterio de cribado.',
    accion: 'Enviar primero al laboratorio y priorizar el sitio para intervención.' },
  amarillo: { label: 'Verificar', icon: 'sem_amarillo', tone: 'warn', orden: 1,
    significa: 'Señal cercana al umbral o con incertidumbre.',
    accion: 'Repetir la prueba y enviar al laboratorio.' },
  verde: { label: 'Prioridad baja', icon: 'sem_verde', tone: 'ok', orden: 2,
    significa: 'No se activa el criterio de cribado. No significa «libre de mercurio».',
    accion: 'Registrar y seguir el plan de muestreo de control.' },
  invalido: { label: 'Inválido', icon: 'sem_invalido', tone: 'neutral', orden: 3,
    significa: 'Falló un control (blanco, cloro residual, referencia blanca o turbidez del extracto).',
    accion: 'No clasificar: repetir la prueba.' },
};

// Regla de oro (7.1): «cribado» y «confirmado» nunca se mezclan.
export const CERTEZA = {
  cribado: { label: 'Cribado', etiqueta: 'CRIBADO — requiere confirmación', icon: 'flag' },
  en_verificacion: { label: 'En verificación', etiqueta: 'EN VERIFICACIÓN', icon: 'hourglass' },
  confirmado: { label: 'Confirmado', etiqueta: 'CONFIRMADO POR LABORATORIO', icon: 'doc_check' },
};

export const ETIQUETA_LEGAL = 'CRIBADO — NO ES DIAGNÓSTICO NI EVIDENCIA LEGAL';
export const MENSAJE_COMUNIDAD = '«Este resultado es una primera señal, no un diagnóstico ni una prueba legal. Un resultado rojo significa que la muestra debe confirmarse en laboratorio con prioridad. Un resultado verde no garantiza que no haya mercurio.»';

export const CONTROLES = {
  blanco_procedimiento: 'Blanco de procedimiento (arena limpia)',
  cloro_libre_cero: 'Cloro libre = 0 antes de leer',
  referencia_blanca: 'Referencia blanca dentro de rango',
  blanco_matriz: 'Blanco de matriz (color y turbidez del extracto)',
  ph: 'pH comprobado',
  patron_electrodo: 'Verificación diaria del electrodo con patrón',
};

// Umbrales de referencia (sección 4.7 y 5.1) para el panel de desempeño. Los criterios de cribado finales
// se definen con el laboratorio aliado y las autoridades, por separado para cada matriz (6.3).
export const UMBRALES_REFERENCIA = {
  sedimento: { valor: 0.486, fuente: 'CCME: nivel con efectos adversos probables (PEL), sedimento' },
  cola: { valor: 0.486, fuente: 'CCME PEL (referencia de sedimento aplicada a colas)' },
  pescado: { valor: 0.5, fuente: 'Codex CXS 193: 0,5 mg/kg peces no depredadores (1,0 depredadores)' },
};

// ------------------------------------------------------------------ cálculos (4.6 y 5.3)
/** C_sed (mg/kg seco) = C_ext × V_ext / (m_húmeda × f_seco × R). Devuelve null si falta algún término. */
export function cSed({ c_ext_mg_l, v_ext_l, m_humeda_kg, f_seco, recuperacion_r } = {}) {
  const t = [c_ext_mg_l, v_ext_l, m_humeda_kg, f_seco, recuperacion_r];
  if (t.some((v) => v == null || !Number.isFinite(Number(v))) || !(m_humeda_kg > 0 && f_seco > 0 && recuperacion_r > 0)) return null;
  return (c_ext_mg_l * v_ext_l) / (m_humeda_kg * f_seco * recuperacion_r);
}
/** C_pez (mg/kg) = C_ext × V_ext / (m_tejido × R). */
export function cPez({ c_ext_mg_l, v_ext_l, m_tejido_kg, recuperacion_r } = {}) {
  const t = [c_ext_mg_l, v_ext_l, m_tejido_kg, recuperacion_r];
  if (t.some((v) => v == null || !Number.isFinite(Number(v))) || !(m_tejido_kg > 0 && recuperacion_r > 0)) return null;
  return (c_ext_mg_l * v_ext_l) / (m_tejido_kg * recuperacion_r);
}
/** Valor estimado de cribado: el que trae el registro o, si falta, el recalculado con la fórmula. */
export function estimado(m) {
  const c = m.calculo || {};
  if (c.c_estimada_mg_kg != null) return Number(c.c_estimada_mg_kg);
  return m.matriz === 'pescado' ? cPez(c) : cSed(c);
}

/** Controles fallidos del registro (cualquier valor «falla»). */
export function controlesFallidos(m) {
  return Object.entries(m.controles || {}).filter(([, v]) => v === 'falla').map(([k]) => CONTROLES[k] || k);
}

// ------------------------------------------------------------------ cuenca (vista de cuenca, 7.3)
// Eje principal en [lon, lat] de aguas arriba hacia aguas abajo. La posición de cada punto es su
// distancia a lo largo del eje (km), tras proyectarlo sobre el tramo más cercano.
const R_TIERRA = 6371;
const rad = (d) => (d * Math.PI) / 180;
function toXY([lon, lat], lat0) { return [rad(lon) * Math.cos(rad(lat0)) * R_TIERRA, rad(lat) * R_TIERRA]; }

export function posicionEnEje(eje, lon, lat) {
  const lat0 = eje[0][1];
  const P = toXY([lon, lat], lat0);
  let best = { km: 0, dist: Infinity }, acc = 0;
  for (let i = 0; i < eje.length - 1; i++) {
    const A = toXY(eje[i], lat0), B = toXY(eje[i + 1], lat0);
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
    const t = Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / (L * L)));
    const d = Math.hypot(P[0] - (A[0] + t * dx), P[1] - (A[1] + t * dy));
    if (d < best.dist) best = { km: acc + t * L, dist: d };
    acc += L;
  }
  return { ...best, largo: acc };
}
/** Punto del eje a una distancia dada (km) y desplazado `lateral` km a la derecha del flujo. */
export function puntoEnEje(eje, km, lateral = 0) {
  const lat0 = eje[0][1];
  let acc = 0;
  for (let i = 0; i < eje.length - 1; i++) {
    const A = toXY(eje[i], lat0), B = toXY(eje[i + 1], lat0);
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
    if (acc + L >= km || i === eje.length - 2) {
      const t = Math.max(0, Math.min(1, (km - acc) / L));
      const x = A[0] + t * dx + (dy / L) * lateral, y = A[1] + t * dy - (dx / L) * lateral;
      return [(x / R_TIERRA / Math.cos(rad(lat0))) * (180 / Math.PI), (y / R_TIERRA) * (180 / Math.PI)];
    }
    acc += L;
  }
  return eje.at(-1);
}

/** Aguas arriba (posibles fuentes) y aguas abajo (posibles expuestos) de una muestra en su cuenca. */
export function contextoCuenca(m, cuenca) {
  if (!cuenca || m.lat == null) return null;
  const p = posicionEnEje(cuenca.eje, m.lon, m.lat);
  if (p.dist > (cuenca.radio_km ?? 15)) return { fuera: true, ...p };
  const pos = (x) => ({ ...x, ...posicionEnEje(cuenca.eje, x.lon, x.lat) });
  const comunidades = cuenca.comunidades.map(pos).filter((c) => c.km > p.km).sort((a, b) => a.km - b.km);
  const fuentes = cuenca.frentes.map(pos).filter((f) => f.km <= p.km).sort((a, b) => b.km - a.km);
  return { ...p, comunidades, fuentes, poblacion: comunidades.reduce((s, c) => s + (c.poblacion || 0), 0) };
}

// ------------------------------------------------------------------ cola de priorización (7.3)
// Reglas transparentes, en este orden: 1) semáforo (rojo → amarillo → verde), 2) población aguas abajo,
// 3) valor estimado frente al umbral de referencia de su matriz, 4) antigüedad (la más antigua primero).
// Sin índice combinado con el contexto satelital: solo se propondrá con datos validados (7.5).
export function colaPriorizacion(muestras, cuenca) {
  const enCola = [], enVerificacion = [], repetir = [];
  for (const m of muestras) {
    if (m.certeza === 'confirmado') continue;
    if (m.semaforo === 'invalido') { repetir.push(m); continue; }
    if (m.certeza === 'en_verificacion') { enVerificacion.push(m); continue; }
    const ctx = contextoCuenca(m, cuenca);
    const est = estimado(m);
    const ref = UMBRALES_REFERENCIA[m.matriz]?.valor;
    enCola.push({ m, ctx, poblacion: ctx?.poblacion ?? 0, ratio: est != null && ref ? est / ref : null });
  }
  enCola.sort((a, b) =>
    SEMAFORO[a.m.semaforo].orden - SEMAFORO[b.m.semaforo].orden
    || b.poblacion - a.poblacion
    || (b.ratio ?? -1) - (a.ratio ?? -1)
    || String(a.m.fecha_iso).localeCompare(String(b.m.fecha_iso)));
  return { enCola, enVerificacion, repetir };
}

// ------------------------------------------------------------------ indicadores (7.3, 9 y 12)
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const i = s.length >> 1; return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };
const dias = (a, b) => (new Date(b) - new Date(a)) / 86400000;

export function indicadores(muestras, umbrales = UMBRALES_REFERENCIA) {
  const porColor = Object.fromEntries(Object.keys(SEMAFORO).map((k) => [k, 0]));
  const porCerteza = Object.fromEntries(Object.keys(CERTEZA).map((k) => [k, 0]));
  const porMatriz = Object.fromEntries(Object.keys(MATRICES).map((k) => [k, { total: 0, ...Object.fromEntries(Object.keys(SEMAFORO).map((s) => [s, 0])) }]));
  for (const m of muestras) {
    porColor[m.semaforo] = (porColor[m.semaforo] || 0) + 1;
    porCerteza[m.certeza] = (porCerteza[m.certeza] || 0) + 1;
    const pm = porMatriz[m.matriz]; if (pm) { pm.total++; pm[m.semaforo]++; }
  }
  // Desempeño frente al laboratorio. Cribado positivo = rojo o amarillo (ambos van al laboratorio).
  // «Realmente preocupante» = resultado de laboratorio ≥ umbral de referencia de su matriz.
  const conf = muestras.filter((m) => m.certeza === 'confirmado' && m.laboratorio?.resultado_mg_kg != null && m.semaforo !== 'invalido');
  let vp = 0, fn = 0, fp = 0, vn = 0;
  const pares = [];
  for (const m of conf) {
    const lab = Number(m.laboratorio.resultado_mg_kg);
    const pos = m.semaforo === 'rojo' || m.semaforo === 'amarillo';
    const real = lab >= (umbrales[m.matriz]?.valor ?? Infinity);
    if (real && pos) vp++; else if (real) fn++; else if (pos) fp++; else vn++;
    const e = estimado(m); if (e != null && e > 0 && lab > 0) pares.push([Math.log10(e), Math.log10(lab)]);
  }
  const ratio = (a, b) => (b ? a / b : null);
  let r = null;
  if (pares.length >= 3) {
    const mx = pares.reduce((s, p) => s + p[0], 0) / pares.length, my = pares.reduce((s, p) => s + p[1], 0) / pares.length;
    let sxy = 0, sxx = 0, syy = 0;
    for (const [x, y] of pares) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
    r = sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }
  const envio = muestras.filter((m) => m.laboratorio?.enviada_en).map((m) => dias(m.fecha_iso, m.laboratorio.enviada_en));
  const resultado = conf.filter((m) => m.laboratorio?.fecha_resultado).map((m) => dias(m.fecha_iso, m.laboratorio.fecha_resultado));
  return {
    total: muestras.length, porColor, porCerteza, porMatriz,
    desempeno: {
      n: conf.length, vp, fn, fp, vn,
      sensibilidad: ratio(vp, vp + fn), especificidad: ratio(vn, vn + fp), tasaFN: ratio(fn, vp + fn),
      sinEnvio: ratio(vn, conf.length), // verdes que el laboratorio confirmó bajo el umbral
      correlacion: r, nCorrelacion: pares.length,
    },
    tiempos: { envioDias: median(envio), resultadoDias: median(resultado), nEnvio: envio.length, nResultado: resultado.length },
  };
}

// ------------------------------------------------------------------ alertas comunitarias (7.2)
export const ALERTAS = {
  aviso_cribado: {
    label: 'Aviso informativo (cribado rojo)',
    texto: 'Se tomaron muestras en tu zona y una necesita confirmación de laboratorio. No es un diagnóstico. Te avisaremos cuando haya resultado.',
    nota: 'Aviso, no alarma. Sin recomendaciones restrictivas.',
  },
  alerta_confirmada: {
    label: 'Alerta con recomendaciones (confirmado sobre el umbral)',
    texto: '',
    nota: 'Las recomendaciones de salud no las inventa Ahgora: pega el texto aprobado por la autoridad de salud.',
  },
  tranquilizador: {
    label: 'Mensaje tranquilizador (confirmado bajo el umbral)',
    texto: 'El laboratorio analizó la muestra de tu zona y el resultado está por debajo del umbral de referencia. El monitoreo continúa.',
    nota: 'Aclara que el monitoreo continúa.',
  },
};
/** Qué tipo de mensaje corresponde a la muestra según su certeza y resultado. null = nada que publicar. */
export function alertaSugerida(m, umbrales = UMBRALES_REFERENCIA) {
  if (m.certeza === 'confirmado' && m.laboratorio?.resultado_mg_kg != null) {
    return Number(m.laboratorio.resultado_mg_kg) >= (umbrales[m.matriz]?.valor ?? Infinity) ? 'alerta_confirmada' : 'tranquilizador';
  }
  if (m.semaforo === 'rojo') return 'aviso_cribado';
  return null;
}

/** Zona agregada para el público (7.7): celda de 0,1° (~11 km). Nunca la coordenada exacta. */
export function zonaPublica(lat, lon, paso = 0.1) {
  const f = (v) => Math.floor(v / paso) * paso;
  return { lat_min: +f(lat).toFixed(2), lon_min: +f(lon).toFixed(2), lat_max: +(f(lat) + paso).toFixed(2), lon_max: +(f(lon) + paso).toFixed(2) };
}
