#!/usr/bin/env node
/**
 * Compila `/design-system/tokens.json` nos artefatos de UI — história 11.2, ADR-011.
 *
 * Saídas, ambas em `design-system/dist/` e ambas versionadas:
 *
 *   tokens.css          variáveis CSS nativas, exigidas explicitamente pelo ADR-011
 *   tailwind-theme.js   extensão de tema do Tailwind, apontando para essas variáveis
 *
 * O Tailwind aponta para `var(--…)` em vez de receber o hexadecimal direto. É o que
 * torna a troca de tema uma troca de atributo no `<html>`, e não uma recompilação:
 * o componente consome o papel semântico resolvido e nunca sabe qual tema está ativo
 * (é a regra registrada no `$description` de `color.theme`).
 *
 * Com `--check`, nada é escrito: compara o que sairia com o que está versionado e
 * termina em 1 se divergir. É a metade "drift" do gate 10, no mesmo padrão do gate 6.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import StyleDictionary from "style-dictionary";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..");
const ORIGEM = resolve(AQUI, "tokens.json");
const DESTINO = resolve(AQUI, "dist");

const conferir = process.argv.includes("--check");

/** Papéis de `color.theme.<tema>` viram `--color-<papel>`, resolvidos por tema. */
const GRUPO_TEMA = ["color", "theme"];

const ehTokenDeTema = (path) =>
  path.length === GRUPO_TEMA.length + 2 && GRUPO_TEMA.every((seg, i) => path[i] === seg);

const nomeCss = (path) => `--${path.join("-")}`;

/**
 * Serializa um `$value` do DTCG para CSS.
 *
 * Os tipos compostos (`shadow`, `gradient`, `fontFamily`) não têm representação
 * textual única no DTCG, então a conversão é explícita aqui em vez de delegada — um
 * transform genérico produziria `[object Object]` em silêncio.
 */
function valorCss(token) {
  const valor = token.$value ?? token.value;
  const tipo = token.$type ?? token.type;

  switch (tipo) {
    case "fontFamily":
      // Nome com espaço precisa de aspas; `system-ui` e `monospace` são palavras-chave
      // e ficariam inválidas entre aspas.
      return valor.map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(", ");

    case "shadow": {
      const camadas = Array.isArray(valor) ? valor : [valor];
      return camadas
        .map((c) => `${c.offsetX} ${c.offsetY} ${c.blur} ${c.spread} ${c.color}`)
        .join(", ");
    }

    case "gradient": {
      // O arquivo declara a forma canônica na extensão porque o DTCG não expressa
      // ângulo: usar a extensão evita inventar um aqui e divergir do protótipo.
      const css = token.$extensions?.["com.ifix.css"];
      if (typeof css === "string") return css;
      const paradas = valor.map((p) => `${p.color} ${Math.round(p.position * 100)}%`).join(", ");
      return `linear-gradient(135deg, ${paradas})`;
    }

    default:
      return String(valor);
  }
}

const AVISO = [
  "GERADO — não edite à mão.",
  "Origem: design-system/tokens.json · Compilador: design-system/build.mjs",
  "Alteração de design entra no tokens.json e recompila (ADR-011).",
  "O gate 10 da esteira reprova se este arquivo divergir da origem.",
];

/** CSS não aninha comentário: o bloco abre uma vez e fecha uma vez. */
const cabecalhoCss = () => `/*\n${AVISO.map((l) => ` * ${l}`).join("\n")}\n */`;
const cabecalhoJs = () => AVISO.map((l) => `// ${l}`).join("\n");

/** Reindenta um bloco já montado, para aninhá-lo dentro de outro seletor. */
const indentar = (bloco, niveis = 1) =>
  bloco.replace(/^/gm, "  ".repeat(niveis)).replace(/^\s+$/gm, "");

StyleDictionary.registerFormat({
  name: "ifix/css-variables",
  format({ dictionary }) {
    const globais = [];
    const porTema = new Map();

    for (const token of dictionary.allTokens) {
      if (ehTokenDeTema(token.path)) {
        const tema = token.path[2];
        const papel = token.path[3];
        if (!porTema.has(tema)) porTema.set(tema, []);
        porTema.get(tema).push(`  --color-${papel}: ${valorCss(token)};`);
      } else {
        globais.push(`  ${nomeCss(token.path)}: ${valorCss(token)};`);
      }
    }

    const temas = [...porTema.keys()];
    const padrao = temas.includes("dark") ? "dark" : temas[0];
    const alternativo = temas.find((t) => t !== padrao);

    const blocos = [
      cabecalhoCss(),
      "",
      `:root {\n${globais.join("\n")}\n\n  /* tema ${padrao} — padrão */\n${porTema.get(padrao).join("\n")}\n}`,
    ];

    if (alternativo) {
      const declaracoes = porTema.get(alternativo).join("\n");
      blocos.push(
        "",
        `/* Escolha explícita do usuário, persistida no atributo do <html>. */`,
        `:root[data-theme="${alternativo}"] {\n${declaracoes}\n}`,
        "",
        `/* Preferência do sistema operacional, quando não houve escolha explícita.`,
        ` * A guarda :not([data-theme]) é o que impede a preferência do SO de sobrepor`,
        ` * uma escolha que o usuário já fez. */`,
        `@media (prefers-color-scheme: ${alternativo}) {`,
        indentar(`:root:not([data-theme]) {\n${declaracoes}\n}`),
        `}`,
      );
    }

    return `${blocos.join("\n")}\n`;
  },
});

