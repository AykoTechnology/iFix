import { Pool } from "pg";
import { loadConfig } from "./config.js";
import { consumeBatch, type ConsumerOptions, type Handler } from "./consumer.js";
import { createProbeServer } from "./probes.js";

/**
 * Processo do worker de notificações. PID 1 na imagem Distroless (ADR-001): sem
 * supervisor nem shell, o próprio processo trata os sinais do sistema operacional.
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

const handler: Handler = async (envelope) => {
  // O roteamento por canal (e-mail, push, in-app) é a História 10.1 e depende do R5,
  // que define o provedor. Até lá o consumidor exerce o padrão completo — envelope
  // validado, contexto de locatário aplicado, idempotência registrada — sem inventar
  // um destino que ainda não foi decidido.
  process.stdout.write(
    `${JSON.stringify({
      level: "info",
      msg: "evento consumido",
      event_type: envelope.event_type,
      event_id: envelope.event_id,
      trace_id: envelope.trace_id,
    })}\n`,
  );
  return Promise.resolve();
};

async function main(): Promise<void> {
  const config = loadConfig();

  const pool = new Pool({
    host: config.PGHOST,
    port: config.PGPORT,
    database: config.PGDATABASE,
    user: config.PGUSER,
    password: config.PGPASSWORD,
    max: config.PG_POOL_MAX,
  });

  const probes = createProbeServer(pool, config.EVENT_LOOP_LAG_THRESHOLD_MS);
  await new Promise<void>((resolve) =>
    probes.listen(config.PROBE_PORT, config.PROBE_HOST, resolve),
  );

  let encerrando = false;
  let guard: NodeJS.Timeout | undefined;

  const encerrar = (sinal: NodeJS.Signals): void => {
    // Sinal repetido durante a drenagem é ignorado: um segundo SIGTERM não deve
    // abortar o encerramento ordenado que já está em curso.
    if (encerrando) return;
    encerrando = true;

    process.stdout.write(
      `${JSON.stringify({ level: "info", msg: "encerrando: drenando lote atual", sinal })}\n`,
    );

    // Rede de segurança: se o lote corrente travar, sair antes do SIGKILL do
    // Kubernetes é preferível a ser morto no meio dele (Regra de Ouro 8).
    guard = setTimeout(() => {
      process.stderr.write(
        `${JSON.stringify({
          level: "error",
          msg: "drenagem excedeu o prazo",
          timeoutMs: config.SHUTDOWN_TIMEOUT_MS,
        })}\n`,
      );
      process.exit(1);
    }, config.SHUTDOWN_TIMEOUT_MS);
    guard.unref();
  };

  process.on("SIGTERM", encerrar);
  process.on("SIGINT", encerrar);

  while (!encerrando) {
    const resultado = await consumeBatch(pool, CONFIG, handler);

    if (resultado.deadLettered > 0) {
      // Mensagem na DLQ é automação de negócio que silenciosamente não aconteceu
      // (Épico 12.5). Sai como erro para que o alerta tenha o que observar.
      process.stderr.write(
        `${JSON.stringify({
          level: "error",
          msg: "mensagens na DLQ",
          quantidade: resultado.deadLettered,
          fila: CONFIG.deadLetterQueue,
        })}\n`,
      );
    }

    // Só dorme quando não havia nada: com fila cheia, o próximo lote sai imediatamente.
    if (!encerrando && resultado.processed + resultado.duplicates + resultado.failed === 0) {
      await new Promise((resolve) => setTimeout(resolve, config.WORKER_IDLE_MS));
    }
  }

  clearTimeout(guard);
  await new Promise<void>((resolve) => probes.close(() => resolve()));
  await pool.end();

  process.stdout.write(`${JSON.stringify({ level: "info", msg: "encerrado com sucesso" })}\n`);
  process.exit(0);
}

main().catch((error: unknown) => {
  process.stderr.write(`falha na inicialização: ${String(error)}\n`);
  process.exit(1);
});
