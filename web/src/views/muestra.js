// Ficha de muestra (7.3): trazabilidad completa — quién la tomó, cuándo y dónde; controles; versión de
// calibración; cálculo; lecturas crudas; resultado del laboratorio; contexto de cuenca y satelital.
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { announce } from '../lib/announce.js';
import * as fmt from '../lib/format.js';
import { state, on } from '../state.js';
import { byCodigo, updateMuestra } from '../data.js';
import {
  MATRICES, CABEZALES, SEMAFORO, CERTEZA, CONTROLES, UMBRALES_REFERENCIA, MENSAJE_COMUNIDAD, ETIQUETA_LEGAL,
  estimado, controlesFallidos, contextoCuenca, alertaSugerida, ALERTAS,
} from '../model.js';
import { semaforoBadge, certezaBadge, matrizTag, demoSeal, visibilidadTag } from '../components/badges.js';
import { NASA_LAYERS, worldviewUrl, powerPrecip } from '../geo/apis.js';
import { viewHeader, emptyState, dl, formDialog } from './common.js';

const field = (name, label, attrs = {}, hint) => h('div', { class: 'field' },
  h('label', { for: `fd-${name}` }, label),
  attrs.options
    ? h('select', { id: `fd-${name}`, name, ...attrs, options: undefined }, attrs.options.map(([v, l]) => h('option', { value: v, selected: attrs.value === v || null }, l)))
    : h('input', { class: `input${attrs.mono ? ' mono' : ''}`, id: `fd-${name}`, name, ...attrs, mono: undefined }),
  hint ? h('span', { class: 'hint' }, hint) : null);
const today = () => new Date().toISOString().slice(0, 10);
const MUESTREO = { tipo: 'Tipo de muestra', porciones: 'Porciones', profundidad_cm: 'Profundidad (cm)', fino_pct: 'Material fino (%)', observaciones: 'Observaciones', especie: 'Especie', talla_cm: 'Talla (cm)', peso_g: 'Peso (g)', porcion: 'Porción' };
const num = (v) => Number(String(v).replace(',', '.'));

export async function enviarALaboratorio(m) {
  const d = await formDialog({
    title: `Enviar ${m.codigo} al laboratorio`,
    intro: 'La muestra pasa a «EN VERIFICACIÓN». Queda registrado quién la envió y cuándo.',
    body: [h('div', { class: 'fields' },
      field('laboratorio', 'Laboratorio', { required: true, autofocus: true, value: m.laboratorio?.laboratorio || '' }),
      field('fecha', 'Fecha de envío', { type: 'date', required: true, value: today(), mono: true }),
      field('por', 'Responsable del envío', { required: true, autocomplete: 'name' }))],
    submit: 'Marcar como enviada',
  });
  if (!d) return;
  await updateMuestra(m.codigo, { certeza: 'en_verificacion', laboratorio: { ...m.laboratorio, laboratorio: d.laboratorio.trim(), enviada_en: new Date(`${d.fecha}T12:00:00`).toISOString() } },
    `Enviada al laboratorio ${d.laboratorio.trim()}`, d.por.trim());
  announce(`${m.codigo} quedó en verificación.`);
}

