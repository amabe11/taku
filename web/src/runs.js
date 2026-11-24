// Control de la corrida: inicio, seguimiento a 1 Hz, recuperación desde la primera seq faltante,
// detección de reinicio y cierre con estado de adquisición. La estación es la fuente; el navegador
// conserva lo recibido en IndexedDB aunque se caiga el Wi-Fi o se recargue la página.
import { state, emit, summarize, N_ROWS, getCriterio } from './state.js';
import { medianChroma } from './lib/optics.js';
import { evaluateStrip } from './hg-rules.js';
import * as db from './store.js';
import { announce } from './lib/announce.js';
import { ranges } from './lib/format.js';
import { sensorsOk } from './api.js';

let statusTimer = 0;
let trackTimer = 0;
let failStreak = 0;

const emptyRows = () => new Array(N_ROWS).fill(null);

export const ESTADO_LABEL = {
  captura: 'Capturando',
  completa: 'Válida',
  invalida: 'Inválida',
  interrumpida: 'Interrumpida',
};

// ------------------------------------------------------------------ conexión
function setConn(status, info) {
  const prev = state.conn.status;
  if (info) { state.conn.info = info; state.conn.lastOk = Date.now(); state.conn.failingSince = 0; }
  else if (!state.conn.failingSince) state.conn.failingSince = Date.now();
  state.conn.status = status;
  if (prev !== status) {
    const id = info?.estacion || 'EST-01';
    if ((status === 'online' || status === 'demo') && (prev === 'reconnecting' || prev === 'offline'))
      announce(`Conexión restablecida con ${id}.`);
    if (status === 'reconnecting' && (prev === 'online' || prev === 'demo'))
      announce('Conexión perdida con la estación. Si la placa sigue encendida, continúa capturando; las lecturas se recuperarán al reconectar.', { priority: 'high' });
  }
  emit('conn');
}
const okStatus = () => (state.mode === 'demo' ? 'demo' : 'online');

async function pollStatus() {
  clearTimeout(statusTimer);
  try {
    const info = await state.api.status();
    setConn(okStatus(), info);
    await checkReboot(info);
  } catch {
    const wasOk = state.conn.lastOk > 0;
    setConn(wasOk || state.tracking ? 'reconnecting' : 'offline');
  }
  const fast = state.tracking && state.mode === 'demo' && state.api.pollMs < 1000;
  statusTimer = setTimeout(pollStatus, fast ? 600 : state.tracking ? 1500 : 3000);
}
export function startStatusLoop() { pollStatus(); }

/** La placa ya no tiene nuestra corrida en RAM (reinicio o pérdida de energía). */
let lastUptime = null;
async function checkReboot(info) {
  const rebooted = lastUptime != null && typeof info.uptime_ms === 'number' && info.uptime_ms < lastUptime;
  if (typeof info.uptime_ms === 'number') lastUptime = info.uptime_ms;
  const cur = state.current;
  if (!state.tracking || !cur || cur.run.estado !== 'captura') return;
  const other = info.run_id && info.run_id !== cur.run.run_id;
  // Sin uptime ni otra corrida, decide el seguimiento (GET /api/run responde 404 si ya no existe).
  if (rebooted || other) {
    const s = summarize(cur.rows);
    await interrupt(rebooted
      ? `La estación se reinició (posible pérdida de energía); se conservan ${s.nRecv} de ${N_ROWS} lecturas recibidas.`
      : `La estación tiene otra corrida activa (${info.run_id}); se conservan ${s.nRecv} de ${N_ROWS} lecturas recibidas.`);
  }
}

// ------------------------------------------------------------------ carga inicial
export async function loadRuns() {
  state.persistent = await db.ready();
  state.runs = await db.listRuns();
  const active = state.runs.find((r) => r.estado === 'captura');
  const shown = active || state.runs.find((r) => !r.descartada) || null;
  if (shown) await show(shown.run_id);
  emit('runs');
  if (active) { state.tracking = true; scheduleTrack(0); }
}

export async function show(run_id) {
  // Durante una captura la corrida mostrada es la activa: cambiarla detendría el seguimiento.
  if (state.tracking && state.current && state.current.run.run_id !== run_id) return false;
  const run = await db.getRun(run_id);
  if (!run) return;
  const rows = emptyRows();
  for (const r of await db.getRows(run_id)) if (r.seq >= 0 && r.seq < N_ROWS) rows[r.seq] = r;
  state.current = { run, rows };
  emit('run');
  return true;
}

async function refreshList() { state.runs = await db.listRuns(); emit('runs'); }
export { refreshList };

