import type { StorybookConfig } from "@storybook/react-vite";

/**
 * Storybook como vitrine e superfície de teste dos componentes — História 11.5.
 *
 * O que o torna mecanismo, e não catálogo: cada história é também um caso de teste de
 * acessibilidade. O ADR-005 declara WCAG 2.2 AA como critério de bloqueio desde a v1.0
 * e, até aqui, era uma intenção sem nada que a sustentasse.
 */
const config: StorybookConfig = {
  stories: ["../src/web/src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y"],
  framework: { name: "@storybook/react-vite", options: {} },
};

export default config;
