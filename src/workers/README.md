# src/workers

Consumidores assíncronos das filas `pgmq` (ADR-002).

**Status:** não iniciado.

## Responsabilidade

- Consumo idempotente de mensagens (Regra de Ouro § `docs/CONTEXT.md`).
- Correlação AIOps (`incident_correlation`), notificações (`notifications_outbox`), auditoria assíncrona.
- Graceful shutdown: pausar consumo e fechar pool de banco em até 30s ao receber `SIGTERM`.

Ver `docs/CONTEXT.md` § 3 "Mapa de filas" para a lista viva de filas e seus consumidores.
