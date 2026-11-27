// Vista «Simulador de datos»: elegir un escenario, ajustarlo y llevar las muestras simuladas a la web (este
// navegador) o al Servidor Ahgora. El lugar es real (Alcoche); las muestras son simuladas y van marcadas.
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { announce } from '../lib/announce.js';
import * as fmt from '../lib/format.js';
import { state, on, readPref, writePref } from '../state.js';
import { SEMAFORO, MATRICES, estimado } from '../model.js';
import { semaforoBadge } from '../components/badges.js';
import { switchMode } from '../components/shell.js';
import { ESCENARIOS, NIVELES, KM_MIN, KM_MAX, generarLote, lugarDeKm } from '../data/escenarios.js';
import { demoMuestras } from '../data/demo.js';
import { usarLote, resetDemo, syncNube } from '../data.js';
import { cloudReady, pushMuestras } from '../cloud.js';
import { downloadText, stamp } from '../csv.js';
import { viewHeader, legalNote } from './common.js';

const PREF = 'ahg.sim.params';
const nuevaSemilla = () => Math.floor(Math.random() * 1e9);

export function simuladorView() {
  const guardado = readPref(PREF, null);
  let escId = ESCENARIOS.some((e) => e.id === guardado?.escenario) ? guardado.escenario : 'frente';
  let p = { ...(ESCENARIOS.find((e) => e.id === escId).p || ESCENARIOS.at(-1).p), ...(guardado?.p || {}) };
  let semilla = guardado?.semilla || nuevaSemilla();
  let lote = [];

  // ---------------- 1 · escenario
  const escList = h('fieldset', { class: 'sim-esc' }, h('legend', { class: 'sr-only' }, 'Escenario'),
    ESCENARIOS.map((e) => h('label', { class: 'sim-esc-opt' },
      h('input', { type: 'radio', name: 'sim-esc', value: e.id, checked: e.id === escId || null, onchange: () => elegir(e.id) }),
      h('span', null, h('b', null, e.nombre), h('small', null, e.texto)))));

  // ---------------- 2 · ajustes
  const out = (id) => h('output', { class: 'sim-out mono', for: id });
  const rango = (id, label, min, max, step, value, hint) => {
    const o = out(id);
    const inp = h('input', { type: 'range', id, min, max, step, value: String(value), class: 'sim-range', oninput: leer });
    return { inp, o, el: h('div', { class: 'field' }, h('div', { class: 'sim-lab' }, h('label', { for: id }, label), o), inp, hint ? h('p', { class: 'hint', style: { margin: 0 } }, hint) : null) };
  };
  const fN = rango('sim-n', 'Número de muestras', 5, 100, 1, p.n);
  const fK0 = rango('sim-k0', 'Tramo del río: desde el km', KM_MIN, KM_MAX, 1, p.km[0]);
  const fK1 = rango('sim-k1', 'hasta el km', KM_MIN, KM_MAX, 1, p.km[1], 'Eje Coroico → Kaka. Alcoche está cerca del km 68; Guanay, del 108.');
  const fFallas = rango('sim-fallas', 'Controles fallidos (se repiten)', 0, 40, 1, p.fallas);
  const fLab = rango('sim-lab', 'Con resultado o envío al laboratorio', 0, 60, 1, p.lab);
  const fDias = rango('sim-dias', 'Período de muestreo (últimos días)', 1, 90, 1, p.dias);
  const nivelSel = h('select', { id: 'sim-nivel', onchange: leer },
    Object.entries(NIVELES).map(([v, t]) => h('option', { value: v, selected: Number(v) === p.nivel || null }, t)));
  const matChecks = Object.entries(MATRICES).map(([k, v]) => h('label', { class: 'check check-inline' },
    h('input', { type: 'checkbox', value: k, checked: p.matrices.includes(k) || null, onchange: leer }), h('span', null, v.label)));
  const semillaIn = h('input', { class: 'input mono', id: 'sim-semilla', type: 'number', min: '1', step: '1', value: String(semilla), onchange: () => { semilla = Number(semillaIn.value) || 1; recalcular(); } });
  const ajustes = h('fieldset', { class: 'sim-ajustes' }, h('legend', { class: 'sr-only' }, 'Ajustes'),
    h('div', { class: 'fields' }, fN.el,
      h('div', { class: 'field' }, h('label', { for: 'sim-nivel' }, 'Nivel de mercurio'), nivelSel),
      h('fieldset', { class: 'radio-group' }, h('legend', null, 'Matrices'), h('div', { class: 'sim-mats' }, matChecks))),
    h('div', { class: 'fields' }, fK0.el, fK1.el),
    h('div', { class: 'fields' }, fFallas.el, fLab.el, fDias.el),
    h('div', { class: 'fields' },
      h('div', { class: 'field' }, h('label', { for: 'sim-semilla' }, 'Semilla'), h('div', { class: 'sim-seed' }, semillaIn,
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { semilla = nuevaSemilla(); semillaIn.value = String(semilla); recalcular(); } }, icon('sync'), 'Otra combinación')),
      h('p', { class: 'hint', style: { margin: 0 } }, 'La misma semilla y los mismos ajustes dan siempre las mismas muestras (y los mismos códigos).'))));
  const fijoNote = h('p', { class: 'meta', style: { margin: 0 } }, 'La campaña Alcoche es fija: no tiene ajustes. Elige otro escenario para cambiar los valores.');

  // ---------------- 3 · vista previa
  const preview = h('div', { class: 'sim-preview' });
  // ---------------- 4 · acciones
  const status = h('p', { class: 'meta', role: 'status', style: { margin: 0 } });
  const say = (t) => { status.textContent = t; announce(t); };
  const enDemo = state.mode === 'demo';
  const acciones = h('div', { class: 'view-actions sim-actions' },
    h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => {
      const ok = await usarLote(lote);
      if (!ok) { say('Cambiando al modo simulación para mostrar el lote…'); history.replaceState(null, '', '#/mapa'); switchMode('demo'); return; }
      say(`Listo: ${lote.length} muestras simuladas en la web.`);
      location.hash = '#/mapa';
    } }, icon('map'), enDemo ? 'Usar en la web (reemplazar)' : 'Ver en la web (modo simulación)'),
    enDemo ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: async () => {
      await usarLote(lote, { agregar: true });
      say(`Agregadas ${lote.length} muestras. Ahora hay ${state.muestras.length} en la web.`);
    } }, icon('plus'), 'Agregar a las actuales') : null,
    h('button', { class: 'btn btn-ghost', type: 'button', onclick: async () => {
      if (!cloudReady()) { say('Para enviar al servidor, escribe la clave del equipo en Configuración → Servidor Ahgora.'); return; }
      say('Enviando al Servidor Ahgora…');
      try {
        const n = await pushMuestras(lote);
        say(`Enviadas ${n} muestras simuladas al servidor (marcadas como demostración).`);
        if (state.mode === 'nube') syncNube();
      } catch (e) { say(`No se pudo enviar: ${e.message}`); }
    } }, icon('upload'), 'Enviar al servidor'),
    h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => {
      downloadText(JSON.stringify({ generado: new Date().toISOString(), escenario: escId, ajustes: p, semilla, muestras: lote }, null, 2), `ahgora_simulacion_${escId}_${stamp(true)}.json`, 'application/json');
      say('JSON descargado.');
    } }, icon('download'), 'Descargar JSON'),
    enDemo ? h('button', { class: 'btn btn-quiet', type: 'button', onclick: async () => { await resetDemo(); say('Volviste a la campaña Alcoche.'); } }, 'Volver a la campaña Alcoche') : null);

  // ---------------- lógica
  function leer() {
    p = {
      n: Number(fN.inp.value),
      km: [Number(fK0.inp.value), Number(fK1.inp.value)],
      nivel: Number(nivelSel.value),
      matrices: matChecks.map((l) => l.querySelector('input')).filter((i) => i.checked).map((i) => i.value),
      fallas: Number(fFallas.inp.value), lab: Number(fLab.inp.value), dias: Number(fDias.inp.value),
    };
    if (escId !== 'custom' && escId !== 'campana') {
      escId = 'custom';
      escList.querySelector('input[value="custom"]').checked = true;
    }
    recalcular();
  }
  function poner(v) {
    fN.inp.value = v.n; fK0.inp.value = v.km[0]; fK1.inp.value = v.km[1]; nivelSel.value = String(v.nivel);
    fFallas.inp.value = v.fallas; fLab.inp.value = v.lab; fDias.inp.value = v.dias;
    for (const l of matChecks) { const i = l.querySelector('input'); i.checked = v.matrices.includes(i.value); }
  }
  function elegir(id) {
    escId = id;
    const e = ESCENARIOS.find((x) => x.id === id);
    if (e.p && id !== 'custom') { p = { ...e.p, km: [...e.p.km], matrices: [...e.p.matrices] }; poner(p); }
    recalcular();
  }
  let timer;
  function recalcular() {
    const fijo = escId === 'campana';
    ajustes.disabled = fijo;
    fijoNote.hidden = !fijo;
    const [k0, k1] = [Math.min(...p.km), Math.max(...p.km)];
    fN.o.textContent = String(p.n);
    fK0.o.textContent = `km ${p.km[0]} · ${lugarDeKm(p.km[0])}`;
    fK1.o.textContent = `km ${p.km[1]} · ${lugarDeKm(p.km[1])}`;
    fFallas.o.textContent = `${p.fallas} %`; fLab.o.textContent = `${p.lab} %`; fDias.o.textContent = `${p.dias} días`;
    writePref(PREF, { escenario: escId, p, semilla });
    clearTimeout(timer);
    timer = setTimeout(() => {
      lote = fijo ? demoMuestras() : generarLote({ ...p, km: [k0, k1], semilla, escenario: escId });
      renderPreview(fijo ? null : [k0, k1]);
    }, 120);
  }
  function renderPreview(tramo) {
    const n = (sem) => lote.filter((m) => m.semaforo === sem).length;
    const porMatriz = Object.entries(MATRICES).map(([k, v]) => [v.label, lote.filter((m) => m.matriz === k).length]).filter(([, c]) => c);
    mount(preview,
      h('p', { class: 'sim-total' }, h('span', { class: 'mono' }, String(lote.length)), ' muestras',
        tramo ? h('span', { class: 'meta' }, ` · km ${tramo[0]}–${tramo[1]}, de ${lugarDeKm(tramo[0])} a ${lugarDeKm(tramo[1])}`) : h('span', { class: 'meta' }, ' · todo el tramo')),
      h('div', { class: 'sem-bar', role: 'img', 'aria-label': Object.entries(SEMAFORO).map(([k, v]) => `${v.label}: ${n(k)}`).join(', ') },
        Object.keys(SEMAFORO).map((k) => (n(k) ? h('span', { dataset: { sem: k }, style: { flexGrow: n(k) } }) : null))),
      h('ul', { class: 'sem-list' }, Object.keys(SEMAFORO).map((k) => h('li', null, semaforoBadge(k), h('span', { class: 'mono' }, String(n(k)))))),
      h('p', { class: 'meta', style: { margin: 'var(--sp-2) 0' } }, porMatriz.map(([l, c]) => `${l}: ${c}`).join(' · '),
        ` · con laboratorio: ${lote.filter((m) => m.certeza !== 'cribado').length}`),
      h('div', { class: 'table-wrap' }, h('table', { class: 'data-table compact' },
        h('caption', null, lote.length > 8 ? `Primeras 8 de ${lote.length}` : 'Muestras'),
        h('thead', null, h('tr', null, ['Código', 'Matriz', 'Lugar', 'Estimado', 'Semáforo'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', null, lote.slice(0, 8).map((m) => h('tr', null,
          h('td', { class: 'mono' }, m.codigo), h('td', null, MATRICES[m.matriz]?.label || m.matriz), h('td', null, m.muestreo?.lugar || '—'),
          h('td', { class: 'num mono' }, estimado(m) != null ? `${fmt.conc(estimado(m))} mg/kg` : '—'), h('td', null, semaforoBadge(m.semaforo, { short: true }))))))));
  }

  poner(p);
  recalcular();
  const offs = [on('muestras', () => { /* la vista previa no depende de las muestras cargadas */ })];

  const el = h('div', { class: 'view' },
    viewHeader('Simulador de datos', 'Elige un escenario sobre el sitio real (Alcoche, río Coroico → Kaka), ajústalo y llévalo a la web o al servidor. Las muestras son simuladas y quedan marcadas como demostración.'),
    h('div', { class: 'sim-grid' },
      h('div', { class: 'sim-col' },
        h('section', { class: 'card', 'aria-labelledby': 'sim-t1' }, h('h2', { class: 'card-title', id: 'sim-t1' }, '1 · Escenario'), escList),
        h('section', { class: 'card', 'aria-labelledby': 'sim-t2' }, h('h2', { class: 'card-title', id: 'sim-t2' }, '2 · Ajustes'), fijoNote, ajustes)),
      h('div', { class: 'sim-col sim-sticky' },
        h('section', { class: 'card', 'aria-labelledby': 'sim-t3' }, h('h2', { class: 'card-title', id: 'sim-t3' }, '3 · Vista previa'), preview),
        h('section', { class: 'card', 'aria-labelledby': 'sim-t4' }, h('h2', { class: 'card-title', id: 'sim-t4' }, '4 · Llevar los datos'),
          h('p', { class: 'meta' }, enDemo
            ? 'Estás en modo simulación: «Usar en la web» reemplaza las muestras de este navegador.'
            : 'Estás usando el Servidor Ahgora: «Ver en la web» cambia al modo simulación con este lote, sin tocar la copia del servidor.'),
          acciones, status,
          h('p', { class: 'hint', style: { margin: 'var(--sp-2) 0 0' } }, 'Lo enviado al servidor se puede quitar con «Borrar simulación» en Configuración: solo borra lo marcado como demostración.')),
        legalNote())));
  return { el, destroy() { clearTimeout(timer); offs.forEach((f) => f()); } };
}
