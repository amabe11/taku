# Hg-Guard — Sistema de diseño (MASTER)

> **Lógica:** al construir una vista, revisar primero `design-system/hg-guard/pages/<vista>.md`.
> Si existe, sus reglas **anulan** este archivo. Si no, rige este MASTER.
>
> **Origen:** base generada con `ui-ux-pro-max --design-system --persist -p "Hg-Guard"`
> (consulta *environmental monitoring dashboard scientific dark mode map data*, densidad 8, movimiento 3).
> La paleta genérica que propuso la herramienta (slate + verde #22C55E) y las fuentes Fira se
> **reemplazaron** por la paleta de `Plataforma_Diseno_Visual_Modulos.md` y por la tipografía de la
> dirección visual elegida (ver `direcciones.md`). Los documentos del equipo mandan sobre la herramienta.

**Proyecto:** Hg-Guard · web local servida por ESP32 (LittleFS, sin internet)
**Categoría:** dashboard de monitoreo ambiental / instrumento de banco
**Dirección visual:** A — «Cartografía nocturna» (`direcciones.md`)
**Diales:** variación 5/10 · movimiento 3/10 · densidad 8/10

---

## 1. Reglas científicas que el diseño hace visibles

| Regla | Cómo se traduce en UI |
|---|---|
| La tira es **cribado**, no resultado | El Δ cromático (adimensional) y la temperatura viven en tarjetas separadas del estado de Hg. Nunca se muestra una concentración derivada de la tira. |
| Sin concentración sin calibración | Cuentas R, G, B, C del TCS34725 y Δ cromático «adimensional»; no existe formato para mg/L o mg/kg salvo en un informe de laboratorio registrado. El estado de Hg sale del criterio operativo acordado (Configuración). |
| Evidencia complementaria | Lemna y satélite muestran su fuente y la nota «no mide mercurio». La cola de priorización es «sugerencia, no resultado». |
| El color nunca es la única señal | Todo estado = **icono + texto + color**. Los marcadores además cambian de **forma**. |
| Marcadores = estado de la estación | Verde = activa, violeta = en revisión, contorno discontinuo = planificada. La leyenda lo dice en texto: «indican estado de la estación, no contaminación». |
| Procedencia visible | `banco_real` (sólido), `archivo_prueba` / «Demostración» (trama diagonal ámbar), `historico` (borde punteado), `ensayo_validado` (sólido + sello de verificación). |
| Tono | Técnico, sobrio, prudente. Sin rojo de alarma para datos; el rosa se reserva a fallos de adquisición. |

## 2. Paleta (tokens primitivos → semánticos)

Paleta base del documento de diseño, verificada con WCAG 2.2 (relación de contraste calculada):

| Primitivo | Hex | Uso semántico | Contraste sobre `#101124` / `#1B1B38` / `#25234C` |
|---|---|---|---|
| `--p-ink-950` | `#101124` | `--color-bg` fondo global | — |
| `--p-ink-900` | `#1B1B38` | `--color-panel` paneles | — |
| `--p-ink-800` | `#25234C` | `--color-elevated` tarjetas elevadas | — |
| `--p-violet-500` | `#8B5CF6` | `--color-accent` línea de la gráfica, contorno del mapa, selección | 4.40 / 3.93 / 3.48 (solo no-texto ≥3:1) |
| `--p-violet-300` | `#B49AFF` | `--color-accent-soft` texto de acento, enlaces | 7.99 / 7.15 / 6.33 ✅ |
| `--p-violet-600` | `#7C4DEE` | `--color-action` fondo de botón primario | blanco encima: **5.06** ✅ |
| `--p-mint-400` | `#38D99F` | `--color-online` conectado / estación activa / válida | 10.28 / 9.20 / 8.15 ✅ |
| `--p-lilac-50` | `#F5F4FF` | `--color-text` | 17.09 / 15.29 / 13.54 ✅ |
| `--p-lilac-300` | `#AAA9C7` | `--color-text-muted` | 8.17 / 7.31 / 6.47 ✅ |
| `--p-ink-600` | `#46406D` | `--color-border` divisores decorativos | 1.96 (decorativo, no delimita controles) |
| `--p-ink-500` | `#6A6399` | `--color-border-strong` bordes de campos y controles | 3.42 / 3.06 ✅ (1.4.11) |
| `--p-amber-300` | `#F2C14E` | `--color-demo`, `--color-warn` demostración, interrumpida, Hg indeterminado | 11.10 / 9.93 / 8.79 ✅ |
| `--p-rose-300` | `#FF8FA3` | `--color-fail` corrida inválida, control fallido | 8.61 / 7.70 / 6.82 ✅ |
| `--p-sky-300` | `#7CC8FF` | `--color-info` prioridad de confirmación, histórico | 10.25 / 9.17 / 8.12 ✅ |

> Ajuste respecto al documento: el violeta `#8B5CF6` con texto blanco da 4.23:1 (no cumple AA para
> texto normal), por eso el botón primario usa `#7C4DEE` y el violeta original queda para trazos,
> contorno y foco. El borde `#46406D` se mantiene solo como divisor decorativo.

### Tokens de estado (cada uno con icono y rótulo obligatorios)

| Familia | Estado | Token | Icono | Rótulo |
|---|---|---|---|---|
| Conexión | En línea | `--state-online` (mint) | punto sólido + ondas | «En línea» |
| | Sin conexión | `--state-offline` (muted) | punto hueco + barra | «Sin conexión» |
| | Reconectando | `--state-warn` (amber) | flechas circulares | «Reconectando…» |
| | Demostración | `--state-demo` (amber + trama) | probeta con trama | «Demostración» |
| Control | Válido | `--state-ok` | ✓ en círculo | «Control válido» |
| | Inválido | `--state-fail` | × en círculo | «Control inválido: <motivo>» |
| | Pendiente | `--state-neutral` | círculo discontinuo | «Sin confirmar» |
| Adquisición | Capturando | `--state-accent` | punto pulsante | «Capturando · n/121» |
| | Completa / válida | `--state-ok` | ✓ | «Válida · 121/121» |
| | Interrumpida | `--state-warn` | pausa | «Interrumpida · motivo» |
| | Inválida | `--state-fail` | × | «Inválida · motivo» |
| Hg | Pendiente | `--hg-pending` (lilac muted, borde discontinuo) | reloj de arena | «Pendiente de laboratorio» |
| | Indeterminado | `--hg-indeterminate` (amber) | ? en rombo | «Hg indeterminado» |
| | Prioridad de confirmación | `--hg-priority` (sky) | bandera | «Prioridad de confirmación» |
| | Resultado disponible | `--hg-result` (text + sello) | documento con ✓ | «Resultado disponible» + método, matriz, unidad, base, fuente, incertidumbre |

## 3. Tipografía

| Rol | Familia | Por qué |
|---|---|---|
| UI y texto | **Atkinson Hyperlegible Next** (variable 200–800, woff2 latin, 34 KB) | Diseñada por el Braille Institute para baja visión: legible en un teléfono al sol, en campo o en el banco. |
| Cifras, IDs y códigos | **Atkinson Hyperlegible Mono** (variable, 18 KB) | Distingue `0/O`, `1/l/I` en IDs como `HG-B-001`, `DEMO-ORI-01`; ancho fijo = cifras tabulares nativas. |

Autoalojadas (sin CDN), subconjunto latin (cubre á é í ó ú ñ ¿ ¡ « » ° −). `font-display: swap`.

**Escala (razón 1.2, base 16 px):** `--fs-xs 0.75rem` (solo metadatos, nunca cuerpo) · `--fs-sm 0.875rem` ·
`--fs-base 1rem` · `--fs-md 1.2rem` · `--fs-lg 1.44rem` · `--fs-xl 1.728rem` · `--fs-2xl 2.074rem`.
Interlineado 1.5 en texto, 1.15 en cifras grandes. Pesos: 400 texto, 600 rótulos, 700 títulos.
Etiquetas en minúscula de oración (no MAYÚSCULAS espaciadas).

## 4. Espaciado, radios, elevación

- **Espaciado (densidad 8, base 4 px):** `--sp-1 4px` · `--sp-2 8px` · `--sp-3 12px` · `--sp-4 16px` · `--sp-5 20px` · `--sp-6 24px` · `--sp-8 32px`.
- **Radios con jerarquía:** `--r-sm 6px` (chips, campos) · `--r-md 10px` (tarjetas internas) · `--r-lg 16px` (paneles) · `--r-pill 999px` (pastillas de estado).
- **Elevación por luz, no por sombra gris:** borde 1 px + `--glow-accent: 0 0 0 1px rgb(139 92 246 / .35), 0 8px 28px -12px rgb(139 92 246 / .45)` solo en el elemento seleccionado o enfocado. Paneles: sin sombra, solo borde.

## 5. Componentes (tokens de componente en `tokens.css`)

`Sidebar` · `MapCanvas` · `MapMarker` · `StationPopup` · `LayerControls` · `ConnectionPill` · `RunChart` ·
`MetricCard` · `HgStatusCard` · `DownloadButton` · `EvidenceTable` · `ProvenanceTag` · `StateBadge`.
Especificaciones de estados en la sección 7 y en los overrides de página.

## 6. Movimiento

- Una sola animación ambiental: el **halo del marcador seleccionado/activo** (pulso de 2.4 s, escala+opacidad en `transform`). Solo con `prefers-reduced-motion: no-preference`; en reducido queda un halo estático.
- Transiciones de respuesta 150–200 ms (`color`, `background-color`, `opacity`). Nada de «fade-up» por sección.
- La gráfica en vivo dibuja cada punto nuevo sin interpolación animada (1 Hz real; no hay parpadeo).

## 7. Accesibilidad (mínimos)

- Contraste AA verificado (tabla de la sección 2). Foco: `outline: 2px solid var(--color-accent-soft); outline-offset: 2px` vía `:focus-visible`.
- Objetivos táctiles ≥ 44×44 px (botones, marcadores, filas de menú).
- `aria-live="polite"` para conexión y fin de corrida (con `ariaNotify()` cuando exista).
- Gráfica: SVG con `role="img"` + resumen textual + tabla de datos equivalente.
- Tabla de evidencia semántica (`<table>`, `<caption>`, `<th scope>`), apilada por container query en anchos estrechos.
- Responsive verificado en 375, 768, 1024 y 1440 px, sin scroll horizontal de página.

## 8. Antipatrones prohibidos

- ❌ Mostrar mg/L, ppm o cualquier valor de Hg derivado de la tira, de Lemna o de imágenes.
- ❌ Rojo/verde como única diferencia (estado de conexión, control o marcador).
- ❌ Marcadores con color por «nivel» o mapas de calor de contaminación.
- ❌ Lenguaje de alarma («¡Peligro!», «contaminado», «alerta»).
- ❌ Datos de ejemplo sin el rótulo «Demostración».
- ❌ Ubicar el sitio piloto en el mapa (sigue «por definir»); atribuir resultados a Alcoche–Caranavi.
- ❌ CDNs, fuentes remotas, librerías de gráficos o mapas pesadas en la web local.
- ❌ Emojis como iconos (iconos SVG lineales propios, trazo 1.75 px).

## 9. Checklist previo a entrega

- [ ] Todos los estados con icono + texto
- [ ] «Demostración» visible siempre que `origen = archivo_prueba`
- [ ] Unidades explícitas en ejes, tarjetas y CSV (`Δ adimensional`, `cuentas`, `°C`, `s`, `mL`, `%`)
- [ ] Foco visible y orden de tabulación lógico
- [ ] `prefers-reduced-motion` respetado
- [ ] 375 / 768 / 1024 / 1440 px sin scroll horizontal
- [ ] Peso total gzip < 300 KB


## Actualización 2026-11-23 · sensor de tiras, Lemna y APIs abiertas

- La estación ya no mide turbidez: **DS18B20 + lector colorimétrico de tiras de Hg (TCS34725)**. Series de la gráfica: Δ cromático (línea violeta), canales R/G/B (tres trazos con rótulo directo: sólido, discontinuo, punteado) y temperatura (discontinua celeste).
- Nuevos colores de datos (solo en gráficas, con rótulo): R `#FF9E8F`, G `#7EE0B0`, B `#8FB8FF`; NDVI secuencial pardo→verde; cambio de NDVI divergente (pardo pérdida · gris neutro · verde azulado ganancia); zona de interés Yungas en contorno celeste discontinuo (no es «nivel»).
- Vistas nuevas: Bioindicador Lemna; Imágenes satelitales y Análisis espacial reales (con internet, fuera de la placa).
