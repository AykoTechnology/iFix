import { Pool } from "pg";
import { consumeBatch, type ConsumerOptions, type Handler } from "./consumer.js";

/**
 * Processo do worker de notificações.
 *
 * ## Por que o SIGTERM espera o lote terminar
 *
 * O Kubernetes envia SIGTERM e aguarda `terminationGracePeriodSeconds` antes de
 * matar. Encerrar no meio de um lote não perderia trabalho — a mensagem voltaria pelo
 * timeout de visibilidade — mas produziria reentrega e, com ela, latência e ruído na
 * DLQ a cada implantação. Terminar o lote corrente e só então sair torna a rotina de
 * atualização silenciosa.
 *
 * Não há retomada forçada: se o período de graça expirar, o pod morre e a fila
 * reentrega. A idempotência do consumidor é o que torna esse caminho seguro — e é por
 * isso que ela é Regra de Ouro, não otimização.
 */

const CONFIG: ConsumerOptions = {
  queue: "notifications",
  deadLetterQueue: "notifications_dlq",
};

/** Intervalo entre lotes quando a fila está vazia. */
const OCIOSO_MS = Number(process.env.WORKER_IDLE_MS ?? 1_000);

const handler: Handler = async (envelope) => {
  // O roteamento por canal (e-mail, push, in-app) é a História 10.1 e depende do R5,
  // que define o provedor. Até lá o consumidor exerce o padrão completo — envelope
  // validado, contexto de locatário aplicado, idempotência registrada — sem inventar
  // um destino que ainda não foi decidido.
  process.stdout.write(
    `${JSON.stringify({ level: "info", msg: "evento consumido", event_type: envelope.event_type, event_id: envelope.event_id, trace_id: envelope.trace_id })}\n`,
  );
  return Promise.resolve();
};

async function main(): Promise<void> {
  const pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    max: Number(process.env.PG_POOL_MAX ?? 4),
  });

  let encerrando = false;
  const encerrar = (sinal: string): void => {
    process.stdout.write(`${JSON.stringify({ level: "info", msg: "encerrando", sinal })}\n`);
    encerrando = true;
  };

  process.on("SIGTERM", () => {
    encerrar("SIGTERM");
  });
  process.on("SIGINT", () => {
    encerrar("SIGINT");
  });

  while (!encerrando) {
    const resultado = await consumeBatch(pool, CONFIG, handler);

    if (resultado.deadLettered > 0) {
      // Mensagem na DLQ é automação de negócio que silenciosamente não aconteceu
      // (Épico 12.5). Sai como erro para que o alerta tenha o que observar.
      process.stderr.write(
        `${JSON.stringify({ level: "error", msg: "mensagens na DLQ", quantidade: resultado.deadLettered, fila: CONFIG.deadLetterQueue })}\n`,
      );
    }

    // Só dorme quando não havia nada: com fila cheia, o próximo lote sai imediatamente.
    if (resultado.processed + resultado.duplicates + resultado.failed === 0) {
      await new Promise((resolve) => setTimeout(resolve, OCIOSO_MS));
    }
  }

  await pool.end();
}

await main();
