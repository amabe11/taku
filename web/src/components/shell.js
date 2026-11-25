// Ahgora Web: barra lateral (escritorio/tablet), barra superior y cajón (teléfono), banners de modo.
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { state, on, writePref } from '../state.js';

export const NAV = [
  { caption: 'Decidir', items: [
    ['mapa', 'Mapa de muestras', 'map'],
    ['muestras', 'Muestras', 'table'],
    ['priorizacion', 'Cola de priorización', 'queue'],
    ['cuenca', 'Vista de cuenca', 'river'],
    ['indicadores', 'Indicadores', 'gauge'],
    ['alertas', 'Alertas comunitarias', 'bell'],
  ] },
  { caption: 'Transparencia', items: [
    ['metodo', 'Método y límites', 'book'],
  ] },
  { caption: null, items: [['configuracion', 'Configuración', 'settings']] },
];

const brand = () => h('div', { class: 'brand' },
  h('span', { class: 'logo-mark', 'aria-hidden': 'true' }, 'A', h('b', null, 'Hg')),
  h('div', { class: 'brand-text' }, h('div', { class: 'brand-title' }, 'Ahgora Web'), h('div', { class: 'brand-sub' }, 'Cribado de mercurio · ORO-4.1')));

function navList(onNavigate) {
  const frag = [];
  NAV.forEach((group, gi) => {
    if (gi > 0) frag.push(h('hr', { class: 'nav-sep' }));
    const ul = h('ul', { class: 'nav-group', role: 'list' });
    for (const [route, label, ic, tag] of group.items) {
      ul.append(h('li', null, h('a', { class: 'nav-link', href: `#/${route}`, dataset: { route }, title: label, onclick: onNavigate },
        icon(ic), h('span', { class: 'nav-label' }, label, tag ? h('small', { class: 'nav-tag' }, tag) : null))));
    }
    if (group.caption) frag.push(h('div', { class: 'nav-caption', id: `navcap-${gi}` }, group.caption));
    frag.push(ul);
  });
  return frag;
}

