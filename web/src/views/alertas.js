// Alertas comunitarias (7.2): ninguna alerta se publica automáticamente desde el lector. Un responsable
// autorizado la revisa y la aprueba antes de que llegue a Ahgora Comunidad. Política de mensajes sin alarmismo.
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { announce } from '../lib/announce.js';
import * as fmt from '../lib/format.js';
import { state, on } from '../state.js';
import { updateMuestra } from '../data.js';
import { ALERTAS, MATRICES, alertaSugerida, zonaPublica } from '../model.js';
import { semaforoBadge, certezaBadge, demoSeal } from '../components/badges.js';
import { viewHeader, formDialog } from './common.js';

function phone(m, tipo, texto) {
  const z = zonaPublica(m.lat, m.lon);
  return h('figure', { class: 'phone' },
    h('figcaption', { class: 'meta' }, 'Así lo vería la comunidad en Ahgora Comunidad'),
    h('div', { class: 'phone-screen' },
      h('p', { class: 'phone-kicker' }, icon('bell'), tipo === 'alerta_confirmada' ? 'Alerta revisada' : tipo === 'tranquilizador' ? 'Resultado de laboratorio' : 'Aviso informativo'),
      h('p', { class: 'phone-text' }, texto || 'Falta el texto aprobado por la autoridad de salud.'),
      h('p', { class: 'phone-meta' }, `${m.certeza === 'confirmado' ? `Confirmado por ${m.laboratorio?.laboratorio || 'laboratorio'}` : 'Cribado — requiere confirmación'} · zona ${z.lat_min}…${z.lat_max}, ${z.lon_min}…${z.lon_max}`),
      h('p', { class: 'phone-meta' }, 'Primera señal, no un diagnóstico ni una prueba legal.')));
}

async function revisar(m, tipo) {
  const def = ALERTAS[tipo];
  const d = await formDialog({
    title: `Revisar mensaje · ${m.codigo}`,
    intro: `${def.label}. ${def.nota}`,
    body: [
      h('div', { class: 'field' }, h('label', { for: 'al-texto' }, 'Texto que verá la comunidad'),
        h('textarea', { id: 'al-texto', name: 'texto', required: tipo === 'alerta_confirmada', rows: 5, autofocus: true }, m.alerta?.mensaje || def.texto),
        h('span', { class: 'hint' }, 'Lenguaje sencillo, sin estigmatizar a una comunidad ni a un producto. Cuida el sustento de pescadores y cooperativas.')),
      h('div', { class: 'field' }, h('label', { for: 'al-por' }, 'Responsable que aprueba'), h('input', { class: 'input', id: 'al-por', name: 'por', required: true, autocomplete: 'name' })),
      h('fieldset', { class: 'radio-group' }, h('legend', null, 'Decisión'),
        h('label', { class: 'check' }, h('input', { type: 'radio', name: 'decision', value: 'aprobada', checked: true }), h('span', null, 'Aprobar y publicar en Ahgora Comunidad')),
        h('label', { class: 'check' }, h('input', { type: 'radio', name: 'decision', value: 'no_publicar' }), h('span', null, 'No publicar', h('small', null, 'Por ejemplo, si hay dudas sobre la muestra o falta el texto de salud.')))),
    ],
    submit: 'Guardar decisión',
    validate: (x) => (x.decision === 'aprobada' && tipo === 'alerta_confirmada' && !x.texto.trim() ? 'Para una alerta confirmada pega las recomendaciones aprobadas por la autoridad de salud.' : null),
  });
  if (!d) return;
  await updateMuestra(m.codigo, { alerta: { estado: d.decision, tipo, mensaje: d.texto.trim(), aprobada_por: d.por.trim(), fecha: new Date().toISOString() } },
    d.decision === 'aprobada' ? `Mensaje comunitario aprobado (${def.label})` : 'Mensaje comunitario: no publicar', d.por.trim());
  announce(d.decision === 'aprobada' ? 'Mensaje aprobado.' : 'Decisión guardada: no se publica.');
}

