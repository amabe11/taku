// Vista «Minería (MAPE)»: registro de unidades mineras de pequeña escala con su estado legal.
//   verde · papeles al día (contrato administrativo minero / licencia y licencia ambiental vigentes)
//   amarillo · papeles en trámite ante la AJAM
//   rojo · ilegal (constatado por la AJAM) o presunta ilegal (denuncia, o huella satelital fuera del registro)
// No existe una API pública con el estado legal de cada cooperativa: la AJAM publica su catastro minero como
// productos impresos y en trámites. Por eso el registro se carga (JSON, CSV o GeoJSON) y se cruza con las
// huellas satelitales de Amazon Mining Watch. La legalidad la determina la AJAM, no Ahgora.
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { announce } from '../lib/announce.js';
import { state, on, emit, writePref } from '../state.js';
import { LEGAL, BASE_LEGAL, SEMAFORO, distanciaKm } from '../model.js';
import { legalBadge, demoSeal, semaforoBadge } from '../components/badges.js';
import { GEO } from '../data/alcoche.js';
import { parseCsv, downloadText, stamp } from '../csv.js';
import { pushMape, cloudReady } from '../cloud.js';
import { viewHeader } from './common.js';

const FUENTES = [
  ['Amazon Mining Watch', 'Huellas de minería aurífera detectadas con IA en Sentinel-2, parches de 480 m, 2018–2026. GeoJSON abierto (CC BY 4.0). Es la base del mapa MAPE.', 'https://source.coop/earthgenome/amazon-mining-watch', 'Conectada'],
  ['AJAM · catastro y registro minero', 'Áreas libres, en trámite y con derecho vigente (contrato administrativo minero o licencia). Se obtiene por solicitud a la Dirección de Catastro y Cuadriculado Minero; no tiene API pública.', 'https://www.autoridadminera.gob.bo/', 'Por solicitud'],
  ['AJAM · estadísticas de minería ilegal', 'Denuncias atendidas e intervenciones por departamento (PDF). Útil para respaldar el estado «ilegal».', 'https://www.autoridadminera.gob.bo/wp-content/uploads/2025/10/Estadisticas-mineria-ilegal-3.pdf', 'Documento'],
  ['RAISG · minería ilegal en la Amazonía', 'Puntos y áreas de minería ilegal reportados en seis países amazónicos (plataforma en línea).', 'https://www.amazoniasocioambiental.org/', 'Plataforma'],
  ['MapBiomas Bolivia', 'Cobertura y uso del suelo anual, con clase de minería, y límites (municipios, cuencas, áreas protegidas).', 'https://bolivia.mapbiomas.org/', 'Descarga'],
  ['Sentinel-2 sin nubes (EOX)', 'Mosaicos anuales de 10 m (2016–2025) para comparar antes y después en el mismo mapa.', 'https://s2maps.eu/', 'Conectada'],
];

