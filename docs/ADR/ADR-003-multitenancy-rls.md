# ADR-003: Multi-Tenancy Obrigatório via PostgreSQL Row Level Security (RLS)

- **Status:** Aprovado
- **Data:** 2026-09-22

## Contexto

A plataforma é ESM: um único banco atende múltiplos domínios corporativos (TI, RH, Finanças, Instalações) e potencialmente múltiplos tenants (clientes). Vazamento de dados entre partições é o risco de maior impacto do produto (ex.: um analista de TI lendo um chamado de RH sobre um processo disciplinar).

## Decisão

Toda tabela que armazena chamados, itens de configuração, pessoas ou qualquer dado de negócio possui coluna `tenant_id` (e, quando aplicável, `workspace_id` para a partição departamental). Políticas RLS estritas, vinculadas a `auth.uid()` e aos claims do JWT (tenant, espaços de serviço, papéis), são a única linha de defesa reconhecida como suficiente — não um filtro de aplicação.

## Consequências

- Segurança em profundidade garantida pelo kernel do banco: mesmo um bug de query na API não vaza dados entre partições.
- Consultas da aplicação **não devem** concatenar `WHERE tenant_id = ...` manualmente como medida de segurança (podem fazê-lo por performance, nunca como controle de acesso primário) — a RLS é sempre a barreira de verdade.
- Toda migração que cria tabela de negócio **deve** vir acompanhada da migração de política RLS na mesma alteração versionada — PR sem RLS em tabela nova é bloqueado no gate de CI (ver DoD).
- Testes de integração de RLS são obrigatórios: para cada tabela sensível, existe ao menos um teste que prova que o usuário do tenant A **não consegue ler nem escrever** dado do tenant B, mesmo manipulando parâmetros de request.
- Papéis de serviço (workers, jobs `pg_cron`) que precisam atravessar tenants (ex.: correlação de storm alert, cálculo de KPIs globais) usam uma role de banco separada, auditada, nunca a role autenticada de usuário — e todo acesso dessa role é registrado na trilha de auditoria (ADR-007).
