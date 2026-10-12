# Registro de decisiones

| Campo | Valor |
|---|---|
| Fecha | 2026-10-12 |
| Relacionado | [PRD.md](PRD.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [DOMAIN_MODEL.md](DOMAIN_MODEL.md) |

Estados: **Aceptada** (confirmada por el usuario) · **Propuesta** (recomendación técnica; se considera aceptada salvo objeción) · **Pendiente de aprobación** (requiere una decisión explícita antes de implementar lo que afecta).

---

## Parte 1. Decisiones técnicas (ADR)

### ADR-001 — Stack: React + TypeScript, Java + Spring Boot, PostgreSQL
- **Estado:** Aceptada (decisiones de producto P-5, P-6, P-7).
- **Contexto:** El repositorio estaba vacío; no hay código previo que justifique otra elección.
- **Decisión:** Frontend React + TypeScript; backend Java (LTS vigente) + Spring Boot; PostgreSQL.
- **Consecuencias:** El equipo puede reutilizar sus conocimientos de React y JS. Java + `BigDecimal` y PostgreSQL + `NUMERIC` cubren bien la aritmética decimal exacta.

### ADR-002 — Monolito modular
- **Estado:** Propuesta.
- **Contexto:** Equipo chico, dominio en evolución, operaciones que cruzan módulos y requieren consistencia (importar un movimiento + registrar su referencia externa + auditar).
- **Decisión:** Un único backend desplegable con módulos `platform`, `identity`, `accounts`, `transactions`, `integrations`, `sync`, `valuation`, `reporting` (ARCHITECTURE §2).
- **Alternativas descartadas:** Microservicios (costo operativo y consistencia distribuida sin beneficio actual).
- **Consecuencias:** Hay que hacer cumplir los límites con herramientas (ADR-007); de lo contrario el monolito se acopla.

### ADR-003 — Web y móvil con una PWA en React + TypeScript
- **Estado:** Aceptada el 2026-10-12 (D-03).
- **Decisión:** Web responsive instalable como PWA. React Native se reevalúa si se cumple alguno de los disparadores de ARCHITECTURE §3.3.
- **Consecuencias:** Sin presencia en tiendas ni push en el MVP; en iOS, el push requerirá la PWA instalada. Se mantiene un paquete TS sin dependencias de DOM para reutilizarlo en el futuro.

### ADR-004 — Herramientas de frontend
- **Estado:** Propuesta.
- **Decisión:** Vite como herramienta de *build*; cliente de API generado desde OpenAPI; biblioteca decimal para importes; Playwright para E2E.
- **Consecuencias:** Ningún importe pasa por `number` de JS.

### ADR-005 — Representación de importes
- **Estado:** Propuesta.
- **Decisión:** Todo importe es (cantidad decimal exacta, activo). `NUMERIC(38,18)` en la base, `BigDecimal` en Java, *string* en JSON. Cantidades positivas con `direction` explícita. Redondeo `HALF_EVEN` solo al guardar en la escala del activo o al presentar.
- **Alternativas descartadas:** Enteros en unidades mínimas (`BIGINT`): el máximo de `BIGINT` es ≈ 9,22 × 10¹⁸, así que con 18 decimales (p. ej. ETH) solo representa hasta ≈ 9,22 unidades, lo que es insuficiente; punto flotante: inexacto.
- **Consecuencias:** Un tipo de valor `Money`/`Quantity` en el módulo `platform` que impide sumar activos distintos.

### ADR-006 — Cola de tareas en PostgreSQL
- **Estado:** Propuesta.
- **Decisión:** Las sincronizaciones, reintentos, el *outbox* y la ingesta de cotizaciones usan una cola persistida en PostgreSQL (biblioteca o `SKIP LOCKED`).
- **Alternativas descartadas por ahora:** RabbitMQ, Kafka (más infraestructura sin una necesidad de volumen).
- **Consecuencias:** Revisar si el volumen de tareas crece mucho.

### ADR-007 — Verificación automática de límites entre módulos
- **Estado:** Propuesta.
- **Decisión:** Spring Modulith o pruebas ArchUnit en el *build* para impedir dependencias no permitidas y accesos a tablas de otros módulos.

### ADR-008 — Migraciones con Flyway
- **Estado:** Propuesta.
- **Decisión:** SQL versionado, migraciones inmutables, patrón expandir/contraer, ejecución explícita en el despliegue y verificación en CI con PostgreSQL real (ARCHITECTURE §5.2).

### ADR-009 — Credenciales de proveedores con cifrado de sobre y KMS
- **Estado:** Propuesta.
- **Decisión:** ARCHITECTURE §6.3. Nunca texto plano; claves maestras en el KMS; AAD con `connection_id` y `workspace_id`; *crypto-shredding* al revocar.

### ADR-010 — Identificadores UUID v7
- **Estado:** Propuesta.
- **Decisión:** UUID v7 generados por el backend para todas las entidades.
- **Motivo:** No son enumerables (a diferencia de los secuenciales) y, al estar ordenados por tiempo, se indexan mejor que los UUID v4.

### ADR-011 — Saldos calculados desde anclas, sin saldo editable duplicado
- **Estado:** Propuesta.
- **Decisión:** DOMAIN_MODEL §5.3. Saldo = ancla + movimientos confirmados. Conciliación explícita frente al saldo informado. Sin caché en el MVP; si se agrega, se actualiza en la misma transacción y se verifica periódicamente.

### ADR-012 — Integraciones de solo lectura y sin credenciales bancarias
- **Estado:** Aceptada (requisito explícito del usuario), ver también D-01.
- **Decisión:** Solo mecanismos oficiales (OAuth, keys de solo lectura, Finanzas Abiertas). Prohibido el *scraping* y pedir contraseñas, OTP o claves privadas. Alternativa obligatoria: archivo y carga manual.

---

## Parte 2. Decisiones pendientes de aprobación

| ID | Pregunta | Opciones | Recomendación | Afecta a |
|---|---|---|---|---|
| **D-01** | ¿Se habilitan operaciones financieras de escritura (pagos, transferencias, trading)? | (a) No, solo lectura; (b) Sí, en una fase posterior con evaluación de seguridad y regulatoria | **(a)** hasta una nueva decisión explícita | Integraciones, permisos de las conexiones |
| **D-02** | ¿Cuál es la primera integración automática? | (a) Binance (key de solo lectura, documentada); (b) Mercado Pago (OAuth + reportes; cobertura de cuentas personales incierta); (c) ambas en paralelo | ✅ **Aprobada el 2026-10-12: (a) Binance.** ⏸️ **En pausa el mismo día:** el usuario no tiene acceso a la cuenta; su *spike* (`spikes/binance-readonly/`) queda listo. Se avanza con el *spike* de Mercado Pago (`spikes/mercadopago-readonly/`). **Si Mercado Pago resulta viable antes de que se retome Binance, conviene reabrir D-02** para implementar Mercado Pago primero | Roadmap Fase 4; obliga a tener multiactivo en la Fase 3 |
| **D-03** | Estrategia web y móvil | (a) PWA; (b) React + React Native; (c) PWA empaquetada con Capacitor | ✅ **Aprobada el 2026-10-12: (a) PWA**, con los disparadores de ARCHITECTURE §3.3 | Frontend, costos, notificaciones |
| **D-04** | ¿Qué cotización del USD se usa por defecto para valuar? | Oficial minorista (BNA), oficial mayorista (BCRA), MEP, CCL u otra; y si se usa compra, venta o promedio | Elegir **una por defecto y hacerla configurable por espacio**; siempre visible en la valuación. Sugerencia a validar: MEP (refleja mejor el valor de los USD que tienen las familias), con la oficial disponible | Valuación, patrimonio |
| **D-05** | ¿Se permite el ajuste de conciliación como movimiento? | (a) Sí, como `ADJUSTMENT` explícito con motivo; (b) No: solo redefinir el ancla del saldo; (c) ambas | **(c)**: el usuario elige; ambas auditadas | Movimientos, conciliación |
| **D-06** | ¿Cómo se reconocen las compras con tarjeta en cuotas? | (a) Gasto total en la fecha de compra; (b) gasto por cuota en cada resumen | **(b)** para los reportes de flujo mensual, mostrando la deuda futura aparte | Tarjetas, reportes |
| **D-07** | ¿Un usuario puede usar varios espacios en el MVP? | (a) El modelo lo admite pero la interfaz trabaja con uno activo; (b) varios con selector | **(a)** | Identidad, interfaz |
| **D-08** | ¿Qué pasa con las cuentas personales de quien deja el espacio? | (a) Se archivan y se borran tras la retención; (b) se mueven a un espacio personal del usuario; (c) el usuario elige al salir | **(c)** con (b) como opción por defecto, si el costo de implementarlo es razonable; si no, (a) con exportación previa | Identidad, cuentas, privacidad |
| **D-09** | Período de gracia antes de borrar un espacio eliminado | 7, 30 o 90 días | **30 días** | Retención, respaldos |
| **D-10** | Una transferencia de mi cuenta personal a la cuenta personal de otro integrante, ¿es interna? | (a) Interna y neutra a nivel espacio; (b) gasto para uno e ingreso para el otro; (c) neutra a nivel espacio y visible como salida/entrada en las vistas personales | **(c)** | Transferencias, reportes |
| **D-11** | Proveedor de identidad y MFA | (a) IdP administrado (servicio externo); (b) Keycloak autogestionado; (c) Spring Authorization Server propio | **(a) o (b)** según el costo en el plan gratuito; MFA o *passkeys* obligatorios para conectar entidades | Seguridad, costos |
| **D-12** | Retención del dato crudo del proveedor (`raw_payload`) | 90 días, 13 meses o indefinida | **13 meses** cifrado; luego se conservan solo el identificador y la huella | Privacidad, almacenamiento |
| **D-13** | ¿Se usa *Row-Level Security* de PostgreSQL como defensa adicional? | (a) Sí, desde la Fase 3; (b) No, solo filtros en la aplicación | **(a)**, previa prueba de concepto con el *pool* de conexiones | Seguridad, persistencia |
| **D-14** | Proveedor cloud y hosting | Por evaluar (requisitos: PostgreSQL administrado con PITR, KMS, gestor de secretos, IP de salida fija opcional) | Decidir en la Fase 8 comparando costos para el plan gratuito; no bloquea las fases 3 a 7 | Infraestructura, costos |