/** Filas de cualquier corrida como arreglo de 121 posiciones (null = no recibida). */
export async function rowsOf(run_id) {
  if (state.current?.run.run_id === run_id) return state.current.rows;
  const rows = emptyRows();
  for (const r of await db.getRows(run_id)) if (r.seq >= 0 && r.seq < N_ROWS) rows[r.seq] = r;
  return rows;
}
export async function clearLocalData() {
  if (state.tracking) throw new Error('Hay una corrida en captura');
  await db.clearAll();
  state.current = null;
  emit('run');
  await refreshList();
}

// ------------------------------------------------------------------ inicio
/** ¿Hay una corrida terminada sin guardar ni exportar? (la guía exige resolverla antes de la siguiente) */
export function pendingRun() {
  const r = state.current?.run;
  if (!r || r.estado === 'captura') return null;
  return !r.guardada && !r.exportada && !r.descartada ? r : null;
}
export function isCapturing() { return state.current?.run?.estado === 'captura'; }

export async function startRun(ficha, sim) {
  const info = state.conn.info || {};
  const fecha_iso = new Date().toISOString();
  const body = {
    id_muestra: ficha.id_muestra, id_caso: ficha.id_caso, volumen_ml: ficha.volumen_ml, volumen_confirmado: true, fecha_iso,
  };
  const res = await state.api.startRun({ ...body, tipo_corrida: ficha.tipo_corrida, lote_tira: ficha.lote_tira }, state.mode === 'demo' ? sim : undefined);
  // Referencia del Δ cromático: el último blanco de tira válido del mismo día, si existe.
  const day = fecha_iso.slice(0, 10);
  const blank = state.runs.find((r) => r.tipo_corrida === 'blanco' && r.estado === 'completa' && !r.descartada && r.croma_final && (r.fecha_iso || '').slice(0, 10) === day);
  const referencia = ficha.tipo_corrida !== 'blanco' && blank
    ? { tipo: 'blanco', run_id: blank.run_id, croma: blank.croma_final }
    : { tipo: 'inicio', run_id: null, croma: null };
  const run = {
    run_id: res.run_id,
    ...ficha,
    fecha_iso,
    volumen_confirmado: true,
    estacion: info.estacion || 'EST-01',
    config_id: info.config_id || '',
    build: info.build || '',
    sensores_al_inicio: sensorsOk(info).detail,
    optica: info.optica || null,
    referencia,
    esquema: 2,
    origen: state.api.origen,
    demostracion: state.mode === 'demo',
    simulacion: state.mode === 'demo' ? sim : null,
    estado: 'captura',
    motivos: [],
    estado_hg: 'pendiente',
    hg: null,
    guardada: false,
    exportada: false,
    descartada: false,
    creada: Date.now(),
  };
  await db.putRun(run);
  state.current = { run, rows: emptyRows() };
  state.tracking = true;
  emit('run');
  await refreshList();
  announce(`Corrida ${run.run_id} iniciada. Captura de 120 segundos en curso.`);
  scheduleTrack(0);
  pollStatus();
  return run;
}

// ------------------------------------------------------------------ seguimiento
function scheduleTrack(ms) { clearTimeout(trackTimer); trackTimer = setTimeout(track, ms); }

async function track() {
  const cur = state.current;
  if (!cur || cur.run.estado !== 'captura') { state.tracking = false; return; }
  const run_id = cur.run.run_id;
  const before = summarize(cur.rows);
  let data;
  try {
    data = await state.api.getRun(before.firstMissing);
  } catch (e) {
    if (e.status === 404) {
      await interrupt(`La estación ya no tiene la corrida en memoria (reinicio o pérdida de energía); se conservan ${before.nRecv} de ${N_ROWS} lecturas.`);
      return;
    }
    failStreak++;
    if (state.conn.status !== 'reconnecting') setConn('reconnecting');
    scheduleTrack(Math.min(4000, 1000 * failStreak));
    return;
  }
  if (state.current?.run.run_id !== run_id) return; // se cambió de corrida mientras tanto
  if (data.run_id && data.run_id !== run_id) {
    await interrupt(`La estación responde con otra corrida (${data.run_id}); se conservan ${before.nRecv} de ${N_ROWS} lecturas.`);
    return;
  }
  const recovered = failStreak > 0;
  failStreak = 0;
  if (state.conn.status === 'reconnecting') setConn(okStatus(), state.conn.info);

  const fresh = (data.filas || []).filter((f) => f.seq >= 0 && f.seq < N_ROWS && !cur.rows[f.seq]);
  for (const f of fresh) {
    cur.rows[f.seq] = {
      seq: f.seq,
      t_seg: f.t_seg ?? f.seq,
      temp_c: f.temp_c ?? null,
      r: f.r ?? null, g: f.g ?? null, b: f.b ?? null, c: f.c ?? null,
      motivo: f.motivo || '',
    };
  }
  if (fresh.length) {
    await db.putRows(run_id, fresh.map((f) => cur.rows[f.seq]));
    if (recovered) announce(`Conexión recuperada: ${fresh.length} lecturas recibidas desde la seq ${before.firstMissing}, sin duplicados.`);
    emit('run');
  }

  if (data.estado && data.estado !== 'CAPTURA' && data.estado !== 'ESPERA') {
    const after = summarize(cur.rows);
    // Si quedan huecos, se pide una vez más desde la primera faltante antes de cerrar.
    if (after.missing.length && fresh.length) { scheduleTrack(150); return; }
    await finalize(data.estado, data.motivos || []);
    return;
  }
  scheduleTrack(state.api.pollMs || 1000);
}

