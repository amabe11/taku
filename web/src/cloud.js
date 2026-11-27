// Servidor Ahgora (sección 3 y 7.6): API en Vercel + MongoDB Atlas. La app modo técnico sincroniza ahí las
// muestras; la web las lee y agrega la confirmación de laboratorio y la aprobación de alertas.
// La clave del equipo se escribe en Configuración y queda solo en este navegador (nunca en el repositorio).
import { writePref, readPref } from './state.js';

export const DEFAULT_API = (import.meta.env.VITE_CLOUD_API || 'https://taku-server.vercel.app').replace(/\/$/, '');

export function cloudCfg() { return { api: DEFAULT_API, key: '', ultima: null, ...readPref('ahg.cloud', {}) }; }
export const saveCloudCfg = (c) => writePref('ahg.cloud', c);
export const cloudReady = (c = cloudCfg()) => !!(c.api && c.key);

async function call(path, { method = 'GET', body, cfg = cloudCfg(), timeout = 25000 } = {}) {
  if (!cfg.api) throw new Error('Falta la dirección del servidor en Configuración.');
  const res = await fetch(`${cfg.api}${path}`, {
    method, signal: AbortSignal.timeout(timeout), cache: 'no-store',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cfg.key ? { 'x-ahg-key': cfg.key } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export async function testCloud(cfg) {
  const h = await call('/api/health', { cfg });
  if (!cfg.key) throw new Error('La API responde, pero falta la clave del equipo.');
  await call('/api/datos?coleccion=muestras&limit=1', { cfg }); // comprueba la clave
  return h;
}
/** Muestras del servidor (todas las que sincronizó la app modo técnico). */
export async function pullMuestras() {
  const { items } = await call('/api/datos?coleccion=muestras&limit=1000', { timeout: 45000 });
  return items.map(({ sincronizado_en, sincronizado_desde, ...m }) => m);
}
/** Reportes comunitarios de Ahgora Comunidad (requiere la clave del equipo). */
export async function pullReportes() {
  if (!cloudReady()) throw Object.assign(new Error('Falta la clave del equipo en Configuración.'), { sinConfig: true });
  const { items } = await call('/api/reportes?limit=1000', { timeout: 30000 });
  return items;
}
/** Envía cambios (confirmación de laboratorio, alertas, visibilidad). Idempotente por `codigo`. */
export async function pushMuestras(list) {
  let n = 0;
  for (let i = 0; i < list.length; i += 100) {
    const r = await call('/api/sync', { method: 'POST', body: { origen_web: location.origin, muestras: list.slice(i, i + 100) }, timeout: 45000 });
    n += r.muestras;
  }
  saveCloudCfg({ ...cloudCfg(), ultima: new Date().toISOString() });
  return n;
}
/** Unidades mineras (MAPE) del servidor. */
export async function pullMape() {
  const { items } = await call('/api/datos?coleccion=mape&limit=2000', { timeout: 30000 });
  return items.map(({ sincronizado_en, sincronizado_desde, ...u }) => u);
}
export async function pushMape(list) {
  let n = 0;
  for (let i = 0; i < list.length; i += 200) n += (await call('/api/sync', { method: 'POST', body: { origen_web: location.origin, mape: list.slice(i, i + 200) }, timeout: 45000 })).mape;
  return n;
}
/** Estado de la base: colecciones, documentos y validadores (GET /api/admin). */
export const estadoBase = (cfg) => call('/api/admin', { cfg });
/** Crea colecciones con validador e índices y carga sitio, antecedentes y zonas (POST /api/admin). */
export const inicializarBase = (payload) => call('/api/admin', { method: 'POST', body: { accion: 'inicializar', ...payload }, timeout: 45000 });
/** Borra del servidor solo lo marcado como demostración. */
export const borrarDemoServidor = () => call('/api/admin', { method: 'POST', body: { accion: 'borrar_demostracion', por: 'Ahgora Web' }, timeout: 45000 });
/** Lecturas crudas del lector ESP32 que llegan por WiFi (GET /api/lecturas) y resumen por lector. */
export async function pullLecturas({ node_id, desde, limit = 120 } = {}) {
  if (!cloudReady()) throw Object.assign(new Error('Falta la clave del equipo en Configuración.'), { sinConfig: true });
  const q = new URLSearchParams({ limit: String(limit) });
  if (node_id) q.set('node_id', node_id);
  if (desde) q.set('desde', String(desde));
  return call(`/api/lecturas?${q}`, { timeout: 15000 });
}
/** Avisos públicos tal como los recibe Ahgora Comunidad (sin clave). */
export const avisosPublicos = () => call('/api/public/avisos', { cfg: { ...cloudCfg(), key: '' } });
