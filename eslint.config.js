import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * As regras marcadas como "Regra de Ouro" não são preferência de estilo: são os
 * mecanismos que tornam mecânicos os contratos da § 10.1 da especificação. Uma regra
 * que depende de o revisor lembrar não é contrato, é intenção.
 */
export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "design-system/dist/**"] },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        // Os arquivos de configuração da raiz não pertencem a nenhum tsconfig de
        // pacote; sem esta exceção o linter falha ao tentar tipá-los.
        projectService: {
          allowDefaultProject: [
            "eslint.config.js",
            "vitest.config.ts",
            "scripts/check-design-literals.d.mts",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Regra de Ouro 7 — zero scripts imperativos em regra de negócio.
      // Fórmulas, aprovações e roteamentos passam pelo BRE declarativo (ADR-006).
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",

      // ADR-001/ADR-008 — a imagem Distroless não tem shell: o diagnóstico em produção
      // é o log estruturado e o trace. console.log de texto livre é ruído que não
      // correlaciona com nada.
      "no-console": "error",

      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      eqeqeq: ["error", "always"],
    },
  },

  {
    files: ["**/*.test.ts", "**/*.mjs", "**/*.config.*"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
    },
  },

  {
    // Scripts de governança, o compilador de design tokens e os arquivos de
    // configuração da raiz não fazem parte de um projeto TypeScript; as regras que
    // exigem informação de tipo não se aplicam.
    files: ["**/*.mjs", "**/*.d.mts", "eslint.config.js", "vitest.config.ts"],
    ...tseslint.configs.disableTypeChecked,
  },
);
