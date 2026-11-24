# Identidad provisional y guía de voz

> Sin nombre comercial todavía. «Hg-Guard» es el nombre del proyecto en la hackathon, no una marca.

## Identidad

- **Espacio reservado para logotipo:** recuadro de 32×32 px con borde discontinuo `--color-border-strong`
  y la palabra «Logo» en `--fs-xs`. No se dibuja un logotipo provisional para no fijar una marca.
- **Rótulo:** «Estación de monitoreo» en Atkinson Hyperlegible Next 600, `--fs-md`.
- **Segunda línea (opcional):** «Hg-Guard · ORO-4.1» en `--color-text-muted`.
- **Color de identidad:** violeta `#8B5CF6` solo en trazos, foco y selección; nunca como relleno de fondo grande.
- **Iconografía:** SVG lineales propios, trazo 1.75 px, esquinas redondeadas, 20 px de caja.

## Voz: técnica, clara, prudente

| Rasgo | Significa | Sí | No |
|---|---|---|---|
| Técnica | Unidades y procedencia siempre explícitas | «Turbidez relativa: 2 412 mV (A0)» | «Turbidez: 12 NTU» |
| Clara | Verbos concretos, una idea por frase | «Confirma el volumen de 150 mL para iniciar» | «Error de validación» |
| Prudente | Lo físico no se presenta como químico | «Hg pendiente de laboratorio» | «Sin mercurio detectado» / «Mercurio alto» |
| Sobria | Sin alarma ni culpa | «Control inválido: sensor de temperatura sin respuesta» | «¡Fallo crítico!» |
| Honesta | Lo simulado se dice | «Demostración — datos simulados (archivo_prueba)» | Datos de ejemplo sin rótulo |

**Reglas de redacción**
- Minúscula de oración en botones y títulos. Acciones con el verbo exacto: «Iniciar corrida», «Guardar corrida», «Descargar CSV»; el aviso posterior usa el mismo verbo («Corrida guardada», «CSV descargado»).
- Los errores dicen qué pasó y qué hacer: «No hay conexión con la estación. Revisa que el teléfono siga en la red Wi-Fi de la estación; la placa sigue capturando».
- Estados vacíos invitan a actuar o explican cuándo existirá el contenido: «Disponible en una versión futura. Requiere conexión a internet y un sitio piloto definido».
- Nunca: «contaminado», «peligro», «alerta», «tóxico», «detectado» aplicado a Hg sin resultado de laboratorio.

## Versión en lenguaje sencillo (vista comunitaria futura)

Para una vista pública revisada y autorizada. Frases cortas, sin siglas sin explicar, sin coordenadas exactas.

| Técnico | Lenguaje sencillo |
|---|---|
| Turbidez relativa (mV) | Qué tan turbia estaba el agua de la prueba, comparada con agua limpia |
| Corrida de 120 s | Una medición de dos minutos |
| Control válido | La prueba se hizo bien y se puede usar |
| Hg pendiente de laboratorio | Todavía no sabemos si hay mercurio. Eso solo lo puede decir un laboratorio |
| Prioridad de confirmación | Pedimos a un laboratorio que revise esta muestra primero |
| Resultado disponible | El laboratorio ya respondió. Aquí está lo que encontró y cómo lo midió |
| Sitio piloto por definir | Todavía estamos acordando con quién y dónde trabajar |

Texto modelo: «Este equipo mide qué tan turbia y qué temperatura tiene el agua en una prueba de dos
minutos. No mide mercurio. Si hace falta saber si hay mercurio, la muestra va a un laboratorio, y
te contaremos el resultado cuando lo tengamos.»
