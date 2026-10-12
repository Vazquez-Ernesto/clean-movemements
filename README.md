# clean-movemements

Aplicación de finanzas personales y familiares (web y móvil) con integraciones de solo lectura con entidades financieras, soporte multimoneda (ARS, USD, criptoactivos) y uso familiar compartido.

> **Estado:** planificación (Fase 2). Todavía no hay código de producto: el repositorio contiene documentación y un *spike* descartable de integración.

## Documentación

| Documento | Contenido |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Requerimientos funcionales y no funcionales, matriz de permisos, alcance del MVP, criterios de aceptación y roadmap |
| [docs/DOMAIN_MODEL.md](docs/DOMAIN_MODEL.md) | Entidades, relaciones, reglas de integridad y estrategias (deduplicación, saldos, multimoneda) |
| [docs/INTEGRATIONS_ASSESSMENT.md](docs/INTEGRATIONS_ASSESSMENT.md) | Matriz de investigación de integraciones por entidad, con fuentes y estado |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Monolito modular, estrategia web/móvil, seguridad, confiabilidad y observabilidad |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decisiones tomadas y decisiones pendientes de aprobación |

## Spikes (código descartable, no es producto)

| Carpeta | Objetivo |
|---|---|
| [spikes/binance-readonly](spikes/binance-readonly/README.md) | Verificar con una cuenta real la lectura de saldos y movimientos de Binance con una key de solo lectura |

## Stack previsto

React + TypeScript · Java + Spring Boot · PostgreSQL
