# Ahgora Web

Sitio para **autoridades ambientales y de salud, laboratorios e investigadores** (sección 7.3 de
`Ahgora_Descripcion_de_la_Solucion_Estilizada.pdf`). Muestra las muestras de cribado de mercurio que llegan del
campo, con su **semáforo** y su **nivel de certeza**, ayuda a decidir **qué enviar primero al laboratorio** y **dónde
intervenir**, y agrega las **capas satelitales de la NASA** como contexto. Desafío ORO-4.1, Gold4Good.

```
Caja Ahgora (ESP32 + cabezal SED o PEZ) ─Bluetooth─► App Android modo técnico ─sync─► Servidor Ahgora ◄── Laboratorio
                                                                                        │
                                                         Ahgora Comunidad (Android) ◄───┴───► Ahgora Web (esta carpeta)
```

> **Límites que la web hace visibles**
> - Es **cribado**: «CRIBADO — NO ES DIAGNÓSTICO NI EVIDENCIA LEGAL». No reemplaza al laboratorio.
> - «Cribado», «en verificación» y «confirmado» **nunca se mezclan** (7.1).
> - Un verde **no** significa «libre de mercurio»; la versión 1 probablemente no detecta sedimentos de 0,17–0,5 mg/kg.
> - Los satélites **no detectan mercurio**: aportan contexto.

## Sitio piloto: Alcoche (Caranavi, La Paz)

Desde el 25 nov 2026 la web se centra en **Alcoche**, comunidad de 775 habitantes sobre el **río Coroico**
(15,751° S, 67,675° O), en la ruta Caranavi–Guanay. Hay minería aurífera nueva junto al río: 76 parches con huella
minera a menos de 10 km, casi todos desde 2021 (Amazon Mining Watch). La AJAM inspeccionó la zona en octubre de 2025
y el Concejo de Caranavi denunció más de 60 operaciones ilegales en Alcoche y Santa Fe (octubre de 2026). **No hay
mediciones públicas de mercurio en Alcoche**: las cifras de la vista «Sitio Alcoche» son de la cuenca del Beni.

- **Real:** ubicación, ríos y localidades (OpenStreetMap), eje Coroico → Kaka, huellas mineras (Amazon Mining Watch),
  antecedentes, caudal, suelo y peces (APIs abiertas).
- **Simulado** (`demostracion: true`, sello «Demostración»): las 25 muestras y sus lecturas del ESP32, los resultados
  de laboratorio y el estado legal de las cooperativas marcadas «ficticia». Solo dos estados legales tienen respaldo
  público: el frente de Alcoche (inspección de la AJAM) y los de Santa Fe (denuncia).

## Vistas

| Menú | Qué hace |
|---|---|
| Mapas: muestras y MAPE | **Dos mapas del mismo territorio**, que se pueden mover juntos. *Muestras*: color = semáforo, forma = matriz, anillo = certeza. *MAPE*: unidades mineras por estado legal (verde papeles al día · amarillo en trámite · rojo ilegal o presunta ilegal), huellas satelitales de 480 m e intensidad minera (indicador indirecto del uso de mercurio). Sentinel-2 2025 y 2018 para comparar, y capas NASA GIBS |
| Sitio Alcoche | Por qué empezar aquí: ficha del lugar, huella minera por año, caudal del Coroico hoy (GloFAS) y lluvia, suelo (SoilGrids), peces de la cuenca (GBIF), antecedentes con su tipo de fuente y plan de muestreo |
| Minería (MAPE) | Registro de unidades mineras con estado legal, base del estado (AJAM, denuncia, presunción satelital) y muestras cercanas. Fuentes y carga del registro oficial (JSON, CSV o GeoJSON) |
| Muestras · ficha | Tabla y ficha de cada muestra: lecturas crudas del ESP32 (casillas de color reconstruidas del RGBC, o el voltamograma del cabezal PEZ), cálculo C_sed/C_pez, laboratorio, minería a 5 km, caudal del día |
| Cola de laboratorio · Vista de cuenca · Indicadores | Igual que antes, sobre el eje real Coroico → Kaka y la población de OSM |
| Avisos y reportes comunitarios | Aprobación de avisos (estados públicos de la guía definitiva, sección 05) y reportes voluntarios |
| Configuración y servidor | Origen de datos, clave del equipo, **estado de la base**, «Preparar base y cargar simulación», «Borrar simulación» |

