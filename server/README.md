# Servidor Ahgora (API + MongoDB)

Desplegada en **https://taku-server.vercel.app** (estado en `/api/health`).

Base de datos central de Ahgora (secciones 3 y 7.6 de la guía): reúne las **muestras** que sincroniza la app modo
técnico y las confirmaciones de laboratorio, alertas aprobadas y visibilidad que agrega Ahgora Web. Desde aquí los
datos van a Ahgora Web (autoridades) y, solo lo aprobado y en zonas agregadas, a Ahgora Comunidad.

| Pieza | Servicio | Costo |
|---|---|---|
| Base de datos | MongoDB Atlas **M0 (Free)**: 512 MB, sin tarjeta | Gratis, sin vencimiento |
| API (`server/api/*.js`) | Vercel **Hobby**: funciones serverless, sin tarjeta | Gratis; si se pasa del límite se pausa, no cobra |
| Web pública | GitHub Pages (repo público) | Gratis |

> Ninguna de las tres cuentas pide tarjeta, así que no hay cargos automáticos. **No** pases a Atlas Flex o M10 ni a
> Vercel Pro (esos sí son de pago).

## Base de datos «ahgora» (v2, 25 nov 2026)

La API usa la base **`ahgora`** (antes `hgguard`, con estaciones y corridas de Hg-Guard, que queda intacta y sin uso).
Al primer arranque crea las colecciones con un **validador `$jsonSchema`** e índices (`lib/esquema.js`): MongoDB
rechaza documentos sin los campos mínimos. Estructura según la guía vigente (*Descripción de la solución* 7.6 y
*Guía definitiva y Android Comunidad*, secciones 08 y 09):

| Colección | Qué guarda | Lo escribe |
|---|---|---|
| `muestras` | Registro técnico protegido: código, matriz, cabezal, fecha, coordenadas, lecturas crudas del ESP32 (RGBC del TCS34725 o voltamograma), cálculo C_sed/C_pez, semáforo, controles, calibración, certeza, laboratorio, alerta, visibilidad | App modo técnico, Ahgora Web, simulador |
| `avisos` | Versión pública del aviso (guía 09): `id`, `zona_id`, `version`, `estado` (confirmacion_pendiente · en_analisis · resultado_confirmado · retirado), `titulo`, `resumen`, `accion`, `entidad`, `publicado_en`, `actualizado_en`, `retirado` | Solo el servidor, en `/api/sync` |
| `bitacora` | Cada publicación, actualización o retiro, con responsable y fecha (guía 08) | Solo el servidor |
| `zonas` | Zonas públicas (celdas de 0,1°) con su contacto oficial | `/api/admin` (inicializar) |
| `reportes` | Reportes comunitarios voluntarios (en revisión, nunca se publican) | Ahgora Comunidad |
| `mape` | Unidades mineras y su **estado legal**: `al_dia` · `en_tramite` · `ilegal`, con `base_estado` (registro_ajam, tramite_ajam, inspeccion_ajam, denuncia, presuncion_satelital, demostracion) y su huella satelital | Ahgora Web |
| `sitios` | Sitio piloto Alcoche (Caranavi): ubicación, eje Coroico → Kaka, comunidades | `/api/admin` |
| `referencias` | Antecedentes publicados de la zona (estudios, AJAM, Concejo, prensa) | `/api/admin` |

## Endpoints

