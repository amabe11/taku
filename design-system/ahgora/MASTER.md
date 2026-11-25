# Ahgora — Sistema de diseño (MASTER)

> **Fuente de verdad del producto:** `Ahgora_Descripcion_de_la_Solucion_Estilizada.pdf` (v1.0, 24 nov 2026).
> Este sistema de diseño viene de Hg-Guard (misma paleta, tipografía y componentes base); las reglas de la
> sección 1 se reescribieron para el semáforo de cribado y los niveles de certeza de Ahgora.
>
> **Origen:** base generada con `ui-ux-pro-max --design-system --persist -p "Hg-Guard"`
> (consulta *environmental monitoring dashboard scientific dark mode map data*, densidad 8, movimiento 3).
> La paleta genérica que propuso la herramienta y las fuentes Fira se **reemplazaron** por la paleta del equipo
> y por la tipografía de la dirección visual elegida (ver `direcciones.md`).

**Producto:** Ahgora Web · sitio para autoridades ambientales y de salud, laboratorios e investigadores
**Categoría:** mapa de decisión + panel de datos de campo y laboratorio
**Dirección visual:** A — «Cartografía nocturna» (`direcciones.md`)
**Diales:** variación 5/10 · movimiento 3/10 · densidad 8/10

---

## 1. Reglas que el diseño hace visibles

| Regla (guía) | Cómo se traduce en UI |
|---|---|
| Semáforo de cribado (2.4) | Rojo «Prioridad alta», amarillo «Verificar», verde «Prioridad baja», gris discontinuo «Inválido». Cada uno con **forma de icono propia + texto + color** y su acción («Enviar primero al laboratorio», «Repetir…»). |
| «Cribado» y «confirmado» nunca se mezclan (7.1) | Sello monoespaciado aparte del semáforo: `CRIBADO — requiere confirmación` (borde discontinuo), `EN VERIFICACIÓN` (punteado celeste), `CONFIRMADO POR LABORATORIO` (sólido, con fecha y laboratorio). |
| Un verde no es «libre de mercurio» (4.7) | El texto del verde lo dice siempre; en sedimentos se recuerda el límite 0,17–0,5 mg/kg de la versión 1. |
| Etiqueta legal (6.2, 7.7) | «CRIBADO — NO ES DIAGNÓSTICO NI EVIDENCIA LEGAL» en ficha, tablas y exportaciones. |
| Marcadores del mapa | **Color = semáforo · forma = matriz** (círculo sedimento, cuadrado cola, rombo pescado) **· anillo = certeza**. La leyenda explica las tres claves. |
| Satélite = contexto (7.4) | Toda capa NASA lleva «los satélites no detectan mercurio» y sus limitaciones declaradas. |
| Ubicaciones sensibles (7.7) | El público solo ve celdas de 0,1°; la versión pública exportada quita responsables y coordenadas. |
| Alertas sin alarmismo (7.2) | Ninguna se publica sin aprobación; vista previa de lo que ve la comunidad. |
| Procedencia visible | «Demostración» con trama diagonal ámbar en todo dato ficticio. |
| Tono | Técnico, sobrio, prudente. El rojo del semáforo significa «priorizar», no «peligro». |

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

## 5. Componentes (tokens de componente en `tokens.css`, estilos en `web/src/styles/modules.css`)

`Sidebar` · `MapCanvas` (SVG + capas NASA GIBS) · `SampleMarker` · `SamplePopup` · `LayerControls` · `Filters` ·
`SemaforoBadge` · `CertezaSeal` · `MatrizTag` · `SamplesTable` (ordenable) · `PriorityItem` · `BasinProfile` ·
`StatTile` · `SemBar` · `AlertPreview` (teléfono) · `FormDialog`.

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

- ❌ Mostrar un valor de cribado como si fuera confirmado, o mezclar ambos en una misma cifra.
- ❌ Decir «libre de mercurio», «contaminado» o «tóxico» por un resultado de cribado.
- ❌ Color del semáforo como única diferencia (siempre forma + texto).
- ❌ Presentar una capa satelital como medición de mercurio, o una coincidencia en el mapa como causa.
- ❌ Publicar coordenadas exactas al público o alertas sin aprobación de un responsable.
- ❌ Datos de ejemplo sin el rótulo «Demostración».
- ❌ Inventar recomendaciones de salud (las define la autoridad de salud).
- ❌ Emojis como iconos (iconos SVG lineales propios, trazo 1.75 px).

## 9. Checklist previo a entrega

- [ ] Todos los estados con icono + texto (semáforo, certeza, matriz)
- [ ] «Demostración» visible siempre que `demostracion = true`
- [ ] Unidades y base explícitas (`mg/kg seco`, `mg/kg fresco`, `mg/L`, `mL`, `g`, `%`)
- [ ] Etiqueta legal de cribado presente
- [ ] Foco visible y orden de tabulación lógico
- [ ] `prefers-reduced-motion` respetado
- [ ] 375 / 768 / 1024 / 1440 px sin scroll horizontal de página

## Historial

- **2026-11-24 · Ahgora.** Cambio de plan del equipo: el lector ESP32 envía por Bluetooth a la app Android; la web
  pasa a ser Ahgora Web (autoridades). Se eliminaron la web local del ESP32, las corridas de 120 s, la temperatura,
  la turbidez, Lemna y Sentinel-2/geotiff. Nuevos tokens `--sem-rojo|amarillo|verde|invalido` (reutilizan
  `--state-fail|warn|ok|neutral`).
- 2026-11-23 · Hg-Guard: sensor de tiras, Lemna y APIs abiertas (reemplazado).
