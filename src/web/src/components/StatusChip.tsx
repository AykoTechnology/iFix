/**
 * Etiqueta de estado do chamado.
 *
 * Existe como primeiro componente porque concentra três regras que o resto da
 * interface vai herdar:
 *
 * 1. **A cor nunca informa sozinha** (ADR-005, História 11.7). O rótulo textual é
 *    obrigatório, não opcional — quem não distingue as cores, ou usa leitor de tela,
 *    recebe a mesma informação que todo mundo. O ponto colorido é redundância visual,
 *    e por isso é `aria-hidden`.
 *
 * 2. **Nenhum valor estético literal** (ADR-011). Toda cor, medida e raio vem de
 *    `tokens.json` pela classe utilitária gerada. O gate 10 reprova o contrário.
 *
 * 3. **O componente não sabe qual tema está ativo.** Consome o papel semântico
 *    resolvido; a troca de tema é um atributo no `<html>`.
 */

export const ESTADOS = {
  novo: "Novo",
  "em-atendimento": "Em atendimento",
  "aguardando-solicitante": "Aguardando solicitante",
  resolvido: "Resolvido",
  "sla-violado": "SLA violado",
  fechado: "Fechado",
} as const;

export type Estado = keyof typeof ESTADOS;

/**
 * Classes escritas por extenso, de propósito. O Tailwind só gera o CSS das classes que
 * enxerga como texto literal no código-fonte: um nome de classe montado por template
 * (prefixo fixo mais o nome do estado) nunca é visto, some do CSS e o chip fica sem cor
 * — sem erro, sem aviso e sem teste que perceba (o contraste é medido sobre os tokens,
 * não sobre o render). O gate 10 reprova interpolação em nome de classe, e
 * `Record<Estado, …>` obriga a cobrir todo estado novo.
 */
const CLASSES_DO_ESTADO: Record<Estado, { chip: string; ponto: string }> = {
  novo: { chip: "bg-status-novo-tint text-status-novo-text", ponto: "bg-status-novo-dot" },
  "em-atendimento": {
    chip: "bg-status-em-atendimento-tint text-status-em-atendimento-text",
    ponto: "bg-status-em-atendimento-dot",
  },
  "aguardando-solicitante": {
    chip: "bg-status-aguardando-solicitante-tint text-status-aguardando-solicitante-text",
    ponto: "bg-status-aguardando-solicitante-dot",
  },
  resolvido: {
    chip: "bg-status-resolvido-tint text-status-resolvido-text",
    ponto: "bg-status-resolvido-dot",
  },
  "sla-violado": {
    chip: "bg-status-sla-violado-tint text-status-sla-violado-text",
    ponto: "bg-status-sla-violado-dot",
  },
  fechado: {
    chip: "bg-status-fechado-tint text-status-fechado-text",
    ponto: "bg-status-fechado-dot",
  },
};

export interface StatusChipProps {
  estado: Estado;
  /**
   * Rótulo alternativo. O padrão vem de `ESTADOS` — passar outro texto é permitido,
   * passar texto vazio não: seria exatamente a cor sozinha carregando a informação.
   */
  rotulo?: string;
}

export function StatusChip({ estado, rotulo }: StatusChipProps): React.ReactElement {
  const texto = rotulo?.trim() ?? "";
  const conteudo = texto.length > 0 ? texto : ESTADOS[estado];

  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-chip px-2 py-1",
        "font-body text-caption",
        CLASSES_DO_ESTADO[estado].chip,
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-pill ${CLASSES_DO_ESTADO[estado].ponto}`}
      />
      {conteudo}
    </span>
  );
}
