// AHGORA · simulador en PC del lector ESP32 + TCS34725.
// Hace correr el mismo src/main.cpp en Windows: millis(), delay(), pines, Monitor Serie (esta consola)
// y un TCS34725 cuyas lecturas salen de pc_sim/escena.h.
//
//   Compilar (lo hacen las tareas de VS Code o los .bat):
//     g++ -std=gnu++11 -DSIM_SED   -I pc_sim sedimentos_AHG-SED-01/src/main.cpp pc_sim/arduino_pc.cpp -o pc_sim/sedimentos_pc.exe
//     g++ -std=gnu++11 -DSIM_PECES -I pc_sim peces_AHG-PEZ-01/src/main.cpp     pc_sim/arduino_pc.cpp -o pc_sim/peces_pc.exe
//
// Cada línea JSON también se guarda en lecturas_<nodo>.jsonl (una lectura por línea), para cargarla después.
// windows.h va antes que Arduino.h: Arduino define INPUT, que choca con un tipo de Windows.
#include <windows.h>
#include <conio.h>
#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_TCS34725.h>
#include "escena.h"

#include <stdlib.h>

#if !defined(SIM_PECES) && !defined(SIM_SED)
#define SIM_SED
#endif
#ifdef SIM_PECES
#define SIM_ARCHIVO "lecturas_AHG-PEZ-01.jsonl"
#define SIM_NOMBRE "PECES (AHG-PEZ-01)"
#else
#define SIM_ARCHIVO "lecturas_AHG-SED-01.jsonl"
#define SIM_NOMBRE "SEDIMENTOS (AHG-SED-01)"
#endif

SerialPC Serial;
TwoWire Wire;

// ------------------------------------------------------------------ tiempo y pines
static DWORD t0 = 0;
static int pines[64];
static void sondear();

uint32_t millis() { sondear(); return (uint32_t)(GetTickCount() - t0); }
void delay(uint32_t ms) {
  const DWORD fin = GetTickCount() + ms;
  while (GetTickCount() < fin) { sondear(); Sleep(1); }
}
void pinMode(int, int) {}
void digitalWrite(int pin, int v) { if (pin >= 0 && pin < 64) pines[pin] = v; }
int digitalRead(int pin) { return (pin >= 0 && pin < 64) ? pines[pin] : 0; }

// ------------------------------------------------------------------ escena (lo que «ve» el sensor)
static int tarjetaFija __attribute__((unused)) = -1;            // -1 = automático
static bool luzExterna __attribute__((unused)) = false;
static float hgMuestra = SIM_HG_MUESTRA;
static char cubetaSim[40] = "sin_etiqueta";
static const int N_TARJETAS = sizeof(SIM_TARJETAS) / sizeof(SIM_TARJETAS[0]);

static float azar() { return (float)rand() / RAND_MAX * 2.0f - 1.0f; }

static bool empiezaCon(const char *s, const char *p) {
  for (; *p; s++, p++) if (toupper((unsigned char)*s) != toupper((unsigned char)*p)) return false;
  return true;
}

/** Concentración de Hg (µg/L) y si la cubeta lleva AuNP, según su nombre. */
__attribute__((unused)) static bool cubetaConAuNP(float &hg) {
  const char *n = cubetaSim;
  hg = 0;
  if (empiezaCon(n, "sin_etiqueta") || empiezaCon(n, "Agua")) return false;
  if (empiezaCon(n, "Fortificada")) { hg = hgMuestra + SIM_HG_FORTIFICACION; return true; }
  if (empiezaCon(n, "Muestra")) { hg = hgMuestra; return true; }
  if ((n[0] == 'E' || n[0] == 'e') && (n[1] == ' ' || isdigit((unsigned char)n[1]))) { hg = (float)atof(n + 1); return true; }
  return true;  // Blanco u otra etiqueta: AuNP sin mercurio
}