async function finalize(fwEstado, motivos) {
  const cur = state.current;
  const s = summarize(cur.rows, cur.run);
  let estado = fwEstado === 'COMPLETA' ? 'completa' : fwEstado === 'INVALIDA' ? 'invalida' : 'interrumpida';
  const m = [...motivos];
  if (estado === 'completa' && s.missing.length) {
    estado = 'interrumpida';
    m.push(`Faltan ${s.missing.length} lecturas (seq ${ranges(s.missing)})`);
  }
  if (estado === 'completa' && s.invalid.length) {
    m.push(`${s.invalid.length} lecturas inválidas (seq ${ranges(s.invalid)})`);
  }
  await closeRun(estado, m, s);
}

async function interrupt(motivo) {
  const cur = state.current;
  if (!cur || cur.run.estado !== 'captura') return;
  const s = summarize(cur.rows, cur.run);
  await closeRun('interrumpida', [motivo], s);
}

async function closeRun(estado, motivos, s) {
  const cur = state.current;
  clearTimeout(trackTimer);
  state.tracking = false;
  Object.assign(cur.run, {
    estado,
    motivos,
    n_recibidas: s.nRecv,
    n_validas: s.nValid,
    faltantes: s.missing,
    invalidas: s.invalid,
    rango_temp: s.temp,
    delta_final: s.deltaFinal,
    delta_max: s.deltaMax,
    croma_final: medianChroma(cur.rows.filter(Boolean).filter((r) => !r.motivo).slice(-10)),
    terminada: Date.now(),
  });
  // Estado de Hg desde la tira, salvo que ya exista un informe de laboratorio registrado.
  if (cur.run.hg?.origen !== 'ensayo_validado' && !(cur.run.hg && cur.run.estado_hg === 'resultado_disponible')) {
    const ev = evaluateStrip(cur.run, s, getCriterio());
    cur.run.estado_hg = ev.estado;
    cur.run.hg_tira = ev;
  }
  cur.run = await db.putRun(cur.run);
  emit('run');
  await refreshList();
  const label = ESTADO_LABEL[estado].toLowerCase();
  announce(`Corrida ${cur.run.run_id} terminada: ${label}. ${s.nValid} de ${N_ROWS} lecturas válidas.${motivos.length ? ' Motivo: ' + motivos[0] + '.' : ''} Estado de Hg: ${cur.run.hg_tira?.estado === 'prioridad_confirmacion' ? 'prioridad de confirmación' : cur.run.hg_tira?.estado === 'indeterminado' ? 'indeterminado' : 'pendiente de laboratorio'}.`, { priority: 'high' });
}

/** El operador da por interrumpida una corrida cuyo seguimiento no se puede recuperar. */
export async function abandonTracking() {
  await interrupt('Seguimiento detenido por el operador sin conexión con la estación.');
}

// ------------------------------------------------------------------ cierre manual
export async function updateRun(run_id, patch) {
  const run = await db.getRun(run_id);
  if (!run) return null;
  const next = await db.putRun({ ...run, ...patch });
  if (state.current?.run.run_id === run_id) { state.current.run = next; emit('run'); }
  await refreshList();
  return next;
}
export const saveRun = (run_id, incidencias) => updateRun(run_id, { guardada: true, incidencias, guardada_en: new Date().toISOString() });
export const markExported = (run_id) => updateRun(run_id, { exportada: true, exportada_en: new Date().toISOString() });
export const discardRun = (run_id) => updateRun(run_id, { descartada: true });
