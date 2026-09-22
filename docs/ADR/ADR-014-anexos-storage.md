<!-- GERADO POR scripts/sync-adrs.mjs — NÃO EDITAR À MÃO.
     A fonte é docs/ESM_ITSM_PLATFORM_SPEC.md § 9. Edite lá e rode: node scripts/sync-adrs.mjs -->

# ADR-014: Armazenamento de Anexos com Isolamento, Varredura e URLs Efêmeras

- **Status:** Proposto
- **Contexto:** A mesa de atendimento prevê explicitamente arrastar anexos e capturas de tela; artigos de KB, evidências de teste (Épico 14.3), comprovantes de reembolso (Épico 19.2) e certificados de descarte (Épico 8.5) também dependem de arquivos. Nenhuma linha do documento v1.1 trata de armazenamento de binários — nem do risco que ele carrega, que é o vetor de ataque mais comum em service desks: o anexo malicioso que o analista abre.
- **Decisão:** Usar Supabase Storage com as seguintes restrições inegociáveis:
  - Bucket privado por padrão, com políticas RLS espelhando o modelo do ADR-012 (locatário e espaço de serviço) — nunca bucket público com URL "secreta".
  - Acesso exclusivamente por **URL assinada de vida curta**, gerada por requisição autorizada.
  - **Varredura antivírus assíncrona obrigatória** antes de o arquivo ficar disponível para download; enquanto pendente, o anexo aparece como "em verificação".
  - Tipo e tamanho de arquivo em lista de permissão explícita; conteúdo validado por assinatura de arquivo (*magic bytes*), não por extensão.
  - Download servido com `Content-Disposition: attachment` e cabeçalhos que impeçam renderização no contexto da aplicação (proteção contra HTML/SVG maliciosos).
- **Consequências:**
  - O anexo deixa de ser vetor trivial de *XSS* ou de distribuição de malware entre colaboradores.
  - Exige fila e worker de varredura (candidato natural: `pgmq_attachment_scan`), com estado do anexo visível na interface.
  - Retenção e eliminação de anexos seguem o ADR-013 — inclusive anexos são dado pessoal com frequência (foto, documento, comprovante).
  - Custos de armazenamento e política de expurgo passam a ser dimensionáveis desde a Fase 0, não descobertos em produção.

---

Contexto completo, backlog relacionado e demais decisões: `docs/ESM_ITSM_PLATFORM_SPEC.md`.
