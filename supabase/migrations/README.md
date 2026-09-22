# supabase/migrations

Migrações SQL versionadas + políticas RLS (ADR-003).

**Status:** nenhuma migração criada ainda.

## Regra inegociável

Toda migração que cria uma tabela de negócio (chamado, CI, pessoa, regra, etc.) **deve incluir**, na mesma migração ou em migração imediatamente subsequente no mesmo PR:

```sql
ALTER TABLE <tabela> ENABLE ROW LEVEL SECURITY;
-- políticas de SELECT/INSERT/UPDATE/DELETE vinculadas a tenant_id / workspace_id
-- via claims do JWT (auth.jwt() ->> 'tenant_id', etc.)
```

PR que adiciona tabela sem RLS correspondente é bloqueado no gate de CI (ver `.github/PULL_REQUEST_TEMPLATE.md`).

As primeiras migrações esperadas (Fase 0): `tenants`, `workspaces`, `people`, `roles`, `role_assignments`, `audit_log` (ADR-007), `business_rules` (ADR-006). Atualize `docs/CONTEXT.md` § 4 a cada migração nova.
