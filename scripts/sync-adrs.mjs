#!/usr/bin/env node
/**
 * Gera docs/ADR/ADR-0NN-<slug>.md a partir da seção 9 de docs/ESM_ITSM_PLATFORM_SPEC.md.
 *
 * A especificação é a fonte única dos ADRs (§8.1). Este script torna o gate 12 da esteira
 * ("sincronia documental") mecânico em vez de dependente de disciplina do revisor.
 *
 *   node scripts/sync-adrs.mjs           escreve os arquivos
 *   node scripts/sync-adrs.mjs --check   falha se algum arquivo estiver dessincronizado (CI)
 */

import { readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = join(root, "docs", "ESM_ITSM_PLATFORM_SPEC.md");
const ADR_DIR = join(root, "docs", "ADR");

/** Slugs fixos: o nome do arquivo é uma referência estável e não deve mudar se o título for reescrito. */
const SLUGS = {
  "001": "nodejs-distroless",
  "002": "supabase-selfhosted-pgmq",
  "003": "multitenancy-rls",
  "004": "workflow-engine-json-dsl",
  "005": "acessibilidade-wcag",
  "006": "motor-regras-negocio",
  "007": "trilha-auditoria-imutavel",
  "008": "observabilidade-hardening-dr",
  "009": "contrato-api-openapi",
  "010": "notificacoes-multicanal",
  "011": "design-tokens-fonte-unica",
  "012": "tenancy-workspace",
  "013": "lgpd-retencao-auditoria",
  "014": "anexos-storage",
  "015": "numeracao-registros",
  "016": "tempo-calendarios-negocio",
  "017": "isolamento-rag",
  "018": "estrategia-testes",
  "019": "i18n-localizacao",
  "020": "tipografia-self-hosted",
};

const spec = readFileSync(SPEC, "utf8");

// Recorta a seção 9 (até a seção 10).
const start = spec.indexOf("## 9. Registros de Decisão de Arquitetura");
const end = spec.indexOf("## 10. Contratos de Engenharia");
if (start === -1 || end === -1) {
  console.error("Não foi possível localizar a seção 9 em", SPEC);
  process.exit(1);
}
const section = spec.slice(start, end);

// Cada ADR começa em "### [`[+]` ]ADR-0NN: Título".
const entries = [...section.matchAll(/^### (?:`\[\+\]` )?ADR-(\d{3}): (.+)$/gm)].map(
  (m, i, all) => {
    const bodyStart = m.index + m[0].length;
    const bodyEnd = i + 1 < all.length ? all[i + 1].index : section.length;
    return { num: m[1], title: m[2].trim(), body: section.slice(bodyStart, bodyEnd).trim() };
  },
);

if (entries.length === 0) {
  console.error("Nenhum ADR encontrado na seção 9.");
  process.exit(1);
}

const render = ({ num, title, body }) =>
  `<!-- GERADO POR scripts/sync-adrs.mjs — NÃO EDITAR À MÃO.\n` +
  `     A fonte é docs/ESM_ITSM_PLATFORM_SPEC.md § 9. Edite lá e rode: node scripts/sync-adrs.mjs -->\n\n` +
  `# ADR-${num}: ${title}\n\n${body}\n\n---\n\n` +
  `Contexto completo, backlog relacionado e demais decisões: \`docs/ESM_ITSM_PLATFORM_SPEC.md\`.\n`;

const expected = new Map(
  entries.map((e) => [`ADR-${e.num}-${SLUGS[e.num] ?? "sem-slug"}.md`, render(e)]),
);

const missingSlug = entries.filter((e) => !SLUGS[e.num]);
if (missingSlug.length) {
  console.error(
    `ADR sem slug definido em scripts/sync-adrs.mjs: ${missingSlug.map((e) => e.num).join(", ")}`,
  );
  process.exit(1);
}

const onDisk = readdirSync(ADR_DIR).filter((f) => /^ADR-\d{3}-.+\.md$/.test(f));
const check = process.argv.includes("--check");
const problems = [];

for (const [name, content] of expected) {
  const path = join(ADR_DIR, name);
  const current = onDisk.includes(name) ? readFileSync(path, "utf8") : null;
  if (current === content) continue;
  if (check) problems.push(current === null ? `ausente: ${name}` : `dessincronizado: ${name}`);
  else writeFileSync(path, content);
}

for (const name of onDisk.filter((f) => !expected.has(f))) {
  if (check) problems.push(`órfão (não existe na §9): ${name}`);
  else unlinkSync(join(ADR_DIR, name));
}

if (check && problems.length) {
  console.error("ADRs fora de sincronia com a especificação:");
  for (const p of problems) console.error(`  - ${p}`);
  console.error("\nRode: node scripts/sync-adrs.mjs");
  process.exit(1);
}

console.log(
  check
    ? `OK: ${expected.size} ADRs sincronizados.`
    : `Gerados ${expected.size} ADRs em docs/ADR/.`,
);
