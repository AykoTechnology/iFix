# CONTEXT.md — Estado Vivo do Projeto iFix

> Documento mestre de estado. Atualizado a cada módulo concluído. Se você é um agente de IA (Claude Code, Codex) ou um novo desenvolvedor, leia este arquivo inteiro antes de abrir um PR.

## 0. O que é o iFix

Plataforma cloud-native de **ESM/ITSM** (Enterprise & IT Service Management), multi-domínio (TI, RH, Finanças, Instalações Físicas), construída do zero sobre Node.js 22 + TypeScript + Fastify + Supabase Self-Hosted, rodando em Kubernetes com imagens Distroless. Ver `docs/ESPECIFICACAO_TECNICA.md` para a spec original completa e `docs/BACKLOG.md` para o backlog de 12 épicos.

## 1. Status atual

**Fase:** 0 — Fundação (planejamento e scaffolding). Nenhum código de aplicação foi escrito ainda; este commit estabelece a estrutura de documentação viva, ADRs, backlog e scaffold de pastas do monorepo.

### Módulos concluídos
- Nenhum. Ver `docs/BACKLOG.md` § Mapa de fases para a ordem de implementação.

### Próximos passos imediatos (Fase 0)
1. Inicializar `src/api` (Fastify + TypeScript estrito + Zod) com rota de health-check e `startupProbe`/`livenessProbe`/`readinessProbe` reais.
2. Inicializar `supabase/migrations` com o schema base: `tenants`, `workspaces` (partição departamental), `people`, e o padrão de RLS de referência (ADR-003) que todas as tabelas futuras devem seguir.
3. Gerar `src/web/tailwind.config.ts` a partir de `docs/design-system/tokens.json` (ADR-011).
4. Subir Storybook em `src/web` com `@storybook/addon-a11y` (ADR-005) antes do primeiro componente.
5. `Dockerfile` multi-estágio (ADR-001) e pipeline de CI mínimo (lint, typecheck, testes, build de imagem, Trivy).

## 2. Fronteiras arquiteturais

| Camada | Responsabilidade | Nunca faz |
|---|---|---|
| `src/api` | HTTP, validação de entrada (Zod), orquestração de casos de uso, publicação em filas `pgmq` | Lógica de negócio condicional complexa hardcoded (isso é do motor de regras, ADR-006) |
| `src/workers` | Consumo de filas `pgmq`, jobs assíncronos idempotentes, correlação AIOps, notificações | Servir HTTP síncrono ao usuário final |
| `src/web` | React 19 + Tailwind, consome API via cliente gerado do OpenAPI (ADR-009) | Acesso direto ao Postgres/Supabase (sempre via API) |
| `src/shared` | Tipos TypeScript, schemas Zod, motor de regras (ADR-006), motor de workflow (ADR-004) — consumido por `api` e `workers` | Ter dependência de framework HTTP ou de UI |
| `supabase/migrations` | Schema SQL versionado + políticas RLS (ADR-003) | Lógica de negócio em stored procedures complexas (exceto triggers de auditoria, ADR-007) |

## 3. Mapa de filas (`pgmq`) — vivo, atualizar a cada worker novo

| Fila | Produtor | Consumidor | Idempotência | Épico |
|---|---|---|---|---|
| `notifications_outbox` | API/workers (qualquer evento de domínio) | `src/workers/src/notifications` | chave: `event_id` | 10 |
| `incident_correlation` | API (criação/atualização de incidente) | `src/workers/src/aiops-correlation` | chave: `incident_id` + janela | 5 |
| `rules_evaluation_audit` | Motor de regras (ADR-006) | `src/workers/src/audit-writer` (ou trigger direto, a decidir na implementação) | chave: `evaluation_id` | 7, 12 |
| *(a preencher conforme implementação real substitui este placeholder)* | | | | |

## 4. Mapa de tabelas core — vivo, atualizar a cada migração

> Nenhuma migração foi criada ainda. Esta seção será preenchida à medida que `supabase/migrations` ganhar arquivos reais — mantida aqui como lembrete de que o mapa **precisa** existir antes do fim da Fase 0, não como documentação retroativa.

Tabelas fundacionais esperadas na Fase 0: `tenants`, `workspaces`, `people`, `roles`, `role_assignments`, `audit_log` (ADR-007), `business_rules` (ADR-006).

## 5. Convenções ativas

