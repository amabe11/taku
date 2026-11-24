// Vista «Configuración»: modo de operación, criterio de la tira, simulación y datos locales.
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { announce } from '../lib/announce.js';
import { state, on, writePref, getCriterio, setCriterio } from '../state.js';
import { clearLocalData, rowsOf } from '../runs.js';
import { persistGranted, requestPersist } from '../store.js';
import { switchMode } from '../components/shell.js';
import { downloadText } from '../csv.js';
import { viewHeader, dl } from './common.js';
import { cloudCfg, saveCloudCfg, testCloud, syncAll, pullAll, exportBackup, importBackup } from '../cloud.js';

export function configuracionView() {
  const dataCard = h('section', { class: 'card', 'aria-labelledby': 'cfg-data' });
  const modeForm = h('form', { class: 'card', 'aria-labelledby': 'cfg-mode', onsubmit: (e) => {
    e.preventDefault();
    const m = modeForm.elements.modo.value;
    if (m !== state.mode) switchMode(m);
  } },
    h('h2', { class: 'card-title', id: 'cfg-mode' }, 'Modo de operación'),
    h('fieldset', { class: 'radio-group', style: { marginTop: 'var(--sp-3)' } }, h('legend', { class: 'sr-only' }, 'Modo'),
      h('label', { class: 'check' }, h('input', { type: 'radio', name: 'modo', value: 'device', checked: state.mode === 'device' || null }),
        h('span', null, 'Estación real', h('small', null, 'La web habla con la placa por Wi-Fi local (/api/status, /api/run). Los datos quedan como banco real.'))),
      h('label', { class: 'check' }, h('input', { type: 'radio', name: 'modo', value: 'demo', checked: state.mode === 'demo' || null }),
        h('span', null, 'Demostración', h('small', null, 'Estación simulada para ensayar sin hardware. Todo queda marcado como archivo de prueba.')))),
    h('div', { class: 'view-actions' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Aplicar modo')),
  );

  const sim = state.ui.sim;
  const simForm = h('form', { class: 'card', 'aria-labelledby': 'cfg-sim', onchange: () => {
    state.ui.sim = { ...state.ui.sim, failure: simForm.elements.failure.value, speed: Number(simForm.elements.speed.value) };
    writePref('hg.demo.sim', state.ui.sim); announce('Valores de simulación guardados.');
  }, onsubmit: (e) => e.preventDefault() },
    h('h2', { class: 'card-title', id: 'cfg-sim' }, 'Simulación (modo demostración)'),
    h('p', { class: 'meta' }, 'Valores por defecto del diálogo «Nueva corrida». No afectan a la estación real.'),
    h('div', { class: 'fields' },
      h('div', { class: 'field' }, h('label', { for: 'cfg-falla' }, 'Falla a ensayar'),
        h('select', { id: 'cfg-falla', name: 'failure' }, [['ninguna', 'Ninguna'], ['wifi', 'Caída de Wi-Fi (30–52 s)'], ['sensor', 'Sensor de temperatura sin respuesta (40–58 s)'], ['optico', 'Lector óptico sin respuesta (60–72 s)'], ['energia', 'Pérdida de energía (70 s)']]
          .map(([v, l]) => h('option', { value: v, selected: sim.failure === v || null }, l)))),
      h('div', { class: 'field' }, h('label', { for: 'cfg-vel' }, 'Velocidad'),
        h('select', { id: 'cfg-vel', name: 'speed' }, [['8', 'Acelerada ×8 (15 s)'], ['1', 'Tiempo real (120 s)']].map(([v, l]) => h('option', { value: v, selected: String(sim.speed) === v || null }, l))))),
  );

  const cr = getCriterio();
  const critForm = h('form', { class: 'card', 'aria-labelledby': 'cfg-crit', onsubmit: (e) => {
    e.preventDefault();
    const f = critForm.elements;
    const activo = f.activo.checked;
    const umbral = Number(String(f.umbral.value).replace(',', '.')), banda = Number(String(f.banda.value).replace(',', '.'));
    if (activo && (!(umbral > 0) || !(banda >= 0) || !f.metodo.value.trim() || !f.validado.value.trim())) {
      critErr.hidden = false; critErr.textContent = 'Para activar el criterio indica umbral, banda, método/tira y quién lo validó.'; return;
    }
    critErr.hidden = true;
    setCriterio({ activo, umbral: activo ? umbral : null, banda: activo ? banda : null, metodo: f.metodo.value.trim(), validado_por: f.validado.value.trim(), demostracion: state.mode === 'demo' });
    announce(activo ? 'Criterio operativo guardado. Se aplica a las lecturas que terminen desde ahora.' : 'Criterio desactivado: el estado de Hg quedará pendiente.');
  } },
    h('h2', { class: 'card-title', id: 'cfg-crit' }, 'Criterio operativo de la tira'),
    h('p', { class: 'meta' }, 'Punto de decisión para priorizar la confirmación (guía, p. 5). Debe acordarse con el laboratorio por matriz y analito. Sin criterio activo, el estado de Hg queda pendiente.'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'activo', checked: cr.activo || null }), h('span', null, 'Aplicar criterio', h('small', null, state.mode === 'demo' ? 'En demostración se usa un criterio ficticio, marcado como tal.' : 'Solo con un criterio documentado.'))),
    h('div', { class: 'fields' },
      h('div', { class: 'field' }, h('label', { for: 'cr-umbral' }, 'Umbral de Δ cromático'), h('input', { class: 'input mono', id: 'cr-umbral', name: 'umbral', inputmode: 'decimal', value: cr.umbral ?? '' })),
      h('div', { class: 'field' }, h('label', { for: 'cr-banda' }, 'Banda de incertidumbre (±)'), h('input', { class: 'input mono', id: 'cr-banda', name: 'banda', inputmode: 'decimal', value: cr.banda ?? '' })),
      h('div', { class: 'field' }, h('label', { for: 'cr-metodo' }, 'Tira / método'), h('input', { class: 'input', id: 'cr-metodo', name: 'metodo', value: cr.metodo || '' })),
      h('div', { class: 'field' }, h('label', { for: 'cr-val' }, 'Validado por'), h('input', { class: 'input', id: 'cr-val', name: 'validado', value: cr.validado_por || '' }))),
    h('div', { class: 'view-actions' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Guardar criterio')));
  const critErr = h('p', { class: 'form-error', role: 'alert', hidden: true });
  critForm.append(critErr);

  // ---------------- nube (MongoDB Atlas vía API)
  const cc = cloudCfg();
  const cloudStatus = h('p', { class: 'meta', role: 'status', style: { margin: 0 } }, cc.ultima ? `Última sincronización: ${new Date(cc.ultima).toLocaleString('es-BO')}` : 'Sin sincronizar todavía.');
  const apiIn = h('input', { class: 'input mono', id: 'cl-api', name: 'api', type: 'url', autocomplete: 'off', spellcheck: 'false', placeholder: 'https://tu-proyecto.vercel.app', value: cc.api || '' });
  const keyIn = h('input', { class: 'input mono', id: 'cl-key', name: 'key', type: 'password', autocomplete: 'off', value: cc.key || '' });
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', id: 'cl-file', onchange: async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { const r = await importBackup(await f.text()); say(`Respaldo importado: ${r.corridas} corridas y ${r.lemna} observaciones de Lemna nuevas.`); }
    catch (err) { say(`No se pudo importar: ${err.message}`); }
    e.target.value = '';
  } });
  const say = (t) => { cloudStatus.textContent = t; announce(t); };
  const run = (label, fn) => async () => {
    saveCloudCfg({ ...cloudCfg(), api: apiIn.value.trim().replace(/\/$/, ''), key: keyIn.value });
    say(`${label}…`);
    try { say(await fn()); } catch (err) { say(`${label}: ${err.message}${/fetch|NetworkError|Failed/.test(err.message) ? ' (¿hay internet?)' : ''}`); }
  };
  const cloudCard = h('form', { class: 'card', 'aria-labelledby': 'cfg-cloud', onsubmit: (e) => e.preventDefault() },
    h('h2', { class: 'card-title', id: 'cfg-cloud' }, 'Nube del equipo (MongoDB)'),
    h('p', { class: 'meta' }, 'Los datos se guardan primero en este navegador. Con internet, se copian a la base MongoDB del equipo para que todos los vean. La clave del equipo queda solo en este navegador.'),
    h('div', { class: 'fields' },
      h('div', { class: 'field' }, h('label', { for: 'cl-api' }, 'Dirección de la API'), apiIn),
      h('div', { class: 'field' }, h('label', { for: 'cl-key' }, 'Clave del equipo'), keyIn)),
    h('div', { class: 'view-actions' },
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: run('Probando conexión', async () => { const hh = await testCloud(cloudCfg()); return `Conexión correcta con la base «${hh.base}».`; }) }, icon('sync'), 'Probar conexión'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: run('Sincronizando', async () => { const t = await syncAll((m) => (cloudStatus.textContent = m)); return `Sincronizado: ${t.corridas} corridas, ${t.lemna} observaciones de Lemna y ${t.escenas} comparaciones satelitales.`; }) }, icon('download'), 'Sincronizar con la nube'),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: run('Trayendo datos', async () => { const t = await pullAll(); return `Traídos de la nube: ${t.corridas} corridas y ${t.lemna} observaciones nuevas.`; }) }, 'Traer datos del equipo'),
      h('label', { class: 'btn btn-quiet', for: 'cl-file' }, 'Importar respaldo JSON'), fileIn),
    cloudStatus,
    h('p', { class: 'meta', style: { margin: 0 } }, 'Desde la web del ESP32 (sin internet): descarga el «Respaldo completo (JSON)» y luego impórtalo aquí, en la web publicada, para sincronizarlo.'));

  const about = h('section', { class: 'card', 'aria-labelledby': 'cfg-about' },
    h('h2', { class: 'card-title', id: 'cfg-about' }, 'Acerca de esta web'),
    dl([
      ['Versión web', '0.1.0 · sin internet'],
      ['Contrato API', 'GET /api/status · POST /api/run · GET /api/run?from=N'],
      ['CSV', 'UTF-8, coma, punto decimal, hora ISO; cabezal de la guía ORO-4.1'],
      ['Mapa', 'Natural Earth 1:10m (dominio público) · relieve ETOPO1, NOAA NCEI'],
      ['Tipografía', 'Atkinson Hyperlegible Next y Mono (SIL OFL)'],
      ['Sensores', 'DS18B20 (temperatura) y lector colorimétrico de tiras TCS34725 (I2C 0x29)'],
      ['Límite científico', 'La tira es un cribado: prioriza la confirmación en laboratorio, no la reemplaza.'],
    ]));

  const el = h('div', { class: 'view' },
    viewHeader('Configuración', 'Opciones locales de esta web. Los cambios se guardan en este navegador.'),
    h('div', { class: 'two-col' }, modeForm, cloudCard, critForm, state.mode === 'demo' ? simForm : null, dataCard, about));

  async function renderData() {
    const granted = await persistGranted();
    const n = state.runs.length;
    mount(dataCard,
      h('h2', { class: 'card-title', id: 'cfg-data' }, 'Datos locales'),
      dl([
        ['Almacenamiento', state.persistent ? 'IndexedDB de este navegador' : 'Solo en memoria (exporta antes de cerrar)'],
        ['Protección', granted ? 'Persistente: el navegador no lo borrará por espacio' : 'Normal: el navegador podría liberar espacio'],
        ['Corridas guardadas', String(n)],
      ]),
      h('div', { class: 'view-actions' },
        granted ? null : h('button', { class: 'btn btn-ghost', type: 'button', onclick: async () => { const ok = await requestPersist(); announce(ok ? 'Almacenamiento persistente concedido.' : 'El navegador no concedió almacenamiento persistente.'); renderData(); } }, 'Pedir almacenamiento persistente'),
        h('button', { class: 'btn btn-ghost', type: 'button', disabled: !n, onclick: async () => {
          downloadText(JSON.stringify(await exportBackup(), null, 2), `hg-guard_respaldo_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
          announce('Respaldo JSON descargado.');
        } }, icon('download'), 'Respaldo completo (JSON)'),
        h('button', { class: 'btn btn-danger', type: 'button', disabled: !n || state.tracking, onclick: confirmClear }, 'Borrar datos locales')),
    );
  }
  async function confirmClear() {
    const dlg = document.getElementById('confirm-dialog');
    mount(dlg, h('form', { method: 'dialog' },
      h('div', { class: 'modal-head' }, h('h1', { id: 'confirm-dialog-title' }, '¿Borrar todas las corridas de este navegador?')),
      h('div', { class: 'modal-body' }, h('p', { style: { margin: 0 } }, `Se eliminarán ${state.runs.length} corridas y sus lecturas de este navegador. La placa no se modifica. Descarga antes un respaldo JSON si necesitas conservarlas.`)),
      h('div', { class: 'modal-foot' },
        h('button', { class: 'btn btn-danger', value: 'clear' }, 'Borrar datos locales'),
        h('button', { class: 'btn btn-ghost', value: 'cancel', autofocus: true }, 'Conservar'))));
    dlg.addEventListener('close', async function onClose() {
      dlg.removeEventListener('close', onClose);
      if (dlg.returnValue === 'clear') { await clearLocalData(); announce('Datos locales borrados.'); }
      dlg.returnValue = '';
    });
    dlg.showModal();
  }
  const off = on('runs', renderData);
  renderData();
  return { el, destroy: off };
}
