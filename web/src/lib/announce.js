// Avisos para lectores de pantalla: ariaNotify() cuando existe; si no, región aria-live precargada.
let timer;
export function announce(message, { priority = 'normal' } = {}) {
  if (!message) return;
  if (typeof document.ariaNotify === 'function') {
    document.ariaNotify(message, { priority: priority === 'high' ? 'high' : 'normal' });
    return;
  }
  const live = document.getElementById('live');
  if (!live) return;
  live.setAttribute('aria-live', priority === 'high' ? 'assertive' : 'polite');
  live.textContent = '';
  clearTimeout(timer);
  timer = setTimeout(() => { live.textContent = message; }, 60);
}