export function setCurrent(route) {
  for (const a of document.querySelectorAll('.nav-link')) {
    if (a.dataset.route === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
}

export function createShell() {
  const app = document.getElementById('app');
  const sidebar = document.getElementById('sidebar');
  const topbar = document.getElementById('topbar');
  const drawer = document.getElementById('nav-drawer');
  const sheet = document.getElementById('nav-drawer-sheet');
  const scroller = drawer.querySelector('.drawer-scroller');

  // ---------------- barra lateral con colapso (riel de iconos en tablet)
  const tablet = window.matchMedia('(width < 75rem)');
  const applySidebar = () => {
    const mode = state.ui.sidebar || (tablet.matches ? 'collapsed' : 'expanded');
    app.dataset.sidebar = mode;
    collapse.setAttribute('aria-expanded', String(mode === 'expanded'));
  };
  const collapse = h('button', {
    class: 'collapse-btn', type: 'button', 'aria-controls': 'sidebar',
    onclick: () => { state.ui.sidebar = app.dataset.sidebar === 'expanded' ? 'collapsed' : 'expanded'; writePref('ahg.sidebar', state.ui.sidebar); applySidebar(); },
  }, icon('collapse'), h('span', { class: 'collapse-label' }, 'Contraer menú'));
  const footMode = h('div', { class: 'foot-text' });
  const nav = h('nav', { 'aria-label': 'Principal' }, navList());
  mount(sidebar, brand(), nav, h('div', { class: 'sidebar-foot' }, footMode, collapse));
  tablet.addEventListener('change', applySidebar);
  applySidebar();

  // ---------------- teléfono: barra superior + cajón (dialog con scroll-snap)
  const menuBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Abrir menú', 'aria-expanded': 'false', 'aria-controls': 'nav-drawer', onclick: openDrawer }, icon('menu'));
  const topPill = h('span');
  mount(topbar, menuBtn, brand(), topPill);
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cerrar menú', autofocus: true, onclick: closeDrawer }, icon('close'));
  mount(sheet, h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' } }, brand(), closeBtn),
    h('nav', { 'aria-label': 'Principal (móvil)' }, navList(() => closeDrawer())));

  async function openDrawer() {
    drawer.showModal();
    if (!CSS.supports('scroll-initial-target', 'nearest')) {
      scroller.scrollTo({ left: scroller.offsetWidth, behavior: 'instant' });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    scroller.scrollTo({ left: 0, behavior: 'auto' });
  }
  function closeDrawer() { scroller.scrollTo({ left: scroller.offsetWidth, behavior: 'auto' }); }
  const threshold = 1 / Math.max(window.innerWidth, 320);
  new IntersectionObserver((entries) => {
    const e = entries.at(-1);
    if (e.intersectionRatio < threshold && drawer.open) { drawer.close(); menuBtn.setAttribute('aria-expanded', 'false'); }
    if (e.intersectionRatio === 1) menuBtn.setAttribute('aria-expanded', 'true');
  }, { root: drawer, threshold: [threshold, 1] }).observe(sheet);
  drawer.addEventListener('click', (e) => { if (!sheet.contains(e.target)) closeDrawer(); });
  drawer.addEventListener('cancel', (e) => { if (e.cancelable) { e.preventDefault(); closeDrawer(); } });
  if (!CSS.supports('animation-timeline: scroll()')) {
    scroller.addEventListener('scroll', () => drawer.style.setProperty('--drawer-backdrop', String(1 - scroller.scrollLeft / sheet.offsetWidth)));
  }

  // ---------------- banners de modo y servidor
  const banner = document.getElementById('demo-banner');
  function renderMode() {
    const n = state.nube;
    mount(topPill, modePill());
    mount(footMode,
      state.mode === 'demo' ? 'Modo demostración' : 'Servidor Ahgora',
      state.persistent ? null : h('div', { style: { color: 'var(--state-warn)' } }, 'Sin almacenamiento local: exporta antes de cerrar.'),
    );
    if (state.mode === 'demo') {
      banner.hidden = false;
      banner.className = 'demo-banner';
      mount(banner, icon('beaker_demo', { cls: 'shrink-0 w-5 h-5 text-hg-warn' }),
        h('span', null, h('strong', null, 'Demostración'),
          h('span', { class: 'banner-long' }, ' — muestras, comunidades y resultados de laboratorio ficticios. No son mediciones reales.'),
          h('span', { class: 'banner-short' }, ': datos ficticios, no mediciones reales.')),
        h('button', { class: 'link-btn', type: 'button', onclick: () => switchMode('nube') }, 'Usar el servidor'));
    } else if (n.status === 'error' || n.status === 'sin_config') {
      banner.hidden = false;
      banner.className = 'offline-banner';
      mount(banner, icon('wifi_off', { cls: 'shrink-0 w-5 h-5 text-hg-muted' }),
        h('span', null, h('strong', null, n.status === 'sin_config' ? 'Servidor sin configurar. ' : 'Sin conexión con el servidor. '),
          h('span', { class: 'banner-long' }, n.mensaje)),
        h('a', { class: 'link-btn', href: '#/configuracion' }, 'Configurar'));
    } else banner.hidden = true;
  }
  function modePill() {
    if (state.mode === 'demo') return h('span', { class: 'pill', dataset: { conn: 'demo' } }, icon('beaker_demo'), h('span', { class: 'pill-text' }, 'Demostración'));
    const st = state.nube.status;
    const m = { ok: ['online', 'wifi', 'Servidor'], sync: ['checking', 'sync', 'Sincronizando…'], error: ['offline', 'wifi_off', 'Sin servidor'], sin_config: ['offline', 'wifi_off', 'Sin servidor'], idle: ['checking', 'sync', 'Servidor'] }[st] || ['offline', 'wifi_off', 'Servidor'];
    return h('span', { class: 'pill', dataset: { conn: m[0] } }, icon(m[1]), h('span', { class: 'pill-text' }, m[2]));
  }
  on('nube', renderMode); on('mode', renderMode);
  renderMode();
}

export function switchMode(mode) {
  writePref('ahg.mode', mode);
  const url = new URL(location.href);
  url.searchParams.delete('demo');
  location.replace(url);
}
