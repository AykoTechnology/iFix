import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  gerarFontsCss,
  validarFontes,
  type FamiliaDeFonte,
  type ManifestoDeFontes,
} from "../design-system/fonts.mjs";
import { featuresGsub } from "./helpers/woff2.js";

/**
 * Prova da história 11.6 (ADR-020): as fontes são servidas pela própria aplicação, os
 * arquivos são os que o manifesto declara, e nada de terceiros é consumido em runtime.
 *
 * Cada regra tem um caso que a vê falhar. Um `@font-face` quebrado não dá erro — o
 * navegador cai em `system-ui` — então sem estes casos o gate aprovaria por vacuidade.
 */

const RAIZ = new URL("../", import.meta.url).pathname;
const lerTexto = (caminho: string): string => readFileSync(join(RAIZ, caminho), "utf8");
const FONTES = "design-system/fonts";

type Tokens = { $extensions: Record<string, Record<string, unknown>> };
const tokens = JSON.parse(lerTexto("design-system/tokens.json")) as Tokens;
const manifesto = JSON.parse(lerTexto(`${FONTES}/manifest.json`)) as ManifestoDeFontes;

type Manifesto = ManifestoDeFontes;

/** Primeira família do manifesto — falha com mensagem clara em vez de `undefined`. */
const primeira = (m: Manifesto): FamiliaDeFonte => {
  const familia = m.families[0];
  if (!familia) throw new Error("manifesto sem famílias");
  return familia;
};
const clone = <T>(valor: T): T => structuredClone(valor);
const lerDoDisco = (arquivo: string): Buffer | null => {
  try {
    return readFileSync(join(RAIZ, FONTES, arquivo));
  } catch {
    return null;
  }
};

const problemas = (m: Manifesto = manifesto, t: object = tokens, ler = lerDoDisco): string[] =>
  validarFontes({ tokens: t, manifesto: m, ler });

describe("os arquivos de fonte batem com o manifesto e com os tokens", () => {
  it("a configuração versionada é íntegra", () => {
    expect(problemas()).toEqual([]);
  });

  it("serve exatamente as famílias que os tokens nomeiam", () => {
    const nomes = manifesto.families.map((f: { family: string }) => f.family).sort();
    expect(nomes).toEqual(["JetBrains Mono", "Outfit"]);
  });

  describe("reprova cada forma de a fonte falhar em silêncio", () => {
    it("arquivo ausente", () => {
      const ler = (a: string) => (a.startsWith("outfit-latin-wght") ? null : lerDoDisco(a));
      expect(problemas(manifesto, tokens, ler).join("\n")).toMatch(/arquivo ausente/);
    });

    it("arquivo trocado por outro WOFF2 válido", () => {
      const ler = (a: string) =>
        a.startsWith("outfit-latin-wght")
          ? lerDoDisco("jetbrains-mono-latin-wght-normal.woff2")
          : lerDoDisco(a);
      expect(problemas(manifesto, tokens, ler).join("\n")).toMatch(/SHA-256 diverge/);
    });

    it("arquivo que não é WOFF2 (por exemplo, uma página de erro baixada no lugar)", () => {
      const ler = (a: string) =>
        a.startsWith("outfit-latin-wght") ? Buffer.from("<html>404</html>") : lerDoDisco(a);
      expect(problemas(manifesto, tokens, ler).join("\n")).toMatch(/não é WOFF2/);
    });

    it("família nos tokens sem arquivos", () => {
      const m = clone(manifesto);
      m.families = m.families.filter((f: { family: string }) => f.family !== "JetBrains Mono");
      expect(problemas(m).join("\n")).toMatch(
        /"JetBrains Mono" está nos tokens, mas não tem arquivos/,
      );
    });

    it("arquivos de uma família que nenhum token usa", () => {
      const m = clone(manifesto);
      m.families.push({ ...clone(primeira(m)), family: "Gilroy" });
      expect(problemas(m).join("\n")).toMatch(
        /"Gilroy" tem arquivos no manifesto, mas nenhum token/,
      );
    });

    it("subconjunto fora da política", () => {
      const m = clone(manifesto);
      primeira(m).files = primeira(m).files.filter(
        (f: { subset: string }) => f.subset !== "latin-ext",
      );
      expect(problemas(m).join("\n")).toMatch(/subconjuntos \[latin\] diferem/);
    });

    it("eixo de peso que não cobre um peso dos tokens", () => {
      const m = clone(manifesto);
      primeira(m).weight = [400, 500];
      expect(problemas(m).join("\n")).toMatch(/não cobre o token (300|700)/);
    });

    it("fonte de corpo sem preload", () => {
      const m = clone(manifesto);
      primeira(m).preload = null;
      expect(problemas(m).join("\n")).toMatch(/preload/);
    });

    it("licença ausente", () => {
      const ler = (a: string) => (a === "LICENSE-outfit.txt" ? null : lerDoDisco(a));
      expect(problemas(manifesto, tokens, ler).join("\n")).toMatch(/LICENSE-outfit.txt ausente/);
    });

    it("manifesto apontando para URL externa em vez de arquivo local", () => {
      const m = clone(manifesto);
      const arquivo = primeira(m).files[0];
      if (!arquivo) throw new Error("família sem arquivos");
      arquivo.file = "https://fonts.gstatic.com/s/outfit/v11/x.woff2";
      expect(problemas(m).join("\n")).toMatch(/nome local, não um caminho ou URL/);
    });

    it("política de tokens que admite CDN externo", () => {
      const t = clone(tokens);
      const politica = t.$extensions["com.ifix.fonts"];
      if (!politica) throw new Error("tokens sem com.ifix.fonts");
      politica.externalCdn = true;
      expect(problemas(manifesto, t).join("\n")).toMatch(/externalCdn não é false/);
    });
  });
});

