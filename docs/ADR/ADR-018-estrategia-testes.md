<!-- GERADO POR scripts/sync-adrs.mjs — NÃO EDITAR À MÃO.
     A fonte é docs/ESM_ITSM_PLATFORM_SPEC.md § 9. Edite lá e rode: node scripts/sync-adrs.mjs -->

# ADR-018: Estratégia de Testes e Ambientes Efêmeros

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
  - A suíte de integração é mais lenta que uma suíte com _mocks_; é um custo aceito conscientemente em troca de exercitar RLS e `pgmq` de verdade.
  - Exige infraestrutura de CI capaz de subir contêineres (Docker-in-Docker ou serviço equivalente).

---

Contexto completo, backlog relacionado e demais decisões: `docs/ESM_ITSM_PLATFORM_SPEC.md`.