## Desarrollo

```bash
npm install
npm run dev             # http://localhost:5173 — arranca en demostración
npm run build           # dist/
npm run deploy:pages    # publica en GitHub Pages (rama gh-pages)
```

`?demo=1` fuerza la demostración y `?demo=0` el servidor. En demostración todo es ficticio (`demostracion: true`,
códigos `DEMO-…`): muestras, comunidades, población, frentes mineros y resultados de laboratorio.

## Registro de muestra (contrato con la app modo técnico y el firmware)

Campos de la sección 7.6 + lo que el ESP32 envía por Bluetooth (6.1). La app lo sincroniza con `POST /api/sync`
(`{ "muestras": [ … ] }`, idempotente por `codigo`). Ahgora Web agrega `laboratorio`, `alerta`, `visibilidad` e `historial`.

```jsonc
{
  "codigo": "AHG-SED-0007",
  "matriz": "sedimento",                     // sedimento | cola | pescado
  "cabezal": "SED",                          // SED | PEZ
  "fecha_iso": "2026-11-24T14:02:11-04:00",
  "lat": -15.83, "lon": -67.57,
  "responsable": "Técnico de campo 1",
  "cuenca": "Río Coroico → Kaka · Alcoche (Caranavi)",
  "sitio": "alcoche",
  "muestreo": { "tipo": "compuesta", "porciones": 8, "profundidad_cm": 5, "fino_pct": 35, "lugar": "cerca de Alcoche", "observaciones": "" },
  // PEZ: { "especie": "Pseudoplatystoma fasciatum", "nombre_comun": "Surubí", "gremio": "depredador", "talla_cm": 44, "porcion": "músculo dorsal sin piel" }
  "lecturas": {                              // crudas del sensor
    "n_promedio": 10, "ganancia": "4x", "integracion_ms": 154,
    "referencia_blanca": { "r": 21480, "g": 23310, "b": 20120, "c": 65000 },
    "casilla_sin_usar": { "r": 15820, "g": 16950, "b": 12730, "c": 45210 },
    "casilla_reaccionada": { "r": 15600, "g": 16580, "b": 12640, "c": 44560 },
    "blanco_matriz_delta": 0.6, "delta_e": 12.4
  },                                         // PEZ: { "tecnica", "deposicion_s", "potencial_pico_v", "pico_ua" }
  "calculo": {                               // C_sed = C_ext·V_ext / (m_húmeda·f_seco·R)
    "c_ext_mg_l": 1.2, "v_ext_l": 0.005, "m_humeda_kg": 0.005, "f_seco": 0.65, "recuperacion_r": 0.5,
    "c_estimada_mg_kg": 3.69, "base": "seco"  // PEZ: m_tejido_kg en lugar de m_humeda_kg y f_seco; base "fresco"
  },
  "semaforo": "rojo",                        // rojo | amarillo | verde | invalido  (lo asigna el ESP32)
  "controles": { "blanco_procedimiento": "ok", "cloro_libre_cero": "ok", "referencia_blanca": "ok", "blanco_matriz": "restado", "ph": "ok" },
  "calibracion": "SED-CAL-v0.1",             // versión de la curva usada
  "firmware": "ahgora-fw-0.1",
  "certeza": "cribado",                      // cribado | en_verificacion | confirmado
  "laboratorio": { "laboratorio": "", "enviada_en": "", "fecha_resultado": "", "metodo": "", "resultado_mg_kg": null, "base": "seco", "incertidumbre": "" },
  "visibilidad": "restringido",              // publico | restringido
  "alerta": { "estado": "aprobada", "tipo": "aviso_cribado", "mensaje": "…", "aprobada_por": "…", "fecha": "…" },
  "demostracion": false
}
```

