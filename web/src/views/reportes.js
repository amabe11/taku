// Reportes comunitarios (guía, sección 06 «Ayuda y participación»): lo que la comunidad cuenta desde
// Ahgora Comunidad. Orientan dónde muestrear; no son avisos, no se publican y no son evidencia.
// Se cruzan con las muestras por zona (celda de 0,1°) para ver dónde hay reportes y todavía no hay muestras.
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { announce } from '../lib/announce.js';
import * as fmt from '../lib/format.js';
import { state, on } from '../state.js';
import { zonaPublica } from '../model.js';
import { TIPOS_REPORTE, loadReportes, zonaKey } from '../data/reportes.js';
import { viewHeader, emptyState } from './common.js';

const PERIODOS = [['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días'], ['', 'Todo']];
const dias = (iso) => (Date.now() - new Date(iso).getTime()) / 86400000;

/** Nombre legible de una zona: comunidad de la cuenca configurada que cae en ella, o su rango. */
function nombreZona(z) {
  if (!z) return 'Sin zona (la persona no la compartió)';
  const com = state.cuenca?.comunidades?.find((c) => zonaKey(zonaPublica(c.lat, c.lon)) === zonaKey(z));
  const rango = `${Math.abs(z.lat_max).toFixed(1)}–${Math.abs(z.lat_min).toFixed(1)}° S · ${Math.abs(z.lon_max).toFixed(1)}–${Math.abs(z.lon_min).toFixed(1)}° O`;
  return com ? `${com.nombre} · ${rango}` : `Zona ${rango}`;
}

const tipoTag = (tipo) => {
  const t = TIPOS_REPORTE[tipo] || TIPOS_REPORTE.otro;
  return h('span', { class: 'chip' }, icon(t.icon), t.label);
};

