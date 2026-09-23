<!-- GERADO POR scripts/sync-adrs.mjs — NÃO EDITAR À MÃO.
     A fonte é docs/ESM_ITSM_PLATFORM_SPEC.md § 9. Edite lá e rode: node scripts/sync-adrs.mjs -->

# ADR-002: Utilização do Supabase Self-Hosted e Supabase Queues (pgmq)

- **Status:** Aprovado
- **Decisão:** Padronizar banco de dados, autenticação, armazenamento e filas assíncronas na infraestrutura unificada do Supabase, substituindo brokers externos por pgmq.
- **Consequências:**
  - Reduz a complexidade de manutenção de infraestrutura no Kubernetes — uma peça de estado a operar, monitorar e recuperar, em vez de três.
  - Assegura consistência transacional ACID entre atualizações de chamados e enfileiramento de ações de automação: a mutação e a mensagem ocorrem no mesmo `COMMIT`, eliminando a classe inteira de bugs de "gravou no banco mas não publicou o evento".
  - `[+]` `pgmq` entrega semântica **at-least-once**, não _exactly-once_ — a idempotência do consumidor é obrigatória e é Regra de Ouro (§10.1), não boa prática.
  - `[+]` Toda fila de produção exige DLQ configurada e alerta ativo sobre sua ocupação (Épico 12.5): mensagem na DLQ é automação de negócio que silenciosamente não aconteceu.
  - `[+]` O banco passa a ser o gargalo compartilhado entre carga transacional, fila e busca vetorial. Teste de carga que exercite os três simultaneamente é pré-requisito de GA (Épico 12.7), e a separação de _pooler_/réplica por tipo de carga deve ser avaliada antes do primeiro cliente de grande porte.

---

Contexto completo, backlog relacionado e demais decisões: `docs/ESM_ITSM_PLATFORM_SPEC.md`.