export function alertasView() {
  const host = h('div', { class: 'stack' });
  function card(m) {
    const tipo = (m.alerta?.estado === 'aprobada' && ALERTAS[m.alerta.tipo] ? m.alerta.tipo : alertaSugerida(m)) || 'aviso_cribado';
    const texto = m.alerta?.estado === 'aprobada' ? m.alerta.mensaje : ALERTAS[tipo].texto;
    return h('li', { class: 'card alert-card' },
      h('div', null,
        h('div', { class: 'card-head' },
          h('h3', { class: 'card-title' }, h('a', { class: 'row-link', href: `#/muestra/${encodeURIComponent(m.codigo)}` }, m.codigo)),
          h('span', { class: 'meta' }, `${MATRICES[m.matriz].label} · ${fmt.dateOnly(m.fecha_iso)}`)),
        h('div', { class: 'badge-row' }, semaforoBadge(m.semaforo), demoSeal(m)), certezaBadge(m.certeza),
        h('p', { class: 'meta' }, h('b', null, ALERTAS[tipo].label), '. ', ALERTAS[tipo].nota),
        m.alerta?.estado === 'aprobada' ? h('p', { class: 'meta' }, `Aprobado por ${m.alerta.aprobada_por} el ${fmt.dateOnly(m.alerta.fecha)}.`) : null,
        m.alerta?.estado === 'no_publicar' ? h('p', { class: 'meta' }, `No publicar · ${m.alerta.aprobada_por} · ${fmt.dateOnly(m.alerta.fecha)}.`) : null,
        m.alerta?.anterior ? h('p', { class: 'warn-note' }, 'Hay un resultado nuevo de laboratorio: el mensaje anterior debe revisarse.') : null,
        h('div', { class: 'view-actions' }, h('button', { class: m.alerta?.estado === 'aprobada' ? 'btn btn-ghost' : 'btn btn-primary', type: 'button', onclick: () => revisar(m, alertaSugerida(m) || tipo) }, icon('bell'), m.alerta?.estado === 'aprobada' ? 'Revisar de nuevo' : 'Revisar y decidir'))),
      phone(m, tipo, texto));
  }
  function render() {
    const conMensaje = state.muestras.filter((m) => m.lat != null && (alertaSugerida(m) || m.alerta?.estado === 'aprobada'));
    const pend = conMensaje.filter((m) => m.alerta?.estado !== 'aprobada' && m.alerta?.estado !== 'no_publicar');
    const apro = conMensaje.filter((m) => m.alerta?.estado === 'aprobada');
    const nop = conMensaje.filter((m) => m.alerta?.estado === 'no_publicar');
    mount(host,
      h('section', { class: 'card' },
        h('h2', { class: 'card-title' }, 'Política de alertas'),
        h('div', { class: 'table-wrap', style: { marginTop: 'var(--sp-2)' } }, h('table', { class: 'data-table compact' },
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Situación'), h('th', { scope: 'col' }, 'Qué ve la comunidad'))),
          h('tbody', null,
            h('tr', null, h('th', { scope: 'row' }, 'Cribado rojo en su zona'), h('td', null, `Aviso informativo, no alarma: «${ALERTAS.aviso_cribado.texto}» Sin recomendaciones restrictivas.`)),
            h('tr', null, h('th', { scope: 'row' }, 'Confirmado por laboratorio sobre el umbral'), h('td', null, 'Alerta con recomendaciones aprobadas por la autoridad de salud.')),
            h('tr', null, h('th', { scope: 'row' }, 'Confirmado bajo el umbral'), h('td', null, 'Mensaje tranquilizador, con la aclaración de que el monitoreo continúa.'))))),
        h('p', { class: 'meta', style: { margin: 0 } }, 'Ninguna alerta se publica automáticamente desde el lector. Las recomendaciones de salud no las inventa Ahgora: se definen con las autoridades de salud y especialistas (OPS/OMS). La comunidad ve zonas agregadas, nunca la ubicación exacta.')),
      h('section', { 'aria-labelledby': 'al-p' }, h('h2', { class: 'section-title', id: 'al-p' }, `Pendientes de revisión · ${pend.length}`),
        pend.length ? h('ul', { class: 'alert-list' }, pend.map(card)) : h('p', { class: 'meta' }, 'No hay mensajes pendientes.')),
      h('section', { 'aria-labelledby': 'al-a' }, h('h2', { class: 'section-title', id: 'al-a' }, `Aprobadas y publicadas · ${apro.length}`),
        apro.length ? h('ul', { class: 'alert-list' }, apro.map(card)) : h('p', { class: 'meta' }, 'Ninguna todavía.')),
      nop.length ? h('section', { 'aria-labelledby': 'al-n' }, h('h2', { class: 'section-title', id: 'al-n' }, `No publicar · ${nop.length}`), h('ul', { class: 'alert-list' }, nop.map(card))) : null);
  }
  const off = on('muestras', render);
  render();
  return { el: h('div', { class: 'view view-wide' }, viewHeader('Alertas comunitarias', 'Revisión y aprobación de los mensajes que llegan a Ahgora Comunidad. Informan sin alarmar.'), host), destroy: off };
}
