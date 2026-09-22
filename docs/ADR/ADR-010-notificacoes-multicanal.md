# ADR-010: Notificações Multicanal Assíncronas via pgmq

- **Status:** Proposto
- **Data:** 2026-09-22
- **Contexto de origem:** A spec original menciona notificações apenas como bloco do FlowBuilder ("Notificação") sem definir a arquitetura de entrega — necessária para SLA, delegação, storm alert e aprovações.

## Contexto

Múltiplos eventos do domínio (SLA em risco, aprovação pendente, storm alert, artigo de KB sugerido, delegação prestes a expirar) precisam alcançar o usuário certo pelo canal certo (in-app sempre; e-mail, Slack/Teams ou push conforme preferência), sem acoplar o código de negócio a um provedor de envio específico.

## Decisão

Todo evento de domínio que gera notificação publica uma mensagem na fila `pgmq` `notifications_outbox` (mesmo padrão idempotente do ADR-002). Um worker dedicado (`src/workers/src/notifications/`) resolve preferências do usuário (tabela `notification_preferences`: canal habilitado por tipo de evento) e despacha para adaptadores por canal (in-app via `notifications` table + Realtime; e-mail via SMTP/provedor; Slack/Teams via webhook de saída assinado). Central de notificações in-app é a fonte de verdade de "lido/não lido"; os demais canais são cópias de melhor esforço.

## Consequências

- Nenhum módulo de produto (workflow, SLA, delegação) chama um provedor de e-mail diretamente — todos publicam na mesma fila com um `event_type` padronizado, mantendo a Regra de Ouro de idempotência e a consistência transacional do ADR-002.
- Preferências por usuário/tipo de evento evitam fadiga de notificação — obrigatório ter ao menos um agrupamento "digest" (resumo periódico) para eventos de baixa prioridade, não só notificação individual imediata.
- Falha de entrega em canal externo (e-mail fora do ar) nunca bloqueia a notificação in-app nem o evento de negócio original — desacoplamento garantido pela fila.
- Webhooks de saída (Slack/Teams) precisam de assinatura HMAC e política de retry com backoff, tratados como integração de Épico 10 (Notificações & Integrações), não como responsabilidade ad-hoc de cada módulo.
