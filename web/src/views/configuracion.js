// Configuración: origen de los datos (demostración o Servidor Ahgora), importación, datos locales.
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { announce } from '../lib/announce.js';
import { state, on } from '../state.js';
import { persistGranted, requestPersist } from '../store.js';
import { switchMode } from '../components/shell.js';
import { downloadText, parseCsv, stamp } from '../csv.js';
import { cloudCfg, saveCloudCfg, testCloud } from '../cloud.js';
import { syncNube, importMuestras, resetDemo, clearLocal } from '../data.js';
import { viewHeader, dl, formDialog } from './common.js';

export function configuracionView() {
  const modeForm = h('form', { class: 'card', 'aria-labelledby': 'cfg-mode', onsubmit: (e) => {
    e.preventDefault();
    const m = modeForm.elements.modo.value;
    if (m !== state.mode) switchMode(m);
  } },
    h('h2', { class: 'card-title', id: 'cfg-mode' }, 'Origen de los datos'),
    h('fieldset', { class: 'radio-group', style: { marginTop: 'var(--sp-3)' } }, h('legend', { class: 'sr-only' }, 'Origen'),
      h('label', { class: 'check' }, h('input', { type: 'radio', name: 'modo', value: 'nube', checked: state.mode === 'nube' || null }),
        h('span', null, 'Servidor Ahgora', h('small', null, 'Muestras que la app modo técnico sincronizó (MongoDB, vía la API del equipo). Los cambios de esta web se envían al servidor.'))),
      h('label', { class: 'check' }, h('input', { type: 'radio', name: 'modo', value: 'demo', checked: state.mode === 'demo' || null }),
        h('span', null, 'Demostración', h('small', null, 'Muestras, comunidades y resultados ficticios para ensayar. Todo queda marcado como demostración y no se envía al servidor.')))),
    h('div', { class: 'view-actions' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Aplicar')));

  // ---------------- servidor
  const cc = cloudCfg();
  const cloudStatus = h('p', { class: 'meta', role: 'status', style: { margin: 0 } }, state.nube.mensaje || (cc.ultima ? `Último envío: ${new Date(cc.ultima).toLocaleString('es-BO')}` : 'Sin sincronizar todavía.'));
  const apiIn = h('input', { class: 'input mono', id: 'cl-api', name: 'api', type: 'url', autocomplete: 'off', spellcheck: 'false', placeholder: 'https://tu-proyecto.vercel.app', value: cc.api || '' });
  const keyIn = h('input', { class: 'input mono', id: 'cl-key', name: 'key', type: 'password', autocomplete: 'off', value: cc.key || '' });
  const say = (t) => { cloudStatus.textContent = t; announce(t); };
  const saveCfg = () => saveCloudCfg({ ...cloudCfg(), api: apiIn.value.trim().replace(/\/$/, ''), key: keyIn.value });
  const cloudCard = h('form', { class: 'card', 'aria-labelledby': 'cfg-cloud', onsubmit: (e) => e.preventDefault() },
    h('h2', { class: 'card-title', id: 'cfg-cloud' }, 'Servidor Ahgora'),
    h('p', { class: 'meta' }, 'Base de datos central que reúne los resultados de campo y las confirmaciones del laboratorio. La clave del equipo queda solo en este navegador.'),
    h('div', { class: 'fields' },
      h('div', { class: 'field' }, h('label', { for: 'cl-api' }, 'Dirección de la API'), apiIn),
      h('div', { class: 'field' }, h('label', { for: 'cl-key' }, 'Clave del equipo'), keyIn)),
    h('div', { class: 'view-actions' },
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: async () => {
        saveCfg(); say('Probando conexión…');
        try { const r = await testCloud(cloudCfg()); say(`Conexión correcta con la base «${r.base}».`); } catch (e) { say(`No se pudo conectar: ${e.message}`); }
      } }, icon('sync'), 'Probar conexión'),
      h('button', { class: 'btn btn-primary', type: 'button', disabled: state.mode !== 'nube', onclick: async () => { saveCfg(); await syncNube(); say(state.nube.mensaje); } }, 'Sincronizar ahora')),
    state.mode !== 'nube' ? h('p', { class: 'meta', style: { margin: 0 } }, 'Para sincronizar, cambia el origen a «Servidor Ahgora».') : null,
    cloudStatus);

  // ---------------- importar
  const fileIn = h('input', { type: 'file', accept: '.json,.csv,application/json,text/csv', class: 'sr-only', id: 'imp-file', onchange: async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const text = await f.text();
      const data = /\.csv$/i.test(f.name) ? parseCsv(text) : (() => { const j = JSON.parse(text); return Array.isArray(j) ? j : j.muestras || []; })();
      const n = await importMuestras(state.mode === 'demo' ? data.map((m) => ({ ...m, demostracion: true })) : data);
      announce(`Importadas ${n} muestras nuevas (${data.length - n} ya existían).`);
      importStatus.textContent = `Importadas ${n} muestras nuevas (${data.length - n} ya existían).`;
    } catch (err) { importStatus.textContent = `No se pudo importar: ${err.message}`; }
    e.target.value = '';
  } });
  const importStatus = h('p', { class: 'meta', role: 'status', style: { margin: 0 } });
  const importCard = h('section', { class: 'card', 'aria-labelledby': 'cfg-imp' },
    h('h2', { class: 'card-title', id: 'cfg-imp' }, 'Importar registros'),
    h('p', { class: 'meta' }, 'JSON (lista de muestras o { muestras: [...] }) o CSV con la cabecera de exportación, por ejemplo desde la app modo técnico sin conexión. No se sobrescriben códigos existentes.'),
    h('div', { class: 'view-actions' }, h('label', { class: 'btn btn-ghost', for: 'imp-file' }, icon('upload'), 'Elegir archivo'), fileIn),
    importStatus);

  const dataCard = h('section', { class: 'card', 'aria-labelledby': 'cfg-data' });
  async function renderData() {
    const granted = await persistGranted();
    const n = state.muestras.length;
    mount(dataCard,
      h('h2', { class: 'card-title', id: 'cfg-data' }, 'Datos en este navegador'),
      dl([
        ['Almacenamiento', state.persistent ? 'IndexedDB de este navegador' : 'Solo en memoria (exporta antes de cerrar)'],
        ['Protección', granted ? 'Persistente' : 'Normal: el navegador podría liberar espacio'],
        ['Muestras', String(n)],
        ['Sin enviar al servidor', state.mode === 'nube' ? String(state.muestras.filter((m) => m.pendiente_sync).length) : '—'],
      ]),
      h('div', { class: 'view-actions' },
        granted ? null : h('button', { class: 'btn btn-ghost', type: 'button', onclick: async () => { const ok = await requestPersist(); announce(ok ? 'Almacenamiento persistente concedido.' : 'El navegador no lo concedió.'); renderData(); } }, 'Pedir almacenamiento persistente'),
        h('button', { class: 'btn btn-ghost', type: 'button', disabled: !n, onclick: () => { downloadText(JSON.stringify({ generado: new Date().toISOString(), muestras: state.muestras }, null, 2), `ahgora_respaldo_${stamp(state.mode === 'demo')}.json`, 'application/json'); announce('Respaldo JSON descargado.'); } }, icon('download'), 'Respaldo JSON'),
        state.mode === 'demo'
          ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: async () => { await resetDemo(); announce('Demostración restablecida.'); } }, icon('sync'), 'Restablecer demostración')
          : h('button', { class: 'btn btn-danger', type: 'button', disabled: !n, onclick: async () => {
            const ok = await formDialog({ title: '¿Borrar la copia local?', intro: 'Se borran las muestras guardadas en este navegador. El servidor no se modifica, pero los cambios sin enviar se pierden.', submit: 'Borrar copia local', danger: true });
            if (ok) { await clearLocal(); announce('Copia local borrada.'); }
          } }, 'Borrar copia local')));
  }

  const about = h('section', { class: 'card', 'aria-labelledby': 'cfg-about' },
    h('h2', { class: 'card-title', id: 'cfg-about' }, 'Acerca de Ahgora Web'),
    dl([
      ['Para quién', 'Autoridades ambientales y de salud, laboratorios, investigadores y cooperación'],
      ['Registro', 'código, matriz, coordenadas, fecha, responsable, lecturas crudas, valor estimado, semáforo, controles, versión de calibración, certeza, laboratorio, visibilidad (7.6)'],
      ['API', 'GET /api/datos?coleccion=muestras · POST /api/sync · GET /api/alertas (público)'],
      ['Mapa', 'Natural Earth 1:10m (dominio público) · relieve ETOPO1 (NOAA) · capas NASA GIBS'],
      ['Tipografía', 'Atkinson Hyperlegible Next y Mono (SIL OFL)'],
      ['Límite', 'Cribado: prioriza la confirmación en laboratorio, no la reemplaza.'],
    ]));

  const el = h('div', { class: 'view' },
    viewHeader('Configuración', 'Opciones de esta web. Se guardan en este navegador.'),
    h('div', { class: 'two-col' }, modeForm, cloudCard, importCard, dataCard, about));
  const offs = [on('muestras', renderData), on('nube', () => { if (state.nube.mensaje) cloudStatus.textContent = state.nube.mensaje; })];
  renderData();
  return { el, destroy() { offs.forEach((f) => f()); } };
}
