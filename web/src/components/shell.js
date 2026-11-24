// Sidebar (escritorio/tablet), barra superior y cajón de navegación (teléfono), banners de modo.
import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { state, on, writePref } from '../state.js';
import { connectionPill } from './badges.js';

export const NAV = [
  { caption: 'Operación', items: [
    ['mapa', 'Mapa de monitoreo', 'map'],
    ['estaciones', 'Estaciones', 'station'],
    ['lecturas', 'Lecturas', 'readings'],
    ['bioindicador', 'Bioindicador Lemna', 'drop'],
    ['evidencia', 'Evidencia', 'evidence'],
    ['laboratorio', 'Laboratorio', 'lab'],
    ['reportes', 'Reportes', 'reports'],
  ] },
  { caption: 'Territorio', items: [
    ['satelite', 'Imágenes satelitales', 'satellite', 'con internet'],
    ['espacial', 'Análisis espacial', 'spatial', 'con internet'],
  ] },
  { caption: null, items: [['configuracion', 'Configuración', 'settings']] },
];

const brand = () => h('div', { class: 'brand' },
  h('span', { class: 'logo-slot', 'aria-hidden': 'true' }, 'Logo'),
  h('div', { class: 'brand-text' }, h('div', { class: 'brand-title' }, 'Estación de monitoreo'), h('div', { class: 'brand-sub' }, 'Hg-Guard · ORO-4.1')));

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
    onclick: () => { state.ui.sidebar = app.dataset.sidebar === 'expanded' ? 'collapsed' : 'expanded'; writePref('hg.sidebar', state.ui.sidebar); applySidebar(); },
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

  // ---------------- banners de modo y conexión
  const banner = document.getElementById('demo-banner');
  function renderMode() {
    mount(topPill, connectionPill(state.conn.status));
    mount(footMode,
      state.mode === 'demo' ? 'Modo demostración' : 'Estación EST-01',
      state.persistent ? null : h('div', { style: { color: 'var(--state-warn)' } }, 'Sin almacenamiento local: exporta antes de cerrar.'),
    );
    if (state.mode === 'demo') {
      banner.hidden = false;
      banner.className = 'demo-banner';
      mount(banner, icon('beaker_demo', { cls: 'shrink-0 w-5 h-5 text-hg-warn' }),
        h('span', null, h('strong', null, 'Demostración'),
          h('span', { class: 'banner-long' }, ' — estación simulada; los datos son archivo de prueba, no mediciones reales.'),
          h('span', { class: 'banner-short' }, ': datos simulados, no mediciones reales.')),
        h('button', { class: 'link-btn', type: 'button', onclick: () => switchMode('device') }, 'Usar la estación real'));
    } else if (state.conn.status === 'offline') {
      banner.hidden = false;
      banner.className = 'offline-banner';
      mount(banner, icon('wifi_off', { cls: 'shrink-0 w-5 h-5 text-hg-muted' }),
        h('span', null, h('strong', null, 'Sin conexión con la estación. '),
          h('span', { class: 'banner-long' }, 'Conecta el teléfono a la red Wi-Fi de la estación y abre la IP que imprime la placa. Las corridas guardadas siguen disponibles.'),
          h('span', { class: 'banner-short' }, 'Únete a la red Wi-Fi de la estación.')),
        h('button', { class: 'link-btn', type: 'button', onclick: () => switchMode('demo') }, 'Usar modo demostración'));
    } else banner.hidden = true;
  }
  on('conn', renderMode); on('mode', renderMode);
  renderMode();
}

export function switchMode(mode) {
  writePref('hg.mode', mode);
  const url = new URL(location.href);
  url.searchParams.delete('demo');
  location.replace(url);
}
