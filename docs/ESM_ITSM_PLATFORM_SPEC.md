# Especificação Técnica e Plano Diretor: Plataforma Cloud-Native ESM/ITSM (iFix)

| | |
|---|---|
| **Versão** | 2.0 |
| **Data** | 2026-09-22 |
| **Status** | Vigente — substitui integralmente a v1.0 (`docs/ESPECIFICACAO_TECNICA.md`) |
| **Escopo** | Arquitetura de referência, backlog estratégico, contratos de engenharia, decisões arquiteturais e modelo de governança |
| **Canonicidade** | Este é o documento mestre do produto. `docs/CONTEXT.md` registra o *estado de execução*; este documento registra a *intenção de projeto*. |

Este documento estabelece a arquitetura de referência, as regras operacionais, os contratos de engenharia e o modelo de governança para o desenvolvimento do zero de uma plataforma nativa em nuvem de Gestão de Serviços Empresariais (ESM) e ITSM. A solução nasce sem acoplamentos legados, preparada para execução em clusters Kubernetes, utilizando Node.js em imagens Distroless e a infraestrutura integrada do Supabase Self-Hosted.

---

## 0. Como ler este documento

### 0.1. Convenção de marcação

Itens prefixados com **`[+]`** foram **acrescentados na reanálise de 2026-09-22** (v2.0). São lacunas identificadas ao confrontar o texto da v1.1 com o design system entregue, com o catálogo de processos ITIL declarado e com os próprios contratos de engenharia do documento. **Todo item `[+]` é uma proposta que requer validação do dono do produto** — nenhum foi tratado como decidido.

### 0.2. O que mudou na v2.0

| Área | Mudança |
|---|---|
| Processos ITIL | `[+]` Catálogo completo dos 26 processos ITIL 2011 mapeado para épicos (§3), expondo 9 processos declarados no §1 que não tinham história correspondente |
| Backlog | Épicos 1–12 consolidados e expandidos; `[+]` Épicos 13–21 criados para cobrir os processos órfãos (com destaque para **CMDB**, que havia perdido seu épico quando o Épico 8 passou a tratar apenas de ITAM/SAM, e para **SSO**, presente na stack mas ausente do backlog) |
| ADRs | ADR-001 a ADR-011 com texto integral e consequências operacionais expandidas; `[+]` ADR-012 a ADR-019 para decisões implícitas sem registro (tenancy departamental, LGPD × auditoria imutável, anexos, numeração de registros, calendários de negócio, isolamento do RAG, estratégia de testes, i18n) |
| Arquitetura de dados | `[+]` §5 inteira: modelo de dados núcleo, mapa de filas `pgmq`, convenções de particionamento e retenção |
| Requisitos não-funcionais | `[+]` §11 inteira: SLOs, orçamento de performance, premissas de capacidade, matriz de navegadores e leitores de tela, limites de API |
| Esteira | `[+]` Enumeração explícita dos 12 gates de CI, incluindo os que tornam mecânicas as Regras de Ouro (verificação de RLS em tabela nova, drift de OpenAPI, auditoria de tokens) |
| Riscos | `[+]` §12: decisões bloqueantes em aberto, incluindo o licenciamento das fontes Gilroy/Lufga e a confirmação do escopo de certificação PinkVERIFY |

### 0.3. Documentos relacionados

| Documento | Papel |
|---|---|
| `docs/CONTEXT.md` | Estado vivo: módulos concluídos, mapa real de filas/tabelas, pendências em execução |
| `docs/ADR/` | Registros formais individuais; reproduzidos integralmente na §9 deste documento |
| `docs/design-system/` | Documentação de design: inventário de componentes, telas de referência |
| `/design-system/tokens.json` | Fonte única de verdade de UI, compilável (ADR-011) |
| `docs/PLAYBOOKS/INCIDENTS_LEARNING.md` | Causa-raiz de falhas e regras derivadas |

---

## 1. Visão Geral e Princípios Arquiteturais

A plataforma foi concebida sobre o paradigma de entrega ágil, resiliente e auditável, absorvendo os mais altos requisitos funcionais do mercado:

- **Governança de Processos ITIL**: Aderência estrita e suporte nativo aos processos auditáveis de ITSM (equivalente ao padrão PinkVERIFY), com implementação estruturada de Incidentes, Problemas, Mudanças em 3 trilhas e Gestão de Liberações. *O catálogo completo, com o escopo de cada processo e a fase em que é entregue, está na §3.*
- **CMDB Federada e Gestão de Ativos (ITAM/SAM)**: Consolidação de itens de configuração (CIs) acoplada ao ciclo de vida financeiro e operacional de ativos físicos e digitais, com simulação preditiva de impacto e cálculo de raio de explosão sistêmica (*blast radius*).
- **Acessibilidade Universal Obrigatória**: Conformidade regulatória com as diretrizes WCAG 2.2 Nível AA em todas as interfaces de usuário.
- **Isolamento Multilocatário Seguro (ESM)**: Particionamento lógico de serviços corporativos (TI, Recursos Humanos, Finanças, Instalações Físicas) com segregação de dados.
- **Business Rules Engine (BRE) Desacoplado**: Motor determinístico de regras de negócio independente do fluxo de estados, com construtor visual de condições combinadas (SE/E/OU/NÃO).
- **Auditoria Universal e Observabilidade de Ponta a Ponta**: Trilha de auditoria imutável transversal (*append-only*) e rastreamento distribuído via OpenTelemetry (W3C Trace Context).
- **`[+]` Privacidade por Projeto (LGPD)**: A plataforma processa dados de Recursos Humanos e Finanças por definição de escopo. O tratamento de dados pessoais, a base legal, a retenção e o direito à eliminação são requisitos de arquitetura — não de conformidade posterior. A tensão entre o direito à eliminação e a imutabilidade da trilha de auditoria é resolvida no **ADR-013**.
- **`[+]` Zero Ambiguidade de Contrato**: Nenhuma fronteira do sistema (HTTP, fila, workflow, regra, token de UI) é definida em prosa ou em código imperativo — todas derivam de um schema declarativo único, versionado e validado em tempo de execução.

---

## 2. Topologia de Infraestrutura e Stack Tecnológica

### 2.1. Stack por camada arquitetural

| Camada Arquitetural | Componente Tecnológico | Justificativa Técnica e Prontidão Kubernetes |
|---|---|---|
| Linguagem & Runtime | Node.js 22 LTS (TypeScript estrito) sobre Fastify | Processamento assíncrono de alta performance com baixo consumo de memória e validação estrita de esquemas via Zod |
| Imagem de Contêiner | Google Distroless (`gcr.io/distroless/nodejs22-debian12`) | Eliminação de utilitários de shell, gerenciadores de pacotes e binários de SO. Redução drástica da superfície de vulnerabilidades (CVEs) |
| Persistência Relacional | PostgreSQL 16+ via Supabase Self-Hosted | Kernel transacional robusto, com suporte a particionamento nativo de tabelas e indexação analítica |
| Segurança de Acesso (RLS) | Supabase Row Level Security (RLS) | O isolamento entre inquilinos e partições departamentais é forçado nativamente pelo PostgreSQL via claims do JWT |
| Mensageria & Filas | Supabase Queues (pgmq) | Filas transacionais com suporte a visibilidade, Dead Letter Queue (DLQ) e garantias ACID executadas diretamente no banco de dados |
| Eventos em Tempo Real | Supabase Realtime (Logical WAL Replication) | Notificações push e atualizações de tickets em tempo real para analistas via WebSockets sem sobrecarga de polling |
| Identidade & Federação | Supabase GoTrue (Auth) | Autenticação centralizada com suporte a OpenID Connect, SAML 2.0 e Azure Entra ID com geração de JWT criptografado |
| Busca Semântica & Vetores | PostgreSQL com extensão pgvector | Indexação vetorial de bases de conhecimento e incidentes históricos para suporte cognitivo e agrupamento automático de falhas |
| Camada de Apresentação | React 19, Tailwind CSS e Web Components acessíveis | Frontend unificado para analistas e autoatendimento sob os critérios WCAG 2.2 AA, governado por `tokens.json` |
| **`[+]` Armazenamento de Anexos** | Supabase Storage (S3-compatível) com políticas RLS por bucket | Chamados, artigos de KB e ativos carregam anexos e capturas de tela (previsto na mesa de atendimento do design system). Exige varredura antivírus e URLs assinadas de vida curta — ver **ADR-014** |
| **`[+]` Agendamento Temporal** | `pg_cron` | Expiração de delegações, avaliação periódica de SLA, materialização de métricas e rotinas de retenção. Roda dentro da mesma fronteira transacional do banco |
| **`[+]` Contrato de API** | `@fastify/swagger` + `@fastify/type-provider-zod` | Geração automática de OpenAPI 3.1 a partir dos schemas Zod, eliminando *drift* entre contrato e implementação (ADR-009) |
| **`[+]` Compilação de Design Tokens** | Style Dictionary (formato DTCG) | Compila `/design-system/tokens.json` em configuração do Tailwind e variáveis CSS nativas (ADR-011) |
| **`[+]` Observabilidade** | OpenTelemetry SDK → OTLP → Prometheus + Grafana | Rastreamento distribuído com W3C Trace Context e *golden signals*. Obrigatório por não haver shell na imagem Distroless para depuração ao vivo (ADR-008) |
| **`[+]` Autoscaling de Workers** | KEDA (scaler PostgreSQL sobre profundidade da fila `pgmq`) | HPA por CPU não reflete a carga real de um consumidor de fila; a métrica correta é o comprimento e a idade da fila |
| **`[+]` Backup e DR** | pgBackRest ou WAL-G com arquivamento contínuo de WAL | RPO < 5 min e RTO < 30 min exigem *point-in-time recovery*, não apenas `pg_dump` periódico (ADR-008) |
| **`[+]` Testes** | Vitest (unitário), Testcontainers (integração com Postgres efêmero), Playwright (E2E + teclado), Storybook test-runner com Axe-core | A DoD exige cobertura > 85%, testes de vazamento de RLS e validação WCAG — cada um requer ferramenta específica (ADR-018) |
| **`[+]` Segurança de Esteira** | Trivy (imagem), CodeQL (SAST), OSV/`npm audit` (dependências), Gitleaks (segredos) | Gates de CI derivados diretamente da DoD |
| **`[+]` Empacotamento K8s** | Helm + `kubeconform` + validação de PodSecurityStandards | Os charts são artefato versionado e validado em CI, não configuração manual de cluster |

### 2.2. `[+]` Topologia de ambientes

| Ambiente | Propósito | Dados | Observações |
|---|---|---|---|
| `local` | Desenvolvimento | Seeds sintéticos (`supabase/seed`) | Supabase local via CLI; nenhum dado real |
| `ci` | Execução da esteira | Banco efêmero por job (Testcontainers) | Descartado ao fim do job; nunca compartilhado entre PRs |
| `homologação` | Validação funcional e origem dos pacotes de configuração | Dados sintéticos ou anonimizados — **nunca cópia direta de produção** | É o lado esquerdo do diff de portabilidade (Épico 1) |
| `produção` | Operação | Dados reais, multi-tenant | Aplicação de pacote de configuração exige confirmação digitada (ADR-004) |

**Regra:** a promoção entre ambientes ocorre exclusivamente por **pacote de configuração versionado** (Épico 1) e por **imagem de contêiner assinada** — nunca por edição manual de configuração em produção.

---

## 3. `[+]` Aderência ITIL: Catálogo de Processos e Rastreabilidade

### 3.1. Nota metodológica sobre o escopo de certificação

O §1 declara aderência a **"25 processos auditáveis de ITSM (equivalente ao padrão PinkVERIFY)"**. Essa afirmação precisa ser precisada antes de ser usada em material comercial ou em resposta a edital:

- O **framework ITIL 2011** define **26 processos** distribuídos em cinco estágios do ciclo de vida. É a leitura mais provável do número declarado, e é a base adotada na matriz abaixo.
- O **PinkVERIFY** é um esquema de certificação de ferramenta conduzido pela Pink Elephant, que avalia um **subconjunto** de processos contra critérios obrigatórios específicos, e cujo escopo e requisitos variam por edição do esquema (PinkVERIFY 2011 × edições alinhadas ao ITIL 4). **A lista exata de processos certificáveis e seus critérios devem ser obtidos junto à Pink Elephant antes de qualquer compromisso formal de certificação.**

> **Pendência bloqueante (ver §12):** confirmar (a) o esquema-alvo (ITIL 2011 ou ITIL 4), (b) a lista oficial de processos no escopo da certificação pretendida e (c) se a certificação é requisito de lançamento ou meta posterior. Até essa confirmação, o material do produto deve dizer *"aderente às práticas ITIL"* e não *"certificado PinkVERIFY"*.

### 3.2. Matriz de rastreabilidade — 26 processos ITIL 2011

Legenda de cobertura: **Núcleo** = implementado como módulo de primeira classe · **Parcial** = coberto em parte por outro módulo · **Fora do escopo v1** = processo de governança humana sem função de ferramenta relevante no primeiro ciclo.

#### Service Strategy

| # | Processo | Cobertura | Épico |
|---|---|---|---|
| 1 | Strategy Management for IT Services | Fora do escopo v1 | — |
| 2 | Service Portfolio Management | Parcial | 4 (catálogo), 16 (níveis de serviço) |
| 3 | Financial Management for IT Services | Núcleo | 8.2, **20** |
| 4 | Demand Management | Parcial | 9 (analytics de volume), 16 (capacidade) |
| 5 | Business Relationship Management | Parcial | 9.1 (CSAT/NPS), 18 (portal) |

#### Service Design

| # | Processo | Cobertura | Épico |
|---|---|---|---|
| 6 | Design Coordination | Fora do escopo v1 | — |
| 7 | Service Catalogue Management | Núcleo | **4** |
| 8 | Service Level Management | Núcleo | **16** |
| 9 | Availability Management | Núcleo | **16** |
| 10 | Capacity Management | Núcleo | **16** |
| 11 | IT Service Continuity Management | Núcleo | **16** (processo), 12.4 (execução técnica do DR) |
| 12 | Information Security Management | Núcleo | **17**, ADR-013, ADR-014 |
| 13 | Supplier Management | Núcleo | **20** |

#### Service Transition

