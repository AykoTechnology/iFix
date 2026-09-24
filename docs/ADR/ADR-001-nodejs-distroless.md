<!-- GERADO POR scripts/sync-adrs.mjs — NÃO EDITAR À MÃO.
     A fonte é docs/ESM_ITSM_PLATFORM_SPEC.md § 9. Edite lá e rode: node scripts/sync-adrs.mjs -->

# ADR-001: Adoção de Node.js em Imagens Google Distroless

- **Status:** Aprovado
- **Decisão:** Utilizar Node.js 22 LTS com TypeScript rodando sobre `gcr.io/distroless/nodejs22-debian13`.
- **Consequências:**
  - Elimina binários vulneráveis e pacotes desnecessários nos contêineres de produção.
  - Obriga que qualquer ferramenta de diagnóstico seja executada via contêineres efêmeros de depuração (_ephemeral debug containers_) no Kubernetes — não há shell para `kubectl exec`.
  - `[+]` Como a depuração ao vivo é inviável, a instrumentação de observabilidade (ADR-008) deixa de ser desejável e passa a ser a **única** via de diagnóstico em produção: um módulo sem trace é um módulo cego.
  - `[+]` Logs vão exclusivamente para `stdout`/`stderr` em JSON estruturado; gravação em arquivo local é proibida (não há como lê-lo depois).
  - `[+]` O build multi-estágio é obrigatório e a imagem final não contém `devDependencies`, código-fonte TypeScript nem arquivos de teste.
  - `[+]` A base é `debian13`, não `debian12`: a variante `debian12` carrega uma versão de `libssl3` com vulnerabilidades já corrigidas a montante (o gate 9 bloqueia CVSS ≥ 7.0), e Distroless não tem gerenciador de pacotes — sem shell não há como atualizar de dentro da imagem, então a única correção possível é trocar a base. A tag permanece flutuante de propósito: fixá-la por digest congelaria a imagem na versão vulnerável do momento, e é a reconstrução periódica a montante que mantém as correções chegando.
  - `[+]` A imagem Distroless não tem `sleep` nem qualquer outro binário para um `preStop` do tipo `exec` — o encerramento coordenado (Regra de Ouro 8, §10.1) usa o handler nativo do kubelet, `lifecycle.preStop.sleep.seconds` (Kubernetes 1.30+, KEP-3960), em vez de `exec.command: ["sleep", "N"]`. O `preStop` só existe onde há tráfego empurrado por Service (`charts/api`); o worker puxa da fila e recebe o SIGTERM direto. O prazo de encerramento do pod começa **antes** do `preStop`, então `preStop` + `SHUTDOWN_TIMEOUT_MS` + margem precisa caber nos 30s — o chart injeta o `SHUTDOWN_TIMEOUT_MS` e o gate 11 verifica a soma. Os charts declaram `kubeVersion: ">=1.30.0-0"` — um cluster mais antigo rejeitaria a instalação em vez de silenciosamente ignorar o `preStop`.

---

Contexto completo, backlog relacionado e demais decisões: `docs/ESM_ITSM_PLATFORM_SPEC.md`.
