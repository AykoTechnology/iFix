# iFix — Plataforma Cloud-Native ESM/ITSM

Plataforma de Gestão de Serviços Empresariais (ESM) e de TI (ITSM), construída do zero para Kubernetes: Node.js 22 + TypeScript estrito + Fastify, imagens Google Distroless, Supabase Self-Hosted (PostgreSQL 16, RLS, pgmq, Realtime, GoTrue, pgvector), frontend React 19 + Tailwind com conformidade WCAG 2.2 AA obrigatória.

## Comece por aqui

| Se você quer...                                                                              | Leia                                                                                                              |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **A especificação completa** — arquitetura, backlog, ADRs, requisitos não-funcionais, riscos | **[`docs/ESM_ITSM_PLATFORM_SPEC.md`](docs/ESM_ITSM_PLATFORM_SPEC.md)**                                            |
| Saber o que já existe e o que fazer a seguir                                                 | [`docs/CONTEXT.md`](docs/CONTEXT.md)                                                                              |
| O índice de épicos e Issues                                                                  | [`docs/BACKLOG.md`](docs/BACKLOG.md)                                                                              |
| Entender uma decisão arquitetural                                                            | [`docs/ADR/`](docs/ADR/) _(gerado da § 9 da especificação)_                                                       |
| Implementar UI fiel ao design                                                                | [`/design-system/`](design-system/) (tokens) + [`docs/design-system/`](docs/design-system/) (componentes e telas) |
| Contribuir com código                                                                        | [`CONTRIBUTING.md`](CONTRIBUTING.md)                                                                              |

## Estrutura do monorepo

```
.github/          Workflows de CI/CD, templates de Issue/PR
charts/           Helm charts (api, workers, infra)
design-system/    tokens.json (DTCG) — fonte única de UI, compilada por Style Dictionary
docs/             Especificação, CONTEXT.md, ADR/, design-system/, PLAYBOOKS/, api/, runbooks/
scripts/          Governança (sync-adrs.mjs) e provisionamento do banco local/CI (local-db/)
src/api/          Serviço HTTP Fastify (TypeScript estrito, Distroless)
src/workers/      Consumidores assíncronos de filas pgmq
src/web/          Frontend React 19 + Tailwind
src/shared/       Zod compartilhado, motor de workflow (ADR-004) e motor de regras (ADR-006)
supabase/         Migrações SQL versionadas + políticas RLS, seeds de desenvolvimento
tests/            Suíte de integração contra PostgreSQL real (ADR-018), sem mocks
```

## Princípios inegociáveis

1. **RLS mandatório** em toda tabela de negócio, em dois eixos: locatário e espaço de serviço (ADR-003, ADR-012).
2. **Auditoria universal automática** por trigger de banco, imutável (ADR-007).
3. **Zero scripts imperativos em regra de negócio** — DSL declarativa (ADR-004) ou motor de regras (ADR-006), nunca `eval()`.
4. **WCAG 2.2 AA é critério de bloqueio**, com mecanismo de CI que o sustenta (ADR-005).
5. **Imagens Distroless**, `nonroot`, sistema de arquivos somente leitura (ADR-001).
6. **Consumidores de fila idempotentes** — `pgmq` é _at-least-once_ (ADR-002).
7. **Fonte única para cada contrato**: API vem do Zod (ADR-009), UI vem do `tokens.json` (ADR-011).

As 11 Regras de Ouro, cada uma com o gate de CI que a torna mecânica, estão na § 10.1 da especificação.

## Status

**Fase 0 — Fundação, em andamento.** Além da documentação viva, ADRs, backlog e tokens de design, já existe código executável:

- **Banco**: migração de fundação com o padrão de referência de RLS nos dois eixos, auditoria por trigger imutável e `uuid_generate_v7()`.
- **API**: servidor Fastify com contexto de requisição aplicado por GUC transacional, três probes distintas e contrato OpenAPI 3.1 derivado do Zod.
- **Esteira**: 9 dos 12 gates da § 6.4 ativos; imagem Distroless `nonroot` com varredura Trivy.
- **Testes**: 63 testes contra PostgreSQL real, incluindo testes estruturais que reprovam qualquer tabela sem RLS forçada.

Pendentes da fase: pipeline do Style Dictionary (gate 10), Storybook com addon-a11y (gate 7), Helm charts (gate 11), fila `pgmq` com consumidor idempotente e SDK OpenTelemetry. Ver `docs/CONTEXT.md` § 1.

## Governança de documentação

Os arquivos em `docs/ADR/` são **gerados** a partir da § 9 da especificação:

```bash
node scripts/sync-adrs.mjs          # regenera os ADRs
node scripts/sync-adrs.mjs --check  # falha se houver divergência (gate 12 da esteira)
```

## Licença

Pendente de definição — ver risco **R11** na § 12 da especificação.
