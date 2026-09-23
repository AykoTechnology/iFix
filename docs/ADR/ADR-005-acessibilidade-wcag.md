<!-- GERADO POR scripts/sync-adrs.mjs — NÃO EDITAR À MÃO.
     A fonte é docs/ESM_ITSM_PLATFORM_SPEC.md § 9. Edite lá e rode: node scripts/sync-adrs.mjs -->

# ADR-005: Acessibilidade Universal como Critério de Bloqueio (WCAG 2.2 AA)

- **Status:** Aprovado
- **Decisão:** Nenhum componente de interface é incorporado ao Design System sem validação automatizada e aprovação manual de conformidade com as diretrizes WCAG 2.2 Nível AA.
- **Consequências:**
  - Garante navegabilidade total via teclado, contraste cromático regulamentar e compatibilidade com leitores de tela em todos os módulos do sistema.
  - `[+]` O mecanismo é o gate 7 da §6.4 (Axe-core por história de Storybook). Sem esse mecanismo, o ADR é uma intenção — por isso a História 11.5 é pré-requisito da Fase 0.
  - `[+]` Axe-core **não** detecta as violações mais caras deste produto: cor como único portador de informação, ordem de foco ilógica e rótulo incorreto em contexto. Revisão manual de teclado e leitor de tela é item obrigatório do checklist de PR de UI (História 11.7).
  - `[+]` Atualizações em tempo real (Realtime) são anunciadas em região `aria-live="polite"` e **nunca** movem o foco do analista — requisito específico de uma mesa de atendimento que recebe _push_ constante.
  - `[+]` Visualizações gráficas (mapa de dependências da CMDB, gráficos de analytics) exigem alternativa equivalente navegável e valores numéricos explícitos, não apenas a representação visual (Histórias 13.5 e 9.x).

---

Contexto completo, backlog relacionado e demais decisões: `docs/ESM_ITSM_PLATFORM_SPEC.md`.