export async function cargarResultado(m) {
  const base = MATRICES[m.matriz]?.cabezal === 'PEZ' ? 'fresco' : 'seco';
  const d = await formDialog({
    title: `Resultado de laboratorio · ${m.codigo}`,
    intro: 'Solo el laboratorio de referencia confirma. El resultado se muestra como «CONFIRMADO POR LABORATORIO» con su fecha y laboratorio.',
    body: [h('div', { class: 'fields' },
      field('laboratorio', 'Laboratorio', { required: true, autofocus: true, value: m.laboratorio?.laboratorio || '' }),
      field('fecha', 'Fecha del resultado', { type: 'date', required: true, value: today(), mono: true }),
      field('metodo', 'Método de referencia', { required: true, placeholder: 'CV-AAS, analizador directo (EPA 7473)…', value: m.laboratorio?.metodo || '' }),
      field('resultado', 'Mercurio total (mg/kg)', { required: true, inputmode: 'decimal', mono: true }),
      field('base', 'Base', { options: [['seco', 'Peso seco'], ['fresco', 'Peso fresco']], value: base }),
      field('incertidumbre', 'Incertidumbre', { placeholder: '± 10 %' }),
      field('por', 'Quién carga el resultado', { required: true, autocomplete: 'name' }))],
    submit: 'Registrar confirmación',
    validate: (x) => (!(num(x.resultado) >= 0) ? 'El resultado debe ser un número mayor o igual a 0 (mg/kg).' : null),
  });
  if (!d) return;
  await updateMuestra(m.codigo, {
    certeza: 'confirmado',
    laboratorio: { ...m.laboratorio, laboratorio: d.laboratorio.trim(), fecha_resultado: new Date(`${d.fecha}T12:00:00`).toISOString(), metodo: d.metodo.trim(), resultado_mg_kg: num(d.resultado), base: d.base, incertidumbre: d.incertidumbre.trim() },
    // un resultado nuevo exige revisar de nuevo el mensaje para la comunidad
    alerta: m.alerta?.estado === 'aprobada' ? { ...m.alerta, estado: 'sin_revisar', anterior: m.alerta } : m.alerta,
  }, `Resultado de laboratorio: ${d.resultado} mg/kg (${d.metodo.trim()})`, d.por.trim());
  announce(`${m.codigo}: confirmado por laboratorio.`);
}

async function cambiarVisibilidad(m) {
  const next = m.visibilidad === 'publico' ? 'restringido' : 'publico';
  const d = await formDialog({
    title: next === 'publico' ? 'Hacer pública (zona agregada)' : 'Restringir a autoridades',
    intro: next === 'publico'
      ? 'El público verá solo una zona de ~11 km, nunca la coordenada exacta. Publica solo con acuerdo previo de la comunidad y un acuerdo de uso de datos (7.7).'
      : 'Solo las autoridades verán esta muestra, con su ubicación exacta.',
    body: [field('por', 'Responsable', { required: true, autofocus: true, autocomplete: 'name' }),
      next === 'publico' ? h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'consentimiento', required: true }), h('span', null, 'Hay consentimiento de la comunidad y acuerdo de uso de datos.')) : null],
    submit: 'Cambiar visibilidad',
  });
  if (!d) return;
  await updateMuestra(m.codigo, { visibilidad: next }, `Visibilidad: ${next}`, d.por.trim());
}

function rawTable(m) {
  const r = m.lecturas || {};
  if (m.cabezal === 'PEZ') {
    return dl([['Técnica', r.tecnica], ['Deposición', r.deposicion_s != null ? `${r.deposicion_s} s` : null], ['Potencial del pico', r.potencial_pico_v != null ? `${fmt.tc(r.potencial_pico_v)} V` : null], ['Altura del pico', r.pico_ua != null ? `${fmt.tc(r.pico_ua)} µA` : null], ['Fuente', r.fuente]]);
  }
  const rows = [['Referencia blanca', r.referencia_blanca], ['Casilla de Hg sin usar', r.casilla_sin_usar], ['Casilla de Hg reaccionada', r.casilla_reaccionada]];
  return h('div', null,
    h('div', { class: 'table-wrap' }, h('table', { class: 'data-table compact' },
      h('caption', null, `Cuentas del TCS34725 (promedio de ${r.n_promedio ?? '—'} lecturas · ganancia ${r.ganancia ?? '—'} · ${r.integracion_ms ?? '—'} ms)`),
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Lectura'), ['R', 'G', 'B', 'C'].map((c) => h('th', { scope: 'col', class: 'num' }, c)))),
      h('tbody', null, rows.map(([k, v]) => h('tr', null, h('th', { scope: 'row' }, k), ['r', 'g', 'b', 'c'].map((c) => h('td', { class: 'num' }, v ? fmt.int(v[c]) : '—'))))))),
    dl([['Cambio de color (ΔE)', r.delta_e != null ? fmt.tc(r.delta_e) : '—'], ['Blanco de matriz restado', r.blanco_matriz_delta != null ? `ΔE ${fmt.tc(r.blanco_matriz_delta)}` : null]]));
}

