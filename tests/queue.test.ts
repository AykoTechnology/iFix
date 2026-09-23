import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { withRequestContext } from "../src/shared/src/db-context.js";
import { consumeBatch } from "../src/workers/src/consumer.js";
import type { Envelope } from "../src/workers/src/envelope.js";
import { FIXTURES, connectAsOwner, seed } from "./helpers/db.js";
import type { Client } from "pg";

/**
 * A primeira fila `pgmq` e o padrão de consumo — ADR-002, ADR-003, ADR-008.
 *
 * Roda contra `pgmq` de verdade, instalado como extensão pelo `reset.sh`. Um mock de
 * fila provaria apenas que concorda consigo mesmo: a semântica que importa aqui —
 * timeout de visibilidade, `read_ct`, reentrega — vive no motor, não no cliente
 * (ADR-018).
 */

const FILA = "notifications";
const DLQ = "notifications_dlq";

const pool = new Pool({
  host: process.env.PGHOST ?? "127.0.0.1",
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? "ifix_test",
  user: "service_role",
  password: process.env.PGPASSWORD ?? "local_dev_only",
  max: 4,
});

let owner: Client;

const contextoDe = (tenantId: string, pessoaId: string, traceId?: string) => ({
  claims: {
    sub: pessoaId,
    tenant_id: tenantId,
    workspace_ids: [] as string[],
    role: "authenticated" as const,
  },
  ...(traceId !== undefined && { traceId }),
});

/** Publica pelo caminho real — a função SQL, dentro de uma transação de usuário. */
async function publicar(
  tenantId: string,
  pessoaId: string,
  opcoes: { eventId?: string; traceId?: string; tipo?: string } = {},
): Promise<void> {
  await withRequestContext(pool, contextoDe(tenantId, pessoaId, opcoes.traceId), async (client) => {
    await client.query("select app.publish_event($1, $2, $3::jsonb, $4)", [
      FILA,
      opcoes.tipo ?? "person.created",
      JSON.stringify({ origem: "teste" }),
      // Passar NULL de propósito também exercita o `coalesce` da função: um
      // chamador distraído não pode produzir envelope sem chave de idempotência.
      opcoes.eventId ?? null,
    ]);
  });
}

const profundidade = async (fila: string): Promise<number> => {
  const { rows } = await pool.query<{ n: string }>(
    "select coalesce(queue_length, 0)::text as n from pgmq.metrics($1)",
    [fila],
  );
  return Number(rows[0]?.n ?? 0);
};

beforeEach(async () => {
  owner = owner ?? (await connectAsOwner());
  await seed(owner);
  await owner.query("select pgmq.purge_queue($1)", [FILA]);
  await owner.query("select pgmq.purge_queue($1)", [DLQ]);
  await owner.query("truncate public.processed_events");
});

afterAll(async () => {
  await pool.end();
  await owner?.end();
});

describe("publicação transacional (ADR-002)", () => {
  it("a mensagem só existe se a transação confirmar", async () => {
    // É a promessa central do ADR-002: a mutação de negócio e o enfileiramento
    // compartilham o COMMIT. Se o enfileiramento sobrevivesse ao rollback, o sistema
    // teria notificado sobre algo que não aconteceu.
    await expect(
      withRequestContext(
        pool,
        contextoDe(FIXTURES.acme.tenantId, FIXTURES.acme.ana),
        async (client) => {
          await client.query("select app.publish_event($1, $2, '{}'::jsonb)", [
            FILA,
            "person.created",
          ]);
          throw new Error("falha depois de publicar");
        },
      ),
    ).rejects.toThrow("falha depois de publicar");

    expect(await profundidade(FILA)).toBe(0);
  });

  it("recusa publicar sem contexto de locatário", async () => {
    // Mensagem órfã só seria descoberta pelo worker, que já não teria como decidir
    // de quem ela é. Falhar na publicação é o momento certo.
    const cru = await pool.connect();
    try {
      await expect(
        cru.query("select app.publish_event($1, 'x', '{}'::jsonb)", [FILA]),
      ).rejects.toThrow(/contexto de locat/i);
    } finally {
      cru.release();
    }
  });

  it("o envelope carrega locatário, autor e rastro", async () => {
    await publicar(FIXTURES.acme.tenantId, FIXTURES.acme.ana, { traceId: "4bf92f3577b34da6a" });

    const { rows } = await owner.query<{ message: Envelope }>(
      "select message from pgmq.read($1, 5, 1)",
      [FILA],
    );
    const envelope = rows[0]?.message;

    expect(envelope?.tenant_id).toBe(FIXTURES.acme.tenantId);
    expect(envelope?.actor_id).toBe(FIXTURES.acme.ana);
    expect(envelope?.trace_id).toBe("4bf92f3577b34da6a");
    expect(envelope?.event_id).toEqual(expect.any(String));
  });
});

