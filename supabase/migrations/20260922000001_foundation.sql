-- Migração 0001 — Fundação: tenancy, identidade e trilha de auditoria.
--
-- Esta migração é o PADRÃO DE REFERÊNCIA do projeto. Toda migração futura que criar
-- tabela de negócio copia a estrutura daqui:
--
--   1. coluna tenant_id obrigatória (ADR-003) e, quando o dado pertence a um espaço
--      de serviço, workspace_id (ADR-012);
--   2. ENABLE + FORCE ROW LEVEL SECURITY;
--   3. políticas separadas por comando, usando os predicados de app.*;
--   4. select audit.attach('<tabela>') para a trilha imutável (ADR-007);
--   5. timestamptz em UTC (ADR-016) e UUID v7 como chave primária (ADR-015).
--
-- Referências: ADR-003, ADR-007, ADR-012, ADR-015, ADR-016.

create schema if not exists app;
create schema if not exists audit;

comment on schema app is 'Funções de apoio a políticas RLS e utilitários de domínio.';
comment on schema audit is 'Trilha de auditoria imutável (ADR-007).';

-- ---------------------------------------------------------------------------
-- 1. Identificadores
-- ---------------------------------------------------------------------------

-- UUID v7: ordenável por tempo, preservando localidade de índice sem expor volume
-- de negócio (ADR-015). O PostgreSQL só passa a oferecer uuidv7() nativamente em
-- versões posteriores à 16, então a função é nossa por enquanto.
create or replace function app.uuid_generate_v7()
returns uuid
language sql
volatile
parallel safe
as $$
  select encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          placing substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
          from 1 for 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid;
$$;

comment on function app.uuid_generate_v7() is
  'UUID versão 7 (ordenável por tempo). Chave primária padrão das tabelas de negócio — ADR-015.';

-- ---------------------------------------------------------------------------
-- 2. Claims do JWT
-- ---------------------------------------------------------------------------
--
-- As claims chegam na GUC `request.jwt.claims`, definida pela API a cada transação
-- (mesma origem que o PostgREST usa no Supabase). Concentrar a leitura nestas funções
-- significa que mudar a forma da claim altera um lugar, não cada política.

create or replace function app.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

create or replace function app.current_person_id()
returns uuid
language sql
stable
as $$
  select nullif(app.jwt() ->> 'sub', '')::uuid;
$$;

create or replace function app.current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(app.jwt() ->> 'tenant_id', '')::uuid;
$$;

create or replace function app.current_workspace_ids()
returns uuid[]
language sql
stable
as $$
  select coalesce(
    array(select jsonb_array_elements_text(app.jwt() -> 'workspace_ids')::uuid),
    '{}'::uuid[]
  );
$$;

-- O papel de serviço atravessa locatários por necessidade operacional (correlação
-- AIOps, rotinas de retenção, métricas de plataforma). É a exceção mais sensível do
-- sistema: continua sujeito à RLS — o que muda é o predicado — e todo acesso seu
-- é auditado (ADR-003).
create or replace function app.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(app.jwt() ->> 'role', '') = 'service_role';
$$;

-- ---------------------------------------------------------------------------
-- 3. Predicados de isolamento — o coração do padrão
-- ---------------------------------------------------------------------------

