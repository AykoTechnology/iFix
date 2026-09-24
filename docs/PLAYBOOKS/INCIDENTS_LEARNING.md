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

### 2026-09-24 — O Dockerfile nunca construiu uma imagem para o worker

- **Sintoma**: nenhum. Foi encontrado ao planejar o chart Helm dos workers — o Deployment precisava referenciar uma imagem `ifix-workers` que não existia em lugar nenhum.
- **Causa-raiz**: o `Dockerfile` original tinha um único estágio final, que produzia `ifix-api`. O `container` job da esteira (gate 9) também construía e varria só essa imagem. O serviço `src/workers` sempre existiu, compilava, tinha teste — mas não tinha empacotamento. O gap não aparecia em teste algum porque nenhum teste verifica "existe uma imagem para este serviço": isso só se descobre tentando implantar.
- **Por que é grave além do incidente**: é a classe de lacuna mais difícil de pegar por gate automático — não é um valor errado, é a **ausência completa** de um artefato que ninguém tinha motivo para procurar até precisar dele. Os quatro incidentes anteriores desta lista são sobre um gate medindo a coisa errada; este é sobre nenhum gate ter existido para medir a coisa nenhuma.
- **Mitigação aplicada**: o `Dockerfile` foi reestruturado em estágios compartilhados (`build`, `deps`, `runtime-base`) com dois estágios finais nomeados, `runtime-api` e `runtime-workers` — `docker build --target <nome>` escolhe qual sobe, e a ausência da flag mantém o comportamento anterior (o último estágio do arquivo). O `container` job da esteira passou a rodar em matriz, construindo e varrendo os dois alvos.
- **Regra nova**: **todo serviço com processo próprio (`main()`, ponto de entrada, Dockerfile `CMD`) tem uma imagem de contêiner correspondente construída e varrida na esteira** — não basta compilar e testar. A pergunta que teria pego isto mais cedo: "se eu fosse implantar este serviço hoje, que imagem eu usaria?".
- **Referência**: `Dockerfile`, `.github/workflows/ci.yml` (job `container`), `charts/workers/`.

### 2026-09-24 — `Promise.resolve(fn())` deixa escapar um `throw` síncrono dentro de `fn`

- **Sintoma**: `tests/worker-probes.test.ts` travou em "Test timed out in 5000ms" ao testar uma rota de probe cuja função de verificação lança de forma síncrona — o teste que existe justamente para provar que a probe nunca derruba o processo.
- **Causa-raiz**: `createProbeServer` despachava a rota com `Promise.resolve(verificar())`. Isso avalia `verificar()` **imediatamente**, fora de qualquer `.then`/`.catch` — o `Promise.resolve` só embrulha o valor de retorno, não a chamada. Um `throw` síncrono dentro de `verificar` propaga como exceção não tratada no listener HTTP, e a requisição nunca recebe resposta.
- **Por que é grave além do incidente**: a probe HTTP é o único canal pelo qual o Kubernetes decide se um pod está vivo. Uma verificação que trava a resposta em vez de responder 503 tem o efeito oposto do pretendido — o kubelet para de saber a diferença entre "processando devagar" e "morto", exatamente no caminho que deveria ser a rede de segurança.
- **Mitigação aplicada**: trocado para `Promise.resolve().then(verificar)`, que encadeia a chamada **dentro** da promise, de modo que qualquer exceção síncrona ou assíncrona chegue ao `.catch()` que responde 500.
- **Regra nova**: **`Promise.resolve(fn())` e `Promise.resolve().then(fn)` não são equivalentes quando `fn` pode lançar de forma síncrona** — só a segunda forma captura o lançamento. Vale para qualquer despachante de callback potencialmente não confiável (rota HTTP, handler de fila, listener de evento). Provado por mutação: reverter a correção reproduz o timeout exato.
- **Referência**: `src/workers/src/probes.ts`, `tests/worker-probes.test.ts`.

