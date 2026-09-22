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
 * Testes de vazamento em DOIS EIXOS (DoD 10, gates 4 e 5 da esteira).
 *
 * São obrigatórios para toda tabela de negócio nova. Não provam que a aplicação
 * filtra corretamente — provam que o banco impede, mesmo que a aplicação erre.
 * Essa distinção é o ponto inteiro do ADR-003.
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
  await applyContext(ana, anaContext);
});

describe("eixo 1 — isolamento entre locatários (ADR-003)", () => {
  it("leitura devolve apenas pessoas do próprio locatário", async () => {
    const { rows } = await ana.query<{ email: string }>(
      "select email from public.people order by email",
    );
    expect(rows.map((r) => r.email)).toEqual(["ana@acme.com", "rita@acme.com"]);
  });

  it("leitura devolve apenas o próprio locatário", async () => {
    const { rows } = await ana.query<{ slug: string }>("select slug from public.tenants");
    expect(rows.map((r) => r.slug)).toEqual(["acme"]);
  });

  it("consulta direta por id de outro locatário devolve vazio, não erro", async () => {
    // O comportamento correto é a linha não existir para quem pergunta. Devolver erro
    // vazaria a informação de que o registro existe.
    const { rows } = await ana.query("select * from public.people where id = $1", [
      FIXTURES.globex.bob,
    ]);
    expect(rows).toHaveLength(0);
  });

  it("INSERT para outro locatário é rejeitado pelo WITH CHECK", async () => {
    await expect(
      ana.query(`insert into public.people (tenant_id, email, full_name) values ($1,$2,$3)`, [
        FIXTURES.globex.tenantId,
        "intruso@globex.com",
        "Intruso",
      ]),
    ).rejects.toThrow(/row-level security/i);
  });

  it("UPDATE em linha de outro locatário não afeta nenhuma linha", async () => {
    const result = await ana.query("update public.people set full_name = $1 where email = $2", [
      "Comprometido",
      "bob@globex.com",
    ]);
    expect(result.rowCount).toBe(0);

    const { rows } = await owner.query<{ full_name: string }>(
      "select full_name from public.people where id = $1",
      [FIXTURES.globex.bob],
    );
    expect(rows[0]?.full_name).toBe("Bob Cardoso");
  });

  it("DELETE em linha de outro locatário não afeta nenhuma linha", async () => {
    const result = await ana.query("delete from public.people where email = $1", [
      "bob@globex.com",
    ]);
    expect(result.rowCount).toBe(0);

    const { rows } = await owner.query("select 1 from public.people where id = $1", [
      FIXTURES.globex.bob,
    ]);
    expect(rows).toHaveLength(1);
  });

  it("mover a própria linha para outro locatário é rejeitado", async () => {
    // Exfiltração por UPDATE: a linha é legível, então o USING permite alcançá-la —
    // o que barra a gravação é o WITH CHECK avaliado sobre a linha NOVA.
    await expect(
      ana.query("update public.people set tenant_id = $1 where id = $2", [
        FIXTURES.globex.tenantId,
        FIXTURES.acme.ana,
      ]),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe("eixo 2 — isolamento entre espaços de serviço (ADR-012)", () => {
  it("leitura devolve apenas espaços de que a pessoa participa", async () => {
    // Ana pertence a TI; RH é do mesmo locatário e ainda assim não aparece.
    const { rows } = await ana.query<{ key: string }>("select key from public.workspaces");
    expect(rows.map((r) => r.key)).toEqual(["ti"]);
  });

  it("participação em espaço alheio do mesmo locatário não é visível", async () => {
    const { rows } = await ana.query("select * from public.workspace_members");
    expect(rows).toHaveLength(1);
  });

  it("espaço homônimo de outro locatário permanece invisível", async () => {
    // Acme e Globex têm ambos um espaço com chave 'ti'. Colidir chave não pode
    // atravessar locatário.
    const { rows } = await ana.query("select * from public.workspaces where id = $1", [
      FIXTURES.globex.workspaceTi,
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe("sessão sem claims", () => {
  it("não enxerga nada quando não há contexto aplicado", async () => {
    const anonimo = await connectAs("authenticated");
    try {
      // Ausência de claims não pode significar acesso irrestrito. É o estado de uma
      // conexão recém-tirada do pool antes de a aplicação informar quem está agindo.
      const pessoas = await anonimo.query("select * from public.people");
      const locatarios = await anonimo.query("select * from public.tenants");
      expect(pessoas.rows).toHaveLength(0);
      expect(locatarios.rows).toHaveLength(0);
    } finally {
      await anonimo.end();
    }
  });
});

describe("garantias estruturais do padrão de referência", () => {
  it("toda tabela de negócio tem RLS habilitada E forçada", async () => {
    // FORCE é o que sujeita o próprio dono da tabela à política. Sem ele a migração
    // passa e o isolamento simplesmente não existe para quem roda como dono.
    const { rows } = await owner.query<{ relname: string; enabled: boolean; forced: boolean }>(`
      select relname, relrowsecurity as enabled, relforcerowsecurity as forced
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    `);

    expect(rows.length).toBeGreaterThan(0);
    const desprotegidas = rows.filter((r) => !r.enabled || !r.forced).map((r) => r.relname);
    expect(desprotegidas).toEqual([]);
  });

  it("toda tabela de negócio tem gatilho de auditoria anexado", async () => {
    const { rows } = await owner.query<{ relname: string }>(`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and not exists (
          select 1 from pg_trigger t
          where t.tgrelid = c.oid and not t.tgisinternal
            and t.tgfoid = 'audit.capture'::regproc
        )
    `);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("toda política de escrita declara WITH CHECK explicitamente", async () => {
    // O PostgreSQL reaproveita o USING como WITH CHECK quando este é omitido, o que
    // acopla leitura e escrita: ampliar o USING ampliaria a permissão de gravar junto,
    // em silêncio. Exigir a declaração explícita mantém as duas decisões separadas.
    const { rows } = await owner.query<{ tabela: string; politica: string; comando: string }>(`
      select c.relname as tabela, p.polname as politica, p.polcmd::text as comando
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and p.polcmd in ('a', 'w', '*')   -- INSERT, UPDATE, ALL
        and p.polwithcheck is null
    `);
    expect(rows).toEqual([]);
  });

  it("nenhum papel de aplicação possui BYPASSRLS", async () => {
    const { rows } = await owner.query<{ rolname: string }>(`
      select rolname from pg_roles
      where rolname in ('authenticated','service_role') and (rolbypassrls or rolsuper)
    `);
    expect(rows.map((r) => r.rolname)).toEqual([]);
  });
});