-- Eixo 1: locatário. Fronteira dura; nada a atravessa exceto o papel de serviço.
create or replace function app.tenant_visible(row_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select app.is_service_role() or row_tenant_id = app.current_tenant_id();
$$;

comment on function app.tenant_visible(uuid) is
  'Eixo 1 de isolamento (ADR-003). Use em USING e WITH CHECK de toda tabela de negócio.';

-- Eixo 2: espaço de serviço. Visibilidade restrita aos espaços de que a pessoa
-- participa (ADR-012). Compartilhamento entre espaços exige concessão explícita e
-- chega com o Épico 19.4 — até lá, não-membro não enxerga.
create or replace function app.workspace_visible(row_tenant_id uuid, row_workspace_id uuid)
returns boolean
language sql
stable
as $$
  select app.tenant_visible(row_tenant_id)
     and (app.is_service_role() or row_workspace_id = any (app.current_workspace_ids()));
$$;

comment on function app.workspace_visible(uuid, uuid) is
  'Eixo 2 de isolamento (ADR-012). Combina o eixo do locatário com a participação no espaço de serviço.';

-- ---------------------------------------------------------------------------
-- 4. Colunas de tempo
-- ---------------------------------------------------------------------------

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Trilha de auditoria imutável (ADR-007)
-- ---------------------------------------------------------------------------

create table audit.logs (
  id               uuid        not null default app.uuid_generate_v7(),
  occurred_at      timestamptz not null default clock_timestamp(),
  tenant_id        uuid,
  actor_person_id  uuid,
  actor_db_role    text        not null default current_user,
  actor_is_service boolean     not null default false,
  client_ip        inet,
  trace_id         text,
  operation        text        not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  entity_schema    text        not null,
  entity_table     text        not null,
  entity_id        uuid,
  before           jsonb,
  after            jsonb,
  primary key (id, occurred_at)
) partition by range (occurred_at);

comment on table audit.logs is
  'Append-only. UPDATE e DELETE são revogados e bloqueados por gatilho (ADR-007). Expurgo por DROP PARTITION.';

-- Partição padrão garante que nenhuma escrita falhe por ausência de partição do mês.
-- A criação antecipada das mensais fica a cargo de rotina pg_cron (Épico 12).
create table audit.logs_default partition of audit.logs default;

create index audit_logs_tenant_time_idx on audit.logs (tenant_id, occurred_at desc);
create index audit_logs_entity_idx      on audit.logs (entity_schema, entity_table, entity_id);
create index audit_logs_trace_idx       on audit.logs (trace_id) where trace_id is not null;

-- Imutabilidade em profundidade: além da revogação de privilégio, um gatilho impede
-- alteração mesmo por papel que venha a receber permissão indevidamente.
create or replace function audit.reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit.logs é append-only: % não é permitido (ADR-007)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_logs_no_update
  before update on audit.logs
  for each row execute function audit.reject_mutation();

create trigger audit_logs_no_delete
  before delete on audit.logs
  for each row execute function audit.reject_mutation();

-- Captura por gatilho, não por código de aplicação: auditoria que depende de o
-- desenvolvedor lembrar de chamá-la falha exatamente no caminho excepcional que
-- mais importa auditar (ADR-007).
create or replace function audit.capture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_row    jsonb;
begin
  if tg_op = 'DELETE' then
    v_before := to_jsonb(old);
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old);
    v_after  := to_jsonb(new);
  else
    v_after := to_jsonb(new);
  end if;

  v_row := coalesce(v_after, v_before);

  insert into audit.logs (
    tenant_id, actor_person_id, actor_db_role, actor_is_service,
    client_ip, trace_id, operation, entity_schema, entity_table, entity_id, before, after
  )
  values (
    nullif(v_row ->> 'tenant_id', '')::uuid,
    app.current_person_id(),
    current_user,
    app.is_service_role(),
    coalesce(nullif(current_setting('app.client_ip', true), '')::inet, inet_client_addr()),
    nullif(current_setting('app.trace_id', true), ''),
    tg_op,
    tg_table_schema,
    tg_table_name,
    nullif(v_row ->> 'id', '')::uuid,
    v_before,
    v_after
  );

  return null;
end;
$$;

-- Anexar auditoria vira uma linha por tabela, o que sustenta a Regra de Ouro 3.
create or replace function audit.attach(target regclass)
returns void
language plpgsql
as $$
declare
  v_schema text;
  v_table  text;
begin
  -- Schema e nome vêm do catálogo, não de `target::text`: a representação textual de
  -- um regclass omite o schema quando ele está no search_path, o que produziria nomes
  -- de gatilho instáveis e colidiria entre tabelas homônimas de schemas diferentes.
  select n.nspname, c.relname
    into v_schema, v_table
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.oid = target;

  execute format(
    'create trigger %I after insert or update or delete on %s
       for each row execute function audit.capture()',
    format('audit_%s_%s', v_schema, v_table),
    target
  );
end;
$$;

comment on function audit.attach(regclass) is
  'Anexa a captura de auditoria a uma tabela. Chamar em TODA tabela de negócio nova (Regra de Ouro 3).';

-- ---------------------------------------------------------------------------
-- 6. Locatários
-- ---------------------------------------------------------------------------

create table public.tenants (
  id         uuid        primary key default app.uuid_generate_v7(),
  slug       citext      not null unique,
  name       text        not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tenants_touch before update on public.tenants
  for each row execute function app.touch_updated_at();

alter table public.tenants enable row level security;
alter table public.tenants force  row level security;

-- FORCE é o que impede o dono da tabela de ignorar a política. Sem ele, a migração
-- passa e o isolamento não existe para quem roda como dono.
create policy tenants_select on public.tenants
  for select using (app.tenant_visible(id));

-- Provisionamento de locatário é operação de plataforma, não de usuário autenticado.
create policy tenants_service_write on public.tenants
  for all to service_role using (app.is_service_role()) with check (app.is_service_role());

select audit.attach('public.tenants');

-- ---------------------------------------------------------------------------
-- 7. Espaços de serviço (partição departamental)
-- ---------------------------------------------------------------------------

create table public.workspaces (
  id         uuid        primary key default app.uuid_generate_v7(),
  tenant_id  uuid        not null references public.tenants(id) on delete cascade,
  key        citext      not null,
  name       text        not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, key)
);

