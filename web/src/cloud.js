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
  await call('/api/datos?coleccion=muestras&limit=1', { cfg }); // comprueba la clave
  return h;
}
/** Muestras del servidor (todas las que sincronizó la app modo técnico). */
export async function pullMuestras() {
  const { items } = await call('/api/datos?coleccion=muestras&limit=1000', { timeout: 45000 });
  return items.map(({ sincronizado_en, sincronizado_desde, ...m }) => m);
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
