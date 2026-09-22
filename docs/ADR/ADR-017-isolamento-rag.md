<!-- GERADO POR scripts/sync-adrs.mjs — NÃO EDITAR À MÃO.
     A fonte é docs/ESM_ITSM_PLATFORM_SPEC.md § 9. Edite lá e rode: node scripts/sync-adrs.mjs -->

# ADR-017: Isolamento Multilocatário do RAG e Tratamento de Dados Pessoais pelo Assistente

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

---

Contexto completo, backlog relacionado e demais decisões: `docs/ESM_ITSM_PLATFORM_SPEC.md`.
