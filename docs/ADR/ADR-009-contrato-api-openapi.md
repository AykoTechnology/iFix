# ADR-009: Contrato de API "Contract-First" via Zod → OpenAPI

- **Status:** Proposto
- **Data:** 2026-09-22
- **Contexto de origem:** DoD original exige "esquemas OpenAPI atualizados" como item de conclusão, mas não define como evitar que a documentação diverja do código — risco real em qualquer time que mantém spec manualmente.

## Contexto

A plataforma tem múltiplos consumidores do mesmo contrato de API: o frontend React, um SDK público (para integrações de clientes ESM) e, futuramente, parceiros de integração (Slack/Teams, ferramentas de monitoramento alimentando o AIOps). Um contrato desalinhado entre implementação e documentação quebra confiança e integrações silenciosamente.

## Decisão

Toda rota Fastify declara seu schema de entrada/saída em Zod (já mandatório pela spec); usar `zod-to-openapi` para gerar o documento OpenAPI 3.1 automaticamente a partir desses schemas no build, publicado em `docs/api/openapi.json` e servido em `/docs` pela própria API em ambientes não-produtivos. Nenhum endpoint entra em produção sem passar por essa geração (o build falha se um schema Zod não puder ser convertido).

## Consequências

- Elimina o risco de "documentação desatualizada" por construção — o contrato é derivado do código, nunca escrito à mão em paralelo.
- Permite gerar um SDK TypeScript de cliente automaticamente a partir do OpenAPI para o frontend e para integrações externas (reduz erro manual de tipagem entre `src/web` e `src/api`).
- Breaking changes de contrato ficam visíveis em diff de PR (o `openapi.json` gerado muda), servindo como sinal para exigir versionamento de rota (`/v2/...`) quando necessário.
- Rotas administrativas internas que não devem ser expostas publicamente precisam de tag explícita `internal` no schema para serem excluídas da spec pública distribuída a parceiros.
