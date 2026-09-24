# CONTEXT.md — Estado Vivo do Projeto iFix

> Documento mestre de **estado**. Se você é um agente de IA (Claude Code, Codex) ou um novo desenvolvedor, leia este arquivo inteiro antes de abrir um PR.
>
> Divisão de papéis: `docs/ESM_ITSM_PLATFORM_SPEC.md` responde _"o que decidimos construir e por quê"_ (intenção). Este arquivo responde _"o que já existe e como está"_ (realidade). Divergência entre os dois é esperada enquanto uma fase está em curso — divergência **não registrada** é o problema.

## 0. O que é o iFix

Plataforma cloud-native de **ESM/ITSM** (Enterprise & IT Service Management), multi-domínio (TI, RH, Finanças, Instalações Físicas), construída do zero sobre Node.js 22 + TypeScript + Fastify + Supabase Self-Hosted, rodando em Kubernetes com imagens Distroless.

- Especificação vigente: **`docs/ESM_ITSM_PLATFORM_SPEC.md`** (v2.1)
- Backlog: 21 épicos em 8 fases — ver § 4 da especificação e `docs/BACKLOG.md` (índice de Issues)
- Decisões: 20 ADRs — ver § 9 da especificação (`docs/ADR/` é gerado a partir dela)

## 1. Status atual

**Fase:** 0 — Fundação, em curso.

### Módulos concluídos

| Módulo                          | Entregue                                                                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Padrão de referência de RLS** | `supabase/migrations/20260922000001_foundation.sql` — tenancy em dois eixos, auditoria imutável, UUID v7. É o formato que toda migração futura copia.                                                         |
| **Trilha de auditoria**         | `audit.logs` particionada, captura por gatilho, imutável por privilégio **e** por gatilho (resiste a superusuário)                                                                                            |
| **Suíte de vazamento**          | 23 testes contra PostgreSQL real, verificados por mutação — cada teste foi visto falhando quando a proteção que afirma verificar é removida                                                                   |
| **Tooling do monorepo**         | npm workspaces, TypeScript estrito, ESLint (com as regras que sustentam as Regras de Ouro 7 e 11), Prettier, Vitest                                                                                           |
| **Contrato de claims**          | `src/shared` — `jwtClaimsSchema` é o contrato entre autenticação e políticas RLS, validado antes de virar GUC                                                                                                 |
| **API HTTP**                    | `src/api` — Fastify, as três probes da § 6.3, autenticação JWT, `GET /v1/people` e graceful shutdown em 25s                                                                                                   |
| **Contexto transacional**       | `withRequestContext` aplica claims com `SET LOCAL`, de modo que morram no commit e não vazem para a próxima requisição da mesma conexão de pool                                                               |
| **Contrato OpenAPI**            | `docs/api/openapi.json` derivado dos schemas Zod, com gate 6 verificando drift                                                                                                                                |
| **Design tokens**               | `design-system/build.mjs` compila `tokens.json` em `dist/tokens.css` e `dist/tailwind-theme.js` (Style Dictionary v4, ADR-011)                                                                                |
| **Interface**                   | Storybook com `addon-a11y`, primeiro componente consumindo os tokens compilados (ADR-005, ADR-011)                                                                                                            |
| **Fila assíncrona**             | `notifications` em pgmq, publicação transacional por `app.publish_event`, consumidor idempotente com DLQ (ADR-002)                                                                                            |
| **Probes do worker**            | `src/workers/src/probes.ts` — as três probes de `@ifix/shared` (`health.ts`/`probes.ts`, promovidas do `src/api`) num `node:http` próprio, porta 3001                                                         |
| **Empacotamento**               | `Dockerfile` multi-estágio para Distroless, `nonroot`, sem devDependencies nem fontes TS na imagem final; um único arquivo produz `ifix-api` e `ifix-workers` (`--target runtime-api`/`runtime-workers`)      |
| **Charts Helm**                 | `charts/api` e `charts/workers` — PSS Restricted, três probes, orçamento de encerramento verificado (preStop + `SHUTDOWN_TIMEOUT_MS` + margem ≤ 30s), HPA (api) e KEDA por fila `pgmq` (workers, sem preStop) |
| **Esteira de CI**               | `.github/workflows/` com os gates 1, 2, 3, 4, 5, 6, 8, 9, 11 e 12 ativos                                                                                                                                      |
| **Graceful shutdown**           | Provado contra o artefato **compilado**: SIGTERM e SIGINT saem com código 0, drenam e registram no log (Regra de Ouro 8)                                                                                      |