static void escenaActual(float v[4]) {
#ifdef SIM_PECES
  if (!digitalRead(25)) {  // LED apagado: solo luz ambiente
    v[0] = SIM_OSCURO_R; v[1] = SIM_OSCURO_G; v[2] = SIM_OSCURO_B; v[3] = SIM_OSCURO_C;
    return;
  }
  float hg; float A[3] = {0, 0, 0};
  if (cubetaConAuNP(hg)) {
    A[0] = SIM_AUNP_A_R + SIM_PENDIENTE_R * hg;
    A[1] = SIM_AUNP_A_G + SIM_PENDIENTE_G * hg; if (A[1] < 0.05f) A[1] = 0.05f;
    A[2] = SIM_AUNP_A_B + SIM_PENDIENTE_B * hg;
  }
  const float I0[3] = {SIM_I0_R, SIM_I0_G, SIM_I0_B};
  for (int k = 0; k < 3; k++) v[k] = I0[k] * powf(10.0f, -A[k]) + (k == 0 ? SIM_OSCURO_R : k == 1 ? SIM_OSCURO_G : SIM_OSCURO_B);
  // el canal «clear» sigue a la suma de R, G y B
  v[3] = SIM_I0_C * (v[0] + v[1] + v[2]) / (float)(SIM_I0_R + SIM_I0_G + SIM_I0_B) + SIM_OSCURO_C;
#else
  int i = tarjetaFija >= 0 ? tarjetaFija : (int)((GetTickCount() - t0) / 1000 / SIM_SEGUNDOS_POR_TARJETA) % N_TARJETAS;
  const SimTarjeta &t = SIM_TARJETAS[i];
  v[0] = t.r; v[1] = t.g; v[2] = t.b; v[3] = t.c;
  if (luzExterna) { v[0] += SIM_LUZ_EXTERNA_R; v[1] += SIM_LUZ_EXTERNA_G; v[2] += SIM_LUZ_EXTERNA_B; v[3] += SIM_LUZ_EXTERNA_C; }
#endif
}

void Adafruit_TCS34725::getRawData(uint16_t *r, uint16_t *g, uint16_t *b, uint16_t *c) {
  static const float GAN[4] = {1, 4, 16, 60};
  const float ms = (256 - atime_) * 2.4f;
  const float escala = (ms / 50.4f) * (GAN[gain_] / 4.0f);  // escena.h está en 50 ms y 4x
  const float maximo = (256 - atime_) * 1024.0f > 65535 ? 65535 : (256 - atime_) * 1024.0f;
  float v[4];
  escenaActual(v);
  uint16_t *out[4] = {r, g, b, c};
  for (int k = 0; k < 4; k++) {
    float x = v[k] * escala * (1 + SIM_RUIDO * azar());
    if (x < 0) x = 0;
    if (x > maximo) x = maximo;
    *out[k] = (uint16_t)(x + 0.5f);
  }
  delay((uint32_t)ms);  // como el sensor real: espera el tiempo de integración
}

// ------------------------------------------------------------------ consola = Monitor Serie
static FILE *archivo = NULL;
static char rx[512];
static int rxIni = 0, rxFin = 0;
static char linea[128];
static int largo = 0;

static void ayuda() {
  printf("[sim] Simulador en PC · %s · las lecturas también se guardan en %s\n", SIM_NOMBRE, SIM_ARCHIVO);
#ifdef SIM_PECES
  printf("[sim] Comandos del firmware: CUBETA Agua · REF · CUBETA E 5 · CUBETA Muestra · CUBETA Fortificada · INFO\n");
  printf("[sim] Comandos del simulador: MUESTRA <µg/L> (Hg de la muestra) · AYUDA · SALIR\n");
#else
  printf("[sim] Comandos del simulador: TARJETA <nombre> · AUTO · LUZ ON · LUZ OFF · AYUDA · SALIR\n[sim] Tarjetas:");
  for (int i = 0; i < N_TARJETAS; i++) printf(" %s%s", SIM_TARJETAS[i].nombre, i < N_TARJETAS - 1 ? " ·" : "\n");
#endif
  printf("[sim] Para cambiar los valores: edita pc_sim/escena.h y vuelve a correr la tarea.\n");
  fflush(stdout);
}

/** Comandos del simulador. Devuelve true si el comando era solo para el simulador. */
static bool comandoSim(char *cmd) {
  while (*cmd == ' ') cmd++;
  if (empiezaCon(cmd, "SALIR")) { printf("[sim] fin\n"); if (archivo) fclose(archivo); exit(0); }
  if (empiezaCon(cmd, "AYUDA")) { ayuda(); return true; }
#ifdef SIM_PECES
  if (empiezaCon(cmd, "MUESTRA ") && (isdigit((unsigned char)cmd[8]) || cmd[8] == '.')) {
    hgMuestra = (float)atof(cmd + 8);
    printf("[sim] Hg de la muestra = %.2f µg/L\n", hgMuestra);
    return true;
  }
  if (empiezaCon(cmd, "CUBETA ")) {  // el firmware también la recibe; aquí solo se anota
    const char *n = cmd + 7; while (*n == ' ') n++;
    strncpy(cubetaSim, n, sizeof(cubetaSim) - 1); cubetaSim[sizeof(cubetaSim) - 1] = 0;
  }
  return false;
#else
  if (empiezaCon(cmd, "AUTO")) { tarjetaFija = -1; printf("[sim] tarjetas en secuencia automática\n"); return true; }
  if (empiezaCon(cmd, "LUZ ")) { luzExterna = empiezaCon(cmd + 4, "ON"); printf("[sim] luz externa %s\n", luzExterna ? "ENCENDIDA" : "apagada"); return true; }
  if (empiezaCon(cmd, "TARJETA ")) {
    const char *n = cmd + 8; while (*n == ' ') n++;
    for (int i = 0; i < N_TARJETAS; i++) if (empiezaCon(SIM_TARJETAS[i].nombre, n) && strlen(n) > 0) { tarjetaFija = i; printf("[sim] tarjeta fija: %s\n", SIM_TARJETAS[i].nombre); return true; }
    printf("[sim] no conozco esa tarjeta (escribe AYUDA)\n");
    return true;
  }
  return false;
#endif
}

