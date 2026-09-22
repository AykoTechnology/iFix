<!-- GERADO POR scripts/sync-adrs.mjs — NÃO EDITAR À MÃO.
     A fonte é docs/ESM_ITSM_PLATFORM_SPEC.md § 9. Edite lá e rode: node scripts/sync-adrs.mjs -->

# ADR-003: Multi-Tenancy Obrigatório via PostgreSQL Row Level Security (RLS)

- **Status:** Aprovado
- **Decisão:** Todas as tabelas que armazenam dados de chamados, itens de configuração ou pessoas devem possuir a coluna `tenant_id` e políticas RLS estritas vinculadas ao `auth.uid()` e aos claims do JWT.
- **Consequências:**
  - Segurança em profundidade garantida pelo kernel do banco de dados: um erro de query na aplicação não vaza dados entre locatários.
  - Consultas da aplicação não precisam concatenar filtros de locatário manualmente como mecanismo de segurança.
  - `[+]` Filtro de locatário na aplicação, quando existir, é otimização de performance — **nunca** é o controle de acesso. Código que trate o filtro de aplicação como barreira de segurança está incorreto por definição.
  - `[+]` Toda tabela de negócio nova exige teste de integração que prove que o usuário do locatário A não lê nem escreve dado do locatário B, inclusive manipulando parâmetros de requisição. É gate de CI (§6.4, gate 4 e 5).
  - `[+]` Processos que legitimamente atravessam locatários (correlação AIOps, rotinas de retenção, métricas globais de plataforma) usam *role* de serviço distinta, com escopo mínimo e **todo acesso registrado na trilha de auditoria** (ADR-007) — o `bypass` de RLS é a exceção mais sensível do sistema e precisa ser a mais auditada.
  - `[+]` RLS tem custo de plano de execução. Índices devem incluir `tenant_id` como primeira coluna nos acessos mais frequentes, e a performance das políticas é item explícito da revisão arquitetural de PR.

---

Contexto completo, backlog relacionado e demais decisões: `docs/ESM_ITSM_PLATFORM_SPEC.md`.
