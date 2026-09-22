# ADR-007: Trilha de Auditoria Imutável (Append-Only)

- **Status:** Proposto
- **Data:** 2026-09-22
- **Contexto de origem:** A spec original menciona auditoria pontualmente (dupla trilha em delegação, PinkVERIFY, LGPD implícito por ser produto de RH/Finanças) sem definir o mecanismo transversal. Sem isso, cada módulo reinventaria seu próprio log.

## Contexto

Delegação de alçada, mudança de estado de chamado, avaliação de regra de negócio, aplicação de pacote de configuração em produção e acesso de role de serviço entre tenants (ADR-003) precisam, todos, de um registro imutável de "quem fez o quê, quando, e por quê" — tanto para conformidade PinkVERIFY/ITIL quanto para LGPD (o produto processa dados de RH).

## Decisão

Tabela `audit_log` append-only (sem `UPDATE`/`DELETE` permitido por política RLS e por *trigger* de banco que rejeita as duas operações), particionada por mês, contendo: `tenant_id`, `actor_id` (ou `system`/nome do worker), `actor_role`, `event_type`, `entity_type`, `entity_id`, `before`/`after` (JSONB, quando aplicável), `reason` (texto livre opcional), `occurred_at`. Escrita é feita por *trigger* de banco nas tabelas de negócio críticas (não depende de a aplicação lembrar de logar) mais eventos explícitos para ações sem tabela própria (avaliação de regra, aplicação de pacote de config).

## Consequências

- "Dupla trilha de auditoria" da Épico 2 (titular + delegado) e a assinatura digitada em ações irreversíveis (Regras de Ouro do design system) são casos de uso desta tabela única, não mecanismos próprios.
- Exportação para SIEM externo (requisito de clientes enterprise) vira um consumidor de fila (`pgmq`) que lê `audit_log` via *logical replication*/CDC, sem acoplar a aplicação a um SIEM específico.
- Política de retenção e anonimização (LGPD, especialmente para dados de RH) precisa ser definida por tipo de evento antes do lançamento — pendência registrada em `docs/CONTEXT.md`.
- Toda migração de tabela de negócio nova precisa declarar explicitamente se seus eventos entram na `audit_log` (a maioria deve) — checklist de PR.