create index workspaces_tenant_idx on public.workspaces (tenant_id);

create trigger workspaces_touch before update on public.workspaces
  for each row execute function app.touch_updated_at();

alter table public.workspaces enable row level security;
alter table public.workspaces force  row level security;

create policy workspaces_select on public.workspaces
  for select using (app.workspace_visible(tenant_id, id));

create policy workspaces_service_write on public.workspaces
  for all to service_role using (app.is_service_role()) with check (app.is_service_role());

select audit.attach('public.workspaces');

-- ---------------------------------------------------------------------------
-- 8. Pessoas
-- ---------------------------------------------------------------------------

create table public.people (
  id           uuid        primary key default app.uuid_generate_v7(),
  tenant_id    uuid        not null references public.tenants(id) on delete cascade,
  -- Preenchido pelo provisionamento just-in-time do SSO (Épico 17.1). No Supabase
  -- referencia auth.users(id); aqui fica solto para que o schema base rode em
  -- PostgreSQL puro nos testes.
  auth_user_id uuid        unique,
  email        citext      not null,
  full_name    text        not null check (length(trim(full_name)) > 0),
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, email)
);

create index people_tenant_idx on public.people (tenant_id);

create trigger people_touch before update on public.people
  for each row execute function app.touch_updated_at();

alter table public.people enable row level security;
alter table public.people force  row level security;

-- Padrão de tabela com escopo de locatário: uma política por comando, com o mesmo
-- predicado em USING e WITH CHECK.
--
-- Por que WITH CHECK explícito, se o PostgreSQL já reaproveita o USING quando ele é
-- omitido: porque o reaproveitamento acopla leitura e escrita. No dia em que o USING
-- for ampliado — por exemplo, para permitir ler linhas compartilhadas de outro espaço
-- de serviço (Épico 19.4) — a permissão de escrita se ampliaria junto, em silêncio.
-- Declarar os dois separadamente faz com que ampliar leitura seja uma decisão, e
-- ampliar escrita seja outra.
create policy people_select on public.people
  for select using (app.tenant_visible(tenant_id));

create policy people_insert on public.people
  for insert with check (app.tenant_visible(tenant_id));

create policy people_update on public.people
  for update using (app.tenant_visible(tenant_id))
           with check (app.tenant_visible(tenant_id));

create policy people_delete on public.people
  for delete using (app.tenant_visible(tenant_id));

select audit.attach('public.people');

-- ---------------------------------------------------------------------------
-- 9. Participação em espaço de serviço
-- ---------------------------------------------------------------------------

create table public.workspace_members (
  tenant_id    uuid        not null references public.tenants(id) on delete cascade,
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  person_id    uuid        not null references public.people(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, person_id)
);

create index workspace_members_person_idx on public.workspace_members (person_id);
create index workspace_members_tenant_idx on public.workspace_members (tenant_id);

alter table public.workspace_members enable row level security;
alter table public.workspace_members force  row level security;

-- Padrão de tabela com escopo de espaço: usa o predicado de dois eixos.
create policy workspace_members_select on public.workspace_members
  for select using (app.workspace_visible(tenant_id, workspace_id));

create policy workspace_members_service_write on public.workspace_members
  for all to service_role using (app.is_service_role()) with check (app.is_service_role());

select audit.attach('public.workspace_members');

-- ---------------------------------------------------------------------------
-- 10. Privilégios
-- ---------------------------------------------------------------------------
--
-- A RLS restringe LINHAS; o GRANT restringe COMANDOS. São camadas distintas e ambas
-- necessárias: sem GRANT a política nunca é avaliada; sem política o GRANT libera tudo.

grant usage on schema public, app to authenticated, service_role;
grant usage on schema audit to service_role;

grant execute on all functions in schema app to authenticated, service_role;

grant select                         on public.tenants           to authenticated;
grant select                         on public.workspaces        to authenticated;
grant select, insert, update, delete on public.people            to authenticated;
grant select                         on public.workspace_members to authenticated;

grant select, insert, update, delete on all tables in schema public to service_role;

-- A aplicação nunca escreve na trilha diretamente: a inserção ocorre pelo gatilho,
-- que é SECURITY DEFINER. Leitura da própria trilha é funcionalidade de produto e
-- será liberada com política própria quando houver tela que a consuma.
grant select on audit.logs to service_role;
revoke insert, update, delete on audit.logs from authenticated, service_role;
