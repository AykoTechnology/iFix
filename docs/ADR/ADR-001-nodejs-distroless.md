# ADR-001: Adoção de Node.js em Imagens Google Distroless

- **Status:** Aprovado
- **Data:** 2026-09-22

## Contexto

A plataforma precisa rodar em Kubernetes com a menor superfície de ataque possível, já que expõe dados sensíveis de múltiplos domínios corporativos (TI, RH, Finanças, Instalações).

## Decisão

Utilizar Node.js 22 LTS com TypeScript estrito, empacotado em multi-stage build cujo estágio final é `gcr.io/distroless/nodejs22-debian12`. Nenhum shell, gerenciador de pacotes ou utilitário de SO é incluído na imagem de produção.

## Consequências

- Elimina binários vulneráveis e pacotes desnecessários nos contêineres de produção.
- Qualquer ferramenta de diagnóstico deve ser executada via *ephemeral debug containers* do Kubernetes (`kubectl debug`), nunca via `exec` no contêiner de produção.
- Build multi-estágio obrigatório: estágio `node:22-alpine` compila/typecheck/`npm ci --omit=dev`; estágio final copia apenas artefatos compilados (`dist/`) e `node_modules` de produção.
- `USER nonroot:nonroot`, `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false` são obrigatórios no `securityContext` do pod — gravações locais só são permitidas em volume montado em `/tmp`.
- Logs devem ir para stdout/stderr (nunca para arquivo local), pois não há shell para inspecionar arquivos dentro do contêiner.
