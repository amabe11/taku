// Copia este archivo como «secretos.h» (en la misma carpeta) y completa los datos.
// secretos.h NO se sube a GitHub (.gitignore): contiene la clave del hotspot y la del lector.
#pragma once

// Hotspot del celular. El ESP32 solo usa WiFi de 2,4 GHz: en Samsung, activa
// «Ajustes > Conexiones > Zona Wi-Fi > Configurar > Banda: 2,4 GHz» (o «Maximizar compatibilidad» en iPhone).
#define WIFI_SSID_1 "Nombre-del-hotspot"
#define WIFI_PASS_1 "clave-del-hotspot"

// Segunda red opcional (por ejemplo, el WiFi del laboratorio). Déjala vacía si no hace falta.
#define WIFI_SSID_2 ""
#define WIFI_PASS_2 ""

// Servidor Ahgora (Vercel). No cambies la ruta /api/lecturas.
#define API_URL "https://taku-server.vercel.app/api/lecturas"

// Clave de LECTOR: la variable AHG_NODE_KEY de Vercel. Solo permite ENVIAR lecturas.
// No pongas aquí la clave del equipo (AHG_TEAM_KEY): esa da acceso a todos los datos.
#define CLAVE_LECTOR "pega-aqui-la-clave-del-lector"
