// Fuente de las muestras. Demostración: datos de ejemplo guardados en este navegador.
// Servidor: copia local (IndexedDB) de lo que la app modo técnico sincronizó, más los cambios de la web.
import { state, emit } from './state.js';
import * as store from './store.js';
import { demoMuestras, demoMape } from './data/demo.js';
import { cloudCfg, cloudReady, pullMuestras, pushMuestras, pullMape } from './cloud.js';
import { readPref, writePref } from './state.js';

// Sube esta versión cuando cambie la demostración: los navegadores con la anterior se vuelven a cargar.
const DEMO_VERSION = 'alcoche-2026-11-25';
const REFRESCO_MS = 60000;
let timer = null;

function setNube(status, mensaje = '') { state.nube = { ...state.nube, status, mensaje, ultima: cloudCfg().ultima }; emit('nube'); }

async function refresh() { state.muestras = await store.listMuestras(); emit('muestras'); }

export async function loadMuestras() {
  store.useDb(state.mode);
  state.persistent = await store.ready();
  if (state.mode === 'demo') {
    if (readPref('ahg.demo.version', '') !== DEMO_VERSION || !(await store.listMuestras()).length) {
      await store.clearMuestras();
      await store.putMuestras(demoMuestras());
      writePref('ahg.demo.version', DEMO_VERSION);
    }
    state.mape = demoMape();
    emit('mape');
    return refresh();
  }
  state.mape = readPref('ahg.mape.cache', []);
  await refresh();
  syncNube(); // en segundo plano: la web abre con la copia local
  // Lo que llega de la app (o del simulador del lector) aparece sin recargar la página.
  clearInterval(timer);
  timer = setInterval(() => { if (document.visibilityState === 'visible') syncNube({ silencioso: true }); }, REFRESCO_MS);
}

/** Trae del servidor y envía los cambios locales pendientes. Lo nuevo del servidor no pisa cambios sin enviar. */
export async function syncNube({ silencioso = false } = {}) {
  if (state.mode !== 'nube') return;
  if (!cloudReady()) { setNube('sin_config', 'Falta la clave del equipo en Configuración.'); return; }
  if (!silencioso) setNube('sync', 'Sincronizando con el servidor…');
  try {
    const pendientes = state.muestras.filter((m) => m.pendiente_sync);
    if (pendientes.length) await pushMuestras(pendientes.map(({ pendiente_sync, ...m }) => m));
    const remotas = await pullMuestras();
    const locales = new Map(state.muestras.map((m) => [m.codigo, m]));
    await store.putMuestras(pendientes.map(({ pendiente_sync, ...m }) => m));
    await store.putMuestras(remotas.filter((r) => !locales.get(r.codigo)?.pendiente_sync || pendientes.some((p) => p.codigo === r.codigo)));
    await refresh();
    try {
      state.mape = await pullMape();
      writePref('ahg.mape.cache', state.mape);
      emit('mape');
    } catch { /* el registro MAPE es opcional */ }
    setNube('ok', `Sincronizado ${new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}: ${remotas.length} muestras y ${state.mape.length} unidades mineras en el servidor.`);
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

export async function resetDemo() { await store.clearMuestras(); await store.putMuestras(demoMuestras()); state.mape = demoMape(); emit('mape'); await refresh(); }
export async function clearLocal() { await store.clearMuestras(); await refresh(); }
export const byCodigo = (codigo) => state.muestras.find((m) => m.codigo === codigo) || null;
