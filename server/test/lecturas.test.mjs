// Pruebas de /api/lecturas sin base de datos: node --test   (desde server/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limpiarLecturas, esLector, MAX_LECTURAS } from '../lib/core.js';
import { ESQUEMAS, INDICES } from '../lib/esquema.js';

const ahora = new Date('2026-11-26T15:00:00Z');
// Lo que imprime el firmware por USB (Ahgora_TCS34725_Prueba_Optica.ino).
const usb = { node_id: 'AHG-SED-01', seq: 12, test_mode: true, sensor: 'TCS34725', r: 1010, g: 625, b: 420, c: 2440, r_norm: 105.53, g_norm: 65.32, b_norm: 43.89 };

test('acepta el lote del firmware WiFi y respeta la hora de medición', () => {
  const t = ahora.getTime() - 5000;
  const { docs, error } = limpiarLecturas({ node_id: 'AHG-SED-01', firmware: 'ahgora-wifi-0.2', rssi: -61,
    lecturas: [{ ...usb, t }, { ...usb, seq: 13, t: t + 1000 }] }, ahora);
  assert.equal(error, undefined);
  assert.equal(docs.length, 2);
  assert.equal(docs[0].medido_en.getTime(), t);
  assert.equal(docs[0].recibido_en, ahora);
  assert.equal(docs[1].seq, 13);
  assert.equal(docs[0].firmware, 'ahgora-wifi-0.2');
  assert.equal(docs[0].rssi, -61);
  assert.equal(docs[0].test_mode, true);
});

test('acepta una lectura suelta (mismo JSON que por USB) sin hora del ESP32', () => {
  const { docs } = limpiarLecturas(usb, ahora);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].medido_en, null);
  assert.equal(docs[0].r_norm, 105.53);
  assert.equal(docs[0].rssi, null);
});

test('rechaza lo que no es una lectura válida', () => {
  assert.match(limpiarLecturas({ node_id: 'x', r: 1, g: 1, b: 1, c: 1 }).error, /node_id/);
  assert.match(limpiarLecturas({ node_id: 'AHG-SED-01' }).error, /Faltan/);
  assert.match(limpiarLecturas({ node_id: 'AHG-SED-01', lecturas: [{ r: 70000, g: 1, b: 1, c: 1 }] }).error, /65535/);
  assert.match(limpiarLecturas({ node_id: 'AHG-SED-01', lecturas: [{ r: 1, g: 1, b: 1 }] }).error, /r, g, b y c/);
  assert.match(limpiarLecturas({ node_id: 'AHG-SED-01', lecturas: Array(MAX_LECTURAS + 1).fill(usb) }).error, /máx/);
  assert.match(limpiarLecturas({ node_id: 'AHG SED <b>', r: 1, g: 1, b: 1, c: 1 }).error, /node_id/);
});

test('una hora del ESP32 sin sincronizar (1970) o futura no se usa', () => {
  assert.equal(limpiarLecturas({ ...usb, t: 12345 }, ahora).docs[0].medido_en, null);
  assert.equal(limpiarLecturas({ ...usb, t: ahora.getTime() + 3600000 }, ahora).docs[0].medido_en, null);
});

test('la clave del lector solo sirve si está configurada; la del equipo también vale', () => {
  const antes = { n: process.env.AHG_NODE_KEY, t: process.env.AHG_TEAM_KEY, h: process.env.HG_TEAM_KEY };
  try {
    delete process.env.HG_TEAM_KEY;
    process.env.AHG_TEAM_KEY = 'equipo'; delete process.env.AHG_NODE_KEY;
    assert.equal(esLector({ headers: { 'x-ahg-nodo': 'cualquiera' } }), false);
    assert.equal(esLector({ headers: { 'x-ahg-key': 'equipo' } }), true);
    process.env.AHG_NODE_KEY = 'lector';
    assert.equal(esLector({ headers: { 'x-ahg-nodo': 'lector' } }), true);
    assert.equal(esLector({ headers: {} }), false);
  } finally {
    for (const [k, v] of [['AHG_NODE_KEY', antes.n], ['AHG_TEAM_KEY', antes.t], ['HG_TEAM_KEY', antes.h]]) if (v == null) delete process.env[k]; else process.env[k] = v;
  }
});

test('la colección lecturas tiene esquema e índice con vencimiento de 30 días', () => {
  assert.deepEqual(ESQUEMAS.lecturas.required, ['node_id', 'seq', 'r', 'g', 'b', 'c', 'recibido_en']);
  const ttl = INDICES.lecturas.find(([, o]) => o?.expireAfterSeconds);
  assert.equal(ttl[1].expireAfterSeconds, 30 * 86400);
});

test('reporte con medición del kit comunitario: se conserva acotado; sin kit válido no se agrega', async () => {
  const { limpiarReporte } = await import('../lib/core.js');
  const { reporte } = limpiarReporte({ tipo: 'otro', descripcion: 'Medición con el kit', creado_en: '2026-11-26T10:00:00Z',
    kit: { resultado: 'cambio_fuerte', matriz: 'sedimento', cloro_sin_color: true, pasos_hechos: 9, pasos_total: 10, tutorial_visto: true, rio: 'Río Coroico', extra: 'x' } });
  assert.deepEqual(reporte.kit, { resultado: 'cambio_fuerte', matriz: 'sedimento', cloro_sin_color: true, pasos_hechos: 9, pasos_total: 10, tutorial_visto: true, rio: 'Río Coroico' });
  assert.equal(reporte.tipo, 'otro');
  assert.equal(limpiarReporte({ tipo: 'otro', kit: { resultado: 'hay_mercurio' } }).reporte.kit, undefined);
  assert.equal(limpiarReporte({ tipo: 'otro' }).reporte.kit, undefined);
});
