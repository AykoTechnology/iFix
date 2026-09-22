# /design-system — Fonte Única de Verdade de UI

Este diretório contém o **artefato compilável** do design system (ADR-011). A documentação de design — inventário de componentes, telas de referência, regras de uso — vive em `docs/design-system/`. Os dois se referenciam e não se duplicam.

## Conteúdo

| Arquivo | Papel |
|---|---|
| `tokens.json` | Todos os valores estéticos da interface, no formato **DTCG** (`$value`/`$type`). Fonte única — nenhum valor de cor, espaçamento, raio ou tipografia existe fora daqui. |
| *(a criar — Épico 11.2)* `style-dictionary.config.js` | Configuração do pipeline de compilação |
| *(gerado — não versionar edições manuais)* `build/` | Saídas: `tailwind.tokens.js`, `variables.css` |

## Pipeline

```
tokens.json  ──(Style Dictionary)──┬──▶ build/tailwind.tokens.js  ──▶ src/web/tailwind.config.ts
                                   └──▶ build/variables.css       ──▶ :root e [data-theme="light"]
```

O pipeline roda no build e na esteira de CI. **A saída não é editada manualmente** — alteração de design entra por `tokens.json` e se propaga.

## Regras (ADR-011)

1. Nenhum componente usa valor estético literal (`#723CEB`, `24px`). Sempre o token.
2. Nenhuma classe utilitária arbitrária do Tailwind (`bg-[#723CEB]`, `p-[13px]`). O **gate 10 da esteira** bloqueia o merge.
3. Alteração de design entra **primeiro** aqui, depois no Tailwind, depois no componente. O caminho inverso é por onde o *design drift* retorna.
4. Tema claro e escuro são pares de token no mesmo arquivo (`color.theme.dark` / `color.theme.light`). Nenhum componente decide qual tema está ativo — consome a variável resolvida.
5. A validação de contraste WCAG 2.2 AA roda sobre **ambos** os temas na esteira (Épico 11.4). Falha bloqueia o merge.

## Regras que a ferramenta não detecta

O Axe-core e o validador de contraste não capturam as violações mais caras deste produto. Estas exigem revisão manual registrada no PR (Épico 11.7):

- **Cor nunca é o único portador de informação** — prioridade, SLA e estado sempre acompanham rótulo textual.
- **Alvo mínimo de 44×44 px** para qualquer elemento clicável, inclusive ícones do rail de navegação e ações de linha na fila (a área de toque pode exceder o tamanho visual do chip).
- **Gradiente de marca:** um único destaque por tela. Proibido em fundo de fila, texto corrido, alerta de incidente massivo e botão destrutivo.
- **Foco visível nunca suprimido** — `outline: none` sem substituto equivalente é reprovação automática.

## Risco aberto: a fonte que renderiza hoje depende da máquina de quem olha

`tokens.json` declara **Gilroy** (display) e **Lufga** (corpo), ambas comerciais. Mas o protótipo recebido do Claude Design **não as carrega**: o único `<link>` de fonte traz `Outfit` e `JetBrains Mono` do Google Fonts, e não há nenhuma declaração `@font-face`.

Ou seja, Gilroy e Lufga só aparecem para quem já as tem instaladas localmente. Para todos os demais — incluindo, muito provavelmente, quem revisou e aprovou o design no navegador — **o que renderiza é Outfit**.

Antes de qualquer decisão de compra, a ação mais barata é confirmar com quem aprovou qual tipografia estava efetivamente vendo. Se era Outfit, o risco se encerra sem custo e basta corrigir os tokens.

Se a decisão for licenciar, o escopo depende do **R9(a)** — SaaS hospedado por nós e software instalado no cliente exigem licenças de naturezas diferentes, porque a segunda implica **redistribuição** dos arquivos de fonte a terceiros dentro da imagem de contêiner.

Análise completa, alternativas e critérios de avaliação tipográfica: **`docs/ESM_ITSM_PLATFORM_SPEC.md` § 12.1**. Bloqueia o fechamento da Fase 0 (Épico 11.6).
