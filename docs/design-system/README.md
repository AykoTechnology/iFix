# Design System iFix — Referência Viva

> Fonte original: bundle de handoff do Claude Design (`iFix Design System.dc.html` e `iFix Telas.dc.html`), recebido em 2026-09-22. Este diretório é a transcrição estruturada e versionada desse handoff — a fonte de verdade para implementação em React 19 + Tailwind. Qualquer alteração no design deve ser refletida aqui **antes** de tocar em `src/web`.

## Arquivos

Este diretório contém a **documentação** de design. O artefato **compilável** (tokens) vive em `/design-system/` na raiz do repositório, conforme a estrutura de monorepo da §6.1 da especificação.

| Arquivo                               | Conteúdo                                                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `components.md`                       | Inventário de componentes de UI com estados e regras de uso.                                                                                                             |
| `screens.md`                          | As 7 telas de referência prototipadas, mapeadas para módulos do produto e para os épicos do backlog.                                                                     |
| `/design-system/tokens.json` _(raiz)_ | Cores, tipografia, espaçamento, raio, elevação, layout e acessibilidade no formato DTCG, compilados por Style Dictionary para o Tailwind e para variáveis CSS (ADR-011). |

## Princípios de marca

- **Base escura por padrão**, tema claro como alternativa completa (não é apenas "modo claro automático" — cada superfície tem par definido).
- **Preto (#131313) é a cor estrutural.** O roxo (#723CEB) carrega ação e seleção. O gradiente laranja→roxo→violeta profundo é reservado para marca, estado vazio, assistente cognitivo e **um único destaque por tela** — nunca decoração, nunca fundo de leitura prolongada, nunca botão destrutivo.
- **Vermelho/laranja/amarelo/verde pertencem exclusivamente ao sistema de prioridade e SLA.** Não são usados como paleta decorativa em nenhum outro contexto.
- **Cor nunca é a única portadora de informação** — prioridade, status e SLA sempre têm rótulo textual. Este é um critério de bloqueio de PR, não uma sugestão (ver ADR-005 e DoD em `docs/CONTEXT.md`).
- **Cor por domínio ESM** (TI roxo, RH laranja, Finanças verde, Instalações azul) aparece só em etiquetas e no seletor de espaço de trabalho — nunca substitui o nome do domínio por extenso.

## Tipografia

- **Outfit** — títulos, números, interface e corpo de texto (Light/Regular/Medium/Bold).
- **JetBrains Mono** — números de chamado (`INC-48192`), IDs de CI (`CI-SRV-0231`), timestamps ISO 8601 e qualquer representação de schema JSON visível ao usuário.

> **Nota histórica:** o design system original especificava **Gilroy** (display) e **Lufga** (corpo), ambas comerciais. O protótipo nunca as carregou — não havia `@font-face` algum, e o único `<link>` de fonte trazia Outfit e JetBrains Mono. Elas só renderizavam em máquina que já as tivesse instaladas, de modo que a revisão de design ocorreu de fato exibindo Outfit. O **ADR-020** formalizou Outfit como a família do sistema.

Ambas as famílias são **self-hosted** (SIL OFL), servidas pela própria aplicação. Nenhuma fonte vem de CDN de terceiros em tempo de execução — ver `design-system/README.md` para as regras que decorrem do ADR-020.

Pilha completa: `Outfit, system-ui, sans-serif` para texto; `JetBrains Mono, ui-monospace, monospace` para identificadores e timestamps.

## Grid e responsividade

- Grid de 12 colunas, gutter 24px, largura máxima de conteúdo 1440px.
- Rail de navegação fixo em 72px, topbar 64px.
- O **painel de conhecimento contextual (360px) é persistente em telas ≥1280px**; abaixo disso vira gaveta sobreposta (drawer). Este é o único painel lateral com esse comportamento — não generalizar para outros painéis sem justificativa de UX.
- Linha de tabela padrão: 48px, cabeçalho fixo (sticky) no scroll.

## Acessibilidade (WCAG 2.2 AA — critério de bloqueio)

Ver `tokens.json` → `accessibility`. Resumo operacional:

1. Contraste 4.5:1 (texto normal) / 3:1 (texto grande e bordas de controle).
2. Alvo mínimo de clique/toque: 44×44px, incluindo ícones de navegação e ações de linha em tabela.
3. Foco visível: anel de 3px com 2px de deslocamento, **nunca suprimido** (proibido `outline: none` sem substituto equivalente).
4. Ordem de foco segue a ordem visual; toda a mesa de atendimento é operável sem mouse, com skip-link para o conteúdo principal e trap de foco correto em modais.
5. Atualizações em tempo real (Realtime) são anunciadas em região `aria-live="polite"` e **nunca roubam o foco** do analista.
6. Todo componente novo entra na biblioteca somente após varredura automatizada Axe-core aprovada + revisão manual de teclado/leitor de tela (gate de CI, ver `docs/ADR/ADR-005-acessibilidade-wcag.md`).

## Como isso vira código

- `tokens.json` é a fonte para gerar `src/web/tailwind.config.ts` (cores, radius, spacing, fontFamily) via script determinístico — não editar o Tailwind config manualmente para tokens que já existem aqui.
- Componentes React vivem em `src/web/src/design-system/` e são documentados/testados em Storybook com o addon `@storybook/addon-a11y` rodando Axe-core em cada história (bloqueio de merge se houver violação).
- Web Components acessíveis (mencionados na spec técnica) são reservados para widgets embutíveis fora do shell React (ex.: widget de status público, formulário de catálogo embutido em intranet de terceiros).
