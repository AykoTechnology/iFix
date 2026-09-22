# ADR-005: Acessibilidade Universal como Critério de Bloqueio (WCAG 2.2 AA)

- **Status:** Aprovado
- **Data:** 2026-09-22

## Contexto

A plataforma atende usuários corporativos de todos os departamentos (incluindo RH e Facilities, tipicamente com maior diversidade de necessidades de acessibilidade que sistemas de TI puros) e pode estar sujeita a exigências regulatórias de acessibilidade digital dependendo do setor do cliente.

## Decisão

Nenhum componente de interface é incorporado ao Design System (`src/web/src/design-system/`) sem validação automatizada (Axe-core) e aprovação manual de conformidade com WCAG 2.2 Nível AA.

## Consequências

- Garante navegabilidade total via teclado, contraste cromático regulamentar e compatibilidade com leitores de tela em todos os módulos.
- Todo componente novo no Storybook roda `@storybook/addon-a11y` (Axe-core) como gate — PR que introduz violação é bloqueado, não é um warning.
- Testes E2E críticos (fila de chamados, formulário de catálogo, FlowBuilder) incluem passagem de navegação 100% por teclado como caso de teste, não só teste de mouse/clique.
- Regra de produto derivada (ver `docs/design-system/README.md`): cor nunca é o único portador de informação (prioridade, status, SLA sempre com rótulo textual) — isso é verificado tanto por Axe (contraste) quanto por revisão manual (Axe não detecta "cor como única informação").
- Toda tela nova exige registro de revisão manual de teclado/leitor de tela no PR (checklist do template, ver `.github/PULL_REQUEST_TEMPLATE.md`) antes do merge.
