// Vista «Mapa de monitoreo»: dónde (mapa) → qué / cómo / Hg / después (panel de la estación).
import { h } from '../lib/dom.js';
import { createMap } from '../components/map-canvas.js';
import { createStationPanel } from '../components/station-panel.js';

export function mapaView() {
  const map = createMap();
  const panel = createStationPanel();
  const el = h('div', { class: 'view-map' },
    h('h1', { class: 'sr-only', tabindex: '-1', 'data-view-title': '' }, 'Mapa de monitoreo'),
    map.el, panel.el);
  return { el, destroy() { map.destroy(); panel.destroy(); } };
}
