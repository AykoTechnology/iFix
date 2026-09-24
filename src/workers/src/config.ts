import { z } from "zod";

/**
 * Configuração do worker, validada na inicialização — mesmo espírito de
 * `src/api/src/config.ts`: falhar alto e cedo é melhor que descobrir em produção que
 * uma variável estava ausente.
 */
const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  PGHOST: z.string().default("127.0.0.1"),
  PGPORT: z.coerce.number().int().positive().default(5432),
  PGDATABASE: z.string().default("ifix_dev"),
  PGUSER: z.string().default("service_role"),
  PGPASSWORD: z.string(),
  PG_POOL_MAX: z.coerce.number().int().positive().default(4),

  /** Onde as três probes respondem. Porta distinta da API por padrão. */
  PROBE_HOST: z.string().default("0.0.0.0"),
  PROBE_PORT: z.coerce.number().int().positive().default(3001),

  /**
   * Menor que o `terminationGracePeriodSeconds: 30` do chart, de propósito — o
   * processo precisa terminar de drenar antes do SIGKILL (Regra de Ouro 8).
   */
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(25_000),

  /** Acima deste atraso de event loop, a liveness considera o processo travado. */
  EVENT_LOOP_LAG_THRESHOLD_MS: z.coerce.number().positive().default(1_000),

  /** Intervalo entre lotes quando a fila está vazia. */
  WORKER_IDLE_MS: z.coerce.number().int().nonnegative().default(1_000),
});

export type Config = z.infer<typeof environmentSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = environmentSchema.safeParse(source);
  if (!parsed.success) {
    const detalhes = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(raiz)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Configuração inválida:\n${detalhes}`);
  }
  return parsed.data;
}
