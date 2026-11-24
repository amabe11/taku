# Hg-Guard · Fuentes abiertas, sensores y APIs

Referencia técnica del desafío ORO-4.1 de Gold4Good. El dispositivo físico es el centro del proyecto. La estación registra **turbidez relativa y temperatura**. Las imágenes y los mapas aportan **contexto territorial**. Una concentración de mercurio requiere un **resultado analítico específico, identificado por muestra y matriz**.

El sitio piloto está por definir. Alcoche–Caranavi es un antecedente. El área de interés se define cuando haya un tramo candidato, datos verificables y un acuerdo de acceso. Para la demo, `DEMO-01` identifica corridas simuladas o de banco según su origen, y cualquier imagen de otro lugar se presenta como **Ejemplo satelital** con su fuente y fecha.

## 1. Datos satelitales y cartográficos

| Prioridad | Fuente y producto | Dato que nos importa | Acceso |
| --- | --- | --- | --- |
| Principal para contexto | **Copernicus Sentinel-2 L2A**, 10 m para RGB e infrarrojo cercano | Comparación antes/después de la ribera, la cobertura vegetal y las superficies visibles del cauce. | [Earth Search STAC v1, colección `sentinel-2-c1-l2a`](https://earth-search.aws.element84.com/v1/collections/sentinel-2-c1-l2a) |
| Opcional para lluvia | **NASA GPM IMERG Early Run diario V07**, `GPM_3IMERGDE`, 0,1° (~10 km) | Precipitación regional estimada en los días previos a una corrida. Da contexto a una señal alta de turbidez. | [NASA GES DISC](https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDE_07/summary) · [NASA CMR](https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html) |
| Opcional para más fechas | **NASA HLS v2**, `HLSL30` y `HLSS30`, 30 m | Serie de reflectancia armonizada de Landsat y Sentinel-2. Sirve si necesitamos ampliar el historial regional. | [NASA HLS](https://www.earthdata.nasa.gov/s3fs-public/2022-05/SNWG_HLSFactSheet_0.pdf) · [NASA CMR](https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html) |
| Opcional para relieve | **NASA SRTMGL1 v003**, ~30 m, o **Copernicus DEM GLO-30**, 30 m | Elevación, pendiente y dirección aproximada de drenaje. Elegir un solo producto si la pregunta requiere relieve. | [NASA SRTM](https://www.earthdata.nasa.gov/s3fs-public/2025-05/SRTM_Quick_Guide.pdf) · [Copernicus GLO-30 en Earth Search](https://earth-search.aws.element84.com/v1/collections/cop-dem-glo-30) |
| Referencia territorial | **CEDIB**, mapas de minería en áreas protegidas y territorios indígenas | Contexto de superposiciones y categorías mineras. Leer la leyenda de cada mapa y verificar vigencia en una fuente oficial. | [Áreas protegidas](https://www.cedib.org/biblioteca/situacion-de-la-mineria-en-bolivia-en-areas-protegidas/) · [Territorios indígenas](https://www.cedib.org/biblioteca/situacion-de-la-mineria-en-bolivia-en-territorios-indigenas/) · [AJAM](https://autoridadminera.gob.bo/) |

Sentinel-2 muestra reflectancia y cambios observables en superficie. Los cauces estrechos pueden quedar mezclados con orillas y vegetación en un mismo píxel. IMERG representa lluvia regional estimada, con resolución insuficiente para atribuir un valor a una parcela o usarlo como lectura de pluviómetro. Los mapas de CEDIB y el catastro aportan contexto territorial. La atribución de un hallazgo a una operación exige evidencia específica. [Especificación Sentinel-2](https://sentiwiki.copernicus.eu/web/s2-products) · [NASA IMERG](https://gpm.nasa.gov/data/imerg)

Un **dron multispectral** es una extensión de campo para observar riberas y cambios superficiales con mayor detalle. Sus imágenes serían datos propios o cedidos, con acceso según el acuerdo territorial. Evaluarlo cuando haya un objetivo concreto, un sitio acordado y un operador habilitado según el caso. [DGAC Bolivia](https://www.dgac.gob.bo/drones/)

## 2. APIs para el módulo satelital

### API principal · Earth Search STAC v1

`POST https://earth-search.aws.element84.com/v1/search` con `collections: ["sentinel-2-c1-l2a"]`, `bbox: [oeste, sur, este, norte]` en longitud y latitud WGS84, y `datetime` como intervalo UTC `inicio/fin`. Las coordenadas salen del área seleccionada. La respuesta contiene escenas en `features`, con su `id`, fecha y activos descargables. [Documentación de Earth Search](https://github.com/Element84/earth-search/blob/main/README.md) · [Sentinel-2 Collection 1](https://github.com/Element84/earth-search/blob/main/docs/collections/sentinel-2-l2a.md)

| Dato | Activos STAC | Resolución | Uso |
| --- | --- | --- | --- |
| Color real | `red` (B04), `green` (B03), `blue` (B02) | 10 m | Dos recortes de la misma extensión, con el mismo criterio de visualización. |
| Vegetación | `nir` (B08) y `red` (B04) | 10 m | `NDVI = (B08 - B04) / (B08 + B04)` con reflectancia y píxeles válidos. |
| Calidad | `scl` (Scene Classification Layer) | 20 m | Excluir nubes, sombras de nube y datos faltantes. Revisar cobertura válida en el tramo para ambas fechas. |

1. Delimitar el tramo y buscar dos fechas de época comparable. `eo:cloud_cover` sirve para preseleccionar escenas. Verificar el tramo con `scl` y la imagen en color real.
2. Descargar o leer los GeoTIFF desde `assets.<clave>.href`. Recortar con QGIS o Python y, para NDVI, aplicar la escala y el desplazamiento que indique el producto. Alinear ambos recortes y usar la cobertura válida común.
3. Guardar las dos imágenes presentables con sus límites geográficos y un `manifest.json`. Campos mínimos recomendados `provider`, `collection`, `scene_id`, `acquired_at_utc`, `bounds_wgs84`, `pixel_size_m`, `valid_overlap_pct` e `is_reference_example`.
4. Para una demo sin internet, abrir los archivos precargados en el portátil. La web de la estación sigue funcionando por Wi-Fi local. El repositorio prevé cargar la comparación como módulo complementario con internet y actualmente muestra un escenario futuro. [README de la web](web/README.md#módulo-complementario-con-internet)

**Respaldo de catálogo:** Copernicus Data Space Ecosystem ofrece STAC en `https://stac.dataspace.copernicus.eu/v1/`, colección `sentinel-2-l2a`. Consultar los requisitos de acceso al archivo del proveedor si se usa ese catálogo. [STAC de Copernicus Data Space](https://documentation.dataspace.copernicus.eu/APIs/STAC.html)

### API opcional · NASA Earthdata CMR

- **IMERG diario:** `GET https://cmr.earthdata.nasa.gov/search/granules.json` con `short_name=GPM_3IMERGDE`, `version=07` y `temporal=inicio,fin` en UTC. CMR encuentra los gránulos. `earthaccess` permite descargar los archivos con Earthdata Login cuando corresponda. Para Hg-Guard, guardar la lluvia regional de hasta tres días completos anteriores a la corrida, con fecha, resolución, variable y unidad del producto. [NASA CMR](https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html) · [Acceso NASA Earthdata](https://urs.earthdata.nasa.gov/documentation/for_users/data_access) · [Producto diario](https://data.nasa.gov/dataset/gpm-imerg-early-precipitation-l3-1-day-0-1-degree-x-0-1-degree-v07-gpm-3imergde-at-ges-dis-6443f)
- **HLS o SRTM:** usar el mismo catálogo CMR si surge una pregunta concreta sobre historial de cobertura o relieve. Si se elige GLO-30, usar la misma API Earth Search de la capa principal con `collections: ["cop-dem-glo-30"]`. [Catálogo Earth Search](https://github.com/Element84/earth-search/blob/main/README.md)

## 3. Prototipo físico y documentación abierta

Los fabricantes publican las fichas de los componentes. Las lecturas son datos generados por el equipo y se guardan en la estación o el navegador durante la corrida.

| Componente | Uso y unidad | Conexión de referencia | Estado |
| --- | --- | --- | --- |
| **ESP32 DevKitC V4 / WROOM** | Control de adquisición y servidor web por Wi-Fi local. | USB para la placa. `GPIO21` SDA, `GPIO22` SCL, `GPIO25` OneWire. | Base. [Espressif DevKitC](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html) |
| **DFRobot SEN0189** | Turbidez relativa. El valor que registra la web es el voltaje `adc_mv` medido en A0 después del divisor. | SEN0189 a **5 V regulados**, tierra común. `AO → 10 kΩ → nodo → 15 kΩ → GND`. Nodo a `A0` del ADS1115. Con AO de 4,5 V, el nodo queda cerca de 2,70 V. | Base. Registrar mV hasta contar con calibración documentada para NTU. [DFRobot](https://wiki.dfrobot.com/sen0189) |
| **ADS1115** | Digitaliza la señal del SEN0189. | `VDD → 3V3`, `ADDR → GND`, I²C `0x48`, SDA `GPIO21`, SCL `GPIO22`. | Base. Medir el nodo del divisor respecto a tierra antes de conectarlo a A0. [Texas Instruments](https://www.ti.com/product/ADS1115) |
| **DS18B20** | Temperatura `temp_c` en °C. | Tres hilos. `VDD → 3V3`, `GND → GND`, `DQ → GPIO25` con `4,7 kΩ` entre DQ y 3V3. | Base. [Analog Devices](https://www.analog.com/en/products/DS18B20.html) |
| **TCS34725 o AS7341** | Cuentas ópticas RGB+C o cuentas por banda para una cámara oscura independiente. | Comparte SDA/SCL con ADS1115. TCS34725 `0x29`. AS7341 `0x39` en breakout compatible con lógica de 3,3 V. Verificar alimentación y resistencias de pull-up del modelo. | Ampliación de banco. Elegir un lector según la banda, la geometría y el rango requeridos. [TCS34725](https://ams-osram.com/products/sensor-solutions/ambient-light-color-spectral-proximity-sensors/ams-tcs34725-color-sensor) · [AS7341](https://ams-osram.com/products/sensor-solutions/ambient-light-color-spectral-proximity-sensors/ams-as7341-11-channel-spectral-color-sensor) |

El **pH** se discutió como variable adicional del agua. Si se agrega más adelante, requiere una sonda calibrada y se registra como parámetro independiente. La guía base controla el volumen con una marca o recipiente graduado y guarda la corrida en el navegador, por lo que la microSD y la celda de carga quedan fuera del montaje base.

### Qué pedirle al laboratorio para el lector óptico

En banco, usar blancos y patrones inocuos para revisar repetibilidad, saturación y deriva. El resultado es **lectura óptica de banco**, con las cuentas por canal, la ganancia, el tiempo de integración y los controles registrados. La especificidad para Hg depende de un ensayo validado en la matriz que se quiere analizar.

Pedir al laboratorio una respuesta por escrito sobre estos puntos:

1. **Analito y matriz.** Qué método ofrecen y qué determina exactamente en agua, extracto o sedimento. Para sedimento, pedir unidad y base de reporte, por ejemplo `mg/kg` en base seca, cuando corresponda.
2. **Compatibilidad óptica.** Geometría, longitud de onda o banda, iluminación, cubeta, tiempo de lectura y tolerancia a señales débiles. Pedir un dictamen sobre TCS34725, AS7341 o instrumento dedicado.
3. **Desempeño y controles.** Rango, límites de detección y cuantificación en esa matriz, recuperación, precisión, incertidumbre, interferencias, blancos, duplicados y criterios de aceptación.
4. **Comparación independiente.** Método validado para Hg total en sedimento, disponibilidad de comparación por pares, requisitos de recepción y custodia, formato de respuesta por `id_muestra`, costo y plazo. [EPA 7473, método de referencia a consultar](https://www.epa.gov/hw-sw846/sw-846-test-method-7473-mercury-solids-and-solutions-thermal-decomposition-amalgamation)

## 4. API y datos propios de la estación

| Ruta HTTP local | Datos principales |
| --- | --- |
| `GET /api/status` | Versión del firmware `build`, configuración `config_id`, `sensor_ok`, `estado` y `run_id`. |
| `POST /api/run` | Recibe `id_muestra`, `id_caso`, `volumen_ml`, `volumen_confirmado` y `fecha_iso`. Devuelve `run_id` y estado. |
| `GET /api/run?from=<seq>` | Retorna filas desde la secuencia indicada. Cada fila incluye `seq`, `t_seg`, `adc_mv`, `temp_c` y `motivo`. |

El contrato prevé 121 filas (0 a 120 s) y usa `null` con motivo para un valor inválido. La web guarda la corrida en IndexedDB y exporta CSV. El repositorio incluye un simulador del ESP32 para verificar el flujo. El campo de origen distingue una corrida real de una simulada. [Contrato de API y exportación](web/README.md)

Guardar `id_caso`, `id_muestra`, `run_id` y fecha UTC en las fichas correspondientes. Asociar las escenas por área y fecha, y el resultado de laboratorio por `id_muestra` y matriz. Mantener la turbidez en mV, la temperatura en °C y el resultado de Hg con la unidad, base y método del informe. Cuando falta evidencia analítica, mostrar **Hg pendiente de laboratorio**.

Los productos satelitales, los catálogos y las fichas citadas tienen acceso público conforme a sus condiciones. Las corridas, contactos, coordenadas precisas y resultados cedidos manejan permisos de uso propios. Para una eventual publicación o remisión institucional, preparar una ficha revisada con fuente, método, fecha, alcance y ubicación con el detalle autorizado.

## 5. Prioridad para la entrega

1. **Dispositivo y web local.** Mostrar una corrida trazable, su gráfica y el CSV desde el ESP32. Identificar el material de prueba y el origen de los datos.
2. **Contexto satelital demostrable.** Mostrar dos recortes Sentinel-2 precargados con fechas y fuente, si hay un ejemplo adecuado. Sin imágenes comparables, usar el esquema del tramo con la etiqueta de escenario futuro.
3. **Ampliaciones condicionadas.** NDVI si el RGB ya está listo, IMERG si aporta contexto sobre lluvia y módulo óptico si está disponible para una prueba de banco. El análisis de Hg y un eventual vuelo de dron se incorporan cuando haya condiciones para realizarlos.

Base interna de consulta [Guía integrada ORO-4.1](<output/pdf/Hg-Guard - Guía integrada y revisión de laboratorio ORO-4.1.pdf>) y [documentación de la web de la estación](web/README.md).
