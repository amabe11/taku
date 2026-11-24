// Simulador del firmware para el modo demostración (origen = archivo_prueba).
// Reproduce el contrato de la API del ESP32 (DS18B20 + lector de tiras TCS34725) y permite ensayar
// fallas: caída de Wi-Fi, sensor de temperatura o lector óptico sin respuesta y pérdida de energía.
// Ningún valor representa una muestra real ni una concentración de Hg.

const N = 121; // seq 0..120

// Ruido determinista para que cada corrida sea reproducible a partir de su semilla.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r) => { let u = 0; for (let i = 0; i < 6; i++) u += r(); return u - 3; };

// Cuentas del TCS34725 (ganancia 4×, integración 154 ms) con la tira en la cámara oscura y LED fijo.
// La tira de referencia es clara; la reacción simulada oscurece G y B (vira a naranja/pardo).
const BASE = { r: 3150, g: 3320, b: 2780 };
const RESPUESTA = { nula: 0, baja: 0.08, media: 0.24, alta: 0.42 }; // caída relativa final de G y B
const PATRON = { r: 3650, g: 2480, b: 1720 };          // patrón de color inocuo (control del lector)

export class DemoDevice {
  constructor() {
    this.bootAt = Date.now();
    this.run = null; // { run_id, body, startedAt, speed, failure, seed, estado, motivos }
    this.counter = 0;
    this.lastStart = null;
    // La «placa simulada» sobrevive a una recarga de la pestaña, como la placa real sigue capturando.
    try {
      this.counter = Number(localStorage.getItem('hg.demo.counter') || 0);
      const saved = JSON.parse(sessionStorage.getItem('hg.demo.device') || 'null');
      if (saved) Object.assign(this, saved);
    } catch { /* almacenamiento no disponible */ }
  }
  _save() {
    try { sessionStorage.setItem('hg.demo.device', JSON.stringify({ bootAt: this.bootAt, run: this.run, lastStart: this.lastStart })); } catch { /* sin almacenamiento */ }
  }

  _elapsedSim(now = Date.now()) {
    if (!this.run) return 0;
    return ((now - this.run.startedAt) / 1000) * this.run.speed; // segundos simulados
  }
  _available() { return Math.min(N, Math.floor(this._elapsedSim()) + 1); }
  _wifiDown() {
    if (!this.run || this.run.failure !== 'wifi' || this.run.estado !== 'CAPTURA') return false;
    const t = this._elapsedSim();
    return t >= 30 && t < 52;
  }
  _tick() {
    const r = this.run;
    if (!r || r.estado !== 'CAPTURA') return;
    const t = this._elapsedSim();
    if (r.failure === 'energia' && t >= 70) {
      // La placa se reinicia: pierde la corrida en RAM y vuelve a ESPERA con un nuevo arranque.
      r.estado = 'PERDIDA'; this.bootAt = Date.now(); r.lostAt = Math.floor(t);
      this._save();
      return;
    }
    if (t >= N - 1) {
      if (r.failure === 'sensor') { r.estado = 'INVALIDA'; r.motivos = ['Sensor de temperatura sin respuesta entre t = 40 s y t = 58 s']; }
      else if (r.failure === 'optico') { r.estado = 'INVALIDA'; r.motivos = ['Lector óptico TCS34725 sin respuesta entre t = 60 s y t = 72 s']; }
      else r.estado = 'COMPLETA';
      this._save();
    }
  }

