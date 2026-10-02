# /design-system — Fonte Única de Verdade de UI

Este diretório contém o **artefato compilável** do design system (ADR-011). A documentação de design — inventário de componentes, telas de referência, regras de uso — vive em `docs/design-system/`. Os dois se referenciam e não se duplicam.

## Conteúdo

| Arquivo            | Papel                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokens.json`      | Todos os valores estéticos da interface, no formato **DTCG** (`$value`/`$type`). Fonte única — nenhum valor de cor, espaçamento, raio ou tipografia existe fora daqui. |
| `build.mjs`        | Compilador (Style Dictionary v4). `npm run tokens` gera; `npm run tokens:check` reprova se `dist/` divergir — metade "drift" do gate 10.                               |
| `dist/` _(gerado)_ | `tokens.css`, `tailwind-theme.js` e `fonts.css`. Versionados e **nunca editados à mão**.                                                                               |
| `fonts/`           | Os WOFF2 servidos pela aplicação, as licenças (SIL OFL) e `manifest.json` — proveniência, SHA-256 e faixas Unicode de cada arquivo.                                    |
| `fonts.mjs`        | Valida o manifesto contra os tokens e gera o `@font-face`. Função pura, testada com manifestos adulterados em `tests/fonts.test.ts`.                                   |

## Pipeline

```
tokens.json ──(Style Dictionary)──┬──▶ dist/tokens.css          variáveis em :root e [data-theme="light"]
                                  └──▶ dist/tailwind-theme.js   ──▶ src/web/tailwind.config.ts ──▶ utilitários
