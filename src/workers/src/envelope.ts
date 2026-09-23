import { z } from "zod";

/**
 * Envelope de evento — o contrato entre `app.publish_event` e os consumidores.
 *
 * Validado, e não assumido, pelo mesmo motivo das claims do JWT: um campo ausente
 * aqui não produz erro, produz comportamento errado. Sem `tenant_id` o worker não
 * aplicaria RLS; sem `event_id` a idempotência passaria a depender de um
 * identificador que a fila reatribui a cada reentrega.
 *
 * A forma espelha o `jsonb_build_object` da migração `20260923000001_queues.sql`.
 * Alterar um lado sem o outro é o que este schema existe para transformar em falha
 * ruidosa em vez de silenciosa.
 */
export const envelopeSchema = z.object({
  /** Chave de idempotência (§ 5.3). Gerada pelo produtor, estável entre reentregas. */
  event_id: z.string().uuid(),
  event_type: z.string().min(1),
  tenant_id: z.string().uuid(),
  /** Quem originou o evento, para que a auditoria do efeito assíncrono tenha autor. */
  actor_id: z.string().uuid(),
  /** Correlação com o rastro distribuído; nulo quando a origem não tinha rastro. */
  trace_id: z.string().nullable().default(null),
  payload: z.record(z.unknown()).default({}),
});

export type Envelope = z.infer<typeof envelopeSchema>;
