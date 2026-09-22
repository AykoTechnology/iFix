# Especificação Técnica e Plano Diretor: Plataforma Cloud-Native ESM/ITSM

> Documento de origem fornecido pelo autor do produto em 2026-09-22, preservado na íntegra como fonte de verdade histórica. Decisões que o expandem ou refinam vivem em `docs/ADR/` (ADRs 006–011) e `docs/BACKLOG.md` (Épicos 6–12) — este arquivo não é editado retroativamente para incorporá-las.

Este documento estabelece a arquitetura de referência, as regras operacionais, os contratos de engenharia e o modelo de governança para o desenvolvimento do zero de uma plataforma nativa em nuvem de Gestão de Serviços Empresariais (ESM) e ITSM. A solução nasce sem acoplamentos legados, preparada para execução em clusters Kubernetes, utilizando Node.js em imagens Distroless e a infraestrutura integrada do Supabase Self-Hosted.

## 1. Visão Geral e Princípios Arquiteturais

A plataforma foi concebida sobre o paradigma de entrega ágil, resiliente e auditável, absorvendo os mais altos requisitos funcionais do mercado:

- **Governança de Processos ITIL**: Aderência estrita e suporte out-of-the-box aos 25 processos auditáveis de ITSM (equivalente ao padrão PinkVERIFY).
- **CMDB Federada com Análise de Risco**: Consolidação de itens de configuração (CIs) com modelagem preditiva de impacto e cálculo automatizado de raio de explosão sistêmica (blast radius).
- **Acessibilidade Universal Obrigatória**: Conformidade regulatória com as diretrizes WCAG 2.2 Nível AA em todas as interfaces de usuário.
- **Isolamento Multilocatário Seguro (ESM)**: Particionamento lógico de serviços corporativos (TI, Recursos Humanos, Finanças, Instalações Físicas) com segregação de dados.
- **Motor de Fluxo Declarativo (Zero-Code)**: Orquestração visual de regras de aprovação e transições de estado sem inserção de scripts imperativos em tempo de execução.

## 2. Topologia de Infraestrutura e Stack Tecnológica

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
| Camada de Apresentação | React 19, Tailwind CSS e Web Components acessíveis | Frontend unificado para analistas e autoatendimento sob os critérios WCAG 2.2 AA |

## 3. Backlog Estratégico do Produto (original)

> Expandido em `docs/BACKLOG.md`. Texto original preservado abaixo.

### Épico 1: Governança e Portabilidade de Configuração (Config Portability)
- História 1.1: Desenvolver motor de serialização em schema JSON declarativo para exportação e importação de formulários, fluxos de trabalho e catálogos.
- História 1.2: Implementar validação sintática (dry-run) em pipeline para checar integridade referencial antes da aplicação de pacotes em produção.
- História 1.3: Gerar relatórios visuais diferenciais (diff) comparando as configurações ativas entre ambientes de Homologação e Produção.

### Épico 2: Delegação Dinâmica de Papéis e Alçadas (Portal Delegation)
- História 2.1: Disponibilizar interface de autoatendimento para agendamento de ausências temporárias com indicação de delegado e alçadas transferidas.
- História 2.2: Implementar roteamento automático de aprovações com registro de auditoria dupla (titular da alçada e responsável pela aprovação).
- História 2.3: Configurar rotina temporal via pg_cron para expiração e revogação imediata dos acessos delegados ao término do período.

### Épico 3: Base de Conhecimento Contextual Integrada
- História 3.1: Criar painel lateral persistente na tela de atendimento com busca semântica em tempo real via embeddings no pgvector.
- História 3.2: Exibir recomendações algorítmicas de artigos de contorno baseadas no texto e metadados do chamado em análise.
- História 3.3: Permitir a anexação direta da solução recomendada na resposta de comunicação ao solicitante com métricas de reuso do artigo.

