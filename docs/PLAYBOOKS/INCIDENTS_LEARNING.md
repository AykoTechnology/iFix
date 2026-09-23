# Playbook: Aprendizagem Contínua sobre Falhas

Base de conhecimento operacional sobre falhas em testes ou incidentes de produção/CI. Cada entrada descreve causa-raiz, mitigação definitiva e a regra nova introduzida para evitar reincidência — em código (lint/teste) sempre que possível, não apenas em texto.

Toda entrada nova é adicionada ao **topo** da lista (mais recente primeiro). Nenhuma entrada é removida; se uma regra for revogada, adiciona-se uma entrada explicando por quê.

## Formato de entrada

```md
### AAAA-MM-DD — Título curto do incidente/falha

- **Sintoma**: o que foi observado (teste vermelho, erro em produção, alerta).
- **Causa-raiz**: por que aconteceu, não só o que aconteceu.
- **Mitigação aplicada**: o que foi corrigido no código/infra.
- **Regra nova**: o que muda para evitar reincidência (lint rule, teste novo, checklist de PR, ADR).
- **Referência**: PR/issue/commit relacionado.
```

---

### 2026-09-22 — Gate de contrato de API aprovaria sempre, comparando documento vazio com documento vazio

- **Sintoma**: ao inspecionar o `openapi.json` recém-gerado, o documento não continha **nenhuma** rota — ainda que as quatro estivessem registradas e respondendo nos testes.
- **Causa-raiz**: plugins do Fastify carregam de forma assíncrona. O coletor de rotas do `@fastify/swagger` é um hook `onRoute`, e o registro foi feito com `void app.register(...)` seguido do registro síncrono das rotas. As rotas entraram antes de o plugin estar carregado, então o hook nunca as viu.
- **Por que é grave além do incidente**: o gate 6 da esteira compara o `openapi.json` versionado com o gerado. Com ambos vazios, ele aprova — sempre. Um gate que nunca reprova é indistinguível de gate nenhum, e o ADR-009 inteiro passaria a ser uma intenção documentada em vez de um contrato verificado. O defeito não produz erro, não produz aviso e não quebra teste algum: produz silêncio.
- **Mitigação aplicada**: `buildServer` passou a ser assíncrona e a aguardar o registro do plugin antes de declarar as rotas.
- **Regras novas**:
  1. **Todo gate de comparação precisa de um teste que garanta conteúdo**, não apenas igualdade. `tests/api-http.test.ts` afirma que o documento descreve as rotas esperadas, que o schema de resposta foi derivado do Zod e que a rota de negócio está marcada como autenticada.
  2. Ao adicionar um gate novo à esteira, perguntar explicitamente: **qual é o estado em que este gate aprovaria por vacuidade?** Se existir, ele precisa de uma asserção que o exclua.
- **Referência**: `src/api/src/server.ts`, `tests/api-http.test.ts`, ADR-009.

### 2026-09-22 — Suíte de vazamento ficaria verde sem provar nada, por estado residual de cluster

- **Sintoma**: após uma rodada de verificação por mutação, a execução de baseline voltou com 12 de 23 testes falhando — mesmo com o banco recriado do zero e nenhuma alteração no código.
- **Causa-raiz**: uma das mutações havia executado `alter role authenticated bypassrls` para confirmar que a suíte detectava a perda de isolamento. Papéis no PostgreSQL são objetos de **cluster**, não de banco: `drop database` não os remove nem restaura seus atributos. O `bootstrap.sql` criava os papéis com `if not exists`, de modo que, uma vez existindo com atributo errado, nenhum reset posterior o corrigia. Com `BYPASSRLS` ativo a RLS deixa de ser aplicada por completo.
- **Por que é grave além do incidente**: o modo de falha silencioso é o inverso do observado. Se o experimento tivesse ocorrido antes de escrever os testes, a suíte inteira passaria — provando nada — e ninguém teria motivo para desconfiar. Um banco de teste permissivo é pior que um banco quebrado, porque produz confiança injustificada exatamente na garantia mais crítica do produto.
- **Mitigação aplicada**: `scripts/local-db/bootstrap.sql` deixou de apenas criar o papel quando ausente e passou a **reafirmar os atributos sempre** (`nosuperuser nobypassrls ...`), seguido de uma verificação que lança exceção se algum papel de aplicação ainda tiver `BYPASSRLS` ou `SUPERUSER` ao fim do bootstrap.
- **Regras novas**:
  1. Setup de ambiente de teste é **idempotente sobre o estado desejado**, não sobre a existência do objeto. `if not exists` é insuficiente sempre que o objeto carrega atributos que importam.
  2. A suíte de vazamento inclui um teste estrutural que falha se qualquer papel de aplicação tiver `BYPASSRLS` ou `SUPERUSER` (`tests/rls.test.ts`) — a proteção não depende só do script de bootstrap.
  3. **Verificação por mutação passa a ser obrigatória** para testes de isolamento: um teste de segurança que nunca foi visto falhando não é evidência de nada. As seis mutações usadas estão documentadas no PR da fundação.
- **Referência**: migração `20260922000001_foundation.sql`, `tests/rls.test.ts`, ADR-003, ADR-018.