export function mapeView() {
  const filtro = { estado: '', texto: '' };
  const host = h('div', { class: 'stack' });
  const fileStatus = h('p', { class: 'meta', role: 'status', style: { margin: 0 } });

  const fileIn = h('input', { type: 'file', class: 'sr-only', id: 'mape-file', accept: '.json,.geojson,.csv,application/json,application/geo+json,text/csv', onchange: async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const text = await f.text();
      let list;
      if (/\.csv$/i.test(f.name)) list = parseCsv(text);
      else {
        const j = JSON.parse(text);
        list = j.type === 'FeatureCollection'
          ? j.features.map((ft) => { const c = ft.geometry?.type === 'Point' ? ft.geometry.coordinates : centro(ft.geometry); return { ...ft.properties, lon: c?.[0], lat: c?.[1] }; })
          : Array.isArray(j) ? j : j.mape || [];
      }
      const validas = list.filter((u) => u.id && u.nombre && Number.isFinite(Number(u.lat)) && Number.isFinite(Number(u.lon)) && LEGAL[u.estado_legal])
        .map((u) => ({ ...u, lat: Number(u.lat), lon: Number(u.lon), demostracion: state.mode === 'demo' || !!u.demostracion }));
      const porId = new Map(state.mape.map((u) => [u.id, u]));
      for (const u of validas) porId.set(u.id, { ...porId.get(u.id), ...u });
      state.mape = [...porId.values()];
      emit('mape');
      let msg = `Cargadas ${validas.length} unidades (${list.length - validas.length} descartadas por falta de id, nombre, ubicación o estado_legal).`;
      if (state.mode === 'nube' && validas.length && cloudReady()) { await pushMape(validas); msg += ' Enviadas al servidor.'; writePref('ahg.mape.cache', state.mape); }
      fileStatus.textContent = msg; announce(msg);
    } catch (err) { fileStatus.textContent = `No se pudo leer el archivo: ${err.message}`; }
    e.target.value = '';
  } });

  const titulo = h('h2', { class: 'card-title' });
  const box = h('div', { class: 'table-wrap' });
  function lista() {
    const q = filtro.texto.trim().toLowerCase();
    const orden = ['ilegal', 'en_tramite', 'al_dia'];
    return state.mape
      .filter((u) => !filtro.estado || u.estado_legal === filtro.estado)
      .filter((u) => !q || `${u.nombre} ${u.rio} ${u.municipio}`.toLowerCase().includes(q))
      .sort((a, b) => orden.indexOf(a.estado_legal) - orden.indexOf(b.estado_legal) || (b.huella?.parches || 0) - (a.huella?.parches || 0));
  }
  function renderTabla() {
    const L = lista();
    titulo.textContent = filtro.estado ? `${LEGAL[filtro.estado].label} · ${L.length}` : `Unidades registradas · ${L.length}`;
    const rows = L.map((u) => {
      const cerca = state.muestras.filter((m) => m.lat != null && distanciaKm(m.lon, m.lat, u.lon, u.lat) <= 3);
      const peor = cerca.map((m) => m.semaforo).sort((a, b) => (SEMAFORO[a]?.orden ?? 9) - (SEMAFORO[b]?.orden ?? 9))[0];
      return h('tr', null,
        h('th', { scope: 'row' }, h('a', { class: 'row-link', href: `#/mapa/${encodeURIComponent(u.id)}` }, u.nombre), u.demostracion ? h('div', null, demoSeal(u)) : null),
        h('td', null, legalBadge(u)),
        h('td', null, BASE_LEGAL[u.base_estado] || '—', u.fuente ? h('div', { class: 'meta' }, u.fuente) : null),
        h('td', { class: 'num' }, u.huella ? `${u.huella.parches} · ${u.huella.desde}` : '—'),
        h('td', null, u.rio || '—'),
        h('td', null, cerca.length ? h('span', { class: 'badge-row' }, String(cerca.length), peor ? semaforoBadge(peor) : null) : h('span', { class: 'meta' }, 'Sin muestras: muestrear')));
    });
    mount(box, rows.length ? h('table', { class: 'data-table mape-table' },
      h('caption', { class: 'sr-only' }, 'Unidades mineras con su estado legal, la base de ese estado, su huella satelital y las muestras cercanas.'),
      h('thead', null, h('tr', null, ['Unidad', 'Estado legal', 'De dónde sale el estado', 'Huella (parches · desde)', 'Río', 'Muestras ≤ 3 km'].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', null, rows)) : h('p', { class: 'meta' }, 'Ninguna unidad con ese filtro.'));
  }
  const buscar = h('input', { class: 'input', id: 'mape-q', type: 'search', placeholder: 'Buscar por nombre o río', oninput: (e) => { filtro.texto = e.target.value; renderTabla(); } });

  function render() {
    const asignadas = new Set(state.mape.map((u) => u.id));
    const sinVerif = GEO.frentes.filter((_, i) => !asignadas.has(`mape-amw-${i}`));
    const n = (k) => state.mape.filter((u) => u.estado_legal === k).length;
    const cats = h('div', { class: 'legal-cats' }, ['al_dia', 'en_tramite', 'ilegal'].map((key) => h('button', {
      class: 'legal-cat', type: 'button', 'aria-pressed': String(filtro.estado === key), dataset: { legal: key },
      onclick: () => { filtro.estado = filtro.estado === key ? '' : key; render(); },
    }, h('span', { class: 'legal-cat-n mono' }, String(n(key))), legalBadge({ estado_legal: key }), h('span', { class: 'legal-cat-t' }, LEGAL[key].significa))));
    mount(host,
      cats,
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, titulo,
          h('div', { class: 'view-actions' }, h('label', { class: 'sr-only', for: 'mape-q' }, 'Buscar'), buscar)),
        box,
        h('p', { class: 'meta', style: { margin: 'var(--sp-2) 0 0' } }, `${sinVerif.length} grupos de huellas más (${sinVerif.reduce((acc, f) => acc + f.parches, 0)} parches) siguen «sin verificar»: no están en el registro cargado y no se presume nada de ellos.`)),
      h('div', { class: 'two-col' },
        h('section', { class: 'card' },
          h('h2', { class: 'card-title' }, 'Fuentes de datos para la minería'),
          h('ul', { class: 'ref-list', style: { marginTop: 'var(--sp-3)' } }, FUENTES.map(([t, d, url, estado]) => h('li', null,
            h('a', { href: url, target: '_blank', rel: 'noopener' }, t, icon('external', { cls: 'inline-ic' })), h('span', { class: 'meta' }, `${estado} · ${d}`))))),
        h('section', { class: 'card' },
          h('h2', { class: 'card-title' }, 'Cargar el registro oficial'),
          h('p', { class: 'meta' }, 'Cuando la AJAM entregue el catastro o el listado de derechos, cárgalo aquí. Campos: id, nombre, tipo (cooperativa, empresa, unipersonal), estado_legal (al_dia, en_tramite, ilegal), base_estado (registro_ajam, tramite_ajam, inspeccion_ajam, denuncia, presuncion_satelital), fuente, lat, lon, rio, municipio. JSON, CSV o GeoJSON.'),
          h('div', { class: 'view-actions' },
            h('label', { class: 'btn btn-ghost', for: 'mape-file' }, icon('upload'), 'Elegir archivo'), fileIn,
            h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { downloadText(JSON.stringify({ generado: new Date().toISOString(), mape: state.mape }, null, 2), `ahgora_mape_${stamp(state.mode === 'demo')}.json`, 'application/json'); announce('Registro MAPE descargado.'); } }, icon('download'), 'Descargar registro')),
          fileStatus,
          h('p', { class: 'legal-note', style: { marginTop: 'var(--sp-3)' } }, icon('info'), 'Una huella satelital prueba que hubo remoción de suelo, no quién opera ni si tiene permiso. «Presunta ilegal» es una hipótesis para verificar con la AJAM, nunca una acusación.'))));
    renderTabla();
  }
  const offs = [on('mape', render), on('muestras', render)];
  render();
  const el = h('div', { class: 'view' },
    viewHeader('Minería (MAPE) y estado legal', 'Minería aurífera de pequeña escala en el Coroico y el Kaka: quién tiene los papeles al día, quién está en trámite y dónde hay minería ilegal o presunta ilegal. Se cruza con las muestras para decidir dónde intervenir.'),
    host);
  return { el, destroy() { offs.forEach((f) => f()); } };
}

function centro(g) {
  const pts = (g?.type === 'Polygon' ? g.coordinates[0] : g?.type === 'MultiPolygon' ? g.coordinates.flat(2) : []).filter(Array.isArray);
  if (!pts.length) return null;
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}