### 2026-09-24 — `cd DIR && CMD &` backgrounda o subshell, não o processo — `$!` mente

- **Sintoma**: ao verificar manualmente o encerramento gracioso do worker fora do Vitest, `kill -TERM "$!"` não encerrou o processo Node — os logs continuaram mostrando lotes sendo consumidos depois do sinal, e uma segunda tentativa na mesma porta reprovou com `EADDRINUSE`.
- **Causa-raiz**: `cd DIR && ENV=v node script &` backgrounda o **comando composto inteiro** como um único job de subshell; `$!` captura o PID **desse subshell**, não o do `node` que ele acaba executando. `kill -TERM "$!"` matou o wrapper do `cd && node`, e o `node` sobreviveu como órfão, sem nunca receber SIGTERM.
- **Por que é grave além do incidente**: é a mesma classe de defeito já registrada na entrada de 2026-09-22 deste playbook sobre `tests/graceful-shutdown.test.ts` — só que ali era o código do teste; aqui fui eu mesmo reproduzindo o bug ao tentar validar manualmente a imagem `runtime-workers`, sem `docker` disponível neste ambiente. O padrão volta porque `cd X && CMD &` parece inofensivo e não é: qualquer verificação manual de sinal que use essa forma mede o processo errado.
- **Mitigação aplicada**: a verificação manual passou a usar `env -C DIR VAR=val node script &` — sem `cd`, sem `&&` — de modo que `$!` seja o PID real do `node`. Confirmado com `ps -o pid,ppid,cmd -p $PID` antes de reenviar o sinal.
- **Regra nova**: **`$!` só é confiável quando o comando backgrounded é um processo único, não uma sequência `A && B &`.** Nenhum script do repositório usava a forma perigosa — esta entrada existe para que a próxima verificação manual (ou o próximo script) não reintroduza o mesmo erro.
- **Referência**: `docs/PLAYBOOKS/INCIDENTS_LEARNING.md` (entrada de 2026-09-22, mesma classe), `charts/workers/`.

### 2026-09-24 — `tsc --build` não limpa `dist/` órfão depois de um `git mv`

- **Sintoma**: uma verificação manual do layout de runtime do worker (sem `docker`, ver entrada acima) incluiu, por um momento, um `src/api/dist/health.js` que já não tinha `src/api/src/health.ts` correspondente — o arquivo havia sido movido para `src/shared/src/health.ts` para ficar acessível aos dois serviços.
- **Causa-raiz**: `tsc --build` é incremental e some com o arquivo de saída só quando reconstrói o **mesmo** projeto que o gerou; quando o fonte muda de projeto (`src/api` → `src/shared`) via `git mv`, o `dist/` antigo não é referenciado pelo grafo de build novo e por isso não é candidato a remoção — ele simplesmente fica.
- **Por que não é risco no CI nem no repositório**: `dist/` está no `.gitignore` em todo pacote, e o runner da esteira sempre parte de um checkout limpo — não existe `dist/` órfão para herdar. O risco é puramente local: uma verificação manual feita sobre um `dist/` não limpo pode incluir um artefato que já não corresponde a nenhum fonte, e ler resultado dela como se fosse o comportamento real do build.
- **Mitigação aplicada**: a verificação manual passou a rodar `tsc --build --force` (ou remover todo `src/*/dist` primeiro) sempre que um `git mv` mexeu em qual projeto compila qual fonte, antes de confiar no layout resultante.
- **Regra nova**: **depois de mover um arquivo-fonte entre projetos do `tsc --build`, o `dist/` velho não é limpo automaticamente — force a reconstrução antes de inspecionar a saída localmente.** Não vira gate de CI porque o CI já não tem esse estado para herdar; fica registrado para a próxima pessoa que for depurar um `dist/` local e ficar intrigada com um arquivo que não deveria estar lá.
- **Referência**: `src/shared/src/health.ts` (movido de `src/api/src/health.ts`).

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

