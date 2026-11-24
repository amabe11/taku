# Fase 4 — Revisión UX y accesibilidad

Fecha: 2026-11-23 · Compilación revisada: `web/dist` (131,5 KB gzip) · Navegador: Edge (Chromium) sin interfaz, con Playwright.

## Método

1. **ui-ux-pro-max**: consultas por categoría (`--domain ux`: legibilidad del texto, orden del foco, botones deshabilitados, tablas, color no como única señal) y lista de verificación previa a la entrega.
2. **axe-core 4** sobre las 9 vistas, con reglas WCAG 2.0/2.1/2.2 A y AA y *best-practice*, a 1440 px y 390 px, vacías y con corridas.
3. **Mediciones propias**: objetivos táctiles, desborde horizontal en 320 / 375 / 844×390 (horizontal) / 1440 px, animaciones con `prefers-reduced-motion`, orden del tabulador.
4. **Contraste**: relación calculada para cada par texto/fondo de la paleta (tabla en `MASTER.md`).
5. **Flujos de punta a punta**: corrida válida, caída de Wi-Fi con recuperación, sensor sin respuesta, pérdida de energía y modo estación real contra `scripts/mock-esp32.mjs`.

## Resultado final

| Verificación | Resultado |
|---|---|
| axe-core, 9 vistas × 2 anchos | **0 violaciones** |
| Desborde horizontal (320, 375, 844×390, 1440) | **0 px** en todas las vistas |
| Objetivos táctiles | Botones, enlaces del menú, marcadores y campos ≥ 44 px. Casillas y radios de 20 px dentro de etiquetas de ≥ 40 px (el objetivo es la etiqueta). |
| Movimiento reducido | Halo del marcador: 1 animación sin preferencia → **0** con `reduce` |
| Contraste de texto | Todos los pares ≥ 4,5:1 (mínimo: texto atenuado sobre tarjeta elevada, 6,47:1) |
| Contraste no textual | Bordes de campos `#6A6399` ≥ 3:1; línea de la gráfica `#8B5CF6` 3,48:1 sobre tarjeta |
| Errores de consola en los flujos | Ninguno |

## Hallazgos corregidos

| # | Hallazgo | Fuente | Corrección |
|---|---|---|---|
| 1 | Texto blanco sobre `#8B5CF6` = 4,23:1 (no cumple AA) | Cálculo de contraste | Botón primario `#7C4DEE` (5,06:1); el violeta original queda solo para trazos y foco |
| 2 | Borde `#46406D` < 3:1 en campos de formulario | Cálculo (WCAG 1.4.11) | `--color-border-strong #6A6399` para controles |
| 3 | La barra superior móvil ocupaba una columna en escritorio | Capturas | Especificidad de `.app > .topbar` |
| 4 | Diálogos pegados a la esquina superior izquierda | Capturas | El *preflight* de Tailwind quitaba `margin: auto` |
| 5 | En el teléfono, la ficha asomada tapaba el mapa | Capturas y medición | SVG con altura explícita (un SVG absoluto con `height:auto` usa su proporción); ficha compacta |
| 6 | Pastilla de conexión y sello de procedencia decían ambos «Demostración» | Revisión de contenido | Pastilla: «Estación simulada»; sello: «Demostración» |
| 7 | Aviso de modo y región de avisos fuera de un *landmark* | axe `region` | Regiones con nombre accesible |
| 8 | Etiqueta «con internet» con poco contraste en el ítem activo | axe `color-contrast` | Color `--color-text-muted` |
| 9 | Marcadores antes que los controles en el orden de foco | Orden del tabulador | Orden del DOM = orden de lectura |
| 10 | Rótulos de ejes de 10,5 px | ui-ux-pro-max (escala tipográfica) | Mínimo 12 px |
| 11 | Tabla apilada sin rótulos por celda | Capturas a 390 px | `--label-n` con `setProperty` y una sola caja por celda |
| 12 | Botones recreados a 1 Hz (se perdía el foco) | Revisión del código | Controles persistentes que solo se actualizan; tabla de 121 filas que se actualiza en su sitio |
| 13 | Filtros de Evidencia ocupando toda la pantalla del teléfono | Capturas | Desplegable «Filtros» (abierto en escritorio) |

## Cómo quedan los criterios del prompt

- **Contraste AA sobre fondos oscuros**: verificado por cálculo y con axe.
- **Estados de foco**: `:focus-visible` con contorno de 2 px `#B49AFF` y separación de 2 px en todos los controles. La gráfica y el mapa se recorren con teclado (flechas, Inicio/Fin, +/−).
- **Objetivos táctiles**: ≥ 44 px (`--tap`). La hoja inferior y el menú móvil usan `<dialog>` y scroll-snap.
- **Responsive**: escritorio en tres columnas, tablet con riel de iconos y panel debajo, teléfono con mapa y ficha desplegable. Las acciones *Iniciar corrida*, la gráfica y *Descargar CSV* están siempre visibles.
- **Legibilidad de unidades**: cada valor lleva su unidad pegada (`mV`, `°C`, `s`, `mL`). Los ejes rotulan la magnitud y la unidad («Turbidez relativa · mV (A0)», «t (s)»). «Sin calibrar a NTU» aparece junto a cada lectura de turbidez.
- **El color nunca va solo**: estados con icono y texto; marcadores con forma propia y leyenda textual; serie de temperatura discontinua; huecos de la gráfica tramados y rotulados.

## Pendiente (fuera del alcance de una revisión automática)

- Probar con lector de pantalla real (TalkBack en Android, VoiceOver en iOS) durante una corrida en vivo.
- Probar al sol con el teléfono operador y el brillo real.
- Probar contra la placa física: tiempos reales de `fetch` en modo AP y reinicio por pérdida de energía.
