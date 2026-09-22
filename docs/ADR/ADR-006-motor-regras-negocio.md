# ADR-006: Motor de Regras de Negócio Desacoplado do Motor de Workflow

- **Status:** Proposto
- **Data:** 2026-09-22
- **Contexto de origem:** Lacuna identificada na spec técnica original — "regras de negócio fluidas" foi um requisito explícito do briefing que não tinha componente arquitetural próprio.

## Contexto

O ADR-004 resolve orquestração de estado e aprovação (workflow). Mas várias decisões do produto são *condições reutilizáveis* que não pertencem à topologia de um fluxo específico: elegibilidade de SLA por criticidade de CI, roteamento automático por carga/skill do agente, elegibilidade de auto-aprovação por valor+departamento, ativação de recursos por tenant. Sem um motor próprio, essas regras tendem a virar `if` espalhados no código da API — o que viola a Regra de Ouro "Zero Scripts Imperativos em Regras de Negócio" tão logo cresçam em número.

## Decisão

Criar um **Business Rules Engine (BRE)** como pacote em `src/shared/src/rules-engine/`, consumido tanto pela API quanto pelos workers, com as seguintes características:

- Regras são registros em tabela `business_rules` (schema Zod: `condition` como árvore de expressão AST-JSON — `{ all: [...] } | { any: [...] } | { field, op, value }` —, `action`, `priority`, `scope` [tenant/workspace/global], `enabled`).
- O motor de workflow (ADR-004) invoca o BRE para avaliar blocos de "Condição"; o BRE nunca invoca o motor de workflow (dependência unidirecional).
- Editor visual de expressão (construtor "se/e/ou" por campo — não editor de texto) é a única forma de autoria, mesma filosofia zero-code do ADR-004.
- Toda avaliação de regra é logada com o conjunto de fatos de entrada e o resultado (auditoria de decisão, não só de mutação) — ver ADR-007.
- Regras suportam *dry-run* contra um payload de exemplo antes de ativação, no mesmo espírito do dry-run de workflow.

## Consequências

- Reduz duplicação: SLA, roteamento automático, elegibilidade de auto-aprovação e feature flags por tenant passam a usar a mesma primitiva, o mesmo editor visual e a mesma trilha de auditoria.
- Exige que toda nova "decisão condicional" de produto comece pela pergunta "isso é uma regra reutilizável ou uma transição específica de um fluxo?" — documentado como guia de decisão em `docs/CONTEXT.md`.
- Motor deve ser puro (sem I/O) para ser testável unitariamente com 100% das combinações de operador cobertas — é infraestrutura crítica, cobertura de teste exigida acima do piso geral de 85% do DoD.
