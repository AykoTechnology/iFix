import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { withRequestContext } from "../src/shared/src/db-context.js";
import { FIXTURES, anaContext, bobContext, connectAsOwner, seed } from "./helpers/db.js";

/**
 * O contexto de requisição aplicado ao banco (ADR-003, ADR-007).
 *
 * O teste central deste arquivo é o de vazamento no pool. Ele protege contra uma
 * falha que não aparece em teste unitário, não aparece em revisão de código e só se
 * manifesta sob concorrência em produção — quando já é uma quebra de isolamento.
 */

let pool: Pool;
let owner: Client;

beforeAll(async () => {
  owner = await connectAsOwner();
  pool = new Pool({
    host: process.env.PGHOST ?? "127.0.0.1",
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? "ifix_test",
    user: "authenticated",
    password: process.env.PGPASSWORD ?? "local_dev_only",
    // Uma única conexão força todas as requisições a compartilharem a mesma sessão —
    // é exatamente a condição em que o vazamento apareceria.
    max: 1,
  });
});

afterAll(async () => {
  await pool?.end();
  await owner?.end();
});

beforeEach(async () => {
  await seed(owner);
});

describe("isolamento do contexto no pool de conexões", () => {
  it("não vaza contexto entre requisições na mesma conexão", async () => {
    // Requisição 1: Ana, do locatário Acme.
    const primeira = await withRequestContext(pool, anaContext, async (client) => {
      const { rows } = await client.query<{ email: string }>(
        "select email from public.people order by email",
      );
      return rows.map((r) => r.email);
    });
    expect(primeira).toEqual(["ana@acme.com", "rita@acme.com"]);

    // Requisição 2: Bob, do locatário Globex, na MESMA conexão do pool.
    const segunda = await withRequestContext(pool, bobContext, async (client) => {
      const { rows } = await client.query<{ email: string }>("select email from public.people");
      return rows.map((r) => r.email);
    });
    expect(segunda).toEqual(["bob@globex.com"]);

    // Requisição 3: sem contexto aplicado, direto na conexão. Se as GUCs fossem de
    // sessão em vez de transação, as claims de Bob ainda estariam aqui.
    const client = await pool.connect();
    try {
      const { rows } = await client.query("select email from public.people");
      expect(rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });

  it("descarta o contexto mesmo quando a transação falha", async () => {
    await expect(
      withRequestContext(pool, anaContext, async (client) => {
        await client.query("select 1");
        throw new Error("falha simulada no meio da unidade de trabalho");
      }),
    ).rejects.toThrow(/falha simulada/);

    // O ROLLBACK precisa levar as GUCs junto; caso contrário a conexão volta ao pool
    // contaminada justamente pelo caminho de erro, que é o menos testado.
    const client = await pool.connect();
    try {
      const { rows } = await client.query("select email from public.people");
      expect(rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });

  it("reverte a escrita quando a unidade de trabalho falha", async () => {
    await expect(
      withRequestContext(pool, anaContext, async (client) => {
        await client.query(
          "insert into public.people (tenant_id, email, full_name) values ($1,$2,$3)",
          [FIXTURES.acme.tenantId, "efemero@acme.com", "Efêmero"],
        );
        throw new Error("falha após a escrita");
      }),
    ).rejects.toThrow(/falha após a escrita/);

    const { rows } = await owner.query("select 1 from public.people where email = $1", [
      "efemero@acme.com",
    ]);
    expect(rows).toHaveLength(0);
  });

  it("rejeita claims em forma inválida antes de tocar o banco", async () => {
    await expect(
      withRequestContext(
        pool,
        // @ts-expect-error — verificando a barreira de runtime, não a de tipos
        { claims: { sub: "não-é-uuid", tenant_id: FIXTURES.acme.tenantId } },
        () => Promise.resolve("nunca deveria chegar aqui"),
      ),
    ).rejects.toThrow();
  });
});

describe("correlação com a trilha de auditoria", () => {
  it("propaga o trace_id da requisição até o registro de auditoria", async () => {
    const traceId = "0af7651916cd43dd8448eb211c80319c";

    await withRequestContext(pool, { ...anaContext, traceId }, async (client) => {
      await client.query("update public.people set full_name = $1 where id = $2", [
        "Ana via API",
        FIXTURES.acme.ana,
      ]);
    });

    const { rows } = await owner.query<{ trace_id: string; actor_person_id: string }>(
      `select trace_id, actor_person_id from audit.logs
       where operation = 'UPDATE' and entity_id = $1`,
      [FIXTURES.acme.ana],
    );
    expect(rows[0]?.trace_id).toBe(traceId);
    expect(rows[0]?.actor_person_id).toBe(FIXTURES.acme.ana);
  });
});
