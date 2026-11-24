import './styles/app.css';
import { state, emit } from './state.js';
import { createApi } from './api.js';
import { loadRuns, startStatusLoop } from './runs.js';
import { createShell, setCurrent } from './components/shell.js';
import { mapaView } from './views/mapa.js';
import { lecturasView } from './views/lecturas.js';
import { evidenciaView } from './views/evidencia.js';
import { estacionesView } from './views/estaciones.js';
import { laboratorioView } from './views/laboratorio.js';
import { reportesView } from './views/reportes.js';
import { bioindicadorView, loadLemna } from './views/bioindicador.js';
import { configuracionView } from './views/configuracion.js';

// Popover API: los navegadores sin soporte muestran las fichas como hojas fijas (ver CSS @supports).
if (!Object.hasOwn(HTMLElement.prototype, 'popover')) {
  console.warn('Este navegador no soporta popover: las fichas se abrirán como hojas fijas.');
}

// ---------------- modo: demostración o estación real
function resolveMode() {
  const q = new URLSearchParams(location.search).get('demo');
  if (q === '1') return 'demo';
  if (q === '0') return 'device';
  try { const saved = JSON.parse(localStorage.getItem('hg.mode') || 'null'); if (saved) return saved; } catch { /* sin almacenamiento */ }
  return import.meta.env.DEV ? 'demo' : 'device';
}
state.mode = resolveMode();
state.api = createApi(state.mode);
document.documentElement.dataset.mode = state.mode;

// ---------------- rutas
const ROUTES = {
  mapa: mapaView,
  estaciones: estacionesView,
  lecturas: lecturasView,
  evidencia: evidenciaView,
  laboratorio: laboratorioView,
  reportes: reportesView,
  bioindicador: bioindicadorView,
  // Vistas con internet: se descargan solo al abrirlas (geotiff.js va en su propio fragmento).
  satelite: () => import('./views/satelite.js').then((m) => m.sateliteView()),
  espacial: () => import('./views/espacial.js').then((m) => m.espacialView()),
  configuracion: configuracionView,
};

let current = null;
function route(initial = false) {
  const [name, param] = location.hash.replace(/^#\/?/, '').split('/');
  const view = ROUTES[name] ? name : 'mapa';
  current?.destroy?.();
  const main = document.getElementById('main');
  const made = ROUTES[view](param ? decodeURIComponent(param) : undefined);
  const token = (route.token = (route.token || 0) + 1);
  if (made instanceof Promise) {
    current = null;
    main.replaceChildren(Object.assign(document.createElement('p'), { className: 'view meta', textContent: 'Cargando vista…' }));
    made.then((v) => { if (token !== route.token) return; current = v; main.replaceChildren(v.el); finish(view, initial); })
      .catch(() => main.replaceChildren(Object.assign(document.createElement('p'), { className: 'view meta', textContent: 'Esta vista necesita internet y no se carga desde la estación. Ábrela en un equipo con conexión, con la copia completa de la web (carpeta dist/). La estación sigue funcionando.' })));
    setCurrent(view);
    return;
  }
  current = made;
  main.replaceChildren(current.el);
  finish(view, initial);
}
function finish(view, initial) {
  const main = document.getElementById('main');
  setCurrent(view);
  document.title = `${view === 'mapa' ? 'Mapa de monitoreo' : main.querySelector('[data-view-title]')?.textContent || 'Hg-Guard'} · Estación de monitoreo`;
  if (!initial) (main.querySelector('[data-view-title]') || main).focus({ preventScroll: false });
}
window.addEventListener('hashchange', () => route());

// ---------------- arranque
createShell();
route(true);
loadRuns().then(() => emit('mode'));
loadLemna();
startStatusLoop();
