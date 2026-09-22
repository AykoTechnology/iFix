# Backlog Estratégico — iFix ESM/ITSM

Este documento consolida o backlog original da spec técnica (Épicos 1–5) com 7 épicos adicionais propostos após a análise do design system e das 7 telas de referência (`docs/design-system/screens.md`). Cada épico tem um Issue própria no GitHub (label `epic`) com o checklist de histórias abaixo — este arquivo é a visão consolidada e a justificativa de escopo; a Issue é a unidade de execução e rastreamento.

## Como ler este documento

- **Épico**: entrega de valor de produto, várias histórias, geralmente atravessa múltiplas fases.
- **História**: unidade de trabalho testável, mapeável a um ou mais PRs, sujeita à Definição de Pronto (DoD) em `docs/CONTEXT.md`.
- **Fase**: agrupamento de entrega/release, não um período de tempo fixo — a ordem reflete dependência técnica, não urgência de negócio (que cabe ao dono do produto priorizar dentro de cada fase).

## Mapa de fases

| Fase | Foco | Épicos envolvidos |
|---|---|---|
| 0 — Fundação | Infra, CI/CD, auth/RLS base, design system como código, observabilidade base | transversal (ver `docs/CONTEXT.md` § Fundação) |
| 1 — Núcleo ITSM | Incidente/Problema/Mudança, Catálogo, dashboard do analista | 4, 6 |
| 2 — Fluxo & Regras | FlowBuilder completo, motor de regras, portabilidade de config | 1, 7 |
| 3 — Conhecimento & Multicanal | KB contextual/RAG, notificações, integrações, SSO | 3, 10 |
| 4 — ESM & Delegação | Delegação de alçadas, RH/Financeiro/Facilities, portal do colaborador | 2, 11 |
| 5 — CMDB, AIOps & Analytics | CMDB federada, ITAM, storm alert, relatórios de CAB, métricas executivas | 5, 8, 9 |
| 6 — Hardening & GA | Observabilidade fim a fim, auditoria/LGPD, segurança, DR, acessibilidade final | 12 |

---

## Épico 1 — Governança e Portabilidade de Configuração (Config Portability)

*Original da spec técnica.*

- **1.1** Motor de serialização em schema JSON declarativo para exportação/importação de formulários, fluxos e catálogos.
- **1.2** Validação sintática (dry-run) em pipeline para checar integridade referencial antes da aplicação de pacotes em produção.
- **1.3** Relatórios visuais de diff comparando configurações ativas entre Homologação e Produção (ver tela 07).
- **1.4 (novo)** Versionamento de pacote de configuração com histórico de aplicações (quem aplicou, quando, diff aplicado) — consome a trilha de auditoria (ADR-007).

## Épico 2 — Delegação Dinâmica de Papéis e Alçadas (Portal Delegation)

*Original da spec técnica.*

- **2.1** Interface de autoatendimento para agendamento de ausências com indicação de delegado e alçadas transferidas (checkboxes granulares, ver tela 07).
- **2.2** Roteamento automático de aprovações com dupla trilha de auditoria (titular + aprovador) — consome ADR-007.
- **2.3** Rotina via `pg_cron` para expiração e revogação imediata dos acessos delegados ao término do período.
- **2.4 (novo)** Notificação proativa ao titular e ao delegado em D-1 do início/fim da delegação (consome ADR-010).

## Épico 3 — Base de Conhecimento Contextual Integrada

*Original da spec técnica.*

- **3.1** Painel lateral persistente (≥1280px) com busca semântica em tempo real via embeddings pgvector (ver tela 02).
- **3.2** Recomendações algorítmicas de artigos de contorno baseadas no texto/metadados do chamado, com score de relevância exibido.
- **3.3** Anexação direta da solução recomendada na resposta ao solicitante, com métricas de reuso persistidas por artigo (contagem de uso, taxa de resolução associada — ver `screens.md` § 02).
- **3.4 (novo)** Reindexação incremental da base vetorial conforme a conversa do chamado evolui (debounce client-side → endpoint de reindexação), não apenas na criação do artigo.

