-- ===========================================================================
-- Primeira fila pgmq e o padrão de referência de consumo idempotente.
--
-- ADR-002 estabelece duas coisas que esta migração torna mecânicas:
--
--   1. A mutação de negócio e o enfileiramento ocorrem no MESMO commit. É o que
--      elimina a classe inteira de defeitos "gravou no banco mas não publicou o
--      evento" — `pgmq.send` é uma função SQL, então participa da transação.
--
--   2. `pgmq` entrega at-least-once, nunca exactly-once. A idempotência do
--      consumidor é Regra de Ouro (§ 10.1), não boa prática: a mesma mensagem SERÁ
--      entregue duas vezes em algum momento, e o sistema precisa se comportar como
--      se tivesse sido entregue uma.
--
-- Sobre o nome: a § 5.3 da especificação lista a fila como `pgmq_notifications`. O
-- próprio pgmq prefixa a tabela subjacente com `q_`, então usar o prefixo `pgmq_`
-- no nome lógico produziria `pgmq.q_pgmq_notifications`. A fila se chama
-- `notifications`; o prefixo na especificação indica a tecnologia, não o nome.
-- ===========================================================================

create extension if not exists pgmq;

-- ---------------------------------------------------------------------------
-- 1. A fila e sua DLQ
-- ---------------------------------------------------------------------------

-- Fila de notificações (Épico 10.1). É a primeira porque qualquer evento de
-- domínio publica nela, então o padrão que ela estabelece é o mais reutilizado.
select pgmq.create('notifications');

-- DLQ separada, e não `pgmq.archive`: o arquivo guarda o que foi processado com
-- sucesso; a DLQ guarda o que falhou. Misturar os dois torna impossível responder
-- "o que deixou de acontecer" — que é a única pergunta que importa numa DLQ
-- (Épico 12.5: mensagem na DLQ é automação de negócio que silenciosamente não
-- aconteceu, e isso precisa acordar alguém).
select pgmq.create('notifications_dlq');

-- ---------------------------------------------------------------------------
-- 2. Livro-razão de idempotência
-- ---------------------------------------------------------------------------

-- O consumidor não decide se já processou olhando o efeito colateral: decide
-- tentando registrar o evento aqui. `insert ... on conflict do nothing` é atômico,
-- então duas entregas concorrentes da mesma mensagem produzem exatamente um
-- vencedor — sem lock explícito e sem janela de corrida entre o "já processei?" e
-- o "processei".
create table public.processed_events (
  tenant_id    uuid        not null references public.tenants(id) on delete cascade,
  -- Chave de idempotência da § 5.3. Para `notifications` é o `event_id` que o
  -- produtor gera no momento da mutação — nunca um identificador atribuído pela
  -- fila, que muda a cada reentrega.
  event_id     uuid        not null,
  queue_name   text        not null check (length(trim(queue_name)) > 0),
  processed_at timestamptz not null default now(),
  -- Guardado para depuração: liga a linha ao rastro distribuído que a produziu,
  -- atravessando a fronteira da fila (ADR-008).
  trace_id     text,
  primary key (tenant_id, queue_name, event_id)
);

create index processed_events_processed_at_idx
  on public.processed_events (processed_at);

alter table public.processed_events enable row level security;
alter table public.processed_events force  row level security;

-- O worker não é privilegiado. Ele lê a fila como `service_role`, mas o trabalho de
-- negócio roda sob o locatário que a mensagem declara — as mesmas políticas que
-- valem para a API. Um worker que ignora RLS seria uma porta lateral para toda a
-- arquitetura de isolamento do ADR-003.
create policy processed_events_select on public.processed_events
  for select using (app.tenant_visible(tenant_id));

create policy processed_events_insert on public.processed_events
  for insert with check (app.tenant_visible(tenant_id));

select audit.attach('public.processed_events');

-- ---------------------------------------------------------------------------
-- 3. Publicação transacional
-- ---------------------------------------------------------------------------

-- Publicar pela função, e não chamando `pgmq.send` direto da aplicação, existe por
-- um motivo: o envelope. Locatário, evento e rastro precisam viajar JUNTO com a
-- carga, ou o consumidor não tem como restaurar o contexto — e sem contexto ele
-- não consegue nem aplicar RLS nem correlacionar o rastro.
create or replace function app.publish_event(
  queue_name text,
  event_type text,
  payload    jsonb,
  -- `default` só vale quando o argumento é OMITIDO. Um chamador que passe NULL
  -- explicitamente produziria um envelope sem chave de idempotência, e o consumidor
  -- perderia a única proteção contra entrega repetida. Por isso há `coalesce`
  -- abaixo, e não apenas o default: a garantia não pode depender de quem chama.
  event_id   uuid default null
)
returns bigint
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  tenant uuid := app.current_tenant_id();
  -- Quem causou o evento viaja com ele. Sem isso a trilha de auditoria atribuiria o
  -- efeito assíncrono ao worker, e a pergunta "quem mudou isto" passaria a ter como
  -- resposta "um processo" para tudo o que acontece depois de uma fila.
  actor  uuid := app.current_person_id();
  msg_id bigint;
begin
  -- Sem locatário no contexto não há como o consumidor aplicar RLS depois. Falhar
  -- aqui é o comportamento correto: uma mensagem órfã só seria descoberta quando o
  -- worker já não tivesse como decidir de quem ela é.
  if tenant is null then
    raise exception 'publish_event exige contexto de locatário (app.tenant_id)'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into msg_id from pgmq.send(
    queue_name,
    jsonb_build_object(
      'event_id',   coalesce(event_id, app.uuid_generate_v7()),
      'event_type', event_type,
      'tenant_id',  tenant,
      'actor_id',   actor,
      'trace_id',   nullif(current_setting('app.trace_id', true), ''),
      'payload',    payload
    )
  );

  return msg_id;
end;
$$;

comment on function app.publish_event(text, text, jsonb, uuid) is
  'Publica um evento na fila dentro da transação corrente (ADR-002). O envelope '
  'carrega locatário, event_id e trace_id para que o consumidor restaure contexto '
  'de RLS e de rastro (ADR-003, ADR-008).';

-- ---------------------------------------------------------------------------
-- 4. Permissões
-- ---------------------------------------------------------------------------

grant usage on schema pgmq to service_role, authenticated;
grant select, insert, update, delete on all tables in schema pgmq to service_role;
grant execute on all functions in schema pgmq to service_role, authenticated;

-- Cada fila do pgmq tem uma sequência para o `msg_id`, e `pgmq.send` usa `nextval`.
-- Sem USAGE nela o enfileiramento falha com "permission denied for sequence" — e
-- falha no PRODUTOR, ou seja, dentro da transação de negócio.
--
-- Vale para as filas que existem AGORA: os GRANTs em massa não alcançam objetos
-- criados depois. A migração que criar uma fila nova concede as permissões dela.
grant usage, select on all sequences in schema pgmq to service_role, authenticated;

-- `authenticated` publica (a mutação de negócio acontece no contexto do usuário),
-- mas não consome: consumir exige apagar da fila e mover para a DLQ, que é
-- trabalho de worker.
grant execute on function app.publish_event(text, text, jsonb, uuid)
  to authenticated, service_role;

grant select, insert on public.processed_events to authenticated, service_role;