  _row(seq) {
    const r = this.run;
    const rnd = rng(r.seed * 1000 + seq);
    const tipo = r.body.tipo_corrida;
    let base = tipo === 'patron' ? PATRON : BASE;
    const k = tipo === 'muestra' ? (RESPUESTA[r.respuesta] ?? RESPUESTA.alta) : 0;
    const dev = k * (1 - Math.exp(-seq / 35)); // desarrollo del color durante el tiempo de reacción
    const noise = () => gauss(rnd) * 9;
    const rr = Math.round(base.r * (1 - dev * 0.15) + noise());
    const gg = Math.round(base.g * (1 - dev) + noise());
    const bb = Math.round(base.b * (1 - dev * 1.25) + noise());
    const cc = Math.round((rr + gg + bb) * 1.08 + noise());
    const tRaw = 18.35 + seq * 0.0021 + gauss(rnd) * 0.03;
    let temp_c = Math.round(tRaw / 0.0625) * 0.0625; // resolución de 12 bits del DS18B20
    let row = { seq, t_seg: seq, temp_c: +temp_c.toFixed(4), r: rr, g: gg, b: bb, c: cc, motivo: '' };
    if (r.failure === 'sensor' && seq >= 40 && seq <= 58) { row.temp_c = null; row.motivo = 'ds18b20_sin_respuesta'; }
    if (r.failure === 'optico' && seq >= 60 && seq <= 72) { row.r = row.g = row.b = row.c = null; row.motivo = 'tcs34725_sin_respuesta'; }
    return row;
  }

  // ---------------- contrato de la API ----------------
  async status() {
    this._tick();
    if (this._wifiDown()) throw new TypeError('Simulación: sin conexión Wi-Fi con la estación');
    const r = this.run;
    const capturing = r && r.estado === 'CAPTURA';
    const t = this._elapsedSim();
    const sensorFail = capturing && r.failure === 'sensor' && t >= 40 && t < 59;
    const opticFail = capturing && r.failure === 'optico' && t >= 60 && t < 73;
    const visible = r && r.estado !== 'PERDIDA';
    return {
      build: 'demo-sim 0.4.0',
      config_id: 'CFG-DEMO-01',
      sensor_ok: { tcs34725: !opticFail, ds18b20: !sensorFail },
      optica: { sensor: 'TCS34725', direccion: '0x29', ganancia: '4x', integracion_ms: 154, led: 'encendido' },
      estado: visible ? r.estado : 'ESPERA',
      run_id: visible ? r.run_id : null,
      seq_actual: capturing ? this._available() - 1 : null,
      uptime_ms: Date.now() - this.bootAt,
      estacion: 'EST-01',
    };
  }

  async startRun(body, { speed = 1, failure = 'ninguna', respuesta = 'alta' } = {}) {
    this._tick();
    if (this._wifiDown()) throw new TypeError('Simulación: sin conexión Wi-Fi con la estación');
    if (this.run && this.run.estado === 'CAPTURA') {
      // El mismo inicio no duplica la adquisición; otra corrida activa bloquea el reemplazo.
      if (this.lastStart === `${body.id_muestra}|${body.fecha_iso}`) return { run_id: this.run.run_id, estado: 'CAPTURA' };
      const err = new Error('Hay una corrida en captura'); err.status = 409; err.run_id = this.run.run_id; throw err;
    }
    this.counter += 1;
    try { localStorage.setItem('hg.demo.counter', String(this.counter)); } catch { /* sin almacenamiento */ }
    const run_id = `DEMO-B-${String(this.counter).padStart(3, '0')}`;
    this.run = { run_id, body, startedAt: Date.now(), speed, failure, respuesta, seed: this.counter * 7919 + Date.now() % 997, estado: 'CAPTURA', motivos: [] };
    this.lastStart = `${body.id_muestra}|${body.fecha_iso}`;
    this._save();
    return { run_id, estado: 'CAPTURA' };
  }

  async getRun(from = 0) {
    this._tick();
    if (this._wifiDown()) throw new TypeError('Simulación: sin conexión Wi-Fi con la estación');
    const r = this.run;
    if (!r || r.estado === 'PERDIDA') { const err = new Error('Sin corrida en memoria'); err.status = 404; throw err; }
    const upto = r.estado === 'CAPTURA' ? this._available() : N;
    const filas = [];
    for (let seq = Math.max(0, from); seq < upto; seq++) filas.push(this._row(seq));
    return { run_id: r.run_id, estado: r.estado, motivos: r.motivos, origen: 'archivo_prueba', filas };
  }

  get pollMs() { return this.run && this.run.speed > 1 ? 200 : 1000; }
}
