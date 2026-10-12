# Evaluación de integraciones con entidades financieras

| Campo | Valor |
|---|---|
| Estado | Investigación inicial: requiere verificación directa antes de implementar |
| Fecha de verificación | 2026-10-12 |
| Relacionado | [PRD.md](PRD.md) §5.C y §5.D · [DECISIONS.md](DECISIONS.md) D-02 |

## 1. Cómo leer este documento

### 1.1 Limitación de la investigación (importante)

La política de red del entorno donde se hizo esta investigación **bloqueó el acceso directo** a los sitios de los proveedores (binance.com, mercadopago.com.ar, astropay.com, bcra.gob.ar: el proxy respondió `403` a la conexión). La única herramienta disponible fue un **buscador web** restringido a dominios oficiales, que devuelve resúmenes del contenido indexado de esas páginas.

Por eso, para cada dato se indica el **tipo de evidencia**:

| Código | Significado | Confiabilidad |
|---|---|---|
| **DOC-IDX** | Página oficial del proveedor, leída a través del índice del buscador (no de forma directa) | Media: hay que releer la página antes de implementar |
| **DOC-DIR** | Página oficial leída de forma directa | Alta. **Ningún dato de este documento tiene todavía esta evidencia** |
| **PRUEBA** | Verificado con una cuenta real en un *spike* técnico | Muy alta. Ninguno todavía |
| **PRENSA** | Medio periodístico o sitio de terceros | Baja: solo para orientar |
| **—** | Sin evidencia | — |

### 1.2 Estados

| Estado | Criterio usado |
|---|---|
| **Verificado** | La capacidad para cuentas personales está documentada oficialmente **y** fue probada (PRUEBA). Ninguna entidad está todavía en este estado. |
| **Parcial** | Existe un mecanismo oficial documentado que parece aplicable, pero falta probarlo o confirmar que sirve para cuentas personales o que los términos de uso lo permiten. |
| **No disponible** | La documentación oficial indica que el mecanismo **no** está disponible para cuentas personales. |
| **Pendiente de investigación** | No se encontró evidencia oficial suficiente en ningún sentido. |

### 1.3 Reglas que aplican a todas las entidades

- No se usa *scraping* de home banking ni de aplicaciones.
- No se piden contraseñas, códigos OTP, tokens de segundo factor, frases semilla ni claves privadas.
- Solo lectura. Ninguna integración del MVP solicita permisos para mover fondos (PRD FR-SY-17).
- Toda entidad tiene una alternativa: **importación de archivos** (CSV) y **carga manual** (PRD FR-IN-05).
- No se inventan endpoints, permisos, precios ni disponibilidad. Lo que no se pudo verificar figura como "no verificado".

---

## 2. Resumen

| Proveedor | Tipo | Mecanismo oficial encontrado | ¿Para cuentas personales? | Estado | Próxima acción |
|---|---|---|---|---|---|
| **Binance** | Exchange cripto | API REST con API key firmada; permisos configurables (lectura por defecto) | Sí: la API key la genera el propio usuario | **Parcial** | ⏸️ En pausa (sin acceso a la cuenta). El *spike* `spikes/binance-readonly/` está listo para cuando haya acceso |
| **Mercado Pago** | Billetera / PSP | OAuth para terceros y API de reportes ("Todas las transacciones", "Liquidaciones") | Incierto: está orientado a vendedores e integradores | **Parcial** | Ejecutar el *spike* `spikes/mercadopago-readonly/` (parte A) con la cuenta del usuario |
| **Galicia** | Banco | "Open Galicia": APIs para **empresas** clientes con Office Banking | **No**, según la página oficial | **No disponible** | CSV de extractos; seguir el Sistema de Finanzas Abiertas |
| **Santander** | Banco | No se encontró un portal de APIs para personas. Getnet (cobros) es para comercios | Sin evidencia | **Pendiente** | Confirmar con el banco; CSV |
| **Naranja X** | Billetera / tarjeta | Existe `developers.naranjax.com`; contenido no verificado; la evidencia apunta a soluciones para comercios | Sin evidencia | **Pendiente** | Leer el portal; CSV |
| **Personal Pay** | Billetera | `developers.personalpay.com.ar`: plataforma de **cobros** (Checkout API, BNPL, QR) | Sin evidencia | **Pendiente** | Leer el portal; CSV |
| **AstroPay** | Billetera | `developers.astropay.com`: APIs para **comercios** (pagos, pagos a terceros, reportes del comercio) | Sin evidencia de API para la billetera personal | **Pendiente** | Confirmar si existe acceso para usuarios; CSV |

