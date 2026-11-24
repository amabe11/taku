// Diálogos de la corrida: ficha de muestra + controles (inicio), resolución de la corrida previa,
// guardado con incidencias y exportación CSV. <dialog> nativo con showModal().
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { announce } from '../lib/announce.js';
import { state, writePref, summarize, N_ROWS } from '../state.js';
import { startRun, pendingRun, saveRun, markExported, discardRun } from '../runs.js';
import { buildCsv, csvFilename, downloadText } from '../csv.js';
import { sensorsOk } from '../api.js';
import { HG } from './badges.js';

const runDialog = () => document.getElementById('run-dialog');
const confirmDialog = () => document.getElementById('confirm-dialog');

/** Abre el diálogo de confirmación genérico y resuelve con el valor del botón pulsado ('' si se cierra). */
function ask({ title, body, actions, describedBy }) {
  const dlg = confirmDialog();
  return new Promise((resolve) => {
    const form = h('form', { method: 'dialog' },
      h('div', { class: 'modal-head' }, h('h1', { id: 'confirm-dialog-title' }, title)),
      h('div', { class: 'modal-body', id: describedBy || null }, body),
      h('div', { class: 'modal-foot' }, actions.map((a) =>
        h('button', { class: `btn ${a.cls || 'btn-ghost'}`, value: a.value, autofocus: a.autofocus || null, formnovalidate: a.novalidate || null }, a.icon ? icon(a.icon) : null, a.label))),
    );
    mount(dlg, form);
    const onClose = () => { dlg.removeEventListener('close', onClose); const v = dlg.returnValue; dlg.returnValue = ''; resolve({ value: v, form }); };
    dlg.addEventListener('close', onClose);
    dlg.showModal();
  });
}

// ------------------------------------------------------------------ exportar
export function exportRun(current) {
  if (!current) return;
  const { run, rows } = current;
  downloadText(buildCsv(run, rows), csvFilename(run));
  if (run.estado !== 'captura') markExported(run.run_id);
  announce(`CSV descargado: ${csvFilename(run)}.`);
}

// ------------------------------------------------------------------ guardar
export async function openSaveDialog(run) {
  const s = summarize(state.current.rows);
  const body = [
    h('p', { style: { margin: 0 } }, 'Revisa la ficha antes de guardarla. Las lecturas ya están conservadas en este navegador; guardar cierra la ficha con sus incidencias.'),
    h('dl', { class: 'popup-dl' },
      h('dt', null, 'Corrida'), h('dd', { class: 'mono' }, run.run_id),
      h('dt', null, 'Muestra'), h('dd', { class: 'mono' }, run.id_muestra),
      h('dt', null, 'Lecturas'), h('dd', null, `${s.nValid} válidas de ${N_ROWS} · ${s.missing.length} faltantes`),
      h('dt', null, 'Estado Hg'), h('dd', null, HG[run.estado_hg || 'pendiente'].label),
    ),
    h('div', { class: 'field' },
      h('label', { for: 'save-incidencias' }, 'Incidencias'),
      h('textarea', { id: 'save-incidencias', name: 'incidencias', 'aria-describedby': 'save-inc-hint' }, run.incidencias || ''),
      h('span', { class: 'hint', id: 'save-inc-hint' }, 'Ej.: burbuja en el haz a los 30 s, reinserción del vaso, blanco repetido.'),
    ),
  ];
  const { value, form } = await ask({
    title: `Guardar corrida ${run.run_id}`, body,
    actions: [{ label: 'Cancelar', value: 'cancel', autofocus: true }, { label: 'Guardar corrida', value: 'save', cls: 'btn-primary', icon: 'save' }],
  });
  if (value !== 'save') return;
  await saveRun(run.run_id, form.elements.incidencias.value.trim());
  announce(`Corrida ${run.run_id} guardada.`);
}

// ------------------------------------------------------------------ inicio
export async function openRunFlow() {
  const prev = pendingRun();
  if (prev) {
    const { value } = await ask({
      title: 'Antes de la siguiente corrida',
      describedBy: 'pending-desc',
      body: h('p', { style: { margin: 0 } }, `La corrida `, h('b', { class: 'mono' }, prev.run_id), ` no se ha guardado ni exportado. Elige qué hacer con ella para continuar.`),
      actions: [
        { label: 'Descartar', value: 'discard', cls: 'btn-danger' },
        { label: 'Guardar', value: 'save', icon: 'save' },
        { label: 'Descargar CSV', value: 'export', cls: 'btn-primary', icon: 'download', autofocus: true },
      ],
    });
    if (value === 'export') exportRun(state.current);
    else if (value === 'save') { await openSaveDialog(prev); if (!state.current.run.guardada) return; }
    else if (value === 'discard') {
      const sure = await ask({
        title: `¿Descartar ${prev.run_id}?`,
        body: h('p', { style: { margin: 0 } }, 'La corrida quedará marcada como descartada. Sus lecturas no se borran de este navegador, pero no se mostrará como última corrida.'),
        actions: [{ label: 'Conservar', value: 'keep', autofocus: true }, { label: 'Descartar corrida', value: 'discard', cls: 'btn-danger' }],
      });
      if (sure.value !== 'discard') return;
      await discardRun(prev.run_id);
    } else return;
  }
  openRunForm();
}

