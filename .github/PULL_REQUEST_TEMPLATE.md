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

Marque o que se aplica; **justifique o que não se aplica** em vez de deixar em branco. Texto completo na § 10.2 da especificação.

### Contrato e tipos
- [ ] TypeScript estrito, sem `any` não justificado; schemas Zod cobrindo as novas fronteiras de dado.
- [ ] `docs/api/openapi.json` regenerado se rotas HTTP mudaram; mudança incompatível de contrato foi versionada (ADR-009).

### Isolamento e auditoria
- [ ] Toda tabela nova tem `ROW LEVEL SECURITY` ativa (ADR-003).
- [ ] Teste de vazamento em **dois eixos**: entre locatários **e** entre espaços de serviço (ADR-012).
- [ ] Mutações sensíveis novas disparam trilha de auditoria por trigger, com `trace_id` (ADR-007).
- [ ] Campos com dado pessoal classificados e com retenção declarada (ADR-013).

### Assincronia
- [ ] Consumidores de fila novos/alterados são idempotentes — mensagem duplicada não corrompe estado (ADR-002).
- [ ] DLQ configurada e com alerta para toda fila nova.
- [ ] `traceparent` atravessa qualquer fronteira de fila introduzida (ADR-008).

### Regras de negócio
- [ ] Nenhum `eval()` ou interpretador dinâmico; lógica condicional passa pelo BRE ou pelo motor de workflow (ADR-004, ADR-006).

### Interface
- [ ] Componentes novos passam no Axe-core sem violação WCAG 2.2 AA (ADR-005).
- [ ] **Revisão manual registrada**: navegação por teclado e leitor de tela — o Axe não detecta ordem de foco nem cor como única informação.
- [ ] Nenhum valor literal de design (cor/espaçamento/raio) fora de `/design-system/tokens.json` (ADR-011).
- [ ] Prioridade, SLA e estado acompanhados de rótulo textual.

### Testes e segurança
- [ ] Cobertura > 85% no código novo/alterado; integração rodou contra Postgres efêmero (ADR-018).
- [ ] Trivy sem CVE com CVSS ≥ 7.0 (se altera `Dockerfile`/dependências).
- [ ] Nenhum segredo em código, imagem, ConfigMap ou arquivo de ambiente comitado.

### Documentação
- [ ] `docs/CONTEXT.md` atualizado: mapa de filas, mapa de tabelas, módulos concluídos, pendências.
- [ ] Se alterou ADR: editou a **§ 9 da especificação** e rodou `node scripts/sync-adrs.mjs` (nunca o arquivo gerado).

## Como testar

<!-- Passos para o revisor reproduzir localmente. -->

## Evidências

<!-- Mudanças de UI: antes/depois + resultado do Axe-core + nota da verificação por teclado.
     Correção de bug: prova da falha antes e da passagem depois. -->
