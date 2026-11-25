// «Método y límites»: lo que podemos afirmar y lo que no (8), sensibilidad (4.7), semáforo (2.4),
// capas NASA (7.4), gobernanza (7.7) y plan de validación (9). La transparencia es parte del sistema.
import { h } from '../lib/dom.js';
import { SEMAFORO, CERTEZA, MENSAJE_COMUNIDAD } from '../model.js';
import { semaforoBadge, certezaBadge } from '../components/badges.js';
import { NASA_LAYERS, NASA_LIMITES } from '../geo/apis.js';
import { viewHeader } from './common.js';

const table = (caption, head, rows) => h('div', { class: 'table-wrap' }, h('table', { class: 'data-table compact' },
  h('caption', null, caption),
  h('thead', null, h('tr', null, head.map((t) => h('th', { scope: 'col' }, t)))),
  h('tbody', null, rows.map(([first, ...rest]) => h('tr', null, h('th', { scope: 'row' }, first), rest.map((c) => h('td', null, c)))))));

export function metodoView() {
  const el = h('div', { class: 'view' },
    viewHeader('Método y límites', 'Qué hace Ahgora, qué puede detectar y qué no. Un cribado para priorizar: nunca reemplaza al laboratorio.'),

    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Cómo llega el dato a esta web'),
      h('ol', { class: 'reasons' },
        h('li', null, 'El técnico registra la muestra en la app Android (modo técnico): código, GPS, fecha, matriz y responsable.'),
        h('li', null, 'Prepara la muestra con el kit y lee con el cabezal que corresponde: SED (sedimentos y colas, colorimétrico) o PEZ (pescado, voltametría sobre oro).'),
        h('li', null, 'El lector Ahgora (ESP32) aplica la calibración versionada, verifica los controles y asigna el semáforo. Envía el registro al celular por Bluetooth.'),
        h('li', null, 'La app guarda sin internet y sincroniza con el Servidor Ahgora cuando hay señal.'),
        h('li', null, 'Ahgora Web (esta página) lo muestra a autoridades y laboratorios; el laboratorio carga la confirmación; un responsable aprueba lo que llega a Ahgora Comunidad.'))),

    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Qué significa cada color'),
      table('Semáforo de cribado', ['Estado', 'Qué significa', 'Qué hacer'], Object.keys(SEMAFORO).map((k) => [semaforoBadge(k), SEMAFORO[k].significa, SEMAFORO[k].accion])),
      h('p', { class: 'community-quote' }, MENSAJE_COMUNIDAD)),

    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Regla de oro: «cribado» y «confirmado» nunca se mezclan'),
      h('ul', { class: 'cert-list' }, Object.keys(CERTEZA).map((k) => h('li', null, certezaBadge(k), { cribado: 'Ahgora en campo.', en_verificacion: 'Muestra enviada, sin resultado aún.', confirmado: 'Resultado del laboratorio de referencia, con fecha y laboratorio.' }[k])))),

    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Lo que podemos afirmar hoy y lo que no'),
      table('Estado de cada afirmación', ['Afirmación', 'Estado'], [
        ['El lector ESP32 + TCS34725 mide color de forma repetible', '✅ Respaldado por la literatura; lo mediremos en el hackathon'],
        ['La extracción con lejía y sal no usa reactivos controlados', '✅'],
        ['El cloro residual se puede neutralizar sin dar falsos positivos', '⚠️ Lo probaremos en el hackathon con blancos'],
        ['La extracción libera el mercurio del sedimento', '⚠️ Respaldado en remediación; la recuperación R debe medirse'],
        ['La versión 1 detecta colas y sedimentos muy contaminados', '⚠️ Esperable según los cálculos; pendiente de validar con mercurio'],
        ['La versión 1 detecta sedimentos cerca del umbral (0,17–0,5 mg/kg)', '❌ Probablemente no. Declarado'],
        ['La voltametría sobre oro detecta el mercurio del pescado', '✅ Publicado (límite de cuantificación 0,06 mg/kg); no validado aún por nosotros'],
        ['Ahgora reemplaza al laboratorio', '❌ Nunca. Es cribado para priorizar'],
      ])),

    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Sensibilidad del cabezal SED (declaración honesta)'),
      h('p', { class: 'meta' }, 'Tira Yiffer YF-HM75CT: escalones impresos de Hg 0 · 0,5 · 1 · 5 · 10 · (~20) ppm. Primer escalón visible 0,5 ppm (500 µg/L). Con 5 g en 5 mL, en base húmeda:'),
      table('Sedimento mínimo detectable según la recuperación R', ['Recuperación R', 'Sedimento mínimo detectable'], [['100 % (ideal)', '0,5 mg/kg'], ['50 %', '1 mg/kg'], ['20 %', '2,5 mg/kg'], ['10 %', '5 mg/kg']]),
      h('ul', { class: 'limits' },
        h('li', null, 'Referencias CCME para sedimentos: 0,17 mg/kg (sin efectos esperados) y 0,486 mg/kg (efectos adversos probables).'),
        h('li', null, 'Colas mineras (decenas o cientos de mg/kg) y puntos críticos (varios mg/kg): detectables.'),
        h('li', null, 'Sedimentos cerca del umbral: la versión 1 probablemente no los detecta. Un verde no descarta contaminación.'),
        h('li', null, 'Pescado (cabezal PEZ): Codex fija 0,5 mg/kg de metilmercurio en peces no depredadores y 1 mg/kg en depredadores. Medir mercurio total es una aproximación conservadora.'))),

    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Capas satelitales de la NASA: la capa de contexto'),
      h('p', { class: 'warn-note' }, 'Los satélites no detectan mercurio. El dato de mercurio viene solo del campo y del laboratorio.'),
      table('Capas disponibles en el mapa (NASA GIBS)', ['Capa', 'Qué muestra', 'Resolución y frecuencia', 'Para qué decisión sirve'], NASA_LAYERS.map((L) => [L.nombre, L.muestra, L.resolucion, L.decision])),
      h('ul', { class: 'limits' }, NASA_LIMITES.map((t) => h('li', null, t)))),

    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Gobernanza, permisos y privacidad'),
      table('Qué puede hacer cada rol', ['Rol', 'Puede'], [
        ['Técnico', 'Registrar muestras y ver las suyas (app modo técnico)'],
        ['Laboratorio', 'Cargar los resultados de confirmación'],
        ['Responsable o autoridad', 'Ver todos los datos con ubicación exacta y aprobar alertas para las comunidades'],
        ['Comunidad', 'Ver las alertas aprobadas y el estado de su zona (Ahgora Comunidad)'],
      ]),
      h('ul', { class: 'limits' },
        h('li', null, 'Las coordenadas exactas solo las ven las autoridades; el público ve zonas agregadas (celdas de ~11 km).'),
        h('li', null, 'Se muestrea y se publica solo con acuerdo previo de las comunidades y un acuerdo de uso de datos.'),
        h('li', null, 'Ahgora no recoge datos de salud de personas (cabello, orina).'),
        h('li', null, 'Todo resultado lleva la etiqueta «cribado, no es evidencia legal ni diagnóstico».'),
        h('li', null, 'Prototipo: el acceso por rol con usuario y contraseña aún no está implementado; el servidor se protege con la clave del equipo.'))),

    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Plan de validación contra laboratorio'),
      table('Fases', ['Fase', 'Qué se hace'], [
        ['0 · Hackathon (sin mercurio)', 'Repetibilidad del lector (meta < 5 %), blancos de procedimiento por triplicado, prueba de cloro, extracto de suelo limpio, tiempo cronometrado.'],
        ['1 · Laboratorio aliado (semanas 1–4)', 'Arena con mercurio añadido de 0 a 10 mg/kg: curva de calibración, recuperación R, límite de detección real, efecto del ascorbato, tolerancia al cloruro y al pH, variabilidad entre lotes.'],
        ['2 · Piloto de comparación (meses 1–3)', '30 a 50 muestras reales divididas en dos: Ahgora y método de referencia (CV-AAS o analizador directo). Sensibilidad, especificidad, falsos negativos, correlación, muestras sin envío, minutos y costo por prueba.'],
        ['3 · Evaluación operativa', 'Técnicos con capacitación breve: facilidad de uso, % de pruebas inválidas, robustez frente a calor, humedad y altura.'],
      ])),
  );
  return { el };
}
