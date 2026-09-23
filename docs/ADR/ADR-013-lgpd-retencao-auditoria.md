<!-- GERADO POR scripts/sync-adrs.mjs — NÃO EDITAR À MÃO.
     A fonte é docs/ESM_ITSM_PLATFORM_SPEC.md § 9. Edite lá e rode: node scripts/sync-adrs.mjs -->

# ADR-013: Retenção, LGPD e a Resolução do Conflito com a Auditoria Imutável

- **Status:** Proposto — **exige validação jurídica antes de implementação**
- **Contexto:** Existe um conflito direto e não endereçado entre dois requisitos já aprovados. O ADR-007 determina trilha de auditoria imutável com _pre-image_ e _post-image_ completos — o que copia dados pessoais para dentro de uma estrutura onde `UPDATE` e `DELETE` são revogados. A LGPD assegura ao titular o direito de eliminação e exige limitação de finalidade e de prazo. O produto processa dados de RH e Finanças por definição de escopo. Ignorar o conflito significa descobri-lo em auditoria ou em pedido de titular.
- **Decisão:**
  1. **Classificar todo campo** como: dado operacional, dado pessoal ou dado pessoal sensível — a classificação é metadado do schema, não documentação à parte.
  2. **Criptografia por titular (_crypto-shredding_)**: dados pessoais gravados na trilha de auditoria e em tabelas históricas são cifrados com chave derivada por titular. O atendimento ao direito de eliminação ocorre pela **destruição da chave**, que torna o conteúdo permanentemente ilegível sem violar a imutabilidade nem quebrar a cadeia de integridade do log.
  3. **Retenção declarada por tipo de registro**, executada por expurgo de partição (§5.1), com prazo definido por finalidade e base legal.
  4. **Minimização na origem**: a trilha registra a _pre/post-image_ dos campos governados, não o documento inteiro, quando o campo não for necessário à finalidade de auditoria.
  5. **Registro de tratamento**: finalidade, base legal e prazo por categoria de dado, mantidos como documento vivo e revisáveis.
- **Consequências:**
  - Preserva simultaneamente a imutabilidade exigida por ISO 27001/PinkVERIFY e o direito de eliminação exigido pela LGPD — sem escolher um em detrimento do outro.
  - A gestão de chaves por titular torna-se infraestrutura crítica: perda acidental de chave equivale a perda de dado; vazamento equivale a vazamento de histórico. Depende do Épico 12.6.
  - Consultas analíticas sobre dados cifrados exigem pseudonimização ou agregação prévia — impacto a considerar no Épico 9.
  - **Nenhum agente de IA decide classificação, base legal ou prazo de retenção** (§7.1). Esta decisão é humana e jurídica.

---

Contexto completo, backlog relacionado e demais decisões: `docs/ESM_ITSM_PLATFORM_SPEC.md`.
