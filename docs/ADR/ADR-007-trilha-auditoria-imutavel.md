<!-- GERADO POR scripts/sync-adrs.mjs — NÃO EDITAR À MÃO.
     A fonte é docs/ESM_ITSM_PLATFORM_SPEC.md § 9. Edite lá e rode: node scripts/sync-adrs.mjs -->

# ADR-007: Trilha de Auditoria Universal Imutável (Append-Only Audit Log)

- **Status:** Aprovado
- **Decisão:** Toda mutação (`INSERT`, `UPDATE`, `DELETE`) em entidades governadas (Incidentes, Problemas, Mudanças, Itens de CMDB, Ativos, Usuários e Regras) dispara automaticamente o registro síncrono em esquema dedicado (`audit.logs`). Cada registro armazena: UUID, timestamp UTC de alta precisão, identificador do ator (`user_id`), identificador do locatário (`tenant_id`), endereço IP, operação, estado anterior (_pre-image_) e novo estado (_post-image_) em JSONB, além do identificador de rastreamento (`trace_id`).
- **Consequências:**
  - As tabelas de auditoria possuem políticas de banco que revogam sumariamente permissões de `UPDATE` e `DELETE` para qualquer usuário da aplicação, assegurando imutabilidade jurídica e conformidade para auditorias ISO 27001 e PinkVERIFY.
  - `[+]` A captura é feita por _trigger_ de banco, não por código de aplicação — auditoria que depende de o desenvolvedor lembrar de chamá-la falha exatamente no caminho excepcional que mais importa auditar.
  - `[+]` A dupla trilha de delegação (Épico 2.2) e a confirmação digitada de ações irreversíveis são **casos de uso** desta tabela única, não mecanismos paralelos.
  - `[+]` `audit.logs` é particionada por mês: o expurgo por retenção ocorre por `DROP PARTITION`, nunca por `DELETE` massivo (que seria, ele próprio, uma operação proibida na tabela).
  - `[+]` Registrar _pre-image_ e _post-image_ completos significa que **dados pessoais são copiados para dentro da trilha imutável**. Isso cria conflito direto com o direito de eliminação da LGPD e é resolvido no ADR-013 — ADR-007 e ADR-013 devem ser lidos em conjunto, jamais isoladamente.
  - `[+]` O volume de escrita dobra em tabelas de alta rotatividade. O impacto em latência de escrita precisa ser medido no teste de carga (Épico 12.7) antes do GA.

---

Contexto completo, backlog relacionado e demais decisões: `docs/ESM_ITSM_PLATFORM_SPEC.md`.