| # | Processo | Cobertura | Épico |
|---|---|---|---|
| 14 | Transition Planning and Support | Núcleo | **14** |
| 15 | Change Management | Núcleo | **6.3** |
| 16 | Service Asset and Configuration Management | Núcleo | **13** (CMDB), **8** (ativos) |
| 17 | Release and Deployment Management | Núcleo | **14** |
| 18 | Service Validation and Testing | Núcleo | **14** |
| 19 | Change Evaluation | Núcleo | **14**, 5.3 (relatório de impacto para o CAB) |
| 20 | Knowledge Management | Núcleo | **3** (consumo), **21** (ciclo de vida e governança) |

#### Service Operation

| # | Processo | Cobertura | Épico |
|---|---|---|---|
| 21 | Event Management | Núcleo | **15** |
| 22 | Incident Management | Núcleo | **6.1** |
| 23 | Request Fulfilment | Núcleo | **18**, 4 (catálogo) |
| 24 | Problem Management | Núcleo | **6.2** |
| 25 | Access Management | Núcleo | **17** |

#### Continual Service Improvement

| # | Processo | Cobertura | Épico |
|---|---|---|---|
| 26 | Seven-Step Improvement Process | Núcleo | **21** |

### 3.3. Conclusão da análise de aderência

A matriz expôs **nove processos declarados no §1 que não possuíam nenhuma história no backlog v1.1**: Release & Deployment, Transition Planning, Service Validation & Testing, Change Evaluation, Event Management, Access Management, Service Level Management (como processo, distinto do temporizador de SLA), Availability/Capacity/Continuity e Supplier Management. Eles originam os **Épicos 13 a 21** (§4.2). Adicionalmente, a **CMDB** — citada como pilar no §1 — ficou sem épico próprio quando o Épico 8 passou a tratar exclusivamente de ITAM/SAM; o **Épico 13** corrige isso.

---

## 4. Backlog Estratégico do Produto

### 4.1. Épicos de produto (1 a 12)

#### Épico 1: Governança e Portabilidade de Configuração (Config Portability)

- **História 1.1**: Desenvolver motor de serialização em schema JSON declarativo para exportação e importação de formulários, fluxos de trabalho e catálogos.
- **História 1.2**: Implementar validação sintática (*dry-run*) em pipeline para checar integridade referencial antes da aplicação de pacotes em produção.
- **História 1.3**: Gerar relatórios visuais diferenciais (*diff*) comparando as configurações ativas entre ambientes de Homologação e Produção.
- **`[+]` História 1.4**: Versionar pacotes de configuração com histórico completo de aplicações (autor, data, *diff* aplicado, resultado), consumindo a trilha de auditoria do ADR-007 — sem isso não há como responder "quem mudou este fluxo em produção e quando".
- **`[+]` História 1.5**: Implementar *rollback* de pacote aplicado, restaurando a configuração anterior como nova versão (nunca por exclusão de histórico), com o mesmo *dry-run* de integridade referencial na direção inversa.

#### Épico 2: Delegação Dinâmica de Papéis e Alçadas (Portal Delegation)

- **História 2.1**: Disponibilizar interface de autoatendimento para agendamento de ausências temporárias com indicação de delegado e alçadas transferidas.
- **História 2.2**: Implementar roteamento automático de aprovações com registro de auditoria dupla (titular da alçada e responsável pela aprovação).
- **História 2.3**: Configurar rotina temporal via `pg_cron` para expiração e revogação imediata dos acessos delegados ao término do período.
- **`[+]` História 2.4**: Notificar proativamente titular e delegado em D-1 do início e do término da delegação (ADR-010), e bloquear delegação circular (A→B→A) ou que exceda a alçada do próprio titular.
- **`[+]` História 2.5**: Exibir, em toda aprovação executada sob delegação, a identificação visível do titular da alçada na interface e no registro — a dupla auditoria precisa ser legível pelo auditor, não apenas persistida.

#### Épico 3: Base de Conhecimento Contextual Integrada

- **História 3.1**: Criar painel lateral persistente na tela de atendimento com busca semântica em tempo real via *embeddings* no pgvector.
- **História 3.2**: Exibir recomendações algorítmicas de artigos de contorno baseadas no texto e metadados do chamado em análise.
- **História 3.3**: Permitir a anexação direta da solução recomendada na resposta de comunicação ao solicitante com métricas de reuso do artigo.
- **`[+]` História 3.4**: Reindexar *embeddings* de forma incremental conforme a conversa do chamado evolui (a tela de referência especifica que o painel "atualiza conforme a conversa evolui", o que exige reindexação orientada a evento, não busca estática por título).
- **`[+]` História 3.5**: Persistir métricas de eficácia por artigo (contagem de reuso, taxa de resolução associada, avaliação do solicitante) como dados de primeira classe — a tela exibe "reutilizado 34 vezes · resolveu 78% dos casos", o que não é calculável *ad hoc* em tempo de renderização.

#### Épico 4: Catálogo em Cartões Dinâmicos e Filtragem Multinível

- **História 4.1**: Desenvolver catálogo de serviços modular estruturado em cartões dinâmicos com exibição de SLAs e custos operacionais estimados.
- **História 4.2**: Aplicar filtragem contextual de serviços e formulários orientada pelas informações corporativas contidas no token de identidade do usuário.
- **História 4.3**: Construir renderizador dinâmico de formulários baseado em schemas JSON com validação instantânea no cliente e no servidor.
- **`[+]` História 4.4**: Construir o editor de autoria de schema de formulário — o protótipo entrega a tela do formulário *renderizado*, mas não existe tela para *criar* o schema que o gera, o que inviabiliza a operação zero-code do catálogo.
- **`[+]` História 4.5**: Derivar e exibir no cartão a contagem de aprovações necessárias antes da submissão ("· 2 aprovações"), o que exige vínculo entre item de catálogo e definição de workflow resolvível em tempo de listagem.
- **`[+]` História 4.6**: Suportar campos condicionais e dependentes no renderizador (exibir campo B apenas se A = X), avaliados pelo BRE do Épico 7 — sem isso, formulários de onboarding e de compra exigirão um schema por variação.

#### Épico 5: Inteligência AIOps & Assistente Cognitivo Corporativo

- **História 5.1**: Desenvolver worker assíncrono conectado ao pgmq para correlação temporal e geográfica de incidentes, emitindo alertas de incidentes massivos (*Storm Alert*).
- **História 5.2**: Implementar assistente virtual conversacional estruturado em arquitetura RAG (*Retrieval-Augmented Generation*) com isolamento multilocatário.
- **História 5.3**: Automatizar a criação de relatórios de impacto de mudanças para apoiar deliberações em Conselhos de Mudanças (CAB).
- **`[+]` História 5.4**: Restringir o assistente a ações propositivas com confirmação humana explícita ("Criar problema", "Ver fontes") — nenhuma ação destrutiva ou de mudança de estado é executada autonomamente pelo modelo, conforme o padrão estabelecido na tela de referência de AIOps.
- **`[+]` História 5.5**: Exibir obrigatoriamente as fontes citadas e o escopo de acesso aplicado em toda resposta do assistente ("Respostas restritas ao seu espaço de serviço e ao seu nível de acesso"), tornando o isolamento do ADR-017 verificável pelo usuário.
- **`[+]` História 5.6**: Registrar toda interação com o assistente na trilha de auditoria (prompt, documentos recuperados, resposta, ator, locatário), requisito para auditabilidade de decisão assistida por IA.

#### Épico 6: Core ITSM e Práticas Fundamentais (PinkVERIFY)

- **História 6.1 — Gestão de Incidentes**: Ciclo de vida completo (Novo, Em Atendimento, Pendente com pausa de SLA, Resolvido, Fechado); matriz matricial de priorização automática baseada em Impacto versus Urgência; vínculo com múltiplos chamados correlacionados (*Parent-Child*).
- **História 6.2 — Gestão de Problemas e KEDB**: Registro de problemas a partir de incidentes recorrentes; condução estruturada de Análise de Causa-Raiz (RCA) com suporte metodológico aos 5 Porquês e Diagrama de Ishikawa; manutenção da Base de Erros Conhecidos (KEDB) com publicação de soluções de contorno.
- **História 6.3 — Gestão de Mudanças em Três Trilhas**:
  - **Mudança Padrão**: Pré-autorizada, baixo risco, baseada em procedimentos operacionais homologados.
  - **Mudança Normal**: Workflow completo com avaliação de risco automatizada, modelagem gráfica de impacto sobre a CMDB, aprovação de Comitê de Mudanças (CAB) e Revisão Pós-Implementação (PIR) obrigatória.
  - **Mudança Emergencial**: Rota acelerada para restauração de serviço crítico, aprovação via *Emergency CAB* (ECAB) e regularização documental retroativa em até 24 horas.
- **`[+]` História 6.4 — Modelos de Chamado e Taxonomia**: Catálogo de categorização hierárquico (categoria → subcategoria → tipo de item) versionado, e modelos (*templates*) de chamado que pré-preenchem campos, grupo responsável e SLA — requisito prático para operação em escala e para a consistência dos relatórios do Épico 9.
- **`[+]` História 6.5 — Grafo de Registros Relacionados**: Vínculo tipado e navegável entre registros (incidente ↔ problema ↔ mudança ↔ liberação ↔ CI ↔ artigo de KB), sustentando a aba "Itens relacionados" da mesa de atendimento e a rastreabilidade exigida em auditoria de processo.
- **`[+]` História 6.6 — Tarefas e Atividades**: Decomposição de um registro em tarefas com responsáveis e ordem de execução (sequencial ou paralela), necessária para mudanças com plano de implementação e para requisições compostas (onboarding abre acesso, equipamento e crachá em paralelo).

#### Épico 7: Business Rules Engine (BRE) Visual e Desacoplado

- **História 7.1**: Construtor visual de condições combinadas (blocos condicionais SE / E / OU / NÃO) permitindo aninhamento recursivo de regras sobre qualquer atributo do chamado ou ativo.
- **História 7.2**: Mecanismo de execução determinística de regras avaliando gatilhos de criação, atualização e eventos temporais sem uso de código procedural.
- **História 7.3**: Biblioteca compartilhada de ações automatizadas: atribuição inteligente de filas/analistas com base em carga de trabalho, recálculo de prazos de SLA e disparo de rotas de aprovação multinível.
- **`[+]` História 7.4**: Simulação (*dry-run*) de regra contra um registro real ou sintético, exibindo a árvore de avaliação com o resultado de cada nó — sem isso, o administrador de negócio publica regras às cegas, o que é incompatível com a promessa zero-code.
- **`[+]` História 7.5**: Definir e tornar visível a semântica de **precedência e conflito**: ordem de execução por prioridade explícita, escopo (global / locatário / espaço de serviço), critério de parada (primeira regra que casa × todas as regras que casam) e detecção de regras mutuamente contraditórias na publicação.
- **`[+]` História 7.6**: Versionar regras com histórico e permitir desativação imediata (*kill switch*) sem exclusão, registrando toda avaliação com os fatos de entrada e o resultado na trilha de auditoria (ADR-007) — auditoria de decisão, e não apenas de mutação.

#### Épico 8: Gestão de Ativos de TI (ITAM) e Software Asset Management (SAM)

- **História 8.1 — Ciclo de Vida de Hardware**: Rastreamento de estados físicos (Em Catálogo → Adquirido → Em Estoque → Em Uso → Manutenção → Descartado) com alocação nominal a colaboradores, centros de custo e localidades.
- **História 8.2 — Gestão Financeira e Depreciação**: Registro de valores de aquisição, notas fiscais, contratos de garantia/manutenção e cálculo automatizado de depreciação mensal utilizando os métodos linear (*straight-line*) e saldo decrescente (*reducing balance*).
- **História 8.3 — Conformidade de Software (SAM)**: Contador de licenças autorizadas versus instaladas (integrado via conectores de descoberta), cálculo de conformidade (*true-up*) e alertas preditivos de vencimento de contratos.
- **`[+]` História 8.4 — Vínculo Ativo ↔ CI e Reconciliação**: Relacionamento explícito entre o registro financeiro do ativo (Épico 8) e o item de configuração operacional (Épico 13), com rotina de reconciliação que aponta divergências (ativo em estoque que aparece em uso na descoberta, CI sem ativo correspondente).
- **`[+]` História 8.5 — Descarte Seguro**: Registro de descarte com certificado de sanitização de dados, destinação ambiental e baixa contábil vinculada — exigência de conformidade em auditoria de ativos e em contratos corporativos.
- **`[+]` História 8.6 — Premissa Contábil a Validar**: O método de depreciação deve ser parametrizável por classe de ativo e por locatário. **Decisão pendente de validação contábil/fiscal (§12):** no contexto brasileiro a depreciação fiscal costuma seguir taxas lineares da Receita Federal, enquanto o saldo decrescente tende a ser gerencial/IFRS — a plataforma deve suportar ambos em paralelo (visão fiscal e visão gerencial) em vez de assumir um único método.

#### Épico 9: Analytics ITSM Avançado, Aging e Construtor de Relatórios

- **História 9.1**: Painéis de métricas fundamentais em tempo real: Tempo Médio de Resolução (MTTR), Tempo Médio de Primeira Resposta (MTTA), Taxa de Resolução no Primeiro Contato (FCR) e índices de satisfação pós-atendimento (CSAT e NPS).
- **História 9.2**: Visão de envelhecimento (*Aging*) com distribuição visual de chamados abertos em faixas temporais configuráveis (ex.: 0–2 dias, 3–7 dias, 8–14 dias, 15–30 dias, +30 dias).
- **História 9.3**: Construtor de relatórios dinâmico com seleção de colunas, agrupamentos, filtros multidimensionais, agendamento de envio por e-mail e exportação em PDF, CSV e XLSX.
- **`[+]` História 9.4 — Camada Semântica de Métricas**: Definição única e versionada de cada indicador (fórmula, origem, exclusões, tratamento de pausa de SLA) materializada em *views* agregadas. Sem isso, "MTTR" significará coisas diferentes no painel, no relatório agendado e na resposta do assistente cognitivo — e o dashboard consultará as tabelas transacionais a cada carregamento, comprometendo a performance da operação.
- **`[+]` História 9.5 — Métricas de Mudança e de Conhecimento**: Taxa de sucesso de mudança, proporção de mudanças emergenciais, taxa de *rollback*, reincidência de problema e taxa de deflexão por artigo de KB — indicadores exigidos por auditoria de processo e ausentes do conjunto inicial, que cobre apenas a operação de incidentes.
- **`[+]` História 9.6 — Segurança Analítica**: Toda consulta do construtor de relatórios executa sob as mesmas políticas RLS da aplicação; exportações agendadas são geradas no contexto de acesso do destinatário, e não no do criador do agendamento — caso contrário, o relatório agendado vira um canal de vazamento entre partições departamentais.

