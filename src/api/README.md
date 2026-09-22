# src/api

Serviço HTTP em Fastify + TypeScript estrito, empacotado em imagem Distroless (ADR-001).

**Status:** não iniciado — ver `docs/CONTEXT.md` § 1 "Próximos passos imediatos".

## Responsabilidade

- Validação de entrada via Zod (fronteira única de dado externo).
- Orquestração de casos de uso, publicação em filas `pgmq`.
- Geração de contrato OpenAPI a partir dos schemas Zod (ADR-009).
- `startupProbe` / `livenessProbe` / `readinessProbe` reais (spec técnica § 4.3).

## O que não faz

- Não acessa Postgres diretamente sem passar pela camada de repositório com RLS respeitado.
- Não contém lógica condicional de negócio complexa — isso é responsabilidade do motor de regras/workflow em `src/shared` (ADR-004, ADR-006).
