# Contribuindo com o iFix

Este repositório é desenvolvido por um par de agentes de IA coordenados (Codex implementa, Claude Code revisa) mais contribuidores humanos, sob o fluxo descrito em `docs/CONTEXT.md` § 8.

## Antes de abrir um PR

1. Leia `docs/CONTEXT.md` inteiro — é o documento vivo de estado do projeto.
2. Confirme que sua mudança está associada a uma história do `docs/BACKLOG.md` (ou abra uma Issue de bug/ADR usando os templates em `.github/ISSUE_TEMPLATE/`).
3. Releia as **Regras de Ouro** (`docs/CONTEXT.md` § 6) — são bloqueantes, não sugestões.

## Padrões de código

- TypeScript estrito em todo o monorepo (`src/api`, `src/workers`, `src/web`, `src/shared`).
- Validação de fronteira sempre via Zod — nunca `any` para dado externo.
- Nenhum valor literal de design fora de `docs/design-system/tokens.json` (ADR-011).
- Commits em português ou inglês, mas descritivos e focados no "porquê" da mudança.

## Branches

- `main` — protegida, só recebe merge via PR aprovado com todos os gates de CI verdes.
- `agent/codex-*` — branches de implementação de agente.
- `claude/*` — branches de sessão do Claude Code (revisão, resolução de conflito, scaffolding).

## Pull Requests

Use o template em `.github/PULL_REQUEST_TEMPLATE.md`. PRs sem o checklist de DoD preenchido são retornados sem revisão de conteúdo.

Merge é sempre **Squash and Merge** (linearidade de histórico em `main`).

## Dúvidas de arquitetura

Abra uma proposta de ADR (`.github/ISSUE_TEMPLATE/adr.md`) em vez de decidir unilateralmente dentro de um PR de feature — decisões arquiteturais são registradas em `docs/ADR/` antes de serem implementadas.
