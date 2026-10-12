# Arquitectura — Finanzas personales y familiares

| Campo | Valor |
|---|---|
| Estado | Propuesta para aprobación. **No hay código implementado.** |
| Fecha | 2026-10-12 |
| Relacionado | [PRD.md](PRD.md) · [DOMAIN_MODEL.md](DOMAIN_MODEL.md) · [DECISIONS.md](DECISIONS.md) |

> **Estado del repositorio:** vacío al 2026-10-12 (sin código, dependencias ni configuración). No hay restricciones previas que justifiquen apartarse del stack preferido: **React + TypeScript**, **Java + Spring Boot** y **PostgreSQL**.

---

## 1. Vista general

```
┌──────────────────────────────┐        HTTPS (JSON, OpenAPI)        ┌──────────────────────────────────────────┐
│ Cliente web React + TS       │ ──────────────────────────────────► │ Backend Spring Boot (monolito modular)   │
│ (responsive, instalable PWA) │ ◄────────────────────────────────── │                                          │
└──────────────────────────────┘                                      │  identity │ accounts │ transactions      │
                                                                      │  integrations │ sync │ valuation         │
┌──────────────────────────────┐                                      │  reporting │ platform (audit, jobs)    │
│ Proveedor de identidad OIDC  │ ◄────────── validación de tokens ──── │                                          │
└──────────────────────────────┘                                      └───────┬───────────────┬──────────────────┘
                                                                              │               │
                                                             ┌────────────────▼───┐   ┌───────▼──────────────────┐
                                                             │ PostgreSQL         │   │ KMS / gestor de secretos │
                                                             │ (esquema por módulo│   │ (claves maestras)        │
                                                             │  + cola de tareas) │   └──────────────────────────┘
                                                             └────────────────────┘
                                                                              │ salida (solo lectura)
                                                       ┌──────────────────────▼─────────────────────────┐
                                                       │ APIs de proveedores (Binance, Mercado Pago…)    │
                                                       │ Fuentes de cotizaciones                         │
                                                       └─────────────────────────────────────────────────┘
```

- **Un solo backend desplegable** (monolito modular). Sin microservicios: el equipo es chico, el dominio todavía está cambiando y las transacciones entre módulos (p. ej. importar un movimiento y actualizar su referencia externa) son más simples y seguras en un único proceso con una única base.
- **Un solo frontend web** que funciona en escritorio y móvil, instalable como PWA (§3).
- **La sincronización con proveedores ocurre en el backend**, nunca en el dispositivo: los secretos no salen del servidor y el móvil no necesita ejecutar tareas en segundo plano.

---

## 2. Backend: monolito modular

### 2.1 Módulos y responsabilidades

| Módulo | Responsabilidad | Entidades que posee | Puede depender de |
|---|---|---|---|
| `platform` | Infraestructura común: reloj, identificadores, `Money`, auditoría, cola de tareas, idempotencia, errores | AuditEvent, tabla de idempotencia, tabla de tareas | — |
| `identity` | Usuarios, espacios, membresías, invitaciones, **política de autorización** | User, FamilyWorkspace, WorkspaceMembership, Invitation | platform |
| `accounts` | Entidades financieras, cuentas, activos, permisos por cuenta, saldos | FinancialInstitution, FinancialAccount, AccountAccessGrant, Asset, BalanceSnapshot | identity, platform |
| `transactions` | Movimientos, categorías, transferencias, conciliación | Transaction, TransactionCategory, TransferLink | accounts, identity, platform |
| `integrations` | Adaptadores por proveedor, conexiones, consentimiento, secretos | ProviderConnection, ConnectionSecret | accounts, identity, platform |
| `sync` | Orquestación de sincronizaciones e importaciones, normalización, deduplicación, reintentos | SyncRun, ExternalTransactionReference | integrations, transactions, accounts, platform |
| `valuation` | Ingesta de cotizaciones, valuación, patrimonio | ExchangeRateSnapshot | accounts, platform |
| `reporting` | Consultas de solo lectura para reportes y exportaciones | — (lee vistas de otros módulos) | todos, solo lectura |

### 2.2 Reglas de los límites

