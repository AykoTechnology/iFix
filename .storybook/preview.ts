import type { Preview } from "@storybook/react-vite";

// As variáveis compiladas de `tokens.json`, não uma cópia. Um Storybook que definisse
// as próprias cores validaria uma interface que não existe (ADR-011).
import "../design-system/dist/tokens.css";

const preview: Preview = {
  parameters: {
    // O painel do Axe fica visível durante o desenvolvimento; o bloqueio de merge é
    // feito pela suíte (`tests/a11y.test.tsx`), que roda as mesmas histórias.
    a11y: { test: "error" },
    backgrounds: { disable: true },
  },

  // Cada história é renderizada nos dois temas pelo teste de acessibilidade. Aqui o
  // seletor global permite alternar manualmente durante a revisão de design.
  globalTypes: {
    theme: {
      description: "Tema ativo",
      toolbar: {
        icon: "paintbrush",
        items: [
          { value: "dark", title: "Escuro" },
          { value: "light", title: "Claro" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: "dark" },
};

export default preview;
