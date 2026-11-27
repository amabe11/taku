// AHGORA · Adafruit_TCS34725.h de mentira: mismo uso que la biblioteca real, pero las lecturas
// salen de pc_sim/escena.h. Para la placa real se usa la biblioteca de Adafruit (platformio.ini).
#pragma once
#include <Arduino.h>
#include <Wire.h>

#define TCS34725_ADDRESS 0x29

// Valores ATIME y ganancia como en la biblioteca real
#define TCS34725_INTEGRATIONTIME_2_4MS 0xFF
#define TCS34725_INTEGRATIONTIME_24MS 0xF6
#define TCS34725_INTEGRATIONTIME_50MS 0xEB
#define TCS34725_INTEGRATIONTIME_101MS 0xD5
#define TCS34725_INTEGRATIONTIME_154MS 0xC0
#define TCS34725_INTEGRATIONTIME_700MS 0x00
typedef enum { TCS34725_GAIN_1X = 0, TCS34725_GAIN_4X = 1, TCS34725_GAIN_16X = 2, TCS34725_GAIN_60X = 3 } tcs34725Gain_t;

class Adafruit_TCS34725 {
 public:
  Adafruit_TCS34725(uint8_t atime = TCS34725_INTEGRATIONTIME_2_4MS, tcs34725Gain_t gain = TCS34725_GAIN_1X)
      : atime_(atime), gain_(gain) {}
  bool begin(uint8_t addr = TCS34725_ADDRESS, TwoWire *wire = &Wire) { (void)addr; (void)wire; return true; }
  void getRawData(uint16_t *r, uint16_t *g, uint16_t *b, uint16_t *c);

 private:
  uint8_t atime_;
  tcs34725Gain_t gain_;
};