### Épico 4: Catálogo em Cartões Dinâmicos e Filtragem Multinível
- História 4.1: Desenvolver catálogo de serviços modular estruturado em cartões dinâmicos com exibição de SLAs e custos operacionais estimados.
- História 4.2: Aplicar filtragem contextual de serviços e formulários orientada pelas informações corporativas contidas no token de identidade do usuário.
- História 4.3: Construir renderizador dinâmico de formulários baseado em schemas JSON com validação instantânea no cliente e no servidor.

### Épico 5: Inteligência AIOps & Assistente Cognitivo Corporativo
- História 5.1: Desenvolver worker assíncrono conectado ao pgmq para correlação temporal e geográfica de incidentes, emitindo alertas de incidentes massivos (Storm Alert).
- História 5.2: Implementar assistente virtual conversacional estruturado em arquitetura RAG (Retrieval-Augmented Generation) com isolamento multilocatário.
- História 5.3: Automatizar a criação de relatórios de impacto de mudanças para apoiar deliberações em Conselhos de Mudanças (CAB).

## 4. Esteira de Engenharia, CI/CD e Prontidão Kubernetes

### 4.1. Estrutura do Monorepo no GitHub
- `/.github/workflows`: Definições de pipelines automatizados do GitHub Actions.
- `/charts`: Helm Charts estruturados para Kubernetes (API, Workers e infraestrutura do Supabase).
- `/docs`: Repositório de governança viva contendo `CONTEXT.md`, `/ADR/` e `/PLAYBOOKS/`.
- `/src/api`: Serviço HTTP Fastify em TypeScript com imagens Distroless.
- `/src/workers`: Consumidores assíncronos das filas pgmq.
- `/src/web`: Aplicação frontend acessível em React 19.
- `/src/shared`: Tipagens TypeScript compartilhadas e schemas de validação Zod.
- `/supabase/migrations`: Arquivos SQL versionados de migração estrutural e políticas RLS.
- `/Dockerfile`: Instrução de empacotamento multi-estágio para Google Distroless.

### 4.2. Estratégia de Empacotamento Distroless
O contêiner de produção é construído em múltiplos estágios:
- **Estágio de Build**: Baseado em `node:22-alpine`. Compila o TypeScript, roda a validação estática de tipos e gera as dependências puras de produção via `npm ci --omit=dev`.
- **Estágio Final de Execução**: Baseado em `gcr.io/distroless/nodejs22-debian12`. Apenas os artefatos compilados e os módulos essenciais são incorporados.
- **Segurança de Execução**: O processo roda obrigatoriamente sob o usuário `USER nonroot:nonroot`, com sistema de arquivos montado como somente leitura (`readOnlyRootFilesystem: true`) e proibição expressa de elevação de privilégios (`allowPrivilegeEscalation: false`).

### 4.3. Requisitos Operacionais em Kubernetes
- **Sinais do Sistema Operacional**: O processo Node.js atua diretamente como PID 1 na imagem Distroless, gerenciando obrigatoriamente os sinais `SIGTERM` e `SIGINT` para drenar conexões ativas, pausar o consumo de filas pgmq e fechar o pool de banco antes do encerramento.
- **Probes de Saúde do Pod**:
  - `startupProbe`: Valida a carga inicial de esquemas e o teste de conexão com o banco de dados.
  - `livenessProbe`: Verifica o tempo de resposta do loop de eventos (event loop) do Node.js.
  - `readinessProbe`: Checa a conectividade com o pooler do Supabase e a latência de acesso às filas.
- **Dimensionamento Automático (Autoscaling)**: Escalonamento horizontal de Pods (HPA) baseado em CPU/memória para as APIs e orientado ao comprimento das filas do pgmq para os workers assíncronos via KEDA.

## 5. Modelo Operacional de Agentes de IA: Claude Code & Codex

O ciclo de desenvolvimento utiliza Claude Code e Codex atuando de forma coordenada na criação, validação e integração contínua do código-fonte:

1. Uma Issue formal descreve a demanda técnica, contratos e critérios de aceite.
2. O Codex cria a branch semântica (`agent/codex-*`), implementa o código estritamente tipado em TypeScript, adiciona os testes correspondentes e abre o Pull Request.
3. A esteira de CI executa linters, SAST, testes automatizados e varreduras de segurança.
4. O Claude Code realiza a revisão arquitetural, inspeciona o impacto nas regras de negócio e valida a documentação viva.
5. Havendo conflito com alterações recentes na branch main, o Claude Code resolve as divergências sintáticas e semânticas, executa a suíte de testes de integração e atualiza o PR.
6. Com todos os gates de qualidade aprovados, o merge é consolidado via Squash and Merge para preservar a linearidade do histórico.

## 6. Governança de Contexto Vivo e Aprendizagem Contínua

- `/docs/CONTEXT.md`: Documento mestre de estado. Registra módulos concluídos, convenções ativas, mapa de filas e tabelas, e fronteiras arquiteturais.
- `/docs/PLAYBOOKS/INCIDENTS_LEARNING.md`: Base de conhecimento operacional sobre falhas em testes ou incidentes, descrevendo a causa-raiz, a mitigação definitiva e a nova regra introduzida para evitar reincidência.
- `/docs/ADR/`: Registros formais de decisões arquiteturais.

## 7. Registros de Decisão de Arquitetura (ADRs originais)

> Transcritos para arquivos individuais em `docs/ADR/ADR-001` a `ADR-005`. Resumo:

- **ADR-001**: Adoção de Node.js em Imagens Google Distroless.
- **ADR-002**: Utilização do Supabase Self-Hosted e Supabase Queues (pgmq).
- **ADR-003**: Multi-Tenancy Obrigatório via PostgreSQL Row Level Security (RLS).
- **ADR-004**: Motor de Workflows Declarativo Zero-Code em JSON DSL.
- **ADR-005**: Acessibilidade Universal como Critério de Bloqueio (WCAG 2.2 AA).

## 8. Contratos de Engenharia, Regras de Ouro e Definição de Pronto (DoD)

### 8.1. Regras de Ouro da Engenharia
- **Imutabilidade Distroless**: Nenhuma dependência de sistema operacional, shell ou ferramentas externas é permitida no código; gravações locais são proibidas, exceto no diretório montado `/tmp`.
- **RLS Mandatório**: Nenhuma tabela corporativa é criada sem ativação explícita de `ROW LEVEL SECURITY` e validação das políticas de isolamento multilocatário.
- **Processamento Idempotente**: Consumidores de filas pgmq devem ser obrigatoriamente idempotentes, tratando mensagens duplicadas sem corromper o estado das entidades.
- **Zero Scripts Imperativos em Regras de Negócio**: Fórmulas, aprovações e SLAs são configurados estritamente através da DSL declarativa; é expressamente proibido o uso de `eval()` ou interpretadores de scripts dinâmicos.
- **Graceful Shutdown**: Todos os serviços em execução no Kubernetes devem atender aos sinais de desligamento no prazo limite estipulado (`terminationGracePeriodSeconds: 30`).

### 8.2. Definição de Pronto (Definition of Done — DoD)
Um item de backlog é considerado pronto apenas quando atende integralmente aos seguintes requisitos:
1. Código implementado em TypeScript estrito com esquemas Zod validados.
2. Cobertura de testes unitários superior a 85% e testes de integração executados com sucesso contra instâncias efêmeras de banco de dados.
3. Políticas de RLS versionadas em arquivos de migração e validadas contra vazamento de dados entre partições departamentais.
4. Imagem Distroless gerada com varredura de segurança Trivy indicando zero vulnerabilidades com CVSS ≥ 7.0.
5. Testes de acessibilidade automatizados via Axe-core aprovados sem violações WCAG 2.2 AA.
6. Documentação do arquivo CONTEXT.md e esquemas OpenAPI atualizados.
7. Pull Request formalmente revisado e aprovado com resolução limpa de conflitos na branch main.