export const TIPOS = [
  ['blanco', 'Blanco de tira', 'Tira del mismo lote en agua limpia: referencia del Δ cromático'],
  ['patron', 'Patrón de color inocuo', 'Control del lector óptico; no contiene Hg'],
  ['muestra', 'Muestra', 'Agua o extracto, con procedencia y permiso registrados'],
  // tipos de la versión anterior (turbidez), solo para mostrar corridas antiguas
  ['suspension_a', 'Suspensión inerte A (versión anterior)', null, true],
  ['suspension_b', 'Suspensión inerte B (versión anterior)', null, true],
];
export const MATRICES = [
  ['extracto_sedimento', 'Extracto de sedimento', 'Matriz objetivo: sedimento fluvial (preparación según laboratorio)'],
  ['agua', 'Agua', null],
  ['colas', 'Colas', 'Contingencia futura'],
  ['sedimento_fluvial', 'Sedimento fluvial', null, true],
];
export const label = (list, v) => (list.find((x) => x[0] === v) || [v, v])[1];

const nextSampleId = () => `M-${String(state.runs.length + 1).padStart(3, '0')}`;
const lastFicha = () => state.runs[0] || {};

function openRunForm() {
  const dlg = runDialog();
  const demo = state.mode === 'demo';
  const sens = sensorsOk(state.conn.info);
  const prev = lastFicha();
  const sim = state.ui.sim;

  const err = h('p', { class: 'form-error', id: 'run-form-error', role: 'alert', hidden: true });
  const field = (id, label, control, hint) => h('div', { class: 'field' },
    h('label', { for: id }, label), control,
    hint ? h('span', { class: 'hint', id: `${id}-hint` }, hint) : null,
    h('p', { class: 'field-error', id: `${id}-err` }));
  const select = (id, name, options, value, extra = {}) => h('select', { id, name, required: true, ...extra },
    options.map(([v, l]) => h('option', { value: v, selected: v === value || null }, l)));
  const radios = (name, legend, options, value) => h('fieldset', { class: 'radio-group' },
    h('legend', null, legend),
    options.map(([v, l, hint]) => h('label', { class: 'check' },
      h('input', { type: 'radio', name, value: v, required: true, checked: v === value || null, id: `r-${name}-${v}` }),
      h('span', null, l, hint ? h('small', null, hint) : null))));
  const check = (name, label, small, opts = {}) => h('label', { class: 'check' },
    h('input', { type: 'checkbox', name, required: true, ...opts }),
    h('span', null, label, small ? h('small', null, small) : null));

  const sensorText = state.conn.info
    ? `Lector TCS34725 ${sens.detail.tcs34725 === false ? 'sin respuesta' : 'responde'} · DS18B20 ${sens.detail.ds18b20 === false ? 'sin respuesta' : 'responde'}`
    : 'Sin datos de la estación';

  const form = h('form', { method: 'dialog', novalidate: true },
    h('div', { class: 'modal-head' },
      h('h1', { id: 'run-dialog-title' }, 'Nueva lectura de tira (120 s)'),
      h('p', null, demo ? 'Demostración: la estación es simulada y los datos se marcarán como archivo de prueba.' : 'Estación EST-01 · los datos se registran como banco real.'),
    ),
    h('div', { class: 'modal-body' },
      h('p', { class: 'meta', style: { margin: 0 } }, 'Todos los campos son obligatorios salvo los marcados como opcionales.'),
      h('fieldset', null, h('legend', null, 'Identificación'),
        h('div', { class: 'fields' },
          field('f-caso', 'ID de caso', h('input', { class: 'input mono', id: 'f-caso', name: 'id_caso', required: true, autocomplete: 'off', autocorrect: 'off', autocapitalize: 'characters', spellcheck: 'false', enterkeyhint: 'next', value: prev.id_caso || 'DEMO-01', 'aria-describedby': 'f-caso-hint f-caso-err', autofocus: true }), 'Caso ficticio DEMO-01 mientras no haya sitio piloto.'),
          field('f-muestra', 'ID de muestra', h('input', { class: 'input mono', id: 'f-muestra', name: 'id_muestra', required: true, autocomplete: 'off', autocorrect: 'off', autocapitalize: 'characters', spellcheck: 'false', enterkeyhint: 'next', value: nextSampleId(), 'aria-describedby': 'f-muestra-err' })),
        ),
        h('div', { class: 'fields', style: { marginTop: 'var(--sp-3)' } },
          radios('tipo_corrida', 'Tipo de corrida', TIPOS.filter((t) => !t[3]), TIPOS.some((t) => t[0] === prev.tipo_corrida && !t[3]) ? prev.tipo_corrida : 'blanco'),
          radios('matriz', 'Matriz', MATRICES.filter((t) => !t[3]), MATRICES.some((t) => t[0] === prev.matriz && !t[3]) ? prev.matriz : 'extracto_sedimento'),
        ),
      ),
      h('fieldset', null, h('legend', null, 'Tira, volumen y controles'),
        h('div', { class: 'fields' },
          field('f-lote', 'Lote de tiras', h('input', { class: 'input mono', id: 'f-lote', name: 'lote_tira', required: true, autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', value: prev.lote_tira || (demo ? 'LOTE-DEMO-01' : '') }), 'Marca y lote del envase; el blanco y la muestra deben usar el mismo lote.'),
          field('f-vol', 'Volumen de muestra (mL)', h('input', { class: 'input mono', id: 'f-vol', name: 'volumen_ml', type: 'text', inputmode: 'decimal', required: true, pattern: '[0-9]+([.,][0-9]+)?', value: String(prev.volumen_ml || 150) })),
          field('f-blanco', 'Blanco de tira del día', select('f-blanco', 'blanco', [
            ['registrado', 'Registrado antes de esta corrida'], ['es_blanco', 'Esta corrida es el blanco'], ['pendiente', 'Pendiente (queda como incidencia)'],
          ], 'registrado')),
        ),
        check('volumen', 'Volumen medido con recipiente graduado'),
        check('camara', 'Cámara oscura cerrada y tira en el alojamiento marcado', 'Sin luz exterior; LED del lector encendido y estable.'),
        check('tira', 'Tira dentro de su vencimiento y sin contacto previo', 'Tiempo de inmersión según el fabricante.'),
        check('sondas', 'Sonda de temperatura en la muestra', 'Fuera del compartimento óptico.'),
        check('sensores', 'Sensores respondiendo', sensorText, { checked: sens.ok || null, disabled: !sens.ok || null }),
      ),
      h('fieldset', null, h('legend', null, 'Responsable y permisos'),
        h('div', { class: 'fields' },
          field('f-operador', 'Operador (perfil)', select('f-operador', 'operador', [
            ['ing_sistemas_1', 'Ing. Sistemas 1'], ['ing_sistemas_2', 'Ing. Sistemas 2'], ['ing_sistemas_3', 'Ing. Sistemas 3'], ['ing_industrial', 'Ing. Industrial'], ['ing_electromecanica', 'Ing. Electromecánica'],
          ], prev.operador || 'ing_sistemas_1')),
          field('f-permiso', 'Permiso de uso', select('f-permiso', 'permiso_uso', [
            ['interno', 'Uso interno del equipo'], ['institucional', 'Remisión institucional (requiere autorización)'], ['publico_acordado', 'Divulgación acordada'],
          ], prev.permiso_uso || 'interno')),
        ),
        h('div', { class: 'field' },
          h('label', { for: 'f-inc' }, 'Incidencias (opcional)'),
          h('textarea', { id: 'f-inc', name: 'incidencias', 'aria-describedby': 'f-inc-hint' }),
          h('span', { class: 'hint', id: 'f-inc-hint' }, 'Lo que conviene saber al revisar la corrida.')),
      ),
      demo ? h('fieldset', { class: 'sim-fieldset' }, h('legend', null, 'Simulación (solo demostración)'),
        h('div', { class: 'fields' },
          field('f-falla', 'Falla a ensayar', select('f-falla', 'failure', [
            ['ninguna', 'Ninguna'], ['wifi', 'Caída de Wi-Fi entre 30 y 52 s'], ['sensor', 'Sensor de temperatura sin respuesta (40–58 s)'], ['optico', 'Lector óptico sin respuesta (60–72 s)'], ['energia', 'Pérdida de energía a los 70 s'],
          ], sim.failure)),
          field('f-resp', 'Respuesta simulada de la tira (solo «Muestra»)', select('f-resp', 'respuesta', [['nula', 'Sin cambio de color'], ['baja', 'Cambio leve (bajo el criterio)'], ['media', 'Cambio cerca del criterio'], ['alta', 'Cambio marcado (sobre el criterio)']], sim.respuesta || 'alta')),
          field('f-vel', 'Velocidad', select('f-vel', 'speed', [['8', 'Acelerada ×8 (15 s) para presentación'], ['1', 'Tiempo real (120 s)']], String(sim.speed))),
        )) : null,
    ),
    h('div', { class: 'modal-foot' },
      err,
      h('button', { class: 'btn btn-ghost', type: 'button', value: 'cancel', onclick: () => dlg.close('cancel') }, 'Cancelar'),
      h('button', { class: 'btn btn-primary', type: 'submit', value: 'start' }, icon('play'), 'Iniciar corrida'),
    ),
  );

  // Validación tras interacción: el mensaje aparece junto al campo y en el resumen del pie.
  const messages = {
    id_caso: 'Escribe el ID de caso.', id_muestra: 'Escribe el ID de la muestra.',
    lote_tira: 'Escribe el lote de tiras.', volumen_ml: 'Escribe el volumen en mL (número).',
    volumen: 'Confirma el volumen medido.', camara: 'Confirma la cámara cerrada y la posición de la tira.', tira: 'Confirma el estado de la tira.', sondas: 'Confirma la sonda de temperatura.',
    sensores: 'Los sensores deben responder para iniciar. Revisa el TCS34725 (I2C 0x29) y el DS18B20 (GPIO25).',
  };
  form.addEventListener('input', (e) => {
    const t = e.target; if (t.name === 'id_caso' || t.name === 'id_muestra') t.value = t.value.toUpperCase().replace(/\s+/g, '-');
    if (t.name === 'tipo_corrida' && t.value === 'blanco') form.elements.blanco.value = 'es_blanco';
    const fe = document.getElementById(`${t.id}-err`); if (fe && t.checkValidity()) fe.textContent = '';
    if (!err.hidden) validate(false);
  });
  form.addEventListener('focusout', (e) => {
    const t = e.target; const fe = t.id && document.getElementById(`${t.id}-err`);
    if (fe) { fe.textContent = t.checkValidity() ? '' : messages[t.name] || 'Completa este campo.'; t.setAttribute('aria-invalid', String(!t.checkValidity())); }
  });
  function validate(focus = true) {
    const bad = [...form.elements].filter((el) => el.willValidate && !el.checkValidity());
    const sensorsBlocked = form.elements.sensores.disabled;
    const list = bad.map((el) => messages[el.name] || 'Completa los campos obligatorios.');
    if (sensorsBlocked) list.unshift(messages.sensores);
    if (state.conn.status !== 'online' && state.conn.status !== 'demo') list.unshift('Sin conexión con la estación.');
    err.hidden = !list.length;
    err.textContent = [...new Set(list)].join(' ');
    for (const el of bad) el.setAttribute('aria-invalid', 'true');
    if (focus && bad[0]) bad[0].focus();
    return !list.length;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate()) return;
    const f = form.elements;
    const ficha = {
      id_caso: f.id_caso.value.trim(), id_muestra: f.id_muestra.value.trim(),
      tipo_corrida: f.tipo_corrida.value, matriz: f.matriz.value,
      lote_tira: f.lote_tira.value.trim(), volumen_ml: Number(f.volumen_ml.value.replace(',', '.')),
      controles: { camara: f.camara.checked, tira: f.tira.checked, sondas: f.sondas.checked, sensores: f.sensores.checked, blanco: f.blanco.value },
      operador: f.operador.value, permiso_uso: f.permiso_uso.value, incidencias: f.incidencias.value.trim(),
    };
    let simOpts;
    if (demo) { simOpts = { failure: f.failure.value, speed: Number(f.speed.value), respuesta: f.respuesta.value }; state.ui.sim = simOpts; writePref('hg.demo.sim', simOpts); }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true; submit.replaceChildren(icon('sync'), 'Iniciando…');
    try {
      await startRun(ficha, simOpts);
      dlg.close('started');
    } catch (ex) {
      err.hidden = false;
      err.textContent = ex.status === 409
        ? `La estación ya tiene una corrida en captura${ex.run_id ? ` (${ex.run_id})` : ''}. Espera a que termine.`
        : 'No se pudo iniciar: sin respuesta de la estación. Revisa la red Wi-Fi y vuelve a intentarlo.';
      submit.disabled = false; submit.replaceChildren(icon('play'), 'Iniciar corrida');
    }
  });

  mount(dlg, form);
  dlg.returnValue = '';
  dlg.showModal();
}