describe("dist/fonts.css", () => {
  const css = lerTexto("design-system/dist/fonts.css");
  const faces = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];

  it("declara um @font-face por arquivo do manifesto", () => {
    const total = manifesto.families.reduce(
      (n: number, f: { files: unknown[] }) => n + f.files.length,
      0,
    );
    expect(faces).toHaveLength(total);
    expect(total).toBeGreaterThan(0);
  });

  it("todo @font-face usa font-display: swap", () => {
    // Sem isso o texto fica invisível até a fonte chegar (FOIT).
    for (const face of faces) expect(face).toMatch(/font-display:\s*swap;/);
  });

  it("todo src aponta para um arquivo local WOFF2 que existe", () => {
    for (const face of faces) {
      const alvo = /url\("\.\.\/fonts\/([^"/]+\.woff2)"\)\s*format\("woff2"\)/.exec(face)?.[1];
      expect(alvo, face).toBeDefined();
      expect(lerDoDisco(alvo as string), `${alvo} ausente`).not.toBeNull();
    }
  });

  it("é exatamente o que o gerador produz do manifesto", () => {
    const cabecalho = css.slice(0, css.indexOf("*/") + 2);
    expect(gerarFontsCss({ manifesto, cabecalho })).toBe(css);
  });
});

describe("numerais tabulares (história 11.6)", () => {
  const features = (arquivo: string) => featuresGsub(readFileSync(join(RAIZ, FONTES, arquivo)));

  it("a Outfit oferece `tnum`, então `tabular-nums` alinha os tempos de SLA em coluna", () => {
    // Os dígitos da Outfit são proporcionais por padrão (de 321 a 659 unidades de
    // largura); com `tnum` os dez passam a ter 590. Medido nos arquivos e conferido
    // aqui a cada execução — uma troca por versão sem `tnum` desalinha a coluna em silêncio.
    expect(features("outfit-latin-wght-normal.woff2")).toContain("tnum");
  });

  it("o leitor distingue fontes: a JetBrains Mono não tem `tnum` (é monoespaçada, não precisa)", () => {
    expect(features("jetbrains-mono-latin-wght-normal.woff2")).not.toContain("tnum");
  });

  it("recusa arquivo que não é WOFF2", () => {
    expect(() => featuresGsub(Buffer.from("não sou uma fonte"))).toThrow(/assinatura inválida/);
  });
});

