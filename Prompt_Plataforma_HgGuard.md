# Prompt — Plataforma web Hg-Guard (nombre pendiente)

Vas a diseñar e implementar la interfaz web del proyecto **Hg-Guard**: un dashboard de monitoreo ambiental para registrar mediciones físicas de una estación ESP32, conservar evidencia de muestras de sedimento y dar contexto territorial en Bolivia. Las especificaciones completas están en:

- `C:\Users\alejo\Downloads\Plataforma_Diseno_Visual_Modulos.md` (diseño visual, componentes y paleta)
- `C:\Users\alejo\Downloads\Plataforma_Funcionalidades.md` (funciones, datos y prioridades)

Léelos completos antes de empezar. Si algo de este prompt contradice esos documentos, mandan los documentos.

## Reglas científicas (no negociables)

1. **El dispositivo NO detecta mercurio.** Mide turbidez relativa (mV o índice relativo) y temperatura (°C). Nunca muestres NTU sin calibración documentada.
2. El estado de Hg se muestra siempre separado de la señal física, con cuatro estados distintos: **Hg pendiente**, **Hg indeterminado**, **Prioridad de confirmación** y **Resultado disponible** (este último con método, matriz, unidad, fuente e incertidumbre). Por defecto: **«Pendiente de laboratorio»**.
3. **El color nunca es la única señal.** Todos los estados llevan una etiqueta de texto: conectado/desconectado, control válido/inválido, Hg pendiente/confirmado. Los marcadores verdes o violetas del mapa indican el estado de la estación (activa, en revisión, planificada), **no contaminación**.
4. Los datos de ejemplo se marcan visiblemente como **«Demostración»**. Separa visualmente los datos reales, demostrativos, históricos y confirmados. El sitio piloto aparece como **«Sitio piloto por definir»**. Alcoche–Caranavi solo puede figurar como antecedente, sin resultados atribuidos.
5. El tono de los textos es técnico, sobrio y prudente: nada de alarmas ni lenguaje acusatorio.

## Cómo usar las skills

### Fase 1 — Sistema de diseño
- **ui-ux-pro-max:** genera el sistema de diseño con `--design-system --persist -p "Hg-Guard"` a partir de la consulta *"environmental monitoring dashboard scientific dark mode map data"*. Guárdalo en `design-system/hg-guard/MASTER.md`, con overrides por página (`--page "mapa"`, `--page "lecturas"`). Consulta además los dominios de gráficos y UX para la gráfica de 120 s y la tabla de evidencia.
- **design-system:** convierte la paleta orientativa del documento en tokens de tres capas (primitivo → semántico → componente) como variables CSS: `--color-bg #101124`, `--color-panel #1B1B38`, `--color-elevated #25234C`, `--color-accent #8B5CF6`, `--color-accent-soft #B49AFF`, `--color-online #38D99F`, `--color-text #F5F4FF`, `--color-text-muted #AAA9C7`, `--color-border #46406D`. Crea tokens semánticos para cada estado (conexión, control, adquisición, Hg) y escalas de espaciado y tipografía.
- **brand:** define una identidad provisional sin nombre comercial: un espacio reservado para el logotipo, el rótulo «Estación de monitoreo» y una guía de voz (técnica, clara, prudente). Incluye una versión en lenguaje sencillo para la futura vista comunitaria.

### Fase 2 — Dirección visual
- **frontend-design:** toma como referencia la estética de Proton VPN (azul marino/índigo, violeta eléctrico, bordes finos, resplandores discretos) sin copiar su marca. Busca carácter propio, por ejemplo:
  - una tipografía técnica y distintiva para cifras y códigos (tabular-nums);
  - un mapa de Bolivia estilizado con contorno violeta y textura topográfica sutil;
  - halos de selección con un pulso suave en los marcadores.

  Antes de implementar, propón **2 o 3 direcciones visuales** breves y elige una de forma justificada.

### Fase 3 — Implementación
- **modern-web-guidance:** úsala primero en cada decisión de HTML, CSS o JS:
  - `StationPopup` y cajón móvil: `popover` o `<dialog>`, con anchor positioning si hay soporte.
  - Paneles: container queries.
  - Layouts: `grid`.
  - Accesibilidad: `prefers-reduced-motion` y `focus-visible`.
  - Avisos de conexión y del fin de la corrida: anuncios con `aria-live`.
  - `EvidenceTable`: tabla semántica.
  - Rendimiento: CWV.
