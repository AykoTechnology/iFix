# Telas de Referência → Módulos do Produto

As 7 telas do handoff (`iFix Telas.dc.html`, 1440×900) já validam a arquitetura de informação dos 5 épicos originais da spec técnica. Este documento mapeia cada tela para o módulo de produto, o épico correspondente e as decisões de UX que **restringem** a implementação (não são sugestões — são contratos de interface).

| # | Tela | Módulo de produto | Épico(s) relacionado(s) |
|---|---|---|---|
| 01 | Central do analista | Dashboard operacional | Épico 9 (Analytics) + base de todos |
| 02 | Mesa de atendimento | Workspace de chamado + KB contextual | Épico 3 (Base de Conhecimento) |
| 03 | Catálogo de serviços | Catálogo em cards dinâmicos | Épico 4 (Catálogo) |
| 04 | Fluxos | FlowBuilder zero-code | Épico 1 parcial + Épico 7 (Motor de Regras/Workflow) |
| 05 | CMDB | CMDB federada + raio de impacto | Épico 8 (CMDB & AIOps) |
| 06 | AIOps | Correlação/storm alert + relatório CAB | Épico 5 (AIOps) |
| 07 | Alçadas | Delegação + comparação de ambientes | Épico 2 (Delegação) + Épico 1 (Config Portability) |

## 01 · Central do analista

- KPI row de 4 cards: chamados abertos (+ "N em risco de SLA"), SLA violado hoje, mudanças no CAB, **cumprimento de SLA no mês em card com gradiente de marca** — este é o único cartão autorizado a usar o gradiente como fundo sólido (é o "destaque único por tela").
- Banner de Storm Alert aparece **acima** do conteúdo operacional quando ativo — nunca em modal, nunca dispensável sem ação.
- Layout 1.6fr/1fr: gráfico de barras (volume por espaço de serviço, com valor numérico sobre cada barra — nunca só a barra) + "Minha fila" com preview de 4 itens e link "Abrir fila completa".
- Requisito de dado: este dashboard precisa de uma view materializada/agregada (não query direta em `tickets` a cada carregamento) — ver `docs/CONTEXT.md` § Performance.

## 02 · Mesa de atendimento

- Layout de 3 colunas implícitas: contexto do chamado (header) + thread de conversa (centro, `flex:1`) + painel de conhecimento contextual (360px, direita, fixo ≥1280px).
- Thread distingue visualmente **resposta pública** (avatar cinza, balão neutro) de **nota interna** (avatar com gradiente de marca, balão roxo `#1F1526` + badge "Nota interna") — essa distinção visual é um requisito de segurança de informação, não só estética (nota interna nunca pode vazar ao solicitante).
- Composer com 2 modos (Responder / Nota interna) + ação "Inserir artigo KB-XXXX" que abre o painel de conhecimento.
- Painel de conhecimento: busca semântica (pgvector) que **atualiza conforme a conversa evolui** (não é busca estática por título) — implica reindexação incremental client-driven (debounce) contra o endpoint de busca semântica a cada N caracteres/pausa de digitação.
- Cards de artigo mostram `% relevante`, e cards de reuso mostram métricas ("Reutilizado 34 vezes · resolveu 78% dos casos") — Épico 3, História 3.3 exige que essas métricas sejam persistidas por artigo, não calculadas ad-hoc.
- Card "Assistente iFix" ao final do painel: RAG contextual que oferece gerar resumo/causa-raiz — sempre com aviso de escopo ("Respostas restritas ao seu espaço de serviço e nível de acesso", visível também na tela de AIOps) — requisito de confiança do usuário sobre isolamento multi-tenant do RAG.

## 03 · Catálogo de serviços

- Filtro de espaço de serviço (sidebar) é **pré-selecionado pelo domínio corporativo do token do usuário** (texto do header: "Filtrado pelo seu perfil: Finanças · Unidade Sul") — Épico 4, História 4.2. O usuário pode navegar para outros espaços, mas o padrão nunca é "todos os espaços misturados".
- Cards mostram custo estimado E prazo/SLA sempre juntos, nunca um sem o outro — decisão de transparência de custo.
- Card mostra contagem de aprovações necessárias como informação de expectativa ("· 2 aprovações", "· sem aprovação") — isso implica que o schema de catálogo carrega uma referência ao workflow de aprovação associado e sua contagem de steps é derivável antes da submissão.

## 04 · Fluxos (FlowBuilder)