- Un control con valor `"falla"` deja la muestra como `invalido` (no se clasifica; se repite).
- Si falta `c_estimada_mg_kg`, la web lo recalcula con la fórmula cuando están todos los términos.
- CSV de exportación/importación: UTF-8 con BOM, coma, punto decimal, hora ISO; cabecera en `src/csv.js` (`COLUMNS`).

## Datos abiertos conectados (sin registro, verificados el 25 nov 2026)

| Fuente | Para qué | Cómo |
|---|---|---|
| Amazon Mining Watch (Earth Genome, CC BY 4.0) | Huellas de minería aurífera 2018–2026 | Extracto del sitio en `src/data/alcoche-geo.js` (`npm run alcoche`) |
| OpenStreetMap (ODbL) | Ríos, localidades y población | Extracto vía Overpass en `src/data/alcoche-geo.js` |
| Sentinel-2 cloudless (EOX, Copernicus) | Imagen de 10 m, 2025 y 2018 | WMS EPSG:4326 en el mapa |
| NASA GIBS | HLS, Landsat, IMERG, FIRMS, inundaciones, SRTM, GPW | WMS EPSG:4326 en el mapa |
| GloFAS (Copernicus) vía Open-Meteo | Caudal del Coroico: 30 días + pronóstico, y el día de cada muestra | `flood-api.open-meteo.com`, toma la celda del cauce principal |
| ERA5 / Open-Meteo y NASA POWER | Lluvia | API por punto |
| SoilGrids 2.0 (ISRIC) | Arcilla, arena, carbono y pH (el Hg viaja con la arcilla) | `rest.isric.org` |
| GBIF | Peces registrados en la cuenca, para elegir especies del cabezal PEZ | `api.gbif.org` |

No hay API pública del estado legal de cada cooperativa: la AJAM entrega su catastro minero por solicitud. Por eso el
registro MAPE se carga desde la web y se cruza con las huellas satelitales. «Presunta ilegal» es una hipótesis para
verificar, nunca una acusación.

## Estructura

```
src/
  model.js          semáforo, certeza, cálculo C_sed/C_pez, cola, cuenca, indicadores, alertas, zona pública, estado legal MAPE
  data/alcoche.js   sitio piloto, cuenca real, zonas, antecedentes
  data/alcoche-geo.js  extracto de OSM y Amazon Mining Watch (generado)
  data/simulacion.js   simulador del lector ESP32 (TCS34725 y voltametría); lo usa también server/scripts/simular-esp32.mjs
  data/demo.js      campaña simulada de 25 muestras y registro MAPE de demostración
  data.js, store.js origen de datos (demostración / servidor) y copia local en IndexedDB
  cloud.js          API del Servidor Ahgora (x-ahg-key)
  csv.js            CSV, GeoJSON, versión pública
  geo/apis.js       capas NASA GIBS y NASA POWER
  components/, views/
scripts/
  build-map.mjs (mapa base) · build-alcoche.mjs (datos del sitio) · deploy-pages.mjs (GitHub Pages)
```

## Pendiente

- Acceso por rol con usuario y contraseña (hoy el servidor se protege con la clave del equipo).
- Registro oficial de derechos mineros de la AJAM para el tramo Caranavi–Guanay (hoy: estados ficticios salvo Alcoche y Santa Fe).
- Primeras mediciones reales en Alcoche con el laboratorio aliado.
- Criterios de cribado finales por matriz con el laboratorio aliado y las autoridades (6.3).
- Repetir la auditoría de accesibilidad (axe) sobre las vistas nuevas.

## Fuentes y licencias

Mapa base: Natural Earth (dominio público) y ETOPO1, NOAA. Capas: NASA GIBS (HLS, Landsat WELD, GPM IMERG, FIRMS,
LANCE, SRTM, SEDAC GPW) y NASA POWER. Tipografía: Atkinson Hyperlegible (SIL OFL).
