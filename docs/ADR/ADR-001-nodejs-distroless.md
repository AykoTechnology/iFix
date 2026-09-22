<!-- GERADO POR scripts/sync-adrs.mjs — NÃO EDITAR À MÃO.
     A fonte é docs/ESM_ITSM_PLATFORM_SPEC.md § 9. Edite lá e rode: node scripts/sync-adrs.mjs -->

# ADR-001: Adoção de Node.js em Imagens Google Distroless

- **Status:** Aprovado
- **Decisão:** Utilizar Node.js 22 LTS com TypeScript rodando sobre `gcr.io/distroless/nodejs22-debian12`.
- **Consequências:**
  - Elimina binários vulneráveis e pacotes desnecessários nos contêineres de produção.
  - Obriga que qualquer ferramenta de diagnóstico seja executada via contêineres efêmeros de depuração (*ephemeral debug containers*) no Kubernetes — não há shell para `kubectl exec`.
  - `[+]` Como a depuração ao vivo é inviável, a instrumentação de observabilidade (ADR-008) deixa de ser desejável e passa a ser a **única** via de diagnóstico em produção: um módulo sem trace é um módulo cego.
  - `[+]` Logs vão exclusivamente para `stdout`/`stderr` em JSON estruturado; gravação em arquivo local é proibida (não há como lê-lo depois).
  - `[+]` O build multi-estágio é obrigatório e a imagem final não contém `devDependencies`, código-fonte TypeScript nem arquivos de teste.

---

Contexto completo, backlog relacionado e demais decisões: `docs/ESM_ITSM_PLATFORM_SPEC.md`.
