// Simulación del bioindicador Lemna: genera una fotografía sintética de un recipiente con frondas,
// según el día de exposición y el nivel de estrés. Sirve para ensayar el flujo de visión artificial
// sin cultivo real. Toda imagen generada aquí se registra con origen «simulacion».

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const ESTRES = { ninguno: 0, leve: 0.35, alto: 0.8 };

/**
 * @param {{dia:number, estres:number, semilla:number}} o
 * @returns {HTMLCanvasElement}
 */
export function lemnaImage({ dia = 0, estres = 0, semilla = 1 }) {
  const W = 480, H = 360;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const r = rng(semilla * 977 + 13);
  // mesa y recipiente
  ctx.fillStyle = '#d9d6cf'; ctx.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2, R = 165;
  const grad = ctx.createRadialGradient(cx - 40, cy - 40, 20, cx, cy, R);
  grad.addColorStop(0, '#5d7f99'); grad.addColorStop(1, '#3a5468');
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#f2f2ee'; ctx.lineWidth = 6; ctx.stroke();
  // crecimiento: tasa ~0,3/día en control, reducida por estrés
  const rate = 0.3 * (1 - 0.75 * estres);
  const colonies = Math.round(6 * Math.exp(rate * dia));
  // fracción de tejido afectado según estrés y tiempo
  const pChlor = Math.min(0.6, estres * 0.09 * dia);
  const pNecro = Math.min(0.45, Math.max(0, estres - 0.3) * 0.08 * dia);
  for (let k = 0; k < colonies; k++) {
    let ang = r() * Math.PI * 2, dist = Math.sqrt(r()) * (R - 28);
    const x0 = cx + Math.cos(ang) * dist, y0 = cy + Math.sin(ang) * dist;
    const fronds = 2 + Math.floor(r() * 3);
    for (let f = 0; f < fronds; f++) {
      const a2 = r() * Math.PI * 2;
      const x = x0 + Math.cos(a2) * 9 * f, y = y0 + Math.sin(a2) * 7 * f;
      const u = r();
      let col;
      if (u < pNecro) col = `hsl(${22 + r() * 12} ${45 + r() * 15}% ${30 + r() * 12}%)`;
      else if (u < pNecro + pChlor) col = `hsl(${50 + r() * 12} ${62 + r() * 18}% ${52 + r() * 10}%)`;
      else col = `hsl(${100 + r() * 25} ${55 + r() * 20}% ${33 + r() * 10}%)`;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(x, y, 9 + r() * 4, 6 + r() * 3, a2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgb(0 0 0 / 0.18)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }
  // reflejo
  ctx.fillStyle = 'rgb(255 255 255 / 0.08)'; ctx.beginPath(); ctx.ellipse(cx - 60, cy - 70, 70, 24, -0.5, 0, Math.PI * 2); ctx.fill();
  return c;
}