## Épico 4 — Catálogo em Cartões Dinâmicos e Filtragem Multinível

*Original da spec técnica.*

- **4.1** Catálogo modular em cartões dinâmicos com SLA e custo operacional estimado sempre exibidos juntos (ver tela 03).
- **4.2** Filtragem contextual de serviços/formulários orientada pelas informações corporativas do token de identidade (espaço pré-selecionado pelo domínio do usuário).
- **4.3** Renderizador dinâmico de formulários por schema JSON com validação instantânea cliente/servidor (mesmo schema, mesma mensagem de erro).
- **4.4 (novo)** Editor de autoria de schema de formulário (gap identificado em `screens.md` — o protótipo mostra o formulário renderizado, não a tela de criação do schema).
- **4.5 (novo)** Contagem de aprovações necessárias exibida no card antes da submissão (derivada do workflow associado ao item de catálogo).

## Épico 5 — Inteligência AIOps & Assistente Cognitivo Corporativo

*Original da spec técnica.*

- **5.1** Worker assíncrono via `pgmq` para correlação temporal/geográfica de incidentes, emitindo Storm Alert (ver tela 06).
- **5.2** Assistente virtual conversacional RAG com isolamento multi-tenant, sempre declarando o escopo de acesso na resposta.
- **5.3** Relatórios automatizados de impacto de mudança para o CAB, cruzando mudanças conflitantes e histórico de falha do CI nos últimos 6 meses.
- **5.4 (novo)** Ações do assistente sempre propositivas, nunca autônomas destrutivas ("Criar problema", "Ver fontes" — nunca "Resolver automaticamente"), conforme padrão de UX da tela 06.

## Épico 6 — Núcleo ITSM: Incidentes, Problemas e Mudanças *(novo)*

Fecha a lacuna dos 25 processos auditáveis PinkVERIFY que não têm componente arquitetural próprio nos épicos originais.

- **6.1** Gestão de Incidentes completa: abertura multicanal (portal, e-mail, API), categorização, priorização automática (matriz impacto×urgência via motor de regras), timers de SLA de primeira resposta e resolução.
- **6.2** Gestão de Problemas com vínculo N:N a incidentes, análise de causa-raiz guiada (formulário estruturado tipo 5 Porquês/Ishikawa) e base de Erros Conhecidos (Known Error DB).
- **6.3** Gestão de Mudanças em 3 trilhas: Padrão (pré-aprovada), Normal (via CAB, ver tela 06), Emergencial (aprovação pós-fato) — com calendário de janelas e detecção de conflito.
- **6.4** Matriz de priorização (impacto × urgência → prioridade) configurável como instância do motor de regras (Épico 7), não hardcoded no domínio.
- **6.5** SLA/OLA/UC com calendário de horário útil por workspace/região e pausa automática de SLA em "Aguardando solicitante".

## Épico 7 — Motor de Regras de Negócio & Automação *(novo — ADR-006)*

- **7.1** Business Rules Engine: schema Zod de condição em árvore (AST-JSON), avaliador puro testável, tabela `business_rules`.
- **7.2** Editor visual de expressão (se/e/ou por campo) reutilizado como bloco "Condição" do FlowBuilder e como tela standalone de regras.
- **7.3** Roteamento automático de chamados (round robin, balanceamento de carga, por habilidade do agente) como regras de primeira classe.
- **7.4** Dry-run de regra contra payload de exemplo, com relatório dos fatos avaliados e resultado.

## Épico 8 — CMDB Federada & Gestão de Ativos (ITAM) *(novo)*

- **8.1** Grafo de dependências de CI em 3 níveis (ver tela 05) com ingestão federada (descoberta de rede, inventário de nuvem, importação manual) e proveniência/frescor por CI.
- **8.2** Serviço de cálculo de raio de impacto (blast radius) reutilizável por Incidente, Mudança e simulação manual — trava o grafo + junta com usuários/processos de negócio vinculados.
- **8.3** Ciclo de vida de ativos (hardware/licenças): Em estoque → Alocado → Em manutenção → Baixado, vinculado a CI e colaborador.
- **8.4** Alertas de vencimento de contrato/licença e sub/superutilização, via motor de regras + notificações.

