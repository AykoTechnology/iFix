import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // Os testes de integração compartilham um único banco e semeiam estado conhecido
    // a cada caso. Paralelizar arquivos os faria truncar as tabelas uns dos outros.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["**/dist/**", "**/*.test.ts"],
      thresholds: { lines: 85, functions: 85, branches: 85, statements: 85 },
    },
  },
  resolve: {
    alias: { "@ifix/shared": new URL("./src/shared/src/index.ts", import.meta.url).pathname },
  },
});