### Estado dos 12 gates da esteira (§ 6.4)

| Gate                            | Situação | Observação                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 lint e formatação             | ativo    | inclui as regras que sustentam as Regras de Ouro 7 e 11                                                                                                                                                                                                                                                                                                                                             |
| 2 verificação de tipos          | ativo    |                                                                                                                                                                                                                                                                                                                                                                                                     |
| 3 testes e cobertura            | ativo    | piso de 85%; hoje em 98,8% de linhas e 87,3% de branches                                                                                                                                                                                                                                                                                                                                            |
| 4 integração                    | ativo    | PostgreSQL real em service container                                                                                                                                                                                                                                                                                                                                                                |
| 5 verificação de RLS            | ativo    | por teste estrutural, vale para toda tabela futura                                                                                                                                                                                                                                                                                                                                                  |
| 6 drift de OpenAPI              | ativo    |                                                                                                                                                                                                                                                                                                                                                                                                     |
| 7 acessibilidade                | ativo    | Axe por história do Storybook; ver nota sobre o limite do jsdom                                                                                                                                                                                                                                                                                                                                     |
| 8 SAST, dependências e segredos | ativo    | CodeQL, `npm audit` e Gitleaks — os três executando; ver nota abaixo                                                                                                                                                                                                                                                                                                                                |
| 9 imagem e Trivy                | ativo    | imagem construída e varrida no CI; base em `nodejs22-debian13` — ver ressalva abaixo                                                                                                                                                                                                                                                                                                                |
| 10 auditoria de design tokens   | ativo    | drift dos artefatos + literais estéticos; ver nota abaixo                                                                                                                                                                                                                                                                                                                                           |
| 11 validação de charts          | ativo    | `helm lint`, `helm template \| kubeconform` (inclui schema do KEDA) verificador próprio de PSS Restricted + Regra de Ouro 8 (`scripts/check-helm-security.mjs`) e admissão PSS `restricted` num `kube-apiserver` 1.30 real (`scripts/check-helm-psa.mjs`); binários conferidos por SHA-256 e catálogo de schemas fixado em commit; `charts/infra` fica de fora, README apenas — ver ressalva abaixo |
| 12 sincronia documental         | ativo    |                                                                                                                                                                                                                                                                                                                                                                                                     |

**Os gates bloqueiam o merge.** A `main` tem um ruleset que exige PR, os 8 checks da esteira verdes (os 6 jobs de `ci.yml`, contando as duas entradas da matriz do gate 9, mais `Análise estática` e `CodeQL`), o branch atualizado com a base e as conversas resolvidas; também proíbe force push e exclusão. Não exige aprovação humana: as PRs de agente saem pela conta do próprio mantenedor, que não pode aprovar a si mesmo — o bloqueio real são os checks. **Renomear um job no `ci.yml` exige atualizar o ruleset junto**: um check exigido que nunca é reportado trava toda PR em "Expected — Waiting for status".

Gates pendentes **não** têm etapa correspondente na esteira. Adicionar um passo que sempre passa produziria a ilusão de cobertura — o custo disso já foi pago uma vez neste repositório (ver playbook, entrada sobre o contrato OpenAPI vazio).

### CodeQL depende de GitHub Advanced Security

Registrado porque a dependência não é óbvia pelo workflow e voltará a morder se o licenciamento mudar: `codeql.yml` estava correto e ainda assim não executava, porque o repositório é privado numa organização e a varredura de código exige **GitHub Advanced Security**. O erro era `Advanced Security must be enabled for this repository to use code scanning`.

O GHAS foi habilitado e o CodeQL passou a rodar — a parte SAST do gate 8 está ativa. Se o licenciamento for removido, o check volta a falhar por configuração, não por achado; a distinção está no log, não no ícone.

