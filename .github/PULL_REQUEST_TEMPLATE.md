## Resumo

<!-- O que este PR faz e por quê. Referencie a Issue de épico/história. -->

Closes #

## Tipo de mudança

- [ ] Nova funcionalidade
- [ ] Correção de bug
- [ ] Débito técnico / refatoração
- [ ] Documentação / ADR
- [ ] Infraestrutura / CI-CD

## Checklist de Definição de Pronto (DoD)

Marque apenas o que se aplica a este PR; justifique o que não se aplica.

- [ ] TypeScript estrito, sem `any` não justificado; schemas Zod cobrindo as novas fronteiras de dado.
- [ ] Cobertura de testes unitários > 85% no código novo/alterado; testes de integração rodaram contra banco efêmero.
- [ ] Toda tabela nova tem `ROW LEVEL SECURITY` ativa + teste que prova isolamento entre tenants/workspaces (ADR-003).
- [ ] Consumidores de fila novos/alterados são idempotentes (mensagem duplicada não corrompe estado).
- [ ] Nenhum `eval()`/interpretador dinâmico introduzido; lógica condicional de negócio passa pelo motor de regras/workflow (ADR-004, ADR-006).
- [ ] Componentes de UI novos passam no Axe-core (WCAG 2.2 AA) e foram testados por teclado.
- [ ] Nenhum valor literal de design (cor/espaçamento/raio) fora de `docs/design-system/tokens.json` (ADR-011).
- [ ] `docs/CONTEXT.md` atualizado (módulos concluídos, mapa de filas/tabelas, pendências).
- [ ] `docs/api/openapi.json` regenerado se rotas HTTP mudaram (ADR-009).
- [ ] Imagem Distroless: Trivy sem CVE com CVSS ≥ 7.0 (se este PR altera `Dockerfile`/dependências).
- [ ] Eventos de auditoria emitidos para mutações sensíveis novas (ADR-007), se aplicável.

## Como testar

<!-- Passos para revisor reproduzir localmente. -->

## Screenshots / evidência de acessibilidade

<!-- Para mudanças de UI: antes/depois + resultado do Axe-core. -->
