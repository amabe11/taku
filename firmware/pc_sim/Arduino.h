// AHGORA · Arduino.h de mentira para correr el firmware en la PC (Windows + g++).
// Solo lo que usan los dos main.cpp: tiempo, pines, Serial. No se usa al compilar para el ESP32.
#pragma once
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <stdarg.h>
#include <string.h>
#include <math.h>
#include <ctype.h>

#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1

uint32_t millis();
void delay(uint32_t ms);
void pinMode(int pin, int mode);
void digitalWrite(int pin, int value);
int digitalRead(int pin);

class SerialPC {
 public:
  void begin(unsigned long) {}
  int available();
  int read();
  size_t print(const char *s);
  size_t println(const char *s = "");
  size_t println(int v);
  size_t println(unsigned long v);
  size_t println(double v);
  int printf(const char *fmt, ...) __attribute__((format(printf, 2, 3)));
};
extern SerialPC Serial;

void setup();
void loop();
