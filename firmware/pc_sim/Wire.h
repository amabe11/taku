// AHGORA · Wire.h de mentira (I2C) para el simulador en PC.
#pragma once
class TwoWire {
 public:
  bool begin(int sda = -1, int scl = -1) { (void)sda; (void)scl; return true; }
};
extern TwoWire Wire;
