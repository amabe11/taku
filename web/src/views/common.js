// Piezas compartidas por las vistas.
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';

export function viewHeader(title, desc, ...actions) {
  return h('header', { class: 'view-head' },
    h('div', null,
      h('h1', { tabindex: '-1', 'data-view-title': '' }, title),
      desc ? h('p', null, desc) : null),
    actions.length ? h('div', { class: 'view-actions' }, actions) : null);
}

export function emptyState({ iconName = 'info', title, text, actions = [] }) {
  return h('section', { class: 'empty' }, icon(iconName), h('h2', null, title), h('p', null, text),
    actions.length ? h('div', { class: 'view-actions' }, actions) : null);
}

/** Lista de definiciones a partir de pares [término, valor]; omite los vacíos. */
export function dl(pairs, cls = 'kv') {
  const el = h('dl', { class: cls });
  for (const [k, v] of pairs) {
    if (v === undefined || v === null || v === '') continue;
    el.append(h('dt', null, k), h('dd', null, v));
  }
  return el;
}

/** Aviso fijo de la guía: todo resultado lleva la etiqueta de cribado (6.2 y 7.7). */
export const legalNote = () => h('p', { class: 'legal-note' }, icon('info'), 'CRIBADO — NO ES DIAGNÓSTICO NI EVIDENCIA LEGAL. Ahgora no reemplaza al laboratorio: le dice por dónde empezar.');

/** Diálogo de confirmación/formulario genérico sobre #confirm-dialog. Resuelve con los datos del formulario o null. */
export function formDialog({ title, intro, body = [], submit = 'Guardar', danger = false, validate }) {
  const dlg = document.getElementById('confirm-dialog');
  const err = h('p', { class: 'form-error', role: 'alert', style: { visibility: 'hidden' } }, ' ');
  const form = h('form', { method: 'dialog' },
    h('div', { class: 'modal-head' }, h('h1', { id: 'confirm-dialog-title' }, title), intro ? h('p', null, intro) : null),
    h('div', { class: 'modal-body' }, body),
    h('div', { class: 'modal-foot' }, err,
      h('button', { class: 'btn btn-ghost', value: 'cancel', formnovalidate: true }, 'Cancelar'),
      h('button', { class: danger ? 'btn btn-danger' : 'btn btn-primary', value: 'ok' }, submit)));
  dlg.replaceChildren(form);
  return new Promise((resolve) => {
    form.addEventListener('submit', (e) => {
      if (e.submitter?.value !== 'ok') return;
      const data = Object.fromEntries(new FormData(form));
      const msg = validate?.(data);
      if (msg) { e.preventDefault(); err.textContent = msg; err.style.visibility = 'visible'; return; }
      dlg.dataset.result = JSON.stringify(data);
    });
    dlg.addEventListener('close', function onClose() {
      dlg.removeEventListener('close', onClose);
      const ok = dlg.returnValue === 'ok' && dlg.dataset.result;
      resolve(ok ? JSON.parse(dlg.dataset.result) : null);
      delete dlg.dataset.result; dlg.returnValue = '';
    });
    dlg.showModal();
    form.querySelector('[autofocus]')?.focus();
  });
}
