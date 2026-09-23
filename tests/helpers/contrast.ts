/**
 * Cálculo de contraste da WCAG 2.2, implementado aqui em vez de importado.
 *
 * São vinte linhas de aritmética definidas na própria norma, e a alternativa seria
 * uma dependência a mais na superfície de ataque do repositório para calcular algo
 * que não muda. A fórmula está em https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
  /** 0 a 1. Ausente equivale a 1 (opaco). */
  a: number;
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGBA = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;

/** Aceita `#RGB`, `#RRGGBB`, `#RRGGBBAA`, `rgb()` e `rgba()`. */
export function parseColor(input: string): Rgb {
  const valor = input.trim();

  if (HEX.test(valor)) {
    const hex = valor.slice(1);
    const expandido =
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex;
    return {
      r: parseInt(expandido.slice(0, 2), 16),
      g: parseInt(expandido.slice(2, 4), 16),
      b: parseInt(expandido.slice(4, 6), 16),
      a: expandido.length === 8 ? parseInt(expandido.slice(6, 8), 16) / 255 : 1,
    };
  }

  const rgba = RGBA.exec(valor);
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }

  throw new Error(`cor não reconhecida: ${input}`);
}

/**
 * Compõe uma cor translúcida sobre um fundo opaco.
 *
 * Sem isto, um token `tint` com alfa seria medido como se fosse opaco, e o resultado
 * não teria relação com o que o usuário enxerga — os tints do design system existem
 * justamente para ficar sobre uma superfície.
 */
export function composite(frente: Rgb, fundo: Rgb): Rgb {
  if (frente.a >= 1) return frente;
  const mistura = (f: number, t: number): number => Math.round(f * frente.a + t * (1 - frente.a));
  return {
    r: mistura(frente.r, fundo.r),
    g: mistura(frente.g, fundo.g),
    b: mistura(frente.b, fundo.b),
    a: 1,
  };
}

function luminanciaRelativa({ r, g, b }: Rgb): number {
  const canal = (valor8: number): number => {
    const c = valor8 / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/**
 * Razão de contraste entre duas cores, de 1 (idênticas) a 21 (preto sobre branco).
 *
 * A cor de frente é composta sobre o fundo antes da medição, então passar um valor
 * com alfa produz o número que o olho recebe, não o da cor isolada.
 */
export function contrastRatio(frente: string, fundo: string): number {
  const corFundo = parseColor(fundo);
  if (corFundo.a < 1) {
    throw new Error(`o fundo precisa ser opaco para a medição ter significado: ${fundo}`);
  }
  const corFrente = composite(parseColor(frente), corFundo);

  const l1 = luminanciaRelativa(corFrente);
  const l2 = luminanciaRelativa(corFundo);
  const [claro, escuro] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (claro + 0.05) / (escuro + 0.05);
}

/**
 * Achata uma cor translúcida sobre um fundo opaco e devolve o hexadecimal resultante.
 *
 * É o que permite medir um par como `status.text` sobre `status.tint`: o tint não é
 * fundo, é uma camada; o fundo real é a superfície do tema por baixo dele.
 */
export function flattenOver(frente: string, fundo: string): string {
  const corFundo = parseColor(fundo);
  if (corFundo.a < 1) {
    throw new Error(`o fundo precisa ser opaco: ${fundo}`);
  }
  const { r, g, b } = composite(parseColor(frente), corFundo);
  const par = (v: number): string => v.toString(16).padStart(2, "0");
  return `#${par(r)}${par(g)}${par(b)}`;
}

/** Arredonda para baixo em duas casas: 4.499 não deve virar 4.5 e passar por 4.5:1. */
export function round2(valor: number): number {
  return Math.floor(valor * 100) / 100;
}
