import { z } from "zod";

/**
 * Schemas Zod das rotas. São a fonte única do contrato: o OpenAPI é derivado daqui
 * (ADR-009), e a validação em tempo de execução usa exatamente o mesmo schema que
 * gera a documentação — o que torna estruturalmente impossível a documentação
 * divergir da implementação.
 */

export const probeResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  detail: z.record(z.unknown()),
});

export const personSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  isActive: z.boolean(),
});

export const personListSchema = z.object({
  data: z.array(personSchema),
});

export const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

export type Person = z.infer<typeof personSchema>;
