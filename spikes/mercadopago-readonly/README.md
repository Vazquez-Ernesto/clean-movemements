# Spike: Mercado Pago de solo lectura (Fase 2)

Herramienta descartable para **verificar con tu propia cuenta** qué movimientos de una cuenta personal de Mercado Pago se pueden leer por API. **No es código de producto**: solo produce evidencia para [`docs/INTEGRATIONS_ASSESSMENT.md`](../../docs/INTEGRATIONS_ASSESSMENT.md).

- Contexto: Binance (D-02) está en pausa porque no hay acceso a la cuenta; Mercado Pago es la candidata para la integración que se implemente primero.
- Requisitos: Node.js 20.6 o superior. **Sin dependencias**: no hace falta `npm install`.

## Alcance: parte A ahora, parte B después

| Parte | Pregunta | Cómo | Estado |
|---|---|---|---|
| **A** | ¿Qué movimientos de una cuenta **personal** se pueden leer y con qué calidad? | Con el *Access Token* de producción de una aplicación **tuya**, que da acceso a **tu** cuenta | Este spike |
| **B** | ¿Puede **otra persona** (p. ej. otro integrante de la familia) autorizar la app con OAuth? ¿Con qué permisos y por cuánto tiempo? | Flujo OAuth con PKCE | Pendiente: Mercado Pago exige una URL de redirección **HTTPS y fija**, y probablemente no acepta `localhost`. Hay que decidir dónde alojarla |

> **Importante para el producto:** el token de la parte A sirve solo porque es tu propia cuenta. El producto **nunca** le va a pedir a un usuario que pegue su Access Token: usará OAuth (parte B).

## Qué verifica

| # | Verificación | Lo que dice la documentación | Por qué importa |
|---|---|---|---|
| 1 | Búsqueda de pagos (`GET /v1/payments/search`) | Hasta 50 por página, `offset` hasta 10.000, últimos 12 meses, filtro por `range`, `begin_date` y `end_date` | ¿Muestra lo que **pagaste** o solo lo que **cobraste**? ¿Incluye transferencias, QR, servicios? |
| 2 | Pedir 51 por página | Máximo 50 | Saber si la API rechaza o recorta en silencio (prueba de borde) |
| 3 | Reporte "Todas las transacciones" (`/v1/account/settlement_report`) | Asincrónico: crear → aparece en `/list` → descargar CSV o XLSX. Período máximo de 60 días | Columnas, tipos de transacción, formato de importes y fechas, identificadores |
| 4 | Reporte "Liquidaciones" (`/v1/account/release_report`) | Igual que el anterior | Ídem |
| 5 | Lectura repetida | — | ¿Los mismos pagos devuelven los mismos ids? (base para no duplicar movimientos) |

No hay un endpoint documentado para consultar el **saldo**: el saldo se obtiene de los reportes. El spike no prueba endpoints no documentados.

## Garantías de seguridad

- **Lista cerrada de operaciones** (`src/client.js`): búsqueda de pagos, consulta de configuración y lista de reportes, creación y descarga de reportes. Cualquier otra operación (cobrar, devolver, cambiar configuraciones) se rechaza antes de salir a la red.
- **Único efecto en tu cuenta:** se crean hasta 2 reportes (como si los pidieras desde el panel). No se mueve dinero ni se cambia ninguna configuración.
- **Token de prueba (`TEST-`)**: el spike se detiene sin llamar a la API, porque los reportes de cuentas de prueba salen vacíos.
- **Se detiene ante un límite de la API** (HTTP 429).
- **El reporte no contiene** importes, nombres, correos, documentos, descripciones, referencias externas, ids de pagos, nombres de archivos ni el token. Sí contiene: nombres de campos y columnas, categorías técnicas (`operation_type`, `TRANSACTION_TYPE`, moneda, medio de pago), cantidades, rangos de fechas (solo el día) y formatos (p. ej. `dddd-dd-ddTdd:dd:dd`).

Todo esto está cubierto por pruebas (`npm test`): 34 pruebas contra un Mercado Pago simulado que planta correos, DNI, nombres e importes "trampa" y verifica que no aparezcan en el reporte.

## Cómo ejecutarlo

### 1. Obtener el Access Token de producción