#### Épico 10: Central de Notificações Multicanal e Webhooks Assinados

- **História 10.1**: Fila de envio multicanal com roteamento para E-mail (via Microsoft Graph API e SMTP), *Push Notifications* e Central in-app.
- **História 10.2**: Central de notificações in-app persistente com contador em tempo real alimentado via WebSockets pelo Supabase Realtime.
- **História 10.3**: Motor de Webhooks de saída assinado criptograficamente com HMAC-SHA256, mecanismo de retentativas com recuo exponencial (*exponential backoff*) e registro de logs de entrega para auditoria.
- **`[+]` História 10.4 — Preferências e Antifadiga**: Preferência por usuário e por tipo de evento, modo *digest* (resumo periódico) para eventos de baixa prioridade e janela de silêncio (*quiet hours*) respeitando o fuso do usuário. Uma plataforma de ITSM sem controle de volume de notificação é abandonada pelos analistas na primeira semana.
- **`[+]` História 10.5 — Modelos de Mensagem**: Templates versionados por locatário, canal e idioma, com pré-visualização e variáveis validadas contra o schema do evento — evitando que a personalização de texto vire código.
- **`[+]` História 10.6 — Ingestão de E-mail**: Abertura e atualização de chamados a partir de caixa postal dedicada (*inbound parsing*), com correlação por identificador no assunto, deduplicação e tratamento de resposta automática — canal de entrada esperado em qualquer service desk corporativo e ausente do escopo declarado.

#### Épico 11: Governança de UI & Design Tokens Acessíveis (WCAG 2.2 AA)

- **História 11.1**: Centralização de todos os parâmetros estéticos em um arquivo mestre `tokens.json` (paleta cromática com verificação de contraste mínimo 4.5:1, escalas tipográficas, espaçamentos e raios de borda).
- **História 11.2**: Pipeline automatizado via Style Dictionary para compilar `tokens.json` diretamente para a configuração do Tailwind CSS e variáveis CSS nativas.
- **História 11.3**: Bloqueio de CI para classes utilitárias arbitrárias do Tailwind que violem os limites semânticos dos tokens estabelecidos.
- **`[+]` História 11.4 — Paridade de Tema**: Tema claro e escuro definidos como pares de token no mesmo arquivo, com teste automatizado de contraste executado sobre **ambos** os temas na esteira. O design system entrega superfícies para os dois temas; validar apenas o escuro deixaria metade da interface sem garantia de conformidade.
- **`[+]` História 11.5 — Biblioteca de Componentes**: Storybook como vitrine e superfície de teste dos componentes, com `@storybook/addon-a11y` executando Axe-core por história e bloqueio de merge em caso de violação (operacionaliza o ADR-005, que hoje é uma regra sem mecanismo).
- **`[+]` História 11.6 — Definição Tipográfica**: Encerrar o **R1** (§ 12.1) e hospedar localmente (`@font-face` self-hosted) a família definitiva, seja ela licenciada ou OFL. O protótipo carrega apenas `Outfit` e `JetBrains Mono`; **Gilroy** e **Lufga** estão declaradas na pilha CSS mas nunca são baixadas, então provavelmente já foi a Outfit que se revisou e aprovou. A primeira tarefa é confirmar isso com quem aprovou — pode encerrar o risco sem custo. Se a decisão for licenciar, o escopo depende do **R9(a)**: SaaS e on-premises exigem licenças de naturezas diferentes (a segunda implica redistribuição a terceiros).
- **`[+]` História 11.7 — Regras de Produto Derivadas do Design**: Tornar verificáveis as regras que o Axe-core não detecta — cor nunca como único portador de informação (prioridade, SLA e estado sempre com rótulo textual), alvo mínimo de 44×44 px e uso do gradiente de marca limitado a um destaque por tela.

#### Épico 12: Observabilidade de Produção, Hardening e Disaster Recovery (DR)

- **História 12.1**: Instrumentação unificada com OpenTelemetry propagando cabeçalhos W3C Trace Context (`traceparent`) desde a requisição no frontend até os workers assíncronos do pgmq.
- **História 12.2**: Exportação de métricas (*golden signals*: latência, tráfego, taxa de erro e saturação) para Prometheus e painéis operacionais Grafana.
- **História 12.3**: Políticas rigorosas de *hardening* no Kubernetes: execução sob `PodSecurityStandards: Restricted`, perfis Seccomp ativados e bloqueio de comunicação entre *namespaces* via NetworkPolicies.
- **História 12.4**: Estratégia automatizada de *Disaster Recovery* baseada em replicação contínua do PostgreSQL (arquivamento de WAL com pgBackRest/WAL-G) garantindo RPO < 5 minutos e RTO < 30 minutos em caso de falha catastrófica de cluster.
- **`[+]` História 12.5 — Alertas Acionáveis**: SLOs formais com alertas por taxa de consumo de orçamento de erro (*burn rate*), e monitoramento obrigatório de profundidade de fila, idade da mensagem mais antiga e ocupação da DLQ. Uma mensagem na DLQ é uma automação de negócio que silenciosamente não aconteceu — precisa de alerta, não de painel.
- **`[+]` História 12.6 — Gestão de Segredos**: Origem única de segredos (*External Secrets* ou equivalente), rotação periódica de chaves (JWT, HMAC de webhook, credenciais de banco) e proibição de segredo em imagem, ConfigMap ou variável de ambiente versionada. Verificado por Gitleaks na esteira.
- **`[+]` História 12.7 — Prova de Resiliência**: Execução periódica de *GameDay* — restauração real de backup em ambiente isolado com cronometragem contra o RTO declarado, exercício de caos (morte de pod, latência de rede, saturação de fila) validando HPA/KEDA e *graceful shutdown*, e teste de intrusão externo antes do GA. Um RPO/RTO nunca exercitado é uma hipótese, não uma garantia.
- **`[+]` História 12.8 — Exportação de Auditoria para SIEM**: Canal de exportação contínua da trilha de auditoria para o SIEM corporativo do cliente, sem acoplar a aplicação a um fornecedor específico de SIEM.

### 4.2. `[+]` Épicos complementares identificados na reanálise (13 a 21)

Todos os épicos desta seção decorrem diretamente da matriz da §3.2: cada um cobre processos declarados no §1 que não possuíam história correspondente. São propostas — o dono do produto decide quais entram no escopo do primeiro ciclo.

#### `[+]` Épico 13: CMDB Federada, Descoberta e Raio de Impacto

> **Justificativa:** a CMDB é citada como pilar no §1 e tem tela de referência completa no design system, mas perdeu seu épico quando o Épico 8 passou a tratar exclusivamente de ITAM/SAM. Sem ela, os Épicos 5 (impacto de mudança), 6.3 (modelagem gráfica de impacto) e 8.4 (vínculo ativo↔CI) não têm base sobre a qual operar.

- **História 13.1 — Modelo e Grafo de CIs**: Tipos de CI parametrizáveis, atributos por tipo e relacionamentos tipados e direcionados (depende de, hospeda, conecta a, compõe), navegáveis em três níveis conforme a tela de referência (consumidores acima, CI selecionado ao centro, dependências abaixo).
- **História 13.2 — Federação e Proveniência**: Ingestão de múltiplas fontes (descoberta de rede, inventário de nuvem, importação manual/planilha) com registro obrigatório de origem e frescor por CI e por atributo, e política de precedência quando duas fontes divergem sobre o mesmo atributo.
- **História 13.3 — Raio de Impacto (*Blast Radius*)**: Serviço de cálculo que percorre o grafo e cruza com usuários, serviços de negócio e processos críticos vinculados, reutilizável por Incidente, Mudança e pela ação "Simular indisponibilidade" — a simulação nunca altera o estado real do CI.
- **História 13.4 — Linha de Base e Deriva**: Captura de *baseline* de configuração e detecção de deriva não autorizada (CI alterado sem mudança aprovada associada), que é o principal valor de controle de uma CMDB em auditoria.
- **História 13.5 — Acessibilidade do Grafo**: Navegação do mapa de dependências por teclado com anúncio das relações pai/filho por leitor de tela e alternativa tabular equivalente — visualizações em grafo são o ponto de falha mais comum de conformidade WCAG em ferramentas de ITSM.

#### `[+]` Épico 14: Gestão de Liberações, Implantação e Avaliação de Mudanças

> **Justificativa:** "Gestão de Liberações" é declarada no §1 e não possui nenhuma história. Cobre também Transition Planning, Service Validation & Testing e Change Evaluation (processos 14, 17, 18 e 19 da matriz).

- **História 14.1 — Registro de Liberação**: Agrupamento de múltiplas mudanças em uma liberação com janela, plano de implantação, plano de retorno e critérios de aceite.
- **História 14.2 — Planejamento de Transição**: Calendário unificado de liberações e mudanças com detecção de conflito de janela e de CI compartilhado entre itens concorrentes.
- **História 14.3 — Validação e Testes de Serviço**: Registro dos testes de aceite executados por liberação, com evidência anexada e bloqueio de implantação enquanto houver critério de aceite não atendido.
- **História 14.4 — Avaliação de Mudança e PIR**: Avaliação formal pré-implantação (risco, impacto, conflito, histórico de falha do CI) e Revisão Pós-Implementação obrigatória com resultado alimentando as métricas do Épico 9.5.

#### `[+]` Épico 15: Gestão de Eventos e Integração com Monitoramento

> **Justificativa:** o Épico 5 correlaciona incidentes, mas não existe canal definido para que ferramentas de monitoramento *criem* eventos e incidentes. Event Management é o processo 21 da matriz e é o alimentador natural do AIOps.

- **História 15.1 — Ingestão de Eventos**: Endpoint público autenticado e idempotente para recebimento de eventos de ferramentas de monitoramento, com deduplicação por chave de evento e correlação com o CI afetado.
- **História 15.2 — Classificação e Limiar**: Classificação de evento (informativo, alerta, exceção) e regras de promoção a incidente avaliadas pelo BRE do Épico 7 — nenhuma lógica de limiar codificada em worker.
- **História 15.3 — Supressão e Manutenção Programada**: Supressão automática de eventos de CIs em janela de manutenção aprovada, evitando tempestade de incidentes durante mudanças planejadas.
- **História 15.4 — Fechamento por Evento de Recuperação**: Resolução automática de incidentes abertos por evento quando o evento de recuperação correspondente é recebido, com registro na trilha de auditoria.

#### `[+]` Épico 16: Níveis de Serviço, Disponibilidade, Capacidade e Continuidade

> **Justificativa:** o temporizador de SLA aparece como bloco do FlowBuilder e como coluna na fila, mas Service Level Management como processo (acordos, OLAs, contratos de apoio, relatório de cumprimento) não existe no backlog. Cobre os processos 8, 9, 10 e 11 da matriz.

