# taku · Hg-Guard (Gold4Good, desafío ORO-4.1)

Estación de primera respuesta para **priorizar la confirmación de mercurio** en Bolivia (zona de interés: Yungas;
sitio piloto por definir). La Paz, 23 al 25 de noviembre de 2026.

- **Estación ESP32:** temperatura (DS18B20) + lector colorimétrico de tiras de Hg (TCS34725), servida por Wi-Fi
  local sin internet.
- **Bioindicador Lemna:** simulación y visión artificial (crecimiento, coloración, necrosis).
- **Contexto territorial:** Sentinel-2 (STAC), NASA HLS, IMERG, POWER, relieve.
- **Flujo:** plataforma web → evidencias → priorización de laboratorio → autoridades y comunidades.

> La estación y la web **no miden concentraciones de mercurio**. La tira es un cribado; el resultado lo da un
> laboratorio. Mientras no exista evidencia analítica, el estado es «Hg pendiente de laboratorio».

## Estructura

| Carpeta / archivo | Contenido |
|---|---|
| `web/` | Plataforma web (Vite + Tailwind v4, JavaScript sin framework). Ver **[web/README.md](web/README.md)**: compilación, carga en LittleFS, API del ESP32, CSV y APIs satelitales |
| `web/data/` | Archivos `.gz` listos para subir a LittleFS (se regeneran con `npm run build`) |
| `server/` | API en la nube (Vercel, gratis) + MongoDB Atlas M0 (gratis). Ver **[server/README.md](server/README.md)** |
| `web/scripts/mock-esp32.mjs` | Simulador de la placa: referencia ejecutable del contrato para el firmware |
| `design-system/hg-guard/` | Sistema de diseño (MASTER, tokens, marca y voz, dirección visual, revisión de accesibilidad, capturas) |
| `Hg-Guard - Guía integrada…pdf` | Guía integrada del equipo (plan de la hackathon) |
| `Fuentes_Abiertas_y_Sensores_HgGuard.md` | Fuentes abiertas, sensores y APIs |
| `datos.jpeg` | Diagrama de los datos que recopila el proyecto |
| `reports/`, `research_notes/` | Investigación de respaldo |

## Web publicada

**https://amabe11.github.io/taku/**: arranca en modo demostración porque ahí no hay placa. Se publica con
`npm run deploy:pages` desde `web/` (GitHub Pages, gratis).
API de datos: **https://taku-server.vercel.app** (Vercel Hobby + MongoDB Atlas M0, gratis).

## Arranque rápido

```bash
cd web
npm install
npm run dev          # http://localhost:5173 en modo demostración (estación simulada)
npm run build        # dist/ (web completa) y data/ (lo que va en la placa)
npm run mock         # simula la placa: http://localhost:4180/?demo=0
```