> Los menús cambian; si algo no coincide, guiate por la [documentación de credenciales](https://www.mercadopago.com.ar/developers/es/docs/your-integrations/credentials).

1. Entrá a [Mercado Pago Developers](https://www.mercadopago.com.ar/developers) con tu cuenta y abrí **Tus integraciones**.
2. Creá una aplicación. Si el formulario pide un tipo de integración o datos del negocio, elegí lo más simple y **anotá qué te pidió**: es un hallazgo (¿una cuenta personal puede crear una aplicación sin ser comercio?).
3. En la aplicación, abrí **Credenciales de producción** y copiá el **Access Token** (empieza con `APP_USR-`). Si para verlas tenés que "activar" credenciales con datos del negocio, anotalo también.

⚠️ Ese token da acceso a tu cuenta. El spike solo lo usa para leer, pero **no lo pegues en ningún chat ni lo subas a ningún lado**.

### 2. Configurar y ejecutar

```bash
cd spikes/mercadopago-readonly
cp .env.example .env      # en Windows: copy .env.example .env
# Editá .env y completá MP_ACCESS_TOKEN (y MP_USER_ID si lo tenés)
npm test                  # opcional: valida la herramienta sin conectarse a Mercado Pago
npm start
```

Tarda unos minutos, porque espera a que Mercado Pago genere los reportes (consulta cada 15 s, hasta 10 min por reporte). El código de salida es `0` si terminó, `2` si abortó (por ejemplo, con un token de prueba) y `64` si falta configuración.

| Variable | Por defecto | Uso |
|---|---|---|
| `MP_USER_ID` | — | Tu número de usuario. Permite saber cuántos pagos recibiste y cuántos hiciste vos. No aparece en el reporte |
| `SPIKE_SEARCH_DAYS` | `60` | Días de pagos a buscar (1 a 365) |
| `SPIKE_REPORT_DAYS` | `30` | Días que cubre cada reporte (1 a 60) |
| `SPIKE_REPORTS` | `settlement,release` | Reportes a generar; vacío para no generar ninguno |
| `SPIKE_POLL_SECONDS` | `15` | Intervalo entre consultas a la lista de reportes |
| `SPIKE_REPORT_TIMEOUT_MINUTES` | `10` | Espera máxima por reporte |
| `SPIKE_MAX_SEARCH_PAGES` | `20` | Páginas de 50 pagos como máximo |

### 3. Comparar con tu actividad real (la parte más importante)

El spike sabe qué devolvió la API, pero no sabe qué hiciste vos en ese período. Abrí la app de Mercado Pago, mirá tu actividad de los mismos días y completá esta tabla al compartir el reporte:

| Tipo de actividad | ¿Hiciste alguna en el período? | ¿Aparece en la búsqueda de pagos? (`operation_type`, `payment_method_id`) | ¿Aparece en "Todas las transacciones"? (`TRANSACTION_TYPE`) |
|---|---|---|---|
| Transferencia enviada a otra persona o CVU | | | |
| Transferencia recibida | | | |
| Ingreso de dinero desde un banco | | | |
| Retiro a un banco | | | |
| Pago con QR en un comercio | | | |
| Compra con tarjeta (de Mercado Pago u otra) | | | |
| Pago de servicios o recargas | | | |
| Rendimientos de la cuenta | | | |
| Cobro como vendedor (si aplica) | | | |

Si te resulta más fácil, alcanza con decir: "hice X transferencias y Y pagos con QR en esos días" y comparamos con las cantidades del reporte.

### 4. Compartir y limpiar

- El reporte queda en `out/mercadopago-spike-<fecha>.md` (y `.json`). `out/` no se sube al repositorio.
- **Leelo antes de compartirlo** y borrá lo que te parezca sensible.
- Al terminar, borrá el `.env`. Si el panel lo permite, renová las credenciales o eliminá la aplicación de prueba.

## Limitaciones conocidas

- No prueba OAuth (parte B).
- No analiza reportes XLSX (solo los detecta). Si el reporte sale en XLSX y se puede cambiar a CSV en la configuración del panel, conviene repetir.
- La búsqueda de pagos no incluye movimientos que Mercado Pago no modele como "pagos" (por ejemplo, rendimientos o ciertos ingresos). Por eso se cruza con el reporte y con la tabla del paso 3.
- Las columnas del CSV del Mercado Pago simulado son **inventadas** para probar el analizador; no documentan el formato real.

## Estructura

```
src/client.js    Cliente HTTP con lista cerrada de operaciones
src/analyze.js   Funciones puras: análisis de pagos, parser y análisis de CSV
src/spike.js     Orquestación (búsqueda, reportes asincrónicos, estabilidad)
src/report.js    Reporte en Markdown
src/main.js      Configuración y escritura del reporte
test/            Pruebas unitarias y de punta a punta contra un Mercado Pago falso
```
