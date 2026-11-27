import './styles/app.css';
import { state, emit, setMode, readPref } from './state.js';
import { loadMuestras } from './data.js';
import { createShell, setCurrent } from './components/shell.js';
import { mapaView } from './views/mapa.js';
import { muestrasView } from './views/muestras.js';
import { muestraView } from './views/muestra.js';
import { priorizacionView } from './views/priorizacion.js';
import { cuencaView } from './views/cuenca.js';
import { indicadoresView } from './views/indicadores.js';
import { alertasView } from './views/alertas.js';
import { reportesView } from './views/reportes.js';
import { metodoView } from './views/metodo.js';
import { mapeView } from './views/mape.js';
import { sitioView } from './views/sitio.js';
import { configuracionView } from './views/configuracion.js';
import { lectorView } from './views/lector.js';
import { simuladorView } from './views/simulador.js';

// Popover API: los navegadores sin soporte muestran las fichas como hojas fijas (ver CSS @supports).
if (!Object.hasOwn(HTMLElement.prototype, 'popover')) {
  console.warn('Este navegador no soporta popover: las fichas se abrirán como hojas fijas.');
}

// ---------------- origen de los datos: demostración o Servidor Ahgora
function resolveMode() {
  const q = new URLSearchParams(location.search).get('demo');
  if (q === '1') return 'demo';
  if (q === '0') return 'nube';
  return readPref('ahg.mode', 'demo') === 'nube' ? 'nube' : 'demo';
}
setMode(resolveMode());
document.documentElement.dataset.mode = state.mode;

// ---------------- rutas (#/vista/parámetro)
const ROUTES = {
  mapa: mapaView,
  sitio: sitioView,
  mape: mapeView,
  muestras: muestrasView,
  muestra: muestraView,
  priorizacion: priorizacionView,
  cuenca: cuencaView,
  indicadores: indicadoresView,
  alertas: alertasView,
  reportes: reportesView,
  metodo: metodoView,
  configuracion: configuracionView,
  lector: lectorView,
  simulador: simuladorView,
};
const NAV_OF = { muestra: 'muestras' };
const TITLES = { mapa: 'Mapas', lector: 'Lector en vivo' };

let current = null;
function route(initial = false) {
  const [name, param] = location.hash.replace(/^#\/?/, '').split('/');
  const view = ROUTES[name] ? name : 'mapa';
  current?.destroy?.();
  const main = document.getElementById('main');
  current = ROUTES[view](param ? decodeURIComponent(param) : undefined);
  main.replaceChildren(current.el);
  setCurrent(NAV_OF[view] || view);
  document.title = `${TITLES[view] || main.querySelector('[data-view-title]')?.textContent || 'Ahgora'} · Ahgora Web`;
  if (!initial) (main.querySelector('[data-view-title]') || main).focus({ preventScroll: false });
  if (!initial) document.querySelector('.app-body')?.scrollTo({ top: 0 });
}
window.addEventListener('hashchange', () => route());

// ---------------- arranque
createShell();
route(true);
loadMuestras()
  .then(() => emit('mode'))
  .catch((e) => { console.error(e); document.getElementById('main').prepend(Object.assign(document.createElement('p'), { className: 'form-error view', textContent: `No se pudieron cargar las muestras: ${e.message}` })); });
