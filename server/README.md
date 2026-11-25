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

## Endpoints

| Ruta | Método | Clave | Qué hace |
|---|---|---|---|
| `/` y `/api/health` | GET | No | Estado de la API y ping a MongoDB |
| `/api/sync` | POST | `x-ahg-key` | `{ "muestras": [registro] }`: inserta o actualiza por `codigo`. Repetir no duplica. Calcula la versión pública del aviso (ver abajo) |
| `/api/datos?coleccion=muestras[&codigo=]` | GET | `x-ahg-key` | Lista o detalle, con ubicación exacta (solo equipo y autoridades) |
| `/api/alertas` | GET | No | Para Ahgora Comunidad: solo mensajes **aprobados** de muestras **públicas**, con zona agregada (celda de 0,1°), sin coordenadas exactas, código de muestra ni responsables. Cada aviso trae `id` y `version`; los retirados en los últimos 90 días llegan con `retirado: true` |
| `/api/reportes` | POST | No | Reporte comunitario voluntario de Ahgora Comunidad. Queda `en_revision`; nunca se publica como aviso. Máx. 20 por hora por origen |
| `/api/reportes[?limit=]` | GET | `x-ahg-key` | Lista los reportes recibidos (más recientes primero) |

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

Colección: `muestras` (el registro está documentado en [web/README.md](../web/README.md#registro-de-muestra-contrato-con-la-app-modo-técnico-y-el-firmware)).
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