export function reportesView() {
  const host = h('div', { class: 'stack' });
  const filtros = { tipo: '', periodo: '30' };
  let reportes = null;
  let error = null;

  async function cargar() {
    error = null;
    if (reportes) announce('Actualizando reportes…');
    try { reportes = await loadReportes(); } catch (e) { error = e; reportes = reportes || []; }
    render();
  }

  const select = (name, label, opciones) => h('div', { class: 'field' },
    h('label', { for: `rep-${name}` }, label),
    h('div', { class: 'select-wrap' },
      h('select', { class: 'select', id: `rep-${name}`, name, onchange: (e) => { filtros[name] = e.target.value; render(); } },
        opciones.map(([v, l]) => h('option', { value: v, selected: filtros[name] === v || null }, l)))));

  function render() {
    if (reportes == null) { mount(host, h('p', { class: 'meta' }, 'Cargando reportes…')); return; }
    if (error?.sinConfig) {
      mount(host, emptyState({
        iconName: 'settings', title: 'Falta la clave del equipo',
        text: 'Los reportes comunitarios solo los ve el equipo. Escribe la clave del Servidor Ahgora en Configuración.',
        actions: [h('a', { class: 'btn btn-primary', href: '#/configuracion' }, 'Ir a Configuración')],
      }));
      return;
    }
    const lista = reportes
      .filter((r) => !filtros.tipo || r.tipo === filtros.tipo)
      .filter((r) => !filtros.periodo || dias(r.creado_en || r.recibido_en) <= Number(filtros.periodo))
      .sort((a, b) => new Date(b.creado_en || b.recibido_en) - new Date(a.creado_en || a.recibido_en));

    // Muestras por zona pública, para cruzar con los reportes.
    const muestrasPorZona = new Map();
    for (const m of state.muestras) {
      if (m.lat == null || m.lon == null) continue;
      const k = zonaKey(zonaPublica(m.lat, m.lon));
      muestrasPorZona.set(k, [...(muestrasPorZona.get(k) || []), m]);
    }
    const zonas = new Map();
    for (const r of lista) {
      const k = zonaKey(r.zona);
      const z = zonas.get(k) || { zona: r.zona, reportes: [], tipos: new Set() };
      z.reportes.push(r); z.tipos.add(r.tipo);
      zonas.set(k, z);
    }
    const filasZona = [...zonas.entries()]
      .map(([k, z]) => ({ ...z, k, muestras: k === 'sin_zona' ? null : (muestrasPorZona.get(k) || []) }))
      // Primero las zonas con reportes y sin muestras; después, las de más reportes.
      .sort((a, b) => Number(b.muestras?.length === 0) - Number(a.muestras?.length === 0) || b.reportes.length - a.reportes.length);
    const sinMuestras = filasZona.filter((z) => z.muestras && z.muestras.length === 0);
    const rojas = (ms) => ms.filter((m) => m.semaforo === 'rojo').length;

    mount(host,
      error ? h('p', { class: 'form-error', role: 'alert' }, `No se pudieron traer los reportes del servidor: ${error.message}. Se muestra lo último cargado.`) : null,
      h('section', { class: 'card' },
        h('h2', { class: 'card-title' }, 'Para qué sirven'),
        h('p', { class: 'meta', style: { margin: 0 } },
          'Los envían comunarios desde Ahgora Comunidad, con su consentimiento. Ayudan a decidir dónde tomar muestras. ',
          h('b', null, 'No son avisos, no se publican y no son evidencia'), ': quedan en revisión del equipo. ',
          'Solo traen una zona de unos 11 km, sin nombres ni ubicación exacta.')),
      h('div', { class: 'stat-grid' },
        stat('Reportes', fmt.int(lista.length), PERIODOS.find(([v]) => v === filtros.periodo)?.[1]),
        stat('Últimos 7 días', fmt.int(lista.filter((r) => dias(r.creado_en || r.recibido_en) <= 7).length)),
        stat('Zonas con reportes', fmt.int(filasZona.filter((z) => z.k !== 'sin_zona').length)),
        stat('Zonas sin muestras', fmt.int(sinMuestras.length), sinMuestras.length ? 'considerar muestreo' : 'todas tienen muestras')),
      h('form', { class: 'card filters', onsubmit: (e) => e.preventDefault(), 'aria-label': 'Filtrar reportes' },
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-3)', alignItems: 'end' } },
          select('tipo', 'Qué vieron', [['', 'Todos'], ...Object.entries(TIPOS_REPORTE).map(([k, v]) => [k, v.label])]),
          select('periodo', 'Período', PERIODOS))),

      h('section', { 'aria-labelledby': 'rep-z' },
        h('h2', { class: 'section-title', id: 'rep-z' }, 'Zonas para considerar en el muestreo'),
        filasZona.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'data-table compact' },
          h('caption', null, 'Primero las zonas con reportes y sin muestras; luego las de más reportes.'),
          h('thead', null, h('tr', null,
            h('th', { scope: 'col' }, 'Zona'), h('th', { scope: 'col', class: 'num' }, 'Reportes'), h('th', { scope: 'col' }, 'Qué vieron'),
            h('th', { scope: 'col' }, 'Último'), h('th', { scope: 'col' }, 'Muestras en la zona'))),
          h('tbody', null, filasZona.map((z) => h('tr', null,
            h('th', { scope: 'row' }, nombreZona(z.zona)),
            h('td', { class: 'num' }, fmt.int(z.reportes.length)),
            h('td', null, [...z.tipos].map((t) => TIPOS_REPORTE[t]?.label || t).join(' · ')),
            h('td', null, fmt.dateOnly(z.reportes[0].creado_en || z.reportes[0].recibido_en)),
            h('td', null, z.muestras == null ? '—'
              : z.muestras.length === 0 ? h('span', { class: 'pill', style: { color: 'var(--color-warn)' } }, icon('flag'), 'Sin muestras: considerar muestreo')
                : `${z.muestras.length} (${rojas(z.muestras)} en rojo)`)))))) : h('p', { class: 'meta' }, 'No hay reportes con estos filtros.')),

      h('section', { 'aria-labelledby': 'rep-l' },
        h('h2', { class: 'section-title', id: 'rep-l' }, `Reportes · ${lista.length}`),
        lista.length ? h('ul', { class: 'alert-list' }, lista.map((r) => h('li', { class: 'card' },
          h('div', { class: 'card-head' },
            tipoTag(r.tipo),
            h('span', { class: 'meta' }, fmt.dateTime(r.creado_en || r.recibido_en))),
          h('p', { style: { margin: 'var(--sp-2) 0' } }, r.descripcion || h('span', { class: 'meta' }, 'Sin detalles.')),
          h('div', { class: 'badge-row' },
            h('span', { class: 'meta' }, nombreZona(r.zona)),
            h('span', { class: 'chip chip-dashed' }, 'En revisión'),
            r.demostracion ? h('span', { class: 'prov', dataset: { prov: 'archivo_prueba' } }, 'Demostración') : null))))
          : emptyState({ iconName: 'flag', title: 'Sin reportes', text: state.mode === 'demo' ? 'No hay reportes de ejemplo con estos filtros.' : 'Todavía no llegaron reportes desde Ahgora Comunidad, o no hay con estos filtros.' })));
  }

  const actualizar = h('button', { class: 'btn btn-ghost', type: 'button', onclick: cargar }, icon('sync'), 'Actualizar');
  const offM = on('muestras', render); // las muestras cargan después: recalcula el cruce por zona
  render();
  cargar();
  return {
    el: h('div', { class: 'view view-wide' },
      viewHeader('Reportes comunitarios', 'Lo que la comunidad vio y reportó desde Ahgora Comunidad, cruzado con las muestras de cada zona.', actualizar),
      host),
    destroy: offM,
  };
}

const stat = (k, v, note) => h('div', { class: 'card stat' }, h('span', { class: 'stat-k' }, k), h('span', { class: 'stat-v' }, v), note ? h('span', { class: 'metric-note' }, note) : null);
