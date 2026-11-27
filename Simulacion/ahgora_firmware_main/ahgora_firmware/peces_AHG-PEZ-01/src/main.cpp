/*
 * AHGORA · Lector de cubetas para CRIBADO de Hg en peces (AHG-PEZ-01, código provisional)
 * ESP32 DevKit + TCS34725 + LED blanco externo · lectura por TRANSMISIÓN:
 *        LED blanco  ->  cubeta (10 mm, AuNP + digerido)  ->  TCS34725
 *
 * Conexiones
 *   TCS34725 : 3V3 -> VIN/VCC · GND -> GND · GPIO21 -> SDA · GPIO22 -> SCL
 *   LED      : GPIO25 -> resistencia 220 ohm -> ánodo del LED blanco · cátodo -> GND
 *              (para un LED de más potencia usar un transistor; no exceder ~12 mA por pin)
 *
 * Ajuste inicial: con la cubeta de agua, elegir la resistencia del LED (o la ganancia) para que
 * r, g y b queden entre ~50 % y 80 % de 21504 cuentas (máximo a 50 ms). Si "sat" sale true, bajar.
 *
 * Qué hace
 *   - Cada segundo mide con el LED APAGADO (oscuro) y ENCENDIDO, resta el oscuro y envía un JSON.
 *   - Así se descuenta la luz ambiente que pudiera entrar a la cámara.
 *   - Si ya se guardó la referencia I0 (cubeta con agua), también envía las absorbancias
 *     A = log10(I0 / I) de cada canal y el índice q = A_r / A_g (sube con el Hg en el método AuNP).
 *   - La curva de calibración y el cálculo en mg/kg se hacen en la PC con los estándares.
 *
 * Comandos por el Monitor Serie (terminar con Enter):
 *   CUBETA <nombre>   etiqueta las lecturas siguientes. Ej.:  CUBETA E 5   ·  CUBETA Muestra
 *   REF               guarda I0 con el promedio de las próximas 5 lecturas (poner la cubeta con agua)
 *   INFO              muestra configuración y estado
 *
 * JSON de ejemplo (una línea):
 *   {"node_id":"AHG-PEZ-01","seq":7,"test_mode":true,"sensor":"TCS34725","modo":"transmision",
 *    "cubeta":"Muestra","r":6800,"g":2050,"b":3500,"c":14200,"r_norm":122.11,"g_norm":36.81,
 *    "b_norm":62.85,"r_osc":12,"g_osc":10,"b_osc":8,"c_osc":35,"sat":false,
 *    "A_r":0.1213,"A_g":0.7095,"A_b":0.3478,"q":0.1710}
 *
 * Para quien integra (Alvin): las líneas que empiezan con '{' son lecturas JSON; las que empiezan
 * con '#' o con texto son mensajes de estado. Los campos extra (modo, cubeta, *_osc, sat, A_*, q)
 * son una PROPUESTA: confirmar con el contrato de la API.
 *
 * IMPORTANTE: es un lector de DEMOSTRACIÓN / cribado. El método AuNP debe validarse contra un
 * laboratorio (analizador directo de Hg) antes de usar sus resultados.
 *
 * Bibliotecas: Adafruit TCS34725 (instala también Adafruit BusIO).
 */
#include <Arduino.h>
#include <Wire.h>
#include <math.h>
#include <string.h>
#include <ctype.h>
#include <Adafruit_TCS34725.h>

// ------------------------- Configuración -------------------------
static const char *NODE_ID = "AHG-PEZ-01";
static const uint32_t BAUDIOS = 115200;
static const int PIN_SDA = 21;
static const int PIN_SCL = 22;
static const int PIN_LED_FUENTE = 25;      // LED blanco que ilumina la cubeta
static const int PIN_LED_ESTADO = 2;       // LED azul de la placa
static const uint32_t PERIODO_MS = 1000;   // un JSON por segundo
static const uint8_t N_PROMEDIO = 4;       // lecturas promediadas con LED apagado y encendido
static const uint8_t N_REF = 5;            // ciclos promediados para guardar I0

#define TCS_INTEGRACION TCS34725_INTEGRATIONTIME_50MS
#define TCS_GANANCIA    TCS34725_GAIN_4X
static const uint32_t CUENTA_MAX = 21504;  // (256 - 0xEB) * 1024 para 50 ms

// ------------------------------------------------------------------
Adafruit_TCS34725 tcs(TCS_INTEGRACION, TCS_GANANCIA);