StyleDictionary.registerFormat({
  name: "ifix/tailwind-theme",
  format({ dictionary }) {
    const secoes = {
      colors: {},
      spacing: {},
      borderRadius: {},
      fontFamily: {},
      fontSize: {},
      fontWeight: {},
      lineHeight: {},
      boxShadow: {},
      backgroundImage: {},
    };

    const papeisDeTema = new Set();

    for (const token of dictionary.allTokens) {
      const [raiz, ...resto] = token.path;
      const ref = `var(${ehTokenDeTema(token.path) ? `--color-${token.path[3]}` : nomeCss(token.path)})`;

      if (ehTokenDeTema(token.path)) {
        papeisDeTema.add(token.path[3]);
        continue;
      }

      switch (raiz) {
        case "color":
          secoes.colors[resto.join("-")] = ref;
          break;
        case "space":
          secoes.spacing[resto.join("-")] = ref;
          break;
        case "radius":
          secoes.borderRadius[resto.join("-")] = ref;
          break;
        case "shadow":
          secoes.boxShadow[resto.join("-")] = ref;
          break;
        case "gradient":
          secoes.backgroundImage[resto.join("-")] = ref;
          break;
        case "font":
          if (resto[0] === "family") secoes.fontFamily[resto[1]] = ref;
          else if (resto[0] === "size") secoes.fontSize[resto[1]] = ref;
          else if (resto[0] === "weight") secoes.fontWeight[resto[1]] = ref;
          else if (resto[0] === "line-height") secoes.lineHeight[resto[1]] = ref;
          break;
        case "layout":
        case "a11y":
          // Entram em `spacing` para ficarem disponíveis como w-/h-/p-/m-, que é onde
          // uma medida de layout é efetivamente usada.
          secoes.spacing[[raiz, ...resto].join("-")] = ref;
          break;
        default:
          throw new Error(`grupo de token sem destino no Tailwind: ${token.path.join(".")}`);
      }
    }

    // Papéis de tema entram sem prefixo: `bg-surface`, `text-text-primary`. São eles
    // que os componentes devem usar — a paleta bruta existe para compor tokens novos.
    for (const papel of [...papeisDeTema].sort()) {
      secoes.colors[papel] = `var(--color-${papel})`;
    }

    return [
      cabecalhoJs(),
      "",
      "/** Extensão de tema do Tailwind derivada dos design tokens (ADR-011). */",
      `export const ifixTheme = ${JSON.stringify(secoes, null, 2)};`,
      "",
      "export default ifixTheme;",
      "",
    ].join("\n");
  },
});

const sd = new StyleDictionary({
  source: [ORIGEM],
  // Os `$description` de grupo não são tokens e a detecção de DTCG é automática na v4.
  platforms: {
    web: {
      // Sem transforms: a serialização de cada tipo é explícita em `valorCss`, e um
      // transform genérico silenciaria os tipos compostos.
      buildPath: `${relative(process.cwd(), DESTINO)}/`,
      files: [
        { destination: "tokens.css", format: "ifix/css-variables" },
        { destination: "tailwind-theme.js", format: "ifix/tailwind-theme" },
      ],
    },
  },
});

const plataforma = await sd.getPlatformTokens("web");
const gerados = new Map();

for (const arquivo of [
  { nome: "tokens.css", formato: "ifix/css-variables" },
  { nome: "tailwind-theme.js", formato: "ifix/tailwind-theme" },
]) {
  const fn = StyleDictionary.hooks.formats[arquivo.formato];
  gerados.set(
    arquivo.nome,
    await fn({ dictionary: plataforma, file: {}, options: {}, platform: {} }),
  );
}

if (conferir) {
  const divergentes = [];
  for (const [nome, conteudo] of gerados) {
    let atual = null;
    try {
      atual = readFileSync(resolve(DESTINO, nome), "utf8");
    } catch {
      divergentes.push(`${nome} (ausente)`);
      continue;
    }
    if (atual !== conteudo) divergentes.push(nome);
  }

  if (divergentes.length > 0) {
    console.error("Gate 10 — os artefatos compilados divergem de tokens.json:\n");
    for (const nome of divergentes) console.error(`  design-system/dist/${nome}`);
    console.error("\nRode `npm run tokens` e versione o resultado.");
    console.error("Alteração de design entra no tokens.json — nunca direto no artefato (ADR-011).");
    process.exit(1);
  }

  console.log(`✓ artefatos de design em sincronia com tokens.json (${gerados.size} arquivos)`);
} else {
  mkdirSync(DESTINO, { recursive: true });
  for (const [nome, conteudo] of gerados) {
    writeFileSync(resolve(DESTINO, nome), conteudo);
    console.log(`  ${relative(RAIZ, resolve(DESTINO, nome))}`);
  }
  console.log(`✓ ${gerados.size} artefatos gerados a partir de tokens.json`);
}
