# Lector Ahgora por WiFi (ESP32 + TCS34725)

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