O workflow não é `continue-on-error` de propósito: um gate que nunca reprova é indistinguível de gate nenhum. Enquanto a varredura estava bloqueada, a lacuna ficou registrada nesta tabela em vez de mascarada na esteira.

### Conformidade de contraste é verificada, não presumida

`tests/design-tokens.test.ts` mede cada par texto/superfície nos **dois** temas (história 11.4). Os limiares numéricos vêm da WCAG, não do `tokens.json`: o arquivo escolhe o nível (`2.2 AA`) e o teste fixa os números daquele nível. A verificação por mutação mostrou por que — com os números vindos do arquivo, baixar `contrastNormalText` para 3 deixava a suíte verde sem corrigir nada.

A primeira execução reprovou 29 casos e corrigiu um defeito estrutural: `status.*` e `domain.*` eram tokens de tema escuro disfarçados de globais. Hoje declaram `text` e `dot` por tema. Ver a entrada de 2026-09-23 em `docs/PLAYBOOKS/INCIDENTS_LEARNING.md`.

### O que o gate 7 cobre, e o que não cobre

`tests/a11y.test.tsx` roda o Axe sobre **cada história** do Storybook — o mesmo arquivo que documenta o componente é o que o testa, então a vitrine não pode divergir do que foi verificado.

O Axe roda em jsdom, que não faz layout nem resolve `var()`. As regras que dependem de pixels renderizados — `color-contrast` acima de todas — ficam inertes e estão **explicitamente desabilitadas**, em vez de passarem por vacuidade. O contraste é verificado em `tests/design-tokens.test.ts`, por cálculo direto sobre os tokens nos dois temas: uma garantia mais forte, porque cobre todas as combinações declaradas e não apenas as que alguma história por acaso renderizou.

O que sobra para o Axe é o que ele faz bem e o cálculo não alcança: estrutura, papéis ARIA, nomes acessíveis, rótulos e ordem de cabeçalhos. E o que nenhum dos dois detecta — cor como único portador de informação (História 11.7) — tem teste próprio no mesmo arquivo.

O job da esteira também constrói a vitrine: uma história que deixasse de compilar sairia da suíte em silêncio, e o gate passaria por ter menos o que verificar.

### O gate 10 tem duas metades

A primeira é **drift**: `npm run tokens:check` recompila `tokens.json` e compara com o que está versionado em `design-system/dist/`. Mesmo mecanismo do gate 6 — o artefato nunca é editado à mão, e divergir reprova.

A segunda é **literais**: `npm run design:literals` varre o código de interface atrás de hexadecimal, `rgb()`, medida em `px`/`rem` e classe utilitária arbitrária do Tailwind (`bg-[#723CEB]`).

Enquanto `src/web/` estiver vazio, a segunda metade varre **zero arquivo** e passa. Isso é declarado no log do job, não escondido, e a verificação é exercitada por fixtures em `tests/design-literals.test.ts` que provam que cada regra reprova de fato. É a aplicação direta da lição das duas entradas anteriores do playbook: um verificador que nunca viu uma violação não é evidência de nada.

Dispensa pontual existe com `tokens-exempt: <motivo>` na linha. O motivo é obrigatório e verificado — `tokens-exempt:` sozinho não silencia.

### Ressalva sobre o Dockerfile

Este ambiente de desenvolvimento não tem daemon Docker, então a imagem **não é construída aqui**. O que se verifica localmente é o layout de runtime, simulado em diretório separado (`npm ci --omit=dev` + `dist` copiado): o processo sobe, responde às três probes e encerra com SIGTERM. Isso agora vale para os dois alvos — `runtime-api` e `runtime-workers` — não só para a API.

A primeira construção real ocorreu no job `container` da esteira e **resolveu sem erro** — o Dockerfile está validado. A varredura do Trivy, porém, reprovou: a base `nodejs22-debian12` carrega `libssl3` 3.0.18, com 6 vulnerabilidades já corrigidas a montante (1 crítica, 5 altas). Distroless não tem gerenciador de pacotes, então não há correção de dentro da imagem; a base passou para `nodejs22-debian13`, que usa o mesmo Node 22 LTS e varre limpa.