static void entregarLinea() {
  linea[largo] = 0;
  if (largo > 0 && !comandoSim(linea)) {
    for (int i = 0; i < largo && (rxFin + 1) % (int)sizeof(rx) != rxIni; i++) { rx[rxFin] = linea[i]; rxFin = (rxFin + 1) % sizeof(rx); }
    rx[rxFin] = '\n'; rxFin = (rxFin + 1) % sizeof(rx);
  }
  largo = 0;
}

// Opcional: comandos automáticos, uno cada 4 s, separados por «;».
//   Ej. (cmd):  set AHG_SIM_COMANDOS=CUBETA Agua;REF;CUBETA E 5;CUBETA Muestra
static void comandosAutomaticos() {
  static const char *pend = getenv("AHG_SIM_COMANDOS");
  static DWORD proximo = 3000;
  if (!pend || !*pend || GetTickCount() - t0 < proximo) return;
  proximo = GetTickCount() - t0 + 4000;
  largo = 0;
  while (*pend && *pend != ';' && largo < (int)sizeof(linea) - 1) linea[largo++] = *pend++;
  if (*pend == ';') pend++;
  linea[largo] = 0;
  printf("> %s\n", linea);
  entregarLinea();
}

static void sondear() {
  comandosAutomaticos();
  while (_kbhit()) {
    int ch = _getch();
    if (ch == 0 || ch == 224) { _getch(); continue; }  // flechas y teclas de función
    if (ch == '\b') { if (largo > 0) { largo--; printf("\b \b"); } continue; }
    if (ch == '\r' || ch == '\n') {
      printf("\n");
      entregarLinea();
    } else if (largo < (int)sizeof(linea) - 1 && ch >= 32) {
      linea[largo++] = (char)ch;
      putchar(ch);
    }
    fflush(stdout);
  }
}

int SerialPC::available() { sondear(); return (rxFin - rxIni + (int)sizeof(rx)) % (int)sizeof(rx); }
int SerialPC::read() {
  if (rxIni == rxFin) return -1;
  char c = rx[rxIni]; rxIni = (rxIni + 1) % sizeof(rx); return (unsigned char)c;
}
size_t SerialPC::print(const char *s) { fputs(s, stdout); fflush(stdout); return strlen(s); }
size_t SerialPC::println(const char *s) {
  printf("%s\n", s); fflush(stdout);
  if (s[0] == '{') {
    if (!archivo) archivo = fopen(SIM_ARCHIVO, "a");
    // En el archivo se agrega la hora de la PC ("t", ms desde 1970), como hace el lector WiFi: así el puente
    // (server/scripts/cargar-jsonl.mjs) no duplica lecturas si se carga dos veces.
    const size_t n = strlen(s);
    if (archivo && n > 1 && s[n - 1] == '}') {
      FILETIME ft; GetSystemTimeAsFileTime(&ft);
      const double ms = ((double)ft.dwHighDateTime * 4294967296.0 + (double)ft.dwLowDateTime - 116444736000000000.0) / 10000.0;
      fprintf(archivo, "%.*s,\"t\":%.0f}\n", (int)(n - 1), s, ms);
      fflush(archivo);
    }
  }
  return strlen(s) + 1;
}
size_t SerialPC::println(int v) { return (size_t)printf("%d\n", v); }
size_t SerialPC::println(unsigned long v) { return (size_t)printf("%lu\n", v); }
size_t SerialPC::println(double v) { return (size_t)printf("%.2f\n", v); }
int SerialPC::printf(const char *fmt, ...) {
  va_list ap; va_start(ap, fmt);
  int n = vfprintf(stdout, fmt, ap);
  va_end(ap); fflush(stdout);
  return n;
}

// ------------------------------------------------------------------ arranque
int main() {
  SetConsoleOutputCP(CP_UTF8);
  srand((unsigned)GetTickCount());
  t0 = GetTickCount();
  ayuda();
  setup();
  for (;;) { loop(); sondear(); Sleep(1); }
}
