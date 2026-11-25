// Pruebas sin base de datos: node --test   (desde server/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { versionar, vistaPublica, idPublico, limpiarReporte, cleanMuestra } from '../lib/core.js';
import { itemPublico } from '../api/alertas.js';

const base = {
  codigo: 'SED-2026-0001', matriz: 'sedimento', lat: -15.4981, lon: -67.8833, certeza: 'cribado',
  visibilidad: 'publico', responsable: 'Técnica X', lecturas: { r: 1 },
  alerta: { estado: 'aprobada', tipo: 'aviso_cribado', mensaje: 'Una muestra necesita confirmación.', aprobada_por: 'Resp. Y', fecha: '2026-11-24T16:20:00.000Z' },
};
// Simula el ciclo de /api/sync: combina, versiona y guarda.
const guardar = (anterior, cambios) => {
  const resultado = { ...anterior, ...cleanMuestra({ ...anterior, ...cambios }) };
  const publicacion = versionar(anterior, resultado);
  return publicacion ? { ...resultado, publicacion } : resultado;
};

test('primera publicación: versión 1 con id público que no revela el código', () => {
  const m = guardar(undefined, base);
  assert.equal(m.publicacion.version, 1);
  assert.equal(m.publicacion.id, idPublico(base.codigo));
  assert.ok(!m.publicacion.id.includes('SED'));
});

test('repetir la misma sincronización no sube la versión', () => {
  const m1 = guardar(undefined, base);
  const m2 = guardar(m1, base);
  assert.equal(m2.publicacion.version, 1);
});

test('un cambio visible sube la versión y mantiene el id', () => {
  const m1 = guardar(undefined, base);
  const m2 = guardar(m1, { certeza: 'en_verificacion' });
  assert.equal(m2.publicacion.version, 2);
  assert.equal(m2.publicacion.id, m1.publicacion.id);
});

test('un cambio no visible (lecturas, responsable) no sube la versión', () => {
  const m1 = guardar(undefined, base);
  const m2 = guardar(m1, { lecturas: { r: 2 }, responsable: 'Otra persona' });
  assert.equal(m2.publicacion.version, 1);
});

test('dejar de publicar es un retiro con versión nueva; volver a aprobar lo restaura', () => {
  const m1 = guardar(undefined, base);
  const m2 = guardar(m1, { alerta: { ...base.alerta, estado: 'sin_revisar' } });
  assert.equal(m2.publicacion.version, 2);
  assert.ok(m2.publicacion.retirado_en);
  const item = itemPublico(m2);
  assert.equal(item.retirado, true);
  assert.equal(item.id, m1.publicacion.id);
  const m3 = guardar(m2, { alerta: base.alerta });
  assert.equal(m3.publicacion.version, 3);
  assert.equal(m3.publicacion.retirado_en, null);
});

test('una muestra restringida nunca publicada no genera aviso', () => {
  const m = guardar(undefined, { ...base, visibilidad: 'restringido' });
  assert.equal(m.publicacion, undefined);
  assert.equal(itemPublico(m), null);
});

test('el cliente no puede escribir la publicación', () => {
  const m = guardar(undefined, { ...base, publicacion: { id: 'falso', version: 99 } });
  assert.equal(m.publicacion.version, 1);
  assert.notEqual(m.publicacion.id, 'falso');
});

test('el aviso público no expone coordenadas, código, responsables ni lecturas', () => {
  const item = itemPublico(guardar(undefined, base));
  const texto = JSON.stringify(item);
  for (const prohibido of ['-15.4981', '-67.8833', 'SED-2026', 'Técnica X', 'Resp. Y', 'lecturas', 'aprobada_por']) {
    assert.ok(!texto.includes(prohibido), `expone ${prohibido}`);
  }
  assert.deepEqual(item.zona, { lat_min: -15.5, lon_min: -67.9, lat_max: -15.4, lon_max: -67.8 });
  assert.equal(item.certeza, 'cribado');
  assert.equal(item.version, 1);
});

test('el laboratorio solo aparece cuando está confirmado', () => {
  const lab = { laboratorio: { laboratorio: 'Lab aliado' } };
  assert.equal(vistaPublica({ ...base, ...lab }).laboratorio, undefined);
  assert.equal(vistaPublica({ ...base, ...lab, certeza: 'confirmado' }).laboratorio, 'Lab aliado');
});

test('reportes: tipo obligatorio, texto acotado y zona re-agregada a 0,1°', () => {
  assert.ok(limpiarReporte({ tipo: 'nada' }).error);
  assert.ok(limpiarReporte(null).error);
  assert.ok(limpiarReporte({ tipo: 'peces', zona: { lat_min: 'x', lon_min: 1 } }).error);
  const { reporte } = limpiarReporte({
    tipo: 'agua_turbia', descripcion: 'x'.repeat(900), creado_en: '2026-11-24T20:00:00Z',
    zona: { lat_min: -15.4981, lon_min: -67.8833 }, origen: 'ahgora-comunidad-android',
  });
  assert.equal(reporte.descripcion.length, 500);
  assert.equal(reporte.estado, 'en_revision');
  assert.deepEqual(reporte.zona, { lat_min: -15.5, lon_min: -67.9, lat_max: -15.4, lon_max: -67.8 });
  assert.equal(limpiarReporte({ tipo: 'otro' }).reporte.zona, null);
});