- **TypeScript estrito** (`strict: true`, sem `any` não justificado) em todo o monorepo.
- **Zod é a única forma de validação de fronteira** — toda rota Fastify e todo schema de workflow/regra tem um schema Zod correspondente, que também alimenta o OpenAPI (ADR-009).
- **Nomenclatura de IDs de negócio visíveis ao usuário**: `INC-xxxxx` (incidente), `REQ-xxxxx` (requisição), `CHG-xxxxx` (mudança), `PRB-xxxxx` (problema), `CI-xxx-xxxx` (item de configuração), `KB-xxxx` (artigo de conhecimento) — sempre renderizados em `JetBrains Mono` no frontend (ver `docs/design-system/tokens.json`).
- **Branches de agente**: `agent/codex-*` para implementação (ver § 7 da spec técnica). Este scaffold inicial foi criado na branch `claude/itsm-esm-system-qxr9r2`.
- **Commits**: mensagens descritivas focadas no "porquê"; um módulo de backlog por PR sempre que possível.
- **Nenhum valor literal de design** (cor/espaçamento/raio) em componentes — sempre token de `docs/design-system/tokens.json` via Tailwind (ADR-011).

## 6. Regras de Ouro (bloqueantes de PR)

1. **Imutabilidade Distroless** — nenhuma dependência de shell/SO; gravações locais só em `/tmp` (ADR-001).
2. **RLS mandatório** — nenhuma tabela de negócio sem `ROW LEVEL SECURITY` ativa e testada (ADR-003).
3. **Processamento idempotente** — todo consumidor `pgmq` trata mensagem duplicada sem corromper estado (ADR-002).
4. **Zero scripts imperativos em regra de negócio** — proibido `eval()`/interpretador dinâmico; tudo via DSL declarativa (ADR-004) ou motor de regras (ADR-006).
5. **Graceful shutdown** — `SIGTERM`/`SIGINT` drenam conexões, pausam consumo de fila e fecham pool de banco em até 30s (`terminationGracePeriodSeconds: 30`).
6. **WCAG 2.2 AA é bloqueante**, não aspiracional (ADR-005).
7. **Cor nunca é a única portadora de informação** (prioridade/status/SLA sempre com rótulo textual — regra de produto derivada do design system).
8. **Toda mutação de negócio relevante é auditável** via `audit_log` (ADR-007) — se a tabela é sensível e não gera evento de auditoria, isso é um bug de design, não um detalhe de implementação.

## 7. Definição de Pronto (DoD)

Um item de backlog só é "pronto" quando:

1. TypeScript estrito com schemas Zod validados.
2. Cobertura de testes unitários > 85%; testes de integração passam contra instância efêmera de banco.
3. Políticas RLS versionadas em migração e testadas contra vazamento entre partições/tenants (ADR-003).
4. Imagem Distroless com Trivy indicando zero CVEs com CVSS ≥ 7.0.
5. Testes Axe-core aprovados sem violação WCAG 2.2 AA (ADR-005).
6. `docs/CONTEXT.md` (este arquivo) e `docs/api/openapi.json` (ADR-009) atualizados.
7. PR revisado e aprovado, com conflitos resolvidos limpamente contra `main`.

## 8. Fluxo de agentes (Codex ⇄ Claude Code)

1. Issue formal descreve demanda, contratos e critérios de aceite (ver Issues de épico no GitHub).
2. Codex cria branch `agent/codex-*`, implementa, testa, abre PR.
3. CI roda lint, SAST, testes, varreduras de segurança.
4. Claude Code revisa arquitetura, impacto em regras de negócio e documentação viva.
5. Conflitos com `main`: Claude Code resolve, roda suíte de integração, atualiza o PR.
6. Merge via **Squash and Merge** após todos os gates aprovados.

## 9. Pendências abertas

Ver `docs/BACKLOG.md` § "Pendências levantadas na análise" — licenciamento de fontes, telas de design faltantes, política LGPD, escolha de vendors de observabilidade/e-mail/LLM.

## 10. Referências

- `docs/ESPECIFICACAO_TECNICA.md` — spec técnica original completa (arquitetura, stack, ADRs 001–005 na origem, DoD original).
- `docs/BACKLOG.md` — 12 épicos, fases, pendências.
- `docs/ADR/` — decisões arquiteturais (001–011).
- `docs/design-system/` — tokens, componentes, telas de referência.
- `docs/PLAYBOOKS/INCIDENTS_LEARNING.md` — causa-raiz de falhas de teste/incidentes e regras derivadas.