- **História 16.1 — Acordos Formais**: Modelagem de SLA (com o cliente), OLA (entre times internos) e UC/*Underpinning Contract* (com fornecedores), cada um com metas próprias de resposta e resolução por prioridade e por serviço.
- **História 16.2 — Calendários de Negócio**: Horário útil por espaço de serviço, localidade e fuso, com feriados e exceções; pausa de SLA em estados de espera; e recálculo determinístico de prazo quando prioridade ou calendário mudam (ADR-016).
- **História 16.3 — Relatório de Cumprimento**: Apuração periódica de cumprimento por acordo, com memória de cálculo auditável — qual relógio correu, quando pausou e por quê.
- **História 16.4 — Disponibilidade e Capacidade de Serviço**: Registro de disponibilidade por serviço de negócio (derivada de incidentes e janelas) e acompanhamento de tendência de demanda para planejamento de capacidade.
- **História 16.5 — Continuidade de Serviço**: Registro dos planos de continuidade por serviço crítico, com vínculo aos CIs e aos exercícios de DR executados no Épico 12.7 — o processo ITIL de continuidade é o dono do plano; o Épico 12 é a execução técnica.

#### `[+]` Épico 17: Identidade Federada, SSO e Gestão de Acessos

> **Justificativa:** GoTrue com OIDC/SAML/Entra ID está na tabela de stack, mas nenhuma história do backlog v1.1 implementa federação, provisionamento ou o processo de Access Management (processo 25 da matriz). É pré-requisito de qualquer piloto corporativo.

- **História 17.1 — Federação**: Autenticação via OIDC, SAML 2.0 e Azure Entra ID, com provisionamento *just-in-time* do usuário no primeiro acesso.
- **História 17.2 — Mapeamento de Claims**: Tradução de grupos e atributos do provedor de identidade em papéis, espaços de serviço e atributos corporativos (departamento, unidade, centro de custo) que alimentam a filtragem contextual do Épico 4.2 e as políticas RLS do ADR-003.
- **História 17.3 — Ciclo de Vida de Acesso**: Concessão, revisão periódica (recertificação) e revogação de acesso, com desprovisionamento imediato no desligamento — integrado ao *offboarding* do Épico 19.1.
- **História 17.4 — Segregação de Funções**: Detecção e bloqueio de combinações proibidas de papéis (ex.: quem solicita não aprova; quem aprova não executa), requisito recorrente em auditoria de controles internos.

#### `[+]` Épico 18: Portal do Colaborador e Fulfilment de Requisições

> **Justificativa:** o design system cobre a mesa do analista, mas a jornada do solicitante final termina no cartão do catálogo. "Meus pedidos" é referenciado no cabeçalho da tela de catálogo e não possui tela nem história. Request Fulfilment é o processo 23 da matriz.

- **História 18.1 — Meus Pedidos**: Acompanhamento do ciclo de vida da requisição pelo solicitante, com etapa atual, aprovações pendentes e previsão de entrega.
- **História 18.2 — Interação e Reabertura**: Resposta a pendências, envio de anexos e reabertura assistida dentro de janela configurável.
- **História 18.3 — Pesquisa de Satisfação**: Coleta de CSAT/NPS no fechamento, alimentando o Épico 9.1, com salvaguarda contra fadiga de pesquisa (amostragem e intervalo mínimo por solicitante).
- **História 18.4 — Autoatendimento Assistido**: Sugestão de artigos de KB e de fluxos de solução antes da abertura do chamado, com medição de deflexão (Épico 9.5).
- **História 18.5 — Acessibilidade e Alcance**: O portal atende colaboradores de todos os departamentos, incluindo os que acessam por dispositivo móvel e os que dependem de tecnologia assistiva — WCAG 2.2 AA e uso em tela pequena são requisitos de primeira classe, não adaptação posterior.

#### `[+]` Épico 19: Módulos ESM Especializados (RH, Financeiro, Facilities)

> **Justificativa:** ESM está no nome do produto, o design system define cor e etiqueta para quatro domínios (TI, RH, Finanças, Instalações) e o catálogo de referência exibe itens dos quatro. Ainda assim, nenhuma história trata das regras específicas desses domínios — sem elas o produto é um ITSM com rótulos coloridos.

- **História 19.1 — RH**: *Onboarding* e *offboarding* com abertura paralela de pedidos (acesso, equipamento, crachá) e checklist obrigatório de encerramento de acessos no desligamento, integrado ao Épico 17.3. Dados de RH exigem tratamento reforçado de confidencialidade (ADR-012 e ADR-013).
- **História 19.2 — Financeiro**: Reembolso e compra com alçada por valor avaliada pelo BRE, anexação de comprovantes e integração com o registro financeiro de ativos (Épico 8.2).
- **História 19.3 — Facilities**: Reserva de sala e recurso físico com calendário e confirmação por disponibilidade, e chamado de manutenção predial com SLA e taxonomia próprios.
- **História 19.4 — Isolamento entre Domínios**: Cada espaço de serviço tem catálogo, fluxos, taxonomia, SLAs e grupos próprios, com visibilidade padrão restrita ao próprio espaço e compartilhamento apenas por concessão explícita (ADR-012).

#### `[+]` Épico 20: Fornecedores, Contratos e Gestão Financeira de TI

> **Justificativa:** processos 3 e 13 da matriz. O Épico 8.2/8.3 trata do lado do ativo e da licença, mas não do fornecedor, do contrato guarda-chuva e do desempenho contratual.

- **História 20.1 — Cadastro de Fornecedores e Contratos**: Contratos com vigência, escopo, valores, cláusulas de nível de serviço (UC) e alertas de renovação.
- **História 20.2 — Desempenho de Fornecedor**: Apuração do cumprimento das metas contratuais a partir dos chamados escalados ao fornecedor, alimentando a renovação com dado e não com percepção.
- **História 20.3 — Custo de Serviço**: Consolidação de custo por serviço e por centro de custo (ativos, licenças, contratos e esforço), base para o *showback* que o catálogo já promete ao exibir custo estimado por item.

#### `[+]` Épico 21: Melhoria Contínua (CSI) e Ciclo de Vida do Conhecimento

> **Justificativa:** processos 20 e 26 da matriz. O Épico 3 trata do *consumo* do conhecimento; a autoria, revisão, aprovação e obsolescência dos artigos não têm dono. E o processo de melhoria contínua é o que transforma as métricas do Épico 9 em ação.

- **História 21.1 — Ciclo de Vida do Artigo**: Rascunho → revisão técnica → aprovação → publicação → revisão periódica → arquivamento, com responsável e prazo por etapa.
- **História 21.2 — Conhecimento a partir da Resolução**: Proposta de artigo derivada de um chamado resolvido, preservando o vínculo com o incidente de origem e com o erro conhecido correspondente.
- **História 21.3 — Registro de Melhoria (CSI Register)**: Cadastro de oportunidades de melhoria com origem (métrica, PIR, pesquisa, incidente), responsável, ganho esperado e acompanhamento do resultado.
- **História 21.4 — Governança de Qualidade**: Detecção de artigos obsoletos, duplicados ou de baixa eficácia a partir das métricas do Épico 3.5, com fluxo de curadoria.

### 4.3. Fases de entrega

A ordem reflete dependência técnica, não prioridade de negócio — a priorização dentro de cada fase cabe ao dono do produto.

| Fase | Foco | Épicos | Marco de saída |
|---|---|---|---|
| **0 — Fundação** | Monorepo, esteira de CI com todos os gates, schema base e padrão de RLS, identidade, tokens compilando, observabilidade instrumentada desde o primeiro endpoint | transversal + 11, 12.1–12.3, 17.1–17.2 | Um endpoint em produção com RLS, auditoria, trace e token de UI funcionando ponta a ponta |
| **1 — Núcleo ITSM** | Incidente, Problema, Mudança, catálogo, mesa de atendimento, dashboard | 4, 6 | Um chamado percorre todo o ciclo de vida com SLA e auditoria |
| **2 — Fluxo e Regras** | FlowBuilder, BRE, portabilidade de configuração | 1, 7 | Um fluxo de aprovação é criado, validado, publicado e promovido sem deploy |
| **3 — Conhecimento e Comunicação** | KB contextual, notificações multicanal, ingestão de e-mail | 3, 10, 21 | Analista resolve com artigo sugerido e solicitante é notificado no canal de preferência |
| **4 — ESM e Autoatendimento** | Delegação, portal do colaborador, módulos RH/Financeiro/Facilities | 2, 18, 19 | Quatro domínios operando isolados na mesma instância |
| **5 — Ativos, CMDB e Inteligência** | CMDB federada, ITAM/SAM, eventos, AIOps, analytics | 5, 8, 9, 13, 15, 20 | Storm alert correlacionado a CI e a mudança, com relatório de impacto para o CAB |
| **6 — Governança de Serviço** | SLM/disponibilidade/capacidade/continuidade, liberações, acessos | 14, 16, 17.3–17.4 | Relatório de cumprimento de acordo auditável |
| **7 — Hardening e GA** | Segredos, SLOs e alertas, GameDay de DR, pentest, exportação para SIEM | 12.4–12.8 | RTO e RPO comprovados em exercício real |

---

## 5. `[+]` Arquitetura de Dados

### 5.1. Princípios

1. **Toda tabela de negócio carrega `tenant_id`**; tabelas de domínio de serviço carregam também `workspace_id` (ADR-012). Ambos participam das políticas RLS (ADR-003).
2. **Chaves primárias são UUID v7** (ordenáveis por tempo), preservando localidade de índice sem expor volume de negócio — os identificadores legíveis (`INC-48192`) são coluna separada e independente (ADR-015).
3. **Timestamps em `timestamptz`, sempre UTC**; a conversão para fuso do usuário é responsabilidade exclusiva da camada de apresentação (ADR-016).
4. **Exclusão lógica por padrão** (`deleted_at`) em entidades de negócio; exclusão física apenas por rotina de retenção declarada (ADR-013).
5. **Particionamento por tempo** (mensal) em `audit.logs`, `tickets` e tabelas de evento, viabilizando expurgo por *drop partition* em vez de `DELETE` massivo.

### 5.2. Modelo núcleo por domínio

| Domínio | Tabelas principais |
|---|---|
| Tenancy e identidade | `tenants`, `workspaces`, `people`, `groups`, `group_members`, `roles`, `role_assignments`, `delegations`, `delegation_scopes` |
| Catálogo e formulários | `catalog_categories`, `catalog_items`, `form_schemas`, `form_schema_versions` |
| Registros de serviço | `tickets` (particionada, discriminada por `ticket_type`), `ticket_relations`, `ticket_comments`, `ticket_tasks`, `ticket_attachments`, `ticket_watchers` |
| Práticas ITIL | `problems`, `known_errors`, `changes`, `change_approvals`, `cab_sessions`, `releases`, `release_items`, `test_evidences` |
| Níveis de serviço | `sla_definitions`, `ola_definitions`, `underpinning_contracts`, `sla_instances`, `business_calendars`, `calendar_exceptions` |
| CMDB e ativos | `ci_types`, `configuration_items`, `ci_relationships`, `ci_sources`, `ci_baselines`, `assets`, `asset_events`, `software_licenses`, `license_installations`, `contracts`, `suppliers` |
| Conhecimento | `kb_articles`, `kb_article_versions`, `kb_embeddings` (pgvector), `kb_feedback`, `csi_register` |
| Automação | `workflow_definitions`, `workflow_versions`, `workflow_instances`, `workflow_transitions`, `business_rules`, `rule_evaluations` |
| Comunicação | `notifications`, `notification_preferences`, `notification_templates`, `webhook_endpoints`, `webhook_deliveries` |
| Configuração | `config_packages`, `config_package_items`, `config_applications` |
| Eventos e AIOps | `monitoring_events`, `event_correlations`, `storm_alerts` |
| Auditoria | `audit.logs` (particionada, *append-only*, ADR-007) |

> Este é o modelo de intenção. O mapa **real** de tabelas criadas é mantido em `docs/CONTEXT.md` § 4 e atualizado a cada migração — divergência entre os dois é sinal de que uma das duas fontes não foi atualizada no PR.

### 5.3. Mapa de filas `pgmq`

| Fila | Produtor | Consumidor | Chave de idempotência |
|---|---|---|---|
| `pgmq_notifications` | Qualquer evento de domínio | Worker de notificações | `event_id` |
| `pgmq_webhooks` | Motor de notificações | Worker de entrega com *backoff* | `delivery_id` |
| `pgmq_workflow_actions` | Motor de workflow | Worker de ações automáticas | `transition_id` |
| `pgmq_sla_timers` | Criação/alteração de registro | Worker de SLA (+ `pg_cron` para varredura) | `sla_instance_id` + marco |
| `pgmq_incident_correlation` | Criação/atualização de incidente | Worker de correlação AIOps | `incident_id` + janela |
| `pgmq_rag_indexing` | Publicação de artigo, evolução de chamado | Worker de *embeddings* | `source_id` + `content_hash` |
| `pgmq_discovery_ingest` | Conectores de descoberta | Worker de reconciliação de CMDB | `source` + `external_id` + `payload_hash` |
| `pgmq_event_ingest` | Endpoint de eventos de monitoramento | Worker de classificação de evento | `event_key` |
| `pgmq_email_inbound` | Coletor de caixa postal | Worker de *parsing* e correlação | `message_id` |
| `pgmq_report_exports` | Agendamento e solicitação sob demanda | Worker de geração (PDF/CSV/XLSX) | `export_request_id` |
| `pgmq_audit_export` | Trilha de auditoria | Worker de exportação para SIEM | `audit_log_id` |

Toda fila de produção possui DLQ com alerta associado (Épico 12.5). O mapa vivo, com o estado real de implementação, vive em `docs/CONTEXT.md` § 3.

---

## 6. Esteira de Engenharia, CI/CD e Prontidão Kubernetes

### 6.1. Estrutura do Monorepo no GitHub

- `/.github/workflows`: Definições de pipelines automatizados do GitHub Actions.
- `/charts`: Helm Charts estruturados para Kubernetes (API, Workers e infraestrutura do Supabase).
- `/docs`: Repositório de governança viva contendo `CONTEXT.md`, `/ADR/` e `/PLAYBOOKS/`.
- `/src/api`: Serviço HTTP Fastify em TypeScript com imagens Distroless.
- `/src/workers`: Consumidores assíncronos das filas pgmq.
- `/src/web`: Aplicação frontend acessível em React 19.
- `/src/shared`: Tipagens TypeScript compartilhadas e schemas de validação Zod.
- `/supabase/migrations`: Arquivos SQL versionados de migração estrutural e políticas RLS.
- `/design-system`: Definição de `tokens.json` e scripts de geração de artefatos CSS/Tailwind.
- `/Dockerfile`: Instrução de empacotamento multi-estágio para Google Distroless.

> **`[+]` Nota de reconciliação:** `/design-system/` (raiz) contém o artefato **compilável** — `tokens.json` no formato DTCG e a configuração do Style Dictionary. `docs/design-system/` contém a **documentação** de design (inventário de componentes, telas de referência e regras de uso). Os dois se referenciam e não se duplicam.

### 6.2. Estratégia de Empacotamento Distroless

O contêiner de produção é construído em múltiplos estágios:

- **Estágio de Build**: Baseado em `node:22-alpine`. Compila o TypeScript, roda a validação estática de tipos e gera as dependências puras de produção via `npm ci --omit=dev`.
- **Estágio Final de Execução**: Baseado em `gcr.io/distroless/nodejs22-debian12`. Apenas os artefatos compilados e os módulos essenciais são incorporados.
- **Segurança de Execução**: O processo roda obrigatoriamente sob o usuário `USER nonroot:nonroot`, com sistema de arquivos montado como somente leitura (`readOnlyRootFilesystem: true`) e proibição expressa de elevação de privilégios (`allowPrivilegeEscalation: false`).

### 6.3. Requisitos Operacionais em Kubernetes

- **Sinais do Sistema Operacional**: O processo Node.js atua diretamente como PID 1 na imagem Distroless, gerenciando obrigatoriamente os sinais `SIGTERM` e `SIGINT` para drenar conexões ativas, pausar o consumo de filas pgmq e fechar o pool de banco antes do encerramento.
- **Probes de Saúde do Pod**:
  - `startupProbe`: Valida a carga inicial de esquemas e o teste de conexão com o banco de dados.
  - `livenessProbe`: Verifica o tempo de resposta do loop de eventos (*event loop*) do Node.js.
  - `readinessProbe`: Checa a conectividade com o pooler do Supabase e a latência de acesso às filas.
- **Dimensionamento Automático**: Escalonamento horizontal de Pods (HPA) baseado em CPU/memória para as APIs e orientado ao comprimento das filas do pgmq para os workers assíncronos via KEDA.
- **`[+]` Encerramento Coordenado**: `terminationGracePeriodSeconds: 30` com `preStop` removendo o pod do balanceador antes do `SIGTERM`, evitando que requisições em voo sejam descartadas durante *rolling update*.
- **`[+]` Orçamento de Interrupção**: `PodDisruptionBudget` garantindo no mínimo uma réplica disponível de API durante manutenção de nó.

### 6.4. `[+]` Gates obrigatórios da esteira de CI

Nenhum PR é mesclado com qualquer gate vermelho. Os gates 5, 6, 10 e 12 existem especificamente para tornar **mecânicas** as Regras de Ouro da §10.1 — uma regra que depende de o revisor lembrar não é um contrato, é uma intenção.

| # | Gate | Bloqueia quando |
|---|---|---|
| 1 | Lint e formatação | Violação de ESLint/Prettier, incluindo a regra que proíbe `console.log` e `eval` |
| 2 | Verificação de tipos | `tsc --noEmit` falha ou há `any` não justificado |
| 3 | Testes unitários e cobertura | Cobertura do código novo/alterado < 85% |
| 4 | Testes de integração | Falha contra Postgres efêmero, **incluindo os testes de vazamento entre locatários** |
| 5 | **Verificação de RLS** | Migração cria tabela de negócio sem `ENABLE ROW LEVEL SECURITY` e sem política correspondente |
| 6 | **Drift de OpenAPI** | O `openapi.json` gerado a partir dos schemas Zod difere do versionado |
| 7 | Acessibilidade | Axe-core acusa violação WCAG 2.2 AA em qualquer história do Storybook |
| 8 | SAST e dependências | CodeQL, OSV ou Gitleaks acusam achado acima do limiar |
| 9 | Varredura de imagem | Trivy encontra CVE com CVSS ≥ 7.0 |
| 10 | **Auditoria de design tokens** | Uso de classe utilitária arbitrária ou valor estético fora de `tokens.json` |
| 11 | Validação de charts | `helm lint`, `kubeconform` ou a política de PodSecurityStandards *Restricted* falham |
| 12 | **Sincronia documental** | `node scripts/sync-adrs.mjs --check` acusa divergência entre a §9 e `docs/ADR/`, ou migração/fila nova sem atualização de `docs/CONTEXT.md` |

---

## 7. Modelo Operacional de Agentes de IA: Claude Code & Codex

O ciclo de desenvolvimento utiliza Claude Code e Codex atuando de forma coordenada na criação, validação e integração contínua do código-fonte:

1. **Abertura e Especificação**: Uma Issue formal no GitHub descreve a demanda técnica, contratos de API e critérios de aceite.
2. **Scaffolding e Implementação (Codex)**: O Codex cria a branch semântica (`agent/codex-*`), implementa o código em TypeScript a partir dos schemas Zod, adiciona os testes unitários e abre o Pull Request com a descrição das alterações.
3. **Execução de Gates de CI**: O pipeline do GitHub Actions roda automaticamente os 12 gates da §6.4.
4. **Revisão Arquitetural (Claude Code)**: O Claude Code inspeciona o PR avaliando conformidade com as ADRs, regras de ouro, performance de RLS, cobertura da trilha de auditoria e atualização da documentação viva.
5. **Resolução de Conflitos (Claude Code)**: Havendo divergência de merge com a branch `main`, o Claude Code analisa as ASTs dos arquivos conflitantes, concilia os esquemas Zod e contratos de banco, roda a suíte de integração e atualiza a branch.
6. **Integração Linear**: Com todas as validações aprovadas, o merge na `main` é realizado exclusivamente via *Squash and Merge*.

### 7.1. `[+]` Limites de autonomia dos agentes

Decisões que **não** são delegadas a agente de IA, por exigirem julgamento de negócio, jurídico ou de risco irreversível:

- Aprovar ou alterar um ADR (agentes propõem; a decisão é humana).
- Aplicar pacote de configuração em produção, executar migração destrutiva ou alterar política de RLS em produção.
- Definir base legal, política de retenção ou critério de anonimização de dados pessoais (ADR-013).
- Aceitar risco de segurança (suprimir achado de SAST/Trivy) ou de acessibilidade (suprimir violação de Axe).
- Fechar um incidente de produção como "não reproduzível" sem revisão humana.

---

## 8. Governança de Contexto Vivo e Aprendizagem Contínua

Para manter o alinhamento técnico contínuo entre desenvolvedores e agentes de IA, o repositório mantém uma camada de documentação viva:

- **`/docs/CONTEXT.md`**: Documento mestre de estado. Registra módulos concluídos, convenções ativas, mapa de filas e tabelas, e fronteiras arquiteturais.
- **`/docs/PLAYBOOKS/INCIDENTS_LEARNING.md`**: Base de conhecimento operacional sobre falhas em testes ou incidentes, descrevendo a causa-raiz, a mitigação definitiva e a nova regra introduzida para evitar reincidência.
- **`/docs/ADR/`**: Registros formais de decisões arquiteturais numerados sequencialmente.
- **`[+]` Este documento (`ESM_ITSM_PLATFORM_SPEC.md`)**: intenção de projeto. Enquanto o `CONTEXT.md` responde *"o que já existe e como está"*, este responde *"o que decidimos construir e por quê"*.

### 8.1. `[+]` Regra de precedência documental

Em caso de divergência entre fontes, a ordem de autoridade é:

1. **Este documento, §9** — fonte única dos ADRs.
2. **`docs/ADR/ADR-0NN-*.md`** — registros individuais, **gerados** a partir da §9 por `scripts/sync-adrs.mjs`. Preservam a convenção de um arquivo por decisão (§8) e servem como referência estável para links, sem introduzir uma segunda cópia editável.
3. **`docs/CONTEXT.md`** — autoridade sobre o *estado real* implementado (que pode legitimamente divergir da intenção enquanto uma fase está em curso).
4. **Demais documentos** — derivados.

> **Por que gerar em vez de manter duas cópias:** duplicação documental sincronizada "por disciplina" diverge — é apenas questão de tempo. O gate 12 da §6.4 executa `node scripts/sync-adrs.mjs --check` e falha o PR se a §9 e os arquivos individuais discordarem, o que torna a consistência estrutural em vez de opcional. Para alterar um ADR: edite a §9 e rode `node scripts/sync-adrs.mjs`.

---

## 9. Registros de Decisão de Arquitetura (ADRs)

> **Esta seção é a fonte única dos ADRs.** Os arquivos em `docs/ADR/` são gerados a partir daqui por `scripts/sync-adrs.mjs` e verificados pelo gate 12 da esteira (§8.1). Para alterar uma decisão, edite esta seção e rode o script — nunca o arquivo gerado.
>
> Os ADRs marcados **`[+]`** foram criados na reanálise v2.0 e estão em status **Proposto**: dependem de decisão do dono do produto antes de virarem contrato.

### ADR-001: Adoção de Node.js em Imagens Google Distroless

- **Status:** Aprovado
- **Decisão:** Utilizar Node.js 22 LTS com TypeScript rodando sobre `gcr.io/distroless/nodejs22-debian12`.
- **Consequências:**
  - Elimina binários vulneráveis e pacotes desnecessários nos contêineres de produção.
  - Obriga que qualquer ferramenta de diagnóstico seja executada via contêineres efêmeros de depuração (*ephemeral debug containers*) no Kubernetes — não há shell para `kubectl exec`.
  - `[+]` Como a depuração ao vivo é inviável, a instrumentação de observabilidade (ADR-008) deixa de ser desejável e passa a ser a **única** via de diagnóstico em produção: um módulo sem trace é um módulo cego.
  - `[+]` Logs vão exclusivamente para `stdout`/`stderr` em JSON estruturado; gravação em arquivo local é proibida (não há como lê-lo depois).
  - `[+]` O build multi-estágio é obrigatório e a imagem final não contém `devDependencies`, código-fonte TypeScript nem arquivos de teste.

### ADR-002: Utilização do Supabase Self-Hosted e Supabase Queues (pgmq)

- **Status:** Aprovado
- **Decisão:** Padronizar banco de dados, autenticação, armazenamento e filas assíncronas na infraestrutura unificada do Supabase, substituindo brokers externos por pgmq.
- **Consequências:**
  - Reduz a complexidade de manutenção de infraestrutura no Kubernetes — uma peça de estado a operar, monitorar e recuperar, em vez de três.
  - Assegura consistência transacional ACID entre atualizações de chamados e enfileiramento de ações de automação: a mutação e a mensagem ocorrem no mesmo `COMMIT`, eliminando a classe inteira de bugs de "gravou no banco mas não publicou o evento".
  - `[+]` `pgmq` entrega semântica **at-least-once**, não *exactly-once* — a idempotência do consumidor é obrigatória e é Regra de Ouro (§10.1), não boa prática.
  - `[+]` Toda fila de produção exige DLQ configurada e alerta ativo sobre sua ocupação (Épico 12.5): mensagem na DLQ é automação de negócio que silenciosamente não aconteceu.
  - `[+]` O banco passa a ser o gargalo compartilhado entre carga transacional, fila e busca vetorial. Teste de carga que exercite os três simultaneamente é pré-requisito de GA (Épico 12.7), e a separação de *pooler*/réplica por tipo de carga deve ser avaliada antes do primeiro cliente de grande porte.

