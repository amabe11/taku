# Vista «Mapa de monitoreo» — overrides

> **Proyecto:** Hg-Guard · base generada con `ui-ux-pro-max --page "mapa"`, ajustada al proyecto.
> Las reglas de este archivo **anulan** `MASTER.md`. Lo no mencionado sigue el MASTER.

## Layout

- Escritorio (≥1200 px): rejilla de tres columnas `Sidebar 248px | MapCanvas 1fr | panel 380px`, alto completo, sin ancho máximo.
- Tablet (768–1199 px): barra lateral colapsada a riel de iconos (72 px) con rótulos en `title` + menú desplegable; mapa arriba (60 dvh) y panel de datos debajo en dos columnas por container query.
- Teléfono (<768 px): barra superior + mapa a pantalla completa; ficha de estación en hoja inferior persistente con estado «asomada» (pastilla de conexión, mini-gráfica, **Iniciar corrida**, **Descargar CSV**) y estado «expandida».

## Mapa (lo memorable de la interfaz)

- SVG propio (Natural Earth 1:10m simplificado + isolíneas ETOPO1 cada 1000 m). Nada de teselas.
- Capas: países vecinos (relleno `--map-neighbor`), Bolivia (relleno `--map-land`, contorno `--color-accent` 1.5 px con resplandor de 6 px al 35 %), departamentos (0.6 px punteado), isolíneas de relieve (opacidad 0.10–0.22 según cota), ríos principales (`--map-water`), lagos, retícula cada 2°.
- Rampa del relieve: un solo tono (violeta→lila), luminosidad creciente con la cota; sin arcoíris.
- Rótulos de capa y fuentes en el pie del mapa: «Natural Earth · ETOPO1 (NOAA)».

## Marcadores (`MapMarker`)

- Son `<button>` HTML superpuestos (no círculos SVG): foco de teclado, nombre accesible y objetivo táctil de 44 px.
- Forma + color + texto en la leyenda:
  - **Activa:** círculo sólido mint con halo pulsante (solo sin movimiento reducido).
  - **En revisión:** rombo violeta con borde.
  - **Planificada:** círculo hueco con borde discontinuo.
  - **Antecedente documental:** cuadrado hueco gris-lila, sin halo.
- Leyenda fija: «Los marcadores indican el estado de la estación, no contaminación».

## Contenido territorial obligatorio

- EST-01 = banco de demostración en La Paz (ubicación de la estación física, no de muestreo).
- «Sitio piloto por definir»: chip permanente en el mapa, **sin coordenadas**.
- Alcoche–Caranavi: solo capa «Antecedentes», marcador cuadrado, ficha que dice «Antecedente documental · sin resultados atribuidos a este proyecto · ubicación aproximada».
- Filtro de territorio: «Bolivia (general)» / «Tramo de interés (esquema)». El tramo es un diagrama conceptual rotulado (aguas arriba de comparación, ribera de interés, depósito candidato, aguas abajo).

## `StationPopup`

- `popover="auto"` anclado al marcador con anchor positioning (`position-area: block-start`, `position-try-fallbacks: flip-block, flip-inline`) dentro de `@supports`; sin soporte, se muestra como hoja fija inferior.
- Contenido en orden de jerarquía: localidad → código → última lectura (mV, °C, hora) → estado de adquisición → estado de Hg → acción «Ver lecturas».

## Evitar

- Rampas arcoíris o saturadas sobre el mapa base.
- Interpolar propiedades en `innerHTML` (usar nodos de texto).
- Más de unas decenas de marcadores DOM (no aplica al MVP: ≤ 5).