function formula(m) {
  const c = m.calculo || {};
  const est = estimado(m);
  const v = (x) => (x == null ? '?' : String(+x).replace('.', ','));
  const expr = m.cabezal === 'PEZ'
    ? `C_pez = C_ext × V_ext / (m_tejido × R) = ${v(c.c_ext_mg_l)} × ${v(c.v_ext_l)} / (${v(c.m_tejido_kg)} × ${v(c.recuperacion_r)})`
    : `C_sed = C_ext × V_ext / (m_húmeda × f_seco × R) = ${v(c.c_ext_mg_l)} × ${v(c.v_ext_l)} / (${v(c.m_humeda_kg)} × ${v(c.f_seco)} × ${v(c.recuperacion_r)})`;
  return h('div', null,
    h('p', { class: 'formula mono' }, expr, h('br'), `= ${fmt.conc(est)} ${MATRICES[m.matriz]?.unidad || 'mg/kg'}`),
    dl([
      ['C_ext', c.c_ext_mg_l != null ? `${fmt.conc(c.c_ext_mg_l)} mg/L (de la curva de calibración)` : '—'],
      ['V_ext', c.v_ext_l != null ? `${fmt.conc(c.v_ext_l * 1000)} mL` : '—'],
      [m.cabezal === 'PEZ' ? 'm_tejido' : 'm_húmeda', (c.m_tejido_kg ?? c.m_humeda_kg) != null ? `${fmt.conc((c.m_tejido_kg ?? c.m_humeda_kg) * 1000)} g` : '—'],
      m.cabezal === 'PEZ' ? null : ['f_seco', c.f_seco != null ? fmt.tc(c.f_seco) : '—'],
      ['R (recuperación)', c.recuperacion_r != null ? `${fmt.int(c.recuperacion_r * 100)} %${m.demostracion ? ' (supuesto de demostración)' : ''}` : 'A determinar en la validación'],
    ].filter(Boolean)),
    h('p', { class: 'meta', style: { margin: 'var(--sp-2) 0 0' } }, 'R se mide en la Fase 1 con el laboratorio aliado. Mientras no esté medida, el valor estimado es orientativo.'));
}

function rainCard(m) {
  const out = h('div', { role: 'status', class: 'meta' }, 'Lluvia de los 14 días previos al muestreo en el punto (NASA POWER).');
  const btn = h('button', { class: 'btn btn-ghost', type: 'button', onclick: async () => {
    btn.disabled = true; out.textContent = 'Consultando NASA POWER…';
    try {
      const end = new Date(m.fecha_iso), start = new Date(end.getTime() - 13 * 86400000);
      const ymd = (d) => d.toISOString().slice(0, 10).replaceAll('-', '');
      const dias = await powerPrecip(m.lon, m.lat, ymd(start), ymd(end));
      const tot = dias.reduce((s, d) => s + (d.mm || 0), 0);
      const max = Math.max(1, ...dias.map((d) => d.mm || 0));
      mount(out,
        h('p', { style: { margin: 0 } }, h('b', null, `${fmt.mv(tot)} mm`), ' acumulados en 14 días (fuente: NASA POWER PRECTOTCORR, no es IMERG).'),
        h('div', { class: 'rain-bars', role: 'img', 'aria-label': dias.map((d) => `${d.fecha}: ${d.mm == null ? 'sin dato' : `${fmt.mv(d.mm)} mm`}`).join('; ') },
          dias.map((d) => h('span', { style: { blockSize: `${((d.mm || 0) / max) * 100}%` }, title: `${d.fecha}: ${d.mm == null ? 'sin dato' : `${fmt.mv(d.mm)} mm`}` }))),
        h('p', { class: 'meta', style: { margin: 0 } }, 'Las lluvias pueden movilizar sedimentos. Es contexto para interpretar, no explica el resultado por sí solo.'));
    } catch (e) { out.textContent = `No se pudo consultar NASA POWER (${e.message}). Necesita internet.`; btn.disabled = false; }
  } }, icon('drop'), 'Consultar lluvia previa');
  return h('div', { class: 'evidence-block' }, out, btn);
}

