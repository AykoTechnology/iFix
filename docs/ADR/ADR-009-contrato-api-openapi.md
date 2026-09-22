<!-- GERADO POR scripts/sync-adrs.mjs — NÃO EDITAR À MÃO.
     A fonte é docs/ESM_ITSM_PLATFORM_SPEC.md § 9. Edite lá e rode: node scripts/sync-adrs.mjs -->

# ADR-009: Governança Contract-First via Schemas Zod Gerando OpenAPI 3.1

- **Status:** Aprovado
- **Decisão:** Elimina-se a escrita manual de documentação OpenAPI. O contrato de interface é definido estritamente através de schemas TypeScript com Zod em `/src/shared`. A documentação OpenAPI 3.1 e as definições TypeScript dos clientes de frontend são geradas automaticamente no build através de `@fastify/swagger` integrado ao `@fastify/type-provider-zod`.
- **Consequências:**
  - Elimina integralmente o risco de desvio (_drift_) entre a especificação da API e a implementação real em produção. A validação de _payloads_ na entrada da rota é garantida em tempo de execução pelos mesmos schemas que geram a documentação.
  - `[+]` O `openapi.json` gerado é versionado no repositório justamente para que a mudança de contrato apareça como _diff_ no PR — é o sinal que dispara a discussão sobre compatibilidade. O gate 6 da §6.4 falha se o arquivo versionado divergir do gerado.
  - `[+]` Mudança incompatível de contrato exige versionamento de rota (`/v2/...`) e período de convivência declarado. Como a API é consumida por integrações de clientes (Épico 15.1), quebrar contrato silenciosamente quebra sistemas de terceiros.
  - `[+]` Rotas internas/administrativas são marcadas explicitamente e excluídas da especificação pública distribuída a parceiros — a geração automática publicaria tudo por padrão.
  - `[+]` O cliente TypeScript do frontend é gerado a partir do mesmo contrato; escrever chamada `fetch` manual para rota já contratada é desvio de padrão detectável em revisão.

---

Contexto completo, backlog relacionado e demais decisões: `docs/ESM_ITSM_PLATFORM_SPEC.md`.