Onde não houver Docker, o Trivy escaneia a base direto do registro — útil para comparar variantes antes de trocar:

```bash
trivy image --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed gcr.io/distroless/nodejs22-debian13
```

### Ressalva sobre os charts Helm

`charts/api` e `charts/workers` estão completos e validados (`helm lint`, `helm template | kubeconform`, `scripts/check-helm-security.mjs`), e os workloads passam pela admissão PodSecurity `restricted` de um `kube-apiserver` 1.30 real (`scripts/check-helm-psa.mjs`, com `--dry-run=server`). Nenhum dos dois foi instalado com pods de fato rodando: o apiserver do gate não tem nós nem Docker. O que a validação prova é que o YAML renderizado é válido, aceito pela PSS oficial e conforme à Regra de Ouro 8; não prova que um `helm install` realmente sobe o pod, nem que o KEDA de fato escala o worker contra um `pgmq` real — isso fica para quando o R9 (modelo de entrega) decidir onde o cluster roda.

`charts/infra` permanece só `README.md`, de propósito: depende do R9 e do R6 (destino de observabilidade) ainda em aberto. O job `helm` da esteira confere que continua vazio a cada execução — não é um gate que sempre passa por não ter o que verificar, é um gate que falha assim que alguém adicionar conteúdo sem também estender a esteira para validá-lo.

### Próximos passos imediatos (Fase 0)

1. **OpenTelemetry completo** (ADR-008): o `trace-id` já vira `reqId` do Fastify e chega à auditoria pela GUC `app.trace_id`; falta o SDK com exportador OTLP — **bloqueado pelo R6**, que define o destino.
2. **Roteamento por canal** do worker de notificações (História 10.1): o consumidor já exerce o padrão completo (envelope validado, idempotência, contexto de locatário); falta o provedor real, **bloqueado pelo R5**.
3. **`charts/infra`**: só `README.md` até o R9 (modelo de entrega) decidir se o Postgres/GoTrue/Realtime do Supabase Self-Hosted são geridos por este monorepo ou pelo chart oficial.

**Marco de saída da Fase 0:** um endpoint em produção com RLS ativa, auditoria disparando, trace atravessando a fila e token de UI aplicado — ponta a ponta.

### Como rodar localmente

```bash
npm install
./scripts/local-db/reset.sh   # recria ifix_test e aplica as migrações
npm run verify                # lint + typecheck + sincronia de ADRs + testes
```

Onde houver Docker, o alvo é Testcontainers (ADR-018). O `reset.sh` entrega a mesma garantia de banco efêmero onde não houver daemon disponível.

## 2. Fronteiras arquiteturais

| Camada                | Responsabilidade                                                                           | Nunca faz                                                               |
| --------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `src/api`             | HTTP, validação de entrada (Zod), orquestração de casos de uso, publicação em filas `pgmq` | Lógica condicional de negócio embutida (pertence ao BRE, ADR-006)       |
| `src/workers`         | Consumo idempotente de filas, jobs assíncronos, correlação AIOps, notificações             | Servir HTTP síncrono ao usuário final                                   |
| `src/web`             | React 19 + Tailwind, consumindo a API pelo cliente gerado do OpenAPI (ADR-009)             | Acessar Postgres/Supabase diretamente                                   |
| `src/shared`          | Tipos, schemas Zod, motor de workflow (ADR-004), motor de regras (ADR-006)                 | Depender de framework HTTP ou de UI                                     |
| `supabase/migrations` | Schema SQL versionado + políticas RLS                                                      | Lógica de negócio em procedures (exceto triggers de auditoria, ADR-007) |
| `/design-system`      | Tokens DTCG compiláveis (ADR-011)                                                          | Conter componente, documentação longa ou saída de build editada à mão   |

## 3. Mapa de filas (`pgmq`) — vivo

Estado **real**, não previsto. As filas planejadas estão na § 5.3 da especificação.

| Fila                | Produtor                          | Consumidor                 | Idempotência                        | DLQ                 |
| ------------------- | --------------------------------- | -------------------------- | ----------------------------------- | ------------------- |
| `notifications`     | `app.publish_event`               | `@ifix/workers` (consumer) | `(tenant_id, queue_name, event_id)` | `notifications_dlq` |
| `notifications_dlq` | consumidor, ao esgotar tentativas | — (investigação manual)    | —                                   | —                   |

