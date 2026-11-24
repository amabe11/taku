// Vista «Laboratorio»: estados de Hg y registro de evidencia analítica.
// La estación no cambia el estado de Hg: solo un ensayo específico o un informe de laboratorio documentado.
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { announce } from '../lib/announce.js';
import { state, on } from '../state.js';
import { updateRun } from '../runs.js';
import { hgBadge, HG } from '../components/badges.js';
import { HG_TEXT } from '../components/hg-card.js';
import { viewHeader, emptyState, tipoLabel, matrizLabel } from './common.js';
import { priorityQueue } from '../priorizacion.js';
import { provTag } from '../components/badges.js';

const STATES = [
  ['pendiente', 'Lectura de tira sin criterio acordado, por debajo del criterio, o corrida de control', 'Verificar blanco de tira, lote, temperatura y controles. Una lectura baja no descarta Hg.'],
  ['indeterminado', 'Ensayo específico con control fallido, método insuficiente o intervalo que cruza el criterio', 'Documentar el problema y derivar o repetir bajo el procedimiento acordado.'],
  ['prioridad_confirmacion', 'Señal específica por encima del criterio acordado y con controles válidos', 'Confirmar la muestra en laboratorio y analizar si el alcance espacial requiere revisión.'],
  ['resultado_disponible', 'Resultado de laboratorio documentado', 'Mostrar matriz, unidad, base, método e incertidumbre. Remitir según competencia.'],
];

