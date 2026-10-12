# PRD — Finanzas personales y familiares

| Campo | Valor |
|---|---|
| Estado | Borrador para aprobación |
| Versión | 0.1 |
| Fecha | 2026-10-12 |
| Documentos relacionados | [DOMAIN_MODEL.md](DOMAIN_MODEL.md) · [INTEGRATIONS_ASSESSMENT.md](INTEGRATIONS_ASSESSMENT.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [DECISIONS.md](DECISIONS.md) |

> **Estado del repositorio al crear este documento:** el repositorio `clean-movemements` no tenía commits, ramas remotas, issues ni pull requests. No existía un PRD, un modelo de dominio ni código previo. Este documento es la primera versión; no reemplaza contenido anterior.

---

## 1. Visión

Una aplicación web y móvil que le permite a una familia ver **qué dinero tiene, dónde está, en qué moneda o activo, y en qué se gastó**, con datos que provienen preferentemente de integraciones automáticas con sus entidades financieras, y que **nunca inventa, duplica ni oculta información**.

### 1.1 Objetivos

1. Consolidar cuentas de bancos, billeteras y exchanges en un solo lugar, conservando la moneda o el activo original de cada importe.
2. Registrar ingresos y gastos con el menor esfuerzo manual posible, sin depender de que todas las entidades ofrezcan integración.
3. Permitir el uso compartido en familia respetando la privacidad de cada integrante.
4. Mostrar un patrimonio consolidado en ARS que siempre identifica qué cotizaciones usó y cuándo se actualizaron.

### 1.2 No objetivos (fuera del alcance hasta una decisión explícita)

- Ejecutar pagos, transferencias, compras de moneda, operaciones de trading o cualquier otra **operación financiera de escritura**.
- Asesoramiento financiero o de inversión.
- Contabilidad empresarial o liquidación de impuestos.
- Custodia de fondos o de claves privadas.
- Acceso automatizado mediante *scraping* de home banking o solicitando contraseñas bancarias, códigos de autenticación (OTP, tokens) o claves privadas.

---

## 2. Decisiones de producto confirmadas

| # | Decisión | Fuente |
|---|---|---|
| P-1 | Plataformas: web y móvil desde el inicio | Confirmada por el usuario |
| P-2 | Priorizar integraciones automáticas con entidades financieras | Confirmada por el usuario |
| P-3 | ARS como moneda de referencia; soporte para USD y criptoactivos | Confirmada por el usuario |
| P-4 | Uso familiar compartido | Confirmada por el usuario |
| P-5 | Frontend React + TypeScript | Confirmada por el usuario |
| P-6 | Backend Java + Spring Boot | Confirmada por el usuario |
| P-7 | Base de datos PostgreSQL | Confirmada por el usuario |
| P-8 | Modelo comercial inicial gratuito, con posible evolución a planes pagos | Confirmada por el usuario |

Las decisiones técnicas derivadas, y las que siguen pendientes, están en [DECISIONS.md](DECISIONS.md).

---

## 3. Usuarios y escenarios

| Perfil | Necesidad principal |
|---|---|
| **Responsable del hogar** (Propietario del espacio) | Ver el patrimonio familiar consolidado, invitar a la pareja o a otros integrantes y decidir qué se comparte. |
| **Integrante adulto** (Miembro o Administrador) | Registrar sus gastos, conectar sus propias cuentas y elegir cuáles son visibles para la familia. |
| **Usuario individual** | Usar la app sin familia: es un espacio con un solo integrante. |

Escenarios representativos:

1. Ana y Bruno comparten una cuenta conjunta en Galicia y cada uno tiene una billetera personal (Mercado Pago, Naranja X). Quieren ver los gastos del hogar sin exponer todos sus movimientos personales.
2. Bruno tiene USDT en Binance y USD en una caja de ahorro de Santander. Quiere ver cuánto representa todo eso en ARS y con qué cotización.
3. Ana paga la tarjeta de Naranja X desde Mercado Pago. Ese pago **no** es un gasto nuevo: es una transferencia entre cuentas propias (ver §5.F).

---

## 4. Glosario mínimo

| Término | Definición |
|---|---|
| **Espacio familiar** | Unidad de aislamiento de datos. Todo dato financiero pertenece a exactamente un espacio. |
| **Entidad / proveedor financiero** | Organización (banco, billetera, exchange). Ej.: Santander. No es una cuenta. |
| **Conexión** | Vínculo técnico autorizado entre un usuario y un proveedor (token OAuth, API key de solo lectura). |
| **Cuenta financiera** | Contenedor de saldos dentro de un proveedor (caja de ahorro en ARS, tarjeta de crédito, cuenta spot de un exchange) o una cuenta manual (efectivo). |
| **Activo** | Unidad en la que se expresa un importe: ARS, USD, BTC, USDT. |
| **Movimiento** | Un cambio de saldo en **una** cuenta y en **un** activo. |
| **Titular** | Usuario dueño de los datos de una cuenta personal. Es distinto de quién la puede ver. |
| **Valuación** | Conversión estimada de una cantidad de un activo a ARS usando una cotización identificada y fechada. |

El glosario completo y las entidades están en [DOMAIN_MODEL.md](DOMAIN_MODEL.md).

---

## 5. Requerimientos funcionales

Los identificadores (`FR-…`) permiten trazarlos a los criterios de aceptación (§8) y, más adelante, a las pruebas.

### A. Espacios familiares

Entidades conceptuales: Usuario, Espacio familiar, Membresía, Rol, Invitación, Preferencias del espacio.

**Roles iniciales**

| Rol | Descripción |
|---|---|
| **Propietario** | Administra el espacio y sus integrantes. Es el único que puede eliminar el espacio, transferir la propiedad y cambiar roles. |
| **Administrador** | Administra la configuración del espacio y los recursos compartidos que tiene autorizados. Puede invitar Miembros. |
| **Miembro** | Consulta y registra movimientos según los permisos que tenga sobre cada cuenta. |

**Principio rector:** el rol define qué puede hacer alguien **en el espacio**; el acceso a cada cuenta se define **por cuenta**. Ningún rol, ni siquiera el de Propietario, otorga acceso automático a las cuentas personales de otro integrante.

| ID | Requerimiento |
|---|---|
| FR-WS-01 | Al registrarse, un usuario crea un espacio familiar del que es Propietario, o acepta una invitación a un espacio existente. |
| FR-WS-02 | El modelo admite que un usuario pertenezca a varios espacios. En el MVP, la interfaz trabaja con un espacio activo por vez (decisión D-07). |
| FR-WS-03 | Todo espacio tiene al menos un Propietario activo en todo momento. |
| FR-WS-04 | Las preferencias del espacio incluyen: moneda de referencia (ARS, fija en el MVP), tipo de cotización para valuar USD (ver §5.E), zona horaria (por defecto `America/Argentina/Buenos_Aires`) y la visibilidad por defecto de las cuentas nuevas. |

**Cuentas personales y compartidas**

| ID | Requerimiento |
|---|---|
| FR-WS-10 | Toda cuenta tiene un **tipo de propiedad**: `PERSONAL` (tiene un titular) o `COMPARTIDA` (pertenece al espacio, p. ej. una cuenta conjunta o la caja de efectivo del hogar). |
| FR-WS-11 | Toda cuenta tiene una **visibilidad** independiente de su propiedad: `PRIVADA` (solo el titular), `TODO_EL_ESPACIO` o `SELECCIONADA` (integrantes con permiso explícito). |
| FR-WS-12 | Una cuenta personal se crea con visibilidad `PRIVADA` salvo que el titular elija otra. La preferencia del espacio no puede hacer pública una cuenta personal sin acción del titular. |
| FR-WS-13 | El permiso sobre una cuenta tiene niveles acumulativos: `VER_SALDO` < `VER_MOVIMIENTOS` < `REGISTRAR` < `ADMINISTRAR`. |
| FR-WS-14 | Solo el titular cambia la visibilidad o los permisos de una cuenta personal. Los de una cuenta compartida los cambian el Propietario o un Administrador. |

**Invitaciones e integrantes**

| ID | Requerimiento |
|---|---|
| FR-WS-20 | El Propietario puede invitar con rol Administrador o Miembro. Un Administrador solo puede invitar con rol Miembro. Nadie invita con rol Propietario: la propiedad se transfiere (FR-WS-27). |
| FR-WS-21 | Una invitación se dirige a un correo, es de un solo uso, vence a los 7 días (valor configurable) y puede revocarse mientras esté pendiente. |
| FR-WS-22 | Solo puede aceptarla un usuario autenticado cuyo correo verificado coincida con el de la invitación. |
| FR-WS-23 | Aceptar una invitación no otorga acceso a ninguna cuenta personal existente. Sí otorga acceso a las cuentas con visibilidad `TODO_EL_ESPACIO`. |
| FR-WS-24 | El Propietario puede quitar a cualquier integrante. Un Administrador puede quitar Miembros. Nadie puede quitar al último Propietario. |
| FR-WS-25 | Cualquier integrante puede abandonar el espacio, salvo el último Propietario, que antes debe transferir la propiedad o eliminar el espacio. |
| FR-WS-26 | Al salir o ser quitado un integrante: (a) la membresía pasa a `FINALIZADA` con fecha y motivo, y no se borra; (b) sus sesiones dejan de autorizar operaciones en el espacio de inmediato; (c) sus permisos explícitos sobre cuentas se revocan; (d) se aplica FR-WS-28 a sus cuentas personales; (e) los movimientos que registró en cuentas compartidas se conservan, atribuidos a "ex integrante"; (f) queda un evento de auditoría. |
| FR-WS-27 | La propiedad se transfiere a otro integrante activo, que debe aceptarla. Mientras tanto, el Propietario original conserva el rol. |
| FR-WS-28 | Las cuentas personales de quien deja el espacio quedan archivadas y dejan de ser visibles para los demás, y sus conexiones con proveedores se revocan en ese espacio. Antes de salir, el usuario puede exportarlas. Qué ocurre después (portarlas a otro espacio o eliminarlas tras un período de retención) es la decisión D-08. |
| FR-WS-29 | Eliminar el espacio (solo el Propietario) requiere reautenticación, revoca de inmediato todas las conexiones, bloquea el acceso y programa la eliminación definitiva tras un período de gracia (propuesta: 30 días, decisión D-09). |

### B. Cuentas y entidades financieras

**Entidades iniciales:** Naranja X, Mercado Pago, Santander, Galicia, Personal Pay, Binance, AstroPay.

El modelo distingue cinco conceptos que no deben confundirse:

```
Entidad financiera (Santander)
  └── Conexión técnica (consentimiento de Ana, token cifrado)        0..n por usuario y entidad
        └── Cuenta financiera (Caja de ahorro USD de Ana)             1..n por entidad
              └── Saldo por activo (USD 1.250,00)                     1..n por cuenta
                    └── Movimientos (gasto USD 30,00 del 2026-10-01)  0..n
```

| ID | Requerimiento |
|---|---|
| FR-AC-01 | El catálogo de entidades es de solo lectura para los usuarios e incluye nombre, tipo (`BANCO`, `BILLETERA`, `EXCHANGE`, `OTRO`) y los mecanismos de integración disponibles según [INTEGRATIONS_ASSESSMENT.md](INTEGRATIONS_ASSESSMENT.md). |
| FR-AC-02 | Una entidad puede tener varias cuentas del mismo usuario (p. ej. caja de ahorro en ARS, caja de ahorro en USD y tarjeta de crédito en Santander). |
| FR-AC-03 | Tipos de cuenta: `CUENTA_BANCARIA`, `BILLETERA`, `TARJETA_CREDITO`, `CUENTA_EXCHANGE`, `EFECTIVO`, `OTRA`. La tarjeta de crédito es un **pasivo**: su saldo representa deuda. |
| FR-AC-04 | Una cuenta es de **un activo** (caja de ahorro en ARS) o **multiactivo** (cuenta spot de un exchange, tarjeta con consumos en ARS y USD). Una cuenta multiactivo nunca muestra un saldo único sin unidad. |
| FR-AC-05 | Toda cuenta tiene un **modo de origen**: `MANUAL`, `SINCRONIZADA` o `IMPORTADA_POR_ARCHIVO`. Una cuenta sincronizada puede recibir también movimientos manuales, que quedan marcados como tales. |
| FR-AC-06 | Una cuenta sincronizada cuya conexión se revoca pasa a `DESCONECTADA`: conserva su historial y puede seguir usándose de forma manual o por importación de archivos. |
| FR-AC-07 | Una cuenta puede archivarse: no recibe movimientos nuevos, conserva el historial y deja de aparecer en las vistas por defecto. |
| FR-AC-08 | Las cuentas manuales definen su saldo inicial con un **saldo declarado**, sin crear un ingreso ficticio (ver [DOMAIN_MODEL.md](DOMAIN_MODEL.md), BalanceSnapshot). |

### C. Integraciones automáticas

La integración automática es prioritaria, pero **la evidencia disponible indica que la mayoría de las entidades iniciales no ofrecen hoy un acceso programático documentado a cuentas personales**. El detalle por entidad, con fuentes y estado, está en [INTEGRATIONS_ASSESSMENT.md](INTEGRATIONS_ASSESSMENT.md).

| ID | Requerimiento |
|---|---|
| FR-IN-01 | Cada entidad declara sus **capacidades** (lectura de saldos, de movimientos, sincronización incremental, webhooks, ventana histórica máxima) y la interfaz solo ofrece lo que está disponible. |
| FR-IN-02 | Se aceptan únicamente mecanismos documentados por el proveedor: OAuth, API keys de **solo lectura** generadas por el usuario o el marco regulado de Finanzas Abiertas cuando esté operativo. |
| FR-IN-03 | **Prohibido:** pedir contraseñas de home banking, códigos OTP, tokens de segundo factor, frases semilla o claves privadas; hacer *scraping*; emular la app del proveedor. |
| FR-IN-04 | Las API keys aportadas por el usuario se validan al conectarlas: si el proveedor permite consultar sus permisos y la key tiene permisos de escritura (trading, retiros, transferencias), la conexión se rechaza y se le explica al usuario cómo crear una de solo lectura. |
| FR-IN-05 | Toda entidad sin integración disponible admite **importación de archivos** (CSV en el MVP; otros formatos según la evaluación) y **carga manual**. Ninguna funcionalidad depende de que exista una integración. |
| FR-IN-06 | La importación de archivos usa el mismo proceso de normalización, deduplicación y trazabilidad que la sincronización por API. |
| FR-IN-07 | Una integración nueva solo se habilita a usuarios finales después de: verificar su documentación oficial, revisar sus términos de uso, probarla con una cuenta real del equipo y documentar el resultado en la matriz. |

### D. Sincronización confiable

| ID | Requerimiento |
|---|---|
| FR-SY-01 | **Conectar:** el usuario elige la entidad y se lo redirige al consentimiento del proveedor (OAuth) o se le pide una API key de solo lectura con instrucciones. Se registra el alcance consentido y su fecha. |
| FR-SY-02 | **Desconectar:** el titular de la conexión puede revocarla en cualquier momento. Se intenta revocar el token en el proveedor si este lo permite, se destruye el secreto almacenado y la cuenta pasa a `DESCONECTADA`. Si el proveedor no permite revocar desde afuera (p. ej. API keys), se le indica al usuario cómo eliminarla en el proveedor. |
| FR-SY-03 | **Consentimiento:** se muestra qué datos se leerán, para qué y por cuánto tiempo. Si el proveedor informa la expiración, la conexión pasa a `REQUIERE_REAUTORIZACION` y se avisa con antelación. |
| FR-SY-04 | **Sincronización inicial:** obtiene cuentas, saldos y la mayor ventana histórica que permita el proveedor (por tramos, si tiene límites de rango) y registra hasta qué fecha se cubrió. |
| FR-SY-05 | **Sincronización incremental:** usa el cursor o la fecha del último dato confirmado, con una ventana de solapamiento configurable por proveedor para capturar movimientos tardíos o modificados. El solapamiento es seguro porque la deduplicación es idempotente. |
| FR-SY-06 | **Idempotencia:** repetir una sincronización, o la misma importación de archivo, no crea movimientos duplicados. La clave principal es (cuenta, identificador externo). Sin identificador externo, se usa una huella determinística y los casos ambiguos van a revisión. |
| FR-SY-07 | **Duplicados entre fuentes:** si un movimiento importado coincide con uno manual previo (misma cuenta, activo e importe, fecha cercana), se propone vincularlos; nunca se fusionan solos. |
| FR-SY-08 | **Errores:** se clasifican (`CREDENCIAL_EXPIRADA`, `CONSENTIMIENTO_REVOCADO`, `LIMITE_DE_API`, `PROVEEDOR_NO_DISPONIBLE`, `CAMBIO_DE_FORMATO`, `ERROR_INTERNO`) y cada clase tiene su política de reintento y su mensaje para el usuario. |
| FR-SY-09 | **Reintentos:** solo para errores transitorios, con espera exponencial con *jitter*, respetando los límites y encabezados de espera del proveedor, con un máximo de intentos. Los errores de credenciales no se reintentan: requieren acción del usuario. |
| FR-SY-10 | **Atomicidad por lote:** un fallo durante una sincronización no borra ni altera los datos importados antes. Se confirma lo procesado por tramos y el cursor solo avanza hasta el último tramo confirmado. |
| FR-SY-11 | **Concurrencia:** hay como máximo una sincronización en curso por conexión. |
| FR-SY-12 | **Última sincronización exitosa:** cada cuenta muestra la fecha y hora de la última sincronización exitosa y el resultado de la última que se intentó. |
| FR-SY-13 | **Datos desactualizados:** si la última sincronización exitosa supera el umbral del proveedor (propuesta por defecto: 24 h), la cuenta y todo total que la incluya muestran una advertencia visible. Nunca se presenta un dato viejo como actual. |
| FR-SY-14 | **Trazabilidad:** todo movimiento indica su origen (manual, sincronización o archivo), la ejecución que lo creó y su identificador externo, si el proveedor lo informa. |
| FR-SY-15 | **Ediciones del usuario:** si el usuario modificó campos de un movimiento importado (categoría, descripción, notas, fecha contable), una nueva sincronización no los sobrescribe. Si el proveedor cambia un campo que el usuario también modificó (p. ej. el importe), el movimiento se marca `CONFLICTO` para revisión y se conservan ambas versiones. |
| FR-SY-16 | **Movimientos que desaparecen:** si un movimiento pendiente del proveedor no se confirma o deja de informarse, no se borra: pasa a `CANCELADO` con su historial. |
| FR-SY-17 | **Solo lectura:** ninguna integración del MVP pide ni usa permisos para mover fondos, operar o pagar. Habilitarlo requiere una decisión explícita posterior (D-01). |

### E. Multimoneda y criptoactivos

| ID | Requerimiento |
|---|---|
| FR-MC-01 | Activos mínimos: ARS, USD y criptoactivos. Un cripto se identifica por activo (p. ej. USDT) y, cuando corresponde, por **red** (p. ej. TRON, Ethereum). La red se registra donde es relevante (depósitos, retiros, billeteras propias), no en el saldo de un exchange, que es por activo. |
| FR-MC-02 | **Todo importe guarda su cantidad y su activo.** No existen importes sin unidad. |
| FR-MC-03 | Las cantidades usan aritmética decimal exacta con la precisión del activo (ARS y USD: 2 decimales; BTC: 8; otros según el activo, hasta 18). Nunca se usan tipos de punto flotante. |
| FR-MC-04 | Nunca se suman cantidades de activos distintos. Un total en ARS siempre es una **valuación** (FR-MC-06). |
| FR-MC-05 | Definiciones: |
| | • **Saldo nominal de una cuenta:** el conjunto de pares (activo, cantidad) de esa cuenta. Para una cuenta de un activo, un único par. |
| | • **Saldo de un activo:** cantidad total de ese activo en las cuentas que el usuario puede ver, en su unidad (p. ej. "USD 1.500,00 en 2 cuentas"). |
| | • **Valuación estimada en ARS:** cantidad × cotización (activo→ARS) de un tipo, una fuente y una marca temporal determinados. Es una estimación y se rotula así. |
| | • **Patrimonio consolidado:** suma de las valuaciones en ARS de los saldos incluidos (activos menos pasivos), en un momento de valuación, junto con la lista de cotizaciones usadas. |
| | • **Variación de valuación:** diferencia de patrimonio entre dos momentos. Se distingue entre lo que cambió por flujos (ingresos, gastos) y lo que cambió por precio o tipo de cambio. La variación por precio **no** es un ingreso. |
| FR-MC-06 | Toda valuación indica, por activo: cotización usada, tipo (oficial, MEP, cripto, etc.), fuente y fecha y hora de la cotización. |
| FR-MC-07 | **Tipos de cotización del USD:** en Argentina coexisten varias cotizaciones del dólar. El espacio elige cuál usar para valuar (preferencia FR-WS-04). El tipo por defecto queda pendiente (decisión D-04). |
| FR-MC-08 | **Datos faltantes:** si un activo no tiene cotización disponible, su saldo se muestra en su unidad y queda **excluido** del total, con la advertencia "valuación incompleta". Nunca se valúa en cero ni con una cotización inventada. |
| FR-MC-09 | **Datos desactualizados:** si la cotización supera su antigüedad máxima (propuesta: 24 h para fiat en días hábiles, 15 min para cripto), se usa igual, pero se marca como desactualizada y se muestra su fecha. Pasado un máximo absoluto (propuesta: 7 días), se trata como faltante. |
| FR-MC-10 | Las cotizaciones se guardan como historial inmutable para poder reproducir una valuación pasada. |
| FR-MC-11 | Criptoactivos: no se piden ni almacenan claves privadas ni frases semilla. Las integraciones con exchanges usan keys de solo lectura (FR-IN-04). Las billeteras propias (*self-custody*), si se evalúan en el futuro, solo se agregarían por dirección pública. |
| FR-MC-12 | La primera versión no se compromete a soportar todos los activos ni todas las redes: el catálogo de activos habilitados es explícito y ampliable. Un activo no catalogado que llegue de una sincronización se guarda igual con su código original y queda marcado para revisión, sin descartarse. |

### F. Movimientos y transferencias

**Tipos de movimiento**

| Tipo | Efecto en el resultado (ingresos − gastos) | Nota |
|---|---|---|
| **Ingreso** | Suma | Siempre es una entrada de fondos. |
| **Gasto** | Resta | Siempre es una salida de fondos. Las comisiones son gastos. |
| **Transferencia propia** | Neutro | Entre dos cuentas del mismo espacio. Se modela como dos patas vinculadas. |
| **Ajuste de conciliación** | Neutro en el resultado, modifica el saldo | Solo si se aprueba como operación explícita (decisión D-05). Requiere un motivo. |

| ID | Requerimiento |
|---|---|
| FR-TX-01 | Un movimiento registra: origen (`MANUAL`, `SINCRONIZACION`, `ARCHIVO`), cuenta, dirección (entrada o salida), cantidad positiva, activo, fecha de operación, fecha de registro, estado, estado de sincronización, categoría, descripción, identificador externo (si existe) y vínculos con otros movimientos. |
| FR-TX-02 | Estados: `PENDIENTE`, `CONFIRMADO`, `REVERTIDO`, `CANCELADO` y `ELIMINADO`. Ningún estado implica borrado físico. Los reportes de resultado usan `CONFIRMADO` por defecto; `PENDIENTE` se muestra aparte. |
| FR-TX-03 | Una transferencia propia vincula una pata de salida y una de entrada, en cuentas del mismo espacio. Ninguna de las dos patas cuenta como ingreso ni como gasto. |
| FR-TX-04 | Si las patas tienen activos distintos (compra de USD con ARS, venta de USDT por ARS), la transferencia es una **conversión**. Cada pata conserva su cantidad y su activo; el tipo de cambio implícito se calcula para mostrarlo, pero no se usa como cotización de mercado. |
| FR-TX-05 | Si la cantidad que sale y la que entra difieren en el mismo activo, la diferencia se registra como un movimiento de **gasto por comisión** vinculado, o la transferencia queda en revisión. Nunca se absorbe en silencio. |
| FR-TX-06 | **Pago de tarjeta de crédito:** pagar el resumen desde otra cuenta propia es una transferencia (reduce la deuda), no un gasto. Los gastos se reconocen en las compras de la tarjeta. El tratamiento de las compras en cuotas es la decisión D-06. |
| FR-TX-07 | **Detección automática de transferencias** en cuentas sincronizadas: se generan candidatas cuando hay una salida en la cuenta A y una entrada en la cuenta B del mismo espacio, con el mismo activo e importe (o la diferencia explicable por una comisión) y fechas dentro de una ventana (propuesta: 3 días). Suman confianza la coincidencia de identificadores de la contraparte (CBU, CVU, alias) con cuentas propias y una referencia compartida informada por el proveedor. |
| FR-TX-08 | Solo se vinculan automáticamente las coincidencias **determinísticas** (misma referencia del proveedor en ambas patas, o contraparte identificada como cuenta propia con importe y activo exactos). El resto queda como **sugerencia** para revisión manual. El usuario siempre puede desvincular. |
| FR-TX-09 | Mientras una sugerencia no se resuelva, los reportes muestran cuántos movimientos están "posiblemente duplicados por transferencia", para que el resultado no parezca definitivo. |
| FR-TX-10 | **Privacidad en la detección:** una sugerencia que involucra dos cuentas solo se muestra a quien puede ver ambas. La detección nunca revela a un integrante la existencia de una cuenta privada de otro. |
| FR-TX-11 | Una transferencia hacia la cuenta personal de otro integrante del espacio se clasifica según la decisión D-10 (transferencia interna del espacio frente a gasto o ingreso personal). |
| FR-TX-12 | Los movimientos editados por el usuario conservan sus ediciones (FR-SY-15) y cada edición queda auditada. |
| FR-TX-13 | Eliminar un movimiento manual es una baja lógica (`ELIMINADO`). Un movimiento importado no se elimina: se puede **excluir** de los reportes con un motivo, y sigue sirviendo para la deduplicación. |

### G. Privacidad y permisos

**Matriz de autorización.** El rol del espacio y el permiso sobre la cuenta se combinan: el permiso efectivo es la **intersección** entre lo que habilita el rol y el acceso que se tiene a esa cuenta.

Leyenda: ✅ permitido · ⚠️ permitido con la condición indicada · ❌ no permitido. "Cuentas accesibles" = cuentas propias + cuentas con visibilidad `TODO_EL_ESPACIO` + cuentas con permiso explícito.

| Acción | Propietario | Administrador | Miembro | Titular de la cuenta personal |
|---|---|---|---|---|
| Consultar saldos | ⚠️ cuentas accesibles | ⚠️ cuentas accesibles | ⚠️ cuentas accesibles con ≥ `VER_SALDO` | ✅ |
| Consultar movimientos | ⚠️ cuentas accesibles | ⚠️ cuentas accesibles | ⚠️ cuentas accesibles con ≥ `VER_MOVIMIENTOS` | ✅ |
| Registrar movimientos | ⚠️ compartidas y propias | ⚠️ compartidas y propias | ⚠️ propias y con ≥ `REGISTRAR` | ✅ |
| Editar movimientos de otros | ⚠️ cuentas compartidas | ⚠️ cuentas compartidas | ⚠️ solo con `ADMINISTRAR` sobre la cuenta | ✅ en su cuenta |
| Crear cuenta personal | ✅ | ✅ | ✅ | — |
| Crear o administrar cuenta compartida | ✅ | ✅ | ❌ | — |
| Cambiar visibilidad o permisos de una cuenta personal | ❌ (salvo que sea titular) | ❌ (salvo que sea titular) | ❌ (salvo que sea titular) | ✅ |
| Conectar una entidad (con sus propias credenciales) | ✅ | ✅ | ✅ | ✅ |
| Asociar una conexión a una cuenta compartida | ✅ | ✅ | ❌ | — |
| Reautorizar o revocar una conexión | ⚠️ solo las propias¹ | ⚠️ solo las propias¹ | ⚠️ solo las propias | ✅ |
| Pausar la sincronización de una cuenta compartida | ✅ | ✅ | ❌ | — |
| Ver estado de sincronización | ⚠️ cuentas accesibles | ⚠️ cuentas accesibles | ⚠️ cuentas accesibles | ✅ |
| Ver datos crudos del proveedor | ❌ | ❌ | ❌ | ⚠️ solo el titular de la conexión |
| Invitar integrantes | ✅ (Administrador o Miembro) | ⚠️ solo Miembros | ❌ | — |
| Quitar integrantes | ✅ (no al último Propietario) | ⚠️ solo Miembros | ❌ | — |
| Cambiar roles | ✅ | ❌ | ❌ | — |
| Exportar datos | ⚠️ cuentas accesibles | ⚠️ cuentas accesibles | ⚠️ cuentas accesibles | ✅ |
| Abandonar el espacio | ⚠️ si no es el último Propietario | ✅ | ✅ | — |
| Eliminar el espacio | ✅ con reautenticación | ❌ | ❌ | — |
| Ver auditoría del espacio | ✅ (eventos de recursos accesibles) | ⚠️ eventos de recursos accesibles | ❌ | ⚠️ eventos de sus cuentas |

¹ Al quitar a un integrante o eliminar el espacio, el sistema revoca las conexiones de ese integrante en el espacio (FR-WS-26, FR-WS-29). Ningún rol puede usar ni ver el token de otro usuario.

| ID | Requerimiento |
|---|---|
| FR-PR-01 | **El backend valida en cada solicitud** la autenticación, la membresía activa en el espacio, el rol y el permiso sobre el recurso. La interfaz oculta lo que no corresponde, pero **no es una barrera de seguridad**. |
| FR-PR-02 | El espacio de cada operación se obtiene de la membresía del usuario autenticado y se verifica contra el recurso; nunca se confía en un identificador de espacio enviado por el cliente sin verificarlo. |
| FR-PR-03 | Un recurso de otro espacio, o una cuenta no accesible, responde igual que un recurso inexistente (404), para no revelar su existencia. |
| FR-PR-04 | **Revocación inmediata:** al quitar un rol o un permiso, la siguiente solicitud ya se evalúa con los permisos nuevos. Los permisos no se guardan en tokens de larga duración; si el token de sesión incluye datos de autorización, su vida máxima es corta (propuesta: 5 min) y el backend reconsulta la membresía. |
| FR-PR-05 | Al revocar a un integrante: se finalizan sus permisos, se revocan sus conexiones en el espacio (intentando también la revocación en el proveedor), se cancelan sus invitaciones pendientes y se registra todo en la auditoría. |
| FR-PR-06 | Se evalúan por separado tres cosas: **visibilidad** (quién ve la cuenta), **propiedad de los datos** (el titular decide sobre su visibilidad, exportación y borrado) y **administración de la conexión** (solo quien otorgó el consentimiento al proveedor puede reautorizarla o revocarla). |
| FR-PR-07 | Las exportaciones respetan los permisos: nunca incluyen cuentas que quien exporta no puede ver. |
| FR-PR-08 | Toda acción sensible queda auditada (ver ARCHITECTURE §6.5). |

---

## 6. Requerimientos no funcionales

| ID | Categoría | Requerimiento |
|---|---|---|
| NFR-01 | Seguridad | Tokens y API keys de proveedores cifrados con cifrado de sobre (*envelope encryption*) y clave maestra en un servicio de gestión de claves. Nunca en texto plano, ni en logs, ni en respuestas de la API. |
| NFR-02 | Seguridad | TLS en todo el tránsito. Cifrado en reposo de la base y de los respaldos. |
| NFR-03 | Seguridad | Autenticación con proveedor OIDC estándar. MFA o *passkeys* obligatorios para conectar entidades y para acciones de Propietario (decisión D-11). |
| NFR-04 | Seguridad | Prueba automatizada de acceso cruzado entre espacios para cada endpoint que devuelva o modifique datos (ver AC-02). |
| NFR-05 | Privacidad | Minimización: solo se guardan del proveedor los campos necesarios. El dato crudo se conserva cifrado y con retención limitada (decisión D-12). Se requiere revisión legal según la Ley 25.326 de Protección de Datos Personales antes de producción. |
| NFR-06 | Integridad | Cantidades decimales exactas (`NUMERIC` en PostgreSQL, `BigDecimal` en Java, *strings* decimales en JSON). Prohibidos `float`/`double` y `number` de JS para importes. |
| NFR-07 | Integridad | Operaciones de escritura idempotentes (clave de idempotencia en la API; *upsert* por identificador externo en la sincronización). |
| NFR-08 | Trazabilidad | Ningún dato financiero se borra físicamente en la operación normal. Las bajas son lógicas y auditadas; el borrado definitivo solo ocurre por pedido del titular o por retención, con un proceso explícito. |
| NFR-09 | Disponibilidad | Objetivo inicial 99,5 % mensual para la API. La caída de un proveedor no afecta al resto de la aplicación. |
| NFR-10 | Recuperación | RPO ≤ 15 min y RTO ≤ 4 h (propuesta). Restauración probada al menos una vez por trimestre. |
| NFR-11 | Rendimiento | p95 < 500 ms en consultas de listado con hasta 50.000 movimientos por espacio. |
| NFR-12 | Observabilidad | Logs estructurados con identificador de correlación, métricas por proveedor (éxito, latencia, límites alcanzados, duplicados descartados) y alertas. |
| NFR-13 | Accesibilidad | WCAG 2.1 AA en la interfaz web y móvil. |
| NFR-14 | Localización | Español (Argentina), formato numérico `1.234,56`, zona horaria del espacio. Las fechas se guardan en UTC junto con la fecha local de operación. |
| NFR-15 | Portabilidad | Exportación completa en un formato abierto (CSV y JSON) de los datos accesibles. |
| NFR-16 | Costos | La arquitectura no debe requerir servicios pagos por usuario para funcionar en el MVP gratuito. Los costos de proveedores o agregadores se evalúan antes de adoptarlos. |

---

## 7. Alcance del MVP

### 7.1 Indispensable (MVP)

- Registro e inicio de sesión (OIDC), espacio familiar, invitaciones, tres roles y permisos por cuenta.
- Cuentas manuales y cuentas sincronizadas; tipos de cuenta incluida la tarjeta de crédito.
- Activos ARS y USD, más los criptoactivos que aporte la primera integración (catálogo acotado).
- Movimientos: ingreso, gasto y transferencia propia (incluidas las conversiones), con estados y categorías.
- **Importación CSV** con mapeo de columnas y deduplicación. Es la vía principal para las entidades sin API.
- **Una integración automática**: la primera que resulte viable según [INTEGRATIONS_ASSESSMENT.md](INTEGRATIONS_ASSESSMENT.md) (candidata: Binance de solo lectura; alternativa: Mercado Pago).
- Sincronización idempotente, historial de ejecuciones, indicadores de datos desactualizados.
- Detección de transferencias con revisión manual.
- Valuación en ARS con cotización identificada (una fuente fiat y una fuente cripto).
- Reportes básicos: resultado por período y categoría, saldos por cuenta y activo, patrimonio consolidado. Filtros por espacio, cuenta, fecha y moneda.
- Exportación CSV/JSON; auditoría de acciones sensibles.
- Web responsive instalable como PWA (ver ARCHITECTURE §3).

### 7.2 Futuro (fuera del MVP)

- Más integraciones automáticas, a medida que se verifiquen (incluido el Sistema de Finanzas Abiertas del BCRA cuando esté operativo).
- Importación de otros formatos (PDF de resúmenes, OFX) según disponibilidad.
- Billeteras cripto de autocustodia por dirección pública y más redes.
- Presupuestos, metas y alertas de gasto.
- Notificaciones push (dependen de la estrategia móvil; ver ARCHITECTURE §3).
- Aplicaciones nativas en tiendas, si se cumplen los disparadores de la decisión D-03.
- Ajustes de conciliación como operación explícita (si D-05 se aprueba más tarde).
- Planes pagos y límites por plan.
- Cualquier operación financiera de escritura (requiere D-01).

---

## 8. Criterios de aceptación del MVP

Formato Dado/Cuando/Entonces, pensado para convertirse en pruebas automatizadas. La columna "Nivel" sugiere dónde automatizarla: **U** unitaria de dominio, **I** integración con base de datos real (Testcontainers), **API** prueba de contrato HTTP, **E2E** navegador.

| ID | Escenario | Nivel |
|---|---|---|
| AC-01 | Acceso compartido | API, E2E |
| AC-02 | Aislamiento entre espacios | API (por endpoint) |
| AC-03 | Privacidad de cuentas personales | API |
| AC-04 | Carga manual sin integración | API, E2E |
| AC-05 | Sincronización idempotente | I |
| AC-06 | Transferencia neutra | U, I |
| AC-07 | Conservación de la moneda original | U, I |
| AC-08 | Valuación trazable | U, API |
| AC-09 | Fallo de sincronización no destructivo | I |
| AC-10 | Ediciones del usuario conservadas | I |
| AC-11 | Revocación de permisos | API |
| AC-12 | Filtros de reportes | I, API |

**AC-01 — Dos integrantes autorizados acceden al mismo espacio**
- Dado el espacio E con Ana (Propietaria) y una cuenta compartida C con visibilidad `TODO_EL_ESPACIO`
- Cuando Ana invita a bruno@ejemplo.com como Miembro y Bruno acepta con ese correo verificado
- Entonces ambos obtienen 200 al consultar `E` y los movimientos de `C`, y la membresía de Bruno figura `ACTIVA` con rol Miembro.
- Y si la invitación la acepta un usuario con otro correo, la respuesta es de rechazo y no se crea la membresía.

**AC-02 — Un usuario ajeno no puede consultar los datos**
- Dado el usuario Carla, sin membresía en E, y los identificadores reales de E, de su cuenta C y de un movimiento M
- Cuando Carla pide cualquier endpoint de lectura o escritura sobre E, C o M, o con ellos como filtro
- Entonces la respuesta es 404 sin datos, ningún dato de E aparece en listados, búsquedas, exportaciones o reportes de Carla, y no se modifica nada.
- Esta prueba se repite para **cada** endpoint (prueba parametrizada sobre el catálogo de rutas).

**AC-03 — Una cuenta personal no se vuelve visible automáticamente**
- Dado que Bruno es Miembro de E y crea la cuenta personal P sin cambiar la visibilidad
- Cuando Ana (Propietaria) lista cuentas, saldos, movimientos, reportes y el patrimonio de E
- Entonces P no aparece, su saldo no se incluye en ningún total que vea Ana, y pedir P directamente devuelve 404.
- Y cuando Bruno cambia P a `TODO_EL_ESPACIO`, Ana pasa a verla.

**AC-04 — Una integración no disponible no impide la carga manual**
- Dada una entidad cuyo estado de integración es `NO_DISPONIBLE` o `PENDIENTE`, o una conexión en estado de error
- Cuando el usuario crea una cuenta manual de esa entidad y registra un gasto de ARS 15.000,00
- Entonces el gasto se guarda con origen `MANUAL`, aparece en los reportes y el saldo calculado de la cuenta se reduce en ARS 15.000,00.

**AC-05 — Repetir una sincronización no duplica movimientos**
- Dado un proveedor simulado que devuelve 120 movimientos con identificador externo y otro que devuelve 30 sin identificador
- Cuando se ejecuta la sincronización 2 veces seguidas, y además una tercera con una ventana de solapamiento de 7 días
- Entonces la cuenta tiene exactamente 150 movimientos, los totales de ingresos, gastos y transferencias son iguales tras cada ejecución, y la segunda y la tercera ejecución informan 0 movimientos nuevos.
- Y si se importa dos veces el mismo archivo CSV, el resultado es el mismo.

**AC-06 — Una transferencia propia no altera el resultado neto**
- Dadas las cuentas A (ARS) y B (ARS) del mismo espacio, con un resultado del período R
- Cuando se registra una transferencia de ARS 50.000,00 de A a B (o se confirma una sugerida)
- Entonces R no cambia, el saldo de A baja ARS 50.000,00, el de B sube ARS 50.000,00 y ninguna de las dos patas aparece como ingreso o gasto en el reporte por categoría.
- Y si la transferencia tiene una comisión de ARS 100,00, R baja exactamente ARS 100,00, registrado como gasto de comisión.
- Y el pago del resumen de una tarjeta desde una cuenta propia tampoco altera R.

**AC-07 — Se conservan las monedas originales**
- Dados un gasto de USD 30,00, un ingreso de ARS 1.000.000,00 y un depósito de USDT 25,123456
- Cuando se consultan por API, en reportes y en la exportación
- Entonces cada uno conserva su cantidad exacta y su activo original, sin redondeo distinto a la precisión del activo, y no existe ninguna respuesta que sume cantidades de activos distintos sin indicar que es una valuación.

**AC-08 — La valuación consolidada identifica la cotización y su fecha**
- Dado un espacio con USD 100,00 y ARS 100.000,00, y una cotización USD→ARS de tipo T, fuente F, fecha y hora H y valor V
- Cuando se consulta el patrimonio consolidado
- Entonces el total es exactamente 100.000,00 + 100,00 × V, y la respuesta incluye T, F, H y V.
- Y si no hay cotización para un activo, ese activo se lista en su unidad, se excluye del total y la respuesta indica `valuacion_incompleta = true`.
- Y si H supera la antigüedad máxima, la respuesta marca la cotización como desactualizada.

**AC-09 — Un fallo de sincronización no destruye datos previos**
- Dada una cuenta con 200 movimientos importados y su saldo informado
- Cuando una sincronización falla a mitad de camino (error del proveedor, tiempo de espera agotado o caída del proceso)
- Entonces los 200 movimientos siguen intactos, la última sincronización exitosa sigue siendo la anterior, la ejecución fallida queda registrada con su clase de error y el cursor no avanzó más allá del último tramo confirmado.

**AC-10 — Las ediciones del usuario se conservan**
- Dado un movimiento importado al que el usuario le cambió la categoría y la descripción
- Cuando una nueva sincronización trae el mismo movimiento con otra descripción del proveedor
- Entonces se conservan la categoría y la descripción del usuario, y se actualiza la descripción original del proveedor en el dato crudo.
- Y si el proveedor cambia el importe, el movimiento pasa a `CONFLICTO`, se conservan ambos valores y se pide revisión.

**AC-11 — Los permisos revocados dejan de permitir operaciones**
- Dado que Bruno tiene `REGISTRAR` sobre la cuenta C y una sesión activa
- Cuando Ana le quita el permiso, o lo quita del espacio
- Entonces la siguiente solicitud de Bruno para registrar en C es rechazada (403 si todavía puede ver C; 404 si ya no puede), dentro del tiempo máximo definido en FR-PR-04.
- Y si Bruno es quitado del espacio, sus conexiones en el espacio quedan `REVOCADA` y no se ejecutan nuevas sincronizaciones con ellas.

**AC-12 — Los reportes respetan los filtros**
- Dado un conjunto de datos fijo con movimientos en dos espacios, varias cuentas, fechas que cruzan el límite del filtro (incluido el cambio de día en la zona horaria del espacio) y activos ARS, USD y USDT
- Cuando se pide un reporte filtrando por espacio, cuenta, rango de fechas y activo
- Entonces el reporte incluye exactamente los movimientos que cumplen todos los filtros, excluye los `ELIMINADO`, `CANCELADO` y excluidos, separa los `PENDIENTE`, y los totales coinciden con un cálculo independiente sobre el mismo conjunto de datos.

---

## 9. Roadmap por dependencias

> **Ajuste respecto del orden propuesto:** la representación multiactivo (activo + cantidad exacta) se adelanta a la **Fase 3**, porque la primera integración candidata (Binance) ya trae criptoactivos y porque cambiar la representación de importes después sería muy costoso. La **valuación** (cotizaciones y patrimonio) sigue en la Fase 6. La **importación CSV** se adelanta a la Fase 4, junto con la primera integración, porque es la única vía viable para la mayoría de las entidades.

| Fase | Contenido | Depende de | Salida |
|---|---|---|---|
| **0** | Inspección del repositorio y documentación | — | Este conjunto de documentos ✅ |
| **1** | Validación de requerimientos, seguridad y modelo financiero | 0 | Aprobación de las decisiones D-01 a D-13 (D-14 puede esperar a la Fase 8); revisión legal inicial |
| **2** | Estrategia de plataforma y evaluación de integraciones | 1 | ✅ D-02 (Binance) y D-03 (PWA) aprobadas. 🔄 *Spike* de Binance construido, pendiente de ejecución con una cuenta real; luego, *spike* de Mercado Pago para la segunda integración; matriz actualizada |
| **3** | Núcleo financiero y espacios familiares | 1 | Identidad, espacios, permisos, cuentas, activos (multiactivo), movimientos, transferencias manuales, auditoría. AC-01 a AC-04, AC-06, AC-07, AC-11 |
| **4** | Primera integración realmente viable + importación CSV | 2, 3 | Conexión, consentimiento, secretos cifrados, sincronización inicial e incremental, CSV. AC-05, AC-09 |
| **5** | Sincronización confiable, deduplicación y conciliación | 4 | Reintentos, conflictos, detección de transferencias, saldo informado frente a calculado. AC-10 |
| **6** | Valuación multimoneda y criptoactivos | 3 (y 4 para datos reales) | Cotizaciones, valuación, patrimonio. AC-08 |
| **7** | Reportes, exportación y experiencia móvil | 5, 6 | Reportes con filtros, exportación, PWA instalable. AC-12 |
| **8** | Preparación productiva y evaluación del modelo comercial | 7 | Respaldos probados, observabilidad, revisión de seguridad, términos y privacidad, evaluación de planes |

---

## 10. Decisiones que requieren aprobación

Resumen; el detalle y las alternativas están en [DECISIONS.md](DECISIONS.md).

| ID | Decisión | Propuesta |
|---|---|---|
| D-01 | ¿Operaciones financieras de escritura? | No. Solo lectura hasta una nueva decisión. |
| D-02 | Primera integración automática | ✅ **Aprobada:** Binance (keys de solo lectura). El *spike* confirma o ajusta el alcance. |
| D-03 | Estrategia web y móvil | ✅ **Aprobada:** PWA con React + TypeScript; React Native solo si se cumplen los disparadores definidos. |
| D-04 | Tipo de cotización USD por defecto | Pendiente de elección (oficial BNA, mayorista, MEP…), configurable por espacio. |
| D-05 | Ajuste de conciliación como movimiento | Sí, como operación explícita con motivo, o solo como redefinición del saldo de referencia. |
| D-06 | Compras en cuotas | Reconocer el gasto en cada cuota (propuesta) o en la fecha de compra. |
| D-07 | Varios espacios por usuario en el MVP | El modelo lo admite; la interfaz trabaja con uno activo. |
| D-08 | Cuentas personales de quien deja el espacio | Archivar y permitir exportar; definir la portabilidad. |
| D-09 | Período de gracia al eliminar un espacio | 30 días. |
| D-10 | Transferencia a la cuenta de otro integrante | Interna (neutra) a nivel espacio. |
| D-11 | Proveedor de identidad y MFA | IdP OIDC estándar; MFA obligatorio para conectar entidades. |
| D-12 | Retención de datos crudos del proveedor | 13 meses, cifrados. |
| D-13 | Row-Level Security de PostgreSQL como defensa adicional | Sí, previa prueba de concepto. |
| D-14 | Proveedor cloud y hosting | Decidir en la Fase 8; no bloquea las fases 3 a 7. |

---

## 11. Riesgos principales

| Riesgo | Impacto | Mitigación |
|---|---|---|
| La mayoría de las entidades no ofrece API para cuentas personales | La propuesta de valor de la "integración automática" queda limitada | CSV de primera clase; priorizar la integración que sí exista; seguir el Sistema de Finanzas Abiertas del BCRA (lanzamiento masivo previsto para 2027 según prensa; no verificado en fuente oficial) |
| Términos de uso del proveedor que no permitan este uso | Bloqueo o pérdida del acceso | Revisión de términos antes de habilitar cada integración (FR-IN-07) |
| Filtración de tokens o keys | Exposición de datos financieros | Solo lectura, cifrado de sobre, aislamiento del módulo, revocación, auditoría |
| Error de aislamiento entre espacios (IDOR) | Fuga de datos entre familias | Autorización centralizada, pruebas AC-02 por endpoint, evaluar RLS como defensa adicional |
| Doble conteo de transferencias | Reportes incorrectos | Modelo de patas vinculadas, detección con revisión, aviso de pendientes |
| Varias cotizaciones del dólar | Patrimonio engañoso | Tipo de cotización explícito, visible y configurable |
| Cambios de formato del proveedor | Sincronizaciones rotas o datos corruptos | Validación del contrato, clase de error `CAMBIO_DE_FORMATO`, sin escritura parcial |
