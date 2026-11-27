/*
 * AHGORA · ESCENA DEL SIMULADOR EN PC  (este es el archivo para cambiar los datos simulados)
 * ------------------------------------------------------------------------------------------
 * El firmware (src/main.cpp) corre igual que en el ESP32, pero el sensor TCS34725, el LED y el
 * Monitor Serie son de mentira: los valores salen de las tablas de abajo.
 *
 * Después de cambiar algo, vuelve a correr la tarea (Ctrl+Shift+B en VS Code): se recompila solo.
 *
 * Valores de referencia: integración 50 ms y ganancia 4x (lo que usa el firmware). Si cambias la
 * ganancia o la integración en main.cpp, el simulador escala las cuentas como el sensor real
 * (y satura en (256 − ATIME) × 1024 cuentas).
 */
#pragma once

// ============================================================================ general
// Ruido de cada lectura (fracción): 0.004 = ±0,4 %
#define SIM_RUIDO 0.004f

// ============================================================================ SEDIMENTOS (AHG-SED-01)
// Tarjetas y tiras que se ponen en la cámara oscura: nombre y cuentas crudas R, G, B, C.
// El simulador las va cambiando solo cada SIM_SEGUNDOS_POR_TARJETA segundos.
// En la consola puedes escribir:  TARJETA Roja   ·   AUTO   ·   LUZ ON   ·   LUZ OFF
struct SimTarjeta { const char *nombre; float r, g, b, c; };
static const SimTarjeta SIM_TARJETAS[] = {
  {"Blanca",              1905, 1985, 1625, 6780},
  {"Roja",                1650,  420,  380, 2700},
  {"Verde",                520, 1300,  640, 2600},
  {"Azul",                 430,  700, 1500, 2700},
  {"Gris",                 950,  990,  810, 3390},
  {"Tira nueva",          1800, 1750,  900, 4700},
  {"Tira + parche sin Hg",1760, 1690,  880, 4560},
};
#define SIM_SEGUNDOS_POR_TARJETA 10

// Luz externa que se cuela si la cámara no está bien cerrada (comando LUZ ON)
#define SIM_LUZ_EXTERNA_R 260
#define SIM_LUZ_EXTERNA_G 300
#define SIM_LUZ_EXTERNA_B 240
#define SIM_LUZ_EXTERNA_C 900

// ============================================================================ PECES (AHG-PEZ-01)
// Lectura por transmisión: LED blanco (GPIO25) -> cubeta -> sensor.
// Cuentas con la cubeta de AGUA y el LED encendido (I0). Con 50 ms el sensor satura en 21504 cuentas
// en cada canal (también en C, que suma casi toda la luz): si una cifra pasa de ahí, se recorta.
#define SIM_I0_R 8200
#define SIM_I0_G 10000
#define SIM_I0_B 7400
#define SIM_I0_C 19500

// Luz ambiente que llega con el LED apagado (el firmware la resta)
#define SIM_OSCURO_R 12
#define SIM_OSCURO_G 10
#define SIM_OSCURO_B 8
#define SIM_OSCURO_C 35

// Nanopartículas de oro (AuNP): absorbancia sin mercurio y cuánto cambia por cada µg/L de Hg.
// Con Hg las AuNP se agregan: sube A_r (rojo) y baja A_g (verde) -> sube q = A_r / A_g.
#define SIM_AUNP_A_R 0.120f
#define SIM_AUNP_A_G 0.710f
#define SIM_AUNP_A_B 0.348f
#define SIM_PENDIENTE_R  0.0100f   // por µg/L
#define SIM_PENDIENTE_G -0.0040f   // por µg/L
#define SIM_PENDIENTE_B  0.0010f   // por µg/L

// Concentración de Hg (µg/L en la cubeta) de cada cubeta. Se elige con el comando del firmware:
//   CUBETA Agua · CUBETA Blanco · CUBETA E 0 · CUBETA E 5 · ... · CUBETA Muestra · CUBETA Fortificada
// «E <número>» es un estándar: el número es su concentración (E 5 = 5 µg/L).
// «Agua» (y la etiqueta inicial «sin_etiqueta») no tiene AuNP: es la referencia para el comando REF.
#define SIM_HG_MUESTRA       12.0f   // también se cambia en vivo con:  MUESTRA 25
#define SIM_HG_FORTIFICACION 10.0f   // la «Fortificada» = muestra + esto
