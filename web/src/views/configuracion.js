// Configuración: origen de los datos (demostración o Servidor Ahgora), importación, datos locales.
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { announce } from '../lib/announce.js';
import { state, on } from '../state.js';
import { persistGranted, requestPersist } from '../store.js';
import { switchMode } from '../components/shell.js';
import { downloadText, parseCsv, stamp } from '../csv.js';
import { cloudCfg, saveCloudCfg, testCloud, cloudReady, estadoBase, inicializarBase, borrarDemoServidor, pushMuestras, pushMape, pullLecturas } from '../cloud.js';
import * as fmt from '../lib/format.js';
import { demoMuestras, demoMape, DEMO_CUENCA } from '../data/demo.js';
import { SITIO, REFERENCIAS, ZONAS } from '../data/alcoche.js';
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
        h('span', null, 'Simulación', h('small', null, 'Sitio real (Alcoche) con muestras, resultados de laboratorio y estados legales simulados. Todo queda marcado como demostración y no se envía al servidor salvo que lo pidas abajo.')))),
    h('div', { class: 'view-actions' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Aplicar'),
      h('a', { class: 'btn btn-ghost', href: '#/simulador' }, icon('beaker_demo'), 'Elegir datos simulados')));

  // ---------------- servidor
  const cc = cloudCfg();
  const cloudStatus = h('p', { class: 'meta', role: 'status', style: { margin: 0 } }, state.nube.mensaje || (cc.ultima ? `Último envío: ${new Date(cc.ultima).toLocaleString('es-BO')}` : 'Sin sincronizar todavía.'));
  const apiIn = h('input', { class: 'input mono', id: 'cl-api', name: 'api', type: 'url', autocomplete: 'off', spellcheck: 'false', placeholder: 'https://tu-proyecto.vercel.app', value: cc.api || '' });
  const keyIn = h('input', { class: 'input mono', id: 'cl-key', name: 'key', type: 'password', autocomplete: 'off', value: cc.key || '' });
  const say = (t) => { cloudStatus.textContent = t; announce(t); };
  const saveCfg = () => saveCloudCfg({ ...cloudCfg(), api: apiIn.value.trim().replace(/\/$/, ''), key: keyIn.value });
  // La clave se guarda al escribirla (antes solo con «Probar conexión»): así «Lector en vivo» la usa enseguida.
  apiIn.addEventListener('change', () => { saveCfg(); buscarLectores(); });
  keyIn.addEventListener('change', () => { saveCfg(); buscarLectores(); });
  const cloudCard = h('form', { class: 'card', 'aria-labelledby': 'cfg-cloud', onsubmit: (e) => e.preventDefault() },
    h('h2', { class: 'card-title', id: 'cfg-cloud' }, 'Servidor Ahgora'),
    h('p', { class: 'meta' }, 'Base de datos central que reúne los resultados de campo y las confirmaciones del laboratorio. La clave del equipo queda solo en este navegador.'),
    h('div', { class: 'fields' },
      h('div', { class: 'field' }, h('label', { for: 'cl-api' }, 'Dirección de la API'), apiIn),
      h('div', { class: 'field' }, h('label', { for: 'cl-key' }, 'Clave del equipo'), keyIn)),
    h('div', { class: 'view-actions' },
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: async () => {
        saveCfg(); say('Probando conexión…');
        try { const r = await testCloud(cloudCfg()); say(`Conexión correcta con la base «${r.base}».`); buscarLectores(); } catch (e) { say(`No se pudo conectar: ${e.message}`); }
      } }, icon('sync'), 'Probar conexión'),
      h('button', { class: 'btn btn-primary', type: 'button', disabled: state.mode !== 'nube', onclick: async () => { saveCfg(); await syncNube(); say(state.nube.mensaje); } }, 'Sincronizar ahora')),
    state.mode !== 'nube' ? h('p', { class: 'meta', style: { margin: 0 } }, 'Para sincronizar, cambia el origen a «Servidor Ahgora».') : null,
    cloudStatus);

  // ---------------- lector ESP32 por WiFi (colección «lecturas»)
  const lectorInfo = h('div', { role: 'status' }, h('p', { class: 'meta', style: { margin: 0 } }, 'Escribe la clave del equipo arriba para ver los lectores.'));
  async function buscarLectores() {
    if (!cloudReady()) { mount(lectorInfo, h('p', { class: 'meta', style: { margin: 0 } }, 'Escribe la clave del equipo arriba para ver los lectores.')); return; }
    mount(lectorInfo, h('p', { class: 'meta', style: { margin: 0 } }, 'Buscando lectores…'));
    try {
      const { nodos } = await pullLecturas({ limit: 1 });
      mount(lectorInfo, nodos.length
        ? h('ul', { class: 'limits' }, nodos.map((n) => {
          const t = new Date(n.ultima.recibido_en).getTime();
          const vivo = Date.now() - t < 20000;
          return h('li', null, h('strong', null, n.node_id), ` · ${vivo ? 'enviando ahora' : 'sin señal'} · última lectura ${fmt.ago(t)} · ${fmt.int(n.total_24h)} en 24 h`);
        }))
        : h('p', { class: 'meta', style: { margin: 0 } }, 'Todavía no llegó ninguna lectura del lector.'));
    } catch (e) { mount(lectorInfo, h('p', { class: 'form-error', style: { margin: 0 } }, `No se pudo consultar: ${e.message}`)); }
  }
  const lectorCard = h('section', { class: 'card', 'aria-labelledby': 'cfg-lector' },
    h('h2', { class: 'card-title', id: 'cfg-lector' }, 'Lector ESP32 (WiFi)'),
    h('p', { class: 'meta' }, 'Lectores que enviaron señal cruda del sensor a la colección «lecturas» desde el hotspot del celular.'),
    lectorInfo,
    h('div', { class: 'view-actions' },
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { saveCfg(); buscarLectores(); } }, icon('sync'), 'Actualizar'),
      h('a', { class: 'btn btn-primary', href: '#/lector' }, 'Ver en vivo')));

  // ---------------- base de datos del servidor (MongoDB «ahgora»)
  const dbStatus = h('p', { class: 'meta', role: 'status', style: { margin: 0 } });
  const dbTable = h('div', { class: 'table-wrap' });
  const dbSay = (t) => { dbStatus.textContent = t; announce(t); };
  const NOMBRES = { muestras: 'Muestras (registro técnico)', avisos: 'Avisos públicos (Ahgora Comunidad)', bitacora: 'Bitácora de publicación', zonas: 'Zonas públicas (0,1°)', reportes: 'Reportes comunitarios', lecturas: 'Lecturas del lector ESP32 (WiFi)', mape: 'Unidades mineras (MAPE)', sitios: 'Sitio piloto', referencias: 'Antecedentes' };
  function showEstado(r) {
    mount(dbTable, h('table', { class: 'data-table compact db-table' },
      h('caption', { class: 'sr-only' }, `Colecciones de la base ${r.base}`),
      h('thead', null, h('tr', null, ['Colección', 'Validador', 'Documentos', 'Simulados'].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', null, Object.entries(r.colecciones).map(([k, c]) => h('tr', null,
        h('th', { scope: 'row' }, NOMBRES[k] || k, h('div', { class: 'meta mono' }, k)),
        h('td', null, c.validador ? h('span', { class: 'db-ok' }, 'Sí') : h('span', { class: 'db-no' }, c.existe ? 'No' : 'Falta')),
        h('td', { class: 'num mono' }, fmtN(c.documentos)),
        h('td', { class: 'num mono' }, c.demostracion == null ? '—' : fmtN(c.demostracion)))))));
  }
  const fmtN = (n) => new Intl.NumberFormat('es-BO').format(n ?? 0);
  const conClave = async (fn) => {
    saveCfg();
    if (!cloudReady()) { dbSay('Escribe la clave del equipo arriba (Servidor Ahgora) y vuelve a intentar.'); return; }
    try { await fn(); } catch (e) { dbSay(`No se pudo: ${e.message}`); }
  };
  const dbCard = h('section', { class: 'card', 'aria-labelledby': 'cfg-db' },
    h('h2', { class: 'card-title', id: 'cfg-db' }, 'Base de datos del servidor'),
    h('p', { class: 'meta' }, 'Base «ahgora» en MongoDB Atlas, con la estructura de la guía vigente: muestras, avisos públicos con versión y retiro, bitácora, zonas, reportes, unidades mineras, sitio y antecedentes. Cada colección valida sus documentos.'),
    dbTable,
    h('div', { class: 'view-actions' },
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => conClave(async () => { dbSay('Consultando…'); const r = await estadoBase(); showEstado(r); dbSay(`Base «${r.base}» conectada.`); }) }, icon('database'), 'Ver estado'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => conClave(async () => {
        dbSay('Preparando colecciones y cargando el sitio Alcoche…');
        await inicializarBase({ por: 'Ahgora Web', sitio: { ...SITIO, eje: DEMO_CUENCA.eje, comunidades: DEMO_CUENCA.comunidades }, referencias: REFERENCIAS, zonas: ZONAS });
        dbSay('Enviando la simulación (muestras del lector y registro MAPE)…');
        const nm = await pushMuestras(demoMuestras());
        const nu = await pushMape(demoMape());
        const r = await estadoBase(); showEstado(r);
        dbSay(`Listo: ${nm} muestras y ${nu} unidades mineras simuladas en «${r.base}». Los avisos aprobados ya están en /api/public/avisos.`);
        if (state.mode === 'nube') syncNube();
      }) }, icon('upload'), 'Preparar base y cargar simulación'),
      h('button', { class: 'btn btn-danger', type: 'button', onclick: () => conClave(async () => {
        const ok = await formDialog({ title: '¿Borrar la simulación del servidor?', intro: 'Se borran del servidor solo los registros marcados como demostración (muestras, avisos y unidades mineras simuladas) y las lecturas del simulador en PC. Los datos reales no se tocan.', submit: 'Borrar simulación', danger: true });
        if (!ok) return;
        const r = await borrarDemoServidor(); showEstado(r);
        dbSay(`Borrados: ${r.borrados.muestras} muestras, ${r.borrados.avisos} avisos, ${r.borrados.mape} unidades y ${r.borrados.lecturas ?? 0} lecturas simuladas.`);
        if (state.mode === 'nube') syncNube();
      }) }, 'Borrar simulación')),
    dbStatus,
    h('details', { class: 'layers-limits' }, h('summary', null, 'Simular el lector ESP32 en vivo'),
      h('p', { class: 'meta' }, 'Desde la carpeta del proyecto, con la clave del equipo. Envía una muestra cada 20 segundos como lo haría la app modo técnico; aparecen aquí sin recargar (modo servidor).'),
      h('pre', { class: 'formula mono' }, 'cd server\nnode scripts/simular-esp32.mjs --key <clave> --n 6 --cada 20')));

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
      ['API', 'POST /api/sync · GET /api/datos · GET|POST /api/admin · GET /api/public/zonas y /api/public/avisos (públicos, guía 09) · GET /api/alertas · /api/reportes · /api/lecturas (lector ESP32)'],
      ['Mapa', 'Natural Earth 1:10m · relieve ETOPO1 (NOAA) · OpenStreetMap (ODbL) · Amazon Mining Watch (CC BY 4.0) · Sentinel-2 cloudless (EOX) · NASA GIBS'],
      ['Datos del sitio', 'GloFAS y ERA5 vía Open-Meteo · SoilGrids 2.0 (ISRIC) · GBIF · NASA POWER'],
      ['Tipografía', 'Atkinson Hyperlegible Next y Mono (SIL OFL)'],
      ['Límite', 'Cribado: prioriza la confirmación en laboratorio, no la reemplaza.'],
    ]));

  const el = h('div', { class: 'view' },
    viewHeader('Configuración', 'Opciones de esta web. Se guardan en este navegador.'),
    h('div', { class: 'two-col' }, modeForm, cloudCard, lectorCard, dbCard, importCard, dataCard, about));
  const offs = [on('muestras', renderData), on('nube', () => { if (state.nube.mensaje) cloudStatus.textContent = state.nube.mensaje; })];
  renderData();
  buscarLectores();
  return { el, destroy() { offs.forEach((f) => f()); } };
}
