import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildServer } from "./server.js";
import { loadConfig } from "./config.js";

/**
 * Emite `docs/api/openapi.json` a partir dos schemas Zod das rotas (ADR-009).
 *
 * O arquivo é versionado para que toda mudança de contrato apareça como diff no PR —
 * é o sinal que dispara a conversa sobre compatibilidade com quem consome a API. O
 * gate 6 da esteira roda isto com `--check` e falha se o versionado divergir.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUTPUT = join(root, "docs", "api", "openapi.json");

async function emit(): Promise<string> {
  // Valores mínimos: nada aqui toca o banco, apenas monta as rotas para extrair o schema.
  const config = loadConfig({
    ...process.env,
    PGPASSWORD: process.env.PGPASSWORD ?? "openapi-emit",
    JWT_SECRET: process.env.JWT_SECRET ?? "x".repeat(32),
    NODE_ENV: "test",
  });

  const { app } = await buildServer(config);
  await app.ready();
  const document = app.swagger();
  await app.close();

  return `${JSON.stringify(document, null, 2)}\n`;
}

const check = process.argv.includes("--check");
const generated = await emit();

if (check) {
  const { readFileSync } = await import("node:fs");
  let current: string | null = null;
  try {
    current = readFileSync(OUTPUT, "utf8");
  } catch {
    current = null;
  }

  if (current !== generated) {
    process.stderr.write(
      current === null
        ? `docs/api/openapi.json ausente.\nRode: npm run openapi\n`
        : `docs/api/openapi.json divergente dos schemas Zod.\nRode: npm run openapi\n`,
    );
    process.exit(1);
  }
  process.stdout.write("OK: OpenAPI em sincronia com os schemas Zod.\n");
} else {
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, generated);
  process.stdout.write(`Gerado ${OUTPUT}\n`);
}
