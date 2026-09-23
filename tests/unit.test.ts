import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { AuthError, extractBearerToken, extractTraceId } from "../src/api/src/auth.js";
import { loadConfig } from "../src/api/src/config.js";
import { checkLiveness, checkReadiness, checkStartup } from "../src/api/src/health.js";

/**
 * Caminhos de falha das funções de borda.
 *
 * São justamente os menos exercidos no uso normal e os mais caros quando quebram: uma
 * configuração inválida que passa, um cabeçalho malformado que é aceito, ou uma probe
 * que devolve "ok" para um banco sem schema.
 */

const BASE_ENV = {
  PGPASSWORD: "x",
  JWT_SECRET: "segredo-de-teste-com-mais-de-32-caracteres",
};

describe("loadConfig", () => {
  it("aplica os padrões e converte tipos vindos do ambiente", () => {
    const config = loadConfig({ ...BASE_ENV, PORT: "8080" });
    // Variáveis de ambiente são sempre string; sem coerção, PORT viraria "8080" e o
    // listen falharia de um jeito difícil de ler.
    expect(config.PORT).toBe(8080);
    expect(config.HOST).toBe("0.0.0.0");
    expect(config.NODE_ENV).toBe("development");
    expect(config.SHUTDOWN_TIMEOUT_MS).toBeLessThan(30_000);
  });

  it("recusa a inicialização quando falta o segredo do JWT", () => {
    expect(() => loadConfig({ PGPASSWORD: "x" })).toThrow(/JWT_SECRET/);
  });

  it("recusa segredo de JWT curto demais", () => {
    expect(() => loadConfig({ ...BASE_ENV, JWT_SECRET: "curto" })).toThrow(/32 caracteres/);
  });

  it("recusa porta inválida em vez de cair no padrão silenciosamente", () => {
    expect(() => loadConfig({ ...BASE_ENV, PORT: "não-é-número" })).toThrow(/PORT/);
  });
});

describe("extractBearerToken", () => {
  it("extrai o token de um cabeçalho bem formado", () => {
    expect(extractBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("aceita o esquema em qualquer caixa", () => {
    expect(extractBearerToken("bearer abc")).toBe("abc");
  });

  it("recusa cabeçalho ausente", () => {
    expect(() => extractBearerToken(undefined)).toThrow(AuthError);
  });

  it("recusa esquema diferente de Bearer", () => {
    // Basic auth com credencial válida não pode ser confundido com portador de token.
    expect(() => extractBearerToken("Basic dXNlcjpwYXNz")).toThrow(/Bearer/);
  });

  it("recusa Bearer sem token", () => {
    expect(() => extractBearerToken("Bearer")).toThrow(AuthError);
    expect(() => extractBearerToken("Bearer ")).toThrow(AuthError);
  });
});

describe("extractTraceId", () => {
  it("extrai o trace-id de um traceparent válido", () => {
    expect(extractTraceId("00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01")).toBe(
      "0af7651916cd43dd8448eb211c80319c",
    );
  });

  it("ignora cabeçalho ausente ou malformado", () => {
    expect(extractTraceId(undefined)).toBeUndefined();
    expect(extractTraceId("lixo")).toBeUndefined();
    expect(extractTraceId("00-curto-b7ad6b7169203331-01")).toBeUndefined();
  });

  it("ignora trace-id só de zeros, inválido pela especificação do W3C", () => {
    expect(
      extractTraceId("00-00000000000000000000000000000000-b7ad6b7169203331-01"),
    ).toBeUndefined();
  });
});

describe("checkLiveness", () => {
  it("reporta degradado quando o event loop excede o limiar", () => {
    // Limiar zero força a condição sem precisar travar o processo de verdade.
    expect(checkLiveness(0).ok).toBe(false);
  });

  it("reporta ok sob limiar folgado", () => {
    expect(checkLiveness(60_000).ok).toBe(true);
  });
});

describe("probes contra banco em estado inesperado", () => {
  const pools: Pool[] = [];
  const track = (pool: Pool): Pool => {
    pools.push(pool);
    return pool;
  };

  afterAll(async () => {
    await Promise.all(pools.map((p) => p.end()));
  });

  it("startup acusa schema ausente em banco sem migração", async () => {
    // O banco `postgres` existe e responde, mas não tem as migrações aplicadas — é
    // exatamente o cenário de aplicação implantada antes da migração, que um simples
    // `select 1` reportaria como saudável.
    const pool = track(
      new Pool({
        host: process.env.PGHOST ?? "127.0.0.1",
        port: Number(process.env.PGPORT ?? 5432),
        database: "postgres",
        user: "postgres",
        password: process.env.PGSUPERPASSWORD ?? "local_dev_only",
      }),
    );

    const result = await checkStartup(pool);
    expect(result.ok).toBe(false);
    expect(result.detail.missing).toEqual(
      expect.arrayContaining(["function app.tenant_visible", "table audit.logs"]),
    );
  });

  it("readiness acusa indisponibilidade sem lançar exceção", async () => {
    // A probe precisa responder 503, e não estourar: uma exceção não tratada aqui
    // derrubaria o processo justamente quando o Kubernetes está perguntando se ele
    // ainda serve tráfego.
    const pool = track(
      new Pool({
        host: "127.0.0.1",
        port: 1, // porta sem serviço
        database: "ifix_test",
        user: "authenticated",
        password: "irrelevante",
        connectionTimeoutMillis: 1_000,
      }),
    );

    const result = await checkReadiness(pool);
    expect(result.ok).toBe(false);
    expect(result.detail).toHaveProperty("error");
  });
});
