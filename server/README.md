# API en la nube de Hg-Guard (MongoDB)

Desplegada en **https://taku-server.vercel.app** (estado en `/api/health`).

Guarda en **MongoDB Atlas** las corridas de la estación (con sus 121 filas), las observaciones del bioindicador Lemna
y los manifiestos satelitales. La web los guarda primero en el navegador y los copia aquí con
**Configuración → Nube del equipo → Sincronizar**.

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
| `/api/sync` | POST | `x-hg-key` | Inserta o actualiza por `run_id` (corridas) o `id` (Lemna, escenas). Repetir no duplica |
| `/api/datos?coleccion=corridas\|lemna\|escenas[&id=][&filas=1]` | GET | `x-hg-key` | Lista o detalle |

Colecciones: `corridas` (metadatos + `filas[]`), `lemna`, `escenas` (solo el manifiesto; las imágenes quedan en el navegador).

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
   - `HG_TEAM_KEY` = una clave larga que solo conozca el equipo, por ejemplo la salida de
     `node -e "console.log(crypto.randomUUID())"`.
5. *Deploy*. Comprueba `https://<tu-proyecto>.vercel.app/api/health` → `{"ok":true,…}`.

### 3. Conectar la web

- En la web publicada (o en la del ESP32, si hay internet): **Configuración → Nube del equipo** → dirección
  `https://<tu-proyecto>.vercel.app` + la clave del equipo → *Probar conexión* → *Sincronizar con la nube*.
- Para dejar la dirección preconfigurada en la web pública:
  `VITE_CLOUD_API=https://<tu-proyecto>.vercel.app npm run deploy:pages` (desde `web/`). La clave nunca se publica.

## Probar en local

```bash
cd server && npm install
MONGODB_URI="mongodb+srv://…" HG_TEAM_KEY="clave" npm run dev     # http://localhost:3001/api/health
```

## Seguridad

- Las cadenas de conexión y la clave **solo** van en las variables de entorno de Vercel. Nunca en el código ni en el repositorio.
- Sin la clave nadie puede leer ni escribir datos; `/api/health` no expone datos.
- Para cambiar la clave, edita `HG_TEAM_KEY` en Vercel y redespliega (*Redeploy*).
