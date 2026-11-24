// Exportación CSV offline. UTF-8 con BOM (Excel), coma como separador, punto decimal, hora ISO.
// Siempre 121 filas (seq 0..120): las faltantes o inválidas quedan vacías y con motivo.
// Sensores: DS18B20 (temp_c, °C) y lector de tiras TCS34725 (cuentas r, g, b, c, sin unidad física).
// delta_cromatico es adimensional (×100) respecto a la referencia indicada: no es una concentración.
import { N_ROWS } from './state.js';
import { derive } from './lib/optics.js';

export const COLUMNS = [
  'run_id', 'id_muestra', 'id_caso', 'fecha_iso', 'seq', 't_seg', 'temp_c', 'r', 'g', 'b', 'c', 'delta_cromatico',
  'volumen_ml', 'config_id', 'estado', 'motivo', 'origen', 'estado_hg',
  // metadatos de la ficha
  'demostracion', 'estacion', 'build', 'matriz', 'tipo_corrida', 'lote_tira', 'sensor_optico', 'ganancia', 'integracion_ms',
  'referencia_delta', 'control_volumen', 'control_camara', 'control_tira', 'control_sonda', 'control_sensores', 'control_blanco',
  'criterio_hg', 'motivo_hg', 'operador', 'permiso_uso', 'incidencias',
];

function cell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const num = (v, d) => (v === null || v === undefined || Number.isNaN(v) ? '' : Number(v).toFixed(d));

export function buildCsv(run, rows) {
  const c = run.controles || {};
  const yesNo = (b) => (b ? 'si' : 'no');
  const o = run.optica || {};
  const crit = run.hg_tira?.criterio;
  const meta = {
    run_id: run.run_id, id_muestra: run.id_muestra, id_caso: run.id_caso, fecha_iso: run.fecha_iso,
    volumen_ml: run.volumen_ml, config_id: run.config_id, estado: run.estado, origen: run.origen,
    estado_hg: run.estado_hg || 'pendiente', demostracion: run.demostracion ? 'si' : 'no',
    estacion: run.estacion, build: run.build, matriz: run.matriz, tipo_corrida: run.tipo_corrida, lote_tira: run.lote_tira,
    sensor_optico: o.sensor || 'TCS34725', ganancia: o.ganancia || '', integracion_ms: o.integracion_ms ?? '',
    referencia_delta: run.referencia?.tipo === 'blanco' ? `blanco ${run.referencia.run_id}` : 'inicio de la corrida (5 s)',
    control_volumen: yesNo(run.volumen_confirmado), control_camara: yesNo(c.camara), control_tira: yesNo(c.tira),
    control_sonda: yesNo(c.sondas), control_sensores: yesNo(c.sensores), control_blanco: c.blanco || '',
    criterio_hg: crit ? `umbral ${crit.umbral} ± ${crit.banda} · ${crit.metodo} · ${crit.validado_por}` : 'sin criterio acordado',
    motivo_hg: run.hg_tira?.motivo || '',
    operador: run.operador, permiso_uso: run.permiso_uso,
    incidencias: [run.incidencias, ...(run.motivos || [])].filter(Boolean).join(' | '),
  };
  const d = derive(run, rows);
  const lines = [COLUMNS.join(',')];
  for (let seq = 0; seq < N_ROWS; seq++) {
    const r = d[seq];
    let motivo = r?.motivo || '';
    if (!r) motivo = run.estado === 'captura' ? 'pendiente_de_recibir' : 'sin_recibir';
    else if (r.c == null && !motivo) motivo = 'optica_invalida';
    else if (r.temp_c == null && !motivo) motivo = 'temperatura_invalida';
    const row = {
      ...meta, seq, t_seg: r ? (r.t_seg ?? seq) : seq,
      temp_c: num(r?.temp_c, 4), r: r?.r ?? '', g: r?.g ?? '', b: r?.b ?? '', c: r?.c ?? '',
      delta_cromatico: num(r?.delta, 3), motivo,
    };
    lines.push(COLUMNS.map((k) => cell(row[k])).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function csvFilename(run) {
  const d = (run.fecha_iso || '').slice(0, 19).replace(/[:T]/g, '-');
  const safe = (s) => String(s || '').replace(/[^\w.-]+/g, '_');
  return `${safe(run.run_id)}_${safe(run.id_muestra)}_${d}${run.demostracion ? '_DEMOSTRACION' : ''}.csv`;
}

export function downloadText(text, filename, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  downloadBlob(blob, filename);
}
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
