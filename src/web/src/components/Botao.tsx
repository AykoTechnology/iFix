/**
 * Botão — o primeiro elemento clicável da interface.
 *
 * Existe agora porque a história 11.7 verifica regras sobre o que o usuário toca, e
 * uma regra sem nenhum elemento clicável para medir passaria por vacuidade. Implementa
 * o inventário de `docs/design-system/components.md`: primário, secundário e terciário,
 * mais o estado desabilitado. Ficam de fora, por ora, o destrutivo e o tamanho pequeno.
 *
 * 1. **Alvo mínimo de 44×44 px** (ADR-005): `min-h`/`min-w` vêm de `a11y.min-tap-target`.
 *    É mínimo, não fixo — um rótulo longo cresce, nunca encolhe abaixo do alvo.
 * 2. **Foco visível, nunca suprimido**: anel de `a11y.focus-ring-width` com o offset e
 *    a cor de `a11y`/`color.focus-ring`, em todas as variantes e no desabilitado.
 * 3. **Sem valor estético literal** (ADR-011): só classes geradas dos tokens, escritas
 *    por extenso — o Tailwind não enxerga classe montada por interpolação.
 */

export type VarianteDoBotao = "primario" | "secundario" | "terciario";

const BASE = [
  "inline-flex items-center justify-center gap-2 rounded-input px-4 py-2",
  "font-body text-body font-medium",
  "min-h-a11y-min-tap-target min-w-a11y-min-tap-target",
  "focus-visible:outline focus-visible:outline-focus focus-visible:outline-offset-focus",
  "focus-visible:outline-focus-ring",
].join(" ");

const VARIANTES: Record<VarianteDoBotao, string> = {
  primario: "bg-brand-purple text-brand-white hover:bg-brand-purple-hover",
  secundario:
    "border border-border-interactive text-text-primary hover:border-border-strong hover:bg-raised",
  terciario: "text-text-primary hover:bg-raised",
};

const DESABILITADO = "cursor-not-allowed bg-raised text-text-muted";

export interface BotaoProps {
  variante?: VarianteDoBotao;
  desabilitado?: boolean;
  /** Rótulo visível. Obrigatório: a cor e o ícone nunca informam sozinhos (ADR-005). */
  children: string;
  onClick?: () => void;
  type?: "button" | "submit";
}

export function Botao({
  variante = "primario",
  desabilitado = false,
  children,
  onClick,
  type = "button",
}: BotaoProps): React.ReactElement {
  return (
    <button
      type={type}
      disabled={desabilitado}
      onClick={onClick}
      className={`${BASE} ${desabilitado ? DESABILITADO : VARIANTES[variante]}`}
    >
      {children}
    </button>
  );
}