1. Cada módulo es dueño de sus tablas, en **su propio esquema** de PostgreSQL. Ningún módulo escribe en tablas de otro.
2. La comunicación entre módulos es por **interfaces públicas Java** (servicios de aplicación) o por **eventos de dominio en proceso** (p. ej. `MembershipEnded` → `integrations` revoca conexiones, `accounts` revoca permisos).
3. Los eventos que deben sobrevivir a una caída (como la revocación de conexiones) se guardan en una **tabla *outbox*** en la misma transacción que el cambio que los origina, y se procesan con reintentos.
4. `reporting` lee a través de **vistas de base de datos** definidas por cada módulo dueño; no accede a tablas internas.
5. Los límites se verifican automáticamente en el *build* (propuesta: Spring Modulith o pruebas ArchUnit; ADR-007).
6. Un módulo podría extraerse como servicio en el futuro solo si hay una razón medible (escala, aislamiento de seguridad, ritmo de despliegue). No es un objetivo.

### 2.3 Puerto de integración

Cada proveedor implementa un **adaptador** con un contrato común, y la importación de archivos implementa el mismo contrato:

```
ProviderAdapter
  capabilities()                       → descriptor (saldos, movimientos, incremental, ventana máxima)
  listAccounts(connection)             → cuentas externas
  fetchBalances(connection, accounts)  → saldos informados
  fetchTransactions(connection, account, cursor | rango) → página de movimientos normalizados + nuevo cursor
  revoke(connection)                   → revocación en el proveedor, si existe
```

El módulo `sync` no conoce detalles de ningún proveedor: recibe movimientos normalizados (con `external_id` o los campos para la huella) y aplica la deduplicación, la conciliación y la trazabilidad descritas en [DOMAIN_MODEL.md](DOMAIN_MODEL.md) §5.

---

## 3. Estrategia web y móvil

### 3.1 Aclaración de conceptos

| Opción | Qué es | Qué **no** es |
|---|---|---|
| **Web responsive** | Sitio que se adapta al tamaño de pantalla y se usa desde el navegador. | No se instala ni recibe notificaciones. |
| **PWA (Progressive Web App)** | Web responsive + *manifest* + *service worker*: se puede **instalar** en la pantalla de inicio, abre en ventana propia sin barra del navegador, puede recibir **notificaciones push web** y cachear su interfaz. | **No es una app nativa**: no está en las tiendas por defecto, no accede a todas las APIs del sistema operativo y en iOS tiene restricciones adicionales. |
| **React Native** | Aplicación nativa (iOS y Android) escrita en React/TS que dibuja componentes nativos. Se distribuye por las tiendas. | No es la misma base de código de interfaz que la web: los componentes (`View`, `Text`) son distintos de los de HTML. |

### 3.2 Comparación

| Criterio | 1. React responsive + PWA | 2. React (web) + React Native (móvil) |
|---|---|---|
| **Tiempo de desarrollo** | Una sola interfaz. Menor tiempo hasta el MVP. | Dos interfaces (web y nativa), dos ciclos de prueba y dos *pipelines*. Bastante más esfuerzo, sobre todo para un equipo chico. |
| **Reutilización de código** | ~100 % de la interfaz y la lógica entre escritorio y móvil. | Se comparten tipos, cliente de API, validaciones y lógica de dominio en TS. La interfaz casi no se comparte (salvo con react-native-web, que agrega complejidad). |
| **Experiencia de usuario** | Buena para consulta, formularios y reportes. Gestos, transiciones y teclado algo menos pulidos que en nativo. | La mejor experiencia móvil: navegación, gestos y rendimiento nativos. |
| **Acceso al dispositivo** | Cámara (foto de comprobantes) y archivos (importar CSV) disponibles. Inicio de sesión con biometría vía *passkeys* (WebAuthn). Sin almacenamiento seguro del sistema (Keychain/Keystore), sin *widgets* y sin bloqueo biométrico propio de la app. | Acceso completo: almacenamiento seguro, biometría para desbloquear la app, *widgets*, *deep links* y tareas en segundo plano. |
| **Notificaciones** | Android: push web con la PWA instalada o desde el navegador. iOS/iPadOS: push web **solo si el usuario agregó la PWA a la pantalla de inicio** (desde iOS 16.4). Menos confiable para avisos críticos. | Push nativo confiable en ambas plataformas. |
| **Distribución y actualizaciones** | Por URL; se actualiza al instante con cada despliegue, sin revisión de tiendas. Sin presencia en tiendas (en Android se podría publicar más adelante como TWA). | Por App Store y Google Play: revisión de cada versión, cuentas de desarrollador pagas y usuarios con versiones viejas que hay que soportar (las actualizaciones *over-the-air* mitigan solo la parte JS). |
| **Mantenimiento** | Una base de código, un conjunto de pruebas E2E en navegador. | Dos bases de interfaz, actualizaciones de SDK de iOS/Android y de React Native, pruebas en dispositivos. |
| **Costos operativos** | Solo hosting web. | Cuentas de desarrollador de las tiendas, más CI para compilar binarios (por ejemplo, macOS para iOS) y más tiempo de QA. |
| **Compatibilidad con el equipo** | Encaja con el conocimiento actual (JS, CSS, HTML, React) y con React + TS. | Requiere aprender React Native, sus herramientas (Expo, compilación nativa) y la publicación en tiendas. |

