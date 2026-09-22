import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

/**
 * Ponto de entrada. O processo Node é PID 1 na imagem Distroless (ADR-001): não há
 * supervisor nem shell, então tratar os sinais do sistema operacional é
 * responsabilidade dele próprio.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const { app } = await buildServer(config);

  await app.listen({ host: config.HOST, port: config.PORT });

  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    // Sinal repetido durante a drenagem é ignorado: um segundo SIGTERM não deve
    // abortar o encerramento ordenado que já está em curso.
    if (shuttingDown) return;
    shuttingDown = true;

    app.log.info({ signal }, "encerrando: drenando conexões");

    // Rede de segurança: se a drenagem travar, sair antes do SIGKILL do Kubernetes
    // é preferível a ser morto no meio dela (Regra de Ouro 8).
    const guard = setTimeout(() => {
      app.log.error({ timeoutMs: config.SHUTDOWN_TIMEOUT_MS }, "drenagem excedeu o prazo");
      process.exit(1);
    }, config.SHUTDOWN_TIMEOUT_MS);
    guard.unref();

    // `app.close()` para de aceitar novas conexões, aguarda as em voo e dispara o
    // hook onClose, que encerra o pool do banco.
    app
      .close()
      .then(() => {
        app.log.info("encerrado com sucesso");
        process.exit(0);
      })
      .catch((error: unknown) => {
        app.log.error({ err: error }, "falha ao encerrar");
        process.exit(1);
      });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error: unknown) => {
  // Sem logger ainda: falha de configuração ocorre antes de o servidor existir.
  process.stderr.write(`falha na inicialização: ${String(error)}\n`);
  process.exit(1);
});
