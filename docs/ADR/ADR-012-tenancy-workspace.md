<!-- GERADO POR scripts/sync-adrs.mjs — NÃO EDITAR À MÃO.
     A fonte é docs/ESM_ITSM_PLATFORM_SPEC.md § 9. Edite lá e rode: node scripts/sync-adrs.mjs -->

# ADR-012: Modelo de Tenancy em Dois Níveis — Locatário e Espaço de Serviço

- **Status:** Proposto
- **Contexto:** O documento cita "partições departamentais" e "espaços de serviço" (TI, RH, Finanças, Instalações) em oito pontos distintos, e o design system dedica cor, etiqueta e seletor a eles. Mas o ADR-003 define apenas `tenant_id`. Sem um modelo formal do segundo nível, cada módulo inventará o seu — e o isolamento entre RH e TI, que é o requisito de confidencialidade mais sensível do produto, ficará dependente de convenção.
- **Decisão:** Adotar hierarquia explícita de dois níveis:
  - **`tenant_id`** — fronteira dura entre clientes/organizações. Nenhum acesso a atravessa, jamais, exceto por _role_ de serviço auditada.
  - **`workspace_id`** — espaço de serviço (partição departamental) dentro do locatário. Fronteira **configurável**: visibilidade padrão restrita ao próprio espaço, com compartilhamento apenas por concessão explícita e auditada.
  - Os dois participam das políticas RLS; ambos vêm de claims do JWT; usuário pode pertencer a múltiplos espaços com papéis distintos em cada.
  - Registros podem ser marcados como _confidenciais do espaço_ (ex.: chamado de RH sobre processo disciplinar), caso em que nem mesmo papéis administrativos de outros espaços os leem.
- **Consequências:**
  - O erro de acesso passa a ser explicável ao usuário ("este chamado pertence ao espaço Recursos Humanos"), como já previsto na tela de estado "Acesso não autorizado" do design system — um 403 genérico seria regressão de experiência e de confiança.
  - Catálogo, fluxos, taxonomia, SLAs e grupos são particionáveis por espaço (Épico 19.4).
  - Relatórios e o assistente cognitivo herdam automaticamente a mesma fronteira (Épicos 9.6 e 5.5).
  - Aumenta a complexidade das políticas RLS e dos índices; exige teste de vazamento em **dois** eixos (entre locatários e entre espaços), não apenas um.

---

Contexto completo, backlog relacionado e demais decisões: `docs/ESM_ITSM_PLATFORM_SPEC.md`.
