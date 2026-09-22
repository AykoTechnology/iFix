-- Bootstrap de banco LOCAL / CI.
--
-- No Supabase, estes papéis e extensões já existem. Este arquivo os recria em um
-- PostgreSQL puro para que as migrações de `supabase/migrations/` rodem sem alteração
-- e para que os testes de vazamento (ADR-018) exerçam as políticas RLS de verdade.
--
-- NÃO é migração: nunca é aplicado em ambiente Supabase.

-- Extensões usadas pelo schema base.
create extension if not exists citext;

-- Papéis espelhando o modelo do Supabase.
--
-- A distinção importa para a RLS: o dono da tabela a ignora por padrão, e é por isso
-- que toda tabela de negócio usa FORCE ROW LEVEL SECURITY (ver migração 0001).
-- Papéis são objetos de CLUSTER, não de banco: `drop database` não os recria nem
-- restaura seus atributos. Por isso o bloco abaixo cria quando falta E reafirma os
-- atributos sempre — um `if not exists` isolado deixaria um papel que recebeu
-- BYPASSRLS em um experimento local assim para sempre, e a suíte de vazamento
-- passaria a ficar verde sem provar nada.
do $$
declare
  papel text;
begin
  foreach papel in array array['ifix_migrator', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = papel) then
      execute format('create role %I', papel);
    end if;

    -- NOBYPASSRLS e NOSUPERUSER são a razão de existir desta reafirmação: sem eles
    -- a RLS simplesmente não se aplica, e todo o isolamento vira decoração.
    execute format(
      'alter role %I nosuperuser nobypassrls nocreatedb nocreaterole noinherit login password %L',
      papel, 'local_dev_only'
    );
  end loop;
end
$$;

-- Falha ruidosamente se algum papel escapou da reafirmação. Um banco de teste
-- silenciosamente permissivo é pior que um banco quebrado.
do $$
declare
  permissivos text;
begin
  select string_agg(rolname, ', ')
    into permissivos
  from pg_roles
  where rolname in ('ifix_migrator', 'authenticated', 'service_role')
    and (rolbypassrls or rolsuper);

  if permissivos is not null then
    raise exception 'papéis com BYPASSRLS/SUPERUSER após bootstrap: %', permissivos;
  end if;
end
$$;

grant connect on database ifix_dev to authenticated, service_role;