static uint32_t seq = 0;
static uint32_t tUltima = 0;
static char cubeta[32] = "sin_etiqueta";

static bool refValida = false;
static float ref[4] = {0, 0, 0, 0};        // I0 por canal: r, g, b, c
static uint8_t refFaltan = 0;              // ciclos que faltan para completar la referencia
static float refSuma[4] = {0, 0, 0, 0};

static char linea[64];
static uint8_t largo = 0;

// Promedia N lecturas. La primera se descarta: getRawData lee los registros y LUEGO espera el
// tiempo de integración, así que el primer dato tras cambiar el LED pertenece al ciclo anterior.
static void medir(float out[4], uint16_t &maximo) {
  uint16_t r, g, b, c;
  tcs.getRawData(&r, &g, &b, &c);           // descarte
  float s[4] = {0, 0, 0, 0};
  maximo = 0;
  for (uint8_t i = 0; i < N_PROMEDIO; i++) {
    tcs.getRawData(&r, &g, &b, &c);
    s[0] += r; s[1] += g; s[2] += b; s[3] += c;
    uint16_t m = r > g ? r : g;            // saturación: se revisan r, g y b (los que se usan)
    m = m > b ? m : b;
    if (m > maximo) maximo = m;
  }
  for (uint8_t k = 0; k < 4; k++) out[k] = s[k] / N_PROMEDIO;
}

static float absorbancia(float i0, float i) {
  if (i0 <= 0.0f || i <= 0.0f) return NAN;
  return log10f(i0 / i);
}

static void enviarLectura(const float neto[4], const float osc[4], bool sat) {
  const float c = neto[3];
  const float rn = c > 0 ? 255.0f * neto[0] / c : 0.0f;
  const float gn = c > 0 ? 255.0f * neto[1] / c : 0.0f;
  const float bn = c > 0 ? 255.0f * neto[2] / c : 0.0f;

  char buf[420];
  int n = snprintf(buf, sizeof(buf),
                   "{\"node_id\":\"%s\",\"seq\":%lu,\"test_mode\":true,\"sensor\":\"TCS34725\","
                   "\"modo\":\"transmision\",\"cubeta\":\"%s\","
                   "\"r\":%lu,\"g\":%lu,\"b\":%lu,\"c\":%lu,"
                   "\"r_norm\":%.2f,\"g_norm\":%.2f,\"b_norm\":%.2f,"
                   "\"r_osc\":%lu,\"g_osc\":%lu,\"b_osc\":%lu,\"c_osc\":%lu,\"sat\":%s",
                   NODE_ID, (unsigned long)seq, cubeta,
                   (unsigned long)lroundf(neto[0]), (unsigned long)lroundf(neto[1]),
                   (unsigned long)lroundf(neto[2]), (unsigned long)lroundf(neto[3]),
                   rn, gn, bn,
                   (unsigned long)lroundf(osc[0]), (unsigned long)lroundf(osc[1]),
                   (unsigned long)lroundf(osc[2]), (unsigned long)lroundf(osc[3]),
                   sat ? "true" : "false");
  if (refValida && n > 0 && n < (int)sizeof(buf)) {
    const float ar = absorbancia(ref[0], neto[0]);
    const float ag = absorbancia(ref[1], neto[1]);
    const float ab = absorbancia(ref[2], neto[2]);
    if (!isnan(ar) && !isnan(ag) && !isnan(ab) && fabsf(ag) > 1e-4f) {
      n += snprintf(buf + n, sizeof(buf) - n, ",\"A_r\":%.4f,\"A_g\":%.4f,\"A_b\":%.4f,\"q\":%.4f",
                    ar, ag, ab, ar / ag);
    }
  }
  if (n > 0 && n < (int)sizeof(buf) - 2) {
    buf[n++] = '}';
    buf[n] = '\0';
  }
  Serial.println(buf);
}

static void imprimirInfo() {
  Serial.printf("# %s · integración 50 ms · ganancia 4x · promedio %u · LED en GPIO%d\n",
                NODE_ID, (unsigned)N_PROMEDIO, PIN_LED_FUENTE);
  if (refValida) {
    Serial.printf("# I0 guardada: r=%.0f g=%.0f b=%.0f c=%.0f\n", ref[0], ref[1], ref[2], ref[3]);
  } else {
    Serial.println("# I0 sin guardar: coloque la cubeta con agua y envíe REF");
  }
  Serial.printf("# cubeta actual: %s\n", cubeta);
}

