// Simulador del lector Ahgora (ESP32 + cabezal SED o PEZ) → POST /api/sync, como lo haría la app modo técnico
// al recuperar la señal. Usa el mismo generador que la demostración de la web (web/src/data/simulacion.js):
// lecturas crudas del TCS34725 (RGBC) o el voltamograma, cálculo C_sed / C_pez, controles y semáforo.
// Todo sale marcado `demostracion: true`, firmware «ahgora-fw-sim» y origen «simulador-esp32».
//
// Uso (desde server/):
//   node scripts/simular-esp32.mjs --key <clave> [--api https://taku-server.vercel.app] [--n 6] [--cada 20] [--seco]
//   AHG_TEAM_KEY=<clave> node scripts/simular-esp32.mjs --n 1
//   --seco   imprime los registros sin enviarlos
import { registroSimulado, rng, PECES } from '../../web/src/data/simulacion.js';
import { CUENCA_ALCOCHE, GEO, SITIO } from '../../web/src/data/alcoche.js';
import { puntoEnEje } from '../../web/src/model.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const API = (arg('api', process.env.AHG_API || 'https://taku-server.vercel.app')).replace(/\/$/, '');
const KEY = arg('key', process.env.AHG_TEAM_KEY || process.env.HG_TEAM_KEY);
const N = Number(arg('n', 3));
const CADA = Number(arg('cada', 20));
const SECO = process.argv.includes('--seco');
if (!KEY && !SECO) { console.error('Falta la clave del equipo: --key <clave> o AHG_TEAM_KEY.'); process.exit(1); }

const rand = rng(Date.now() % 2 ** 31);
const ESPECIES = Object.keys(PECES);
const lugar = (lon, lat) => {
  const l = GEO.localidades.map((x) => ({ x, d: Math.hypot((x.lon - lon) * 107, (x.lat - lat) * 110.6) })).sort((a, b) => a.d - b.d)[0];
  return l.d < 4 ? `cerca de ${l.x.nombre}` : `a ${Math.round(l.d)} km de ${l.x.nombre}`;
};

function una(i) {
  const r = rand();
  const matriz = r < 0.6 ? 'sedimento' : r < 0.75 ? 'cola' : 'pescado';
  const km = 55 + rand() * 65; // de Santa Fe a Teoponte
  const [lon, lat] = puntoEnEje(CUENCA_ALCOCHE.eje, km, matriz === 'cola' ? 0.3 + rand() : rand() * 0.2);
  // Orden de magnitud: más alto junto a los frentes (km 60–75) y aguas abajo de Guanay (km > 108).
  const factor = (km > 60 && km < 75) || km > 108 ? 2.2 : 1;
  const especie = ESPECIES[Math.floor(rand() * ESPECIES.length)];
  const pez = PECES[especie];
  const est = rand() < 0.07 ? null // a veces falla un control
    : matriz === 'cola' ? 5 + rand() * 40
      : matriz === 'pescado' ? (pez.gremio === 'depredador' ? 0.3 + rand() * 0.9 : 0.04 + rand() * 0.2)
        : (0.08 + rand() * 0.35) * factor;
  const cab = matriz === 'pescado' ? 'PEZ' : 'SED';
  const stamp = Date.now().toString(36).toUpperCase();
  return registroSimulado({
    codigo: `SIM-ESP32-${cab}-${stamp}${i}`, matriz, lat, lon, fecha: Date.now(), est, rand,
    falla: est == null ? (cab === 'SED' ? 'cloro_libre_cero' : 'patron_electrodo') : null,
    responsable: 'Técnico de campo (simulador)', sitio: SITIO.id, cuenca: CUENCA_ALCOCHE.nombre, origen: 'simulador-esp32',
    muestreo: cab === 'SED'
      ? { tipo: 'compuesta', porciones: 6, profundidad_cm: 5, fino_pct: Math.round(20 + rand() * 40), lugar: lugar(lon, lat) }
      : { especie, nombre_comun: pez.comun, gremio: pez.gremio, talla_cm: Math.round(28 + rand() * 30), porcion: 'músculo dorsal sin piel', lugar: lugar(lon, lat) },
  });
}

async function enviar(m) {
  const res = await fetch(`${API}/api/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ahg-key': KEY },
    body: JSON.stringify({ origen: 'simulador-esp32', muestras: [m] }), signal: AbortSignal.timeout(30000),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
  return d;
}

for (let i = 0; i < N; i++) {
  const m = una(i);
  const resumen = `${m.codigo} · ${m.matriz} · ${m.muestreo.lugar} · est. ${m.calculo.c_estimada_mg_kg ?? '—'} mg/kg · ${m.semaforo}`;
  if (SECO) console.log(JSON.stringify(m, null, 2));
  else {
    try { const r = await enviar(m); console.log(`✔ ${resumen} → servidor (${r.muestras} guardada${r.rechazadas?.length ? `, rechazos: ${r.rechazadas.join('; ')}` : ''})`); }
    catch (e) { console.error(`✘ ${resumen}: ${e.message}`); }
  }
  if (i < N - 1) await new Promise((r) => setTimeout(r, CADA * 1000));
}
