// Insignias y sellos: siempre icono + texto (el color nunca va solo).
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { SEMAFORO, CERTEZA, MATRICES } from '../model.js';

export function semaforoBadge(sem, { short = false } = {}) {
  const s = SEMAFORO[sem] || SEMAFORO.invalido;
  return h('span', { class: 'badge sem', dataset: { tone: s.tone, sem } }, icon(s.icon), h('span', { class: 'badge-text' }, short ? s.label : s.label));
}
export function certezaBadge(cert) {
  const c = CERTEZA[cert] || CERTEZA.cribado;
  return h('span', { class: 'cert', dataset: { cert } }, icon(c.icon), c.etiqueta);
}
export function matrizTag(matriz) {
  const m = MATRICES[matriz];
  return h('span', { class: 'mtag', dataset: { matriz } }, h('span', { class: `msym msym-${matriz}`, 'aria-hidden': 'true' }), m ? m.label : matriz);
}
export const demoSeal = (m) => (m?.demostracion ? h('span', { class: 'prov', dataset: { prov: 'archivo_prueba' } }, 'Demostración') : null);
export function visibilidadTag(v) {
  return h('span', { class: 'badge', dataset: { tone: v === 'publico' ? 'info' : 'neutral' } }, icon(v === 'publico' ? 'map' : 'shield'),
    h('span', { class: 'badge-text' }, v === 'publico' ? 'Público (zona agregada)' : 'Restringido (solo autoridades)'));
}