fonts/manifest.json ──(fonts.mjs)────▶ dist/fonts.css           @font-face ──▶ fonts/*.woff2
```

O pipeline roda no build e na esteira de CI. **A saída não é editada manualmente** — alteração de design entra por `tokens.json` e se propaga.

## Regras (ADR-011)

1. Nenhum componente usa valor estético literal (`#723CEB`, `24px`). Sempre o token.
2. Nenhuma classe utilitária arbitrária do Tailwind (`bg-[#723CEB]`, `p-[13px]`). O **gate 10 da esteira** bloqueia o merge.
3. Alteração de design entra **primeiro** aqui, depois no Tailwind, depois no componente. O caminho inverso é por onde o _design drift_ retorna.
4. Tema claro e escuro são pares de token no mesmo arquivo (`color.theme.dark` / `color.theme.light`). Nenhum componente decide qual tema está ativo — consome a variável resolvida.
5. A validação de contraste WCAG 2.2 AA roda sobre **ambos** os temas na esteira (Épico 11.4). Falha bloqueia o merge.

## Regras que o Axe não detecta (Épico 11.7)

O Axe e o validador de contraste não capturam as violações mais caras deste produto. Três delas são verificadas por `npm run ui:rules`, que abre **cada história do Storybook compilado**, nos dois temas, num navegador real e mede o que foi renderizado. A análise é uma função pura (`scripts/ui-rules.mjs`) provada com fixtures em `tests/ui-rules.test.ts`.

| Regra                                          | O que é verificado                                                                                                                                                                                           | O que **não** é verificado                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Alvo mínimo de 44×44 px**                    | Todo elemento clicável mede ao menos `a11y.min-tap-target` nos dois eixos. Link dentro de texto corrido é isento (exceção do WCAG). Isenção explícita: `data-alvo-isento="motivo"` — o motivo é obrigatório. | Alvo expandido por pseudo-elemento (`::after`): a medição é da caixa do elemento. Use padding, ou a isenção com motivo.                      |
| **Cor nunca é o único portador de informação** | Nenhum elemento visível tem fundo colorido sem texto legível nem nome acessível. O ponto decorativo é legítimo se `aria-hidden="true"`, com o rótulo ao lado.                                                | Se o texto ao lado **diz a mesma coisa** que a cor. A barra de SLA "sempre com rótulo de tempo" depende de revisão.                          |
| **Gradiente da marca: um destaque por tela**   | O gradiente (`gradient.brand`) só aparece com `data-gradiente="marca\|navegacao\|vazio\|assistente\|destaque"`, e há no máximo um `destaque` por história.                                                   | Os contextos **proibidos** — fundo de fila, texto corrido, alerta de incidente massivo, botão destrutivo, leitura prolongada. Revisão de PR. |

Duas salvaguardas contra passar por vacuidade: a cada execução uma página deliberadamente errada precisa ser reprovada por todas as regras (controle negativo), e zero histórias ou zero elementos clicáveis medidos é erro. O navegador é o Chromium de `CHROME_PATH` ou o Google Chrome instalado (os runners do GitHub já o trazem); o `playwright-core` é só o driver.

Continuam **só por revisão manual registrada no PR**:

- **Foco visível nunca suprimido** — `outline: none` sem substituto equivalente é reprovação. O `Botao` usa o anel dos tokens (`outline-focus`, `outline-offset-focus`, `outline-focus-ring`), mas nada impede um componente futuro de suprimi-lo.
- **Navegação por teclado e leitor de tela** — ordem de foco e anúncios que nenhuma ferramenta valida.

## Tipografia (ADR-020)

**Outfit** para display e corpo, **JetBrains Mono** para monoespaçado. Ambas sob SIL Open Font License 1.1, **servidas pela própria aplicação**.

O design system original especificava Gilroy e Lufga, famílias comerciais. A análise do handoff mostrou que **nenhuma das duas era efetivamente carregada** — não havia `@font-face` algum, e o único `<link>` de fonte trazia justamente Outfit e JetBrains Mono. Elas só renderizavam em máquina que já as tivesse instaladas, o que significa que a revisão de design que as aprovou ocorreu, na prática, exibindo Outfit.

### Regras que decorrem do ADR-020

1. **Nenhuma fonte vem de CDN de terceiros em tempo de execução** — `fonts.googleapis.com` incluído. Isso quebraria implantação sem saída para a internet e transmitiria o IP de cada usuário a um terceiro a cada carregamento.
2. O precedente **extrapola tipografia**: nenhum recurso estático de terceiros (ícones, bibliotecas) é consumido de CDN externo em runtime.
3. `font.family.display` e `font.family.body` permanecem **tokens distintos**, ambos resolvendo para Outfit. Reintroduzir uma família de display é troca de valor, não refatoração de componente.
4. A hierarquia vem de **tamanho e peso** (`font.size`, `font.weight`), não de contraste entre famílias. Se faltar contraste entre título e corpo, a correção é na escala — nunca em valor literal no componente.

### Como as fontes são servidas (Épico 11.6)

Quatro arquivos WOFF2 **variáveis** (um por família e subconjunto, ~103 KB no total) cobrem todos os pesos dos tokens (300 a 700) — duas famílias de quatro pesos estáticos seriam o dobro de arquivos. São as distribuições **não modificadas** dos pacotes Fontsource (as mesmas do Google Fonts), em `design-system/fonts/`, com a licença de cada família ao lado e o SHA-256 de cada arquivo no manifesto.

- **`@font-face` gerado, nunca escrito à mão.** `npm run tokens` valida e gera `dist/fonts.css`. A validação reprova arquivo ausente, trocado ou que não é WOFF2; família nos tokens sem arquivo (e o inverso); subconjunto ou eixo de peso que não cobre os tokens; licença ausente; e qualquer caminho que não seja local.
- **`font-display: swap`** em todo `@font-face`, e `unicode-range` por subconjunto: o navegador só baixa o `latin-ext` se houver texto que o exija.
- **Nenhuma referência externa.** `tests/fonts.test.ts` varre a interface, a vitrine e os artefatos compilados atrás de `url()`, `@import`, `<link>` e `<script>` com URL absoluta — pela forma, e não por uma lista de domínios.
- **Preload da fonte de corpo.** O manifesto marca o arquivo (`outfit-latin-wght-normal.woff2`). O shell da aplicação precisa de `<link rel="preload" as="font" type="font/woff2" crossorigin href="…">` para ele — `crossorigin` é obrigatório mesmo na mesma origem, ou o navegador baixa duas vezes. Ainda não há `src/web/index.html`; quando houver, o teste correspondente deixa de ser pulado e exige o preload.
- **Atualizar uma fonte:** baixar o pacote novo (`npm pack @fontsource-variable/outfit`), copiar os WOFF2 e a licença para `fonts/`, atualizar versão, SHA-256 e `unicodeRange` no manifesto e rodar `npm run tokens`. A troca de arquivo sem atualizar o manifesto reprova.

### Numerais tabulares (resolvido)

**A Outfit oferece `tnum`**, mas os dígitos são **proporcionais por padrão** (de 321 a 659 unidades de largura; com `tnum`, os dez passam a 590, inclusive em peso 700). Tempos de SLA e contagens em coluna precisam, portanto, de `font-variant-numeric: tabular-nums` — a utilitária `tabular-nums` do Tailwind, que não é valor estético e passa pelo gate 10. Medido num Chromium real: "1111" e "0000" a 32 px medem 44,4 e 84,0 px sem `tabular-nums` e 75,5 e 75,5 px com ele. A **JetBrains Mono** é monoespaçada (dígitos todos com 600) e não precisa de nada. `tests/fonts.test.ts` lê a tabela `GSUB` do arquivo versionado e exige `tnum` na Outfit: uma troca por versão sem a feature desalinharia a coluna sem erro algum.