### 3.3 Recomendación: **opción 1, React + TypeScript responsive como PWA** (ADR-003, decisión D-03)

**Justificación:**
1. El valor central del producto (consolidar, sincronizar, valuar, reportar) depende del **backend**: la sincronización corre en el servidor, así que el móvil no necesita tareas en segundo plano.
2. Las funciones del dispositivo que pide el MVP (cámara opcional, importar archivos, inicio de sesión con biometría vía *passkeys*) están disponibles en la web.
3. Una sola interfaz reduce el tiempo hasta el MVP y la superficie de errores en un producto donde la prioridad es la **integridad de los datos**, no la experiencia nativa.
4. Encaja con las habilidades actuales del equipo.

**Capacidades exactas que tendría la PWA en el MVP:**
- Uso desde el navegador en escritorio y móvil, con diseño adaptado a pantallas chicas (*mobile-first*).
- Instalación en la pantalla de inicio (Android y iOS) con ícono propio y ventana sin barra del navegador.
- Interfaz cacheada para abrir rápido. **Los datos financieros no se guardan para uso sin conexión** por defecto (decisión de seguridad: un dispositivo perdido no debe contener movimientos en caché). Sin conexión se muestra un aviso, no datos viejos.
- Inicio de sesión con *passkeys*, que en el dispositivo usan Face ID o la huella.
- **Sin** notificaciones push en el MVP. Cuando se agreguen, en iOS solo funcionarán con la PWA instalada.
- **Sin** presencia en tiendas, sin bloqueo biométrico propio de la app y sin *widgets*.

**Disparadores para pasar a una app nativa** (cualquiera de ellos reabre D-03):
- Las notificaciones pasan a ser críticas (alertas de gasto, avisos de reautorización) y la tasa de instalación de la PWA en iOS es baja.
- Se necesita presencia en tiendas por razones comerciales o de confianza del usuario.
- Se requiere almacenamiento seguro del dispositivo o bloqueo biométrico propio de la app.
- Las métricas de uso muestran que la experiencia móvil web limita la retención.

**Cómo se mantiene abierta la opción nativa sin costo extra hoy:**
- La API es la única forma de acceder a los datos (contrato OpenAPI); cualquier cliente nuevo la consume igual.
- Tipos, cliente de API generado, validaciones y formato de importes/fechas viven en un paquete TS **sin dependencias de DOM**, reutilizable desde React Native.
- Intermedio posible: empaquetar la misma web con Capacitor para publicarla en tiendas y acceder a algunas APIs nativas, antes de una reescritura en React Native.

---

## 4. Frontend

| Tema | Decisión propuesta |
|---|---|
| Base | React + TypeScript, compilado con Vite (ADR-004). |
| Datos | Cliente de API generado desde el contrato OpenAPI; caché de consultas en memoria (p. ej. TanStack Query), que se limpia al cerrar sesión. |
| Importes | Se reciben como *strings* decimales; se operan con una biblioteca decimal; **nunca** se convierten a `number`. Formato `es-AR`. |
| Permisos en la interfaz | Solo para ocultar o deshabilitar acciones. La autorización real es del backend (PRD FR-PR-01). |
| PWA | *Manifest* + *service worker* que cachea solo los recursos estáticos; las respuestas de la API se piden siempre a la red. |
| Accesibilidad | WCAG 2.1 AA; pruebas automatizadas de accesibilidad en E2E. |