- Canvas horizontal por linhas de fluxo principal, com ramificações indentadas (não é um canvas livre estilo Figma — é um layout de fluxo estruturado, mais previsível e mais acessível por teclado que drag-and-drop livre).
- Painel esquerdo: paleta fixa de 6 tipos de bloco (Estado, Condição, Aprovação, Notificação, Temporizador de SLA, Ação automática) — **fechada por design**, reforça ADR-004 (zero eval/script).
- Painel direito: propriedades do bloco selecionado, terminando sempre em uma prévia **read-only** do JSON DSL gerado — o usuário nunca edita o JSON diretamente.
- Header carrega estado de versionamento do fluxo (`reembolso.v4 · rascunho`) + duas ações: "Validar (dry-run)" e "Publicar" — o dry-run é sempre executável antes de publicar e retorna relatório inline ("14 estados, 19 transições, nenhuma referência órfã") — Épico 1, História 1.2.
- Regra de ramificação visível no protótipo: uma aprovação condicional (diretor financeiro) só é avaliada "se valor > R$ 2.000", com temporizador de escalonamento de 48h anexado à branch condicional — isso é o padrão de referência para o motor de regras (Épico 7).

## 05 · CMDB

- Mapa de dependências renderizado em 3 níveis fixos (consumidores acima, CI selecionado ao centro destacado, dependências abaixo) — não é um grafo de força livre; é uma visualização hierárquica de 3 camadas, mais legível e mais fácil de tornar acessível via teclado (tab entre nós, anúncio de relação pai/filho).
- Ação "Simular indisponibilidade" no header — dispara o cálculo de raio de impacto sem alterar o estado real do CI (simulação, não mutação).
- Card "Raio de impacto calculado" traz número absoluto de usuários afetados + quebra por serviços de negócio / CIs dependentes / processos críticos nomeados (ex.: "Fechamento contábil") — Épico CMDB precisa de um serviço de cálculo de blast radius que atravesse o grafo de dependências e junte com dados de usuários/processos de negócio vinculados ao CI.
- Card "Origem federada dos dados" expõe proveniência e frescor de cada fonte (Descoberta de rede, Inventário de nuvem, Planilha manual) com timestamp/cor de status — a CMDB é federada, não um cadastro manual único, e a UI precisa mostrar de onde cada CI foi descoberto e há quanto tempo.

## 06 · AIOps

- Storm Alert como card full-width no topo, com 3 métricas (chamados correlacionados, janela de abertura, unidades atingidas) + histograma de correlação temporal (barras por minuto, mudando de cor conforme severidade do pico).
- Tabela de chamados correlacionados abaixo, ordenada por horário de abertura — cada linha linkável para a Mesa de Atendimento (tela 02).
- Painel direito: card do Assistente iFix propondo causa-raiz correlacionando o incidente com uma mudança recente (CHG-0442) por proximidade temporal + CI compartilhado — este é o comportamento de referência do RAG para Épico 5, História 5.1/5.2 (correlação + sugestão, nunca ação automática sem confirmação: os botões são "Criar problema" e "Ver fontes", nunca "Resolver automaticamente").
- Card "Relatório de impacto para o CAB" — Épico 5, História 5.3. Note que ele cruza **mudanças conflitantes** e **histórico de falha da mesma mudança/CI nos últimos 6 meses** — isso implica manter histórico de execuções de mudança vinculado ao CI, não só o registro da mudança atual.

## 07 · Alçadas e Config Portability

Duas colunas independentes que **compartilham a tela** mas são módulos de dados distintos — não devem ser fundidos em uma única API:

1. **Delegação** (esquerda): agendar ausência com período, delegado e lista de alçadas transferidas (checkboxes, não "tudo ou nada" — Épico 2, História 2.1/2.2). Aviso inline fixo sobre revogação automática e dupla trilha de auditoria (titular + delegado) — texto que deve vir de `docs/CONTEXT.md`/copy deck, não hardcoded livre.
2. **Portabilidade de configuração** (direita): diff entre Homologação e Produção, com contadores de diferenças/idênticos, lista categorizada por tipo de diff (novo/alterado/removido) e por tipo de objeto (Fluxo/Formulário/Catálogo) — Épico 1, História 1.3. Confirmação de aplicação em produção exige digitar o nome do pacote (reforça a regra de "ações irreversíveis" do design system).

## Telas não prototipadas (gap a preencher no design antes de implementar)

O handoff cobre o núcleo mas não inclui (sinalizar para o próximo ciclo de design):

- Tela de login/SSO e onboarding de tenant.
- Portal de autoatendimento do solicitante final (fora da mesa do analista) — o catálogo (03) é o mais próximo, mas falta a tela de "Meus pedidos"/acompanhamento citada no header.
- Editor de schema JSON de formulário dinâmico (Épico 4, História 4.3) — o wizard (seção 07 do design system) mostra o *resultado* renderizado, não a tela de autoria do schema.
- Tela de Analytics/Relatórios dedicada (além dos cards do dashboard) — necessária para o Épico 9 proposto abaixo.
- Central de notificações in-app.
- Editor de árvore de decisão/expressão do motor de regras (Épico 7) além do FlowBuilder de aprovações.

Essas telas precisam ser levadas de volta ao Claude Design antes de suas respectivas histórias entrarem em desenvolvimento de UI — registrado como dependência em `docs/CONTEXT.md` § Pendências.