### ADR-003: Multi-Tenancy Obrigatório via PostgreSQL Row Level Security (RLS)

- **Status:** Aprovado
- **Decisão:** Todas as tabelas que armazenam dados de chamados, itens de configuração ou pessoas devem possuir a coluna `tenant_id` e políticas RLS estritas vinculadas ao `auth.uid()` e aos claims do JWT.
- **Consequências:**
  - Segurança em profundidade garantida pelo kernel do banco de dados: um erro de query na aplicação não vaza dados entre locatários.
  - Consultas da aplicação não precisam concatenar filtros de locatário manualmente como mecanismo de segurança.
  - `[+]` Filtro de locatário na aplicação, quando existir, é otimização de performance — **nunca** é o controle de acesso. Código que trate o filtro de aplicação como barreira de segurança está incorreto por definição.
  - `[+]` Toda tabela de negócio nova exige teste de integração que prove que o usuário do locatário A não lê nem escreve dado do locatário B, inclusive manipulando parâmetros de requisição. É gate de CI (§6.4, gate 4 e 5).
  - `[+]` Processos que legitimamente atravessam locatários (correlação AIOps, rotinas de retenção, métricas globais de plataforma) usam *role* de serviço distinta, com escopo mínimo e **todo acesso registrado na trilha de auditoria** (ADR-007) — o `bypass` de RLS é a exceção mais sensível do sistema e precisa ser a mais auditada.
  - `[+]` RLS tem custo de plano de execução. Índices devem incluir `tenant_id` como primeira coluna nos acessos mais frequentes, e a performance das políticas é item explícito da revisão arquitetural de PR.

### ADR-004: Motor de Workflows Declarativo Zero-Code em JSON DSL

- **Status:** Aprovado
- **Decisão:** Fluxos de trabalho são representados como *statecharts* em JSON validados via Zod e interpretados por um motor determinístico em Node.js.
- **Consequências:**
  - Impede injeção de scripts arbitrários pelos usuários, mantém a retrocompatibilidade durante atualizações de versão e preserva a conformidade com as regras do PinkVERIFY.
  - `[+]` A UI do FlowBuilder é a **única** superfície de autoria; o JSON aparece ao usuário apenas como representação somente-leitura. Não existe campo de texto livre que aceite DSL.
  - `[+]` Instâncias em execução permanecem vinculadas à versão do fluxo sob a qual nasceram, até sua conclusão natural. O motor precisa executar N versões simultaneamente — migrar instâncias vivas entre versões é proibido por padrão.
  - `[+]` Publicação exige *dry-run* aprovado (integridade referencial: estado órfão, transição sem destino, condição sobre campo inexistente). Não é passo opcional do fluxo de publicação.
  - `[+]` O motor de workflow **orquestra estado e aprovação**; ele não avalia condições por conta própria — delega ao BRE (ADR-006). A fronteira entre os dois é a diferença entre "o que acontece depois" e "sob qual condição".

### ADR-005: Acessibilidade Universal como Critério de Bloqueio (WCAG 2.2 AA)

- **Status:** Aprovado
- **Decisão:** Nenhum componente de interface é incorporado ao Design System sem validação automatizada e aprovação manual de conformidade com as diretrizes WCAG 2.2 Nível AA.
- **Consequências:**
  - Garante navegabilidade total via teclado, contraste cromático regulamentar e compatibilidade com leitores de tela em todos os módulos do sistema.
  - `[+]` O mecanismo é o gate 7 da §6.4 (Axe-core por história de Storybook). Sem esse mecanismo, o ADR é uma intenção — por isso a História 11.5 é pré-requisito da Fase 0.
  - `[+]` Axe-core **não** detecta as violações mais caras deste produto: cor como único portador de informação, ordem de foco ilógica e rótulo incorreto em contexto. Revisão manual de teclado e leitor de tela é item obrigatório do checklist de PR de UI (História 11.7).
  - `[+]` Atualizações em tempo real (Realtime) são anunciadas em região `aria-live="polite"` e **nunca** movem o foco do analista — requisito específico de uma mesa de atendimento que recebe *push* constante.
  - `[+]` Visualizações gráficas (mapa de dependências da CMDB, gráficos de analytics) exigem alternativa equivalente navegável e valores numéricos explícitos, não apenas a representação visual (Histórias 13.5 e 9.x).

### ADR-006: Business Rules Engine (BRE) Desacoplado do Motor de Workflows

- **Status:** Aprovado
- **Decisão:** Implementar um componente autônomo de avaliação de regras de negócio, totalmente desacoplado da máquina de estados do workflow. As regras são declaradas como estruturas JSON (árvore lógica com operadores `AND`, `OR`, `NOT`, comparações de campos e predicados temporais), avaliadas por um executor funcional puro em TypeScript.
- **Consequências:**
  - Permite que regras de cálculo de prioridade matricial, roteamento de filas, suspensão de SLAs e determinação de aprovadores sejam reutilizadas transversalmente em múltiplos fluxos de atendimento sem inflar a máquina de estados principal.
  - `[+]` Dependência **unidirecional**: o workflow invoca o BRE; o BRE nunca invoca o workflow. Qualquer necessidade inversa indica que a lógica está no componente errado.
  - `[+]` O avaliador é função pura, sem I/O — recebe fatos, devolve decisão. Isso o torna exaustivamente testável e é a razão pela qual sua cobertura de testes exigida é superior ao piso de 85% da DoD.
  - `[+]` Toda avaliação é registrada com os fatos de entrada e o resultado (Épico 7.6): auditoria de **decisão**, não apenas de mutação. Sem isso, é impossível responder "por que este chamado foi roteado para este time em março".
  - `[+]` Precedência, escopo e critério de parada precisam ser explícitos e visíveis ao autor da regra (Épico 7.5) — um motor de regras cuja ordem de avaliação é implícita produz comportamento imprevisível em produção.
  - `[+]` Guia de decisão para o time: se a lógica responde *"sob qual condição"* e é reutilizável, é regra (BRE). Se responde *"o que acontece em seguida"* e é específica de um fluxo, é transição (workflow).