**Nome:** a § 5.3 lista a fila como `pgmq_notifications`. O próprio pgmq prefixa a tabela com `q_`, então o prefixo `pgmq_` produziria `pgmq.q_pgmq_notifications`. A fila se chama `notifications`; o prefixo na especificação indica a tecnologia, não o nome.

**Versão do pgmq:** `v1.13.0`, a mesma em `scripts/local-db/install-pgmq.sh` e na imagem `ghcr.io/pgmq/pg16-pgmq:v1.13.0` usada pela esteira. O pgmq é extensão de SQL puro — sem código C ou Rust —, então `make install` roda sem compilador.

## 4. Mapa de tabelas core — vivo

Tabelas **realmente criadas**, com confirmação de RLS e de gatilho de auditoria — é a evidência que a revisão de PR consulta. O modelo de intenção completo está na § 5.2 da especificação.

| Tabela                     | Migração   | Eixo de isolamento   | RLS forçada | Auditoria |
| -------------------------- | ---------- | -------------------- | ----------- | --------- |
| `public.tenants`           | 2026092200 | raiz do locatário    | sim         | sim       |
| `public.workspaces`        | 2026092200 | locatário + espaço   | sim         | sim       |
| `public.people`            | 2026092200 | locatário            | sim         | sim       |
| `public.workspace_members` | 2026092200 | locatário + espaço   | sim         | sim       |
| `audit.logs`               | 2026092200 | particionada por mês | append-only | n/a       |

As três garantias abaixo não dependem de disciplina de revisão: há teste estrutural em `tests/rls.test.ts` que falha se alguma tabela de `public` violar qualquer uma delas.

1. `ENABLE` **e** `FORCE ROW LEVEL SECURITY` — sem `FORCE`, o dono da tabela ignora a política e o isolamento não existe para quem roda migração.
2. Gatilho `audit.capture` anexado.
3. Toda política de `INSERT`/`UPDATE`/`ALL` declara `WITH CHECK` explícito — o PostgreSQL reaproveita o `USING` quando ele é omitido, o que acoplaria leitura e escrita.

### Funções do padrão (schema `app`)

| Função                                     | Papel                                                             |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `app.tenant_visible(uuid)`                 | Eixo 1. Usar em `USING` e `WITH CHECK` de toda tabela de negócio. |
| `app.workspace_visible(uuid, uuid)`        | Eixo 2. Combina locatário com participação no espaço de serviço.  |
| `app.current_tenant_id()` / `_person_id()` | Leem as claims da GUC `request.jwt.claims`.                       |
| `app.is_service_role()`                    | Exceção auditada que atravessa locatários (ADR-003).              |
| `app.uuid_generate_v7()`                   | Chave primária ordenável por tempo (ADR-015).                     |
| `audit.attach(regclass)`                   | Anexa a auditoria. Chamar em **toda** tabela de negócio nova.     |

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

10 riscos e decisões em aberto (R2–R11) na § 12 da especificação; os encerrados ficam registrados na § 12.1. Os que bloqueiam a Fase 0:

- **R3** — política de retenção e base legal LGPD por categoria de dado (classificação precisa existir antes do primeiro schema com dado pessoal).
- **R6** — destino de exportação da observabilidade (coletor OTLP).
- **R11** — licença do repositório.

## 10. Referências

| Documento                              | Papel                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `docs/ESM_ITSM_PLATFORM_SPEC.md`       | Especificação vigente (v2.0): arquitetura, backlog, ADRs, NFRs, riscos |
| `docs/BACKLOG.md`                      | Índice de fases e Issues                                               |
| `docs/ADR/`                            | Registros individuais (**gerados** pelo `scripts/sync-adrs.mjs`)       |
| `/design-system/tokens.json`           | Tokens DTCG compiláveis                                                |
| `docs/design-system/`                  | Documentação de design: componentes e telas de referência              |
| `docs/PLAYBOOKS/INCIDENTS_LEARNING.md` | Causa-raiz de falhas e regras derivadas                                |
