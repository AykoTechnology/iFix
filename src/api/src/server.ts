import { randomUUID } from "node:crypto";
import fastifySwagger from "@fastify/swagger";
import Fastify, { type FastifyInstance } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { Pool } from "pg";
import {
  checkLiveness,
  checkReadiness,
  checkStartup,
  withRequestContext,
  type RequestContext,
} from "@ifix/shared";
import { AuthError, extractBearerToken, extractTraceId, verifyClaims } from "./auth.js";
import type { Config } from "./config.js";
import { errorSchema, personListSchema, probeResponseSchema } from "./routes/schemas.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Preenchido pelo hook de autenticação nas rotas que a exigem. */
    context?: RequestContext;
  }
}

export interface BuiltServer {
  app: FastifyInstance;
  pool: Pool;
}

/**
 * O `await` no registro do Swagger não é cosmético: plugins do Fastify carregam de
 * forma assíncrona, e o coletor de rotas do Swagger é um hook `onRoute`. Registrar as
 * rotas antes de o plugin estar carregado produz um documento OpenAPI **vazio** — e,
 * pior, um gate de drift que compara vazio com vazio e passa sempre.
 */
export async function buildServer(config: Config): Promise<BuiltServer> {
  const pool = new Pool({
    host: config.PGHOST,
    port: config.PGPORT,
    database: config.PGDATABASE,
    user: config.PGUSER,
    password: config.PGPASSWORD,
    max: config.PG_POOL_MAX,
  });

  const app = Fastify({
    // Log estruturado em JSON para stdout: a imagem Distroless não tem shell, então
    // não há como ler arquivo dentro do contêiner (ADR-001).
    logger: {
      level: config.NODE_ENV === "test" ? "silent" : "info",
      formatters: { level: (label) => ({ level: label }) },
    },

    // O trace-id do W3C Trace Context vira o id de requisição do Fastify. Assim toda
    // linha de log já sai correlacionada, sem precisar lembrar de incluir o campo —
    // e o mesmo valor chega à trilha de auditoria pela GUC app.trace_id (ADR-008).
    genReqId: (request) =>
      extractTraceId(request.headers.traceparent as string | undefined) ?? randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const jwtSecret = new TextEncoder().encode(config.JWT_SECRET);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AuthError) {
      // A razão da recusa vai para o log, não para o cliente: distinguir "token
      // malformado" de "assinatura inválida" na resposta ajuda quem está sondando.
      request.log.warn({ reason: error.reason }, "autenticação recusada");
      return reply.status(401).send({ error: "unauthorized", message: "credencial inválida" });
    }
    request.log.error({ err: error }, "erro não tratado");
    return reply.status(500).send({ error: "internal_error", message: "erro interno" });
  });

  await app.register(fastifySwagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "iFix API",
        description: "Plataforma ESM/ITSM. Contrato derivado dos schemas Zod (ADR-009).",
        version: "0.1.0",
      },
      tags: [
        { name: "health", description: "Probes de saúde do pod (§ 6.3)" },
        { name: "people", description: "Pessoas do locatário" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  registerHealthRoutes(app, pool, config);
  registerPeopleRoutes(app, pool, jwtSecret);

  app.addHook("onClose", async () => {
    await pool.end();
  });

  return { app, pool };
}

function registerHealthRoutes(app: FastifyInstance, pool: Pool, config: Config): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.route({
    method: "GET",
    url: "/health/live",
    schema: {
      tags: ["health"],
      summary: "Liveness — o processo deve continuar vivo?",
      description:
        "Observa apenas o atraso do event loop. Não consulta o banco por decisão: " +
        "uma indisponibilidade de banco não pode fazer o Kubernetes matar todos os pods.",
      response: { 200: probeResponseSchema, 503: probeResponseSchema },
    },
    handler: (_request, reply) => {
      const result = checkLiveness(config.EVENT_LOOP_LAG_THRESHOLD_MS);
      void reply
        .status(result.ok ? 200 : 503)
        .send({ status: result.ok ? "ok" : "degraded", detail: result.detail });
    },
  });

  typed.route({
    method: "GET",
    url: "/health/ready",
    schema: {
      tags: ["health"],
      summary: "Readiness — o processo deve receber tráfego agora?",
      description: "Verifica conectividade e latência do pooler. Remove do balanceador sem matar.",
      response: { 200: probeResponseSchema, 503: probeResponseSchema },
    },
    handler: async (_request, reply) => {
      const result = await checkReadiness(pool);
      return reply
        .status(result.ok ? 200 : 503)
        .send({ status: result.ok ? "ok" : "degraded", detail: result.detail });
    },
  });

  typed.route({
    method: "GET",
    url: "/health/startup",
    schema: {
      tags: ["health"],
      summary: "Startup — a inicialização terminou?",
      description:
        "Confere que os objetos de schema exigidos existem. Falha aqui costuma " +
        "significar aplicação implantada antes de a migração ter rodado.",
      response: { 200: probeResponseSchema, 503: probeResponseSchema },
    },
    handler: async (_request, reply) => {
      const result = await checkStartup(pool);
      return reply
        .status(result.ok ? 200 : 503)
        .send({ status: result.ok ? "ok" : "degraded", detail: result.detail });
    },
  });
}

function registerPeopleRoutes(app: FastifyInstance, pool: Pool, jwtSecret: Uint8Array): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.route({
    method: "GET",
    url: "/v1/people",
    schema: {
      tags: ["people"],
      summary: "Lista as pessoas visíveis ao chamador",
      description:
        "O recorte por locatário é feito pelas políticas RLS, não por filtro aqui " +
        "(ADR-003). A consulta não menciona tenant_id de propósito.",
      security: [{ bearerAuth: [] }],
      response: { 200: personListSchema, 401: errorSchema },
    },
    handler: async (request, reply) => {
      const token = extractBearerToken(request.headers.authorization);
      const claims = await verifyClaims(token, jwtSecret);

      const traceId = extractTraceId(request.headers.traceparent as string | undefined);
      const context: RequestContext = {
        claims,
        clientIp: request.ip,
        // `exactOptionalPropertyTypes` distingue ausente de undefined: a propriedade
        // só entra no objeto quando há valor.
        ...(traceId !== undefined && { traceId }),
      };

      const data = await withRequestContext(pool, context, async (client) => {
        const { rows } = await client.query<{
          id: string;
          email: string;
          full_name: string;
          is_active: boolean;
        }>("select id, email, full_name, is_active from public.people order by email");
        return rows.map((row) => ({
          id: row.id,
          email: row.email,
          fullName: row.full_name,
          isActive: row.is_active,
        }));
      });

      return reply.status(200).send({ data });
    },
  });
}
