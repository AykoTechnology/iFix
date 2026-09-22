<!-- GERADO POR scripts/sync-adrs.mjs — NÃO EDITAR À MÃO.
     A fonte é docs/ESM_ITSM_PLATFORM_SPEC.md § 9. Edite lá e rode: node scripts/sync-adrs.mjs -->

# ADR-015: Numeração Legível de Registros por Locatário

- **Status:** Proposto
- **Contexto:** Os identificadores `INC-48192`, `REQ-11204`, `CHG-0442`, `PRB-0087`, `CI-SRV-0231` e `KB-2201` aparecem em toda a interface e são o vocabulário pelo qual as pessoas se referem aos registros ("o INC-48192 está violado"). Nunca foram especificados. Numeração sequencial ingênua em sistema multilocatário e concorrente produz três defeitos previsíveis: colisão, vazamento de volume de negócio entre clientes e contenção de escrita.
- **Decisão:**
  - Chave primária técnica é UUID v7; o identificador legível é **coluna separada**, gerada por sequência **por locatário e por tipo de registro**.
  - A geração usa sequência dedicada no banco (não `MAX(n)+1`, que é *race condition* sob concorrência).
  - Lacunas na numeração são aceitáveis e esperadas (transação revertida consome número) — a numeração é identificador, não contador contábil.
  - Prefixo por tipo é configurável por locatário; o formato é imutável após o primeiro registro emitido.
- **Consequências:**
  - Um cliente não infere o volume de chamados de outro pelo número recebido.
  - Elimina contenção global de escrita entre locatários.
  - O identificador legível é o que aparece em e-mail, webhook e integração — mudar seu formato depois quebra correlação de e-mail de entrada (Épico 10.6) e integrações de cliente.

---

Contexto completo, backlog relacionado e demais decisões: `docs/ESM_ITSM_PLATFORM_SPEC.md`.
