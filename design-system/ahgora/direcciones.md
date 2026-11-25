# Fase 2 — Direcciones visuales

Referencia pedida: la estética de Proton VPN (azul marino/índigo, violeta eléctrico, bordes finos,
resplandores discretos) **sin copiar su marca**. La paleta ya está fijada por el documento de diseño;
lo que cambia entre direcciones es *qué elemento lleva el carácter* y cómo se organiza la información.

## A. Cartografía nocturna ← **elegida**

El mapa de Bolivia es la pieza memorable: contorno violeta con un resplandor tenue, isolíneas reales
de relieve (ETOPO1) apenas visibles, ríos principales en trazo fino y una retícula de 2° como la de
una carta técnica. Todo lo demás es sobrio: paneles índigo con borde de 1 px, cifras en Atkinson
Hyperlegible Mono, etiquetas en minúscula de oración. Los marcadores son botones con forma propia
(círculo, rombo, círculo discontinuo, cuadrado) y un único pulso suave en la estación activa.

```
┌──────────┬────────────────────────────────────┬───────────────┐
│ ▢ logo   │  Bolivia (general) ▾   [capas] +/− │ ● En línea    │
│ Estación │        ╭─╮  ríos · isolíneas       │ EST-01        │
│ de mon.  │     ╭──╯ ╰──╮                      │ ┌───────────┐ │
│──────────│    │  ◉ EST-01 ╲                   │ │ ╱╲__╱‾‾ mV│ │
│ ▸ Mapa   │    │   ▢ antecedente │             │ └───────────┘ │
│   Estac. │     ╲    ┌popup┐   ╱               │ [mV] [°C]     │
│   Lect.  │      ╰───┴─────┴──╯                │ ⧗ Hg pendiente│
│   ...    │ leyenda: forma+texto  · sitio p.d. │ [Descargar CSV]│
└──────────┴────────────────────────────────────┴───────────────┘
```

## B. Instrumento de banco

La gráfica de 120 s es la protagonista, tratada como la pantalla de un osciloscopio: retícula de
divisiones, traza con fósforo violeta, mandos segmentados. El mapa se reduce a una miniatura de
contexto. Es muy coherente con el MVP (la corrida), pero contradice el mockup del equipo, donde el
mapa domina, y se lee como «producto de laboratorio» más que como plataforma territorial.

## C. Expediente de custodia

La ficha de muestra manda: la interfaz se organiza como un expediente con campos rotulados,
sellos de procedencia («Demostración», «Banco real», «Histórico», «Ensayo validado») y una línea de
tiempo de custodia. Excelente para la revisión institucional, pero pesada para la operación en
teléfono durante una corrida y aleja la estética del mockup.

## Decisión y justificación

Se elige **A** porque:

1. **Respeta el mockup y la jerarquía pedida**: *dónde → qué se midió → cómo → Hg → qué sigue*. El mapa
   responde «dónde» y el panel derecho recorre el resto en ese orden.
2. **Pone el carácter donde el tema lo justifica**: el reto trata de sedimento *fluvial*; ríos y relieve
   reales dan contexto honesto sin insinuar contaminación (no hay rampas de color ni manchas).
3. **Es sostenible offline**: el SVG del mapa pesa ~30 KB gzip; no requiere teselas ni librerías.
4. **Préstamos controlados** de las otras dos: de B, la retícula tipo instrumento en la gráfica; de C,
   las etiquetas de procedencia como sellos con trama. Nada más.

Revisión contra lo genérico: la primera versión del plan usaba Fira Code/Fira Sans (propuesta de la
herramienta) y tarjetas con sombra gris. Se cambió a la familia Atkinson Hyperlegible (motivo
funcional: lectura de IDs al sol y para baja visión) y a elevación por borde y luz violeta, que es lo
que caracteriza la referencia sin copiarla.
