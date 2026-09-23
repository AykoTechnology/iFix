import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Regra de Ouro 8 — graceful shutdown (ADR-001, especificação § 6.3).
 *
 * Exercita o **artefato de produção compilado**, não o código-fonte: o processo Node é
 * PID 1 na imagem Distroless e recebe SIGTERM diretamente, sem supervisor que possa
 * mascarar um tratamento ausente. Um handler que existe no fonte mas não é registrado
 * a tempo passaria despercebido em qualquer teste que importasse o módulo.
 *
 * O que uma falha aqui significa em produção: o Kubernetes envia SIGTERM, espera
 * `terminationGracePeriodSeconds` e então manda SIGKILL. Sem drenagem, as requisições
 * em voo morrem no meio e o pool de banco fica com conexões penduradas a cada
 * *rolling update* — que é a operação mais frequente do ciclo de vida do serviço.
 */

const ENTRYPOINT = join(import.meta.dirname, "..", "src", "api", "dist", "index.js");

/** Prazo do encerramento ordenado, abaixo do terminationGracePeriodSeconds: 30 do pod. */
const SHUTDOWN_BUDGET_MS = 25_000;

let child: ChildProcessWithoutNullStreams | undefined;

afterEach(() => {
  if (child?.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  child = undefined;
});

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => {
        resolve(port);
      });
    });
  });
}

interface StartedProcess {
  process: ChildProcessWithoutNullStreams;
  output: () => string;
  port: number;
}

async function startServer(): Promise<StartedProcess> {
  const port = await freePort();
  const proc = spawn(process.execPath, [ENTRYPOINT], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: String(port),
      PGHOST: process.env.PGHOST ?? "127.0.0.1",
      PGDATABASE: process.env.PGDATABASE ?? "ifix_test",
      PGUSER: "authenticated",
      PGPASSWORD: process.env.PGPASSWORD ?? "local_dev_only",
      JWT_SECRET: "segredo-de-teste-com-mais-de-32-caracteres",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let buffer = "";
  proc.stdout.on("data", (chunk: Buffer) => (buffer += chunk.toString()));
  proc.stderr.on("data", (chunk: Buffer) => (buffer += chunk.toString()));

  // Espera o servidor aceitar tráfego de verdade, em vez de dormir um tempo arbitrário.
  const deadline = Date.now() + 15_000;
  for (;;) {
    if (proc.exitCode !== null) throw new Error(`processo morreu na inicialização:\n${buffer}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health/ready`);
      if (response.ok) break;
    } catch {
      /* ainda subindo */
    }
    if (Date.now() > deadline) throw new Error(`servidor não ficou pronto:\n${buffer}`);
    await new Promise((r) => setTimeout(r, 100));
  }

  return { process: proc, output: () => buffer, port };
}

function waitForExit(proc: ChildProcessWithoutNullStreams): Promise<{
  code: number | null;
  signal: NodeJS.Signals | null;
}> {
  return new Promise((resolve) => {
    proc.once("exit", (code, signal) => {
      resolve({ code, signal });
    });
  });
}

describe.skipIf(!existsSync(ENTRYPOINT))("graceful shutdown do artefato compilado", () => {
  it("encerra com código 0 dentro do prazo ao receber SIGTERM", async () => {
    const started = await startServer();
    child = started.process;

    const began = Date.now();
    started.process.kill("SIGTERM");
    const { code, signal } = await waitForExit(started.process);
    const elapsed = Date.now() - began;

    // Código 0 e não 143: 143 significa que o processo foi **terminado pelo sinal**,
    // ou seja, que o handler nunca rodou e o comportamento padrão prevaleceu.
    expect({ code, signal }).toEqual({ code: 0, signal: null });
    expect(elapsed).toBeLessThan(SHUTDOWN_BUDGET_MS);
  }, 40_000);

  it("registra a drenagem no log antes de sair", async () => {
    const started = await startServer();
    child = started.process;

    started.process.kill("SIGTERM");
    await waitForExit(started.process);

    // Sem estas linhas não há como distinguir, em uma investigação pós-incidente,
    // um encerramento ordenado de um processo morto por SIGKILL.
    expect(started.output()).toContain("drenando conexões");
    expect(started.output()).toContain("encerrado com sucesso");
  }, 40_000);

  it("trata SIGINT da mesma forma", async () => {
    const started = await startServer();
    child = started.process;

    started.process.kill("SIGINT");
    const { code } = await waitForExit(started.process);
    expect(code).toBe(0);
  }, 40_000);

  it("ignora sinal repetido durante a drenagem", async () => {
    const started = await startServer();
    child = started.process;

    // Um segundo SIGTERM não pode abortar o encerramento ordenado já em curso.
    started.process.kill("SIGTERM");
    started.process.kill("SIGTERM");
    const { code } = await waitForExit(started.process);
    expect(code).toBe(0);
  }, 40_000);
});
