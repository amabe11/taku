// Ahgora - lector colorimetrico ESP32 + TCS34725 con envio por WiFi (hotspot del celular)
//
// Hace lo mismo que Ahgora_TCS34725_Prueba_Optica.ino (un JSON por segundo por el Monitor Serie a 115200)
// y ademas manda las lecturas al Servidor Ahgora (POST /api/lecturas), que las guarda en MongoDB Atlas
// (coleccion «lecturas») y las muestra en Ahgora Web, vista «Lector en vivo».
//
// - Se conecta al hotspot del celular (2,4 GHz). Si no hay senal, guarda hasta 5 minutos de lecturas y
//   las manda cuando vuelve la conexion.
// - Manda las lecturas de a 10 (cada ~10 s) por HTTPS, verificando el certificado del servidor.
// - Usa una clave de LECTOR (x-ahg-nodo) que solo permite enviar lecturas: no sirve para leer ni cambiar datos.
//
// SOLO PRUEBA OPTICA: los valores son senal cruda del sensor, no concentracion de mercurio.
//
// Librerias: "Adafruit TCS34725" (gestor de librerias). WiFi, HTTPClient y WiFiClientSecure vienen con el
// paquete de placas esp32 (version 3.x). Placa: "ESP32 Dev Module".
// Conexiones: VIN->3V3, GND->GND, SDA->GPIO21, SCL->GPIO22, LED del modulo->GPIO4
//
// Antes de compilar: copia secretos.example.h como secretos.h y escribe el nombre y la clave del hotspot.

#include <Wire.h>
#include <Adafruit_TCS34725.h>
#include <WiFi.h>
#include <WiFiMulti.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>
#include <sys/time.h>

#include "secretos.h"  // WIFI_SSID_1, WIFI_PASS_1, (WIFI_SSID_2, WIFI_PASS_2), API_URL, CLAVE_LECTOR
#include "raices.h"    // certificados raiz para verificar https://taku-server.vercel.app

// ------------------------------------------------------------------ configuracion
const int PIN_LED_SENSOR = 4;
const int PIN_LED_ESTADO = 2;          // LED azul de la placa: parpadea buscando WiFi, fijo si envia bien
const bool USAR_LED_ESTADO = true;     // ponlo en false si la luz de la placa entra a la camara oscura
const char* NODE_ID = "AHG-SED-01";
const char* FIRMWARE = "ahgora-wifi-0.2";

const uint32_t PERIODO_LECTURA_MS = 1000;  // una lectura por segundo, como antes
const uint8_t LOTE = 10;                   // lecturas por envio
const uint32_t ENVIO_MAX_ESPERA_MS = 15000; // si hay menos de 10, igual se envian a los 15 s
const uint16_t CAPACIDAD = 300;             // 5 minutos sin senal; despues se pisan las mas viejas
const uint32_t REINTENTO_WIFI_MS = 10000;

// ------------------------------------------------------------------ estado
Adafruit_TCS34725 tcs(TCS34725_INTEGRATIONTIME_154MS, TCS34725_GAIN_4X);
WiFiMulti redes;
unsigned long seq = 0;

struct Lectura {
  uint32_t seq;
  uint64_t t;  // hora de medicion en ms (NTP); 0 si todavia no hay hora
  uint16_t r, g, b, c;
};
Lectura cola[CAPACIDAD];
uint16_t colaInicio = 0, colaCantidad = 0;

unsigned long ultimaLectura = 0, ultimoEnvio = 0, ultimoIntentoWifi = 0, esperaEnvio = 0;
bool horaLista = false, wifiAvisado = false, ultimoEnvioOk = false;

// ------------------------------------------------------------------ cola circular
void encolar(const Lectura& l) {
  uint16_t pos = (colaInicio + colaCantidad) % CAPACIDAD;
  if (colaCantidad < CAPACIDAD) colaCantidad++;
  else colaInicio = (colaInicio + 1) % CAPACIDAD;  // llena: se pierde la mas vieja
  cola[pos] = l;
}
void descartar(uint16_t n) {
  if (n > colaCantidad) n = colaCantidad;
  colaInicio = (colaInicio + n) % CAPACIDAD;
  colaCantidad -= n;
}