- **ui-styling:** implementa los estilos con Tailwind CSS compilado, mapeado a los tokens de la Fase 1. Por la restricción offline del ESP32, **no uses shadcn/React** en la web local. Puedes usar shadcn solo si más adelante se construye un panel institucional separado.

### Fase 4 — Revisión
- **ui-ux-pro-max:** revisa UX y accesibilidad (contraste AA sobre fondos oscuros, estados de foco, objetivos táctiles, responsive y legibilidad de unidades) y corrige lo que encuentres.

## Restricciones técnicas

- **Funciona 100 % sin internet** y la sirve el ESP32 por Wi-Fi local (LittleFS):
  - archivos estáticos ligeros, sin CDNs y con fuentes autoalojadas en subconjunto;
  - objetivo: menos de ~300 KB gzip para la web local;
  - mapa de Bolivia como SVG propio, simplificado desde GeoJSON;
  - `RunChart` en SVG o Canvas propio, sin librerías pesadas.
- Stack sugerido: HTML + CSS (Tailwind compilado) + JavaScript/TypeScript vanilla, empaquetado con Vite en archivos estáticos.
- Abstrae la API del ESP32 en un módulo (`api.js`) con un **modo demostración simulado**, para desarrollar sin hardware. Endpoints supuestos, a documentar: estado, iniciar corrida, lecturas y exportar.
- Las capas Sentinel-2 y NASA y la comparación satelital **no forman parte de la web local**. Déjalas como módulo complementario que se carga aparte cuando haya internet.

## Layout (según el mockup)

- **Escritorio:** tres columnas.
  - `Sidebar` fija con los 9 ítems de menú.
  - `MapCanvas` central dominante con `MapMarker`, `StationPopup`, `LayerControls` (+, −, capas), una leyenda y un filtro de territorio.
  - Panel derecho con, en este orden: `ConnectionPill` y estación EST-01, `RunChart` (120 s, eje Y con unidad explícita, huecos visibles para lecturas faltantes o inválidas), dos `MetricCard` (turbidez relativa en mV y temperatura en °C), `HgStatusCard` y el `DownloadButton` ancho «Descargar CSV».
- **Tablet:** menú colapsable y el panel de datos en un cajón lateral o debajo del mapa.
- **Teléfono:** el mapa como vista principal y una ficha desplegable para la estación. Las acciones **Iniciar corrida**, la gráfica y **Descargar CSV** siempre a mano.
- Respeta la jerarquía: **dónde → qué se midió → cómo se midió → qué sabemos de Hg → qué se hace después**.

## Orden de construcción (MVP primero)

1. **MVP:**
   - conexión y estado del ESP32;
   - corrida de 120 s (121 registros, `seq` de 0 a 120) con gráfica en vivo;
   - controles (blanco, vaso, 150 mL, sensores) y estados de adquisición (válida, interrumpida, inválida + motivo);
   - ficha de muestra con todos los campos del documento de funcionalidades (ID de caso, muestra y corrida; matriz, fecha y hora; `config_id`; volumen; blanco y controles; incidencias; estado de Hg; procedencia y permisos);
   - exportación CSV offline con las columnas `seq, t_s, adc_mv, temp_c` más los metadatos y el indicador de demostración;
   - «Hg pendiente».
2. **MVP ampliado:** mapa de Bolivia con fichas de sitio, e historial y búsqueda de mediciones (`EvidenceTable` con filtros).
3. **Complementario:** el resto de vistas del menú como estructuras navegables con estados vacíos bien diseñados («Disponible en una versión futura», sin datos inventados).

## Entregables

- `design-system/hg-guard/MASTER.md` y los tokens en CSS.
- Código de la web local: componentes del mockup, modo demostración y exportación CSV funcional.
- Un README breve: cómo compilar, cómo cargar en LittleFS, endpoints esperados del ESP32 y limitaciones científicas.
- Capturas o descripción del resultado en escritorio, tablet y móvil, más un resumen de la revisión de accesibilidad.

Trabaja por fases y muéstrame el sistema de diseño y la dirección visual elegida antes de construir todas las vistas.
