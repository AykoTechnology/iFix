<!-- GERADO POR scripts/sync-adrs.mjs — NÃO EDITAR À MÃO.
     A fonte é docs/ESM_ITSM_PLATFORM_SPEC.md § 9. Edite lá e rode: node scripts/sync-adrs.mjs -->

# ADR-019: Internacionalização e Localização

- **Status:** Proposto
- **Contexto:** O design system declara o produto em **português (BR)** e toda a interface prototipada está em pt-BR. Isso é adequado ao mercado-alvo, mas duas classes de texto diferentes convivem no produto — texto de interface (rótulos, mensagens de erro) e conteúdo criado pelo usuário (artigo de KB, nome de item de catálogo, template de notificação). Tratar as duas igual, ou tratar o assunto depois, custa uma refatoração transversal em cada tela já construída.
- **Decisão:**
  - **Texto de interface** vive em catálogo de mensagens desde a Fase 0, nunca embutido em componente — mesmo com um único idioma ativo. O custo agora é uma indireção; depois, uma varredura em toda a base.
  - **Conteúdo do usuário** (catálogo, KB, templates de notificação) é traduzível por registro, com idioma de origem e _fallback_ explícito (Épico 10.5).
  - **Formatação de data, número e moeda** é responsabilidade da camada de apresentação, derivada da preferência do usuário — nunca concatenada manualmente.
  - Idioma ativo na v1: **pt-BR**. Estrutura pronta para en-US e es-419 sem refatoração de componente.
- **Consequências:**
  - Mensagens de erro de validação vêm do mesmo schema Zod no cliente e no servidor (ADR-009) — a chave de mensagem precisa ser traduzível em ambos os lados, o que impõe que o schema carregue a chave, não o texto final.
  - Conteúdo multilíngue impacta a busca semântica: _embeddings_ são sensíveis ao idioma, exigindo índice por idioma ou modelo multilíngue (decisão acoplada ao ADR-017).
  - Se o produto permanecer monolíngue em definitivo, esta decisão pode ser revogada com custo baixo — o inverso não é verdadeiro, e é essa assimetria que justifica decidir agora.

---

---

Contexto completo, backlog relacionado e demais decisões: `docs/ESM_ITSM_PLATFORM_SPEC.md`.