---

## 5. Datos

### 5.1 PostgreSQL

- Un esquema por módulo (§2.2). Importes en `NUMERIC(38,18)` con la escala del activo validada en el dominio.
- Índices obligatorios por `workspace_id` y por (`account_id`, `asset_id`, `operation_at`).
- Índices únicos parciales para las reglas de unicidad del modelo (membresía activa, sincronización en curso, identificador externo).

### 5.2 Migraciones (ADR-008)

- **Flyway** con scripts SQL versionados en el repositorio.
- Una migración aplicada **nunca se edita**; las correcciones son migraciones nuevas.
- Cambios incompatibles con el patrón **expandir → migrar datos → contraer**, en despliegues separados, para no cortar el servicio.
- En CI, todas las migraciones se aplican sobre un PostgreSQL real en contenedor antes de correr las pruebas.
- En producción, las migraciones se ejecutan como **paso explícito del despliegue**, con respaldo previo, no al arrancar cada instancia.

### 5.3 Respaldo y recuperación

| Aspecto | Propuesta |
|---|---|
| Mecanismo | PostgreSQL administrado con respaldos automáticos y recuperación a un punto en el tiempo (PITR). |
| Objetivos | RPO ≤ 15 min, RTO ≤ 4 h (NFR-10). |
| Retención | 30 días de PITR + copia mensual cifrada en otra región o cuenta. |
| Cifrado | Respaldos cifrados en reposo. Los secretos de conexiones van, además, cifrados por la aplicación (§6.3). |
| Prueba | Restauración completa en un entorno aislado **al menos una vez por trimestre**, con verificación de conteos y de saldos calculados. |
| Pérdida de la clave maestra | Las conexiones no pueden descifrarse → los usuarios deben reconectar. Los datos financieros normalizados no dependen de esa clave y no se pierden. Las claves maestras tienen protección contra borrado en el KMS. |

---

## 6. Seguridad

### 6.1 Aislamiento por espacio familiar

- Todas las tablas con datos del espacio tienen `workspace_id` y todos los repositorios **exigen** el `workspace_id` como parámetro: no existen métodos del tipo "buscar por id" sin espacio.
- El `workspace_id` se resuelve en el servidor a partir de la **membresía activa** del usuario autenticado y se compara con el del recurso pedido.
- Un recurso de otro espacio responde **404** (PRD FR-PR-03).
- **Defensa en profundidad (propuesta, D-13):** *Row-Level Security* de PostgreSQL en las tablas con `workspace_id`, con el espacio fijado por transacción (`SET LOCAL`). Si un desarrollador olvida un filtro, la base no devuelve filas de otro espacio. Hay que evaluar su interacción con el *pool* de conexiones antes de adoptarlo.
- Pruebas AC-02 automatizadas para **cada** endpoint.

### 6.2 Autorización en el backend

- Autenticación: tokens OIDC validados por Spring Security (firma, emisor, audiencia, expiración).
- **Un único servicio de políticas** (`identity`) responde preguntas como `puede(usuario, acción, recurso)`, combinando rol del espacio + permiso por cuenta + titularidad (PRD §5.G). Los controladores y servicios lo invocan; no hay reglas de permisos repartidas.
- Los permisos se leen de la base en cada solicitud (con caché de muy corta duración, si hace falta) para que una revocación tenga efecto inmediato (PRD FR-PR-04).
- La matriz de autorización del PRD se convierte en una **tabla de pruebas parametrizadas**: cada fila (rol × acción × situación de la cuenta) es un caso.

### 6.3 Protección de credenciales de proveedores

