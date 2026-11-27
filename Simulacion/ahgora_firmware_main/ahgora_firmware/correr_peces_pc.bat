@echo off
rem AHGORA · corre el firmware de PECES (AHG-PEZ-01) en la PC, sin placa.
rem Los datos simulados se cambian en pc_sim\escena.h. Necesita g++ (MinGW) en el PATH.
chcp 65001 >nul
cd /d "%~dp0"
echo Compilando peces_AHG-PEZ-01 para la PC...
g++ -std=gnu++11 -O1 -DSIM_PECES -I pc_sim peces_AHG-PEZ-01\src\main.cpp pc_sim\arduino_pc.cpp -o pc_sim\peces_pc.exe
if errorlevel 1 (
  echo.
  echo No se pudo compilar. Revisa el error de arriba ^(o que g++ este instalado: g++ --version^).
  pause
  exit /b 1
)
"%~dp0pc_sim\peces_pc.exe"
