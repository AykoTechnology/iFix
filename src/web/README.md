# src/web

Frontend React 19 + Tailwind CSS, consumindo `/design-system/tokens.json` como fonte única de verdade de design (ADR-011).

**Status:** não iniciado.

## Antes do primeiro componente

1. Gerar `tailwind.config.ts` a partir de `/design-system/tokens.json`.
2. Subir Storybook com `@storybook/addon-a11y` (Axe-core obrigatório por história, ADR-005).
3. Configurar cliente HTTP gerado a partir do OpenAPI publicado pela API (ADR-009) — não escrever chamadas fetch manuais para rotas já contratadas.

## Telas de referência

Ver `docs/design-system/screens.md` para as 7 telas prototipadas e o mapeamento para épicos/módulos.