| Aspecto | Diseño |
|---|---|
| Almacenamiento | `ConnectionSecret` en un esquema propio del módulo `integrations`. Ningún otro módulo tiene permisos de base de datos sobre él. |
| Cifrado | **Cifrado de sobre**: por cada secreto se genera una clave de datos (AES-256-GCM); el secreto se cifra con ella; la clave de datos se cifra (*wrap*) con una clave maestra que vive en el **KMS** y nunca sale de él. Se guardan el texto cifrado, la clave de datos cifrada y la versión de la clave maestra. |
| Vinculación | Los datos autenticados adicionales (AAD) del cifrado incluyen `connection_id` y `workspace_id`: un texto cifrado copiado a otra fila no se puede descifrar. |
| Uso | Se descifra solo en memoria, dentro de la tarea de sincronización, y se descarta al terminar. |
| Logs | Filtros que enmascaran *tokens*, keys y encabezados `Authorization`. Prueba automatizada: ningún log de las pruebas de integración contiene los valores de prueba. |
| Rotación | (a) Clave maestra: rotación periódica en el KMS (propuesta: anual) y un proceso que recifra las claves de datos con la versión nueva. (b) *Tokens* OAuth: renovación con *refresh token* cuando el proveedor lo permite (p. ej. Mercado Pago con `offline_access`). (c) API keys: las rota el usuario; la app recomienda hacerlo y avisa si la key es antigua. |
| Revocación | Al desconectar, quitar a un integrante o eliminar el espacio: se invoca la revocación del proveedor si existe; se **borra** el secreto (*crypto-shredding*); la conexión pasa a `REVOCADA`; se audita. Si el proveedor no permite revocar desde afuera (API keys de Binance), se le indica al usuario cómo eliminar la key en el proveedor. |
| Permisos mínimos | Se rechazan las keys con permisos de escritura cuando el proveedor permite verificarlos (PRD FR-IN-04). Si se adopta la restricción por IP de Binance, el backend necesita una IP de salida fija. |

### 6.4 Cifrado y gestión de secretos de la aplicación

- TLS 1.2+ en todo el tránsito (cliente↔API, API↔base, API↔proveedores).
- Cifrado en reposo del disco de la base y de los respaldos (lo da el servicio administrado).
- Cifrado a nivel de aplicación para `ConnectionSecret` y `raw_payload` (datos crudos del proveedor).
- Credenciales de la aplicación (base de datos, *client secret* OAuth de la app ante proveedores, acceso al KMS) en el **gestor de secretos** del proveedor cloud, inyectadas en tiempo de ejecución. **Nunca en el repositorio**: escaneo de secretos en CI.
- Proveedor cloud por decidir (D-14). El diseño solo supone que haya PostgreSQL administrado, KMS y gestor de secretos.

### 6.5 Registro de auditoría

- `AuditEvent` de solo inserción (el rol de base de datos de la aplicación no puede modificarlo ni borrarlo).
- Eventos mínimos: alta y baja de integrantes, cambios de rol, invitaciones, cambios de visibilidad y permisos, conexión, reautorización y revocación, exportaciones, edición, exclusión o eliminación de movimientos, confirmación o rechazo de transferencias, ajustes de conciliación, eliminación del espacio.
- Sin secretos y con los datos sensibles enmascarados. IP guardada como *hash*.

### 6.6 Otros controles

- MFA o *passkeys* para acciones de Propietario y para conectar entidades (D-11).
- Límites de tasa por usuario e IP en la API, especialmente en invitaciones y en la autenticación.
- Encabezados de seguridad (CSP estricta, HSTS); cookies `Secure`, `HttpOnly`, `SameSite` si se usan sesiones.
- Dependencias con escaneo de vulnerabilidades en CI.
- Revisión legal de privacidad (Ley 25.326) antes de producción.

---

## 7. Confiabilidad

### 7.1 Sincronización y reintentos

- **Cola de tareas persistida en PostgreSQL** (ADR-006): sin *broker* externo en el MVP. Los *workers* toman tareas con `SELECT … FOR UPDATE SKIP LOCKED` o una biblioteca equivalente.
- Programación: sincronización incremental periódica por conexión (propuesta: cada 6 h, ajustable por proveedor según sus límites) y a pedido del usuario (con límite de frecuencia).
- Una sola ejecución en curso por conexión (índice único parcial en `SyncRun`).
- Procesamiento **por tramos**: cada tramo (p. ej. una página o un rango de fechas) se guarda en su propia transacción; el cursor avanza solo después de confirmar el tramo. Una caída deja los datos anteriores intactos (AC-09).
- **Reintentos** solo para errores transitorios: espera exponencial con *jitter* (p. ej. 1 min, 5 min, 30 min, 2 h), respetando los encabezados de espera y los límites del proveedor, con un máximo de 5 intentos. Luego, la conexión pasa a `ERROR_TRANSITORIO` visible y se reintenta en la siguiente ejecución programada.
- *Circuit breaker* por proveedor: si un proveedor falla para muchas conexiones, se pausan sus sincronizaciones durante un tiempo para no agotar los límites.