### ADR-007: Trilha de Auditoria Universal Imutável (Append-Only Audit Log)

- **Status:** Aprovado
- **Decisão:** Toda mutação (`INSERT`, `UPDATE`, `DELETE`) em entidades governadas (Incidentes, Problemas, Mudanças, Itens de CMDB, Ativos, Usuários e Regras) dispara automaticamente o registro síncrono em esquema dedicado (`audit.logs`). Cada registro armazena: UUID, timestamp UTC de alta precisão, identificador do ator (`user_id`), identificador do locatário (`tenant_id`), endereço IP, operação, estado anterior (*pre-image*) e novo estado (*post-image*) em JSONB, além do identificador de rastreamento (`trace_id`).
- **Consequências:**
  - As tabelas de auditoria possuem políticas de banco que revogam sumariamente permissões de `UPDATE` e `DELETE` para qualquer usuário da aplicação, assegurando imutabilidade jurídica e conformidade para auditorias ISO 27001 e PinkVERIFY.
  - `[+]` A captura é feita por *trigger* de banco, não por código de aplicação — auditoria que depende de o desenvolvedor lembrar de chamá-la falha exatamente no caminho excepcional que mais importa auditar.
  - `[+]` A dupla trilha de delegação (Épico 2.2) e a confirmação digitada de ações irreversíveis são **casos de uso** desta tabela única, não mecanismos paralelos.
  - `[+]` `audit.logs` é particionada por mês: o expurgo por retenção ocorre por `DROP PARTITION`, nunca por `DELETE` massivo (que seria, ele próprio, uma operação proibida na tabela).
  - `[+]` Registrar *pre-image* e *post-image* completos significa que **dados pessoais são copiados para dentro da trilha imutável**. Isso cria conflito direto com o direito de eliminação da LGPD e é resolvido no ADR-013 — ADR-007 e ADR-013 devem ser lidos em conjunto, jamais isoladamente.
  - `[+]` O volume de escrita dobra em tabelas de alta rotatividade. O impacto em latência de escrita precisa ser medido no teste de carga (Épico 12.7) antes do GA.

### ADR-008: Observabilidade Unificada (OpenTelemetry), Hardening e Resiliência (DR)

- **Status:** Aprovado
- **Decisão:** A plataforma nasce 100% instrumentada via OpenTelemetry SDK, propagando o cabeçalho padronizado W3C Trace Context (`traceparent`) através de todas as camadas. Em nível de infraestrutura, os Pods executam sob o perfil Kubernetes *Restricted*, com `drop: ["ALL"]` em *capabilities* do Linux. A arquitetura de recuperação de desastres adota arquivamento contínuo de WALs em bucket seguro, com testes automatizados periódicos de restauração (RPO < 5 min, RTO < 30 min).
- **Consequências:**
  - Visibilidade transacional ponta a ponta e auditoria operacional em tempo real. Elimina brechas de isolamento de contêineres e garante continuidade de negócio em conformidade com critérios governamentais de *procurement*.
  - `[+]` O `traceparent` precisa atravessar a fronteira da fila: é propagado como atributo da mensagem `pgmq` e restaurado pelo worker. Sem isso, o rastro morre no `COMMIT` e a automação assíncrona — justamente a parte mais difícil de depurar — fica invisível.
  - `[+]` `trace_id` é gravado na trilha de auditoria (ADR-007), unindo a pergunta técnica ("o que o sistema fez") à pergunta de negócio ("quem mudou o quê") em uma única linha de investigação.
  - `[+]` Métricas obrigatórias de worker (profundidade de fila, idade da mensagem mais antiga, ocupação de DLQ) servem simultaneamente ao painel operacional e ao autoscaling por KEDA — uma fonte, dois consumidores.
  - `[+]` RPO e RTO declarados sem exercício periódico de restauração cronometrada são hipóteses. O GameDay da História 12.7 é o que converte a declaração em garantia, e sua ausência deve ser tratada como risco aberto, não como pendência menor.
  - `[+]` `readOnlyRootFilesystem` e perfil *Restricted* exigem que todo diretório de escrita temporária seja volume montado explicitamente — restrição que precisa ser respeitada por qualquer biblioteca de terceiros (geração de PDF, processamento de imagem) adotada no futuro.

### ADR-009: Governança Contract-First via Schemas Zod Gerando OpenAPI 3.1

- **Status:** Aprovado
- **Decisão:** Elimina-se a escrita manual de documentação OpenAPI. O contrato de interface é definido estritamente através de schemas TypeScript com Zod em `/src/shared`. A documentação OpenAPI 3.1 e as definições TypeScript dos clientes de frontend são geradas automaticamente no build através de `@fastify/swagger` integrado ao `@fastify/type-provider-zod`.
- **Consequências:**
  - Elimina integralmente o risco de desvio (*drift*) entre a especificação da API e a implementação real em produção. A validação de *payloads* na entrada da rota é garantida em tempo de execução pelos mesmos schemas que geram a documentação.
  - `[+]` O `openapi.json` gerado é versionado no repositório justamente para que a mudança de contrato apareça como *diff* no PR — é o sinal que dispara a discussão sobre compatibilidade. O gate 6 da §6.4 falha se o arquivo versionado divergir do gerado.
  - `[+]` Mudança incompatível de contrato exige versionamento de rota (`/v2/...`) e período de convivência declarado. Como a API é consumida por integrações de clientes (Épico 15.1), quebrar contrato silenciosamente quebra sistemas de terceiros.
  - `[+]` Rotas internas/administrativas são marcadas explicitamente e excluídas da especificação pública distribuída a parceiros — a geração automática publicaria tudo por padrão.
  - `[+]` O cliente TypeScript do frontend é gerado a partir do mesmo contrato; escrever chamada `fetch` manual para rota já contratada é desvio de padrão detectável em revisão.

### ADR-010: Arquitetura Unificada de Notificações Multicanal e Webhooks Assinados

- **Status:** Aprovado
- **Decisão:** Toda emissão de evento que requeira comunicação externa ou interna é direcionada para a fila dedicada `pgmq_notifications`. Um worker consome as mensagens e despacha para os provedores correspondentes: Microsoft Graph API para e-mails corporativos, canal WebSocket para a Central in-app e motor de Webhooks externos. Os webhooks de saída contam obrigatoriamente com assinatura criptográfica no cabeçalho `X-Signature-SHA256`, gerada a partir de chave secreta compartilhada do locatário.
- **Consequências:**
  - Desacopla o tempo de resposta das transações de usuário do tempo de entrega de mensagens de terceiros. Garante rastreabilidade, retentativas automáticas e integridade contra adulteração em integrações corporativas.
  - `[+]` Nenhum módulo de negócio invoca provedor de e-mail diretamente: todos publicam na fila com um `event_type` padronizado. Isso preserva a consistência transacional do ADR-002 e mantém a idempotência centralizada em um único consumidor.
  - `[+]` Falha de canal externo (provedor de e-mail indisponível) nunca bloqueia a notificação in-app nem o evento de negócio original. A Central in-app é a fonte de verdade de "lido/não lido"; os demais canais são cópias de melhor esforço.
  - `[+]` A chave HMAC é por locatário e precisa de rotação suportada sem janela de indisponibilidade (período de aceitação de duas chaves) — ver Épico 12.6.
  - `[+]` Sem controle de volume, o valor da notificação colapsa. Preferência por evento, *digest* e janela de silêncio (Épico 10.4) são parte do contrato de qualidade desta decisão, não melhoria futura.
  - `[+]` A dependência do Microsoft Graph pressupõe cliente com tenant Microsoft 365. O adaptador SMTP genérico deve permanecer suportado como alternativa de primeira classe, sob o mesmo contrato de adaptador.

### ADR-011: Design Tokens Centralizados (tokens.json) como Fonte Única de UI

- **Status:** Aprovado
- **Decisão:** Todas as propriedades visuais da interface (cores, tipografia, espaçamentos, elevações, bordas e estados interativos) são mantidas exclusivamente em `/design-system/tokens.json`. Utiliza-se Style Dictionary em pipeline automatizado para compilar o JSON em classes utilitárias estendidas do Tailwind CSS e variáveis CSS nativas (`:root`).
- **Consequências:**
  - Impede o desvio estético (*design drift*) entre protótipos de interface e o código em produção. Garante que os rácios de contraste exigidos pelo WCAG 2.2 AA sejam testados e validados na fonte antes da geração do CSS.
  - `[+]` O arquivo adota o formato **DTCG** (*Design Tokens Community Group*, com `$value`/`$type`), suportado nativamente pelo Style Dictionary v4 — sem isso o pipeline mandatado por este ADR não teria entrada válida.
  - `[+]` A validação de contraste roda sobre **ambos** os temas (claro e escuro) como teste automatizado na esteira (Épico 11.4), não como conferência visual.
  - `[+]` Componente que use valor estético literal (`#723CEB`, `24px`) em vez de token é reprovado pelo gate 10 da §6.4.
  - `[+]` Alteração de design entra primeiro em `/design-system/tokens.json`; propagar direto para o Tailwind ou para o componente é o caminho por onde o *drift* retorna.
  - `[+]` **Risco material (R1, § 12.1):** os tokens declaram as famílias comerciais **Gilroy** e **Lufga**, mas o protótipo recebido **não as carrega** — o único `<link>` de fonte traz `Outfit` e `JetBrains Mono`, e não há `@font-face` algum. As duas comerciais só renderizam em máquina que já as tenha instalada, o que torna provável que a identidade aprovada já seja a Outfit. Enquanto o R1 não se encerra, os tokens mantêm as comerciais como primeiro nome da pilha e a Outfit como *fallback* efetivo — situação que precisa ser resolvida, e não normalizada, porque a fonte que renderiza hoje depende da máquina de quem olha.

### `[+]` ADR-012: Modelo de Tenancy em Dois Níveis — Locatário e Espaço de Serviço

- **Status:** Proposto
- **Contexto:** O documento cita "partições departamentais" e "espaços de serviço" (TI, RH, Finanças, Instalações) em oito pontos distintos, e o design system dedica cor, etiqueta e seletor a eles. Mas o ADR-003 define apenas `tenant_id`. Sem um modelo formal do segundo nível, cada módulo inventará o seu — e o isolamento entre RH e TI, que é o requisito de confidencialidade mais sensível do produto, ficará dependente de convenção.
- **Decisão:** Adotar hierarquia explícita de dois níveis:
  - **`tenant_id`** — fronteira dura entre clientes/organizações. Nenhum acesso a atravessa, jamais, exceto por *role* de serviço auditada.
  - **`workspace_id`** — espaço de serviço (partição departamental) dentro do locatário. Fronteira **configurável**: visibilidade padrão restrita ao próprio espaço, com compartilhamento apenas por concessão explícita e auditada.
  - Os dois participam das políticas RLS; ambos vêm de claims do JWT; usuário pode pertencer a múltiplos espaços com papéis distintos em cada.
  - Registros podem ser marcados como *confidenciais do espaço* (ex.: chamado de RH sobre processo disciplinar), caso em que nem mesmo papéis administrativos de outros espaços os leem.
- **Consequências:**
  - O erro de acesso passa a ser explicável ao usuário ("este chamado pertence ao espaço Recursos Humanos"), como já previsto na tela de estado "Acesso não autorizado" do design system — um 403 genérico seria regressão de experiência e de confiança.
  - Catálogo, fluxos, taxonomia, SLAs e grupos são particionáveis por espaço (Épico 19.4).
  - Relatórios e o assistente cognitivo herdam automaticamente a mesma fronteira (Épicos 9.6 e 5.5).
  - Aumenta a complexidade das políticas RLS e dos índices; exige teste de vazamento em **dois** eixos (entre locatários e entre espaços), não apenas um.

### `[+]` ADR-013: Retenção, LGPD e a Resolução do Conflito com a Auditoria Imutável

- **Status:** Proposto — **exige validação jurídica antes de implementação**
- **Contexto:** Existe um conflito direto e não endereçado entre dois requisitos já aprovados. O ADR-007 determina trilha de auditoria imutável com *pre-image* e *post-image* completos — o que copia dados pessoais para dentro de uma estrutura onde `UPDATE` e `DELETE` são revogados. A LGPD assegura ao titular o direito de eliminação e exige limitação de finalidade e de prazo. O produto processa dados de RH e Finanças por definição de escopo. Ignorar o conflito significa descobri-lo em auditoria ou em pedido de titular.
- **Decisão:**
  1. **Classificar todo campo** como: dado operacional, dado pessoal ou dado pessoal sensível — a classificação é metadado do schema, não documentação à parte.
  2. **Criptografia por titular (*crypto-shredding*)**: dados pessoais gravados na trilha de auditoria e em tabelas históricas são cifrados com chave derivada por titular. O atendimento ao direito de eliminação ocorre pela **destruição da chave**, que torna o conteúdo permanentemente ilegível sem violar a imutabilidade nem quebrar a cadeia de integridade do log.
  3. **Retenção declarada por tipo de registro**, executada por expurgo de partição (§5.1), com prazo definido por finalidade e base legal.
  4. **Minimização na origem**: a trilha registra a *pre/post-image* dos campos governados, não o documento inteiro, quando o campo não for necessário à finalidade de auditoria.
  5. **Registro de tratamento**: finalidade, base legal e prazo por categoria de dado, mantidos como documento vivo e revisáveis.
- **Consequências:**
  - Preserva simultaneamente a imutabilidade exigida por ISO 27001/PinkVERIFY e o direito de eliminação exigido pela LGPD — sem escolher um em detrimento do outro.
  - A gestão de chaves por titular torna-se infraestrutura crítica: perda acidental de chave equivale a perda de dado; vazamento equivale a vazamento de histórico. Depende do Épico 12.6.
  - Consultas analíticas sobre dados cifrados exigem pseudonimização ou agregação prévia — impacto a considerar no Épico 9.
  - **Nenhum agente de IA decide classificação, base legal ou prazo de retenção** (§7.1). Esta decisão é humana e jurídica.

### `[+]` ADR-014: Armazenamento de Anexos com Isolamento, Varredura e URLs Efêmeras