### 2026-09-23 — Gate 9 reprovou com razão na primeira varredura: 6 CVEs na base Distroless

- **Sintoma**: com a `trivy-action` corrigida, o job `container` construiu a imagem sem erro e o Trivy reprovou com 6 vulnerabilidades em `libssl3` — 1 crítica (`CVE-2026-31789`) e 5 altas — todas com correção disponível a montante.
- **Causa-raiz**: `gcr.io/distroless/nodejs22-debian12` carrega `libssl3` 3.0.18-1~deb12u2; as correções estão em 3.0.19 e 3.0.20. A base ainda não foi reconstruída a montante com o pacote atualizado. **Distroless não tem gerenciador de pacotes nem shell**, então não existe `apt upgrade` dentro da imagem: a única correção possível é trocar a base.
- **Por que não virou exceção**: a saída fácil seria `.trivyignore` com prazo. Antes disso, a pergunta certa era se existe base sem o defeito — e existe. A variante `nodejs22-debian13` usa o mesmo Node 22 LTS exigido pelo ADR-001 e varre **limpa**. Trocar corrige de verdade; ignorar apenas adia, mantendo o risco e gastando o gate.
- **Como foi verificado sem Docker**: o Trivy escaneia imagem direto do registro, sem daemon. Isso permitiu comparar as duas variantes e confirmar `nonroot:x:65532` no `/etc/passwd` da nova base antes de trocar, em vez de descobrir no runner.
- **Achado secundário**: a asserção de `nonroot` vinha **depois** do Trivy no job, então a reprovação por CVE abortou o passo e a invariante do ADR-001 nunca foi verificada. A ordem foi invertida: asserções sobre invariantes nossas rodam antes das verificações sobre higiene de terceiros, porque um problema alheio não pode esconder se o nosso próprio requisito foi cumprido.
- **Regras novas**:
  1. **Base de imagem vulnerável se troca, não se ignora**, enquanto existir variante equivalente sem o defeito. `.trivyignore` é último recurso, sempre com prazo.
  2. **A tag da base permanece flutuante.** Fixar por digest congelaria a imagem na versão vulnerável; a reconstrução periódica a montante é o mecanismo que mantém as correções chegando.
  3. **Num mesmo job, verificação de invariante nossa vem antes de varredura de terceiro.**
- **Referência**: PR #23, `Dockerfile`, `.github/workflows/ci.yml`, ADR-001.

### 2026-09-23 — O tema claro nunca havia sido validado, e o validador era circular

- **Sintoma**: a primeira execução do teste de contraste sobre `tokens.json` reprovou **29 casos**. Não era regressão: era a primeira vez que alguém mediu.
- **Causa-raiz**: o design system foi entregue com dois temas, mas construído para um. O `$description` do grupo `status` dizia literalmente _"texto claro sobre fundo translúcido"_ — a suposição de tema escuro estava escrita no próprio token. Os rótulos de status e de domínio iam de 5,89:1 a 11,74:1 no escuro e de **1,15:1 a 2,40:1** no claro. Somavam-se a isso `text-muted` reprovando nos dois temas, `text-secondary`/`text-tertiary` a 4,30:1 no claro e `border-interactive` a 1,64:1 contra os 3:1 da WCAG 1.4.11.
- **Por que passou despercebido**: um tema sem uso ainda não tinha tela para revelar o problema, e nenhuma verificação media cor. O ADR-011 exigia contraste "testado e validado na fonte" desde o início — era uma intenção documentada, sem mecanismo. A história 11.4 antecipava exatamente isso: _"validar apenas o escuro deixaria metade da interface sem garantia"_.
- **Mitigação aplicada**: `status.*` e `domain.*` passaram a declarar `text` e `dot` por tema, na mesma forma de `color.theme`; a rampa de texto do tema claro foi refeita como três degraus que preservam a hierarquia visual e cruzam 4,5:1 na pior superfície; as bordas interativas subiram para 3:1; e `accent`, que só existia no tema claro, ganhou par no escuro.
- **Achado dentro do achado — o validador era circular**: a verificação por mutação mostrou que baixar `contrastNormalText` de 4.5 para 3 **no próprio `tokens.json`** deixava a suíte inteira verde. O teste lia o limiar do arquivo que validava. O arquivo passou a escolher apenas o **nível** (`2.2 AA`); os **números** de cada nível são fixados pela norma dentro do teste. Remover um tema de `themesToValidate` também reprova agora.
- **Segundo achado — detecção de tema por nome**: o compilador identificava o eixo de tema pelo nome do segmento, e `font.weight.light` colidiu com o tema `light`. Um peso de fonte teria sido emitido dentro do seletor de tema, em silêncio. A detecção passou a ser estrutural: só é eixo de tema o grupo cujos filhos são exatamente os temas declarados.
- **Regras novas**:
  1. **Teste que lê o critério do artefato que valida não é teste.** O artefato escolhe o nível; a norma externa fixa os números. Vale para contraste, cobertura e qualquer limiar.
  2. **Eixo de variação se detecta por estrutura, não por nome.** Nome colide — e a colisão é silenciosa.
  3. **Todo grupo bifurcado por tema declara todos os temas**, verificado por varredura da árvore, não só em `color.theme`.
