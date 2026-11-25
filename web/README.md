# Ahgora Web

Sitio para **autoridades ambientales y de salud, laboratorios e investigadores** (sección 7.3 de
`Ahgora_Descripcion_de_la_Solucion_Estilizada.pdf`). Muestra las muestras de cribado de mercurio que llegan del
campo, con su **semáforo** y su **nivel de certeza**, ayuda a decidir **qué enviar primero al laboratorio** y **dónde
intervenir**, y agrega las **capas satelitales de la NASA** como contexto. Desafío ORO-4.1, Gold4Good.

```
Caja Ahgora (ESP32 + cabezal SED o PEZ) ─Bluetooth─► App Android modo técnico ─sync─► Servidor Ahgora ◄── Laboratorio
                                                                                        │
                                                         Ahgora Comunidad (Android) ◄───┴───► Ahgora Web (esta carpeta)
```

> **Límites que la web hace visibles**
> - Es **cribado**: «CRIBADO — NO ES DIAGNÓSTICO NI EVIDENCIA LEGAL». No reemplaza al laboratorio.
> - «Cribado», «en verificación» y «confirmado» **nunca se mezclan** (7.1).
> - Un verde **no** significa «libre de mercurio»; la versión 1 probablemente no detecta sedimentos de 0,17–0,5 mg/kg.
> - Los satélites **no detectan mercurio**: aportan contexto.

## Vistas

| Menú | Qué hace (guía) |
|---|---|
| Mapa de muestras | Mapa interactivo: color = semáforo, forma = matriz, anillo = certeza. Filtros por matriz, fecha, cuenca, estado y responsable. Capas NASA GIBS. Eje de cuenca, comunidades y frentes mineros |
| Muestras | Tabla ordenable y filtrable. Exporta CSV, GeoJSON y una **versión pública** (solo muestras públicas, en celdas de 0,1°, sin responsables) |
| Ficha de muestra (`#/muestra/<código>`) | Trazabilidad completa: quién, cuándo, dónde, controles, calibración, cálculo C_sed/C_pez, lecturas crudas, laboratorio, cuenca, lluvia previa (NASA POWER). Acciones: enviar al laboratorio, cargar resultado, visibilidad, imprimir/PDF |
| Cola de priorización | Lista ordenada para el laboratorio con reglas a la vista: semáforo → población aguas abajo → estimado frente a la referencia → antigüedad |
| Vista de cuenca | Perfil aguas arriba (posibles fuentes) / aguas abajo (posibles expuestos) de una muestra |
| Indicadores | Muestras, % por color y matriz, tiempos, desempeño frente al laboratorio (sensibilidad, falsos negativos, especificidad, correlación) con aviso de pocos datos |
| Alertas comunitarias | Política de alertas (7.2). Un responsable revisa y aprueba cada mensaje; vista previa de lo que ve la comunidad |
| Método y límites | Qué podemos afirmar y qué no (8), sensibilidad (4.7), capas NASA (7.4), roles y privacidad (7.7), plan de validación (9) |
| Configuración | Origen de datos (demostración o servidor), clave del equipo, importar JSON/CSV, respaldo |

## Desarrollo

```bash
npm install
npm run dev             # http://localhost:5173 — arranca en demostración
npm run build           # dist/
npm run deploy:pages    # publica en GitHub Pages (rama gh-pages)
```

`?demo=1` fuerza la demostración y `?demo=0` el servidor. En demostración todo es ficticio (`demostracion: true`,
códigos `DEMO-…`): muestras, comunidades, población, frentes mineros y resultados de laboratorio.

## Registro de muestra (contrato con la app modo técnico y el firmware)

Campos de la sección 7.6 + lo que el ESP32 envía por Bluetooth (6.1). La app lo sincroniza con `POST /api/sync`
(`{ "muestras": [ … ] }`, idempotente por `codigo`). Ahgora Web agrega `laboratorio`, `alerta`, `visibilidad` e `historial`.

