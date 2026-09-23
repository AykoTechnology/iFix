import { monitorEventLoopDelay } from "node:perf_hooks";
import type { Pool } from "pg";

/**
 * As três probes da § 6.3 da especificação.
 *
 * ## Por que não podem ser a mesma checagem
 *
 * É tentador apontar as três para um `select 1`. Seria um erro operacional grave:
 *
 * - **liveness** responde "este processo deve continuar vivo?". Um `not ok` aqui faz o
 *   Kubernetes **matar** o pod. Se ela consultasse o banco, uma indisponibilidade de
 *   banco derrubaria todos os pods simultaneamente, em loop de reinício, transformando
 *   uma falha recuperável de dependência em uma interrupção total — e ainda apagaria a
 *   capacidade de servir respostas em cache ou erros úteis. Por isso ela olha apenas
 *   para dentro: o event loop está girando?
 *
 * - **readiness** responde "este processo deve receber tráfego agora?". Um `not ok`
 *   **remove do balanceador sem matar**, que é exatamente o comportamento desejado
 *   quando o banco oscila: o pod sobrevive e volta ao tráfego sozinho quando a
 *   dependência retorna.
 *
 * - **startup** responde "a inicialização terminou?". Tem orçamento de tempo maior e
 *   segura as outras duas até passar. É onde se verifica que o schema esperado existe —
 *   o modo de falha clássico de subir a aplicação antes de a migração ter rodado.
 */

const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
eventLoopDelay.enable();

export interface ProbeResult {
  ok: boolean;
  detail: Record<string, unknown>;
}

/** Liveness: nunca toca o banco, por decisão. */
export function checkLiveness(thresholdMs: number): ProbeResult {
  const meanMs = eventLoopDelay.mean / 1e6;
  const p99Ms = eventLoopDelay.percentile(99) / 1e6;
  return {
    ok: p99Ms < thresholdMs,
    detail: {
      eventLoopMeanMs: Number(meanMs.toFixed(2)),
      eventLoopP99Ms: Number(p99Ms.toFixed(2)),
      thresholdMs,
    },
  };
}

/** Readiness: conectividade e latência do pooler. */
export async function checkReadiness(pool: Pool): Promise<ProbeResult> {
  const started = process.hrtime.bigint();
  try {
    const client = await pool.connect();
    try {
      await client.query("select 1");
    } finally {
      client.release();
    }
    const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
    return {
      ok: true,
      detail: {
        databaseLatencyMs: Number(latencyMs.toFixed(2)),
        poolTotal: pool.totalCount,
        poolIdle: pool.idleCount,
        poolWaiting: pool.waitingCount,
      },
    };
  } catch (error) {
    return {
      ok: false,
      detail: { error: error instanceof Error ? error.message : "falha desconhecida" },
    };
  }
}

/**
 * Objetos de schema sem os quais a aplicação não tem como funcionar corretamente.
 * Ausência aqui significa, quase sempre, aplicação implantada antes da migração.
 */
const REQUIRED_FUNCTIONS = [
  "app.current_tenant_id",
  "app.current_person_id",
  "app.is_service_role",
  "app.tenant_visible",
  "app.workspace_visible",
  "audit.capture",
] as const;

const REQUIRED_TABLES = ["audit.logs", "public.tenants", "public.people"] as const;

/** Startup: o schema esperado está presente e o banco responde? */
export async function checkStartup(pool: Pool): Promise<ProbeResult> {
  try {
    // Consulta o catálogo por nome qualificado e compara em memória. Resolver
    // assinatura no SQL (`to_regprocedure`) exigiria repetir os tipos de argumento
    // de cada função aqui, e a lista silenciosamente deixaria de bater a cada
    // mudança de assinatura.
    const [functions, tables] = await Promise.all([
      pool.query<{ name: string }>(
        `select n.nspname || '.' || p.proname as name
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname || '.' || p.proname = any($1::text[])`,
        [[...REQUIRED_FUNCTIONS]],
      ),
      pool.query<{ name: string }>(
        `select n.nspname || '.' || c.relname as name
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where c.relkind in ('r', 'p')
           and n.nspname || '.' || c.relname = any($1::text[])`,
        [[...REQUIRED_TABLES]],
      ),
    ]);

    const encontrados = new Set([
      ...functions.rows.map((r) => r.name),
      ...tables.rows.map((r) => r.name),
    ]);

    const missing = [
      ...REQUIRED_FUNCTIONS.filter((name) => !encontrados.has(name)).map((n) => `function ${n}`),
      ...REQUIRED_TABLES.filter((name) => !encontrados.has(name)).map((n) => `table ${n}`),
    ];

    return missing.length === 0
      ? {
          ok: true,
          detail: { schemaObjects: REQUIRED_FUNCTIONS.length + REQUIRED_TABLES.length },
        }
      : {
          ok: false,
          detail: {
            missing,
            hint: "schema incompleto — a migração provavelmente não foi aplicada neste banco",
          },
        };
  } catch (error) {
    return {
      ok: false,
      detail: { error: error instanceof Error ? error.message : "falha desconhecida" },
    };
  }
}