| Ruta | Método | Clave | Qué hace |
|---|---|---|---|
| `/` y `/api/health` | GET | No | Estado, versión y base en uso |
| `/api/sync` | POST | `x-ahg-key` | `{ "muestras": [...], "mape": [...] }`: inserta o actualiza por `codigo` / `id`. Rechaza (y lista en `rechazadas`) lo que no tiene código, matriz válida o fecha. Si cambia lo que ve la comunidad, actualiza `avisos` y la `bitacora` |
| `/api/datos?coleccion=…` | GET | `x-ahg-key` | `muestras`, `mape`, `avisos`, `bitacora`, `zonas`, `reportes`, `sitios`, `referencias`. `&codigo=` o `&id=` para uno; `&desde=ISO` para lo cambiado después |
| `/api/admin` | GET | `x-ahg-key` | Colecciones, documentos, simulados y validadores |
| `/api/admin` | POST | `x-ahg-key` | `{ accion: "inicializar", sitio, referencias, zonas }` (idempotente) · `{ accion: "borrar_demostracion" }` (solo lo marcado `demostracion: true`) |
| `/api/public/zonas` | GET | No | Zonas con contacto y avisos vigentes (guía 09) |
| `/api/public/avisos` | GET | No | Avisos vigentes; `?zona_id=`, `?desde=<cursor>` (incluye retiros), `?id=` (detalle). Devuelve `{ items, cursor }` |
| `/api/alertas` | GET | No | Formato anterior para Ahgora Comunidad (se mantiene por compatibilidad) |
| `/api/reportes` | POST / GET | No / `x-ahg-key` | Reportes comunitarios (máx. 20 por hora por origen) |
| `/api/lecturas` | POST | `x-ahg-nodo` (`AHG_NODE_KEY`) | Lector ESP32 por WiFi: `{ node_id, firmware?, rssi?, lecturas: [{ seq, t, r, g, b, c, r_norm… }] }` (máx. 120). Reintentar no duplica (nodo + seq + hora). Colección `lecturas`, se borra sola a los 30 días |
| `/api/lecturas` | GET | `x-ahg-key` | `?node_id=&desde=<ISO o ms>&limit=` → `{ items, nodos, ahora }`. Lo usan la web («Lector en vivo») y la app modo técnico (lectura «WiFi») |

### Cargar datos y simular el lector

- **Ahgora Web → Configuración → Base de datos del servidor → «Preparar base y cargar simulación»**: crea las
  colecciones, carga el sitio Alcoche, sus antecedentes y zonas, y envía 25 muestras y 13 unidades mineras simuladas.
- **Simulador del ESP32** (desde `server/`): `node scripts/simular-esp32.mjs --key <clave> --n 6 --cada 20` envía una
  muestra cada 20 s con lecturas crudas, cálculo y semáforo, como la app modo técnico. `--seco` las imprime sin enviar.
- **Puente `.jsonl` → base** (desde `server/`): `node scripts/cargar-jsonl.mjs ../firmware/lecturas_AHG-SED-01.jsonl ../firmware/lecturas_AHG-PEZ-01.jsonl --key <clave>` carga a la colección «lecturas» lo que grabó el simulador en PC (`firmware/pc_sim`) o lo copiado del Monitor Serie (`--real`). Repetir no duplica; `--seco` solo cuenta. Ver `firmware/README.md`.
- «Borrar simulación» deja la base solo con datos reales (también quita las lecturas `simulado: true`).

Probado de punta a punta con MongoDB real (mongodb-memory-server) el 25 nov 2026: validadores activos, 25 muestras,
5 avisos públicos, retiro con versión 2 visible en `?desde=`, sin duplicados al repetir, 401 sin clave.

### Avisos para Ahgora Comunidad: id, versión y retiro

El servidor guarda en cada muestra un campo `publicacion` que **solo él escribe** (lo que envíe un cliente se ignora):
`{ id, version, huella, zona, actualizado_en, retirado_en }`.

- `id`: `av-` + hash del `codigo`. Es estable y no revela el código de la muestra.
- `version`: sube en `/api/sync` **solo** si cambia lo que ve la comunidad (estado de la alerta, visibilidad, mensaje,
  tipo, certeza, matriz, zona o laboratorio). Repetir la sincronización o cambiar lecturas o responsables no la sube.
- Retiro: si un aviso aprobado y público deja de estarlo (se desaprueba o pasa a restringido), sube la versión y se
  marca `retirado_en`. `/api/alertas` lo informa así durante 90 días, con la zona que ya era pública:
  `{ id, version, matriz, zona, retirado: true, fecha }`. Si se vuelve a aprobar, se restaura con una versión nueva.

```jsonc
// GET /api/alertas
{ "aviso": "Primera señal, no un diagnóstico ni una prueba legal.", "items": [
  { "id": "av-e6c00c92796553d5", "version": 2, "matriz": "sedimento",
    "zona": { "lat_min": -15.5, "lon_min": -67.9, "lat_max": -15.4, "lon_max": -67.8 },
    "certeza": "confirmado", "nivel": "CONFIRMADO POR LABORATORIO", "tipo": "tranquilizador",
    "mensaje": "…", "fecha": "2026-11-24T16:20:00Z", "laboratorio": "…", "demostracion": false,
    "actualizado_en": "2026-11-25T01:21:13.499Z" } ] }
```

