import type { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  FIXTURES,
  anaContext,
  applyContext,
  connectAs,
  connectAsOwner,
  seed,
} from "./helpers/db.js";

/**
 * Trilha de auditoria imutável (ADR-007, Regra de Ouro 3).
 *
 * O que estes testes protegem: a captura é por gatilho de banco, não por chamada de
 * aplicação. Auditoria que depende de o desenvolvedor lembrar de chamá-la falha
 * exatamente no caminho excepcional que mais importa auditar.
 */

let owner: Client;
let ana: Client;

beforeAll(async () => {
  owner = await connectAsOwner();
  ana = await connectAs("authenticated");
});

afterAll(async () => {
  await ana?.end();
  await owner?.end();
});

beforeEach(async () => {
  await seed(owner);
  await applyContext(ana, { ...anaContext, traceId: "4bf92f3577b34da6a3ce929d0e0e4736" });
});

describe("captura automática", () => {
  it("registra INSERT sem que a aplicação precise pedir", async () => {
    await ana.query(`insert into public.people (tenant_id, email, full_name) values ($1,$2,$3)`, [
      FIXTURES.acme.tenantId,
      "novo@acme.com",
      "Pessoa Nova",
    ]);

    const { rows } = await owner.query<{ operation: string; after: { email: string } }>(
      `select operation, after from audit.logs
       where entity_table = 'people' and after->>'email' = 'novo@acme.com'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.operation).toBe("INSERT");
    expect(rows[0]?.after.email).toBe("novo@acme.com");
  });

  it("registra pre-image e post-image no UPDATE", async () => {
    await ana.query("update public.people set full_name = $1 where id = $2", [
      "Ana R. Ribeiro",
      FIXTURES.acme.ana,
    ]);

    const { rows } = await owner.query<{ antes: string; depois: string }>(
      `select before->>'full_name' as antes, after->>'full_name' as depois
       from audit.logs where operation = 'UPDATE' and entity_id = $1`,
      [FIXTURES.acme.ana],
    );
    expect(rows[0]).toEqual({ antes: "Ana Ribeiro", depois: "Ana R. Ribeiro" });
  });

  it("registra pre-image no DELETE", async () => {
    await ana.query("delete from public.people where id = $1", [FIXTURES.acme.rita]);

    const { rows } = await owner.query<{ antes: string; depois: string | null }>(
      `select before->>'email' as antes, after->>'email' as depois
       from audit.logs where operation = 'DELETE' and entity_id = $1`,
      [FIXTURES.acme.rita],
    );
    expect(rows[0]?.antes).toBe("rita@acme.com");
    expect(rows[0]?.depois).toBeNull();
  });
});

describe("atribuição de autoria e correlação", () => {
  it("grava o ator a partir das claims, não de parâmetro da aplicação", async () => {
    await ana.query("update public.people set full_name = $1 where id = $2", [
      "Ana Editada",
      FIXTURES.acme.ana,
    ]);

    const { rows } = await owner.query<{ actor_person_id: string; tenant_id: string }>(
      `select actor_person_id, tenant_id from audit.logs
       where operation = 'UPDATE' and entity_id = $1`,
      [FIXTURES.acme.ana],
    );
    expect(rows[0]?.actor_person_id).toBe(FIXTURES.acme.ana);
    expect(rows[0]?.tenant_id).toBe(FIXTURES.acme.tenantId);
  });

  it("propaga o trace_id, unindo a pergunta técnica à pergunta de negócio", async () => {
    // É isto que permite partir de "por que este chamado mudou de estado" e chegar
    // ao trace distribuído que executou a mudança (ADR-008).
    await ana.query("update public.people set full_name = $1 where id = $2", [
      "Ana Rastreada",
      FIXTURES.acme.ana,
    ]);

    const { rows } = await owner.query<{ trace_id: string }>(
      `select trace_id from audit.logs where operation = 'UPDATE' and entity_id = $1`,
      [FIXTURES.acme.ana],
    );
    expect(rows[0]?.trace_id).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
  });
});

describe("imutabilidade", () => {
  it("rejeita UPDATE na trilha mesmo para superusuário", async () => {
    // A revogação de privilégio não bastaria: um papel que receba permissão por
    // engano ainda conseguiria alterar. O gatilho não distingue papel.
    await expect(owner.query("update audit.logs set after = '{}'::jsonb")).rejects.toThrow(
      /append-only/i,
    );
  });

  it("rejeita DELETE na trilha mesmo para superusuário", async () => {
    await expect(owner.query("delete from audit.logs")).rejects.toThrow(/append-only/i);
  });

  it("papel da aplicação não tem privilégio de escrita direta na trilha", async () => {
    // A escrita legítima acontece pelo gatilho, que é SECURITY DEFINER.
    await expect(
      ana.query(
        `insert into audit.logs (operation, entity_schema, entity_table)
         values ('INSERT','public','forjado')`,
      ),
    ).rejects.toThrow(/permission denied|permissão negada/i);
  });
});
