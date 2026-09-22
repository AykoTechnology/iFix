# src/shared

Tipos TypeScript e schemas Zod compartilhados entre `api` e `workers`. Também hospeda:

- **Motor de workflow declarativo** (ADR-004) — interpretador determinístico de statecharts JSON.
- **Motor de regras de negócio** (ADR-006) — avaliador puro de condições AST-JSON, desacoplado do motor de workflow.

**Status:** não iniciado.

## Regra de dependência

Este pacote nunca depende de framework HTTP (`fastify`) nem de bibliotecas de UI — é puro TypeScript/Zod, testável isoladamente e importável tanto por `src/api` quanto por `src/workers`.
