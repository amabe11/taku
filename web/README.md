# Hg-Guard · plataforma web de la estación

Web que sirve el ESP32 por Wi-Fi local (LittleFS, **sin internet**) para registrar lecturas de **tiras de mercurio**
con un lector colorimétrico y **temperatura**, conservar la evidencia de la muestra, seguir el **bioindicador Lemna**
y preparar la priorización de análisis de laboratorio. Con internet, la misma web añade contexto satelital y
territorial con APIs abiertas (Sentinel-2, NASA). Proyecto Gold4Good, desafío ORO-4.1.

> **Límites científicos.**
> - La tira es un **cribado colorimétrico**. El lector entrega cuentas R, G, B y C (TCS34725) y la web calcula el
>   **Δ cromático** respecto al blanco de tira del día. Es una magnitud óptica adimensional, **no una concentración**,
>   y no se convierte a mg/L ni mg/kg sin una curva validada para la matriz.
> - El estado de Hg sigue la guía (p. 5): **pendiente**, **indeterminado**, **prioridad de confirmación** y
>   **resultado disponible**. Sin un criterio operativo acordado, todo queda «pendiente de laboratorio».
> - Lemna y las imágenes satelitales son evidencia complementaria: **no miden mercurio**.

## Flujo (datos.jpeg)

Zona de interés: **Yungas bolivianos** (sitio piloto por definir) → estación ESP32 (temperatura + lector de tiras),
bioindicador Lemna (simulación + visión artificial), imágenes satelitales (Sentinel-2 / NASA) y dron (futuro) →
plataforma web → evidencias y seguimiento → **priorización de análisis de laboratorio** → autoridades y comunidades.

## Desarrollo

```bash
npm install
npm run dev                                # modo demostración (estación simulada)
HG_ESP32=http://192.168.4.1 npm run dev    # reenvía /api a una placa real (proxy de Vite)
npm run build && npm run mock              # compila y simula la placa: http://localhost:4180/?demo=0
```

- `?demo=1` fuerza la demostración y `?demo=0` la estación real. También se cambia en **Configuración**.
- En la demostración, la respuesta de la tira (nula, leve, cerca del criterio, marcada) y las fallas son simuladas:
  caída de Wi-Fi, temperatura sin respuesta, lector óptico sin respuesta o pérdida de energía. Todo queda marcado
  como **Demostración** (`origen = archivo_prueba`, IDs `DEMO-B-###`).

## Compilar y cargar en LittleFS

```bash
npm run build
```

- `dist/` es la **web completa**: se usa desde un portátil con internet (por ejemplo `npm run preview`) para las
  vistas satelitales.
- `data/` es **lo que va en la placa** (`.gz`, ~143 KB): estación, lecturas, Lemna, evidencia, laboratorio, reportes
  y configuración. Las vistas *Imágenes satelitales* y *Análisis espacial* (geotiff.js, ~212 KB) quedan fuera:
  necesitan internet y la red de la estación no lo tiene.

1. Copia el contenido de `web/data/` en la carpeta `data/` del proyecto del firmware.
2. **PlatformIO:** `board_build.filesystem = littlefs`, luego `pio run -t uploadfs`.
   **Arduino IDE 2:** complemento *arduino-littlefs-upload*.
3. Sirve los estáticos (ESPAsyncWebServer entrega `ruta.gz` con `Content-Encoding: gzip`):

```cpp
LittleFS.begin();
WiFi.softAP("HG-GUARD-EST01", "<clave>");               // IP 192.168.4.1
server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html");
server.begin();
```

## Hardware de la estación

| Componente | Conexión | Uso |
|---|---|---|
| ESP32 DevKitC V4 | USB | Adquisición y servidor web |
| TCS34725 (breakout 3,3 V) | I2C `0x29`, SDA GPIO21, SCL GPIO22, LED fijo | Lector de tiras en cámara oscura: cuentas R, G, B, C |
| DS18B20 | DQ GPIO25 con 4,7 kΩ a 3V3 | Temperatura de la muestra (°C) |
| AS7341 (alternativa) | I2C `0x39` | Solo si el laboratorio pide otra banda; un lector por montaje |

Ya no hay sensor de turbidez (SEN0189/ADS1115). Si cambian la ganancia, la integración, el LED, la cámara o el lote
de tiras, actualizar `config_id`.