### 7.2 Idempotencia

| Operación | Mecanismo |
|---|---|
| Altas desde la API (movimientos manuales, invitaciones, transferencias) | Encabezado `Idempotency-Key`; se guarda (usuario, clave, *hash* de la solicitud, respuesta) durante 24 h. La misma clave con otro cuerpo responde 422. |
| Importación de movimientos | *Upsert* por (`account_id`, `external_id`) o por (`account_id`, `fingerprint`, `occurrence_index`). |
| Reimportación de archivos | Se reconoce por `file_sha256`; se procesa igual y no crea duplicados. |
| Eventos entre módulos | Los consumidores registran los eventos procesados (por id) para ignorar repeticiones del *outbox*. |
| Revocaciones | Repetibles sin efecto adicional. |

### 7.3 Gestión de errores

- Respuestas de error de la API en formato **Problem Details (RFC 9457)**, con un código estable (p. ej. `ACCOUNT_NOT_FOUND`, `PERMISSION_DENIED`, `IDEMPOTENCY_KEY_REUSED`) y sin trazas internas.
- Validación de entrada en el borde (DTO) y reglas de negocio en el dominio; los errores de dominio se traducen a 409 o 422.
- Errores de sincronización clasificados según PRD FR-SY-08, cada uno con su política de reintento y su mensaje para el usuario.
- Errores inesperados: se registran con el identificador de solicitud y el usuario ve un mensaje genérico con ese identificador.

---

## 8. Observabilidad

| Señal | Contenido |
|---|---|
| Logs | JSON estructurado con `request_id`, `workspace_id`, `user_id` y `sync_run_id`. Sin *tokens*, sin cuerpos de proveedores, sin descripciones de movimientos. |
| Métricas | Latencia y errores por endpoint; por proveedor: sincronizaciones exitosas y fallidas, clase de error, latencia, límites alcanzados, movimientos creados, actualizados y en conflicto; antigüedad de la última sincronización exitosa; cola de tareas (pendientes, demora); antigüedad de las cotizaciones. |
| Trazas | OpenTelemetry desde la solicitud HTTP hasta la base y las llamadas a proveedores. |
| Alertas | Tasa de fallos por proveedor por encima del umbral; cotizaciones vencidas; demora de la cola; picos de 401/403/404 (posible enumeración); fallo de respaldo. |
| Salud | *Endpoints* de *liveness* y *readiness*; la caída de un proveedor **no** marca la aplicación como no saludable. |

---

## 9. Estrategia de pruebas

| Nivel | Herramienta propuesta | Qué cubre |
|---|---|---|
| Unitarias de dominio | JUnit 5 (+ pruebas basadas en propiedades para la aritmética de importes) | Reglas de `Money`, transferencias, conciliación, huella de deduplicación, estados |
| Integración | Spring Boot Test + **Testcontainers (PostgreSQL)** | Repositorios, unicidad, idempotencia, migraciones, AC-05, AC-09, AC-10 |
| Autorización | Pruebas parametrizadas generadas desde la matriz del PRD | AC-02, AC-03, AC-11 sobre **todos** los endpoints |
| Contrato de proveedores | Respuestas grabadas y anonimizadas (*fixtures*) por adaptador; **nunca** credenciales reales en el repositorio | Normalización y casos borde de cada proveedor |
| API | Pruebas HTTP contra el contrato OpenAPI | Formatos, errores RFC 9457, idempotencia |
| E2E | Playwright en navegador de escritorio y móvil emulado | Flujos principales y accesibilidad |

Cada criterio de aceptación (AC-01 a AC-12) tiene al menos una prueba automatizada asociada antes de considerar cerrada su fase.

---

## 10. Fuera del alcance de esta arquitectura

- Operaciones financieras de escritura (D-01).
- Microservicios, *brokers* de mensajería o bases de datos adicionales.
- Aplicaciones nativas (hasta que se cumplan los disparadores de §3.3).
- Despliegue e infraestructura concreta (D-14).
