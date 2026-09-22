# Backlog — Índice de Execução

> O backlog **canônico**, com a justificativa de cada épico e o texto completo das histórias, vive em **[`docs/ESM_ITSM_PLATFORM_SPEC.md` § 4](./ESM_ITSM_PLATFORM_SPEC.md)**. Esta página é o índice de execução: o mapa de fases e a correspondência entre épico e Issue no GitHub.
>
> Manter as histórias em dois arquivos produziria divergência — por isso aqui há apenas ponteiros.

## Mapa de fases

| Fase | Foco | Épicos |
|---|---|---|
| 0 — Fundação | Monorepo, esteira com os 12 gates, schema base e RLS, identidade, tokens compilando, observabilidade instrumentada | transversal + 11, 12.1–12.3, 17.1–17.2 |
| 1 — Núcleo ITSM | Incidente, Problema, Mudança, catálogo, mesa de atendimento | 4, 6 |
| 2 — Fluxo e Regras | FlowBuilder, BRE, portabilidade de configuração | 1, 7 |
| 3 — Conhecimento e Comunicação | KB contextual, notificações, ingestão de e-mail | 3, 10, 21 |
| 4 — ESM e Autoatendimento | Delegação, portal do colaborador, módulos RH/Financeiro/Facilities | 2, 18, 19 |
| 5 — Ativos, CMDB e Inteligência | CMDB federada, ITAM/SAM, eventos, AIOps, analytics | 5, 8, 9, 13, 15, 20 |
| 6 — Governança de Serviço | SLM/disponibilidade/capacidade/continuidade, liberações, acessos | 14, 16, 17.3–17.4 |
| 7 — Hardening e GA | Segredos, SLOs, GameDay de DR, pentest, exportação para SIEM | 12.4–12.8 |

## Épicos e Issues

| Épico | Título | Issue |
|---|---|---|
| 1 | Governança e Portabilidade de Configuração | [#1](https://github.com/AykoTechnology/iFix/issues/1) |
| 2 | Delegação Dinâmica de Papéis e Alçadas | [#2](https://github.com/AykoTechnology/iFix/issues/2) |
| 3 | Base de Conhecimento Contextual Integrada | [#3](https://github.com/AykoTechnology/iFix/issues/3) |
| 4 | Catálogo em Cartões Dinâmicos | [#4](https://github.com/AykoTechnology/iFix/issues/4) |
| 5 | AIOps e Assistente Cognitivo | [#5](https://github.com/AykoTechnology/iFix/issues/5) |
| 6 | Core ITSM e Práticas Fundamentais | [#6](https://github.com/AykoTechnology/iFix/issues/6) |
| 7 | Business Rules Engine (BRE) | [#7](https://github.com/AykoTechnology/iFix/issues/7) |
| 8 | ITAM e Software Asset Management | [#8](https://github.com/AykoTechnology/iFix/issues/8) |
| 9 | Analytics, Aging e Relatórios | [#9](https://github.com/AykoTechnology/iFix/issues/9) |
| 10 | Notificações Multicanal e Webhooks | [#10](https://github.com/AykoTechnology/iFix/issues/10) |
| 11 | Governança de UI e Design Tokens | [#11](https://github.com/AykoTechnology/iFix/issues/11) |
| 12 | Observabilidade, Hardening e DR | [#12](https://github.com/AykoTechnology/iFix/issues/12) |
| 13 | CMDB Federada e Raio de Impacto | [#13](https://github.com/AykoTechnology/iFix/issues/13) |
| 14 | Liberações, Implantação e Avaliação de Mudanças | [#14](https://github.com/AykoTechnology/iFix/issues/14) |
| 15 | Gestão de Eventos e Monitoramento | [#15](https://github.com/AykoTechnology/iFix/issues/15) |
| 16 | Níveis de Serviço, Disponibilidade e Continuidade | [#16](https://github.com/AykoTechnology/iFix/issues/16) |
| 17 | Identidade Federada, SSO e Acessos | [#17](https://github.com/AykoTechnology/iFix/issues/17) |
| 18 | Portal do Colaborador e Fulfilment | [#18](https://github.com/AykoTechnology/iFix/issues/18) |
| 19 | Módulos ESM Especializados | [#19](https://github.com/AykoTechnology/iFix/issues/19) |
| 20 | Fornecedores, Contratos e Financeiro de TI | [#20](https://github.com/AykoTechnology/iFix/issues/20) |
| 21 | Melhoria Contínua e Ciclo de Vida do Conhecimento | [#21](https://github.com/AykoTechnology/iFix/issues/21) |

## Decisões em aberto que bloqueiam fases

Ver `docs/ESM_ITSM_PLATFORM_SPEC.md` § 12 (R2 a R11) — entre elas a política de retenção LGPD e o destino de observabilidade, que bloqueiam a Fase 0, e a escolha do provedor de LLM. Riscos já encerrados ficam registrados na § 12.1.
