# iFix — Plataforma Cloud-Native ESM/ITSM

Plataforma de Gestão de Serviços Empresariais (ESM) e de TI (ITSM), construída do zero para Kubernetes: Node.js 22 + TypeScript estrito + Fastify, imagens Google Distroless, Supabase Self-Hosted (Postgres 16, RLS, pgmq, Realtime, GoTrue, pgvector), frontend React 19 + Tailwind com conformidade WCAG 2.2 AA obrigatória.

## Comece por aqui

| Se você quer... | Leia |
|---|---|
| Entender a arquitetura e a stack completa | `docs/ESPECIFICACAO_TECNICA.md` |
| Ver o estado atual do projeto e o que fazer a seguir | `docs/CONTEXT.md` |
| Ver o backlog de produto (12 épicos, 6 fases) | `docs/BACKLOG.md` |
| Entender uma decisão arquitetural | `docs/ADR/` |
| Implementar UI fiel ao design | `docs/design-system/` (tokens, componentes, telas de referência) |
| Contribuir com código | `CONTRIBUTING.md` |

## Estrutura do monorepo

```
.github/          Workflows de CI/CD, templates de Issue/PR
charts/           Helm charts (api, workers, infra)
docs/             Documentação viva: CONTEXT.md, ADR/, BACKLOG.md, design-system/, PLAYBOOKS/, api/, runbooks/
src/api/          Serviço HTTP Fastify (TypeScript estrito, Distroless)
src/workers/      Consumidores assíncronos de filas pgmq
src/web/          Frontend React 19 + Tailwind
src/shared/       Tipos/Zod compartilhados, motor de workflow (ADR-004) e motor de regras (ADR-006)
supabase/         Migrações SQL versionadas + políticas RLS, seeds de desenvolvimento
```

## Princípios inegociáveis

1. **RLS mandatório** em toda tabela de negócio (ADR-003).
2. **Zero scripts imperativos em regra de negócio** — tudo via DSL declarativa (ADR-004) ou motor de regras (ADR-006), nunca `eval()`.
3. **WCAG 2.2 AA é critério de bloqueio**, não meta aspiracional (ADR-005).
4. **Imagens Distroless**, `nonroot`, sistema de arquivos somente leitura (ADR-001).
5. **Consumidores de fila idempotentes** (ADR-002).

A lista completa está em `docs/CONTEXT.md` § "Regras de Ouro".

## Status

Fase 0 — Fundação (documentação viva e scaffolding). Nenhum código de aplicação foi escrito ainda. Ver `docs/CONTEXT.md` § "Próximos passos imediatos".

## Licença

Definição pendente — ver `docs/BACKLOG.md` § Pendências.
