<!-- GERADO POR scripts/sync-adrs.mjs — NÃO EDITAR À MÃO.
     A fonte é docs/ESM_ITSM_PLATFORM_SPEC.md § 9. Edite lá e rode: node scripts/sync-adrs.mjs -->

# ADR-016: Tempo, Fuso Horário e Calendários de Negócio

- **Status:** Proposto
- **Contexto:** A pausa de SLA em "Aguardando solicitante" (Épico 6.1), o horário útil por espaço e região (Épico 16.2), a janela de silêncio de notificações (Épico 10.4), a janela de mudança (Épico 6.3) e o cálculo de *aging* (Épico 9.2) dependem todos de uma semântica de tempo que nunca foi definida. Em um produto com operação em múltiplas unidades e fusos, isso é fonte garantida de divergência entre o que o sistema calcula e o que o cliente cobra em reunião de nível de serviço.
- **Decisão:**
  - Persistência sempre em `timestamptz` UTC. Conversão para fuso local **apenas** na apresentação.
  - Calendário de negócio é entidade de primeira classe: jornada por dia da semana, feriados nacionais/regionais e exceções, associado a espaço de serviço e/ou localidade.
  - O relógio de SLA corre apenas dentro do calendário aplicável; pausas são registradas como intervalos explícitos e auditáveis, não como subtração no total.
  - O prazo é **recalculado de forma determinística** a partir da trilha de eventos quando prioridade, calendário ou acordo mudam — nunca ajustado por delta acumulado, que torna impossível reconstruir a memória de cálculo.
  - Toda apuração de cumprimento expõe a memória de cálculo: qual calendário, quais intervalos correram, quais pausaram e por quê (Épico 16.3).
- **Consequências:**
  - O cumprimento de SLA passa a ser **auditável e contestável com evidência**, que é exatamente o que se espera em uma discussão contratual.
  - Exige biblioteca de tempo com suporte a fuso e horário de verão histórico; aritmética ingênua de datas é proibida.
  - Mudança retroativa de calendário afeta prazos em curso — precisa de política explícita (aplicar a partir de agora × recalcular tudo), definida com o dono do produto.

---

Contexto completo, backlog relacionado e demais decisões: `docs/ESM_ITSM_PLATFORM_SPEC.md`.
