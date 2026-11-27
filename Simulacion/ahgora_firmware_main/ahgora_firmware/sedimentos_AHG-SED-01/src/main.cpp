/*
 * AHGORA · Nodo colorimétrico de SEDIMENTOS (AHG-SED-01)
 * ESP32 DevKit + TCS34725 · firmware de prueba óptica (sin mercurio)
 *
 * Basado en la "Guía Loana · Montaje ESP32 + TCS34725" v2.0:
 *   - Conexión I2C: 3V3 -> VIN/VCC · GND -> GND · GPIO21 -> SDA · GPIO22 -> SCL
 *   - Monitor Serie a 115200 baudios
 *   - Al arrancar imprime:  LISTO: lector Ahgora - SOLO PRUEBA OPTICA
 *   - Luego, UN JSON por segundo:
 *     {"node_id":"AHG-SED-01","seq":12,"test_mode":true,"sensor":"TCS34725",
 *      "r":1010,"g":625,"b":420,"c":2440,"r_norm":105.53,"g_norm":65.32,"b_norm":43.89}
 *   - r,g,b,c = cuentas crudas · r_norm = r / c * 255 (igual para g y b)
 *
 * IMPORTANTE: estas lecturas NO son concentración ni valor de Hg. Esta etapa solo prueba
 * el lector óptico y el enlace de datos (test_mode siempre en true).
 *
 * Para quien integra (Alvin): toda línea que empieza con '{' es una lectura JSON; las demás
 * líneas son mensajes de estado y se pueden ignorar.
 *
 * Bibliotecas: Adafruit TCS34725 (instala también Adafruit BusIO).
 * Arduino IDE: este mismo archivo funciona si lo guarda como  sedimentos_AHG-SED-01.ino
 * dentro de una carpeta con ese mismo nombre.
 */
#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_TCS34725.h>

// ------------------------- Configuración -------------------------
static const char *NODE_ID = "AHG-SED-01";
static const uint32_t BAUDIOS = 115200;
static const int PIN_SDA = 21;
static const int PIN_SCL = 22;
static const uint32_t PERIODO_MS = 1000;   // un JSON por segundo
static const int PIN_LED_ESTADO = 2;       // LED azul de la placa: parpadea en cada lectura
static const int PIN_LED_EXTERNO = -1;     // LED blanco externo opcional (-1 = usar el LED del módulo)

// Ganancia y tiempo de integración (ajustar si la tarjeta blanca satura o da poca señal)
#define TCS_INTEGRACION TCS34725_INTEGRATIONTIME_50MS
#define TCS_GANANCIA    TCS34725_GAIN_4X

// ------------------------------------------------------------------
Adafruit_TCS34725 tcs(TCS_INTEGRACION, TCS_GANANCIA);
static uint32_t seq = 0;
static uint32_t tUltima = 0;

static void enviarLectura(uint16_t r, uint16_t g, uint16_t b, uint16_t c) {
  const float rn = c ? 255.0f * r / c : 0.0f;
  const float gn = c ? 255.0f * g / c : 0.0f;
  const float bn = c ? 255.0f * b / c : 0.0f;
  char buf[220];
  snprintf(buf, sizeof(buf),
           "{\"node_id\":\"%s\",\"seq\":%lu,\"test_mode\":true,\"sensor\":\"TCS34725\","
           "\"r\":%u,\"g\":%u,\"b\":%u,\"c\":%u,"
           "\"r_norm\":%.2f,\"g_norm\":%.2f,\"b_norm\":%.2f}",
           NODE_ID, (unsigned long)seq, (unsigned)r, (unsigned)g, (unsigned)b, (unsigned)c, rn, gn, bn);
  Serial.println(buf);
}

void setup() {
  Serial.begin(BAUDIOS);
  delay(300);

  pinMode(PIN_LED_ESTADO, OUTPUT);
  digitalWrite(PIN_LED_ESTADO, LOW);
  if (PIN_LED_EXTERNO >= 0) {
    pinMode(PIN_LED_EXTERNO, OUTPUT);
    digitalWrite(PIN_LED_EXTERNO, HIGH);    // iluminación constante
  }

  Wire.begin(PIN_SDA, PIN_SCL);

  // Si el sensor no responde, no se envían lecturas: se reintenta cada 2 s.
  while (!tcs.begin(TCS34725_ADDRESS, &Wire)) {
    Serial.println("ERROR: TCS34725 no encontrado en I2C 0x29. Revisar VIN/VCC, GND, SDA (21) y SCL (22).");
    delay(2000);
  }

  // Descartar la primera medición (puede venir de antes de configurar el sensor)
  uint16_t r, g, b, c;
  tcs.getRawData(&r, &g, &b, &c);

  Serial.println("LISTO: lector Ahgora - SOLO PRUEBA OPTICA");
  tUltima = millis();
}

void loop() {
  if (millis() - tUltima >= PERIODO_MS) {
    tUltima += PERIODO_MS;
    uint16_t r, g, b, c;
    digitalWrite(PIN_LED_ESTADO, HIGH);
    tcs.getRawData(&r, &g, &b, &c);
    seq++;
    enviarLectura(r, g, b, c);
    digitalWrite(PIN_LED_ESTADO, LOW);
  }
}
