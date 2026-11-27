// Lector en vivo: lo que el lector Ahgora (ESP32 + TCS34725) envía por WiFi a /api/lecturas.
// Sirve para montar y probar el nodo (guía de Loana, sección 06): ver si llega la señal, si es estable al
// reinsertar la tarjeta y si cambian los canales con cada color. Es señal óptica cruda: NO es mercurio.
import { h, s, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { announce } from '../lib/announce.js';
import * as fmt from '../lib/format.js';
import { cloudReady, pullLecturas } from '../cloud.js';
import { viewHeader, emptyState } from './common.js';

const CADA_MS = 3000;
const EN_LINEA_S = 20; // sin lecturas por más de 20 s = desconectado
const CANALES = [['r_norm', 'R', '#b3261e'], ['g_norm', 'G', '#1e6b3a'], ['b_norm', 'B', '#1d5b99']];

const hora = (l) => l.medido_en || l.recibido_en;
const segundosDesde = (iso) => (Date.now() - new Date(iso).getTime()) / 1000;
const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const cv = (xs) => { const m = media(xs); return m ? (Math.sqrt(media(xs.map((x) => (x - m) ** 2))) / m) * 100 : 0; };

/** Color aproximado que «ve» el sensor (proporciones R:G:B respecto del canal más alto). */
function colorAprox(l) {
  const max = Math.max(l.r, l.g, l.b, 1);
  const k = (v) => Math.round((v / max) * 255);
  return `rgb(${k(l.r)} ${k(l.g)} ${k(l.b)})`;
}

function grafico(lecturas) {
  const w = 640, alto = 200, pad = 28;
  const datos = [...lecturas].reverse(); // de la más vieja a la más nueva
  const valores = datos.flatMap((l) => CANALES.map(([k]) => l[k] ?? 0));
  const min = Math.min(...valores), max = Math.max(...valores);
  const rango = max - min || 1;
  const x = (i) => pad + (i / Math.max(datos.length - 1, 1)) * (w - pad * 2);
  const y = (v) => alto - pad - ((v - min) / rango) * (alto - pad * 2);
  const ultima = datos.at(-1);
  return s('svg', { viewBox: `0 0 ${w} ${alto}`, width: '100%', role: 'img', class: 'lector-grafico',
    'aria-label': `Canales normalizados de las últimas ${datos.length} lecturas. Última: R ${ultima.r_norm}, G ${ultima.g_norm}, B ${ultima.b_norm}.` },
  s('line', { x1: pad, y1: alto - pad, x2: w - pad, y2: alto - pad, stroke: 'currentColor', 'stroke-opacity': 0.25 }),
  s('text', { x: pad, y: 14, 'font-size': 11, fill: 'currentColor', 'fill-opacity': 0.7 }, `máx. ${fmt.tc(max)}`),
  s('text', { x: pad, y: alto - 8, 'font-size': 11, fill: 'currentColor', 'fill-opacity': 0.7 }, `mín. ${fmt.tc(min)} · ${datos.length} lecturas`),
  CANALES.map(([k, nombre, color]) => [
    s('polyline', { points: datos.map((l, i) => `${x(i).toFixed(1)},${y(l[k] ?? 0).toFixed(1)}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round' }),
    s('text', { x: w - pad + 4, y: y(ultima[k] ?? 0) + 4, 'font-size': 12, 'font-weight': 700, fill: color }, nombre),
  ]));
}

export function lectorView() {
  const host = h('div', { class: 'stack' });
  let datos = null, error = null, elegido = null, pausa = false, timer = null, cargando = false;

  async function cargar() {
    if (cargando || pausa || document.hidden) return;
    cargando = true;
    try { datos = await pullLecturas({ node_id: elegido, limit: 120 }); error = null; } catch (e) { error = e; }
    cargando = false;
    if (!elegido && datos?.nodos?.length) { elegido = datos.nodos[0].node_id; cargando = false; return cargar(); }
    render();
  }

  function tarjetaNodo(n) {
    const seg = segundosDesde(n.ultima.recibido_en);
    const vivo = seg < EN_LINEA_S;
    return h('button', { type: 'button', class: 'card lector-nodo', 'aria-pressed': String(n.node_id === elegido),
      onclick: () => { elegido = n.node_id; datos = null; render(); cargar(); } },
    h('div', { class: 'card-head' }, h('strong', null, n.node_id),
      h('span', { class: 'pill', dataset: { conn: vivo ? 'online' : 'offline' } }, icon(vivo ? 'wifi' : 'wifi_off'), vivo ? 'Enviando' : 'Sin señal')),
    h('p', { class: 'meta', style: { margin: 0 } },
      `Última lectura ${fmt.ago(new Date(n.ultima.recibido_en).getTime())} · ${fmt.int(n.total_24h)} en 24 h`,
      n.ultima.rssi != null ? ` · WiFi ${n.ultima.rssi} dBm` : '', n.ultima.firmware ? ` · ${n.ultima.firmware}` : ''));
  }

  function render() {
    if (!cloudReady()) {
      mount(host, emptyState({ iconName: 'settings', title: 'Falta la clave del equipo',
        text: 'Las lecturas del lector solo las ve el equipo. Escribe la dirección y la clave del Servidor Ahgora en Configuración.',
        actions: [h('a', { class: 'btn btn-primary', href: '#/configuracion' }, 'Ir a Configuración')] }));
      return;
    }
    if (!datos) { mount(host, error ? h('p', { class: 'form-error', role: 'alert' }, `No se pudo conectar: ${error.message}`) : h('p', { class: 'meta' }, 'Buscando lecturas…')); return; }
    const lect = datos.items || [];
    const nodos = datos.nodos || [];
    if (!nodos.length) {
      mount(host, emptyState({ iconName: 'wifi', title: 'Todavía no llegó ninguna lectura',
        text: 'Enciende el lector con el firmware «ahgora_lector_wifi», activa el hotspot del celular (2,4 GHz) y espera unos segundos. En el Monitor Serie debe aparecer «ENVIO: 10 lecturas al servidor».' }));
      return;
    }
    const u = lect[0];
    const ult10 = lect.slice(0, 10);
    const prom = ult10.length ? { r: media(ult10.map((l) => l.r)), g: media(ult10.map((l) => l.g)), b: media(ult10.map((l) => l.b)), c: media(ult10.map((l) => l.c)) } : null;
    const variacion = ult10.length > 1 ? cv(ult10.map((l) => l.c)) : null;

    mount(host,
      error ? h('p', { class: 'form-error', role: 'alert' }, `Se cortó la conexión con el servidor (${error.message}). Se muestran los últimos datos.`) : null,
      h('section', { 'aria-labelledby': 'lec-n' },
        h('h2', { class: 'section-title', id: 'lec-n' }, 'Lectores'),
        h('div', { class: 'lector-nodos' }, nodos.map(tarjetaNodo))),
      u ? h('section', { class: 'card', 'aria-labelledby': 'lec-a' },
        h('h2', { class: 'card-title', id: 'lec-a' }, `${elegido} · lectura actual`),
        h('div', { class: 'swatches' },
          h('figure', null, h('span', { class: 'swatch', style: { background: colorAprox(u) }, 'aria-hidden': 'true' }), h('figcaption', null, 'Color aprox.')),
          h('p', { style: { margin: 0 } },
            h('span', { class: 'stat-v' }, `R ${fmt.int(u.r)} · G ${fmt.int(u.g)} · B ${fmt.int(u.b)} · C ${fmt.int(u.c)}`), h('br'),
            h('span', { class: 'meta' }, `Lectura ${u.seq} · ${fmt.time(hora(u))}${u.test_mode ? ' · modo prueba' : ''}`))),
        prom ? h('p', { class: 'meta', style: { margin: 0 } },
          h('b', null, `Promedio de las últimas ${ult10.length}: `),
          `R ${fmt.int(prom.r)} · G ${fmt.int(prom.g)} · B ${fmt.int(prom.b)} · C ${fmt.int(prom.c)}. `,
          variacion != null ? h('span', { style: { color: variacion > 5 ? 'var(--color-warn)' : 'inherit' } },
            `Variación del canal claro: ${fmt.mv(variacion)} %${variacion > 5 ? ' (inestable: revisa soporte, luz o caja)' : ' (estable)'}.`) : null) : null)
        : null,
      lect.length > 1 ? h('section', { class: 'card', 'aria-labelledby': 'lec-g' },
        h('h2', { class: 'card-title', id: 'lec-g' }, 'Canales normalizados (r/c, g/c, b/c)'),
        grafico(lect)) : null,
      h('section', { 'aria-labelledby': 'lec-t' },
        h('h2', { class: 'section-title', id: 'lec-t' }, 'Últimas lecturas'),
        h('div', { class: 'table-wrap' }, h('table', { class: 'data-table compact' },
          h('caption', null, 'Señal cruda del TCS34725. Hora de medición del ESP32 (o de llegada si aún no tenía hora).'),
          h('thead', null, h('tr', null, ['Hora', 'N.º', 'R', 'G', 'B', 'C', 'r/c', 'g/c', 'b/c'].map((t, i) => h('th', { scope: 'col', class: i > 0 ? 'num' : null }, t)))),
          h('tbody', null, lect.slice(0, 20).map((l) => h('tr', null,
            h('td', null, fmt.time(hora(l))), h('td', { class: 'num' }, l.seq),
            [l.r, l.g, l.b, l.c].map((v) => h('td', { class: 'num' }, fmt.int(v))),
            [l.r_norm, l.g_norm, l.b_norm].map((v) => h('td', { class: 'num' }, fmt.tc(v))))))))),
      h('p', { class: 'legal-note' }, icon('info'), 'Señal óptica cruda del sensor: no es concentración de mercurio. El resultado de una muestra lo da el procedimiento completo y, para confirmar, el laboratorio.'));
  }

  const btnPausa = h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => {
    pausa = !pausa;
    btnPausa.replaceChildren(icon(pausa ? 'play' : 'pause'), pausa ? 'Reanudar' : 'Pausar');
    announce(pausa ? 'Actualización en pausa.' : 'Actualizando cada 3 segundos.');
    if (!pausa) cargar();
  } }, icon('pause'), 'Pausar');

  render();
  cargar();
  timer = setInterval(cargar, CADA_MS);
  return {
    el: h('div', { class: 'view view-wide' },
      viewHeader('Lector en vivo', 'Lecturas que el lector Ahgora (ESP32 + sensor de color) envía por WiFi desde el hotspot del celular. Se actualiza cada 3 segundos.', btnPausa),
      host),
    destroy: () => clearInterval(timer),
  };
}