- **Referência**: `design-system/tokens.json` v1.2.0, `design-system/build.mjs`, `tests/design-tokens.test.ts`, ADR-005, ADR-011.

### 2026-09-23 — Dois gates que teriam passado medindo a coisa errada

- **Sintoma**: nenhum. Os dois defeitos foram encontrados ao verificar por mutação gates recém-ativados — nenhum deles produzia erro, aviso ou teste vermelho.
- **Primeiro: o verificador de literais varria a saída de build.** Com o primeiro componente real em `src/web/`, o gate 10 passou a varrer 6 arquivos — mas quatro eram `src/web/dist/`, artefato do `tsc`. A mesma violação seria reportada duas vezes, e metade dos apontamentos indicaria uma linha que ninguém edita. O padrão de exclusão cobria só `design-system/dist/`; passou a cobrir qualquer `dist/`, em qualquer pacote.
- **Segundo: o Axe em jsdom não mede contraste.** O jsdom não faz layout nem resolve `var()`, então `color-contrast` — a regra que qualquer pessoa assume que um gate de acessibilidade cobre — simplesmente não roda. Ela não falha: ela não avalia nada e o resultado sai limpo. Um gate 7 verde passaria a mensagem de que o contraste foi verificado quando não foi.
- **Por que isso importa mais que os dois casos**: é a terceira vez neste repositório que um gate mede menos do que aparenta — antes foi o contrato OpenAPI vazio, depois as actions que não chegavam a executar. A pergunta que pega os três é a mesma: **em que estado este gate aprovaria sem ter verificado nada?**
- **Mitigação aplicada**: as regras inertes em jsdom são **desabilitadas explicitamente e nomeadas no código**, para que ninguém as confunda com cobertura. O contraste é verificado onde pode ser: por cálculo direto sobre os tokens, nos dois temas, cobrindo todas as combinações declaradas — e não apenas as que alguma história renderizou. A limitação está escrita no `CONTEXT.md`, não só no comentário.
- **Regras novas**:
  1. **Regra de verificador que não pode rodar no ambiente é desabilitada por nome, nunca deixada "ligada e inerte".** Silenciosamente inerte é indistinguível de aprovada.
  2. **Quando um gate não alcança uma garantia, a garantia é verificada em outro lugar e os dois pontos se referenciam.** Um gate que cobre parte do problema precisa dizer qual parte.
  3. **Verificador que varre arquivos exclui toda saída de build por padrão**, não caso a caso.
- **Referência**: `scripts/check-design-literals.mjs`, `tests/a11y.test.tsx`, `tests/design-tokens.test.ts`, ADR-005, ADR-011.
