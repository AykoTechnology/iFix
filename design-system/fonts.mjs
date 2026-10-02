/**
 * Validação e geração do `@font-face` — história 11.6, ADR-020.
 *
 * Funções puras: recebem os tokens, o manifesto e um leitor de arquivos, e devolvem
 * problemas ou CSS. O `build.mjs` as usa com o sistema de arquivos; os testes as usam
 * com manifestos adulterados para provar que cada regra reprova de fato.
 *
 * A razão de existir como validação, e não só como gerador: um `@font-face` apontando
 * para um arquivo trocado, ausente ou de outra família não dá erro nenhum — o
 * navegador cai em `system-ui` em silêncio, e a revisão de design passa a aprovar uma
 * interface que não é a que vai para produção (era exatamente o estado do protótipo
 * original, ver ADR-020).
 */

import { createHash } from "node:crypto";

const MAGIA_WOFF2 = "wOF2";

/** Primeira família de cada token `font.family.*` — a que o `@font-face` precisa servir. */
function familiasDosTokens(tokens) {
  const mapa = {};
  for (const [papel, token] of Object.entries(tokens.font?.family ?? {})) {
    if (papel.startsWith("$")) continue;
    mapa[papel] = token.$value[0];
  }
  return mapa;
}

const pesosDosTokens = (tokens) =>
  Object.entries(tokens.font?.weight ?? {})
    .filter(([k]) => !k.startsWith("$"))
    .map(([, t]) => t.$value);

/**
 * @param {{ tokens: object, manifesto: object, ler: (arquivo: string) => Buffer | null }} entrada
 * @returns {string[]} problemas; vazio quando a configuração é íntegra
 */
export function validarFontes({ tokens, manifesto, ler }) {
  const problemas = [];
  const politica = tokens.$extensions?.["com.ifix.fonts"] ?? {};

  if (politica.hosting !== "self-hosted")
    problemas.push("com.ifix.fonts.hosting não é self-hosted");
  if (politica.externalCdn !== false) problemas.push("com.ifix.fonts.externalCdn não é false");
  if (politica.format !== "woff2") problemas.push("com.ifix.fonts.format não é woff2");

  const porPapel = familiasDosTokens(tokens);
  const exigidas = new Set(Object.values(porPapel));
  const declaradas = new Set(manifesto.families.map((f) => f.family));

  for (const nome of exigidas) {
    if (!declaradas.has(nome)) {
      problemas.push(`família "${nome}" está nos tokens, mas não tem arquivos no manifesto`);
    }
  }
  for (const nome of declaradas) {
    if (!exigidas.has(nome)) {
      problemas.push(`família "${nome}" tem arquivos no manifesto, mas nenhum token a usa`);
    }
  }

  const pesos = pesosDosTokens(tokens);

  for (const familia of manifesto.families) {
    const rotulo = `"${familia.family}"`;
    const subconjuntos = familia.files.map((f) => f.subset).sort();
    const esperados = [...(politica.subsets ?? [])].sort();
    if (JSON.stringify(subconjuntos) !== JSON.stringify(esperados)) {
      problemas.push(
        `${rotulo}: subconjuntos [${subconjuntos}] diferem da política [${esperados}]`,
      );
    }

    const [minimo, maximo] = familia.weight;
    for (const peso of pesos) {
      if (peso < minimo || peso > maximo) {
        problemas.push(`${rotulo}: o eixo de peso ${minimo}–${maximo} não cobre o token ${peso}`);
      }
    }

    for (const arquivo of familia.files) {
      const alvo = `${rotulo} ${arquivo.subset} (${arquivo.file})`;
      if (/[:/\\]/.test(arquivo.file)) {
        problemas.push(`${alvo}: o arquivo precisa ser um nome local, não um caminho ou URL`);
        continue;
      }
      if (!arquivo.unicodeRange) problemas.push(`${alvo}: unicodeRange vazio`);

      const bytes = ler(arquivo.file);
      if (bytes === null) {
        problemas.push(`${alvo}: arquivo ausente em design-system/fonts/`);
        continue;
      }
      if (bytes.subarray(0, 4).toString("latin1") !== MAGIA_WOFF2) {
        problemas.push(`${alvo}: não é WOFF2 (assinatura inválida)`);
      }
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (hash !== arquivo.sha256) {
        problemas.push(`${alvo}: SHA-256 diverge do manifesto — o arquivo foi alterado ou trocado`);
      }
    }

    const licenca = ler(familia.licenseFile);
    if (licenca === null || !/SIL OPEN FONT LICENSE/i.test(licenca.toString("utf8"))) {
      problemas.push(`${rotulo}: ${familia.licenseFile} ausente ou não é a SIL OFL`);
    }
  }

  const corpo = manifesto.families.find((f) => f.family === porPapel.body);
  if (!corpo?.preload || !corpo.files.some((f) => f.subset === corpo.preload)) {
    problemas.push("a fonte de corpo precisa declarar o subconjunto de preload (história 11.6)");
  }

  return problemas;
}

/** `@font-face` determinístico — a ordem do manifesto é a ordem da saída. */
export function gerarFontsCss({ manifesto, cabecalho }) {
  const blocos = [];
  for (const familia of manifesto.families) {
    for (const arquivo of familia.files) {
      blocos.push(
        [
          "@font-face {",
          `  font-family: "${familia.family}";`,
          `  font-style: ${familia.style};`,
          `  font-weight: ${familia.weight[0]} ${familia.weight[1]};`,
          "  font-display: swap;",
          `  src: url("../fonts/${arquivo.file}") format("woff2");`,
          `  unicode-range: ${arquivo.unicodeRange};`,
          "}",
        ].join("\n"),
      );
    }
  }
  return `${cabecalho}\n\n${blocos.join("\n\n")}\n`;
}
