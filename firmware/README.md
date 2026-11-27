# Firmware Ahgora (ESP32 + TCS34725)

Todo el firmware del lector Ahgora está en esta carpeta:

| Carpeta / archivo | Qué es | Cómo se usa |
|---|---|---|
| `ahgora_lector_wifi/` | **Lector real de sedimentos con envío por WiFi** (colorimetría, verificado en placa el 26/11/2026). | Arduino IDE → ESP32. Ver «Lector por WiFi» abajo. |
| `sedimentos_AHG-SED-01/` | Mismo lector de sedimentos, **solo por cable USB** (Monitor Serie). Guía Loana v2.0. | PlatformIO (VS Code) o Arduino IDE. |
| `peces_AHG-PEZ-01/` | Lector de cubetas para **peces** (nanopartículas de oro, por transmisión). Código **provisional**. | PlatformIO (VS Code) o Arduino IDE. |
| `pc_sim/` | **Simulador en la PC**: corre `sedimentos_AHG-SED-01` y `peces_AHG-PEZ-01` sin placa. Los datos se cambian en `pc_sim/escena.h`. | Tareas de VS Code o `correr_*_pc.bat`. |
| `ahgora_firmware.code-workspace` | Área de trabajo de VS Code con los proyectos y las tareas. | *Archivo → Abrir área de trabajo desde archivo…* |
| `../server/scripts/cargar-jsonl.mjs` | **Puente**: carga a la base las lecturas `.jsonl` del simulador (o copiadas del Monitor Serie). | Ver «Cargar lecturas a la base». |

> **Solo prueba óptica.** Todos envían valores crudos del sensor (R, G, B, C). No son concentración de mercurio.

---

# Lector por WiFi (`ahgora_lector_wifi/`)

`ahgora_lector_wifi/` es el mismo programa de prueba óptica de siempre (un JSON por segundo por el Monitor Serie a
115200) **más** el envío de las lecturas por WiFi, desde el hotspot del celular, al Servidor Ahgora:

```
TCS34725 → ESP32 → WiFi (hotspot del celular) → https://taku-server.vercel.app/api/lecturas → MongoDB Atlas (colección «lecturas»)
                                                                                      ├→ Ahgora Web: «Lector en vivo (ESP32)»
                                                                                      └→ App modo técnico: Nueva muestra → Lectura → «WiFi»
```

> **Solo prueba óptica.** Son valores crudos del sensor (R, G, B, C). No son concentración de mercurio.

## 1. Preparar el hotspot del celular

- El ESP32 **solo usa WiFi de 2,4 GHz**. En Samsung: *Ajustes → Conexiones → Zona Wi-Fi portátil → Configurar →
  Banda: 2,4 GHz*. En iPhone: activar *Maximizar compatibilidad*.
- El celular debe tener datos móviles: el lector envía por internet.

## 2. Configurar y cargar el firmware

1. Arduino IDE 2.x con el paquete de placas **esp32 (3.x)** y la librería **Adafruit TCS34725**.
2. En `ahgora_lector_wifi/`, copia `secretos.example.h` como **`secretos.h`** y completa:
   - `WIFI_SSID_1` y `WIFI_PASS_1`: nombre y clave del hotspot.
   - `CLAVE_LECTOR`: la clave de lector (`AHG_NODE_KEY` de Vercel, ver abajo). **No** uses la clave del equipo.
3. Placa *ESP32 Dev Module*, puerto USB, *Subir*.
4. Monitor Serie a 115200. Debe aparecer:

```
LISTO: lector Ahgora - SOLO PRUEBA OPTICA - envio por WiFi
WIFI: conectado a MiCelular · IP 192.168.43.20 · senal -55 dBm
HORA: sincronizada por NTP
{"node_id":"AHG-SED-01","seq":12,...}
ENVIO: 10 lecturas al servidor · quedan 0
```

