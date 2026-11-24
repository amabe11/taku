// Simulador de la placa para probar la web en modo «estación real» sin hardware.
// Sirve data/*.gz como ESPAsyncWebServer (Content-Encoding: gzip) y la API del contrato.
// Uso: npm run build && node scripts/mock-esp32.mjs [puerto] [velocidad]
//      luego abrir http://localhost:<puerto>/?demo=0
// Es una referencia del contrato para el firmware: NO genera mediciones reales.
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.argv[2] || 4180);
const SPEED = Number(process.argv[3] || 8); // 1 = tiempo real
const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json' };
const N = 121;
const boot = Date.now();
let counter = 0;
let run = null; // { run_id, estado, started, body, motivos }

const elapsed = () => (run ? ((Date.now() - run.started) / 1000) * SPEED : 0);
function tick() {
  if (run?.estado === 'CAPTURA' && elapsed() >= N - 1) run.estado = 'COMPLETA';
}
// Fila del contrato: temperatura (DS18B20, °C) y cuentas del lector de tiras (TCS34725: r, g, b, c).
// Una tira «Muestra» cambia de color durante el tiempo de reacción (G y B bajan); blanco y patrón no.
function row(seq) {
  const k = run?.body?.tipo_corrida === 'muestra' ? 0.4 : 0;
  const dev = k * (1 - Math.exp(-seq / 35));
  const w = Math.sin(seq * 1.7) * 6;
  const r = Math.round(3150 * (1 - dev * 0.15) + w), g = Math.round(3320 * (1 - dev) + w), b = Math.round(2780 * (1 - dev * 1.25) + w);
  return { seq, t_seg: seq, temp_c: Math.round((18.4 + seq * 0.002) / 0.0625) * 0.0625, r, g, b, c: Math.round((r + g + b) * 1.08), motivo: '' };
}
const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
};

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  tick();
  if (url.pathname === '/api/status') {
    return json(res, 200, {
      build: 'mock-esp32 0.2.0', config_id: 'CFG-BANCO-01', sensor_ok: { tcs34725: true, ds18b20: true },
      optica: { sensor: 'TCS34725', direccion: '0x29', ganancia: '4x', integracion_ms: 154, led: 'encendido' },
      estado: run ? run.estado : 'ESPERA', run_id: run?.run_id ?? null,
      seq_actual: run?.estado === 'CAPTURA' ? Math.min(N - 1, Math.floor(elapsed())) : null,
      uptime_ms: Date.now() - boot, estacion: 'EST-01',
    });
  }
  if (url.pathname === '/api/run' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let b; try { b = JSON.parse(body); } catch { return json(res, 400, { error: 'json_invalido' }); }
      if (!b.id_muestra || !b.id_caso || !(b.volumen_ml > 0) || b.volumen_confirmado !== true || !b.fecha_iso)
        return json(res, 422, { error: 'faltan_campos_o_volumen_sin_confirmar' });
      if (run?.estado === 'CAPTURA') {
        if (run.body.id_muestra === b.id_muestra && run.body.fecha_iso === b.fecha_iso) return json(res, 200, { run_id: run.run_id, estado: run.estado });
        return json(res, 409, { error: 'corrida_activa', run_id: run.run_id });
      }
      counter += 1;
      run = { run_id: `HG-B-${String(counter).padStart(3, '0')}`, estado: 'CAPTURA', started: Date.now(), body: b, motivos: [] };
      return json(res, 201, { run_id: run.run_id, estado: run.estado });
    });
    return;
  }
  if (url.pathname === '/api/run') {
    if (!run) return json(res, 404, { error: 'sin_corrida' });
    const from = Math.max(0, Number(url.searchParams.get('from') || 0));
    const upto = run.estado === 'CAPTURA' ? Math.min(N, Math.floor(elapsed()) + 1) : N;
    const filas = []; for (let s = from; s < upto; s++) filas.push(row(s));
    return json(res, 200, { run_id: run.run_id, estado: run.estado, motivos: run.motivos, origen: 'banco_real', filas });
  }
  // estáticos: igual que serveStatic("/", LittleFS, "/").setDefaultFile("index.html") con archivos .gz
  const path = url.pathname === '/' ? '/index.html' : url.pathname;
  const gz = join(DATA, path + '.gz');
  if (!path.includes('..') && existsSync(gz)) {
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream', 'Content-Encoding': 'gzip' });
    return res.end(readFileSync(gz));
  }
  res.writeHead(404); res.end('no encontrado');
}).listen(PORT, () => console.log(`Simulador de placa en http://localhost:${PORT}/?demo=0 (velocidad ×${SPEED})`));