// ------------------------------------------------------------------ hora (NTP por el hotspot)
uint64_t ahoraMs() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  if (tv.tv_sec < 1700000000) return 0;  // todavia sin hora
  return (uint64_t)tv.tv_sec * 1000ULL + tv.tv_usec / 1000;
}

// ------------------------------------------------------------------ LED de estado
void led(bool encendido) {
  if (USAR_LED_ESTADO) digitalWrite(PIN_LED_ESTADO, encendido ? HIGH : LOW);
}
void actualizarLed() {
  if (!USAR_LED_ESTADO) return;
  if (WiFi.status() != WL_CONNECTED) led((millis() / 250) % 2);  // parpadeo rapido: sin WiFi
  else led(ultimoEnvioOk || colaCantidad == 0);                  // fijo: conectado y enviando bien
}

// ------------------------------------------------------------------ WiFi
void cuidarWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!wifiAvisado) {
      wifiAvisado = true;
      Serial.print("WIFI: conectado a "); Serial.print(WiFi.SSID());
      Serial.print(" · IP "); Serial.print(WiFi.localIP());
      Serial.print(" · senal "); Serial.print(WiFi.RSSI()); Serial.println(" dBm");
      configTime(-4 * 3600, 0, "pool.ntp.org", "time.google.com");  // hora de Bolivia
    }
    if (!horaLista && ahoraMs() > 0) { horaLista = true; Serial.println("HORA: sincronizada por NTP"); }
    return;
  }
  if (wifiAvisado) { wifiAvisado = false; Serial.println("WIFI: sin conexion, guardando lecturas"); }
  if (millis() - ultimoIntentoWifi < REINTENTO_WIFI_MS && ultimoIntentoWifi != 0) return;
  ultimoIntentoWifi = millis();
  redes.run(3000);  // intenta conectarse a la red disponible con mejor senal (bloquea hasta 3 s)
}

// ------------------------------------------------------------------ envio al servidor
String cuerpoJson(uint16_t n) {
  String s;
  s.reserve(160 + n * 110);
  s += "{\"node_id\":\""; s += NODE_ID;
  s += "\",\"firmware\":\""; s += FIRMWARE;
  s += "\",\"sensor\":\"TCS34725\",\"test_mode\":true,\"rssi\":"; s += WiFi.RSSI();
  s += ",\"lecturas\":[";
  char item[160];
  for (uint16_t i = 0; i < n; i++) {
    const Lectura& l = cola[(colaInicio + i) % CAPACIDAD];
    float rn = 0, gn = 0, bn = 0;
    if (l.c > 0) { rn = 255.0f * l.r / l.c; gn = 255.0f * l.g / l.c; bn = 255.0f * l.b / l.c; }
    snprintf(item, sizeof(item),
             "%s{\"seq\":%lu,\"t\":%llu,\"r\":%u,\"g\":%u,\"b\":%u,\"c\":%u,\"r_norm\":%.2f,\"g_norm\":%.2f,\"b_norm\":%.2f}",
             i ? "," : "", (unsigned long)l.seq, (unsigned long long)l.t, l.r, l.g, l.b, l.c, rn, gn, bn);
    s += item;
  }
  s += "]}";
  return s;
}

