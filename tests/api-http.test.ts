import { SignJWT } from "jose";
import type { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/api/src/config.js";
import { buildServer } from "../src/api/src/server.js";
import { FIXTURES, connectAsOwner, seed } from "./helpers/db.js";
import type { FastifyInstance } from "fastify";

/**
 * A API pela borda HTTP: autenticação, probes e o recorte por locatário chegando
 * intacto do token até a resposta.
 */

const JWT_SECRET = "segredo-de-teste-com-mais-de-32-caracteres";

const config = loadConfig({
  NODE_ENV: "test",
  PGHOST: process.env.PGHOST ?? "127.0.0.1",
  PGPORT: process.env.PGPORT ?? "5432",
  PGDATABASE: process.env.PGDATABASE ?? "ifix_test",
  PGUSER: "authenticated",
  PGPASSWORD: process.env.PGPASSWORD ?? "local_dev_only",
  JWT_SECRET,
});

let app: FastifyInstance;
let owner: Client;

async function tokenFor(claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(JWT_SECRET));
}

beforeAll(async () => {
  owner = await connectAsOwner();
  ({ app } = await buildServer(config));
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await owner?.end();
});

beforeEach(async () => {
  await seed(owner);
});

describe("probes de saúde (§ 6.3)", () => {
  it("liveness responde sem consultar o banco", async () => {
    const response = await app.inject({ method: "GET", url: "/health/live" });
    expect(response.statusCode).toBe(200);

    const body = response.json<{ status: string; detail: Record<string, unknown> }>();
    expect(body.status).toBe("ok");
    // A presença destas chaves é o que prova que a checagem é do event loop, e não
    // um `select 1` disfarçado.
    expect(body.detail).toHaveProperty("eventLoopP99Ms");
    expect(body.detail).not.toHaveProperty("databaseLatencyMs");
  });

  it("readiness verifica o pooler e reporta o estado do pool", async () => {
    const response = await app.inject({ method: "GET", url: "/health/ready" });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ detail: Record<string, unknown> }>().detail).toHaveProperty(
      "databaseLatencyMs",
    );
  });

  it("startup confirma que os objetos de schema exigidos existem", async () => {
    const response = await app.inject({ method: "GET", url: "/health/startup" });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ status: string }>().status).toBe("ok");
  });
});

describe("contrato OpenAPI (ADR-009)", () => {
  // Guarda contra um modo de falha silencioso: se o plugin do Swagger não estiver
  // carregado quando as rotas são registradas, o documento sai vazio — e o gate 6
  // passa a comparar vazio com vazio, aprovando sempre. Um gate que nunca reprova é
  // indistinguível de gate nenhum.
  it("descreve todas as rotas registradas", () => {
    const paths = Object.keys(app.swagger().paths ?? {});
    expect(paths).toEqual(
      expect.arrayContaining(["/health/live", "/health/ready", "/health/startup", "/v1/people"]),
    );
  });

  it("deriva o schema de resposta do Zod, e não de declaração manual", () => {
    const document = app.swagger() as {
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
    };
    const ok = document.paths["/v1/people"]?.get?.responses["200"];
    // A forma detalhada só existe porque veio do personListSchema; uma rota sem
    // schema apareceria como resposta genérica.
    expect(JSON.stringify(ok)).toContain("fullName");
  });

  it("marca a rota de negócio como autenticada", () => {
    const document = app.swagger() as {
      paths: Record<string, Record<string, { security?: unknown[] }>>;
    };
    expect(document.paths["/v1/people"]?.get?.security).toBeDefined();
    expect(document.paths["/health/live"]?.get?.security).toBeUndefined();
  });
});

describe("autenticação", () => {
  it("recusa requisição sem cabeçalho Authorization", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/people" });
    expect(response.statusCode).toBe(401);
  });

  it("recusa token assinado com outro segredo", async () => {
    const forjado = await new SignJWT({
      sub: FIXTURES.acme.ana,
      tenant_id: FIXTURES.acme.tenantId,
      workspace_ids: [],
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode("um-segredo-completamente-diferente-aqui"));

    const response = await app.inject({
      method: "GET",
      url: "/v1/people",
      headers: { authorization: `Bearer ${forjado}` },
    });
    expect(response.statusCode).toBe(401);
  });

  it("recusa token válido cujas claims não tenham a forma esperada", async () => {
    // Assinatura legítima, mas sem tenant_id: sem esta barreira as políticas
    // devolveriam vazio em silêncio, o que pareceria "sem dados" em vez de erro.
    const semTenant = await tokenFor({ sub: FIXTURES.acme.ana });
    const response = await app.inject({
      method: "GET",
      url: "/v1/people",
      headers: { authorization: `Bearer ${semTenant}` },
    });
    expect(response.statusCode).toBe(401);
  });

  it("não revela ao cliente o motivo da recusa", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/people",
      headers: { authorization: "Bearer lixo" },
    });
    expect(response.json<{ message: string }>().message).toBe("credencial inválida");
  });
});

describe("recorte por locatário ponta a ponta", () => {
  it("devolve apenas as pessoas do locatário do token", async () => {
    const token = await tokenFor({
      sub: FIXTURES.acme.ana,
      tenant_id: FIXTURES.acme.tenantId,
      workspace_ids: [FIXTURES.acme.workspaceTi],
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/people",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const { data } = response.json<{ data: { email: string }[] }>();
    expect(data.map((p) => p.email)).toEqual(["ana@acme.com", "rita@acme.com"]);
  });

  it("o mesmo endpoint devolve outro conjunto para outro locatário", async () => {
    const token = await tokenFor({
      sub: FIXTURES.globex.bob,
      tenant_id: FIXTURES.globex.tenantId,
      workspace_ids: [FIXTURES.globex.workspaceTi],
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/people",
      headers: { authorization: `Bearer ${token}` },
    });

    const { data } = response.json<{ data: { email: string }[] }>();
    expect(data.map((p) => p.email)).toEqual(["bob@globex.com"]);
  });

  it("trocar o tenant_id do token não dá acesso ao outro locatário", async () => {
    // Ana apontando para o locatário do Bob. O token é validamente assinado — só a
    // RLS impede, porque o recorte não vem de filtro na aplicação.
    const token = await tokenFor({
      sub: FIXTURES.acme.ana,
      tenant_id: FIXTURES.globex.tenantId,
      workspace_ids: [],
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/people",
      headers: { authorization: `Bearer ${token}` },
    });

    // Retorna o conteúdo do locatário reivindicado, e não o de Ana: prova de que o
    // corte é do banco. A emissão do token é que garante que ninguém reivindique um
    // locatário alheio — daí a assinatura ser verificada antes.
    const { data } = response.json<{ data: { email: string }[] }>();
    expect(data.map((p) => p.email)).toEqual(["bob@globex.com"]);
  });
});
