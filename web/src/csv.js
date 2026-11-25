// Exportación de datos y reportes (sección 7.3): CSV, GeoJSON y versión pública con zonas agregadas (7.7).
// CSV: UTF-8 con BOM (Excel), coma como separador, punto decimal, hora ISO.
import { estimado, controlesFallidos, zonaPublica, SEMAFORO, CERTEZA, ETIQUETA_LEGAL } from './model.js';

export const COLUMNS = [
  'codigo', 'matriz', 'cabezal', 'fecha_iso', 'lat', 'lon', 'responsable', 'cuenca',
  'c_ext_mg_l', 'v_ext_l', 'm_humeda_kg', 'm_tejido_kg', 'f_seco', 'recuperacion_r', 'c_estimada_mg_kg', 'base',
  'delta_e', 'pico_ua', 'semaforo', 'controles_fallidos', 'calibracion', 'firmware', 'certeza',
  'laboratorio', 'enviada_en', 'fecha_resultado', 'metodo_lab', 'resultado_lab_mg_kg', 'base_lab',
  'visibilidad', 'alerta', 'demostracion', 'etiqueta',
];

function cell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowOf(m) {
  const c = m.calculo || {}, l = m.laboratorio || {}, r = m.lecturas || {};
  return {
    codigo: m.codigo, matriz: m.matriz, cabezal: m.cabezal, fecha_iso: m.fecha_iso, lat: m.lat, lon: m.lon,
    responsable: m.responsable, cuenca: m.cuenca,
    c_ext_mg_l: c.c_ext_mg_l, v_ext_l: c.v_ext_l, m_humeda_kg: c.m_humeda_kg, m_tejido_kg: c.m_tejido_kg, f_seco: c.f_seco,
    recuperacion_r: c.recuperacion_r, c_estimada_mg_kg: estimado(m)?.toFixed(4), base: c.base,
    delta_e: r.delta_e, pico_ua: r.pico_ua, semaforo: m.semaforo, controles_fallidos: controlesFallidos(m).join(' | '),
    calibracion: m.calibracion, firmware: m.firmware, certeza: m.certeza,
    laboratorio: l.laboratorio, enviada_en: l.enviada_en, fecha_resultado: l.fecha_resultado, metodo_lab: l.metodo,
    resultado_lab_mg_kg: l.resultado_mg_kg, base_lab: l.base, visibilidad: m.visibilidad,
    alerta: m.alerta?.estado || '', demostracion: m.demostracion ? 'si' : 'no', etiqueta: ETIQUETA_LEGAL,
  };
}

export function buildCsv(list) {
  const lines = [COLUMNS.join(',')];
  for (const m of list) { const r = rowOf(m); lines.push(COLUMNS.map((k) => cell(r[k])).join(',')); }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Lee un CSV con la misma cabecera (exportado por la app modo técnico o por esta web). */
export function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; continue; }
    if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; } else if (ch === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x !== ''));
  const n = (v) => (v === '' || v == null ? null : Number(v));
  return body.map((r) => {
    const o = Object.fromEntries(head.map((k, i) => [k, r[i] ?? '']));
    return {
      codigo: o.codigo, matriz: o.matriz, cabezal: o.cabezal, fecha_iso: o.fecha_iso, lat: n(o.lat), lon: n(o.lon),
      responsable: o.responsable, cuenca: o.cuenca,
      calculo: { c_ext_mg_l: n(o.c_ext_mg_l), v_ext_l: n(o.v_ext_l), m_humeda_kg: n(o.m_humeda_kg), m_tejido_kg: n(o.m_tejido_kg), f_seco: n(o.f_seco), recuperacion_r: n(o.recuperacion_r), c_estimada_mg_kg: n(o.c_estimada_mg_kg), base: o.base },
      lecturas: { delta_e: n(o.delta_e), pico_ua: n(o.pico_ua) },
      semaforo: SEMAFORO[o.semaforo] ? o.semaforo : 'invalido', controles: {}, calibracion: o.calibracion, firmware: o.firmware,
      certeza: CERTEZA[o.certeza] ? o.certeza : 'cribado',
      laboratorio: { laboratorio: o.laboratorio || undefined, enviada_en: o.enviada_en || undefined, fecha_resultado: o.fecha_resultado || undefined, metodo: o.metodo_lab || undefined, resultado_mg_kg: n(o.resultado_lab_mg_kg), base: o.base_lab || undefined },
      visibilidad: o.visibilidad === 'publico' ? 'publico' : 'restringido', demostracion: o.demostracion === 'si',
    };
  }).filter((m) => m.codigo);
}

/** GeoJSON (formato geográfico para QGIS u otros SIG). `publico`: solo zonas agregadas y sin responsables. */
export function buildGeoJson(list, { publico = false } = {}) {
  const features = [];
  for (const m of list) {
    if (m.lat == null || m.lon == null) continue;
    if (publico && m.visibilidad !== 'publico') continue;
    const props = rowOf(m);
    let geometry;
    if (publico) {
      const z = zonaPublica(m.lat, m.lon);
      geometry = { type: 'Polygon', coordinates: [[[z.lon_min, z.lat_min], [z.lon_max, z.lat_min], [z.lon_max, z.lat_max], [z.lon_min, z.lat_max], [z.lon_min, z.lat_min]]] };
      for (const k of ['lat', 'lon', 'responsable', 'c_ext_mg_l', 'v_ext_l', 'm_humeda_kg', 'm_tejido_kg', 'f_seco', 'recuperacion_r', 'delta_e', 'pico_ua', 'firmware', 'laboratorio']) delete props[k];
      props.zona = 'Celda de 0,1° (~11 km): la ubicación exacta solo la ven las autoridades.';
    } else geometry = { type: 'Point', coordinates: [m.lon, m.lat] };
    features.push({ type: 'Feature', geometry, properties: props });
  }
  return JSON.stringify({ type: 'FeatureCollection', name: publico ? 'ahgora_publico' : 'ahgora_muestras', features }, null, 1);
}

export function downloadText(text, filename, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export const stamp = (demo) => `${new Date().toISOString().slice(0, 10)}${demo ? '_DEMOSTRACION' : ''}`;