export function muestraView(codigo) {
  const host = h('div', { class: 'view view-wide' });
  function render() {
    const m = byCodigo(codigo);
    if (!m) {
      mount(host, viewHeader('Ficha de muestra'), emptyState({ iconName: 'evidence', title: `No se encontró ${codigo || 'la muestra'}`, text: 'Puede que aún no se haya sincronizado o que el código esté mal escrito.', actions: [h('a', { class: 'btn btn-primary', href: '#/muestras' }, 'Ver todas las muestras')] }));
      return;
    }
    const sem = SEMAFORO[m.semaforo] || SEMAFORO.invalido;
    const est = estimado(m);
    const ref = UMBRALES_REFERENCIA[m.matriz];
    const fallas = controlesFallidos(m);
    const ctx = contextoCuenca(m, state.cuenca);
    const lab = m.laboratorio || {};
    const sug = alertaSugerida(m);

    const actions = [
      m.certeza === 'cribado' && m.semaforo !== 'invalido' ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => enviarALaboratorio(m) }, icon('flask'), 'Enviar al laboratorio') : null,
      m.certeza !== 'confirmado' && m.semaforo !== 'invalido' ? h('button', { class: m.certeza === 'en_verificacion' ? 'btn btn-primary' : 'btn btn-ghost', type: 'button', onclick: () => cargarResultado(m) }, icon('doc_check'), 'Cargar resultado') : null,
      h('a', { class: 'btn btn-ghost', href: `#/mapa/${encodeURIComponent(m.codigo)}` }, icon('map'), 'Ver en el mapa'),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => window.print() }, icon('print'), 'Imprimir / PDF'),
    ];

    mount(host,
      viewHeader(m.codigo, `${MATRICES[m.matriz]?.label || m.matriz} · ${CABEZALES[m.cabezal] || m.cabezal}`, ...actions.filter(Boolean)),
      h('article', { class: 'print-area' },
        h('div', { class: 'ficha-head' },
          h('div', null, h('p', { class: 'popup-kicker' }, 'Ahgora · ficha de muestra'), h('h2', { class: 'popup-title', style: { fontSize: 'var(--fs-lg)' } }, m.codigo)),
          h('div', { class: 'badge-row' }, semaforoBadge(m.semaforo), certezaBadge(m.certeza), matrizTag(m.matriz), visibilidadTag(m.visibilidad), demoSeal(m))),
        m.demostracion ? h('p', { class: 'ficha-demo' }, 'DEMOSTRACIÓN — datos ficticios, no es una medición real.') : null,
        h('p', { class: 'legal-banner' }, ETIQUETA_LEGAL),

        h('div', { class: 'ficha-cols' },
          h('section', { class: 'card sem-card', dataset: { sem: m.semaforo } },
            h('h3', { class: 'card-title' }, 'Resultado de cribado'),
            h('div', { class: 'sem-big' }, icon(sem.icon), h('div', null, h('p', { class: 'hg-state' }, sem.label), h('p', { class: 'hg-text' }, sem.significa))),
            dl([
              ['Estimado', est != null ? h('span', { class: 'mono' }, `${fmt.conc(est)} ${MATRICES[m.matriz]?.unidad}`) : 'Sin valor (inválido)'],
              ['Referencia', ref ? `${fmt.conc(ref.valor)} mg/kg · ${ref.fuente}` : null],
              ['Qué hacer', sem.accion],
              fallas.length ? ['Controles fallidos', fallas.join('; ')] : null,
            ].filter(Boolean)),
            m.matriz !== 'pescado' && m.semaforo === 'verde' ? h('p', { class: 'meta' }, 'Versión 1: los sedimentos cerca del umbral (0,17–0,5 mg/kg) probablemente no se detectan. Un verde no permite dejar de enviar muestras.') : null),

          h('section', { class: 'card' },
            h('h3', { class: 'card-title' }, 'Confirmación de laboratorio'),
            certezaBadge(m.certeza),
            m.certeza === 'confirmado'
              ? dl([['Resultado', h('span', { class: 'mono' }, `${fmt.conc(lab.resultado_mg_kg)} mg/kg (${lab.base || '—'})`)], ['Laboratorio', lab.laboratorio], ['Fecha', fmt.dateOnly(lab.fecha_resultado)], ['Método', lab.metodo], ['Incertidumbre', lab.incertidumbre],
                ['Frente a la referencia', ref ? (lab.resultado_mg_kg >= ref.valor ? `Sobre el umbral de referencia (${fmt.conc(ref.valor)} mg/kg)` : `Bajo el umbral de referencia (${fmt.conc(ref.valor)} mg/kg)`) : null],
                ['Cribado vs. laboratorio', (() => { const pos = m.semaforo === 'rojo' || m.semaforo === 'amarillo'; const real = ref && lab.resultado_mg_kg >= ref.valor; return real && !pos ? 'Falso negativo del cribado: se declara y cuenta en los indicadores.' : !real && pos ? 'Falso positivo del cribado (sesgo hacia la seguridad, 6.3).' : 'El cribado coincidió con el laboratorio.'; })()]])
              : m.certeza === 'en_verificacion'
                ? dl([['Laboratorio', lab.laboratorio], ['Enviada', fmt.dateOnly(lab.enviada_en)], ['Estado', 'Muestra enviada, sin resultado aún']])
                : h('p', { class: 'meta', style: { margin: 'var(--sp-2) 0 0' } }, m.semaforo === 'invalido' ? 'Inválida: no se envía. Hay que repetir la prueba en campo.' : 'Aún no se envió al laboratorio.'),
            h('p', { class: 'meta' }, h('a', { class: 'row-link', href: '#/alertas' }, 'Mensaje para la comunidad'), ': ', m.alerta?.estado === 'aprobada' ? `aprobado por ${m.alerta.aprobada_por} el ${fmt.dateOnly(m.alerta.fecha)}.` : sug ? `pendiente de revisión (${ALERTAS[sug].label.toLowerCase()}).` : 'nada que publicar.'))),

        h('div', { class: 'ficha-cols' },
          h('section', { class: 'card' },
            h('h3', { class: 'card-title' }, 'Trazabilidad'),
            dl([
              ['Tomada por', m.responsable],
              ['Fecha y hora', fmt.dateTime(m.fecha_iso)],
              ['Ubicación', m.lat != null ? h('span', { class: 'mono' }, `${m.lat.toFixed(5)}, ${m.lon.toFixed(5)}`) : '—'],
              ['Cuenca', m.cuenca],
              ...Object.entries(m.muestreo || {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [MUESTREO[k] || k.replaceAll('_', ' '), String(v)]),
              ['Calibración', h('span', { class: 'mono' }, m.calibracion || '—')],
              ['Firmware del lector', h('span', { class: 'mono' }, m.firmware || '—')],
            ]),
            m.historial?.length ? h('details', { class: 'disclosure', style: { marginTop: 'var(--sp-3)' } }, h('summary', null, `Historial de cambios (${m.historial.length})`, icon('chevron')),
              h('ol', { class: 'reasons' }, m.historial.map((x) => h('li', null, `${fmt.dateTime(x.fecha)} · ${x.accion} · ${x.por}`)))) : null,
            h('div', { class: 'view-actions no-print', style: { marginTop: 'var(--sp-3)' } }, h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => cambiarVisibilidad(m) }, icon('shield'), m.visibilidad === 'publico' ? 'Restringir' : 'Hacer pública'))),

          h('section', { class: 'card' },
            h('h3', { class: 'card-title' }, 'Controles de la tanda'),
            h('ul', { class: 'checks' }, Object.entries(m.controles || {}).map(([k, v]) => h('li', { dataset: { ok: v === 'falla' ? 'false' : 'true' } }, icon(v === 'falla' ? 'cross' : 'check'), `${CONTROLES[k] || k}: ${v === 'falla' ? 'falló' : v === 'restado' ? 'restado de la lectura' : 'correcto'}`))),
            Object.keys(m.controles || {}).length ? null : h('p', { class: 'meta' }, 'El registro no trae controles.'))),

        h('div', { class: 'ficha-cols' },
          h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'Del color a mg/kg: cálculo'), formula(m)),
          h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'Lecturas crudas del sensor'), rawTable(m))),

        h('div', { class: 'ficha-cols' },
          h('section', { class: 'card' },
            h('h3', { class: 'card-title' }, 'Contexto de cuenca'),
            !ctx ? h('p', { class: 'meta' }, 'No hay una cuenca configurada para ubicar esta muestra.')
              : ctx.fuera ? h('p', { class: 'meta' }, `La muestra está a ${fmt.int(ctx.dist)} km del eje de la cuenca: no se ubica aguas arriba ni abajo.`)
                : dl([
                  ['Posición', `km ${fmt.int(ctx.km)} de ${fmt.int(ctx.largo)} en el eje (${fmt.mv(ctx.dist)} km del cauce)`],
                  ['Aguas arriba (posibles fuentes)', ctx.fuentes.length ? ctx.fuentes.map((f) => `${f.nombre} (${fmt.int(ctx.km - f.km)} km)`).join('; ') : 'Ninguna registrada'],
                  ['Aguas abajo (posibles expuestos)', ctx.comunidades.length ? ctx.comunidades.map((c) => `${c.nombre} (${fmt.int(c.km - ctx.km)} km)`).join('; ') : 'Ninguna registrada'],
                  ['Población aguas abajo', ctx.comunidades.length ? `${fmt.int(ctx.poblacion)} hab.${state.mode === 'demo' ? ' (ficticio)' : ''}` : '—'],
                ]),
            ctx && !ctx.fuera ? h('a', { class: 'btn btn-quiet no-print', href: `#/cuenca/${encodeURIComponent(m.codigo)}` }, icon('river'), 'Abrir vista de cuenca') : null),
          h('section', { class: 'card no-print' },
            h('h3', { class: 'card-title' }, 'Contexto satelital (NASA)'),
            h('p', { class: 'meta' }, 'Los satélites no detectan mercurio. Ayudan a interpretar: dónde crece la minería, cómo se mueven los sedimentos y quién vive aguas abajo.'),
            m.lat != null ? rainCard(m) : null,
            m.lat != null ? h('ul', { class: 'ref-list', style: { marginTop: 'var(--sp-3)' } }, NASA_LAYERS.filter((L) => ['hls_s30', 'imerg', 'firms', 'gpw'].includes(L.id)).map((L) =>
              h('li', null, h('a', { href: worldviewUrl(L, m.lon, m.lat, m.fecha_iso.slice(0, 10)), target: '_blank', rel: 'noopener' }, `${L.nombre} en NASA Worldview`, icon('external', { cls: 'inline-ic' })), h('span', { class: 'meta' }, L.decision)))) : null)),

        h('section', { class: 'card community' },
          h('h3', { class: 'card-title' }, 'Mensaje para comunidades (literal)'),
          h('p', null, MENSAJE_COMUNIDAD)),
      ));
  }
  const offs = [on('muestras', render)];
  render();
  return { el: host, destroy() { offs.forEach((f) => f()); } };
}