- **Status:** Proposto
- **Contexto:** A mesa de atendimento prevê explicitamente arrastar anexos e capturas de tela; artigos de KB, evidências de teste (Épico 14.3), comprovantes de reembolso (Épico 19.2) e certificados de descarte (Épico 8.5) também dependem de arquivos. Nenhuma linha do documento v1.1 trata de armazenamento de binários — nem do risco que ele carrega, que é o vetor de ataque mais comum em service desks: o anexo malicioso que o analista abre.
- **Decisão:** Usar Supabase Storage com as seguintes restrições inegociáveis:
  - Bucket privado por padrão, com políticas RLS espelhando o modelo do ADR-012 (locatário e espaço de serviço) — nunca bucket público com URL "secreta".
  - Acesso exclusivamente por **URL assinada de vida curta**, gerada por requisição autorizada.
  - **Varredura antivírus assíncrona obrigatória** antes de o arquivo ficar disponível para download; enquanto pendente, o anexo aparece como "em verificação".
  - Tipo e tamanho de arquivo em lista de permissão explícita; conteúdo validado por assinatura de arquivo (*magic bytes*), não por extensão.
  - Download servido com `Content-Disposition: attachment` e cabeçalhos que impeçam renderização no contexto da aplicação (proteção contra HTML/SVG maliciosos).
- **Consequências:**
  - O anexo deixa de ser vetor trivial de *XSS* ou de distribuição de malware entre colaboradores.
  - Exige fila e worker de varredura (candidato natural: `pgmq_attachment_scan`), com estado do anexo visível na interface.
  - Retenção e eliminação de anexos seguem o ADR-013 — inclusive anexos são dado pessoal com frequência (foto, documento, comprovante).
  - Custos de armazenamento e política de expurgo passam a ser dimensionáveis desde a Fase 0, não descobertos em produção.

### `[+]` ADR-015: Numeração Legível de Registros por Locatário

- **Status:** Proposto
- **Contexto:** Os identificadores `INC-48192`, `REQ-11204`, `CHG-0442`, `PRB-0087`, `CI-SRV-0231` e `KB-2201` aparecem em toda a interface e são o vocabulário pelo qual as pessoas se referem aos registros ("o INC-48192 está violado"). Nunca foram especificados. Numeração sequencial ingênua em sistema multilocatário e concorrente produz três defeitos previsíveis: colisão, vazamento de volume de negócio entre clientes e contenção de escrita.
- **Decisão:**
  - Chave primária técnica é UUID v7; o identificador legível é **coluna separada**, gerada por sequência **por locatário e por tipo de registro**.
  - A geração usa sequência dedicada no banco (não `MAX(n)+1`, que é *race condition* sob concorrência).
  - Lacunas na numeração são aceitáveis e esperadas (transação revertida consome número) — a numeração é identificador, não contador contábil.
  - Prefixo por tipo é configurável por locatário; o formato é imutável após o primeiro registro emitido.
- **Consequências:**
  - Um cliente não infere o volume de chamados de outro pelo número recebido.
  - Elimina contenção global de escrita entre locatários.
  - O identificador legível é o que aparece em e-mail, webhook e integração — mudar seu formato depois quebra correlação de e-mail de entrada (Épico 10.6) e integrações de cliente.

### `[+]` ADR-016: Tempo, Fuso Horário e Calendários de Negócio

- **Status:** Proposto
- **Contexto:** A pausa de SLA em "Aguardando solicitante" (Épico 6.1), o horário útil por espaço e região (Épico 16.2), a janela de silêncio de notificações (Épico 10.4), a janela de mudança (Épico 6.3) e o cálculo de *aging* (Épico 9.2) dependem todos de uma semântica de tempo que nunca foi definida. Em um produto com operação em múltiplas unidades e fusos, isso é fonte garantida de divergência entre o que o sistema calcula e o que o cliente cobra em reunião de nível de serviço.
- **Decisão:**
  - Persistência sempre em `timestamptz` UTC. Conversão para fuso local **apenas** na apresentação.
  - Calendário de negócio é entidade de primeira classe: jornada por dia da semana, feriados nacionais/regionais e exceções, associado a espaço de serviço e/ou localidade.
  - O relógio de SLA corre apenas dentro do calendário aplicável; pausas são registradas como intervalos explícitos e auditáveis, não como subtração no total.
  - O prazo é **recalculado de forma determinística** a partir da trilha de eventos quando prioridade, calendário ou acordo mudam — nunca ajustado por delta acumulado, que torna impossível reconstruir a memória de cálculo.
  - Toda apuração de cumprimento expõe a memória de cálculo: qual calendário, quais intervalos correram, quais pausaram e por quê (Épico 16.3).
- **Consequências:**
  - O cumprimento de SLA passa a ser **auditável e contestável com evidência**, que é exatamente o que se espera em uma discussão contratual.
  - Exige biblioteca de tempo com suporte a fuso e horário de verão histórico; aritmética ingênua de datas é proibida.
  - Mudança retroativa de calendário afeta prazos em curso — precisa de política explícita (aplicar a partir de agora × recalcular tudo), definida com o dono do produto.

### `[+]` ADR-017: Isolamento Multilocatário do RAG e Tratamento de Dados Pessoais pelo Assistente

- **Status:** Proposto — **depende da escolha de provedor de modelo (§12)**
- **Contexto:** O Épico 5.2 promete "isolamento multilocatário" do assistente RAG e a interface declara ao usuário que "as respostas são restritas ao seu espaço de serviço e ao seu nível de acesso". Essa é uma promessa de segurança feita na tela — e não há nenhuma decisão registrada sobre como cumpri-la. Um RAG mal isolado é um canal de vazamento que contorna silenciosamente toda a arquitetura de RLS construída no ADR-003 e no ADR-012.
- **Decisão:**
  - **A recuperação é filtrada na origem**: a busca vetorial executa sob as mesmas políticas RLS da aplicação, no contexto do usuário solicitante. O modelo nunca recebe documento que o usuário não poderia abrir — filtrar depois da recuperação, ou confiar no *prompt* para restringir o escopo, é inaceitável.
  - **Índices vetoriais carregam `tenant_id` e `workspace_id`** como colunas participantes da política, não apenas como metadado de filtro opcional.
  - **Redação de dados pessoais** antes do envio ao modelo, conforme a classificação do ADR-013, quando o provedor for externo à infraestrutura do cliente.
  - **Nenhum dado de locatário é usado para treinamento ou ajuste fino**; a contratação com o provedor precisa vedar retenção e treinamento de forma explícita.
  - **Toda interação é auditada** (*prompt*, documentos recuperados, resposta, ator, locatário) — Épico 5.6.
  - **Citação obrigatória de fontes** na resposta, permitindo ao usuário verificar a procedência (Épico 5.5).
  - O assistente **propõe, nunca executa** ação de mudança de estado sem confirmação humana explícita (Épico 5.4).
- **Consequências:**
  - O isolamento passa a ser garantido pelo mesmo mecanismo que já protege o resto do sistema, em vez de por uma segunda implementação paralela e mais frágil.
  - A escolha do provedor de modelo e de *embeddings* torna-se decisão de arquitetura com implicação contratual e de residência de dados — não escolha de biblioteca.
  - Respostas podem ser legitimamente diferentes para usuários diferentes sobre a mesma pergunta. Isso é correto e precisa ser comunicado, para não ser reportado como defeito.
  - Custo por interação e limite de uso por locatário precisam ser dimensionados antes da abertura geral do recurso.

### `[+]` ADR-018: Estratégia de Testes e Ambientes Efêmeros

- **Status:** Proposto
- **Contexto:** A DoD exige cobertura acima de 85%, testes de integração contra banco efêmero e validação de vazamento entre partições. Nenhuma decisão registra **como** — e sem definição, "teste de integração" vira mocking do banco, que não exercita justamente aquilo em que este produto deposita sua segurança: as políticas RLS.
- **Decisão:**
  - **Unitário (Vitest)**: lógica pura — motor de regras, motor de workflow, cálculo de SLA, transformações. Sem banco, sem rede.
  - **Integração (Testcontainers com Postgres + extensões reais)**: repositórios, migrações, políticas RLS e filas `pgmq` contra instância real e efêmera, criada e destruída por execução. Banco simulado é proibido nesta camada.
  - **Teste de vazamento obrigatório**: para cada tabela de negócio, um teste que autentica como usuário do locatário A / espaço X e prova impossibilidade de leitura e de escrita em dado do locatário B / espaço Y, inclusive manipulando parâmetros de requisição. É gate de CI.
  - **Contrato**: o `openapi.json` gerado é comparado ao versionado (gate 6).
  - **E2E (Playwright)**: jornadas críticas — abrir e resolver chamado, submeter item de catálogo, publicar fluxo — **cada uma com uma variante executada integralmente por teclado**.
  - **Acessibilidade (Axe-core via Storybook)**: por componente, bloqueante.
  - **Carga e caos**: pré-requisito de GA, não rotina de PR (Épico 12.7).
  - A cobertura de 85% é **piso**, não meta: o BRE e o motor de workflow exigem cobertura substancialmente superior por serem infraestrutura de decisão.
- **Consequências:**
  - O teste que mais importa neste produto — o de isolamento — passa a ser estrutural e automático, não dependente de disciplina do revisor.
  - A suíte de integração é mais lenta que uma suíte com *mocks*; é um custo aceito conscientemente em troca de exercitar RLS e `pgmq` de verdade.
  - Exige infraestrutura de CI capaz de subir contêineres (Docker-in-Docker ou serviço equivalente).

### `[+]` ADR-019: Internacionalização e Localização

- **Status:** Proposto
- **Contexto:** O design system declara o produto em **português (BR)** e toda a interface prototipada está em pt-BR. Isso é adequado ao mercado-alvo, mas duas classes de texto diferentes convivem no produto — texto de interface (rótulos, mensagens de erro) e conteúdo criado pelo usuário (artigo de KB, nome de item de catálogo, template de notificação). Tratar as duas igual, ou tratar o assunto depois, custa uma refatoração transversal em cada tela já construída.
- **Decisão:**
  - **Texto de interface** vive em catálogo de mensagens desde a Fase 0, nunca embutido em componente — mesmo com um único idioma ativo. O custo agora é uma indireção; depois, uma varredura em toda a base.
  - **Conteúdo do usuário** (catálogo, KB, templates de notificação) é traduzível por registro, com idioma de origem e *fallback* explícito (Épico 10.5).
  - **Formatação de data, número e moeda** é responsabilidade da camada de apresentação, derivada da preferência do usuário — nunca concatenada manualmente.
  - Idioma ativo na v1: **pt-BR**. Estrutura pronta para en-US e es-419 sem refatoração de componente.
- **Consequências:**
  - Mensagens de erro de validação vêm do mesmo schema Zod no cliente e no servidor (ADR-009) — a chave de mensagem precisa ser traduzível em ambos os lados, o que impõe que o schema carregue a chave, não o texto final.
  - Conteúdo multilíngue impacta a busca semântica: *embeddings* são sensíveis ao idioma, exigindo índice por idioma ou modelo multilíngue (decisão acoplada ao ADR-017).
  - Se o produto permanecer monolíngue em definitivo, esta decisão pode ser revogada com custo baixo — o inverso não é verdadeiro, e é essa assimetria que justifica decidir agora.

---

## 10. Contratos de Engenharia, Regras de Ouro e Definição de Pronto (DoD)

### 10.1. Regras de Ouro da Engenharia

Cada regra abaixo tem um mecanismo de verificação associado. **Regra sem mecanismo é intenção, não contrato** — a coluna "gate" aponta o item da §6.4 que a torna mecânica.

| # | Regra | Gate |
|---|---|---|
| 1 | **Imutabilidade Distroless** — nenhuma dependência de SO, shell ou ferramenta externa; gravações locais proibidas exceto em `/tmp` montado | 9, 11 |
| 2 | **RLS Mandatório** — nenhuma tabela corporativa sem `ROW LEVEL SECURITY` explícita e política de isolamento validada | 4, 5 |
| 3 | **Auditoria Universal Automática** — nenhuma tabela de negócio alterada sem captura síncrona em `audit.logs` com *pre-image*, *post-image* e `trace_id` | 4, 12 |
| 4 | **Fonte Única de Contrato de API** — todas as rotas derivam de schemas Zod; edição manual de OpenAPI proibida | 6 |
| 5 | **Fonte Única de UI** — proibido valor estético literal ou classe utilitária arbitrária; todo valor novo passa por `tokens.json` | 10 |
| 6 | **Processamento Idempotente** — todo consumidor `pgmq` trata mensagem duplicada sem corromper estado | 3, 4 |
| 7 | **Zero Scripts Imperativos em Regra de Negócio** — fórmulas, aprovações, roteamentos e SLAs apenas via BRE declarativo; `eval()` e interpretadores dinâmicos proibidos | 1, 2 |
| 8 | **Graceful Shutdown** — todo serviço drena conexões, pausa consumo de fila e fecha o pool dentro de `terminationGracePeriodSeconds: 30` | 11 |
| 9 | **`[+]` Cor Nunca É a Única Informação** — prioridade, SLA e estado sempre acompanhados de rótulo textual | 7 + revisão manual |
| 10 | **`[+]` Nenhum Segredo Versionado** — credencial, chave ou token jamais em código, imagem, ConfigMap ou arquivo de ambiente comitado | 8 |
| 11 | **`[+]` Observabilidade Não É Opcional** — módulo novo sem instrumentação de trace e métrica é módulo cego em produção, dado o ADR-001 | revisão arquitetural |

### 10.2. Definição de Pronto (Definition of Done)

Um item de backlog é considerado pronto apenas quando atende integralmente aos seguintes requisitos:

1. Código implementado em TypeScript estrito com esquemas Zod validados e documentação OpenAPI 3.1 gerada sem discrepâncias.
2. Cobertura de testes unitários superior a 85% e testes de integração executados com sucesso contra instâncias efêmeras de banco de dados.
3. Políticas de RLS versionadas em migrações e auditadas contra vazamento de dados entre partições departamentais.
4. Trilha de auditoria imutável comprovadamente acionada para todas as mutações de dados da funcionalidade.
5. Imagem Distroless gerada com varredura de segurança Trivy indicando zero vulnerabilidades com CVSS ≥ 7.0.
6. Testes de acessibilidade automatizados via Axe-core aprovados sem violações WCAG 2.2 AA.
7. Componentes visuais validados estritamente contra os tokens do `tokens.json`.
8. Documentação do arquivo `CONTEXT.md` atualizada refletindo novos schemas, endpoints ou filas criadas.
9. Pull Request formalmente revisado e aprovado com resolução limpa de conflitos na branch `main`.
10. **`[+]`** Testes de vazamento entre locatários **e entre espaços de serviço** aprovados para toda tabela nova (ADR-012, ADR-018).
11. **`[+]`** Instrumentação de trace e métrica presente, com o `traceparent` atravessando corretamente qualquer fronteira de fila introduzida (ADR-008).
12. **`[+]`** Revisão manual de navegação por teclado e leitor de tela registrada no PR, para toda entrega de interface — Axe-core não cobre ordem de foco nem cor como única informação (ADR-005).
13. **`[+]`** Campos que armazenem dado pessoal classificados conforme o ADR-013, com retenção declarada.

