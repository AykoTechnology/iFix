# CONTEXT.md — Estado Vivo do Projeto iFix

> Documento mestre de **estado**. Se você é um agente de IA (Claude Code, Codex) ou um novo desenvolvedor, leia este arquivo inteiro antes de abrir um PR.
>
> Divisão de papéis: `docs/ESM_ITSM_PLATFORM_SPEC.md` responde *"o que decidimos construir e por quê"* (intenção). Este arquivo responde *"o que já existe e como está"* (realidade). Divergência entre os dois é esperada enquanto uma fase está em curso — divergência **não registrada** é o problema.

## 0. O que é o iFix

Plataforma cloud-native de **ESM/ITSM** (Enterprise & IT Service Management), multi-domínio (TI, RH, Finanças, Instalações Físicas), construída do zero sobre Node.js 22 + TypeScript + Fastify + Supabase Self-Hosted, rodando em Kubernetes com imagens Distroless.

- Especificação vigente: **`docs/ESM_ITSM_PLATFORM_SPEC.md`** (v2.0)
- Backlog: 21 épicos em 8 fases — ver § 4 da especificação e `docs/BACKLOG.md` (índice de Issues)
- Decisões: 19 ADRs — ver § 9 da especificação (`docs/ADR/` é gerado a partir dela)

## 1. Status atual

**Fase:** 0 — Fundação (planejamento e scaffolding). **Nenhum código de aplicação foi escrito.** O que existe é a camada de documentação viva, os ADRs, o backlog, os tokens de design e o scaffold de pastas do monorepo.

### Módulos concluídos
Nenhum.

### Próximos passos imediatos (Fase 0)

1. Inicializar `src/api` (Fastify + TypeScript estrito + Zod) com health-check e as três probes reais (`startupProbe`, `livenessProbe`, `readinessProbe`).
2. Inicializar `supabase/migrations` com o schema base — `tenants`, `workspaces`, `people` — e o **padrão de RLS de referência** (ADR-003 + ADR-012) que toda tabela futura deve seguir. Este é o artefato mais importante da fase: ele define o formato que todas as migrações subsequentes copiam.
3. Configurar o pipeline do Style Dictionary gerando `src/web/tailwind.config.ts` a partir de `/design-system/tokens.json` (ADR-011).
4. Subir Storybook em `src/web` com `@storybook/addon-a11y` **antes do primeiro componente** — o ADR-005 só é bloqueante se existir o mecanismo que o bloqueia.
5. `Dockerfile` multi-estágio (ADR-001) e esteira de CI com os 12 gates da § 6.4 da especificação.
6. Instrumentação OpenTelemetry desde o primeiro endpoint (ADR-008) — retroinstrumentar depois custa mais e costuma não acontecer.

**Marco de saída da Fase 0:** um endpoint em produção com RLS ativa, auditoria disparando, trace atravessando a fila e token de UI aplicado — ponta a ponta.

## 2. Fronteiras arquiteturais

| Camada | Responsabilidade | Nunca faz |
|---|---|---|
| `src/api` | HTTP, validação de entrada (Zod), orquestração de casos de uso, publicação em filas `pgmq` | Lógica condicional de negócio embutida (pertence ao BRE, ADR-006) |
| `src/workers` | Consumo idempotente de filas, jobs assíncronos, correlação AIOps, notificações | Servir HTTP síncrono ao usuário final |
| `src/web` | React 19 + Tailwind, consumindo a API pelo cliente gerado do OpenAPI (ADR-009) | Acessar Postgres/Supabase diretamente |
| `src/shared` | Tipos, schemas Zod, motor de workflow (ADR-004), motor de regras (ADR-006) | Depender de framework HTTP ou de UI |
| `supabase/migrations` | Schema SQL versionado + políticas RLS | Lógica de negócio em procedures (exceto triggers de auditoria, ADR-007) |
| `/design-system` | Tokens DTCG compiláveis (ADR-011) | Conter componente, documentação longa ou saída de build editada à mão |

## 3. Mapa de filas (`pgmq`) — vivo

**Nenhuma fila foi criada ainda.** As filas previstas estão na § 5.3 da especificação. Esta seção passa a listar o estado **real** a partir do primeiro worker implementado, com: nome, produtor, consumidor, chave de idempotência e estado da DLQ.

| Fila | Produtor | Consumidor | Idempotência | Status |
|---|---|---|---|---|
| — | — | — | — | nenhuma implementada |

## 4. Mapa de tabelas core — vivo

**Nenhuma migração foi criada ainda.** O modelo de intenção está na § 5.2 da especificação. Esta seção passa a listar as tabelas **realmente criadas**, com a confirmação de RLS ativa e de gatilho de auditoria por tabela — é a evidência que a revisão de PR consulta.

