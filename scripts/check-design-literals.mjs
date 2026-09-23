#!/usr/bin/env node
/**
 * Metade "literal" do gate 10 — história 11.3, Regra de Ouro 5, ADR-011.
 *
 * Reprova valor estético escrito direto no componente em vez de vir de
 * `/design-system/tokens.json`: hexadecimal, `rgb()/hsl()`, medida em `px`/`rem` e
 * classe utilitária arbitrária do Tailwind (`bg-[#723CEB]`, `p-[13px]`).
 *
 * A regra não é estética, é de manutenção: um `#723CEB` colado num componente não
 * aparece em lugar nenhum quando a marca mudar de roxo, e o protótipo e a produção
 * divergem sem que nada reprove. É o _design drift_ que o ADR-011 existe para impedir.
 *
 * ESCAPE: uma linha pode ser dispensada com `tokens-exempt: <motivo>` em comentário
 * na mesma linha. O motivo é obrigatório — uma dispensa sem justificativa é um
 * silenciador, e silenciador sem rastro é como o gate morre.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "node:fs/promises";

const RAIZ = resolve(fileURLToPath(import.meta.url), "../..");

/** Onde o código de interface vive. A origem e os artefatos gerados ficam de fora. */
export const PADROES = ["src/web/**/*.{ts,tsx,js,jsx,css,scss}", "src/**/*.css"];
export const IGNORADOS = [
  // Qualquer saída de build, em qualquer pacote. Varrer artefato gerado reportaria a
  // mesma violação duas vezes e apontaria para uma linha que ninguém edita — e o
  // `dist/` do design system é, por definição, cheio de valores literais.
  /(^|\/)dist\//,
  /^design-system\/tokens\.json$/,
  /\/node_modules\//,
];

// O motivo precisa começar com letra ou dígito. Um `\S+` ingênuo aceitaria o próprio
// fechamento do comentário — `tokens-exempt: */` dispensaria a linha sem justificar
// nada, que é exatamente a dispensa vazia que esta regra existe para recusar.
const ESCAPE = /tokens-exempt:[ \t]*[\p{L}\p{N}]/u;

const REGRAS = [
  {
    id: "hex",
    // `#fff`, `#723CEB`, `#723CEBFF`. O limite à direita evita casar com hash de
    // âncora ou com um id de seletor.
    padrao: /#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi,
    mensagem: "cor hexadecimal literal",
  },
  {
    id: "funcao-de-cor",
    padrao: /\b(?:rgba?|hsla?|oklch|color-mix)\s*\(/gi,
    mensagem: "cor construída em função",
  },
  {
    id: "medida",
    // `0px` e `0rem` passam: zero não carrega decisão de design.
    padrao: /(?<![\w-])(?!0(?:px|rem)\b)\d+(?:\.\d+)?(?:px|rem)\b/g,
    mensagem: "medida literal",
  },
  {
    id: "utilitaria-arbitraria",
    // A sintaxe de valor arbitrário do Tailwind: `bg-[#fff]`, `w-[13px]`, `p-[2.5rem]`.
    padrao: /(?<![\w-])[a-z][a-z0-9]*(?:-[a-z0-9]+)*-\[[^\]\s]+\]/g,
    mensagem: "classe utilitária arbitrária do Tailwind",
  },
];

/**
 * Analisa um conteúdo e devolve as violações encontradas.
 *
 * Função pura e exportada de propósito: é o que permite provar que o gate reprova,
 * com fixtures, mesmo antes de existir um componente no repositório. Um verificador
 * que nunca viu uma violação não é evidência de nada.
 */
export function analisar(conteudo, caminho = "<memória>") {
  const violacoes = [];

  conteudo.split("\n").forEach((linha, indice) => {
    if (ESCAPE.test(linha)) return;

    for (const regra of REGRAS) {
      regra.padrao.lastIndex = 0;
      for (const achado of linha.matchAll(regra.padrao)) {
        violacoes.push({
          caminho,
          linha: indice + 1,
          coluna: (achado.index ?? 0) + 1,
          regra: regra.id,
          mensagem: regra.mensagem,
          trecho: achado[0],
        });
      }
    }
  });

  return violacoes;
}

async function principal() {
  const arquivos = [];
  for (const padrao of PADROES) {
    for await (const encontrado of glob(padrao, { cwd: RAIZ })) {
      const rel = encontrado.split("\\").join("/");
      if (IGNORADOS.some((re) => re.test(rel))) continue;
      if (!arquivos.includes(rel)) arquivos.push(rel);
    }
  }

  const violacoes = arquivos.flatMap((rel) =>
    analisar(readFileSync(resolve(RAIZ, rel), "utf8"), rel),
  );

  if (violacoes.length > 0) {
    console.error("Gate 10 — valor estético fora de tokens.json:\n");
    for (const v of violacoes) {
      console.error(`  ${v.caminho}:${v.linha}:${v.coluna}  ${v.mensagem}: ${v.trecho}`);
    }
    console.error(
      "\nO valor entra em /design-system/tokens.json e chega ao componente pela",
      "\nvariável gerada (ADR-011). Se for mesmo exceção, justifique na linha com",
      "\n`tokens-exempt: <motivo>`.",
    );
    process.exit(1);
  }

  // Dizer quantos arquivos foram varridos não é cosmético: é o que distingue
  // "nenhuma violação" de "nada foi varrido" no log da esteira. Ver a entrada de
  // 2026-09-23 em docs/PLAYBOOKS/INCIDENTS_LEARNING.md.
  console.log(`✓ gate 10 (literais): ${arquivos.length} arquivo(s) de interface varrido(s)`);

  if (arquivos.length === 0) {
    console.log(
      "  Ainda não há código de interface. A verificação é exercitada por fixtures em",
      "\n  tests/design-literals.test.ts, que provam que cada regra reprova de fato.",
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await principal();
}
