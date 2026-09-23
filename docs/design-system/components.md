# Inventário de Componentes

Transcrito da seção 05 do handoff (`iFix Design System.dc.html`). Cada componente listado aqui precisa de um par React + Storybook story + teste Axe antes de ser considerado "pronto" (DoD).

## Botões

| Variante                           | Uso                                                             | Estado hover                      |
| ---------------------------------- | --------------------------------------------------------------- | --------------------------------- |
| Primário (`#723CEB` sólido)        | Uma ação primária por tela                                      | `#8457F0`                         |
| Secundário (borda `#3A3A41`)       | Ação alternativa                                                | borda `#5B5B66` + fundo `#1A1A1C` |
| Terciário/texto                    | Ação de baixo peso (Cancelar)                                   | fundo `#1A1A1C`                   |
| Destrutivo (`#FF4D4D` translúcido) | Ações irreversíveis/perigosas (ex.: declarar incidente massivo) | fundo mais opaco                  |
| Desabilitado                       | `cursor:not-allowed`, texto `#6E6E76` sobre `#1A1A1C`           | —                                 |
| Pequeno                            | Densidade alta (tabelas, toolbars)                              | —                                 |

Regra: alvo mínimo 44×44px, foco visível de 3px em todos os estados.

## Campos de formulário

- Rótulo sempre acima do campo, associado via `for`/`id` (nunca placeholder-only).
- Estado de foco: borda `#723CEB` + `box-shadow: 0 0 0 3px rgba(114,60,235,.35)`.
- Estado de erro: borda `#FF4D4D` + mensagem de texto abaixo (nunca só cor), anunciada via `aria-describedby`.
- Campos opcionais marcados explicitamente (não os obrigatórios — obrigatório é o padrão implícito).
- Checkbox: quadrado 20px, raio 6px, preenchido `#723CEB` com check.
- Toggle/switch: trilho 38×22px, thumb 16px.

## Estado do chamado e SLA

- Pílulas de status: texto claro sobre fundo translúcido (nunca cor pura de fundo) + dot indicador — ver `tokens.json → color.status`.
- Medidor de SLA: barra fina (6px, raio 99px) **sempre com rótulo textual de tempo ao lado** (ex.: `+2h12`, `38min`, `5h40`). Nunca renderizar a barra sozinha.
- Tags de contexto (grupo, CI vinculado) com botão de remoção (`×`) de alvo ≥44px mesmo que o chip seja menor visualmente (hit area expandida).
- Badge "Incidente massivo": fundo `#FFEF63` sólido, texto escuro — única badge que usa cor de prioridade como fundo sólido (uso intencionalmente raro/de alerta).

## Navegação

- Segmented control (tabs de fila: Minha fila / Do grupo / Não atribuídos) — fundo `#131313`, item ativo `#723CEB` sólido.
- Tabs de contexto (Atendimento / Itens relacionados / Histórico / Tarefas) — sublinhado 2px roxo no item ativo.
- Breadcrumb com separador `/`, último nível em branco sólido.
- Nav rail vertical (72px): item ativo com fundo `#1F1526` + borda `#3B2A5C` + ícone/texto roxo claro.
- Seletor de espaço de trabalho (workspace switcher): dot de cor do domínio + nome por extenso + chevron.

## Feedback

- Alerta crítico (storm alert): fundo `rgba(255,77,77,.08)`, borda `rgba(255,77,77,.28)`, dot pulsante opcional.
- Toast de confirmação com ação de desfazer ("Desfazer") — usado para ações reversíveis nos primeiros segundos.
- Banner de aviso (SLA vencendo): fundo laranja translúcido, sem ícone de fechar se a informação for crítica para a tarefa atual.
- Indicador de sincronização em tempo real: pill discreta `#232326` com sombra flutuante — usar com moderação, não repetir por componente.

## Tabela/fila de dados

- Linha 48px, grid de colunas fixo (checkbox 40px · ID 110px · conteúdo flexível · colunas fixas à direita).
- Barra de ações em massa aparece **substituindo a barra de filtros** quando há seleção (fundo `#1F1526`), não empilhada abaixo.
- Prioridade **nunca** colore a linha inteira — sempre pílula com rótulo.
- Paginação numérica simples + contagem total (`Exibindo 1–3 de 342`).

## Formulário/Wizard

- Stepper horizontal com estados: concluído (check verde/roxo preenchido), ativo (número, borda roxa), pendente (número, borda cinza).
- Cada etapa cabe em 1440×900 sem rolagem.
- Rascunho salvo automaticamente a cada mudança; progresso anunciado por região `aria-live`.
- Rodapé de wizard: contexto de rascunho à esquerda, ações à direita (Voltar secundário, Continuar primário).
- Ações irreversíveis (publicar workflow, aplicar pacote em produção, fechar em massa) exigem **confirmação digitada** com contagem de registros afetados no diálogo — nunca um simples "Tem certeza?".

## Estados de sistema

| Estado        | Regra                                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Vazio         | Ilustração com gradiente de marca (único uso decorativo permitido do gradiente) + explicação do que preencherá o espaço                 |
| Carregando    | Skeleton com a forma do conteúdo real + `aria-busy` no contêiner — nunca spinner genérico isolado em telas de lista                     |
| Erro          | Explica a causa técnica em linguagem simples, mostra timestamp do último dado válido exibido, oferece "Tentar novamente" + "Ver status" |
| Acesso negado | Explica a política de isolamento (RLS/partição departamental) e oferece "Solicitar acesso ao espaço" — nunca um 403 genérico            |

## Blocos do FlowBuilder (motor de fluxo declarativo)

Paleta de blocos disponíveis na tela de fluxos: **Estado, Condição, Aprovação, Notificação, Temporizador de SLA, Ação automática**. Cada bloco é renderizado como card com conector de seta; condições exibem a representação em JSON DSL no painel de propriedades (read-only, gerado a partir da UI — nunca editável como texto livre, reforçando ADR-004/zero-code).
