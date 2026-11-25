# taku · Ahgora (Gold4Good, desafío ORO-4.1)

**Ahgora** («Hg» dentro de «ahora»; nombre provisional): plataforma portátil de cribado de mercurio en el sitio. Le
da al técnico de campo una primera señal sobre el mercurio de una muestra de **sedimento, cola o pescado** para
decidir **qué muestras enviar primero al laboratorio** y **dónde actuar primero**. No reemplaza al laboratorio.
La Paz, 23 al 25 de noviembre de 2026.

Guía del proyecto: **[Ahgora_Descripcion_de_la_Solucion_Estilizada.pdf](Ahgora_Descripcion_de_la_Solucion_Estilizada.pdf)**.

- **Caja Ahgora (ESP32):** cabezal SED (extracción con lejía y sal + tira + sensor de color TCS34725) y cabezal PEZ
  (voltametría de redisolución sobre oro). Envía el registro por Bluetooth a la app.
- **App Android:** modo técnico (captura sin internet) y Ahgora Comunidad (alertas revisadas).
- **Servidor Ahgora:** API en Vercel + MongoDB Atlas (`server/`).
- **Ahgora Web:** sitio para autoridades y laboratorios (`web/`): mapa, priorización, cuenca, indicadores, alertas y
  capas NASA.

> Es **cribado**, no evidencia legal ni diagnóstico. «Cribado» y «confirmado por laboratorio» nunca se mezclan.

## Estructura

| Carpeta / archivo | Contenido |
|---|---|
| `web/` | Ahgora Web (Vite + Tailwind v4, JavaScript sin framework). Ver **[web/README.md](web/README.md)**: vistas, registro de muestra (contrato con la app y el firmware) y capas NASA |
| `server/` | Servidor Ahgora (Vercel, gratis) + MongoDB Atlas M0 (gratis). Ver **[server/README.md](server/README.md)** |
| `design-system/ahgora/` | Sistema de diseño (MASTER, tokens, marca y voz, dirección visual, revisión de accesibilidad) |
| `Ahgora_Descripcion_de_la_Solucion_Estilizada.pdf` | Descripción de la solución (versión vigente) |
| `Hg-Guard - Guía…pdf`, `Prompt_Plataforma_HgGuard.md`, `Fuentes_Abiertas_y_Sensores_HgGuard.md`, `datos.jpeg` | Planificación anterior (Hg-Guard), como antecedente |
| `reports/`, `research_notes/` | Investigación de respaldo |

## Web publicada

**https://amabe11.github.io/taku/**: arranca en modo demostración. Se publica con `npm run deploy:pages` desde `web/`.
API: **https://taku-server.vercel.app** (`/api/health`, `/api/alertas` público).

## Arranque rápido

```bash
cd web
npm install
npm run dev          # http://localhost:5173 en modo demostración
npm run build        # dist/
```
