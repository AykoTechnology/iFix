<!-- GERADO POR scripts/sync-adrs.mjs — NÃO EDITAR À MÃO.
     A fonte é docs/ESM_ITSM_PLATFORM_SPEC.md § 9. Edite lá e rode: node scripts/sync-adrs.mjs -->

# ADR-010: Arquitetura Unificada de Notificações Multicanal e Webhooks Assinados

- **Status:** Aprovado
- **Decisão:** Toda emissão de evento que requeira comunicação externa ou interna é direcionada para a fila dedicada `pgmq_notifications`. Um worker consome as mensagens e despacha para os provedores correspondentes: Microsoft Graph API para e-mails corporativos, canal WebSocket para a Central in-app e motor de Webhooks externos. Os webhooks de saída contam obrigatoriamente com assinatura criptográfica no cabeçalho `X-Signature-SHA256`, gerada a partir de chave secreta compartilhada do locatário.
- **Consequências:**
  - Desacopla o tempo de resposta das transações de usuário do tempo de entrega de mensagens de terceiros. Garante rastreabilidade, retentativas automáticas e integridade contra adulteração em integrações corporativas.
  - `[+]` Nenhum módulo de negócio invoca provedor de e-mail diretamente: todos publicam na fila com um `event_type` padronizado. Isso preserva a consistência transacional do ADR-002 e mantém a idempotência centralizada em um único consumidor.
  - `[+]` Falha de canal externo (provedor de e-mail indisponível) nunca bloqueia a notificação in-app nem o evento de negócio original. A Central in-app é a fonte de verdade de "lido/não lido"; os demais canais são cópias de melhor esforço.
  - `[+]` A chave HMAC é por locatário e precisa de rotação suportada sem janela de indisponibilidade (período de aceitação de duas chaves) — ver Épico 12.6.
  - `[+]` Sem controle de volume, o valor da notificação colapsa. Preferência por evento, _digest_ e janela de silêncio (Épico 10.4) são parte do contrato de qualidade desta decisão, não melhoria futura.
  - `[+]` A dependência do Microsoft Graph pressupõe cliente com tenant Microsoft 365. O adaptador SMTP genérico deve permanecer suportado como alternativa de primeira classe, sob o mesmo contrato de adaptador.

---

Contexto completo, backlog relacionado e demais decisões: `docs/ESM_ITSM_PLATFORM_SPEC.md`.
