<!-- GERADO POR scripts/sync-adrs.mjs — NÃO EDITAR À MÃO.
     A fonte é docs/ESM_ITSM_PLATFORM_SPEC.md § 9. Edite lá e rode: node scripts/sync-adrs.mjs -->

# ADR-020: Tipografia Self-Hosted sob Licença Aberta

- **Status:** Aprovado (2026-09-22) — encerra o risco R1
- **Contexto:** O design system especificava **Gilroy** (títulos e números) e **Lufga** (interface e corpo), ambas famílias comerciais. A análise do bundle de handoff revelou que **nenhuma das duas é efetivamente carregada**: os arquivos `.dc.html` declaram um único `<link>` para o Google Fonts trazendo `Outfit` e `JetBrains Mono`, sem nenhuma declaração `@font-face`. As comerciais aparecem apenas como primeiros nomes da pilha CSS, renderizando somente em máquinas que já as tenham instaladas — ou seja, **a revisão de design ocorreu de fato em Outfit**. Licenciá-las exigiria resolver quatro dimensões de escopo (desktop × webfont, volume por *pageviews*, número de domínios e, decisivamente, redistribuição a terceiros no cenário on-premises), com custo indeterminado enquanto o modelo de entrega (R9) permanecer aberto.
- **Decisão:**
  - **Outfit** (SIL Open Font License 1.1) para display e corpo; **JetBrains Mono** (SIL OFL 1.1) para monoespaçado.
  - Os tokens preservam `font.family.display` e `font.family.body` como entradas **semanticamente distintas**, ambas resolvendo para Outfit. Reintroduzir uma família de display no futuro passa a ser troca de valor de token, não refatoração de componente.
  - **Hospedagem própria obrigatória**: as fontes são servidas pela própria aplicação via `@font-face`. É **proibido** consumir fontes de CDN de terceiros em tempo de execução, inclusive `fonts.googleapis.com`.
  - Formato WOFF2, subconjuntos `latin` e `latin-ext`, `font-display: swap` e *preload* da fonte de corpo.
- **Consequências:**
  - Custo de licença zero e redistribuição permitida pela OFL: a imagem de contêiner pode transportar os arquivos de fonte sem restrição, o que **desacopla a tipografia do modelo de entrega** — o R9 deixa de ter efeito sobre ela.
  - Elimina *egress* para `fonts.googleapis.com` em tempo de execução. Isso é pré-requisito para implantação on-premises ou em ambiente sem saída para a internet, e evita transmitir o endereço IP de cada usuário a um terceiro a cada carregamento de página — questão de tratamento de dados coerente com o ADR-013.
  - A renderização deixa de depender do que está instalado na máquina de quem olha. Passa a ser **determinística para todos**, o que é pré-requisito para revisão de UI confiável, para testes visuais e para a validação de contraste da esteira (Épico 11.4).
  - A hierarquia tipográfica passa a ser construída por **tamanho e peso**, não por contraste entre duas famílias. A escala de `font.size`/`font.weight` já sustenta isso; se o design concluir que falta contraste entre título e corpo, a correção é na escala ou na reintrodução de uma família de display, nunca em valor literal no componente (ADR-011).
  - **Precedente que extrapola tipografia:** nenhum recurso estático de terceiros é consumido de CDN externo em tempo de execução. Vale para fontes, ícones e bibliotecas de frontend.
  - A verificar na implementação (Épico 11.6): se a Outfit oferece numerais tabulares. A fila de chamados alinha tempos de SLA e contagens em coluna; sem `tnum` disponível, aplicar `font-variant-numeric: tabular-nums` e validar o resultado no componente de tabela.

---

Contexto completo, backlog relacionado e demais decisões: `docs/ESM_ITSM_PLATFORM_SPEC.md`.
