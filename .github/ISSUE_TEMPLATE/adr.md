---
name: Proposta de ADR
about: Nova decisão arquitetural a ser registrada
title: "[ADR] Título da decisão"
labels: adr
---

## Contexto

<!-- Qual problema, tensão ou risco motiva esta decisão. Se ela resolve um conflito entre
     dois requisitos já aprovados, diga quais — é o tipo de ADR mais valioso. -->

## Opções consideradas

<!-- Pelo menos duas, com trade-offs honestos. Uma opção que existe só para perder
     não é uma alternativa considerada. -->

## Decisão proposta

## Consequências

<!-- O que essa decisão obriga, proíbe ou torna mais caro daqui em diante.
     Incluir as consequências indesejáveis — elas são a parte útil do registro. -->

## Mecanismo de verificação

<!-- Como saberemos que a decisão está sendo respeitada? Gate de CI, teste, revisão manual?
     Decisão sem mecanismo tende a virar intenção. -->

---

### Como transformar esta proposta em ADR aprovado

1. Adicione a seção `### ADR-0NN: Título` na **§ 9 de `docs/ESM_ITSM_PLATFORM_SPEC.md`** (fonte única).
2. Registre o slug do arquivo no mapa `SLUGS` de `scripts/sync-adrs.mjs`.
3. Rode `node scripts/sync-adrs.mjs` para gerar `docs/ADR/ADR-0NN-<slug>.md`.
4. **Não edite o arquivo gerado** — o gate 12 da esteira falha se ele divergir da especificação.
