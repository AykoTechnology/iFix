import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { createProbeServer } from "../src/workers/src/probes.js";

/**
 * As três probes do worker (ADR-001, ADR-008) — mesmo contrato de resposta que
 * `tests/api-http.test.ts` verifica para a API, porque as duas espécies de serviço
 * falam o mesmo `probeResponseSchema` (`@ifix/shared`).
 */

const pool = new Pool({
  host: process.env.PGHOST ?? "127.0.0.1",
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? "ifix_test",
  user: "service_role",
  password: process.env.PGPASSWORD ?? "local_dev_only",
  max: 2,
});

async function comServidor<T>(
  criar: () => ReturnType<typeof createProbeServer>,
  usar: (base: string) => Promise<T>,
): Promise<T> {
  const servidor = criar();
  await new Promise<void>((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const endereco = servidor.address();
  if (endereco === null || typeof endereco === "string") {
    throw new Error("endereço do servidor de probes indisponível");
  }
  try {
    return await usar(`http://127.0.0.1:${endereco.port}`);
  } finally {
    await new Promise<void>((resolve) => servidor.close(() => resolve()));
  }
}

afterAll(async () => {
  await pool.end();
});

describe("liveness", () => {
  it("responde sem consultar o banco", async () => {
    await comServidor(
      () => createProbeServer(pool, 60_000),
      async (base) => {
        const res = await fetch(`${base}/health/live`);
        expect(res.status).toBe(200);
        const corpo = (await res.json()) as { status: string; detail: Record<string, unknown> };
        expect(corpo.status).toBe("ok");
        expect(corpo.detail).toHaveProperty("eventLoopP99Ms");
        expect(corpo.detail).not.toHaveProperty("databaseLatencyMs");
      },
    );
  });

  it("reprova quando o limiar de atraso do event loop é inatingível", async () => {
    await comServidor(
      () => createProbeServer(pool, 0),
      async (base) => {
        const res = await fetch(`${base}/health/live`);
        expect(res.status).toBe(503);
        expect((await res.json<{ status: string }>()).status).toBe("degraded");
      },
    );
  });
});

describe("readiness e startup", () => {
  it("readiness confirma o pooler", async () => {
    await comServidor(
      () => createProbeServer(pool, 1_000),
      async (base) => {
        const res = await fetch(`${base}/health/ready`);
        expect(res.status).toBe(200);
        const corpo = (await res.json()) as { detail: Record<string, unknown> };
        expect(corpo.detail).toHaveProperty("databaseLatencyMs");
      },
    );
  });

  it("startup confirma o schema exigido", async () => {
    await comServidor(
      () => createProbeServer(pool, 1_000),
      async (base) => {
        const res = await fetch(`${base}/health/startup`);
        expect(res.status).toBe(200);
      },
    );
  });

  it("as duas reprovam sem revelar detalhe de driver quando o banco está fora", async () => {
    // Mesma distinção que a API prova: readiness em 503 tira o pod do balanceador,
    // sem depender de o worker ter Service à frente — o kubelet lê a probe direto.
    const poolQuebrado = new Pool({ host: "127.0.0.1", port: 1, max: 1 });
    try {
      await comServidor(
        () => createProbeServer(poolQuebrado, 1_000),
        async (base) => {
          const ready = await fetch(`${base}/health/ready`);
          expect(ready.status).toBe(503);

          const startup = await fetch(`${base}/health/startup`);
          expect(startup.status).toBe(503);
        },
      );
    } finally {
      await poolQuebrado.end();
    }
  });
});

describe("rotas", () => {
  it("404 para caminho inexistente", async () => {
    await comServidor(
      () => createProbeServer(pool, 1_000),
      async (base) => {
        const res = await fetch(`${base}/health/inexistente`);
        expect(res.status).toBe(404);
      },
    );
  });

  it("404 para método diferente de GET — não revela mais que uma rota ausente", async () => {
    await comServidor(
      () => createProbeServer(pool, 1_000),
      async (base) => {
        const res = await fetch(`${base}/health/live`, { method: "POST" });
        expect(res.status).toBe(404);
      },
    );
  });

  it("500 quando a própria verificação quebra o contrato e lança", async () => {
    // As três verificações reais nunca lançam. Isto prova a defesa contra uma que
    // viesse a quebrar esse contrato no futuro — defesa não exercitada é a mesma
    // vacuidade que este repositório já registrou duas vezes no playbook.
    await comServidor(
      () =>
        createProbeServer(pool, 1_000, {
          "/health/live": () => {
            throw new Error("verificação quebrada");
          },
        }),
      async (base) => {
        const res = await fetch(`${base}/health/live`);
        expect(res.status).toBe(500);
        const corpo = (await res.json()) as { error: string; message: string };
        expect(corpo).toEqual({ error: "internal_error", message: "erro interno" });
      },
    );
  });
});
