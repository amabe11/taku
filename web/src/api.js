// Abstracción de la API del ESP32 (contrato de la guía ORO-4.1, p. 13) + modo demostración.
//
//   GET  /api/status          → { build, config_id, sensor_ok:{tcs34725, ds18b20}, estado, run_id,
//                                 [seq_actual, uptime_ms, estacion, optica:{sensor, ganancia, integracion_ms}] }
//   POST /api/run             ← { id_muestra, id_caso, volumen_ml, volumen_confirmado, fecha_iso, [tipo_corrida, lote_tira] }
//                             → 201 { run_id, estado }   · 409 si hay otra corrida activa
//   GET  /api/run?from=<seq>  → { run_id, estado, motivos[], origen,
//                                 filas:[{ seq, t_seg, temp_c, r, g, b, c, motivo }] }   (r,g,b,c = cuentas TCS34725)
//
// estado ∈ ESPERA | CAPTURA | COMPLETA | INVALIDA | INTERRUMPIDA
// La exportación CSV se arma en el navegador con la corrida guardada (no necesita ruta propia).
import { DemoDevice } from './demo-device.js';

const TIMEOUT = 3000;

async function request(path, { method = 'GET', body, timeout = TIMEOUT } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(timeout),
  });
  let data = null;
  try { data = await res.json(); } catch { /* respuesta vacía */ }
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status; err.run_id = data?.run_id; throw err;
  }
  return data;
}

/** Normaliza sensor_ok: el firmware puede enviar un booleano o un objeto por sensor. */
export function sensorsOk(info) {
  const s = info?.sensor_ok;
  if (s == null) return { ok: false, detail: {} };
  if (typeof s === 'boolean') return { ok: s, detail: {} };
  return { ok: Object.values(s).every(Boolean), detail: s };
}

export function createApi(mode) {
  if (mode === 'demo') {
    const device = new DemoDevice();
    return {
      mode: 'demo',
      origen: 'archivo_prueba',
      get pollMs() { return device.pollMs; },
      status: () => device.status(),
      startRun: (body, sim) => device.startRun(body, sim),
      getRun: (from) => device.getRun(from),
    };
  }
  return {
    mode: 'device',
    origen: 'banco_real',
    pollMs: 1000,
    status: async () => normalize(await request('/api/status')),
    startRun: async (body) => normalize(await request('/api/run', { method: 'POST', body, timeout: 5000 })),
    getRun: async (from) => normalize(await request(`/api/run?from=${encodeURIComponent(from)}`)),
  };
}

/** Acepta «INVÁLIDA» o «INVALIDA», mayúsculas o minúsculas, y filas con t_s o t_seg. */
function normalize(data) {
  if (!data || typeof data !== 'object') return data;
  if (typeof data.estado === 'string') data.estado = data.estado.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
  if (Array.isArray(data.filas)) {
    for (const f of data.filas) if (f.t_seg == null && f.t_s != null) f.t_seg = f.t_s;
  }
  return data;
}