| Tabela | Migração | RLS | Auditoria | Observação |
|---|---|---|---|---|
| — | — | — | — | nenhuma implementada |

## 5. Convenções ativas

- **TypeScript estrito** (`strict: true`, sem `any` não justificado) em todo o monorepo.
- **Zod é a única validação de fronteira** — toda rota, workflow e regra tem schema Zod, que também gera o OpenAPI (ADR-009).
- **IDs de negócio visíveis**: `INC-xxxxx`, `REQ-xxxxx`, `CHG-xxxxx`, `PRB-xxxxx`, `CI-xxx-xxxx`, `KB-xxxx` — sequência por locatário e por tipo (ADR-015), sempre renderizados em `JetBrains Mono`.
- **Tempo**: persistência em `timestamptz` UTC; conversão de fuso apenas na apresentação (ADR-016).
- **Chaves primárias**: UUID v7; o identificador legível é coluna separada.
- **Nenhum valor literal de design** em componentes — sempre token de `/design-system/tokens.json` (ADR-011).
- **Branches**: `agent/codex-*` (implementação), `claude/*` (revisão, conflito, scaffolding).
- **Alterar um ADR**: editar a § 9 da especificação e rodar `node scripts/sync-adrs.mjs`. Nunca editar `docs/ADR/*.md` à mão — são gerados.

## 6. Regras de Ouro (bloqueantes de PR)

Texto completo e o gate de CI correspondente a cada uma: § 10.1 da especificação.

1. Imutabilidade Distroless (ADR-001)
2. RLS mandatório (ADR-003, ADR-012)
3. Auditoria universal automática (ADR-007)
4. Fonte única de contrato de API (ADR-009)
5. Fonte única de UI (ADR-011)
6. Processamento idempotente (ADR-002)
7. Zero scripts imperativos em regra de negócio (ADR-004, ADR-006)
8. Graceful shutdown em 30s
9. Cor nunca é a única informação (ADR-005)
10. Nenhum segredo versionado
11. Observabilidade não é opcional (ADR-008)

## 7. Definição de Pronto (DoD)

13 critérios — texto completo na § 10.2 da especificação. Os quatro mais esquecidos na prática:

- Teste de vazamento em **dois eixos**: entre locatários **e** entre espaços de serviço (ADR-012).
- `traceparent` atravessando qualquer fronteira de fila introduzida (ADR-008).
- Revisão manual de teclado e leitor de tela registrada no PR — Axe-core não cobre ordem de foco nem cor como única informação.
- Campos com dado pessoal classificados e com retenção declarada (ADR-013).

## 8. Fluxo de agentes (Codex ⇄ Claude Code)

1. Issue formal descreve demanda, contratos e critérios de aceite.
2. Codex cria branch `agent/codex-*`, implementa, testa, abre PR.
3. CI roda os 12 gates da § 6.4.
4. Claude Code revisa arquitetura, impacto em regras de negócio, performance de RLS e documentação viva.
5. Conflito com `main`: Claude Code concilia schemas e contratos, roda a integração, atualiza o PR.
6. Merge via **Squash and Merge**.

**Limites de autonomia** (§ 7.1 da especificação): agente de IA não aprova ADR, não aplica pacote de configuração em produção, não altera RLS em produção, não define base legal ou retenção de dado pessoal, não aceita risco de segurança ou de acessibilidade suprimindo achado.

## 9. Pendências abertas

11 riscos e decisões em aberto (R1–R11) na § 12 da especificação. Os que bloqueiam a Fase 0:

- **R1** — definição tipográfica (§ 12.1 da especificação). O protótipo não carrega Gilroy nem Lufga; o que renderiza é Outfit. Primeira ação, sem custo: confirmar com quem aprovou o design qual fonte estava efetivamente vendo. Se for licenciar, depende do **R9(a)**.
- **R3** — política de retenção e base legal LGPD por categoria de dado (classificação precisa existir antes do primeiro schema com dado pessoal).
- **R6** — destino de exportação da observabilidade (coletor OTLP).
- **R11** — licença do repositório.

## 10. Referências

| Documento | Papel |
|---|---|
| `docs/ESM_ITSM_PLATFORM_SPEC.md` | Especificação vigente (v2.0): arquitetura, backlog, ADRs, NFRs, riscos |
| `docs/BACKLOG.md` | Índice de fases e Issues |
| `docs/ADR/` | Registros individuais (**gerados** pelo `scripts/sync-adrs.mjs`) |
| `/design-system/tokens.json` | Tokens DTCG compiláveis |
| `docs/design-system/` | Documentação de design: componentes e telas de referência |
| `docs/PLAYBOOKS/INCIDENTS_LEARNING.md` | Causa-raiz de falhas e regras derivadas |
