# ADR-004: Motor de Workflows Declarativo Zero-Code em JSON DSL

- **Status:** Aprovado
- **Data:** 2026-09-22

## Contexto

Fluxos de aprovação, transições de estado de chamado e regras de SLA precisam ser configuráveis por administradores de negócio sem deploy de código, mantendo conformidade com os processos auditáveis PinkVERIFY e sem abrir superfície de execução de código arbitrário.

## Decisão

Workflows são representados como statecharts em JSON, validados por schema Zod, e interpretados por um motor determinístico em Node.js. A UI do FlowBuilder (tela de referência 04) é a única forma de autoria — o JSON gerado é sempre somente-leitura para o usuário final, nunca um campo de texto livre editável.

## Consequências

- Impede injeção de scripts arbitrários pelos usuários (proibição expressa de `eval()`/interpretadores dinâmicos — ver Regras de Ouro).
- Mantém retrocompatibilidade durante atualizações de versão: cada workflow publicado carrega uma versão (`reembolso.v4`) e o motor precisa suportar execução de instâncias em andamento criadas sob versões anteriores até sua conclusão natural.
- Toda publicação de workflow passa por validação `dry-run` (verificação de integridade referencial: estados órfãos, transições sem destino, condições referenciando campos inexistentes) antes de ficar disponível em produção — não é opcional, é parte do fluxo de publicação.
- O motor de workflow **não é** o motor de regras de negócio genérico (ver ADR-006) — workflow orquestra *estado e aprovação*; regras de negócio avaliam *condições reutilizáveis* (elegibilidade, roteamento, SLA). Um bloco de "Condição" no FlowBuilder invoca o motor de regras, não reimplementa lógica de condição própria.
- Preserva conformidade com as 25 categorias de processo auditável PinkVERIFY, já que cada transição de estado é um evento versionado e auditável por construção.