export function laboratorioView() {
  const listSlot = h('div');
  const queueSlot = h('div');
  const el = h('div', { class: 'view' },
    viewHeader('Laboratorio', 'Estado de mercurio de cada muestra. La tira es un cribado colorimétrico: con un criterio acordado y controles válidos puede priorizar la confirmación; el resultado lo da el laboratorio.'),
    h('section', { class: 'card', 'aria-labelledby': 'hg-states-title' },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title', id: 'hg-states-title' }, 'Qué significa cada estado de Hg')),
      h('div', { class: 'table-wrap', role: 'region', tabindex: '0', 'aria-labelledby': 'hg-cap' },
        h('table', { class: 'data-table' },
          h('caption', { id: 'hg-cap', class: 'sr-only' }, 'Estados de evidencia de Hg (guía ORO-4.1, p. 5)'),
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Estado visible'), h('th', { scope: 'col' }, 'Lo que llega'), h('th', { scope: 'col' }, 'Acción operativa'))),
          h('tbody', null, STATES.map(([k, a, b]) => h('tr', null, h('th', { scope: 'row' }, hgBadge(k)), h('td', null, a), h('td', null, b)))))),
      h('p', { class: 'meta', style: { margin: 'var(--sp-3) 0 0', maxWidth: '80ch' } },
        h('b', null, 'Criterio operativo. '), 'El punto de decisión por matriz y analito (método, LOD y LOQ, recuperación y regla para casos cercanos) se acuerda con el laboratorio y se registra en Configuración. Sin criterio activo, el estado de Hg permanece pendiente.')),
    queueSlot,
    listSlot,
  );

  function renderQueue() {
    const q = priorityQueue();
    mount(queueSlot, h('section', { class: 'card', 'aria-labelledby': 'prio-t' },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title', id: 'prio-t' }, 'Cola de priorización para laboratorio'),
        h('span', { class: 'badge', dataset: { tone: 'neutral' } }, icon('info'), h('span', { class: 'badge-text' }, 'Sugerencia, no resultado'))),
      h('p', { class: 'meta' }, 'Ordena las muestras según la lectura de tira (estado de Hg) y la respuesta del bioindicador Lemna. El contexto satelital no suma puntos: orienta la revisión del tramo, no la de la muestra.'),
      q.length ? h('div', { class: 'table-wrap', role: 'region', tabindex: '0', 'aria-labelledby': 'prio-cap' },
        h('table', { class: 'data-table' },
          h('caption', { id: 'prio-cap', class: 'sr-only' }, 'Muestras ordenadas por evidencia disponible'),
          h('thead', null, h('tr', null, ['Orden', 'Muestra', 'Estado de Hg', 'Evidencia considerada', 'Siguiente paso'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', null, q.map((it, i) => h('tr', null,
            h('th', { scope: 'row', class: 'prio-rank' }, String(i + 1)),
            h('td', null, h('span', { class: 'mono' }, it.id_muestra), it.demo ? h('div', { style: { marginTop: '4px' } }, provTag('archivo_prueba')) : null),
            h('td', null, hgBadge(it.run?.estado_hg || 'pendiente')),
            h('td', null, h('ul', { class: 'reasons' }, it.reasons.map((r) => h('li', null, r)))),
            h('td', null, it.accion))))))
        : h('p', { class: 'meta', style: { margin: 0 } }, 'Sin muestras en cola. Aparecen al registrar lecturas de tipo «Muestra» u observaciones de Lemna.')));
  }

  function render() {
    renderQueue();
    if (!state.runs.length) {
      mount(listSlot, emptyState({ iconName: 'lab', title: 'Sin muestras registradas', text: 'Cuando existan corridas, aquí se registra la evidencia analítica que llegue de un laboratorio o de un ensayo específico.' }));
      return;
    }
    mount(listSlot, h('section', { class: 'card', 'aria-labelledby': 'hg-list-title' },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title', id: 'hg-list-title' }, 'Muestras y estado de Hg')),
      h('div', { class: 'table-wrap', role: 'region', tabindex: '0', 'aria-labelledby': 'hg-list-cap' },
        h('table', { class: 'data-table' },
          h('caption', { id: 'hg-list-cap', class: 'sr-only' }, 'Estado de Hg por corrida'),
          h('thead', null, h('tr', null, ['Corrida', 'Muestra', 'Tipo y matriz', 'Estado de Hg', 'Evidencia analítica', 'Acción'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', null, state.runs.filter((r) => !r.descartada).map((r) => h('tr', null,
            h('th', { scope: 'row', class: 'mono' }, r.run_id),
            h('td', { class: 'mono' }, r.id_muestra),
            h('td', null, tipoLabel(r.tipo_corrida), h('br'), h('small', { class: 'meta' }, matrizLabel(r.matriz))),
            h('td', null, hgBadge(r.estado_hg)),
            h('td', null, r.hg ? `${r.hg.metodo} · ${r.hg.fuente}${r.hg.demostracion ? ' (demostración)' : ''}` : h('span', { class: 'meta' }, 'Ninguna registrada')),
            h('td', null, h('button', { class: 'btn btn-quiet', type: 'button', disabled: r.estado === 'captura', onclick: () => openHgDialog(r) }, icon('lab'), r.hg ? 'Revisar' : 'Registrar')),
          ))))),
    ));
  }
  const offs = [on('runs', render), on('lemna', render)];
  render();
  return { el, destroy: () => offs.forEach((f) => f()) };
}

