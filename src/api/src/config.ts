import { z } from "zod";

/**
 * Configuração validada na inicialização. Falhar aqui, alto e cedo, é melhor que
 * descobrir em produção que uma variável estava ausente — especialmente as que
 * sustentam isolamento, como o segredo de verificação do JWT.
 */
const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),

  PGHOST: z.string().default("127.0.0.1"),
  PGPORT: z.coerce.number().int().positive().default(5432),
  PGDATABASE: z.string().default("ifix_dev"),
  PGUSER: z.string().default("authenticated"),
  PGPASSWORD: z.string(),
  PG_POOL_MAX: z.coerce.number().int().positive().default(10),

  /**
   * Segredo de verificação do JWT emitido pelo GoTrue. Com HS256, é simétrico.
   * A migração para chave assimétrica com JWKS chega no Épico 17.1.
   */
  JWT_SECRET: z.string().min(32, "o segredo do JWT precisa de ao menos 32 caracteres"),

  /**
   * Menor que o `terminationGracePeriodSeconds: 30` do pod, de propósito: o processo
   * precisa terminar de drenar antes que o Kubernetes mande SIGKILL (Regra de Ouro 8).
   */
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(25_000),

  /** Acima deste atraso de event loop, o processo é considerado travado. */
  EVENT_LOOP_LAG_THRESHOLD_MS: z.coerce.number().positive().default(1_000),
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