describe("nenhum recurso estático de terceiros em runtime (ADR-020)", () => {
  /**
   * Referência a recurso por URL absoluta ou sem esquema (`//cdn…`) em `url()`,
   * `@import`, `<link href>` ou `<script src>`. Detecta pela forma, não por uma lista
   * de domínios: um CDN novo não escapa só por não estar na lista.
   */
  const REFERENCIAS_EXTERNAS: RegExp[] = [
    /url\(\s*['"]?(?:https?:)?\/\/[^)'"\s]+/gi,
    /@import\s+(?:url\(\s*)?['"]?(?:https?:)?\/\/[^)'"\s;]+/gi,
    /<(?:link|script|img|source|iframe)\b[^>]*?\b(?:href|src)\s*=\s*["'](?:https?:)?\/\/[^"']+/gi,
  ];
  const referenciasExternas = (conteudo: string): string[] =>
    REFERENCIAS_EXTERNAS.flatMap((re) => [...conteudo.matchAll(re)].map((m) => m[0]));

  it.each([
    [
      "link do Google Fonts",
      `<link href="https://fonts.googleapis.com/css2?family=Outfit" rel="stylesheet">`,
    ],
    ["@import de CSS externo", `@import url("https://fonts.googleapis.com/css2?family=Outfit");`],
    ["@import sem url()", `@import "//cdn.example.com/x.css";`],
    ["url() em @font-face", `src: url(https://fonts.gstatic.com/s/outfit/x.woff2);`],
    ["url() sem esquema", `background: url('//cdn.example.com/a.png');`],
    ["script de CDN", `<script src="https://cdn.jsdelivr.net/npm/x"></script>`],
  ])("detecta %s", (_nome, fonte) => {
    expect(referenciasExternas(fonte)).not.toEqual([]);
  });

  it.each([
    ["url() relativo", `src: url("../fonts/outfit-latin-wght-normal.woff2") format("woff2");`],
    ["data URI", `src: url(data:font/woff2;base64,AAAA);`],
    ["menção em comentário", `/* nada de fonts.googleapis.com aqui (ADR-020) */`],
    ["link local", `<link rel="preload" href="/fonts/outfit.woff2" as="font">`],
  ])("não confunde %s com recurso externo", (_nome, fonte) => {
    expect(referenciasExternas(fonte)).toEqual([]);
  });

  /** Superfície que o navegador carrega: a interface, a vitrine e os artefatos compilados. */
  const ALVOS = [
    { dir: "src/web", ext: /\.(ts|tsx|css|html)$/ },
    { dir: ".storybook", ext: /\.(ts|tsx|css|html)$/ },
    { dir: "design-system/dist", ext: /\.(css|js)$/ },
  ];
  const ignorado = /(^|\/)(node_modules|dist|storybook-static)\//;

  function listar(dir: string, ext: RegExp): string[] {
    const abs = join(RAIZ, dir);
    const saida: string[] = [];
    for (const nome of readdirSync(abs)) {
      const caminho = join(abs, nome);
      const rel = relative(RAIZ, caminho);
      if (statSync(caminho).isDirectory()) {
        // `design-system/dist` é alvo explícito; só ignoramos `dist` aninhado em pacotes.
        if (!ignorado.test(`${rel}/`) || rel === "design-system/dist")
          saida.push(...listar(rel, ext));
      } else if (ext.test(nome)) saida.push(rel);
    }
    return saida;
  }

  it("varre arquivos de fato — zero arquivos varridos aprovaria por vacuidade", () => {
    const arquivos = ALVOS.flatMap(({ dir, ext }) => listar(dir, ext));
    expect(arquivos.length).toBeGreaterThan(5);
    expect(arquivos).toContain("design-system/dist/fonts.css");
  });

  it("nenhum arquivo da interface, da vitrine ou compilado referencia recurso externo", () => {
    const achados = ALVOS.flatMap(({ dir, ext }) => listar(dir, ext)).flatMap((arquivo) =>
      referenciasExternas(lerTexto(arquivo)).map((ref) => `${arquivo}: ${ref}`),
    );
    expect(achados).toEqual([]);
  });
});

describe("preload da fonte de corpo no shell da aplicação (história 11.6)", () => {
  /** Tags `<link rel="preload" as="font">` do documento, com o que importa de cada uma. */
  const preloadsDeFonte = (html: string) =>
    [...html.matchAll(/<link\b[^>]*>/gi)]
      .map((m) => m[0])
      .filter(
        (tag) => /\brel\s*=\s*["']preload["']/i.test(tag) && /\bas\s*=\s*["']font["']/i.test(tag),
      )
      .map((tag) => ({
        href: /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? "",
        crossorigin: /\bcrossorigin\b/i.test(tag),
        tipo: /\btype\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1],
      }));

  const corpo = manifesto.families.find((f) => f.preload);
  if (!corpo) throw new Error("nenhuma família declara preload");
  const arquivoDePreload = corpo.files.find((f) => f.subset === corpo.preload)?.file ?? "";

  it("o manifesto aponta o arquivo que o shell precisa pré-carregar", () => {
    expect(corpo.family).toBe("Outfit");
    expect(arquivoDePreload).toBe("outfit-latin-wght-normal.woff2");
  });

  it("reconhece um preload correto", () => {
    const html = `<link rel="preload" href="/fonts/${arquivoDePreload}" as="font" type="font/woff2" crossorigin>`;
    expect(preloadsDeFonte(html)).toEqual([
      { href: `/fonts/${arquivoDePreload}`, crossorigin: true, tipo: "font/woff2" },
    ]);
  });

  it("enxerga um preload sem crossorigin — o navegador baixaria a fonte duas vezes", () => {
    const html = `<link rel="preload" href="/f/${arquivoDePreload}" as="font" type="font/woff2">`;
    expect(preloadsDeFonte(html)[0]?.crossorigin).toBe(false);
  });

  it("ignora links que não são preload de fonte", () => {
    expect(
      preloadsDeFonte(
        `<link rel="stylesheet" href="/a.css"><link rel="preload" href="/a.js" as="script">`,
      ),
    ).toEqual([]);
  });

  // `src/web/index.html` ainda não existe: a aplicação não tem shell. Quando existir,
  // este teste deixa de ser pulado e exige o preload — o requisito não depende de alguém
  // lembrar dele. Aparece como "skipped" na saída, não como aprovado.
  const shell = join(RAIZ, "src/web/index.html");
  it.skipIf(!existsSync(shell))(
    "src/web/index.html pré-carrega o subconjunto de corpo, com crossorigin e type",
    () => {
      const encontrado = preloadsDeFonte(readFileSync(shell, "utf8")).find((p) =>
        p.href.endsWith(arquivoDePreload),
      );
      expect(
        encontrado,
        `falta <link rel="preload" as="font"> para ${arquivoDePreload}`,
      ).toBeDefined();
      expect(encontrado?.crossorigin).toBe(true);
      expect(encontrado?.tipo).toBe("font/woff2");
    },
  );
});
