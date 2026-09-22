import { Client } from "pg";
import {
  CLIENT_IP_SETTING,
  JWT_CLAIMS_SETTING,
  TRACE_ID_SETTING,
  jwtClaimsSchema,
  type RequestContext,
} from "@ifix/shared";

/**
 * Harness de testes de integração contra PostgreSQL REAL (ADR-018).
 *
 * Banco simulado é proibido nesta camada: o que precisa ser exercido são justamente
 * as políticas RLS, que só existem no motor do banco. Um mock provaria apenas que o
 * mock concorda consigo mesmo.
 */

const CONNECTION = {
  host: process.env.PGHOST ?? "127.0.0.1",
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? "ifix_test",
  // Credencial de banco efêmero local/CI, definida em scripts/local-db/bootstrap.sql.
  // Não é segredo: o banco é recriado a cada execução e nunca contém dado real.
  // Ambientes reais injetam PGPASSWORD pela origem única de segredos (Épico 12.6).
  password: process.env.PGPASSWORD ?? "local_dev_only",
};

/** Papéis do banco, espelhando o modelo do Supabase. */
export type DbRole = "authenticated" | "service_role";

export async function connectAs(role: DbRole): Promise<Client> {
  const client = new Client({ ...CONNECTION, user: role });
  await client.connect();
  return client;
}

/** Conexão de superusuário para semear e inspecionar — ignora RLS por definição. */
export async function connectAsOwner(): Promise<Client> {
  const client = new Client({ ...CONNECTION, user: process.env.PGOWNER ?? "postgres" });
  await client.connect();
  return client;
}

/**
 * Aplica o contexto da requisição à sessão — o único ponto onde a aplicação informa
 * ao banco quem está agindo. As claims são validadas antes de virar GUC: enviar uma
 * forma que as funções `app.*` não reconhecem faria o isolamento falhar em silêncio.
 *
 * `set_config` com parâmetro é usado em vez de interpolação em `SET` justamente
 * porque `SET` não aceita bind — e concatenar claims em SQL seria injeção servida.
 */
export async function applyContext(client: Client, context: RequestContext): Promise<void> {
  const claims = jwtClaimsSchema.parse(context.claims);

  await client.query("select set_config($1, $2, false)", [
    JWT_CLAIMS_SETTING,
    JSON.stringify(claims),
  ]);

  if (context.traceId !== undefined) {
    await client.query("select set_config($1, $2, false)", [TRACE_ID_SETTING, context.traceId]);
  }
  if (context.clientIp !== undefined) {
    await client.query("select set_config($1, $2, false)", [CLIENT_IP_SETTING, context.clientIp]);
  }
}

/** Identificadores fixos para que a asserção diga o que falhou, não apenas que falhou. */
export const FIXTURES = {
  acme: {
    tenantId: "00000000-0000-7000-8000-00000000ac00",
    workspaceTi: "00000000-0000-7000-8000-00000000ac01",
    workspaceRh: "00000000-0000-7000-8000-00000000ac02",
    ana: "00000000-0000-7000-8000-00000000acf1",
    rita: "00000000-0000-7000-8000-00000000acf2",
  },
  globex: {
    tenantId: "00000000-0000-7000-8000-00000000bb00",
    workspaceTi: "00000000-0000-7000-8000-00000000bb01",
    bob: "00000000-0000-7000-8000-00000000bbf1",
  },
} as const;

/** Estado limpo e conhecido antes de cada teste. */
export async function seed(owner: Client): Promise<void> {
  await owner.query("truncate public.tenants cascade");
  await owner.query("truncate audit.logs");

  const { acme, globex } = FIXTURES;

  await owner.query(
    `insert into public.tenants (id, slug, name) values ($1,'acme','Acme'), ($2,'globex','Globex')`,
    [acme.tenantId, globex.tenantId],
  );

  await owner.query(
    `insert into public.workspaces (id, tenant_id, key, name) values
       ($1,$2,'ti','TI'), ($3,$2,'rh','Recursos Humanos'), ($4,$5,'ti','TI')`,
    [acme.workspaceTi, acme.tenantId, acme.workspaceRh, globex.workspaceTi, globex.tenantId],
  );

  await owner.query(
    `insert into public.people (id, tenant_id, email, full_name) values
       ($1,$2,'ana@acme.com','Ana Ribeiro'),
       ($3,$2,'rita@acme.com','Rita Alencar'),
       ($4,$5,'bob@globex.com','Bob Cardoso')`,
    [acme.ana, acme.tenantId, acme.rita, globex.bob, globex.tenantId],
  );

  // Ana participa só de TI; Rita só de RH. É o que permite testar o eixo de espaço
  // dentro de um mesmo locatário.
  await owner.query(
    `insert into public.workspace_members (tenant_id, workspace_id, person_id) values
       ($1,$2,$3), ($1,$4,$5)`,
    [acme.tenantId, acme.workspaceTi, acme.ana, acme.workspaceRh, acme.rita],
  );
}

/** Contexto de Ana: locatário Acme, participante apenas do espaço TI. */
export const anaContext: RequestContext = {
  claims: {
    sub: FIXTURES.acme.ana,
    tenant_id: FIXTURES.acme.tenantId,
    workspace_ids: [FIXTURES.acme.workspaceTi],
    role: "authenticated",
  },
};

/** Contexto de Bob: locatário Globex. */
export const bobContext: RequestContext = {
  claims: {
    sub: FIXTURES.globex.bob,
    tenant_id: FIXTURES.globex.tenantId,
    workspace_ids: [FIXTURES.globex.workspaceTi],
    role: "authenticated",
  },
};
