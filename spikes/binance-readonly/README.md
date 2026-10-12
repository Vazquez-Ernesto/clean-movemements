# Spike: Binance de solo lectura (Fase 2)

Herramienta descartable para **verificar con una cuenta real** lo que la documentación de Binance dice sobre la lectura de saldos y movimientos. **No es código de producto**: no se reutiliza en el backend (que será Java), solo produce evidencia para [`docs/INTEGRATIONS_ASSESSMENT.md`](../../docs/INTEGRATIONS_ASSESSMENT.md).

- Decisión que la origina: D-02 (Binance como primera integración), aprobada el 2026-10-12.
- **Estado: ⏸️ en pausa** (sin acceso a la cuenta por ahora). La herramienta está lista y probada para cuando se retome.
- Requisitos: Node.js 20.6 o superior. **Sin dependencias**: no hace falta `npm install`.

## Qué verifica

| # | Verificación | Hipótesis de la documentación | Por qué importa para el producto |
|---|---|---|---|
| 1 | Reloj | Las solicitudes firmadas exigen un `timestamp` dentro de `recvWindow` | Diseño del cliente |
| 2 | Permisos de la key (`/sapi/v1/account/apiRestrictions`) | El endpoint informa los permisos de la key | Rechazar keys con escritura (PRD FR-IN-04) |
| 3 | Saldos spot (`/api/v3/account`) | Devuelve saldos por activo como texto decimal | Modelo multiactivo, precisión |
| 4 | Activos del usuario (`/sapi/v3/asset/getUserAsset`) | Mencionado en el *changelog*; parámetros no verificados | Saber si cubre más que spot |
| 5 | Depósitos (`/sapi/v1/capital/deposit/hisrec`) | Ventanas de menos de 90 días, hasta 1000 por página | Sincronización inicial e incremental |
| 6 | Retiros (`/sapi/v1/capital/withdraw/history`) | Igual que depósitos | Ídem |
| 7 | Descubrimiento de pares | `myTrades` exige indicar el par: no hay forma de listar "todos mis trades" | Costo de la sincronización inicial |
| 8 | Trades (`/api/v3/myTrades`) por `fromId` | Se puede recorrer todo el historial de un par | Ventana histórica disponible |
| 9 | Prueba negativa de 48 h en `myTrades` | Rechaza más de 24 h entre `startTime` y `endTime` | Confirmar el límite documentado |
| 10 | Convert (`/sapi/v1/convert/tradeFlow`) | Ventanas de 30 días; **endpoint no verificado en la investigación** | Las conversiones son movimientos frecuentes |
| 11 | Lecturas repetidas | La misma consulta devuelve los mismos identificadores | Deduplicación e idempotencia (AC-05) |

Para cada conjunto de datos, el reporte indica qué campos sirven como **identificador externo** (únicos y siempre presentes), cuántos decimales tienen los importes, si algún importe llega como número JSON en vez de texto (riesgo de precisión), las redes y los estados observados, y el rango de fechas disponible.

## Garantías de seguridad

- **Lista cerrada de endpoints de lectura** (`src/client.js`): cualquier otro endpoint (órdenes, retiros, transferencias) se rechaza antes de salir a la red, aunque la key tuviera permisos para hacerlo.
- **Abortar si la key no es de solo lectura**: si Binance informa cualquier permiso de escritura (incluso uno que no conozcamos), el spike se detiene sin leer saldos ni movimientos.
- **Se detiene ante un límite de la API** (HTTP 429 o 418) en lugar de insistir.
- **La key y el secret** se leen de `.env`, que está en `.gitignore`. No se escriben en logs ni en el reporte.
- **El reporte no contiene** importes, saldos, direcciones, txIds ni identificadores de operaciones. Sí contiene: códigos de activos, redes, estados, cantidades de registros, rangos de fechas (solo el día) y nombres de campos.

Todo esto está cubierto por pruebas automatizadas (`npm test`): 34 pruebas, incluida una que busca en el reporte valores sensibles plantados en los datos de prueba.

## Cómo ejecutarlo

### 1. Crear una API key de solo lectura en Binance

> Los menús de Binance cambian; si algo no coincide, guiate por su [FAQ de API keys](https://www.binance.com/en/support/faq/360002502072).

1. En Binance, entrá a **Gestión de API** (*API Management*) desde tu perfil.
2. Creá una key de tipo **generada por el sistema** (HMAC). El spike no soporta keys Ed25519 ni RSA.
3. En los permisos dejá **solo "Habilitar lectura"** (*Enable Reading*). **No** habilites trading, retiros, transferencias, margen ni futuros.
4. Restricción de IP: lo más seguro es restringirla a tu IP pública actual. Si la dejás sin restricción, Binance solo permite que tenga permiso de lectura.
5. Copiá la **API key** y el **secret**. El secret se muestra una sola vez.

### 2. Configurar y ejecutar

```bash
cd spikes/binance-readonly
cp .env.example .env      # en Windows: copy .env.example .env
# Editá .env y completá BINANCE_API_KEY y BINANCE_API_SECRET
npm test                  # opcional: valida la herramienta sin conectarse a Binance
npm start
```

Tarda alrededor de un minuto (hace pausas entre solicitudes para no acercarse a los límites). El código de salida es `0` si terminó, `2` si abortó por los permisos de la key y `64` si falta configuración.

Variables opcionales en `.env`:

| Variable | Por defecto | Uso |
|---|---|---|
| `SPIKE_LOOKBACK_DAYS` | `90` | Días de depósitos, retiros y Convert a consultar (1 a 365) |
| `SPIKE_SYMBOLS` | (se deducen) | Pares para `myTrades`, separados por coma, p. ej. `BTCUSDT,USDTARS`. Útil si sabés qué pares operaste |
| `SPIKE_MAX_SYMBOLS` | `30` | Máximo de pares deducidos a consultar |
| `SPIKE_MAX_TRADE_PAGES` | `20` | Máximo de páginas de 1000 trades por par |

### 3. Revisar y compartir el resultado

- El reporte queda en `out/binance-spike-<fecha>.md` (y `.json`). La carpeta `out/` no se sube al repositorio.
- **Leelo antes de compartirlo.** Si algo te parece sensible, borralo.
- Compartí el `.md` en la conversación para actualizar la matriz de integraciones y el modelo de dominio.

### 4. Al terminar

**Eliminá la API key en Binance** y borrá el archivo `.env`. El spike no la necesita más.

## Limitaciones conocidas

- Cubre **spot**, depósitos, retiros y Convert. **No** cubre P2P, Binance Pay, la billetera Funding, Earn, Futures, Margin ni la tarjeta. Los pagos P2P y Binance Pay pueden ser frecuentes en Argentina: si los usás, anotalo al compartir el reporte, porque quedarían fuera de la primera integración.
- Los pares se deducen de los activos que tenés o que depositaste o retiraste. Un par con un activo que ya no tenés y que nunca depositaste puede no detectarse; para esos casos usá `SPIKE_SYMBOLS`.
- Los pares deslistados no aparecen en `exchangeInfo` y no se consultan.
- Se asume que las fechas en texto de los retiros (`applyTime`) están en UTC; el spike no puede confirmarlo.

## Estructura

```
src/client.js    Cliente HTTP firmado con lista cerrada de endpoints
src/analyze.js   Funciones puras: ventanas, permisos, análisis sin valores sensibles
src/spike.js     Orquestación de las verificaciones y observaciones
src/report.js    Reporte en Markdown
src/main.js      Lectura de configuración y escritura del reporte
test/            Pruebas unitarias y de punta a punta contra un Binance falso
                 que verifica firmas y aplica los límites documentados
```
