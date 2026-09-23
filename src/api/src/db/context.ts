import type { Pool, PoolClient } from "pg";
import {
  CLIENT_IP_SETTING,
  JWT_CLAIMS_SETTING,
  TRACE_ID_SETTING,
  jwtClaimsSchema,
  type RequestContext,
} from "@ifix/shared";

/**
 * Executa uma unidade de trabalho com o contexto da requisição aplicado à transação.
 *
 * É o único ponto onde a aplicação informa ao banco quem está agindo. Tudo o mais
 * decorre daqui: as políticas RLS leem estas GUCs, e o gatilho de auditoria atribui
 * autoria a partir delas.
 *
 * ## Por que `set_config(..., true)` e não `false`
 *
 * O terceiro argumento é `is_local`. Com `true`, a configuração vive apenas até o
 * COMMIT ou ROLLBACK. Com `false`, ela persiste na **sessão** — e uma sessão, aqui, é
 * uma conexão de pool que volta para o pool e é entregue à próxima requisição.
 *
 * Usar `false` significaria que a requisição seguinte herdaria as claims da anterior:
 * um usuário do locatário A passaria a enxergar, legitimamente segundo a RLS, os dados
 * do locatário B. Seria uma quebra de isolamento invisível em teste unitário, invisível
 * em revisão de código, e detectável apenas sob concorrência em produção.
 *
 * O teste `não vaza contexto entre requisições na mesma conexão do pool` existe
 * exatamente para impedir que alguém "simplifique" isto de volta para `false`.
 */
export async function withRequestContext<T>(
  pool: Pool,
  context: RequestContext,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  // Validar antes de transformar em GUC: uma claim com forma inesperada faria as
  // funções app.* não encontrarem locatário, e o resultado seria vazio em vez de erro.
  const claims = jwtClaimsSchema.parse(context.claims);

  const client = await pool.connect();
  try {
    await client.query("begin");

    await client.query("select set_config($1, $2, true)", [
      JWT_CLAIMS_SETTING,
      JSON.stringify(claims),
    ]);

    if (context.traceId !== undefined) {
      await client.query("select set_config($1, $2, true)", [TRACE_ID_SETTING, context.traceId]);
    }
    if (context.clientIp !== undefined) {
      await client.query("select set_config($1, $2, true)", [CLIENT_IP_SETTING, context.clientIp]);
    }

    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    // Rollback em melhor esforço: se a própria conexão morreu, o COMMIT nunca ocorreu
    // e o erro original é o que interessa propagar.
    try {
      await client.query("rollback");
    } catch {
      /* conexão já perdida; o erro original prevalece */
    }
    throw error;
  } finally {
    client.release();
  }
}