### Reportes comunitarios

```jsonc
// POST /api/reportes   →   201 { ok, estado: "en_revision", recibido_en }
{ "tipo": "peces",            // agua_turbia | peces | actividad_minera | residuos | otro
  "descripcion": "…",         // opcional, se recorta a 500 caracteres
  "zona": { "lat_min": -15.5, "lon_min": -67.9 },   // opcional; se vuelve a agregar a la celda de 0,1°
  "creado_en": "2026-11-24T20:00:00Z", "origen": "ahgora-comunidad-android" }
```

No se guarda la IP: solo una huella (hash con la clave del equipo) para el límite de 20 reportes por hora.

Pruebas sin base de datos: `npm test` (desde `server/`).

Registro de muestra (el registro está documentado en [web/README.md](../web/README.md#registro-de-muestra-contrato-con-la-app-modo-técnico-y-el-firmware)).
La cabecera antigua `x-hg-key` y la variable `HG_TEAM_KEY` siguen aceptándose para no romper el despliegue existente.

## Puesta en marcha (unos 10 minutos)

### 1. MongoDB Atlas (base de datos)

1. Crea la cuenta en https://www.mongodb.com/cloud/atlas/register (con Google o correo).
2. *Create cluster* → **M0 Free** → proveedor AWS, región São Paulo (`sa-east-1`), la más cercana a Bolivia.
3. *Database Access* → *Add New Database User* → usuario `hgguard_api` con contraseña generada y rol **Read and write to any database**.
4. *Network Access* → *Add IP Address* → **Allow access from anywhere** (`0.0.0.0/0`). Vercel no tiene IP fija.
5. *Connect* → *Drivers* → copia la cadena `mongodb+srv://hgguard_api:<contraseña>@…/?retryWrites=true&w=majority`.

### 2. Vercel (API)

1. Entra en https://vercel.com/signup con **Continue with GitHub** (plan **Hobby**).
2. *Add New… → Project* → importa `amabe11/taku`.
3. **Root Directory:** `server`. Framework: *Other*. Deja vacíos el *Build* y el *Output*.
4. *Environment Variables*:
   - `MONGODB_URI` = la cadena del paso 1 (con la contraseña real).
   - `AHG_TEAM_KEY` (o la ya existente `HG_TEAM_KEY`) = una clave larga que solo conozca el equipo, por ejemplo la salida de
     `node -e "console.log(crypto.randomUUID())"`.
   - `AHG_NODE_KEY` = otra clave larga, distinta, para los lectores ESP32 (`firmware/`). Solo permite **enviar** lecturas
     a `/api/lecturas`: si se filtra desde un firmware, no da acceso a leer ni a cambiar datos.
5. *Deploy*. Comprueba `https://<tu-proyecto>.vercel.app/api/health` → `{"ok":true,…}`.

### 3. Conectar la web y la app

- Ahgora Web: **Configuración → Servidor Ahgora** → dirección `https://<tu-proyecto>.vercel.app` + clave del equipo →
  *Probar conexión*, y origen de datos «Servidor Ahgora».
- App modo técnico: `POST /api/sync` con la cabecera `x-ahg-key` y `{ "muestras": [ … ] }` cuando haya señal.
- Ahgora Comunidad: `GET /api/alertas` (sin clave).
- Dirección preconfigurada en la web pública: `VITE_CLOUD_API=https://<tu-proyecto>.vercel.app npm run deploy:pages`
  (desde `web/`). La clave nunca se publica.

## Probar en local

```bash
cd server && npm install
MONGODB_URI="mongodb+srv://…" AHG_TEAM_KEY="clave" npm run dev     # http://localhost:3001/api/health
```

## Seguridad

- Las cadenas de conexión y la clave **solo** van en las variables de entorno de Vercel. Nunca en el código ni en el repositorio.
- Sin la clave nadie puede leer ni escribir datos; `/api/health` no expone datos.
- Para cambiar la clave, edita `AHG_TEAM_KEY` (o `HG_TEAM_KEY`) en Vercel y redespliega (*Redeploy*).
