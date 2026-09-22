<!-- GERADO POR scripts/sync-adrs.mjs — NÃO EDITAR À MÃO.
     A fonte é docs/ESM_ITSM_PLATFORM_SPEC.md § 9. Edite lá e rode: node scripts/sync-adrs.mjs -->

# ADR-004: Motor de Workflows Declarativo Zero-Code em JSON DSL

- **Status:** Aprovado
- **Decisão:** Fluxos de trabalho são representados como *statecharts* em JSON validados via Zod e interpretados por um motor determinístico em Node.js.
- **Consequências:**
  - Impede injeção de scripts arbitrários pelos usuários, mantém a retrocompatibilidade durante atualizações de versão e preserva a conformidade com as regras do PinkVERIFY.
  - `[+]` A UI do FlowBuilder é a **única** superfície de autoria; o JSON aparece ao usuário apenas como representação somente-leitura. Não existe campo de texto livre que aceite DSL.
  - `[+]` Instâncias em execução permanecem vinculadas à versão do fluxo sob a qual nasceram, até sua conclusão natural. O motor precisa executar N versões simultaneamente — migrar instâncias vivas entre versões é proibido por padrão.
  - `[+]` Publicação exige *dry-run* aprovado (integridade referencial: estado órfão, transição sem destino, condição sobre campo inexistente). Não é passo opcional do fluxo de publicação.
  - `[+]` O motor de workflow **orquestra estado e aprovação**; ele não avalia condições por conta própria — delega ao BRE (ADR-006). A fronteira entre os dois é a diferença entre "o que acontece depois" e "sob qual condição".

---

Contexto completo, backlog relacionado e demais decisões: `docs/ESM_ITSM_PLATFORM_SPEC.md`.
