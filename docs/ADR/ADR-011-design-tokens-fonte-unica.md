# ADR-011: Design Tokens como Fonte Única de Verdade

- **Status:** Aprovado
- **Data:** 2026-09-22
- **Contexto de origem:** Formalização da prática já adotada ao transcrever o handoff do Claude Design para `docs/design-system/tokens.json` — necessária para não haver drift entre a intenção de design e o Tailwind config do frontend.

## Contexto

O handoff de design chega como protótipo HTML/CSS estático (`.dc.html`), não como código de produção (ver `design-system-ifix/README.md` do bundle recebido). Sem um passo de tradução explícito e versionado, é fácil que implementadores copiem valores de cor/espaçamento ad-hoc diretamente do HTML do protótipo, criando divergência silenciosa ao longo do tempo.

## Decisão

`docs/design-system/tokens.json` é a única fonte de verdade para cor, tipografia, espaçamento, raio, elevação e regras de layout. `src/web/tailwind.config.ts` é gerado/sincronizado a partir desse arquivo (script determinístico, não edição manual paralela). Qualquer atualização de design entra primeiro em `docs/design-system/` (com atualização do handoff original arquivado, se houver nova versão), depois se propaga ao Tailwind config e aos componentes.

## Consequências

- PR que altera cor/espaçamento/raio diretamente em `src/web` sem alteração correspondente em `docs/design-system/tokens.json` é sinal de drift e deve ser rejeitado em revisão.
- Componentes React não usam valores literais de cor/espaçamento (`#723CEB`, `24px`) — sempre a classe Tailwind/token derivado do tokens.json.
- Novas telas de design (gap listado em `docs/design-system/screens.md`) devem produzir tokens novos (se houver) neste arquivo antes da implementação, não durante.
- Tema claro e escuro compartilham a mesma estrutura de tokens com valores por tema (`color.dark`/`color.light`) — nenhum componente hardcoda qual tema está ativo; sempre consome a variável CSS/token resolvido.
