import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "src/**/*.test.ts"],
    // Os testes de integração compartilham um único banco e semeiam estado conhecido
    // a cada caso. Paralelizar arquivos os faria truncar as tabelas uns dos outros.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "**/dist/**",
        "**/*.test.ts",
        // Histórias são documentação executável, não lógica de produto: a cobertura
        // delas seria o reflexo do teste de acessibilidade, não informação nova.
        "**/*.stories.tsx",
        // Pontos de entrada de processo. São verificados executando o artefato
        // compilado — `tests/graceful-shutdown.test.ts` sobe o index e mata com
        // SIGTERM; `npm run openapi:check` roda o emissor. Como a execução acontece
        // em outro processo, a instrumentação do v8 não a enxerga, e mantê-los na
        // conta faria a métrica reportar 0% para código que está, de fato, coberto.
        "src/api/src/index.ts",
        "src/api/src/openapi-emit.ts",
        // Mesmo caso: laço de processo com espera por sinal. O consumo em si —
        // `consumeBatch` — é exercitado contra pgmq real em `tests/queue.test.ts`.
        "src/workers/src/index.ts",
      ],
      thresholds: { lines: 85, functions: 85, branches: 85, statements: 85 },
    },
  },
  // As histórias e os componentes usam JSX. O runtime automático evita ter de
  // importar React em cada arquivo — e um `import React` esquecido falharia só em
  // tempo de execução, num teste que deveria estar medindo acessibilidade.
  esbuild: { jsx: "automatic" },

  resolve: {
    alias: { "@ifix/shared": new URL("./src/shared/src/index.ts", import.meta.url).pathname },
  },
});