**Conclusión:** con la evidencia actual, **Binance** es la única entidad con un mecanismo documentado y claramente utilizable por una persona para leer sus propios datos con permisos mínimos. **Mercado Pago** es la segunda candidata, pero su API de reportes está pensada para vendedores y hay que confirmar que sirve para una cuenta personal y que los términos lo permiten. Los bancos no ofrecen hoy una vía programática para personas: la importación de archivos es la vía principal, y el **Sistema de Finanzas Abiertas** del BCRA es la vía regulada a mediano plazo.

---

## 3. Contexto regulatorio: Sistema de Finanzas Abiertas (SFA)

| Campo | Contenido | Evidencia |
|---|---|---|
| Norma | Decreto 353/2025, publicado en el Boletín Oficial el 23/05/2025. Crea el Sistema de Finanzas Abiertas. | DOC-IDX ([Boletín Oficial](https://www.boletinoficial.gob.ar/detalleAviso/primera/325767/20250523), [argentina.gob.ar](https://www.argentina.gob.ar/normativa/nacional/norma-413071/texto)) |
| Propósito | Que personas humanas y jurídicas compartan sus datos con entidades registradas, con su consentimiento expreso (art. 5). | DOC-IDX |
| Autoridad | BCRA como autoridad de aplicación; define parámetros, estándares y requisitos de participación (art. 6). | DOC-IDX |
| Estado | El documento de objetivos y planes 2026 del BCRA indica que se seguirá avanzando en la implementación, con la formación de grupos técnicos para diseñar la infraestructura. | DOC-IDX ([BCRA, objetivos 2026](https://www.bcra.gob.ar/archivos/Pdfs/Institucional/objetivos-planes-bcra-2026.pdf)) |
| Calendario | Pruebas durante 2026 y lanzamiento masivo previsto para 2027; primer caso de uso: datos tributarios de ARCA. | PRENSA ([El Liberal, 10/2026](https://www.elliberal.com.ar/nota/94159/2026/10/open-finance-en-argentina--el-plan-del-bcra-para-compartir-datos-de-arca-y-potenciar-el-acceso-al-credito), [iProUP](https://www.iproup.com/finanzas/72141-open-finance-bcra-prepara-un-cambio-clave-para-el-credito-en-2027)) |
| No verificado | Estándares técnicos, mecanismo de consentimiento, requisitos para que una app como esta participe (registro ante el BCRA u otros) y si incluirá cuentas bancarias y billeteras en la primera etapa. | — |
| Impacto | Es la vía regulada más prometedora para los bancos. **El MVP no puede depender de ella.** | — |
| Próxima acción | Revisar trimestralmente las comunicaciones del BCRA; cuando se publiquen los estándares, evaluar los requisitos para participar. | — |

---

## 4. Matriz detallada por entidad

### 4.1 Binance

| Campo | Contenido | Evidencia |
|---|---|---|
| **Información necesaria** | Saldos por activo (spot y, más adelante, otros productos), historial de operaciones (*trades*), depósitos y retiros, conversiones. | — |
| **API oficial** | API REST de Binance (Spot y Wallet). Endpoints `USER_DATA` firmados. | DOC-IDX ([Account endpoints](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/account-endpoints)) |
| **Acceso para cuentas personales argentinas** | El usuario genera su API key desde su cuenta. Binance se inscribió en el registro de Proveedores de Servicios de Activos Virtuales (PSAV) de la CNV en octubre de 2024. **No se verificó** en el registro oficial de la CNV que siga vigente. | DOC-IDX ([cómo crear API keys](https://www.binance.com/en/support/faq/360002502072)); PRENSA ([Finextra](https://www.finextra.com/pressarticle/102583/binance-secures-registration-in-argentina)) |
| **Autenticación y permisos** | API key + firma por solicitud. Una key nueva tiene habilitada por defecto solo la lectura. El permiso de retiros exige restricción por IP. Las keys sin restricción de IP no pueden tener permisos más allá de la lectura. Existe un endpoint para consultar los permisos de la key, que devuelve indicadores como `enableWithdrawals`, además de otros para lectura, transferencias internas y trading. | DOC-IDX ([API Key Permission](https://developers.binance.com/docs/wallet/account/api-key-permission), [Quick start](https://developers.binance.com/docs/derivatives/quick-start), [FAQ](https://www.binance.com/en/support/faq/360002502072)) |
| **Lectura de saldos** | Sí: endpoint de información de cuenta (spot). El *changelog* menciona `POST /sapi/v3/asset/getUserAsset` para activos del usuario; **no se verificaron** sus parámetros. | DOC-IDX ([Wallet change log](https://developers.binance.com/docs/wallet/change-log)) |
| **Lectura de movimientos** | `GET /api/v3/myTrades`: requiere `symbol` (por par), máximo 24 h entre `startTime` y `endTime`, `limit` hasta 1000. `GET /sapi/v1/capital/deposit/hisrec` y `GET /sapi/v1/capital/withdraw/history`: ventanas de hasta 90 días, `limit` hasta 1000. **Implicación:** la sincronización inicial requiere muchas solicitudes por par y por tramo de fechas. No se evaluaron Convert, P2P, Earn ni Futures. | DOC-IDX ([Withdraw history](https://developers.binance.com/docs/wallet/capital/withdraw-history), [Deposit history](https://developers.binance.com/docs/wallet/capital/deposite-history)) |
| **Webhooks / incremental** | Existe un *User Data Stream* (tiempo real por conexión persistente); no se evaluó. La sincronización incremental es posible por tiempo o por `fromId`. | DOC-IDX ([User Data Stream](https://developers.binance.com/docs/binance-spot-api-docs/user-data-stream)) |
| **Límites, costos y requisitos** | Límites por "peso" de solicitud (p. ej. `myTrades` pesa 20, o 5 con `orderId`). No se encontraron costos por usar la API. Según un artículo de seguridad de Binance, las keys sin lista de IP que estén 30 días inactivas se eliminan; **verificar** si sigue vigente. | DOC-IDX ([blog de seguridad](https://www.binance.com/en/blog/security/how-to-use-an-api-key-securely-5-tips-from-binance-8638066848800196896)) |
| **Restricciones contractuales y riesgos** | Pendiente: revisar los términos sobre el uso de keys por aplicaciones de terceros. Riesgo: una key con más permisos que la lectura permitiría operar; se mitiga rechazando la key si sus permisos no son de solo lectura (PRD FR-IN-04). Restringir la key a la IP de salida del backend reduce el riesgo, pero exige una IP fija (impacto en infraestructura y costo). La API key y su secreto son credenciales: se guardan cifrados (ARCHITECTURE §6.3). | — |
| **Estado** | **Parcial** | |
| **Próxima acción** | Ejecutar el *spike* [`spikes/binance-readonly/`](../spikes/binance-readonly/README.md) con una key de solo lectura de una cuenta del equipo y volcar aquí su reporte. Revisar los términos de uso. | |
| **Spike** | ⏸️ **En pausa desde el 2026-10-12:** el usuario no tiene acceso a la cuenta de Binance por ahora. Construido el 2026-10-12 y probado contra un Binance simulado que verifica firmas y aplica los límites documentados. **Pendiente de ejecución con una cuenta real** (el entorno de la investigación no tiene acceso de red a Binance). Cubre permisos, saldos spot, depósitos, retiros, *trades*, Convert, el límite de 24 h y la estabilidad de identificadores; no cubre P2P, Binance Pay, Funding, Earn ni Futures. | — |

### 4.2 Mercado Pago

| Campo | Contenido | Evidencia |
|---|---|---|
| **Información necesaria** | Saldo en cuenta (ARS); movimientos: pagos, cobros, transferencias, recargas, rendimientos. | — |
| **API oficial** | **OAuth** para que una aplicación acceda a datos de la cuenta de un **vendedor** con su autorización. **Reportes por API:** "Todas las transacciones" (movimientos que afectaron el dinero en cuenta: pagos, ingresos, contracargos, devoluciones; disponible, a liquidar y retenido) y "Liquidaciones" (`POST https://api.mercadopago.com/v1/account/release_report` para crear, `/config` para programar). Se mencionan también `/v1/account/settlement_report` y un endpoint de búsqueda de reportes. | DOC-IDX ([OAuth](https://www.mercadopago.com.ar/developers/es/docs/security/oauth), [Todas las transacciones](https://www.mercadopago.com.ar/developers/es/docs/reports/account-money/introduction), [Liquidaciones por API](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/reports/released-money/api), [Referencia](https://www.mercadopago.com.ar/developers/es/reference/releases-report/create-report/post)) |
| **Acceso para cuentas personales argentinas** | **Incierto.** La documentación habla de "vendedores" e integradores. No se verificó si una cuenta personal sin actividad comercial puede autorizar a una aplicación de terceros para leer sus reportes, ni si los reportes incluyen transferencias P2P, pagos con QR y pagos de servicios de una persona. | — |
| **Autenticación y permisos** | OAuth `authorization_code`, con PKCE opcional (obligatorio si se activa en la aplicación). El código de autorización vence a los 10 minutos. El access token dura 180 días. La renovación con *refresh token* requiere el *scope* `offline_access`. La revocación elimina los tokens. Hay webhooks de autorización y desautorización. **No se verificó** si existen *scopes* de solo lectura. | DOC-IDX ([Obtener Access Token](https://www.mercadopago.com.ar/developers/es/docs/security/oauth/creation), [Renovar](https://www.mercadopago.com.ar/developers/es/docs/checkout-api/additional-content/security/oauth/renewal), [Gestionar](https://www.mercadopago.com.ar/developers/es/docs/security/oauth/management)) |
| **Lectura de saldos** | Indirecta, a través del reporte (dinero disponible, a liquidar y retenido). No se verificó un endpoint de saldo directo para terceros. | DOC-IDX |
| **Lectura de movimientos** | Por reportes asincrónicos (se generan en minutos y quedan "En preparación"); período máximo de 60 días por reporte. La sincronización inicial requiere varios reportes por tramos. | DOC-IDX ([Todas las transacciones](https://www.mercadopago.com.ar/developers/es/docs/reports/account-money/introduction)) |
| **Webhooks / incremental** | Hay reportes programados con frecuencia y aviso por correo o SFTP, y webhooks de autorización OAuth. No se verificaron webhooks de movimientos para cuentas personales. Incremental: por rango de fechas. | DOC-IDX |
| **Límites, costos y requisitos** | Las credenciales de producción se obtienen en el panel de desarrollador. Los reportes de cuentas de prueba salen vacíos, así que hacen falta datos productivos. No se encontraron costos. No se verificaron límites de tasa. | DOC-IDX ([Credenciales](https://www.mercadopago.com.ar/developers/es/docs/your-integrations/credentials)) |
| **Restricciones contractuales y riesgos** | Pendiente: términos de uso de la API para un caso de finanzas personales. Riesgo: que los permisos OAuth disponibles incluyan capacidades de cobro o escritura; se solicitarán los mínimos y se documentarán. El token se guarda cifrado. | — |
| **Estado** | **Parcial** | |
| **Precisiones de la segunda búsqueda (2026-10-12)** | (1) `GET /v1/payments/search`: hasta 50 resultados por página (30 por defecto), `offset` hasta 10.000, últimos 12 meses, `range` puede ser `date_created`, `date_last_updated`, `date_approved` o `money_release_date`. (2) Reportes: crear con `POST /v1/account/settlement_report` (o `release_report`) con `begin_date`/`end_date`, consultar `GET …/list` y descargar `GET …/{file_name}` (CSV o XLSX); separador configurable; fechas en GMT-4; `TRANSACTION_TYPE` incluye `SETTLEMENT`, `REFUND`, `CHARGEBACK`, `DISPUTE`, `WITHDRAWAL`, `CASHBACK`; `SETTLEMENT_NET_AMOUNT` es el impacto real en el dinero. (3) OAuth: la URL de redirección debe ser **HTTPS, fija y coincidir exactamente** con la configurada; URL de autorización `auth.mercadopago.com/authorization` con `code_challenge` para PKCE. (4) **No se encontró** un endpoint documentado de saldo ni de `users/me` en `api.mercadopago.com` (el ejemplo de `users/me` usa `api.mercadolibre.com`). | DOC-IDX ([búsqueda de pagos](https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro-preferences/search-payments/get), [descargar reporte](https://www.mercadopago.com.ar/developers/es/reference/settlements-report/download-report/get), [generación por API](https://www.mercadopago.com.ar/developers/es/docs/checkout-api/additional-content/reports/account-money/api), [usos del reporte](https://www.mercadopago.com.ar/developers/es/docs/checkout-api/additional-content/reports/account-money/how-to-use), [OAuth](https://www.mercadopago.com.ar/developers/es/docs/security/oauth/creation)) |
| **Próxima acción** | Ejecutar la **parte A** del *spike* [`spikes/mercadopago-readonly/`](../spikes/mercadopago-readonly/README.md) con el Access Token de producción de una aplicación del usuario, y comparar el resultado con su actividad real en la app (transferencias, QR, servicios, rendimientos). Luego decidir dónde alojar la URL HTTPS de redirección para la **parte B** (OAuth de otro integrante). Revisar los términos de uso. | |
| **Spike** | Parte A construida el 2026-10-12 y probada contra un Mercado Pago simulado (34 pruebas, incluida la detección de datos personales en el reporte). **Pendiente de ejecución con la cuenta real** (el entorno de la investigación no tiene acceso de red a Mercado Pago). Parte B (OAuth) pendiente de diseño. | — |

### 4.3 Galicia

| Campo | Contenido | Evidencia |
|---|---|---|
| **Información necesaria** | Saldos y movimientos de cajas de ahorro y cuentas corrientes en ARS y USD; consumos de tarjeta. | — |
| **API oficial** | **Open Galicia**: el servicio de integración por API está dirigido **exclusivamente a empresas clientes** de Banco Galicia, con Office Banking (el entorno de prueba se accede desde Office Banking). Hay APIs para clientes directos y APIs por acuerdos de *partnership* (B2B2B, B2B2C). | DOC-IDX ([Open Galicia](https://www.galicia.ar/empresas/open-galicia)) |
| **Acceso para cuentas personales argentinas** | **No**, según la página oficial. | DOC-IDX |
| **Autenticación y permisos** | No aplica para personas. | — |
| **Lectura de saldos / movimientos** | No disponible por API para personas. Alternativa: exportación desde home banking (formatos no verificados) e importación de archivos en la app. | — |
| **Webhooks / incremental** | No aplica. | — |
| **Límites, costos y requisitos** | Para empresas: requiere ser cliente y tener Office Banking. Un *partnership* tendría condiciones comerciales no publicadas. | DOC-IDX |
| **Restricciones y riesgos** | No usar *scraping* ni pedir credenciales (regla general). Agregadores de terceros: no se encontró evidencia de cobertura de cuentas personales de Galicia. | PRENSA ([Open Banking Tracker](https://openbankingtracker.com/provider/banco-de-galicia-y-buenos-aires)) |
| **Estado** | **No disponible** (para cuentas personales) | |
| **Próxima acción** | Relevar qué formatos de exportación ofrece el home banking para personas (CSV, XLS, PDF) y diseñar el importador. Seguir el SFA. Evaluar un *partnership* solo si el producto crece. | |

### 4.4 Santander (Argentina)

| Campo | Contenido | Evidencia |
|---|---|---|
| **Información necesaria** | Igual que Galicia. | — |
| **API oficial** | No se encontró un portal de desarrolladores de Santander Argentina para personas. Lo más cercano es la integración de **Getnet** (cobros para comercios). Los portales de Santander UK y Brasil no aplican a Argentina. | DOC-IDX ([Santander comercios](https://www.santander.com.ar/personas/duo)); PRENSA ([Open Banking Tracker](https://www.openbankingtracker.com/provider/banco-santander-argentina-sa-ar/apis)) |
| **Acceso para cuentas personales argentinas** | Sin evidencia. | — |
| **Autenticación, saldos, movimientos, webhooks** | Sin evidencia. | — |
| **Límites, costos y requisitos** | Sin evidencia. Un agregador (Prometeo) informa cobertura del 60 % de cuentas en Argentina y menciona a Santander como cliente; no indica cobertura de cuentas personales ni el mecanismo técnico. **No usar sin verificar que no implique credenciales de home banking.** | PRENSA ([The Paypers](https://thepaypers.com/company/prometeo-open-banking/265)) |
| **Restricciones y riesgos** | Regla general. | — |
| **Estado** | **Pendiente de investigación** | |
| **Próxima acción** | Consultar al banco si existe acceso para personas; relevar formatos de exportación; evaluar si algún agregador accede por un mecanismo autorizado por el banco, sin credenciales del usuario. | |

### 4.5 Naranja X

| Campo | Contenido | Evidencia |
|---|---|---|
| **Información necesaria** | Saldo de la cuenta, movimientos, consumos y resúmenes de la tarjeta Naranja. | — |
| **API oficial** | Existe el portal `developers.naranjax.com`, que reúne las APIs de la empresa. **No se pudo leer su contenido.** Las páginas para comercios mencionan integración por API, *plugins* y QR. | DOC-IDX ([portal](https://developers.naranjax.com/), [comercios](https://toque.naranjax.com/)) |
| **Acceso para cuentas personales argentinas** | Sin evidencia. | — |
| **Autenticación, saldos, movimientos, webhooks** | Sin evidencia. | — |
| **Límites, costos y requisitos** | Para comercios: formulario y documentación. Para personas: sin evidencia. | DOC-IDX |
| **Restricciones y riesgos** | Regla general. | — |
| **Estado** | **Pendiente de investigación** | |
| **Próxima acción** | Leer el portal de desarrolladores de forma directa; relevar las exportaciones de la app y los resúmenes de la tarjeta; CSV. | |

### 4.6 Personal Pay

| Campo | Contenido | Evidencia |
|---|---|---|
| **Información necesaria** | Saldo (incluido el saldo remunerado) y movimientos de la billetera. | — |
| **API oficial** | `developers.personalpay.com.ar`: "Plataforma de Pagos para Desarrolladores" con APIs REST, Checkout API, BNPL y QR. Es para **cobrar**, no para leer la billetera de una persona. | DOC-IDX ([portal](https://developers.personalpay.com.ar/)) |
| **Acceso para cuentas personales argentinas** | Sin evidencia. | — |
| **Autenticación, saldos, movimientos, webhooks** | Sin evidencia para la billetera personal. | — |
| **Límites, costos y requisitos** | Sin evidencia. | — |
| **Restricciones y riesgos** | Regla general. Los términos de la billetera (página antigua) mencionan que la operadora comparte datos con su proveedor de API, sin más detalle. | DOC-IDX ([términos](https://personalpay.com.ar/terminos-y-condiciones/tyc)) |
| **Estado** | **Pendiente de investigación** | |
| **Próxima acción** | Leer el portal de forma directa; confirmar con el proveedor; relevar exportaciones; CSV. | |

### 4.7 AstroPay

| Campo | Contenido | Evidencia |
|---|---|---|
| **Información necesaria** | Saldo (puede ser multimoneda) y movimientos de la billetera. | — |
| **API oficial** | `developers.astropay.com`: APIs para **comercios**: checkout, pagos con QR, pagos a terceros (*cashout*, `POST /merchant/v2/cashout/init`, firmados con API key + HMAC SHA-256) y APIs de reportes (saldo y transacciones **del comercio**). | DOC-IDX ([Reporting APIs](https://developers.astropay.com/docs/accept-astropay/transaction-report/introduction), [Merchant balance](https://developers.astropay.com/docs/payment-processing/transaction-report/merchant-balance), [Direct withdrawal](https://developers.astropay.com/docs/payment-processing/direct-withdrawal/getting-started)) |
| **Acceso para cuentas personales argentinas** | No se encontró una API para que un usuario lea su billetera personal. | — |
| **Autenticación, saldos, movimientos, webhooks** | Solo documentado para comercios. | DOC-IDX |
| **Límites, costos y requisitos** | Sin evidencia para personas. | — |
| **Restricciones y riesgos** | Regla general. Las APIs de comercio incluyen operaciones de escritura (pagos a terceros), fuera del alcance. | — |
| **Estado** | **Pendiente de investigación** | |
| **Próxima acción** | Confirmar con AstroPay si existe acceso para usuarios; relevar exportaciones de la app; CSV. | |

---

## 5. Diseño para integraciones no disponibles

Cada entidad se modela con un **descriptor de capacidades** (ver DOMAIN_MODEL, `FinancialInstitution.integration_capabilities`) y siempre hay una alternativa:

| Mecanismo | Prioridad | Cuándo se usa |
|---|---|---|
| API oficial (OAuth / key de solo lectura) | 1 | Estado Verificado o, en beta interna, Parcial |
| Finanzas Abiertas (SFA) | 1 (futuro) | Cuando el BCRA publique los estándares y la app cumpla los requisitos |
| Importación de archivo (CSV en el MVP) | 2 | Toda entidad, siempre disponible |
| Carga manual | 3 | Toda entidad, siempre disponible |

La importación de archivos produce **el mismo formato normalizado** que una sincronización por API y pasa por el mismo proceso de deduplicación (PRD FR-IN-06). Así, una entidad puede pasar de CSV a API sin perder el historial ni duplicarlo: la huella determinística de los movimientos importados por CSV permite conciliarlos con los que lleguen luego por API (con revisión manual si la coincidencia es incierta).

## 6. Checklist para promover una integración a "Verificado"

1. Leer de forma directa (DOC-DIR) la documentación y los términos de uso vigentes; guardar los enlaces y la fecha.
2. Confirmar que el mecanismo sirve para cuentas **personales** en Argentina.
3. Confirmar los permisos mínimos de **solo lectura** y cómo se validan.
4. Probar con una cuenta real del equipo (PRUEBA): saldos, movimientos, ventana histórica, paginación, límites.
5. Confirmar si existe un identificador externo estable por movimiento (clave para la deduplicación).
6. Documentar la expiración y la revocación de credenciales.
7. Registrar los riesgos y el resultado en este documento.