static void procesarComando(char *cmd) {
  // quitar espacios al final
  int L = strlen(cmd);
  while (L > 0 && isspace((unsigned char)cmd[L - 1])) cmd[--L] = '\0';
  while (*cmd == ' ') cmd++;
  if (*cmd == '\0') return;

  char may[8] = {0};
  for (int i = 0; i < 7 && cmd[i] && cmd[i] != ' '; i++) may[i] = toupper((unsigned char)cmd[i]);

  if (strcmp(may, "CUBETA") == 0) {
    const char *nombre = cmd + 6;
    while (*nombre == ' ') nombre++;
    if (*nombre == '\0') {
      Serial.println("# uso: CUBETA <nombre>");
      return;
    }
    // copiar sin comillas ni barras para no romper el JSON
    size_t j = 0;
    for (size_t i = 0; nombre[i] && j < sizeof(cubeta) - 1; i++) {
      if (nombre[i] != '"' && nombre[i] != '\\') cubeta[j++] = nombre[i];
    }
    cubeta[j] = '\0';
    Serial.printf("# cubeta = %s\n", cubeta);
  } else if (strcmp(may, "REF") == 0) {
    refFaltan = N_REF;
    for (int k = 0; k < 4; k++) refSuma[k] = 0;
    Serial.println("# guardando I0 (cubeta con agua): no mover la cubeta…");
  } else if (strcmp(may, "INFO") == 0) {
    imprimirInfo();
  } else {
    Serial.println("# comandos: CUBETA <nombre> · REF · INFO");
  }
}

static void leerSerie() {
  while (Serial.available() > 0) {
    char ch = (char)Serial.read();
    if (ch == '\n' || ch == '\r') {
      if (largo > 0) {
        linea[largo] = '\0';
        procesarComando(linea);
        largo = 0;
      }
    } else if (largo < sizeof(linea) - 1) {
      linea[largo++] = ch;
    }
  }
}

void setup() {
  Serial.begin(BAUDIOS);
  delay(300);
  pinMode(PIN_LED_ESTADO, OUTPUT);
  digitalWrite(PIN_LED_ESTADO, LOW);
  pinMode(PIN_LED_FUENTE, OUTPUT);
  digitalWrite(PIN_LED_FUENTE, LOW);

  Wire.begin(PIN_SDA, PIN_SCL);
  while (!tcs.begin(TCS34725_ADDRESS, &Wire)) {
    Serial.println("ERROR: TCS34725 no encontrado en I2C 0x29. Revisar VIN/VCC, GND, SDA (21) y SCL (22).");
    delay(2000);
  }
  Serial.println("LISTO: lector Ahgora AuNP - SOLO DEMOSTRACION");
  imprimirInfo();
  tUltima = millis();
}

void loop() {
  leerSerie();
  if (millis() - tUltima < PERIODO_MS) return;
  tUltima += PERIODO_MS;

  digitalWrite(PIN_LED_ESTADO, HIGH);
  float osc[4], luz[4], neto[4];
  uint16_t maxOsc = 0, maxLuz = 0;

  digitalWrite(PIN_LED_FUENTE, LOW);       // 1) oscuro: luz ambiente + ruido del sensor
  medir(osc, maxOsc);
  digitalWrite(PIN_LED_FUENTE, HIGH);      // 2) LED encendido: luz que atraviesa la cubeta
  medir(luz, maxLuz);
  digitalWrite(PIN_LED_FUENTE, LOW);       // apagar entre ciclos (menos calor y deriva del LED)

  for (int k = 0; k < 4; k++) {
    neto[k] = luz[k] - osc[k];
    if (neto[k] < 0) neto[k] = 0;
  }
  const bool sat = maxLuz >= CUENTA_MAX;

  if (refFaltan > 0) {                     // acumulando la referencia I0
    for (int k = 0; k < 4; k++) refSuma[k] += neto[k];
    refFaltan--;
    if (refFaltan == 0) {
      for (int k = 0; k < 4; k++) ref[k] = refSuma[k] / N_REF;
      refValida = true;
      Serial.printf("# I0 guardada: r=%.0f g=%.0f b=%.0f c=%.0f%s\n", ref[0], ref[1], ref[2], ref[3],
                    sat ? "  (¡SATURADO! bajar ganancia o integración)" : "");
    }
  }

  seq++;
  enviarLectura(neto, osc, sat);
  digitalWrite(PIN_LED_ESTADO, LOW);
}