void enviar() {
  if (WiFi.status() != WL_CONNECTED || colaCantidad == 0) return;
  if (!horaLista) return;  // sin hora el certificado HTTPS no se puede verificar bien
  bool loteCompleto = colaCantidad >= LOTE;
  if (!loteCompleto && millis() - ultimoEnvio < ENVIO_MAX_ESPERA_MS) return;
  if (millis() - ultimoEnvio < esperaEnvio) return;  // espera creciente despues de un error

  uint16_t n = colaCantidad > 30 ? 30 : colaCantidad;  // si hubo corte, se vacia de a 30
  WiFiClientSecure cliente;
  cliente.setCACert(CERT_RAICES);
  HTTPClient http;
  http.setTimeout(15000);
  if (!http.begin(cliente, API_URL)) { Serial.println("ENVIO: direccion invalida en API_URL"); return; }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-ahg-nodo", CLAVE_LECTOR);
  int codigo = http.POST(cuerpoJson(n));
  String respuesta = http.getString();
  http.end();
  ultimoEnvio = millis();

  if (codigo == 200) {
    descartar(n);
    ultimoEnvioOk = true;
    esperaEnvio = 0;
    Serial.print("ENVIO: "); Serial.print(n); Serial.print(" lecturas al servidor · quedan "); Serial.println(colaCantidad);
  } else if (codigo == 400) {
    descartar(n);  // datos que el servidor nunca va a aceptar: no se reintentan
    ultimoEnvioOk = false;
    Serial.print("ENVIO: rechazado (400) "); Serial.println(respuesta);
  } else {
    ultimoEnvioOk = false;
    esperaEnvio = esperaEnvio ? min(esperaEnvio * 2, 120000UL) : 5000;  // 5 s, 10 s, 20 s... hasta 2 min
    Serial.print("ENVIO: error "); Serial.print(codigo);
    if (codigo == 401) Serial.print(" (revisa CLAVE_LECTOR en secretos.h)");
    if (codigo < 0) { Serial.print(" "); Serial.print(HTTPClient::errorToString(codigo)); }
    Serial.print(" · se reintenta en "); Serial.print(esperaEnvio / 1000); Serial.println(" s");
  }
}

// ------------------------------------------------------------------ lectura del sensor (igual que antes)
void leerSensor() {
  uint16_t r, g, b, c;
  tcs.getRawData(&r, &g, &b, &c);

  float rn = 0, gn = 0, bn = 0;
  if (c > 0) {  // cocientes respecto del canal claro, escala 0-255
    rn = 255.0 * r / c;
    gn = 255.0 * g / c;
    bn = 255.0 * b / c;
  }

  Serial.print("{\"node_id\":\""); Serial.print(NODE_ID);
  Serial.print("\",\"seq\":");     Serial.print(seq);
  Serial.print(",\"test_mode\":true,\"sensor\":\"TCS34725\"");
  Serial.print(",\"r\":");  Serial.print(r);
  Serial.print(",\"g\":");  Serial.print(g);
  Serial.print(",\"b\":");  Serial.print(b);
  Serial.print(",\"c\":");  Serial.print(c);
  Serial.print(",\"r_norm\":"); Serial.print(rn, 2);
  Serial.print(",\"g_norm\":"); Serial.print(gn, 2);
  Serial.print(",\"b_norm\":"); Serial.print(bn, 2);
  Serial.println("}");

  encolar({(uint32_t)seq, ahoraMs(), r, g, b, c});
  seq++;
}

void setup() {
  Serial.begin(115200);
  delay(500);
  pinMode(PIN_LED_SENSOR, OUTPUT);
  digitalWrite(PIN_LED_SENSOR, HIGH);  // LED del sensor encendido
  if (USAR_LED_ESTADO) pinMode(PIN_LED_ESTADO, OUTPUT);
  Wire.begin(21, 22);
  if (!tcs.begin()) {
    Serial.println("{\"error\":\"TCS34725 no encontrado en 0x29\"}");
    while (true) delay(1000);
  }

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  redes.addAP(WIFI_SSID_1, WIFI_PASS_1);
#ifdef WIFI_SSID_2
  if (strlen(WIFI_SSID_2) > 0) redes.addAP(WIFI_SSID_2, WIFI_PASS_2);
#endif
  Serial.println("LISTO: lector Ahgora - SOLO PRUEBA OPTICA - envio por WiFi");
  Serial.print("WIFI: buscando "); Serial.println(WIFI_SSID_1);
}

void loop() {
  if (millis() - ultimaLectura >= PERIODO_LECTURA_MS) {
    ultimaLectura = millis();
    leerSensor();
  }
  cuidarWifi();
  enviar();
  actualizarLed();
  delay(10);
}