// ------------------------------------------------------------------ registro de evidencia analítica
function openHgDialog(run) {
  const dlg = document.getElementById('run-dialog');
  const demo = state.mode === 'demo' || run.demostracion;
  const v = run.hg || {};
  const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const f = (id, label, control, hint) => h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('span', { class: 'hint' }, hint) : null);
  const input = (id, name, value, extra = {}) => h('input', { class: 'input', id, name, value: value || '', autocomplete: 'off', ...extra });
  const radios = ['indeterminado', 'prioridad_confirmacion', 'resultado_disponible'];
  const form = h('form', { method: 'dialog', novalidate: true },
    h('div', { class: 'modal-head' },
      h('h1', { id: 'run-dialog-title' }, `Evidencia analítica · ${run.run_id}`),
      h('p', null, 'Registra un informe de laboratorio o un ensayo específico documentado. La respuesta de Lemna o una imagen satelital no cambian este estado.')),
    h('div', { class: 'modal-body' },
      demo ? h('p', { class: 'badge', dataset: { tone: 'warn' }, style: { margin: 0 } }, icon('beaker_demo'), h('span', { class: 'badge-text' }, 'Demostración: lo que registres quedará marcado como ficticio, no como resultado real.')) : null,
      h('fieldset', { class: 'radio-group' }, h('legend', null, 'Estado que respalda la evidencia'),
        radios.map((k) => h('label', { class: 'check' },
          h('input', { type: 'radio', name: 'estado', value: k, required: true, checked: (run.estado_hg === k) || null }),
          h('span', null, HG[k].label, h('small', null, HG_TEXT[k]))))),
      h('div', { class: 'fields' },
        f('hg-metodo', 'Método', input('hg-metodo', 'metodo', v.metodo, { required: true }), 'Ej.: EPA 7473 (descomposición térmica, AAS).'),
        f('hg-analito', 'Analito o fracción', input('hg-analito', 'analito', v.analito || 'Hg total', { required: true })),
        f('hg-matriz', 'Matriz analizada', input('hg-matriz', 'matriz', v.matriz || matrizLabel(run.matriz), { required: true })),
        f('hg-base', 'Base', h('select', { id: 'hg-base', name: 'base', required: true },
          ['peso seco', 'peso húmedo', 'no aplica'].map((b) => h('option', { value: b, selected: v.base === b || null }, b)))),
        f('hg-valor', 'Valor (opcional salvo resultado disponible)', input('hg-valor', 'valor', v.valor, { inputmode: 'decimal' })),
        f('hg-unidad', 'Unidad', input('hg-unidad', 'unidad', v.unidad || 'mg/kg', { required: true })),
        f('hg-inc', 'Incertidumbre', input('hg-inc', 'incertidumbre', v.incertidumbre, { required: true }), 'Ej.: ± 12 % (k = 2).'),
        f('hg-lim', 'LOD / LOQ (opcional)', input('hg-lim', 'limites', v.limites)),
        f('hg-fuente', 'Laboratorio o fuente', input('hg-fuente', 'fuente', v.fuente, { required: true })),
        f('hg-informe', 'ID del informe', input('hg-informe', 'informe', v.informe, { required: true, autocorrect: 'off', spellcheck: 'false' })),
        f('hg-fecha', 'Fecha del informe', input('hg-fecha', 'fecha', v.fecha, { type: 'date', required: true })),
      ),
    ),
    h('div', { class: 'modal-foot' }, err,
      run.hg ? h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => {
        await updateRun(run.run_id, { estado_hg: 'pendiente', hg: null });
        announce(`Estado de Hg de ${run.run_id}: pendiente de laboratorio.`); dlg.close();
      } }, 'Volver a pendiente') : null,
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => dlg.close() }, 'Cancelar'),
      h('button', { class: 'btn btn-primary', type: 'submit' }, icon('save'), 'Registrar evidencia')),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const els = form.elements;
    const needValue = els.estado.value === 'resultado_disponible';
    els.valor.required = needValue;
    const bad = [...els].filter((x) => x.willValidate && !x.checkValidity());
    bad.forEach((x) => x.setAttribute('aria-invalid', 'true'));
    if (bad.length) {
      err.hidden = false;
      err.textContent = needValue && !els.valor.value ? 'Un resultado disponible necesita valor, unidad, método, matriz, base, incertidumbre y fuente.' : 'Completa los campos obligatorios: método, analito, matriz, base, unidad, incertidumbre, fuente, informe y fecha.';
      bad[0].focus(); return;
    }
    const hg = Object.fromEntries(['metodo', 'analito', 'matriz', 'base', 'valor', 'unidad', 'incertidumbre', 'limites', 'fuente', 'informe', 'fecha'].map((k) => [k, els[k].value.trim()]));
    hg.demostracion = !!demo;
    hg.origen = demo ? 'archivo_prueba' : 'ensayo_validado';
    hg.registrado = new Date().toISOString();
    await updateRun(run.run_id, { estado_hg: els.estado.value, hg });
    announce(`Evidencia registrada para ${run.run_id}: ${HG[els.estado.value].label}.`);
    dlg.close();
  });
  form.addEventListener('input', (e) => { if (e.target.checkValidity?.()) e.target.removeAttribute('aria-invalid'); });
  mount(dlg, form);
  dlg.showModal();
}
