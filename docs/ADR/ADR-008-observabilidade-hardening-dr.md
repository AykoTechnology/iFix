<!-- GERADO POR scripts/sync-adrs.mjs — NÃO EDITAR À MÃO.
     A fonte é docs/ESM_ITSM_PLATFORM_SPEC.md § 9. Edite lá e rode: node scripts/sync-adrs.mjs -->

# ADR-008: Observabilidade Unificada (OpenTelemetry), Hardening e Resiliência (DR)

- **Status:** Aprovado
- **Decisão:** A plataforma nasce 100% instrumentada via OpenTelemetry SDK, propagando o cabeçalho padronizado W3C Trace Context (`traceparent`) através de todas as camadas. Em nível de infraestrutura, os Pods executam sob o perfil Kubernetes _Restricted_, com `drop: ["ALL"]` em _capabilities_ do Linux. A arquitetura de recuperação de desastres adota arquivamento contínuo de WALs em bucket seguro, com testes automatizados periódicos de restauração (RPO < 5 min, RTO < 30 min).
- **Consequências:**
  - Visibilidade transacional ponta a ponta e auditoria operacional em tempo real. Elimina brechas de isolamento de contêineres e garante continuidade de negócio em conformidade com critérios governamentais de _procurement_.
  - `[+]` O `traceparent` precisa atravessar a fronteira da fila: é propagado como atributo da mensagem `pgmq` e restaurado pelo worker. Sem isso, o rastro morre no `COMMIT` e a automação assíncrona — justamente a parte mais difícil de depurar — fica invisível.
  - `[+]` `trace_id` é gravado na trilha de auditoria (ADR-007), unindo a pergunta técnica ("o que o sistema fez") à pergunta de negócio ("quem mudou o quê") em uma única linha de investigação.
  - `[+]` Métricas obrigatórias de worker (profundidade de fila, idade da mensagem mais antiga, ocupação de DLQ) servem simultaneamente ao painel operacional e ao autoscaling por KEDA — uma fonte, dois consumidores.
  - `[+]` RPO e RTO declarados sem exercício periódico de restauração cronometrada são hipóteses. O GameDay da História 12.7 é o que converte a declaração em garantia, e sua ausência deve ser tratada como risco aberto, não como pendência menor.
  - `[+]` `readOnlyRootFilesystem` e perfil _Restricted_ exigem que todo diretório de escrita temporária seja volume montado explicitamente — restrição que precisa ser respeitada por qualquer biblioteca de terceiros (geração de PDF, processamento de imagem) adotada no futuro.

---

Contexto completo, backlog relacionado e demais decisões: `docs/ESM_ITSM_PLATFORM_SPEC.md`.