describe("consumo idempotente (Regra de Ouro, ADR-002)", () => {
  it("processa a mensagem e a remove da fila", async () => {
    await publicar(FIXTURES.acme.tenantId, FIXTURES.acme.ana);

    const vistos: string[] = [];
    const resultado = await consumeBatch(pool, { queue: FILA, deadLetterQueue: DLQ }, (e) => {
      vistos.push(e.event_type);
      return Promise.resolve();
    });

    expect(resultado).toMatchObject({ processed: 1, duplicates: 0, failed: 0 });
    expect(vistos).toEqual(["person.created"]);
    expect(await profundidade(FILA)).toBe(0);
  });

  it("a mesma chave entregue duas vezes executa o efeito uma vez", async () => {
    // O cenário real de at-least-once: o pod morre entre o efeito e o delete, a
    // mensagem reaparece. Aqui é simulado publicando o MESMO event_id duas vezes,
    // que é indistinguível do ponto de vista do consumidor.
    const eventId = "11111111-1111-7111-8111-111111111111";
    await publicar(FIXTURES.acme.tenantId, FIXTURES.acme.ana, { eventId });
    await publicar(FIXTURES.acme.tenantId, FIXTURES.acme.ana, { eventId });

    let execucoes = 0;
    const resultado = await consumeBatch(pool, { queue: FILA, deadLetterQueue: DLQ }, () => {
      execucoes += 1;
      return Promise.resolve();
    });

    expect(execucoes).toBe(1);
    expect(resultado).toMatchObject({ processed: 1, duplicates: 1 });
    expect(await profundidade(FILA)).toBe(0);
  });

  it("o mesmo event_id em locatários distintos são eventos distintos", async () => {
    // A chave de idempotência é (locatário, fila, evento). Fosse só o evento, uma
    // colisão entre locatários suprimiria em silêncio o trabalho de um deles.
    const eventId = "22222222-2222-7222-8222-222222222222";
    await publicar(FIXTURES.acme.tenantId, FIXTURES.acme.ana, { eventId });
    await publicar(FIXTURES.globex.tenantId, FIXTURES.globex.bob, { eventId });

    const resultado = await consumeBatch(pool, { queue: FILA, deadLetterQueue: DLQ }, () =>
      Promise.resolve(),
    );

    expect(resultado).toMatchObject({ processed: 2, duplicates: 0 });
  });

  it("falha do handler desfaz o registro de idempotência junto com o efeito", async () => {
    // Se o registro sobrevivesse à falha, a reentrega veria a chave ocupada e pularia
    // o trabalho — a mensagem sumiria tendo feito nada. É o modo de falha mais
    // traiçoeiro de um consumidor idempotente mal escrito.
    await publicar(FIXTURES.acme.tenantId, FIXTURES.acme.ana);

    const primeira = await consumeBatch(pool, { queue: FILA, deadLetterQueue: DLQ }, () =>
      Promise.reject(new Error("efeito falhou")),
    );
    expect(primeira).toMatchObject({ failed: 1, processed: 0 });

    const { rows } = await pool.query<{ n: string }>(
      "select count(*)::text as n from public.processed_events",
    );
    expect(rows[0]?.n).toBe("0");
  });
});

describe("isolamento no worker (ADR-003)", () => {
  it("o trabalho roda sob o locatário da mensagem, não como serviço", async () => {
    // O worker lê a fila com credencial de serviço, mas o handler enxerga apenas o
    // locatário que a mensagem declara. Sem isto, a fila seria uma porta lateral em
    // volta de toda a arquitetura de isolamento.
    await publicar(FIXTURES.acme.tenantId, FIXTURES.acme.ana);

    const emails: string[][] = [];
    await consumeBatch(pool, { queue: FILA, deadLetterQueue: DLQ }, async (_envelope, client) => {
      const { rows } = await client.query<{ email: string }>(
        "select email from public.people order by email",
      );
      emails.push(rows.map((r) => r.email));
    });

    expect(emails).toEqual([["ana@acme.com", "rita@acme.com"]]);
  });

  it("o registro de idempotência fica visível apenas ao locatário dono", async () => {
    await publicar(FIXTURES.acme.tenantId, FIXTURES.acme.ana);
    await consumeBatch(pool, { queue: FILA, deadLetterQueue: DLQ }, () => Promise.resolve());

    const visiveis = await withRequestContext(
      pool,
      contextoDe(FIXTURES.globex.tenantId, FIXTURES.globex.bob),
      async (client) => {
        const { rows } = await client.query<{ n: string }>(
          "select count(*)::text as n from public.processed_events",
        );
        return Number(rows[0]?.n);
      },
    );

    expect(visiveis).toBe(0);
  });
});

describe("fila de mensagens mortas (Épico 12.5)", () => {
  it("envelope malformado vai direto para a DLQ", async () => {
    // Envelope quebrado é defeito de código, não falha transitória: reentregar não
    // melhora nada e só consome tentativas.
    await owner.query('select pgmq.send($1, \'{"sem":"envelope"}\'::jsonb)', [FILA]);

    const resultado = await consumeBatch(pool, { queue: FILA, deadLetterQueue: DLQ }, () =>
      Promise.reject(new Error("não deveria ser chamado")),
    );

    expect(resultado).toMatchObject({ deadLettered: 1, processed: 0 });
    expect(await profundidade(FILA)).toBe(0);
    expect(await profundidade(DLQ)).toBe(1);
  });

  it("a mensagem vai para a DLQ ao esgotar as tentativas, com o motivo anexado", async () => {
    await publicar(FIXTURES.acme.tenantId, FIXTURES.acme.ana);

    const opcoes = {
      queue: FILA,
      deadLetterQueue: DLQ,
      maxAttempts: 2,
      visibilityTimeoutSeconds: 0,
    };
    const falhar = (): Promise<never> => Promise.reject(new Error("indisponível"));

    // Primeira entrega falha e não vai para a DLQ: ainda há tentativa.
    expect(await consumeBatch(pool, opcoes, falhar)).toMatchObject({ failed: 1, deadLettered: 0 });
    expect(await profundidade(FILA)).toBe(1);

    // Segunda atinge o limite.
    expect(await consumeBatch(pool, opcoes, falhar)).toMatchObject({ failed: 1, deadLettered: 1 });
    expect(await profundidade(FILA)).toBe(0);

    const { rows } = await owner.query<{ message: { reason: string; read_ct: number } }>(
      "select message from pgmq.read($1, 5, 1)",
      [DLQ],
    );
    expect(rows[0]?.message.reason).toBe("indisponível");
    expect(rows[0]?.message.read_ct).toBeGreaterThanOrEqual(2);
  });
});