---

## 11. `[+]` Requisitos Não-Funcionais

Todos os valores desta seção são **propostas iniciais** para servirem de linha de base mensurável. Precisam ser validados com o dono do produto e recalibrados com dados reais após o primeiro piloto — um SLO sem medição é ficção, mas a ausência de alvo declarado impede qualquer discussão objetiva sobre performance.

### 11.1. Objetivos de nível de serviço (SLO) da plataforma

| Indicador | Alvo proposto |
|---|---|
| Disponibilidade da API (mensal) | 99,9% |
| Disponibilidade do processamento assíncrono | 99,5% |
| Latência de leitura da fila de chamados | p95 < 300 ms · p99 < 800 ms |
| Latência de escrita (abertura/atualização) | p95 < 800 ms · p99 < 1,5 s |
| Latência da busca semântica de conhecimento | p95 < 900 ms |
| Atraso de processamento de fila (`pgmq`) | p95 < 30 s em condição normal |
| Entrega de notificação in-app | p95 < 5 s após o evento |
| RPO / RTO | < 5 min / < 30 min (ADR-008) |

Alertas são emitidos por **taxa de consumo do orçamento de erro**, não por violação pontual de limiar (Épico 12.5).

### 11.2. Premissas de capacidade (a validar com o cliente-piloto)

| Dimensão | Premissa inicial |
|---|---|
| Colaboradores atendidos por locatário | 50.000 |
| Analistas concorrentes | 500 |
| Chamados abertos por dia | 5.000 |
| Itens de configuração na CMDB | 100.000 |
| Artigos na base de conhecimento | 20.000 |
| Retenção de registros de serviço | 5 anos (a confirmar juridicamente — ADR-013) |
| Retenção de trilha de auditoria | 5 anos (a confirmar juridicamente) |
| Retenção de logs de aplicação / traces / métricas | 90 dias / 15 dias / 13 meses |

### 11.3. Orçamento de performance do frontend

- **LCP < 2,5 s**, **INP < 200 ms**, **CLS < 0,1** em conexão 4G simulada.
- Fila de chamados renderiza 50 linhas sem perda de fluidez de rolagem; listas maiores usam virtualização.
- O painel de conhecimento contextual não bloqueia a interação com a mesa de atendimento enquanto busca.

### 11.4. Matriz de compatibilidade

| Categoria | Suporte |
|---|---|
| Navegadores | Duas últimas versões estáveis de Chrome, Edge, Firefox e Safari |
| Leitores de tela | NVDA + Firefox · JAWS + Chrome · VoiceOver + Safari |
| Resolução mínima de trabalho | 1280×720 (o painel de conhecimento vira gaveta abaixo de 1280) |
| Portal do colaborador | Responsivo até 360 px de largura (Épico 18.5) |

### 11.5. Limites e proteção de API

- Limite por locatário e por usuário, com cabeçalhos padronizados de limite restante e resposta `429` com `Retry-After`.
- Endpoint de ingestão de eventos (Épico 15.1) com limite próprio e mais alto, por ser alimentado por máquina.
- Proteção contra *payload* excessivo, profundidade de objeto e consultas de relatório sem limite de recorte.

---

## 12. `[+]` Riscos e Decisões em Aberto

Itens que **bloqueiam** fases específicas e dependem de decisão externa à engenharia. Mantidos aqui até serem resolvidos, quando migram para um ADR ou para o `CONTEXT.md`.

| # | Questão em aberto | Impacto se não resolvida | Bloqueia | Decisor |
|---|---|---|---|---|
| R1 | **Licenciamento das fontes Gilroy e Lufga** — famílias comerciais declaradas no design system, mas nunca carregadas pelo protótipo. Análise completa em **§ 12.1** | Custo de licença indeterminado (depende de R9) e possibilidade de o produto ir ao ar com tipografia diferente da que foi revisada | Épico 11.6 / Fase 0 | Produto + Jurídico |
| R2 | **Escopo de certificação PinkVERIFY** — esquema-alvo, lista oficial de processos e se é requisito de lançamento | Afirmação de conformidade sem lastro em material comercial e em edital | §3, escopo das Fases 5–6 | Produto |
| R3 | **Política de retenção e base legal LGPD** por categoria de dado | ADR-013 não implementável; risco jurídico direto em dados de RH | Fase 0 (classificação) e Fase 4 | Jurídico + DPO |
| R4 | **Provedor de LLM e de *embeddings***, com vedação contratual de treinamento e definição de residência de dados | ADR-017 indefinido; custo por interação desconhecido | Épicos 3 e 5 / Fase 3 | Produto + Segurança |
| R5 | **Provedor de e-mail** — Microsoft Graph pressupõe cliente com Microsoft 365; SMTP genérico é alternativa | Épico 10.1 sem destino definido; risco de acoplamento a um único ecossistema | Fase 3 | Produto + Infra |
| R6 | **Destino de observabilidade** (coletor OTLP, Prometheus e Grafana próprios ou gerenciados) | ADR-008 sem endereço de exportação; diagnóstico de produção fica cego | Fase 0 | Infra |
| R7 | **Método de depreciação** (fiscal linear × gerencial saldo decrescente) e necessidade de manter as duas visões | Épico 8.2 com regra contábil incorreta — erro que só aparece em fechamento | Fase 5 | Contabilidade |
| R8 | **Telas ausentes no design system**: autoria de schema de formulário, central de notificações, "Meus pedidos", login/SSO, editor de regras do BRE, relatórios | Implementação de UI sem referência aprovada, gerando retrabalho | Épicos 4.4, 7.1, 9.3, 10.2, 17.1, 18.1 | Design |
| R9 | **Modelo de entrega e precificação** — (a) o iFix é SaaS hospedado por nós ou software instalado na infraestrutura do cliente? (b) precificação por analista, por colaborador ou por módulo | (a) bloqueia o R1, define se há redistribuição de artefatos de terceiros e afeta residência de dados; (b) define se módulos ESM são SKUs separados, mudando fronteiras técnicas e modelo de permissão | **(a) Fase 0** · (b) Fase 4 | Produto |
| R10 | **Estratégia de migração de dados** de ferramentas de ITSM existentes no cliente | Sem ela, cada implantação vira projeto artesanal de importação | Pré-GA | Produto + Serviços |
| R11 | **Licença do repositório e política de código aberto/fechado** | Indefinição sobre contribuição externa e uso de dependências com licença viral | Fase 0 | Jurídico |

### 12.1. `[+]` R1 em detalhe — licenciamento tipográfico

#### O achado

O bundle de handoff **não carrega Gilroy nem Lufga**. Os dois arquivos `.dc.html` declaram um único `<link>` para o Google Fonts, trazendo **`Outfit` e `JetBrains Mono`**, e não possuem nenhuma declaração `@font-face`. Gilroy e Lufga aparecem apenas como primeiros nomes da pilha CSS (`font-family:'Gilroy','Lufga','Outfit',system-ui,sans-serif`), o que significa que **só renderizam em máquinas que já as tenham instaladas localmente**.

Consequência prática: se a revisão e a aprovação do design ocorreram no navegador, é provável que **a identidade tipográfica aprovada já seja a Outfit** — a menos que quem revisou tivesse as duas famílias comerciais instaladas. Confirmar isso com quem aprovou é a ação mais barata deste risco e pode encerrá-lo sem custo: se o que todos viram e validaram é Outfit, o R1 deixa de ser risco e vira apenas correção dos tokens.

#### A questão não é permissão, é escopo de licença

Gilroy (Fontfabric) e Lufga (Adam Ladd) são famílias **comerciais** — diferente de Outfit e JetBrains Mono, licenciadas sob SIL Open Font License. Comercial significa "requer a licença adequada", não "não pode ser usada". O que impede uma cotação imediata são quatro dimensões de escopo ainda indefinidas:

1. **Licença desktop ≠ licença webfont.** A desktop cobre o designer produzindo o mockup. Servir o arquivo pela aplicação via `@font-face` exige licença de webfont separada, usualmente cobrada por faixa de *pageviews*.
2. **Volume.** A premissa de capacidade da § 11.2 é de 50.000 colaboradores por locatário — volume que não se enquadra em faixa de entrada de licença metrificada.
3. **Domínios.** Licenças de webfont costumam ser por domínio. Operação multilocatária com subdomínio por cliente, ou white-label, extrapola a licença padrão.
4. **Redistribuição — a dimensão decisiva.** A arquitetura prevê Supabase Self-Hosted em cluster Kubernetes. **Se o produto for entregue para o cliente executar na própria infraestrutura, a imagem de contêiner carrega os arquivos de fonte junto — isso é distribuição a terceiros**, vedada pela quase totalidade das licenças de webfont padrão. O caso exige licença OEM/*embedding*, de ordem de grandeza superior.

Por isso o R1 **depende do R9(a)**: enquanto não se decidir se o iFix é SaaS hospedado por nós ou software instalado no cliente, não há como cotar — são licenças de naturezas diferentes.

#### Alternativas

| Caminho | Implicação |
|---|---|
| **Licenciar Gilroy e Lufga** | Resolver R9(a) primeiro; cotar com a Fontfabric e com o distribuidor oficial de Lufga exigindo cobertura explícita de webfont, self-hosting e redistribuição (se on-premises). A Fontfabric disponibiliza um par gratuito de Gilroy (Light e ExtraBold), que **não** cobre os pesos Regular, Medium e Bold exigidos pelo design system |
| **Manter Outfit** | SIL OFL: gratuita, self-hostable, redistribuível, sem métrica de uso. Custo e risco jurídico nulos — e provavelmente é o que já foi aprovado |
| **Substituir por outra OFL** | Se houver objeção específica à Outfit: Manrope, Plus Jakarta Sans ou Figtree têm caráter geométrico próximo com amplitude de pesos mais completa |

#### Critérios de avaliação tipográfica (para o design decidir)

Independentemente do caminho, a escolha deve ser avaliada contra o uso real desta interface, e não apenas contra a identidade de marca:

- **Altura-x e desambiguação** de `I` / `l` / `1` e `0` / `O` em legendas de 13 px — o produto é denso em identificadores (`INC-48192`, `CI-SRV-0231`) e opera sob WCAG 2.2 AA como critério de bloqueio (ADR-005).
- **Numerais tabulares**, para alinhamento de tempos de SLA e contagens em coluna na fila de chamados.
- **Amplitude de pesos** cobrindo Light/Regular/Medium/Bold, exigida pela escala tipográfica dos tokens.
- Geométricas de *display* como Gilroy são projetadas para títulos; o design system já reconhece isso ao reservá-la para "títulos e números" e atribuir a interface à Lufga. Vale verificar se a família de corpo escolhida se sustenta em 13–15 px.

---

## 13. Glossário

| Termo | Definição no contexto do iFix |
|---|---|
| **Locatário (*tenant*)** | Organização cliente. Fronteira dura de dados; nada a atravessa (ADR-012) |
| **Espaço de serviço (*workspace*)** | Partição departamental dentro do locatário: TI, RH, Finanças, Instalações (ADR-012) |
| **CI (*Configuration Item*)** | Item de configuração rastreado na CMDB, com relacionamentos tipados |
| **Raio de impacto (*blast radius*)** | Conjunto de serviços, CIs, usuários e processos afetados pela indisponibilidade de um CI |
| **Storm Alert** | Detecção de incidente massivo por correlação temporal e geográfica de chamados |
| **BRE** | *Business Rules Engine* — motor declarativo de regras, desacoplado do workflow (ADR-006) |
| **DSL de workflow** | Representação em JSON dos *statecharts* de fluxo, validada por Zod (ADR-004) |
| **KEDB** | *Known Error Database* — base de erros conhecidos com soluções de contorno |
| **CAB / ECAB** | Comitê de Mudanças / Comitê de Mudanças Emergenciais |
| **PIR** | *Post-Implementation Review* — revisão obrigatória após mudança normal |
| **SLA / OLA / UC** | Acordo com o cliente / acordo entre times internos / contrato com fornecedor |
| **Pacote de configuração** | Unidade versionada de promoção de configuração entre ambientes (Épico 1) |
| **DLQ** | *Dead Letter Queue* — destino de mensagem que falhou repetidamente; sua ocupação é sempre um alerta |
| **Crypto-shredding** | Eliminação de dado pessoal pela destruição da chave de cifra, preservando a imutabilidade do log (ADR-013) |
| **DTCG** | *Design Tokens Community Group* — formato padrão de tokens consumido pelo Style Dictionary (ADR-011) |
| **Golden signals** | Latência, tráfego, taxa de erro e saturação — conjunto mínimo de métricas de serviço |

---

## 14. Histórico de versões

| Versão | Data | Alterações |
|---|---|---|
| 1.0 | 2026-09-22 | Documento original: visão, stack, Épicos 1–5, esteira, ADRs 001–005, Regras de Ouro e DoD |
| 1.1 | 2026-09-22 | Expansão para Épicos 6–12 e ADRs 006–011 (BRE, auditoria, observabilidade/hardening/DR, contract-first, notificações, design tokens) |
| **2.0** | **2026-09-22** | **Reanálise e consolidação.** Matriz de rastreabilidade dos 26 processos ITIL 2011 (§3) expondo processos declarados sem backlog; Épicos 13–21 criados para cobri-los, com destaque para CMDB e SSO, que haviam ficado órfãos; histórias `[+]` acrescentadas aos Épicos 1–12; ADRs 012–019 para decisões implícitas sem registro (tenancy em dois níveis, LGPD × auditoria imutável, anexos, numeração de registros, tempo e calendários, isolamento do RAG, testes, i18n); §5 arquitetura de dados; §6.4 gates de CI; §11 requisitos não-funcionais; §12 riscos e decisões em aberto; §13 glossário |