```jsonc
{
  "codigo": "AHG-SED-0007",
  "matriz": "sedimento",                     // sedimento | cola | pescado
  "cabezal": "SED",                          // SED | PEZ
  "fecha_iso": "2026-11-24T14:02:11-04:00",
  "lat": -15.83, "lon": -67.57,
  "responsable": "Técnico de campo 1",
  "cuenca": "Nombre de la cuenca",
  "muestreo": { "tipo": "compuesta", "porciones": 8, "profundidad_cm": 5, "fino_pct": 35, "observaciones": "" },
  "lecturas": {                              // crudas del sensor
    "n_promedio": 10, "ganancia": "4x", "integracion_ms": 154,
    "referencia_blanca": { "r": 21480, "g": 23310, "b": 20120, "c": 65000 },
    "casilla_sin_usar": { "r": 15820, "g": 16950, "b": 12730, "c": 45210 },
    "casilla_reaccionada": { "r": 15600, "g": 16580, "b": 12640, "c": 44560 },
    "blanco_matriz_delta": 0.6, "delta_e": 12.4
  },                                         // PEZ: { "tecnica", "deposicion_s", "potencial_pico_v", "pico_ua" }
  "calculo": {                               // C_sed = C_ext·V_ext / (m_húmeda·f_seco·R)
    "c_ext_mg_l": 1.2, "v_ext_l": 0.005, "m_humeda_kg": 0.005, "f_seco": 0.65, "recuperacion_r": 0.5,
    "c_estimada_mg_kg": 3.69, "base": "seco"  // PEZ: m_tejido_kg en lugar de m_humeda_kg y f_seco; base "fresco"
  },
  "semaforo": "rojo",                        // rojo | amarillo | verde | invalido  (lo asigna el ESP32)
  "controles": { "blanco_procedimiento": "ok", "cloro_libre_cero": "ok", "referencia_blanca": "ok", "blanco_matriz": "restado", "ph": "ok" },
  "calibracion": "SED-CAL-v0.1",             // versión de la curva usada
  "firmware": "ahgora-fw-0.1",
  "certeza": "cribado",                      // cribado | en_verificacion | confirmado
  "laboratorio": { "laboratorio": "", "enviada_en": "", "fecha_resultado": "", "metodo": "", "resultado_mg_kg": null, "base": "seco", "incertidumbre": "" },
  "visibilidad": "restringido",              // publico | restringido
  "alerta": { "estado": "aprobada", "tipo": "aviso_cribado", "mensaje": "…", "aprobada_por": "…", "fecha": "…" },
  "demostracion": false
}
```

- Un control con valor `"falla"` deja la muestra como `invalido` (no se clasifica; se repite).
- Si falta `c_estimada_mg_kg`, la web lo recalcula con la fórmula cuando están todos los términos.
- CSV de exportación/importación: UTF-8 con BOM, coma, punto decimal, hora ISO; cabecera en `src/csv.js` (`COLUMNS`).

## Capas NASA (GIBS, WMS EPSG:4326, sin registro)

Verificadas el 2026-11-24 sobre los Yungas: `HLS_S30_Nadir_BRDF_Adjusted_Reflectance`, `HLS_L30_…`,
`Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual`, `IMERG_Precipitation_Rate`,
`VIIRS_SNPP_Thermal_Anomalies_375m_All` (sin fecha: los focos más recientes), `MODIS_Combined_Flood_2-Day`,
`SRTM_Color_Index`, `GPW_Population_Density_2020`. El mapa propio (Natural Earth, proyección lineal en lon/lat) pide
una imagen WMS del recuadro visible y la coloca exacta encima. Enlaces a NASA Worldview desde la ficha. Lluvia por
punto: NASA POWER (`PRECTOTCORR`, rotulado como «no es IMERG»).

## Estructura

```
src/
  model.js          semáforo, certeza, cálculo C_sed/C_pez, cola, cuenca, indicadores, alertas, zona pública
  data/demo.js      muestras, cuenca, comunidades y frentes ficticios
  data.js, store.js origen de datos (demostración / servidor) y copia local en IndexedDB
  cloud.js          API del Servidor Ahgora (x-ahg-key)
  csv.js            CSV, GeoJSON, versión pública
  geo/apis.js       capas NASA GIBS y NASA POWER
  components/, views/
scripts/
  build-map.mjs (mapa base) · deploy-pages.mjs (GitHub Pages)
```

## Pendiente

- Acceso por rol con usuario y contraseña (hoy el servidor se protege con la clave del equipo).
- Eje de cuenca real (trazado con SRTM), comunidades y población del sitio piloto (hoy solo en demostración).
- Criterios de cribado finales por matriz con el laboratorio aliado y las autoridades (6.3).
- Repetir la auditoría de accesibilidad (axe) sobre las vistas nuevas.

## Fuentes y licencias

Mapa base: Natural Earth (dominio público) y ETOPO1, NOAA. Capas: NASA GIBS (HLS, Landsat WELD, GPM IMERG, FIRMS,
LANCE, SRTM, SEDAC GPW) y NASA POWER. Tipografía: Atkinson Hyperlegible (SIL OFL).