## API esperada del ESP32

Respuestas JSON con `Content-Type: application/json` y `Cache-Control: no-store`. `scripts/mock-esp32.mjs` es la
implementación de referencia ejecutable.

### `GET /api/status`

```json
{ "build": "fw-0.4.0", "config_id": "CFG-BANCO-01",
  "sensor_ok": { "tcs34725": true, "ds18b20": true },
  "optica": { "sensor": "TCS34725", "ganancia": "4x", "integracion_ms": 154, "led": "encendido" },
  "estado": "ESPERA", "run_id": null, "seq_actual": null, "uptime_ms": 123456, "estacion": "EST-01" }
```

`estado` ∈ `ESPERA | CAPTURA | COMPLETA | INVALIDA | INTERRUMPIDA` (se acepta `INVÁLIDA`). Con `uptime_ms` la web
detecta un reinicio de la placa y marca la corrida como interrumpida.

### `POST /api/run`

```json
{ "id_muestra": "M-001", "id_caso": "DEMO-01", "volumen_ml": 150, "volumen_confirmado": true,
  "fecha_iso": "2026-11-24T14:02:11.000Z", "tipo_corrida": "muestra", "lote_tira": "LOTE-A123" }
```

`201 { "run_id": "HG-B-001", "estado": "CAPTURA" }`. Si el inicio se repite (mismo `id_muestra` y `fecha_iso`), devuelve
la corrida existente. Si hay otra en captura, responde `409 { "error": "corrida_activa", "run_id": … }`.

### `GET /api/run?from=<seq>`

```json
{ "run_id": "HG-B-001", "estado": "CAPTURA", "motivos": [], "origen": "banco_real",
  "filas": [ { "seq": 0, "t_seg": 0, "temp_c": 18.375, "r": 3150, "g": 3320, "b": 2780, "c": 9990, "motivo": "" } ] }
```

- 121 filas a 1 Hz (`seq` de 0 a 120), mientras la tira desarrolla color en la cámara oscura. Un valor inválido va
  como `null` con su `motivo` (`ds18b20_sin_respuesta`, `tcs34725_sin_respuesta`, …).
- La web pide siempre desde la primera seq que le falta y no duplica filas. `404` si la placa ya no tiene la corrida.

## Estado de Hg a partir de la tira

Cuando una lectura termina, se aplica el **criterio operativo** de Configuración: umbral de Δ, banda de
incertidumbre, tira o método, y quién lo validó.

| Condición | Estado |
|---|---|
| Sin criterio activo, o la corrida es un blanco o un patrón | Hg pendiente |
| Control fallido, corrida inválida o interrumpida, o Δ final dentro de la banda | Hg indeterminado |
| Δ final > umbral + banda, con controles válidos | Prioridad de confirmación |
| Δ final < umbral − banda | Hg pendiente (una lectura baja no descarta Hg) |
| Informe registrado en Laboratorio | Resultado disponible (método, matriz, unidad, base, incertidumbre, fuente) |

El Δ final es la mediana de los últimos 10 s. La referencia es el blanco de tira del mismo día; si no hay blanco, se
toma el inicio de la propia corrida. En modo real no hay criterio por defecto. En la demostración se usa uno ficticio,
marcado como tal.

## CSV

UTF-8 con BOM, coma como separador, punto decimal, hora ISO. Siempre 121 filas; las faltantes quedan vacías y con motivo.

`run_id,id_muestra,id_caso,fecha_iso,seq,t_seg,temp_c,r,g,b,c,delta_cromatico,volumen_ml,config_id,estado,motivo,origen,estado_hg,`
`demostracion,estacion,build,matriz,tipo_corrida,lote_tira,sensor_optico,ganancia,integracion_ms,referencia_delta,`
`control_volumen,control_camara,control_tira,control_sonda,control_sensores,control_blanco,criterio_hg,motivo_hg,operador,permiso_uso,incidencias`

Lemna exporta su propio CSV desde la vista Bioindicador.

## Vistas

