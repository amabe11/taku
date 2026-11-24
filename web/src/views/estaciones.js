// Vista «Estaciones»: dispositivo registrado, conexión, sensores y configuración (lo que informa /api/status).
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import * as fmt from '../lib/format.js';
import { state, on, STATION } from '../state.js';
import { connectionPill } from '../components/badges.js';
import { startStatusLoop } from '../runs.js';
import { viewHeader, dl, emptyState } from './common.js';

const FW = { ESPERA: 'En espera', CAPTURA: 'Capturando', COMPLETA: 'Corrida completa en memoria', INVALIDA: 'Corrida inválida en memoria', INTERRUMPIDA: 'Corrida interrumpida' };
const PINOUT = [
  ['ESP32 3V3', 'VIN del breakout TCS34725 + VDD DS18B20', '3,3 V; verificar el regulador del breakout'],
  ['ESP32 GND', 'GND del TCS34725 y del DS18B20', 'Referencia común'],
  ['GPIO21', 'TCS34725 SDA', 'I2C con lógica de 3,3 V; pull-ups del breakout'],
  ['GPIO22', 'TCS34725 SCL', 'Arrancar con I2C a 100 kHz; dirección 0x29'],
  ['TCS34725 LED', 'Fijo (LED encendido)', 'Luz estable durante toda la corrida; anotar si se cambia'],
  ['GPIO25', 'DS18B20 DQ', '4,7 kΩ de DQ a 3V3, modo de tres hilos'],
  ['Alternativa', 'AS7341 en breakout de 3,3 V (0x39)', 'Solo si el laboratorio pide otra banda; un lector por montaje'],
];

function sensorRow(name, detail, ok) {
  const tone = ok === true ? 'ok' : ok === false ? 'fail' : 'neutral';
  const text = ok === true ? 'Responde' : ok === false ? 'Sin respuesta' : 'Sin datos';
  return h('tr', null, h('th', { scope: 'row' }, name), h('td', null, detail),
    h('td', null, h('span', { class: 'badge', dataset: { tone } }, icon(ok === true ? 'check' : ok === false ? 'cross' : 'pending'), h('span', { class: 'badge-text' }, text))));
}

export function estacionesView() {
  const card = h('section', { class: 'card', 'aria-labelledby': 'est-title' });
  const sensors = h('section', { class: 'card', 'aria-labelledby': 'sens-title' });
  const el = h('div', { class: 'view' },
    viewHeader('Estaciones', 'Dispositivos registrados, conexión, sensores y configuración. La información llega por Wi-Fi local desde la placa, sin internet.'),
    h('div', { class: 'two-col' }, card, sensors),
    h('details', { class: 'card disclosure' },
      h('summary', null, h('span', null, 'Cableado de referencia (ESP32 DevKitC V4)'), icon('chevron')),
      h('div', { class: 'table-wrap', role: 'region', tabindex: '0', 'aria-labelledby': 'pin-cap' },
        h('table', { class: 'data-table' },
          h('caption', { id: 'pin-cap' }, 'Pin por pin, según la guía ORO-4.1 (p. 9). Confirmar serigrafía si se usa otra revisión.'),
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Pin de origen'), h('th', { scope: 'col' }, 'Conectar a'), h('th', { scope: 'col' }, 'Detalle'))),
          h('tbody', null, PINOUT.map(([a, b, c]) => h('tr', null, h('th', { scope: 'row', class: 'mono' }, a), h('td', null, b), h('td', null, c))))))),
    emptyState({ iconName: 'pin_off', title: 'Sin otras estaciones registradas', text: 'El sitio piloto sigue por definir. Una estación de campo se registrará solo con un acuerdo de acceso y uso de datos verificable.' }),
  );

  function render() {
    const info = state.conn.info;
    const sd = info?.sensor_ok;
    const det = typeof sd === 'object' && sd ? sd : {};
    const all = typeof sd === 'boolean' ? sd : undefined;
    mount(card,
      h('div', { class: 'card-head' },
        h('div', null, h('h2', { class: 'station-id', id: 'est-title' }, STATION.id), h('p', { class: 'station-loc' }, `${STATION.nombre} · ${STATION.localidad}`)),
        connectionPill(state.conn.status)),
      dl([
        ['Estado de la estación', 'Activa (banco de prueba)'],
        ['Firmware', info ? (FW[info.estado] || info.estado) : '—'],
        ['Corrida en la placa', info?.run_id ? h('span', { class: 'mono' }, info.run_id) : 'Ninguna'],
        ['config_id', h('span', { class: 'mono' }, info?.config_id || '—')],
        ['build', h('span', { class: 'mono' }, info?.build || '—')],
        ['Encendida desde', info?.uptime_ms != null ? `${Math.round(info.uptime_ms / 60000)} min` : '—'],
        ['Última respuesta', fmt.ago(state.conn.lastOk)],
        ['Modo', state.mode === 'demo' ? 'Demostración (estación simulada)' : 'Estación real por Wi-Fi local'],
        ['Ubicación', STATION.nota],
      ]),
      h('div', { class: 'view-actions' }, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => startStatusLoop() }, icon('sync'), 'Comprobar conexión')),
    );
    mount(sensors,
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title', id: 'sens-title' }, 'Sensores')),
      h('table', { class: 'data-table compact' },
        h('caption', { class: 'sr-only' }, 'Estado de los sensores informado por la estación'),
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Sensor'), h('th', { scope: 'col' }, 'Conexión'), h('th', { scope: 'col' }, 'Estado'))),
        h('tbody', null,
          sensorRow('TCS34725', `Lector de tiras · I2C 0x29${info?.optica ? ` · ganancia ${info.optica.ganancia} · ${info.optica.integracion_ms} ms` : ''}`, info ? det.tcs34725 ?? all : null),
          sensorRow('DS18B20', 'Temperatura · GPIO25 · 4,7 kΩ', info ? det.ds18b20 ?? all : null))),
      h('p', { class: 'meta', style: { margin: 'var(--sp-3) 0 0' } }, 'Si cambia la ganancia, el tiempo de integración, el LED, la cámara o el lote de tiras, actualiza config_id en el firmware y en el registro de pruebas.'),
    );
  }
  const off = on('conn', render);
  render();
  return { el, destroy: off };
}
