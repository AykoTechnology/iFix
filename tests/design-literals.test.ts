import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analisar } from "../scripts/check-design-literals.mjs";

const checar = analisar;

/**
 * Prova que o gate 10 reprova — história 11.3.
 *
 * Existe porque `src/web/` ainda está vazio: sem estas fixtures, o verificador
 * varreria zero arquivo, sairia com 0 e ficaria indistinguível de gate nenhum. É o
 * mesmo defeito documentado duas vezes em docs/PLAYBOOKS/INCIDENTS_LEARNING.md — o
 * contrato OpenAPI vazio e as actions que não chegavam a executar.
 */
describe("o verificador reprova valor estético literal", () => {
  const casos: Array<[string, string, string]> = [
    ["cor hexadecimal", `const roxo = "#723CEB";`, "hex"],
    ["hexadecimal curto", `.chip { color: #fff; }`, "hex"],
    ["cor em função", `background: rgba(114, 60, 235, 0.14);`, "funcao-de-cor"],
    ["medida em px", `.card { padding: 24px; }`, "medida"],
    ["medida em rem", `.card { gap: 1.5rem; }`, "medida"],
    ["utilitária arbitrária de cor", `<div className="bg-[#723CEB]" />`, "utilitaria-arbitraria"],
    ["utilitária arbitrária de medida", `<div className="w-[13px]" />`, "utilitaria-arbitraria"],
  ];

  for (const [nome, fonte, regra] of casos) {
    it(nome, () => {
      const violacoes = checar(fonte);
      expect(violacoes.map((v) => v.regra)).toContain(regra);
    });
  }
});

describe("o verificador não reprova o uso correto", () => {
  const aceitos: Array<[string, string]> = [
    ["variável gerada", `.card { padding: var(--space-6); }`],
    ["classe utilitária semântica", `<div className="bg-surface text-text-primary p-6" />`],
    ["zero sem unidade de decisão", `.reset { margin: 0px; padding: 0rem; }`],
    ["cor de tema por papel", `<span className="text-status-novo-text" />`],
    ["número sem unidade estética", `const limite = 42;`],
    ["identificador com dígitos", `const sha256 = hash();`],
  ];

  for (const [nome, fonte] of aceitos) {
    it(nome, () => {
      expect(checar(fonte)).toEqual([]);
    });
  }
});

describe("a dispensa deixa rastro", () => {
  it("aceita a linha quando há motivo declarado", () => {
    const fonte = `.sombra { box-shadow: 0 1px 0 #000; } /* tokens-exempt: hairline do canvas de impressão */`;
    expect(checar(fonte)).toEqual([]);
  });

  it("não aceita dispensa sem motivo", () => {
    // Uma dispensa vazia é um silenciador, e silenciador sem rastro é como o gate
    // morre: alguém cola o marcador, o CI aprova, e ninguém sabe por quê.
    const fonte = `.chip { color: #fff; } /* tokens-exempt: */`;
    expect(checar(fonte).length).toBeGreaterThan(0);
  });
});

describe("artefatos gerados a partir de tokens.json (história 11.2)", () => {
  const css = readFileSync(new URL("../design-system/dist/tokens.css", import.meta.url), "utf8");
  const tailwind = readFileSync(
    new URL("../design-system/dist/tailwind-theme.js", import.meta.url),
    "utf8",
  );

  it("o CSS declara o tema padrão e o alternativo", () => {
    expect(css).toMatch(/^:root \{/m);
    expect(css).toContain(':root[data-theme="light"]');
    expect(css).toContain("@media (prefers-color-scheme: light)");
  });

  it("a preferência do sistema não sobrepõe escolha explícita do usuário", () => {
    // Sem a guarda, quem escolheu o tema claro num sistema escuro veria a escolha
    // ser revertida pela media query — um defeito que só aparece na máquina de quem
    // tem a preferência oposta à do time.
    expect(css).toContain(":root:not([data-theme])");
  });

  it("os papéis de tema saem sem o prefixo do grupo", () => {
    // `--color-surface`, não `--color-theme-dark-surface`: o componente consome o
    // papel resolvido e nunca sabe qual tema está ativo.
    expect(css).toContain("--color-surface:");
    expect(css).not.toContain("--color-theme-");
  });

  it("os tipos compostos do DTCG viram CSS válido, não [object Object]", () => {
    expect(css).not.toContain("[object Object]");
    expect(css).toMatch(/--shadow-floating: 0px 8px 24px 0px rgba\(/);
    expect(css).toMatch(/--font-family-body: Outfit, system-ui, sans-serif;/);
    expect(css).toMatch(/--font-family-mono: "JetBrains Mono", ui-monospace, monospace;/);
    expect(css).toMatch(/--gradient-brand: linear-gradient\(/);
  });

  it("o tema do Tailwind aponta para as variáveis, não para os valores", () => {
    // É o que torna a troca de tema um atributo no <html> em vez de recompilação.
    expect(tailwind).toContain('"surface": "var(--color-surface)"');
    expect(tailwind).not.toMatch(/"#[0-9A-Fa-f]{6}"/);
  });

  it("todo grupo de token tem destino no Tailwind", () => {
    // O compilador lança em grupo sem destino; este teste garante que os grupos
    // existentes hoje estão de fato mapeados, e não apenas que nada explodiu.
    for (const secao of ["colors", "spacing", "borderRadius", "fontFamily", "boxShadow"]) {
      expect(tailwind, secao).toMatch(new RegExp(`"${secao}": \\{\\s*"`));
    }
  });
});
