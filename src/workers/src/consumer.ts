import type { Pool } from "pg";
import { withRequestContext } from "@ifix/shared";
import { envelopeSchema, type Envelope } from "./envelope.js";

/**
 * Consumidor de fila `pgmq` — o padrão de referência (ADR-002, ADR-003, ADR-008).
 *
 * Três garantias que este arquivo existe para tornar mecânicas:
 *
 * **Idempotência.** `pgmq` entrega _at-least-once_. A mesma mensagem será entregue
 * duas vezes em algum momento — por timeout de visibilidade, por reinício de pod, por
 * uma falha entre o efeito e o `delete`. O consumidor não pergunta "já processei?" e
 * depois processa: ele tenta **registrar** o evento e só executa se o registro foi
 * dele. O `insert ... on conflict do nothing` decide, e decide atomicamente.
 *
 * **Isolamento.** O worker lê a fila com credencial de serviço, mas o trabalho de
 * negócio roda sob o locatário que a mensagem declara, pelas mesmas GUCs e as mesmas
 * políticas que valem para a API. Um worker que rodasse como `service_role` seria uma
 * porta lateral em volta de toda a arquitetura do ADR-003.
 *
 * **Rastro.** O `trace_id` atravessa a fronteira da fila dentro do envelope e é
 * restaurado aqui. Sem isso o rastro morre no COMMIT do produtor, e a automação
 * assíncrona — a parte mais difícil de depurar — fica invisível (ADR-008).
 */

export interface ConsumerOptions {
  queue: string;
  /** Fila para onde a mensagem vai depois de esgotar as tentativas. */
  deadLetterQueue: string;
  /**
   * Quantas entregas uma mensagem suporta antes de ir para a DLQ. O `read_ct` do
   * pgmq conta entregas, não falhas: uma mensagem cujo pod morreu no meio também
   * consome tentativa, e é isso mesmo que se quer — o efeito é o mesmo.
   */
  maxAttempts?: number;
  /**
   * Segundos que a mensagem fica invisível para outros consumidores após ser lida.
   * Precisa ser maior que o pior caso de processamento: se expirar antes, outro
   * worker pega a mesma mensagem e a idempotência passa a ser a única proteção.
   */
  visibilityTimeoutSeconds?: number;
  batchSize?: number;
}

export interface Handler {
  (
    envelope: Envelope,
    client: Parameters<Parameters<typeof withRequestContext>[2]>[0],
  ): Promise<void>;
}

export interface BatchResult {
  processed: number;
  /** Mensagens cuja chave já constava no livro-razão: entrega repetida. */
  duplicates: number;
  failed: number;
  deadLettered: number;
}

interface RawMessage {
  msg_id: string;
  read_ct: number;
  message: unknown;
}

const PADROES = {
  maxAttempts: 5,
  visibilityTimeoutSeconds: 30,
  batchSize: 10,
} as const;

/**
 * Processa um lote e retorna. Não é um laço infinito de propósito: quem decide a
 * cadência é o processo, e um laço embutido tornaria o consumo impossível de testar
 * sem relógio.
 */
export async function consumeBatch(
  pool: Pool,
  options: ConsumerOptions,
  handler: Handler,
): Promise<BatchResult> {
  const maxAttempts = options.maxAttempts ?? PADROES.maxAttempts;
  const visibility = options.visibilityTimeoutSeconds ?? PADROES.visibilityTimeoutSeconds;
  const batchSize = options.batchSize ?? PADROES.batchSize;

  const { rows } = await pool.query<RawMessage>(
    "select msg_id, read_ct, message from pgmq.read($1, $2, $3)",
    [options.queue, visibility, batchSize],
  );

  const resultado: BatchResult = { processed: 0, duplicates: 0, failed: 0, deadLettered: 0 };

  for (const row of rows) {
    const analise = envelopeSchema.safeParse(row.message);

    if (!analise.success) {
      // Mensagem malformada não melhora com nova tentativa: o envelope é o contrato
      // entre produtor e consumidor, e um envelope quebrado é defeito de código, não
      // falha transitória. Vai direto para a DLQ, onde alguém a encontra.
      await moverParaDlq(pool, options, row, "envelope inválido");
      resultado.deadLettered += 1;
      continue;
    }

    const envelope = analise.data;

    try {
      const executou = await processarUmaVez(pool, options.queue, envelope, handler);

      // O delete acontece DEPOIS do commit do trabalho. Se o processo morrer entre um
      // e outro, a mensagem reaparece e o livro-razão a reconhece como repetida — o
      // efeito não se duplica. A ordem inversa perderia o trabalho em silêncio.
      await pool.query("select pgmq.delete($1, $2::bigint)", [options.queue, row.msg_id]);

      if (executou) resultado.processed += 1;
      else resultado.duplicates += 1;
    } catch (erro) {
      resultado.failed += 1;

      if (row.read_ct >= maxAttempts) {
        await moverParaDlq(pool, options, row, mensagemDeErro(erro));
        resultado.deadLettered += 1;
      }
      // Abaixo do limite não se faz nada: o timeout de visibilidade expira e o pgmq
      // reentrega sozinho. Tentar reenfileirar à mão criaria uma segunda cópia.
    }
  }

  return resultado;
}

/**
 * Executa o trabalho sob o locatário da mensagem, uma única vez.
 *
 * Devolve `true` se o trabalho rodou agora e `false` se a chave já constava — o que é
 * sucesso, não erro: entrega repetida é o comportamento normal de uma fila
 * _at-least-once_.
 */
async function processarUmaVez(
  pool: Pool,
  queue: string,
  envelope: Envelope,
  handler: Handler,
): Promise<boolean> {
  return withRequestContext(
    pool,
    {
      // Claims sintetizadas a partir do envelope. O papel é `authenticated`, e não
      // `service_role`: o worker não deve enxergar mais do que quem originou o evento.
      claims: {
        sub: envelope.actor_id,
        tenant_id: envelope.tenant_id,
        workspace_ids: [],
        role: "authenticated",
      },
      ...(envelope.trace_id !== null && { traceId: envelope.trace_id }),
    },
    async (client) => {
      const { rowCount } = await client.query(
        `insert into public.processed_events (tenant_id, event_id, queue_name, trace_id)
         values ($1, $2, $3, $4)
         on conflict (tenant_id, queue_name, event_id) do nothing`,
        [envelope.tenant_id, envelope.event_id, queue, envelope.trace_id],
      );

      if (rowCount === 0) return false;

      // O efeito e o registro compartilham a transação: ou os dois acontecem, ou
      // nenhum. Se o handler falhar, o registro desaparece junto e a reentrega volta
      // a encontrar a chave livre — que é o comportamento correto, porque o efeito
      // também não aconteceu.
      await handler(envelope, client);
      return true;
    },
  );
}

async function moverParaDlq(
  pool: Pool,
  options: ConsumerOptions,
  row: RawMessage,
  motivo: string,
): Promise<void> {
  // A mensagem chega à DLQ com o motivo e a contagem de entregas anexados. Uma DLQ
  // que guarda só a carga obriga quem investiga a reconstruir o porquê a partir de
  // logs que podem já ter expirado.
  await pool.query("select pgmq.send($1, $2::jsonb)", [
    options.deadLetterQueue,
    JSON.stringify({
      failed_at: new Date().toISOString(),
      source_queue: options.queue,
      read_ct: row.read_ct,
      reason: motivo,
      message: row.message,
    }),
  ]);

  await pool.query("select pgmq.delete($1, $2::bigint)", [options.queue, row.msg_id]);
}

function mensagemDeErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}
