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
        `bg-status-${estado}-tint text-status-${estado}-text`,
      ].join(" ")}
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-pill bg-status-${estado}-dot`} />
      {conteudo}
    </span>
  );
}