| Menú | Qué hace | ¿En la placa? |
|---|---|---|
| Mapa de monitoreo | Bolivia en SVG propio, zona de interés Yungas (aprox.), EST-01, antecedente Alcoche–Caranavi, tramo conceptual y panel de la última lectura | Sí |
| Estaciones | Conexión, firmware, `config_id`, TCS34725 y DS18B20, cableado | Sí |
| Lecturas | Δ cromático, canales RGB y temperatura de 0 a 120 s, comparación, tabla de 121 filas | Sí |
| Bioindicador Lemna | Foto propia o simulación → crecimiento (cobertura, frondas), clorosis y necrosis frente al control | Sí |
| Evidencia | Historial con filtros y orden | Sí |
| Laboratorio | Cuatro estados de Hg, cola de priorización (tira + Lemna) y registro de informes | Sí |
| Reportes | Ficha de revisión imprimible, versión comunitaria en lenguaje sencillo, CSV y JSON | Sí |
| Imágenes satelitales | Sentinel-2 L2A: dos fechas, color real, NDVI con máscara SCL, cambio, `manifest.json`; HLS por CMR; dron (futuro) | No (internet) |
| Análisis espacial | Lluvia previa (NASA POWER + gránulos IMERG), relieve y drenaje (Terrarium), GLO-30 y SRTM, referencias CEDIB/AJAM/DGAC | No (internet) |
| Configuración | Modo, criterio operativo de la tira, simulación, datos locales | Sí |

## APIs abiertas que usa la web (todas verificadas con CORS)

| API | Uso | Autenticación |
|---|---|---|
| Earth Search STAC v1 `POST /v1/search`, colección `sentinel-2-c1-l2a` | Búsqueda por `bbox` + `datetime` + `eo:cloud_cover`; lectura por rangos de los COG `visual`, `red` (B04), `nir` (B08) y `scl` | No |
| Earth Search STAC, colección `cop-dem-glo-30` | Teselas de Copernicus DEM (enlaces para QGIS/Python) | No |
| Copernicus Data Space STAC `sentinel-2-l2a` | Catálogo de respaldo (solo búsqueda) | El archivo exige cuenta |
| NASA CMR `granules.json` | `GPM_3IMERGDE` v07 (lluvia diaria), `HLSL30`/`HLSS30` v2.0 (vistas previas), `SRTMGL1` v003 | Búsqueda libre; los datos exigen Earthdata Login |
| NASA POWER, API diaria por punto (`PRECTOTCORR`) | Valores de lluvia de los 3 días previos (no es IMERG; se rotula así) | No |
| AWS Terrain Tiles (Terrarium) | Elevación → sombreado, pendiente y dirección D8 | No |

Sin internet, la comparación satelital guardada («Guardar para usar sin internet») queda en IndexedDB y se reabre
desde la vista.

## Datos en el navegador

IndexedDB versión 2: `runs`, `rows` (`[run_id, seq]`), `lemna` y `escenas`. La siguiente corrida exige guardar,
exportar o descartar la anterior. En Configuración hay respaldo JSON y borrado.

## Estructura

```
src/
  api.js, demo-device.js     contrato del ESP32 y simulador (tiras + temperatura)
  runs.js, hg-rules.js       ciclo de la corrida y estado de Hg por criterio
  lib/optics.js              cromaticidad y Δ cromático
  lemna/                     visión artificial y simulación de Lemna
  geo/                       clientes STAC/CMR/POWER/Terrarium y lectura de rásteres (geotiff.js)
  priorizacion.js            cola de priorización para laboratorio
  components/, views/        interfaz
scripts/
  build-map.mjs · esp32-pack.mjs (elige qué va en la placa) · mock-esp32.mjs
```

## Limitaciones conocidas

- Falta la curva de calibración de la tira y el criterio operativo acordado con el laboratorio.
- La segmentación de Lemna usa umbrales de color fijos. Conviene fotografiar con encuadre, fondo y luz constantes,
  y validar contra conteo manual de frondas.
- Los recortes satelitales usan vistas generales del COG (~23 m de píxel para un área de 17 km). Para 10 m nativos,
  usar un área más chica o QGIS.
- Aún no se probó con la placa física; el contrato se verificó contra `scripts/mock-esp32.mjs`.

## Fuentes y licencias

Mapa base: Natural Earth (dominio público) y ETOPO1, NOAA. Imágenes: Copernicus Sentinel-2 (ESA), NASA HLS, GPM y
POWER. Relieve: AWS Terrain Tiles (Mapzen). Fuentes tipográficas: Atkinson Hyperlegible (SIL OFL).
Librería: geotiff.js (MIT).
