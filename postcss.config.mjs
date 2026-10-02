/**
 * PostCSS da interface. O Vite — do Storybook e da aplicação — lê este arquivo na raiz.
 *
 * O caminho do config é explícito porque o `tailwind.config.ts` mora em `src/web/`, e
 * não na raiz onde o Tailwind o procuraria sozinho.
 */
export default {
  plugins: {
    tailwindcss: { config: "./src/web/tailwind.config.ts" },
  },
};
