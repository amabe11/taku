// Visión artificial para el bioindicador Lemna (lenteja de agua), sin librerías y sin red.
// Segmenta cada píxel por color en HSV:
//   verde (tejido sano) · clorosis (amarillo/pálido) · necrosis (pardo) · fondo (agua, recipiente, brillo).
// Métricas: cobertura vegetal (% de la imagen), fracciones de clorosis y necrosis sobre la planta y un
// conteo aproximado de frondas por componentes conexas. Son indicadores de respuesta biológica:
// NO son específicos de mercurio (luz, nutrientes, temperatura y otros contaminantes también influyen).

export const CLASS_COLORS = { fondo: [16, 17, 36], verde: [56, 217, 159], clorosis: [242, 193, 78], necrosis: [255, 143, 163] };

function hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

/** 0 fondo · 1 verde · 2 clorosis · 3 necrosis */
export function classify(r, g, b) {
  const [h, s, v] = hsv(r, g, b);
  if (v < 0.14) return 0;
  if (s < 0.16) return 0;                       // brillo, recipiente blanco, agua gris
  if (h >= 180 && h <= 270) return 0;           // agua azul
  if (h >= 68 && h < 175 && s >= 0.2 && v >= 0.16) return 1;
  if (h >= 42 && h < 68 && s >= 0.24 && v >= 0.32) return 2;
  if (h >= 6 && h < 42 && s >= 0.22 && v < 0.82) return 3;
  return 0;
}

/** Dibuja la imagen reducida (máx. maxW px de ancho) en un canvas y devuelve su ImageData. */
export function toImageData(source, maxW = 360) {
  const w0 = source.naturalWidth || source.videoWidth || source.width;
  const h0 = source.naturalHeight || source.videoHeight || source.height;
  const sc = Math.min(1, maxW / w0);
  const w = Math.max(1, Math.round(w0 * sc)), h = Math.max(1, Math.round(h0 * sc));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  return { canvas: c, data: ctx.getImageData(0, 0, w, h) };
}

export function analyze(imageData) {
  const { width: w, height: h, data } = imageData;
  const cls = new Uint8Array(w * h);
  const n = [0, 0, 0, 0];
  for (let i = 0, p = 0; p < w * h; p++, i += 4) { const k = classify(data[i], data[i + 1], data[i + 2]); cls[p] = k; n[k]++; }
  const plant = n[1] + n[2] + n[3];
  // frondas aproximadas: componentes conexas (4-vecinos) de la máscara de planta, ≥ 0,15 % de la imagen
  const seen = new Uint8Array(w * h); const minPx = Math.max(6, Math.round(w * h * 0.0015));
  let frondas = 0; const stack = [];
  for (let p = 0; p < w * h; p++) {
    if (!cls[p] || seen[p]) continue;
    let size = 0; stack.push(p); seen[p] = 1;
    while (stack.length) {
      const q = stack.pop(); size++;
      const x = q % w, y = (q / w) | 0;
      if (x > 0 && cls[q - 1] && !seen[q - 1]) { seen[q - 1] = 1; stack.push(q - 1); }
      if (x < w - 1 && cls[q + 1] && !seen[q + 1]) { seen[q + 1] = 1; stack.push(q + 1); }
      if (y > 0 && cls[q - w] && !seen[q - w]) { seen[q - w] = 1; stack.push(q - w); }
      if (y < h - 1 && cls[q + w] && !seen[q + w]) { seen[q + w] = 1; stack.push(q + w); }
    }
    if (size >= minPx) frondas += Math.max(1, Math.round(size / (minPx * 6)));
  }
  const pct = (a, b) => (b ? (100 * a) / b : 0);
  return {
    ancho: w, alto: h,
    cobertura_pct: pct(plant, w * h),
    verde_pct: pct(n[1], plant), clorosis_pct: pct(n[2], plant), necrosis_pct: pct(n[3], plant),
    frondas_aprox: frondas,
    cls,
  };
}

/** Imagen de clasificación para mostrar junto a la original (colores de la leyenda). */
export function classCanvas(result) {
  const c = document.createElement('canvas'); c.width = result.ancho; c.height = result.alto;
  const ctx = c.getContext('2d'); const img = ctx.createImageData(c.width, c.height);
  const pal = [CLASS_COLORS.fondo, CLASS_COLORS.verde, CLASS_COLORS.clorosis, CLASS_COLORS.necrosis];
  for (let p = 0; p < result.cls.length; p++) { const col = pal[result.cls[p]]; img.data.set([col[0], col[1], col[2], 255], p * 4); }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Respuesta indicativa del bioindicador frente al control del mismo día. */
export function respuesta(obs, control) {
  const inhib = control && control.metricas.cobertura_pct > 0 ? Math.max(0, 100 * (1 - obs.metricas.cobertura_pct / control.metricas.cobertura_pct)) : null;
  const m = obs.metricas;
  let nivel = 'sin respuesta aparente';
  if ((inhib ?? 0) >= 25 || m.necrosis_pct >= 12) nivel = 'respuesta marcada';
  else if ((inhib ?? 0) >= 10 || m.clorosis_pct >= 15 || m.necrosis_pct >= 5) nivel = 'respuesta leve';
  return { inhibicion_pct: inhib, nivel };
}