`secretos.h` no se sube a GitHub (`.gitignore`): el repositorio es público.

### Si la carga falla con «No serial data received» o «Wrong boot mode detected»

La placa no está entrando en modo de programación (el reinicio automático no baja GPIO0). Con el Monitor Serie
cerrado:

1. Mantén apretado **BOOT** (IO0).
2. Sin soltarlo, aprieta y suelta **EN** (RST).
3. Suelta **BOOT**: la placa queda esperando el programa.
4. *Subir* en el Arduino IDE (o `esptool --before no-reset write-flash 0x0 <sketch>.ino.merged.bin`).
5. Al terminar, aprieta **EN** una vez para que arranque el programa.

Probado el 26/11/2026 con un ESP32-D0WD-V3: carga correcta y en el Monitor Serie
`ENVIO: 10 lecturas al servidor · quedan 0` cada ~10 s.

## 3. Qué hace sin señal

Guarda hasta **300 lecturas** (5 minutos). Cuando vuelve la conexión las envía de a 30. Si se llena, se pierden las
más viejas. Las lecturas llevan la hora de medición (NTP), así que llegan con su hora real aunque se envíen después.

| Monitor Serie | Qué significa |
|---|---|
| `ENVIO: error 401` | `CLAVE_LECTOR` no coincide con `AHG_NODE_KEY` de Vercel. |
| `ENVIO: error -1` | No hay internet en el hotspot o falló el certificado HTTPS (`raices.h`). |
| `WIFI: sin conexion` | El hotspot está apagado, lejos o en 5 GHz. |
| LED azul parpadea | Buscando WiFi. Fijo: conectado y enviando. (`USAR_LED_ESTADO = false` lo apaga si entra luz a la caja.) |

## 4. Clave del lector en Vercel (una sola vez)

En Vercel → proyecto del servidor → *Settings → Environment Variables*: agregar **`AHG_NODE_KEY`** con una clave
larga (por ejemplo, la salida de `node -e "console.log(crypto.randomUUID())"`) y hacer *Redeploy*.
Esa clave **solo permite enviar lecturas**: si alguien la saca del ESP32, no puede leer ni cambiar datos.
`/api/health` muestra `clave_lector_configurada: true` cuando está lista.

## 5. Probar sin el ESP32

```bash
curl -X POST https://taku-server.vercel.app/api/lecturas \
  -H "Content-Type: application/json" -H "x-ahg-nodo: <AHG_NODE_KEY>" \
  -d '{"node_id":"AHG-SED-01","seq":1,"r":1010,"g":625,"b":420,"c":2440}'
```

---

# Lectores por USB (`sedimentos_AHG-SED-01/` y `peces_AHG-PEZ-01/`)

Proyectos de PlatformIO (`src/main.cpp` + `platformio.ini`). La biblioteca Adafruit TCS34725 se instala sola.

- **Sedimentos (AHG-SED-01):** al arrancar imprime `LISTO: lector Ahgora - SOLO PRUEBA OPTICA` y luego un JSON por
  segundo: `node_id, seq, test_mode, sensor, r, g, b, c, r_norm, g_norm, b_norm` (`r_norm = r / c × 255`).
- **Peces (AHG-PEZ-01, provisional):** LED blanco en GPIO25 con 220 Ω a GND. Cada segundo mide con el LED apagado y
  encendido y resta la luz ambiente. Comandos en el Monitor Serie: `CUBETA <nombre>` (ej. `CUBETA E 5`,
  `CUBETA Muestra`), `REF` (con la cubeta de agua: guarda I0) e `INFO`. Además de los campos base envía `modo`,
  `cubeta`, `r_osc/g_osc/b_osc/c_osc`, `sat` y, con la referencia guardada, `A_r`, `A_g`, `A_b` y `q = A_r / A_g`.
  La curva de calibración y los mg/kg se calculan en la PC con los estándares.
