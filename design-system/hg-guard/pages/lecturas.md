# Vista «Lecturas» (corrida de 120 s) — overrides

> **Proyecto:** Hg-Guard · base generada con `ui-ux-pro-max --page "lecturas"` + consultas
> `--domain chart` («real-time time series sensor line», «missing data gaps line chart») y `--domain ux`.
> Las reglas de este archivo **anulan** `MASTER.md`.

## Layout

- Escritorio: dos columnas `ficha de muestra 360px | corrida 1fr`; la tabla de 121 filas debajo de la gráfica, en una región desplazable con encabezado fijo.
- Teléfono: una columna; orden **acción → gráfica → métricas → ficha → tabla**. El botón «Iniciar corrida» queda fijo al pie mientras la corrida no ha empezado.

## `RunChart` (decisión de la consulta de gráficos)

- Tipo: **línea** (serie temporal < 1000 puntos → SVG). No área rellena: el relleno sugiere «cantidad» y aquí la magnitud es una tensión relativa.
- Una serie a la vez, conmutada por un control segmentado: **Turbidez relativa (mV, A0)** | **Temperatura (°C)**. Sin doble eje Y.
- Eje X fijo 0–120 s con marcas cada 20 s; eje Y con unidad explícita en el título del eje y dominio con 8 % de margen (nunca empieza en 0 forzado para mV).
- Retícula sutil (`--chart-grid`, 1 px, 40 % opacidad) estilo graticule de instrumento.
- **Huecos visibles:** la línea se corta en lecturas faltantes o inválidas; el intervalo se cubre con una banda de trama diagonal `--chart-gap` y una marca × en el eje X, con rótulo «sin lectura» / «inválida» al enfocarlo. Nunca se interpola sobre un hueco.
- Punto en vivo: círculo de 4 px con anillo; sin animación de parpadeo.
- Accesible: `role="img"` + `aria-labelledby` (título) + `aria-describedby` (resumen: «121 de 121 lecturas, rango 2 310–2 498 mV, 0 faltantes»). Cursor de teclado con ←/→ que anuncia `seq`, `t`, valor. Equivalente tabular siempre disponible.

## `MetricCard`

- Valor con Atkinson Hyperlegible Mono `--fs-xl`, unidad en `--fs-sm` muted pegada al valor.
- Subtítulo fijo: turbidez → «Señal relativa · sin calibrar a NTU»; temperatura → «Sonda DS18B20».
- Dato faltante: «—» + texto «sin lectura válida» (no 0).

## Ficha de muestra (formulario de inicio de corrida)

- Campos visibles con etiqueta (no placeholder como etiqueta): ID de caso, ID de muestra, matriz objetivo, tipo de corrida (blanco / suspensión de banco / muestra), volumen (150 mL fijo, casilla «confirmado»), controles (vaso en posición marcada, sondas a la marca, sensores respondiendo, blanco del día registrado), operador (perfil genérico), permiso de uso, incidencias.
- Validación tras interacción; el botón de inicio explica qué falta («Confirma el volumen de 150 mL») en vez de quedar mudo.
- Una corrida sin guardar/exportar bloquea la siguiente con un diálogo: «Exportar», «Guardar y seguir» o «Descartar» (con confirmación).

## `EvidenceTable`

- `<table>` semántica con `<caption>`, cabeceras fijas, primera columna (`run_id`) como `<th scope="row">` fija.
- Filtros: texto libre (ID), origen, estado de adquisición, estado de Hg, tipo de corrida.
- Por debajo de 640 px de contenedor, se apila en fichas con rótulos inyectados (`@container`).
