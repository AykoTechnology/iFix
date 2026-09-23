import type { Config } from "tailwindcss";
import { ifixTheme } from "../../design-system/dist/tailwind-theme.js";

/**
 * Configuração do Tailwind derivada de `tokens.json` — ADR-011.
 *
 * `theme.extend` e não `theme`: a escala padrão do Tailwind continua disponível para
 * o que não é decisão de design (`flex`, `grid`, `items-center`). O que é decisão —
 * cor, espaçamento, raio, tipografia, sombra — vem exclusivamente dos tokens, e o
 * gate 10 reprova qualquer valor estético que não venha daqui.
 */
export default {
  content: ["./src/**/*.{ts,tsx}", "../../.storybook/**/*.{ts,tsx}"],
  // O tema é resolvido por variável CSS, então não há `darkMode: 'class'`: trocar de
  // tema é trocar `data-theme` no <html>, e o Tailwind nem precisa saber.
  theme: { extend: ifixTheme },
  plugins: [],
} satisfies Config;
