<!-- GERADO POR scripts/sync-adrs.mjs — NÃO EDITAR À MÃO.
     A fonte é docs/ESM_ITSM_PLATFORM_SPEC.md § 9. Edite lá e rode: node scripts/sync-adrs.mjs -->

# ADR-006: Business Rules Engine (BRE) Desacoplado do Motor de Workflows

- **Status:** Aprovado
- **Decisão:** Implementar um componente autônomo de avaliação de regras de negócio, totalmente desacoplado da máquina de estados do workflow. As regras são declaradas como estruturas JSON (árvore lógica com operadores `AND`, `OR`, `NOT`, comparações de campos e predicados temporais), avaliadas por um executor funcional puro em TypeScript.
- **Consequências:**
  - Permite que regras de cálculo de prioridade matricial, roteamento de filas, suspensão de SLAs e determinação de aprovadores sejam reutilizadas transversalmente em múltiplos fluxos de atendimento sem inflar a máquina de estados principal.
  - `[+]` Dependência **unidirecional**: o workflow invoca o BRE; o BRE nunca invoca o workflow. Qualquer necessidade inversa indica que a lógica está no componente errado.
  - `[+]` O avaliador é função pura, sem I/O — recebe fatos, devolve decisão. Isso o torna exaustivamente testável e é a razão pela qual sua cobertura de testes exigida é superior ao piso de 85% da DoD.
  - `[+]` Toda avaliação é registrada com os fatos de entrada e o resultado (Épico 7.6): auditoria de **decisão**, não apenas de mutação. Sem isso, é impossível responder "por que este chamado foi roteado para este time em março".
  - `[+]` Precedência, escopo e critério de parada precisam ser explícitos e visíveis ao autor da regra (Épico 7.5) — um motor de regras cuja ordem de avaliação é implícita produz comportamento imprevisível em produção.
  - `[+]` Guia de decisão para o time: se a lógica responde _"sob qual condição"_ e é reutilizável, é regra (BRE). Se responde _"o que acontece em seguida"_ e é específica de um fluxo, é transição (workflow).

---

Contexto completo, backlog relacionado e demais decisões: `docs/ESM_ITSM_PLATFORM_SPEC.md`.
