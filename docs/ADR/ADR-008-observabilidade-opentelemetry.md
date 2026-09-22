# ADR-008: Observabilidade Unificada com OpenTelemetry

- **Status:** Proposto
- **Data:** 2026-09-22
- **Contexto de origem:** A spec original define probes de Kubernetes (seção 4.3) mas não um padrão de tracing/métricas/logs correlacionados — essencial para depurar filas `pgmq` e correlação de storm alert em produção.

## Contexto

Com API (Fastify), múltiplos workers assíncronos consumindo `pgmq` e um motor de regras/workflow que atravessa ambos, um incidente em produção sem correlação entre requisição HTTP → mensagem de fila → efeito no banco é extremamente difícil de depurar — e a imagem Distroless (ADR-001) proíbe depuração ao vivo por shell.

## Decisão

Instrumentar API e workers com OpenTelemetry SDK (traces, métricas, logs estruturados em JSON para stdout), propagando `trace_id`/`tenant_id` do header HTTP até a mensagem `pgmq` (como atributo da mensagem) e até o log de processamento do worker. Exportação via OTLP para o coletor da plataforma de observabilidade escolhida pelo time de operações (não fixar vendor no código da aplicação).

## Consequências

- Todo log de aplicação é JSON estruturado com `trace_id`, `tenant_id`, `event`; `console.log` de texto livre é proibido em código de produção (lint rule).
- Métricas obrigatórias por worker: profundidade da fila, idade da mensagem mais antiga não processada, taxa de mensagens na DLQ — usadas tanto por dashboards quanto pelo HPA/KEDA (seção 4.3 da spec).
- `readinessProbe` (checa latência de acesso às filas) e `livenessProbe` (loop de eventos) passam a expor as mesmas métricas que o coletor de observabilidade consome — uma fonte de verdade, dois consumidores.
- Sem acesso a shell no contêiner, tracing distribuído é a principal ferramenta de diagnóstico em produção — sua ausência em um módulo novo é motivo de bloqueio de PR, não item de melhoria futura.