- Conexión del TCS34725: 3V3 → VIN/VCC · GND → GND · GPIO21 → SDA · GPIO22 → SCL.
- **Cargar en la placa:** abre `ahgora_firmware.code-workspace` (o la carpeta del proyecto) en VS Code con
  PlatformIO → ✓ Build → → Upload → 🔌 Monitor (115200). Compilan para el ESP32 (verificado el 27/11/2026).
- La clave `x-ahg-key` **no** va en estos firmwares.

# Simulador en la PC (`pc_sim/`)

El mismo `src/main.cpp` corre en Windows: el sensor TCS34725, el LED y el Monitor Serie son simulados. La consola hace
de Monitor Serie y las lecturas salen de **`pc_sim/escena.h`** (el archivo para cambiar los datos).

1. VS Code: *Archivo → Abrir área de trabajo desde archivo…* → `ahgora_firmware.code-workspace`.
2. *Terminal → Ejecutar tarea…* → «PC: simular sedimentos (AHG-SED-01)» (también con Ctrl+Shift+B) o «PC: simular
   peces (AHG-PEZ-01)». Sin VS Code: doble clic en `correr_sedimentos_pc.bat` o `correr_peces_pc.bat`.
3. Comandos (escribir y Enter):
   - Sedimentos: `TARJETA Roja`, `TARJETA Blanca`, `AUTO` (secuencia), `LUZ ON` / `LUZ OFF`, `SALIR`.
   - Peces: `CUBETA Agua` → `REF` → `CUBETA E 0` / `E 5` / `E 10` / `E 20` / `E 40` → `CUBETA Muestra`;
     `MUESTRA 25` cambia el Hg simulado de la muestra (µg/L); `INFO`; `SALIR`.
4. Cada lectura también se guarda en `lecturas_AHG-SED-01.jsonl` / `lecturas_AHG-PEZ-01.jsonl` (en esta carpeta), con
   la hora de la PC (`t`).
5. Para cambiar los datos: edita `pc_sim/escena.h` (colores de las tarjetas, ruido, luz externa, I0, absorbancias de
   las AuNP, Hg de la muestra), guarda y vuelve a correr la tarea: se recompila sola.
   Opcional, comandos automáticos (uno cada 4 s): `set AHG_SIM_COMANDOS=CUBETA Agua;REF;CUBETA E 5;CUBETA Muestra`.

Requisito: g++ (MinGW) en el PATH. Verificado el 27/11/2026: los dos nodos compilan y corren en la PC.

# Cargar lecturas a la base (puente `.jsonl` → MongoDB)

`server/scripts/cargar-jsonl.mjs` envía las lecturas de uno o más `.jsonl` a `POST /api/lecturas` (colección
«lecturas»), igual que el lector WiFi. Se ven en Ahgora Web → **Lector en vivo (ESP32)** (con cubeta y `q` si son de
peces) y se cuentan en *Configuración → Base de datos del servidor*.

```bash
cd server
node scripts/cargar-jsonl.mjs ../firmware/lecturas_AHG-SED-01.jsonl ../firmware/lecturas_AHG-PEZ-01.jsonl --key <clave>
node scripts/cargar-jsonl.mjs ../firmware/lecturas_AHG-PEZ-01.jsonl --seco     # solo muestra qué enviaría
```

- Clave: la del equipo (`AHG_TEAM_KEY`) o la del lector (`AHG_NODE_KEY`), con `--key` o por variable de entorno.
  En VS Code: tarea «Servidor: cargar lecturas .jsonl a la base» (pide la clave y no la guarda).
- Por defecto quedan marcadas `simulado: true`; «Borrar simulación» (Configuración) las quita. Para lecturas de una
  placa real copiadas del Monitor Serie usa `--real` (las líneas que no son JSON se ignoran).
- Repetir la carga no duplica: el servidor no guarda dos veces el mismo nodo + `seq` + hora de medición.
