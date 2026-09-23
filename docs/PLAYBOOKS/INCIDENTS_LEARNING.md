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

### 2026-09-23 — Quatro dos cinco jobs da primeira execução real da esteira reprovaram

- **Sintoma**: o primeiro PR a exercitar `ci.yml` e `codeql.yml` em runners de verdade reprovou em quatro jobs, por quatro causas distintas — três delas impossíveis de observar localmente.
- **Causas-raiz**:
  1. **Gate 3/4/5** — `scripts/local-db/bootstrap.sql` terminava com `grant connect on database ifix_dev`, resquício de quando o banco local tinha nome fixo. O `reset.sh` já concede o mesmo acesso usando o nome real do banco. No ambiente de desenvolvimento o banco `ifix_dev` existia, então a linha era inócua; no runner efêmero, não existia e derrubava o bootstrap inteiro.
  2. **Gate 8** — `gitleaks/gitleaks-action@v2` exige licença paga quando o repositório pertence a uma organização. A action abortou antes de varrer coisa alguma.
  3. **Gate 9** — `aquasecurity/trivy-action@0.28.0` não existe; as tags dessa action são prefixadas com `v`. O job morreu na resolução da action, sem chegar a construir a imagem.
  4. **CodeQL** — faltava a permissão `actions: read`; a action consulta a própria execução ao montar o relatório e terminou em `Resource not accessible by integration`.
- **Por que é grave além do incidente**: as causas 2, 3 e 4 têm o mesmo formato — o gate **não reprovou por encontrar problema, reprovou por não ter chegado a rodar**. A diferença entre "o varredor de segredos não encontrou nada" e "o varredor de segredos não executou" não aparece no resumo do PR: as duas situações são uma linha vermelha ou verde. Um gate quebrado por configuração é o mesmo defeito documentado na entrada do contrato OpenAPI vazio, visto de outro ângulo.
- **Mitigação aplicada**: linha residual removida do bootstrap; gitleaks passou a rodar pelo binário (MIT, sem restrição de licença) com versão fixada; `trivy-action` corrigida para `v0.36.0`; `actions: read` adicionada ao CodeQL. O gitleaks, ao rodar de fato, encontrou três ocorrências — todas o mesmo literal de segredo de teste exigido pelo validador de configuração (32 caracteres no mínimo), tratadas em `.gitleaks.toml` com recorte estreito: aquele valor específico, e só em `tests/`.
- **Regras novas**:
  1. **Referência a action externa é verificada contra as tags reais do repositório**, não escrita de memória. Erro de tag reprova o job de um jeito que se parece com falha de conteúdo.
  2. **A primeira execução de um gate novo é lida no log, não no ícone.** Confirmar que ele produziu saída de análise — contagem de commits varridos, imagem construída, alertas processados — antes de considerá-lo ativo.
  3. **Alerta de segredo em teste é silenciado pelo valor, nunca pelo diretório.** Uma alçada `tests/` inteira esconderia uma credencial real colada num teste, que é um dos caminhos reais de vazamento.
- **Referência**: PR #22, `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `.gitleaks.toml`, `scripts/local-db/bootstrap.sql`.