## Épico 9 — Analytics, Métricas & Relatórios Executivos *(novo)*

- **9.1** Camada de agregação (views materializadas) para os KPIs do dashboard (chamados abertos, SLA violado, cumprimento de SLA, volume por espaço — ver tela 01).
- **9.2** Métricas de processo: MTTR, MTTA, resolução no primeiro contato, taxa de reabertura, aging de backlog, sucesso de mudança, recorrência de problema.
- **9.3** Pesquisa CSAT/NPS pós-resolução, correlacionada a agente/grupo/serviço.
- **9.4** Tela de Relatórios com builder de dashboard (métrica + filtro + visualização) e exportação agendada (PDF/CSV).

## Épico 10 — Notificações Multicanal & Integrações *(novo — ADR-010)*

- **10.1** Fila `notifications_outbox` e adaptadores in-app/e-mail.
- **10.2** Central de notificações in-app com preferências por tipo de evento e modo digest.
- **10.3** Webhooks de saída assinados (HMAC) para Slack/Microsoft Teams.
- **10.4** Ingestão de chamado por e-mail (parsing de caixa dedicada) e API pública documentada (OpenAPI, ADR-009) para abertura por sistemas externos (ex.: ferramentas de monitoramento alimentando o AIOps).
- **10.5** SSO corporativo (OIDC/SAML/Azure Entra ID) com provisionamento just-in-time e mapeamento de claims para papéis/workspaces.

## Épico 11 — Módulos ESM Especializados *(novo)*

- **11.1** RH: onboarding/offboarding com pedidos paralelos (acesso, equipamento, crachá — ver card da tela 03) e checklist obrigatório de encerramento de acesso na saída.
- **11.2** Financeiro: reembolso e procurement com aprovação por alçada de valor (integrado ao motor de regras).
- **11.3** Facilities: reserva de sala/recurso com calendário e confirmação automática; chamado de manutenção predial com SLA próprio.
- **11.4** Portal do colaborador (self-service): "Meus pedidos", acompanhamento de status, avaliação pós-atendimento (gap de tela identificado em `screens.md`).

## Épico 12 — Observabilidade, Segurança, Compliance & Hardening *(novo — ADR-007/008)*

- **12.1** OpenTelemetry fim a fim (API → fila → worker) com dashboards de profundidade de fila/idade de mensagem/DLQ.
- **12.2** Trilha de auditoria imutável com política de retenção/anonimização LGPD por tipo de evento.
- **12.3** Gate de CI: Trivy zero CVSS≥7.0 + SAST em todo PR.
- **12.4** Testes de carga (API e filas) + exercício de chaos engineering validando HPA/KEDA e graceful shutdown (30s).
- **12.5** Plano de disaster recovery (backup/restore testado, RTO/RPO definidos) e pentest externo antes do GA.

---

## Pendências levantadas na análise (não são histórias — são decisões/insumos a resolver antes de iniciar as fases correspondentes)

1. Licenciamento e hospedagem self-hosted das fontes **Gilroy** e **Lufga** (uso comercial) — bloqueia build de produção do tema tipográfico definitivo.
2. Telas não prototipadas listadas em `docs/design-system/screens.md` § "Telas não prototipadas" precisam retornar ao Claude Design antes das histórias 4.4, 9.4, 10.2, 11.4 e login/SSO entrarem em desenvolvimento de UI.
3. Política de retenção/anonimização LGPD por tipo de evento (ADR-007) — decisão de produto/jurídico, não só técnica.
4. Definição do vendor de observabilidade (coletor OTLP de destino) e do provedor de e-mail transacional — impacta Épico 10 e 12.
5. Escolha do modelo de embeddings e do provedor de LLM para o RAG (Épico 3/5) — impacta custo operacional e isolamento multi-tenant do prompt.
