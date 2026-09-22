import { z } from "zod";

/**
 * Claims do JWT — o contrato entre a autenticação e as políticas RLS do banco.
 *
 * Este schema não é conveniência de tipagem: as funções `app.current_tenant_id()`,
 * `app.current_workspace_ids()` e `app.is_service_role()` da migração 0001 leem
 * exatamente estes campos. Alterar um nome aqui sem alterar lá rompe o isolamento
 * silenciosamente — a consulta passa a não encontrar locatário e devolve vazio, ou
 * pior, uma política mal escrita passa a liberar tudo.
 *
 * Por isso a forma das claims é validada, e não apenas assumida.
 */
export const jwtClaimsSchema = z.object({
  /** Identificador da pessoa autenticada (`public.people.id`). */
  sub: z.string().uuid(),

  /** Eixo 1 de isolamento — fronteira dura entre organizações (ADR-003). */
  tenant_id: z.string().uuid(),

  /**
   * Eixo 2 de isolamento — espaços de serviço de que a pessoa participa (ADR-012).
   * Lista vazia é legítima: pessoa sem espaço não enxerga dado com escopo de espaço.
   */
  workspace_ids: z.array(z.string().uuid()).default([]),

  /**
   * `service_role` atravessa locatários por necessidade operacional e é a exceção
   * mais sensível do sistema. Continua sujeito à RLS — o que muda é o predicado — e
   * todo acesso seu é auditado (ADR-003).
   */
  role: z.enum(["authenticated", "service_role"]).default("authenticated"),

  email: z.string().email().optional(),
});

export type JwtClaims = z.infer<typeof jwtClaimsSchema>;

/**
 * Nome da GUC que transporta as claims até as políticas. É a mesma que o PostgREST
 * usa no Supabase, de modo que o comportamento é idêntico em banco local e gerenciado.
 */
export const JWT_CLAIMS_SETTING = "request.jwt.claims";

/** GUC de correlação: ligada ao `traceparent` do W3C Trace Context (ADR-008). */
export const TRACE_ID_SETTING = "app.trace_id";

/** GUC com o IP de origem real, já que a conexão chega pelo pooler (ADR-007). */
export const CLIENT_IP_SETTING = "app.client_ip";

/**
 * Contexto de execução aplicado a cada transação. É o único ponto onde a aplicação
 * informa ao banco quem está agindo — tudo o mais decorre daqui, inclusive a
 * atribuição de autoria na trilha de auditoria.
 */
export interface RequestContext {
  claims: JwtClaims;
  traceId?: string;
  clientIp?: string;
}
