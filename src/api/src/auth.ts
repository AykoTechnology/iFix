import { jwtVerify } from "jose";
import { jwtClaimsSchema, type JwtClaims } from "@ifix/shared";

/**
 * Verificação do JWT emitido pelo GoTrue.
 *
 * A assinatura é verificada **antes** de as claims virarem GUC. Isso importa mais do
 * que parece: `app.is_service_role()` decide, a partir de uma claim, quem pode
 * atravessar locatários. Aceitar um token não verificado seria entregar essa decisão
 * a quem faz a requisição.
 */

export class AuthError extends Error {
  constructor(
    message: string,
    readonly reason: "missing" | "malformed" | "invalid",
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function extractBearerToken(header: string | undefined): string {
  if (header === undefined || header.length === 0) {
    throw new AuthError("cabeçalho Authorization ausente", "missing");
  }
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || token === undefined || token.length === 0) {
    throw new AuthError("esperado esquema Bearer", "malformed");
  }
  return token;
}

export async function verifyClaims(token: string, secret: Uint8Array): Promise<JwtClaims> {
  let payload: unknown;
  try {
    ({ payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] }));
  } catch (error) {
    throw new AuthError(
      `token rejeitado: ${error instanceof Error ? error.message : "erro desconhecido"}`,
      "invalid",
    );
  }

  // Assinatura válida não garante forma válida: um token legítimo de outra versão do
  // emissor pode não trazer tenant_id, e sem ele as políticas devolveriam vazio em
  // silêncio em vez de recusar o acesso.
  const claims = jwtClaimsSchema.safeParse(payload);
  if (!claims.success) {
    throw new AuthError(
      `claims em forma inesperada: ${claims.error.issues[0]?.message}`,
      "invalid",
    );
  }
  return claims.data;
}

const TRACEPARENT = /^00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/;

/**
 * Extrai o `trace-id` do cabeçalho W3C Trace Context (ADR-008).
 *
 * O valor alimenta a GUC `app.trace_id`, que o gatilho de auditoria grava em cada
 * mutação — é o que permite sair de "quem alterou este registro" e chegar ao trace
 * distribuído que executou a alteração.
 */
export function extractTraceId(traceparent: string | undefined): string | undefined {
  if (traceparent === undefined) return undefined;
  const match = TRACEPARENT.exec(traceparent.trim());
  if (match === null) return undefined;
  // Um trace-id só de zeros é inválido pela especificação do W3C.
  return match[1] === "0".repeat(32) ? undefined : match[1];
}
