import { z } from "zod";

/**
 * Formato de resposta das três probes — compartilhado entre `src/api` e
 * `src/workers` porque as duas espécies de serviço expõem o mesmo contrato de saúde
 * ao Kubernetes (ADR-001, ADR-008). Uma cópia em cada pacote divergiria exatamente
 * como o `withRequestContext` teria divergido se tivesse ficado só em `src/api`.
 */
export const probeResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  detail: z.record(z.unknown()),
});

export type ProbeResponse = z.infer<typeof probeResponseSchema>;
