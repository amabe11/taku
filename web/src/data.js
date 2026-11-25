// Fuente de las muestras. Demostración: datos de ejemplo guardados en este navegador.
// Servidor: copia local (IndexedDB) de lo que la app modo técnico sincronizó, más los cambios de la web.
import { state, emit } from './state.js';
import * as store from './store.js';
import { demoMuestras } from './data/demo.js';
import { cloudCfg, cloudReady, pullMuestras, pushMuestras } from './cloud.js';

function setNube(status, mensaje = '') { state.nube = { ...state.nube, status, mensaje, ultima: cloudCfg().ultima }; emit('nube'); }

async function refresh() { state.muestras = await store.listMuestras(); emit('muestras'); }

export async function loadMuestras() {
  store.useDb(state.mode);
  state.persistent = await store.ready();
  if (state.mode === 'demo') {
    if (!(await store.listMuestras()).length) await store.putMuestras(demoMuestras());
    return refresh();
  }
  await refresh();
  syncNube(); // en segundo plano: la web abre con la copia local
}

/** Trae del servidor y envía los cambios locales pendientes. Lo nuevo del servidor no pisa cambios sin enviar. */
export async function syncNube() {
  if (state.mode !== 'nube') return;
  if (!cloudReady()) { setNube('sin_config', 'Falta la clave del equipo en Configuración.'); return; }
  setNube('sync', 'Sincronizando con el servidor…');
  try {
    const pendientes = state.muestras.filter((m) => m.pendiente_sync);
    if (pendientes.length) await pushMuestras(pendientes.map(({ pendiente_sync, ...m }) => m));
    const remotas = await pullMuestras();
    const locales = new Map(state.muestras.map((m) => [m.codigo, m]));
    await store.putMuestras(pendientes.map(({ pendiente_sync, ...m }) => m));
    await store.putMuestras(remotas.filter((r) => !locales.get(r.codigo)?.pendiente_sync || pendientes.some((p) => p.codigo === r.codigo)));
    await refresh();
    setNube('ok', `Sincronizado: ${remotas.length} muestras en el servidor.`);
  } catch (e) {
    setNube('error', `Sin conexión con el servidor: ${e.message}. Los cambios quedan guardados aquí.`);
  }
}

/** Aplica un cambio a una muestra y lo deja en su historial (trazabilidad, 7.3). */
export async function updateMuestra(codigo, patch, accion, por) {
  const m = state.muestras.find((x) => x.codigo === codigo);
  if (!m) throw new Error(`No existe la muestra ${codigo}`);
  const next = {
    ...m, ...patch,
    historial: [...(m.historial || []), { fecha: new Date().toISOString(), accion, por: por || 'sin nombre' }],
    ...(state.mode === 'nube' ? { pendiente_sync: true } : {}),
  };
  await store.putMuestras([next]);
  await refresh();
  if (state.mode === 'nube') syncNube();
  return next;
}

/** Agrega registros importados (JSON o CSV de la app modo técnico) sin sobrescribir los existentes. */
export async function importMuestras(list) {
  const have = new Set(state.muestras.map((m) => m.codigo));
  const nuevas = list.filter((m) => m?.codigo && !have.has(m.codigo)).map((m) => ({ ...m, ...(state.mode === 'nube' ? { pendiente_sync: true } : {}) }));
  await store.putMuestras(nuevas);
  await refresh();
  if (state.mode === 'nube' && nuevas.length) syncNube();
  return nuevas.length;
}

export async function resetDemo() { await store.clearMuestras(); await store.putMuestras(demoMuestras()); await refresh(); }
export async function clearLocal() { await store.clearMuestras(); await refresh(); }
export const byCodigo = (codigo) => state.muestras.find((m) => m.codigo === codigo) || null;
