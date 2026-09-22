<!-- GERADO POR scripts/sync-adrs.mjs — NÃO EDITAR À MÃO.
     A fonte é docs/ESM_ITSM_PLATFORM_SPEC.md § 9. Edite lá e rode: node scripts/sync-adrs.mjs -->

# ADR-011: Design Tokens Centralizados (tokens.json) como Fonte Única de UI

- **Status:** Aprovado
- **Decisão:** Todas as propriedades visuais da interface (cores, tipografia, espaçamentos, elevações, bordas e estados interativos) são mantidas exclusivamente em `/design-system/tokens.json`. Utiliza-se Style Dictionary em pipeline automatizado para compilar o JSON em classes utilitárias estendidas do Tailwind CSS e variáveis CSS nativas (`:root`).
- **Consequências:**
  - Impede o desvio estético (_design drift_) entre protótipos de interface e o código em produção. Garante que os rácios de contraste exigidos pelo WCAG 2.2 AA sejam testados e validados na fonte antes da geração do CSS.
  - `[+]` O arquivo adota o formato **DTCG** (_Design Tokens Community Group_, com `$value`/`$type`), suportado nativamente pelo Style Dictionary v4 — sem isso o pipeline mandatado por este ADR não teria entrada válida.
  - `[+]` A validação de contraste roda sobre **ambos** os temas (claro e escuro) como teste automatizado na esteira (Épico 11.4), não como conferência visual.
  - `[+]` Componente que use valor estético literal (`#723CEB`, `24px`) em vez de token é reprovado pelo gate 10 da §6.4.
  - `[+]` Alteração de design entra primeiro em `/design-system/tokens.json`; propagar direto para o Tailwind ou para o componente é o caminho por onde o _drift_ retorna.
  - `[+]` A definição tipográfica do sistema está no **ADR-020** (Outfit e JetBrains Mono, SIL OFL, self-hosted). Os tokens `font.family.*` são o único lugar onde ela é declarada.

---

Contexto completo, backlog relacionado e demais decisões: `docs/ESM_ITSM_PLATFORM_SPEC.md`.
