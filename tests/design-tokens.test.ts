import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio, flattenOver, round2 } from "./helpers/contrast.js";

/**
 * Conformidade do `tokens.json` — histórias 11.1 e 11.4, ADR-005 e ADR-011.
 *
 * Os limiares NÃO estão escritos aqui: vêm de `$extensions.com.ifix.validation` no
 * próprio arquivo de tokens. Duplicá-los no teste criaria uma segunda fonte de
 * verdade sobre o nível de conformidade — que é precisamente o defeito que o
 * ADR-011 existe para impedir, só que na camada de verificação.
 */

interface Token {
  $value: unknown;
  $type?: string;
  $description?: string;
}
type Grupo = Record<string, unknown>;

const tokens = JSON.parse(
  readFileSync(new URL("../design-system/tokens.json", import.meta.url), "utf8"),
) as Grupo & { $extensions: Record<string, Record<string, unknown>> };

const validacao = tokens.$extensions["com.ifix.validation"] as {
  wcagLevel: string;
  contrastNormalText: number;
  contrastLargeTextAndControls: number;
  themesToValidate: string[];
};

const TEXTO = validacao.contrastNormalText;
const CONTROLE = validacao.contrastLargeTextAndControls;
const TEMAS = validacao.themesToValidate;

function buscar(caminho: string): Token {
  const no = caminho.split(".").reduce<unknown>((atual, chave) => {
    if (typeof atual !== "object" || atual === null) {
      throw new Error(`caminho inexistente em tokens.json: ${caminho}`);
    }
    return (atual as Grupo)[chave];
  }, tokens);

  if (typeof no !== "object" || no === null || !("$value" in no)) {
    throw new Error(`não é um token: ${caminho}`);
  }
  return no;
}

const cor = (caminho: string): string => buscar(caminho).$value as string;

/** Nomes dos tokens de um grupo, ignorando as chaves de metadado do DTCG. */
function chaves(caminho: string): string[] {
  const no = caminho.split(".").reduce<unknown>((atual, chave) => (atual as Grupo)[chave], tokens);
  return Object.keys(no as Grupo).filter((k) => !k.startsWith("$"));
}

describe("o próprio limiar declarado (ADR-005)", () => {
  // Sem isto o teste é circular: os limiares vêm do arquivo que ele valida, então
  // trocar `contrastNormalText` de 4.5 para 3 deixaria a suíte inteira verde sem
  // corrigir um pixel. Foi o que a verificação por mutação mostrou. Os números de
  // cada nível são fixados pela norma, não por nós — o arquivo escolhe o NÍVEL, a
  // WCAG escolhe os NÚMEROS.
  const PELA_NORMA: Record<string, { texto: number; controle: number }> = {
    "2.2 AA": { texto: 4.5, controle: 3 },
    "2.2 AAA": { texto: 7, controle: 4.5 },
  };

  it("declara um nível de conformidade conhecido", () => {
    expect(Object.keys(PELA_NORMA)).toContain(validacao.wcagLevel);
  });

  it("os limiares correspondem ao que a norma exige para esse nível", () => {
    const exigido = PELA_NORMA[validacao.wcagLevel];
    expect(validacao.contrastNormalText).toBe(exigido?.texto);
    expect(validacao.contrastLargeTextAndControls).toBe(exigido?.controle);
  });

  it("valida todos os temas que o arquivo define", () => {
    // Remover um tema de `themesToValidate` esconderia metade da interface da
    // verificação sem remover o tema da interface.
    expect([...TEMAS].sort()).toEqual(chaves("color.theme").sort());
  });
});

describe("paridade entre temas (história 11.4)", () => {
  it("os temas declarados para validação existem", () => {
    for (const tema of TEMAS) {
      expect(chaves(`color.theme.${tema}`).length).toBeGreaterThan(0);
    }
  });

  it("todo papel semântico existe em todos os temas", () => {
    // Um papel presente em um tema e ausente no outro produz uma variável CSS que
    // resolve num tema e fica indefinida no outro. O componente não quebra: ele
    // herda, ou pinta transparente. É drift silencioso, e metade da interface fica
    // sem garantia de conformidade — exatamente o que a história 11.4 proíbe.
    const porTema = TEMAS.map((tema) => ({ tema, papeis: new Set(chaves(`color.theme.${tema}`)) }));
    const universo = new Set(porTema.flatMap(({ papeis }) => [...papeis]));

    const faltando = porTema.flatMap(({ tema, papeis }) =>
      [...universo].filter((papel) => !papeis.has(papel)).map((papel) => `${tema}.${papel}`),
    );

    expect(faltando).toEqual([]);
  });

  it("todo grupo bifurcado por tema declara todos os temas", () => {
    // A bifurcação por tema aparece em mais lugares que `color.theme` — `status.*.text`
    // e `domain.*.text` também variam. Um grupo que declare só um dos temas passaria
    // despercebido pela verificação acima, que olha apenas `color.theme`.
    const incompletos: string[] = [];

    const percorrer = (no: Grupo, caminho: string[]): void => {
      const filhos = Object.keys(no).filter((k) => !k.startsWith("$"));
      const temTema = filhos.some((f) => TEMAS.includes(f));

      if (temTema) {
        const ausentes = TEMAS.filter((t) => !filhos.includes(t));
        if (ausentes.length > 0)
          incompletos.push(`${caminho.join(".")} → falta ${ausentes.join(", ")}`);
        return;
      }

      for (const filho of filhos) {
        const valor = no[filho];
        if (typeof valor === "object" && valor !== null && !("$value" in valor)) {
          percorrer(valor as Grupo, [...caminho, filho]);
        }
      }
    };

    percorrer(tokens.color as Grupo, ["color"]);
    expect(incompletos).toEqual([]);
  });
});

describe(`contraste de texto — mínimo ${validacao.contrastNormalText}:1 (${validacao.wcagLevel})`, () => {
  const SUPERFICIES = ["canvas", "surface", "surface-alt", "raised", "selected"];
  const TEXTOS = ["text-primary", "text-secondary", "text-tertiary", "text-muted", "link"];

  for (const tema of TEMAS) {
    for (const superficie of SUPERFICIES) {
      for (const texto of TEXTOS) {
        it(`${tema}: ${texto} sobre ${superficie}`, () => {
          const razao = round2(
            contrastRatio(
              cor(`color.theme.${tema}.${texto}`),
              cor(`color.theme.${tema}.${superficie}`),
            ),
          );
          expect(razao, `${razao}:1`).toBeGreaterThanOrEqual(TEXTO);
        });
      }
    }
  }
});

describe(`contraste de rótulo colorido sobre seu próprio tint — mínimo ${validacao.contrastNormalText}:1`, () => {
  // O tint não é o fundo: é uma camada translúcida sobre a superfície do tema. Medir
  // o texto contra o tint isolado daria um número que ninguém enxerga.
  for (const tema of TEMAS) {
    for (const grupo of ["status", "domain"]) {
      for (const nome of chaves(`color.${grupo}`)) {
        const papeis = chaves(`color.${grupo}.${nome}`);
        if (!papeis.includes("text") || !papeis.includes("tint")) continue;

        it(`${tema}: ${grupo}.${nome}.text sobre seu tint`, () => {
          // O tint pode ser global (rgba, que se adapta sozinho à superfície) ou
          // resolvido por tema, como o de `fechado`, que é opaco.
          const caminhoTint = `color.${grupo}.${nome}.tint`;
          const tint = chaves(caminhoTint).length > 0 ? `${caminhoTint}.${tema}` : caminhoTint;
          const fundo = flattenOver(cor(tint), cor(`color.theme.${tema}.surface`));
          const razao = round2(contrastRatio(cor(`color.${grupo}.${nome}.text.${tema}`), fundo));
          expect(razao, `${razao}:1 sobre ${fundo}`).toBeGreaterThanOrEqual(TEXTO);
        });
      }
    }
  }
});

describe(`contraste de elemento não-textual — mínimo ${validacao.contrastLargeTextAndControls}:1`, () => {
  for (const tema of TEMAS) {
    it(`${tema}: borda interativa distinguível da superfície`, () => {
      const razao = round2(
        contrastRatio(
          cor(`color.theme.${tema}.border-interactive`),
          cor(`color.theme.${tema}.surface`),
        ),
      );
      expect(razao, `${razao}:1`).toBeGreaterThanOrEqual(CONTROLE);
    });

    for (const nome of chaves("color.status")) {
      if (!chaves(`color.status.${nome}`).includes("dot")) continue;
      it(`${tema}: status.${nome}.dot sobre a superfície`, () => {
        const razao = round2(
          contrastRatio(
            cor(`color.status.${nome}.dot.${tema}`),
            cor(`color.theme.${tema}.surface`),
          ),
        );
        expect(razao, `${razao}:1`).toBeGreaterThanOrEqual(CONTROLE);
      });
    }
  }
});

describe("regras estruturais do arquivo de tokens", () => {
  it("nenhuma cor de prioridade é o único portador da informação", () => {
    // ADR-005 e história 11.7: a cor distingue, mas não informa sozinha. O teste é
    // estrutural — garante que cada prioridade tenha rótulo textual no nome do token,
    // de modo que um componente não possa exibir só o quadradinho colorido.
    for (const nome of chaves("color.priority")) {
      expect(nome, `color.priority.${nome} precisa carregar o rótulo no nome`).toMatch(
        /^p[1-4]-[a-z]+$/,
      );
    }
  });

  it("as famílias tipográficas declaram fallback do sistema", () => {
    // Fonte self-hosted que não carrega (ADR-020) não pode deixar a interface sem
    // fonte: o fallback é o que mantém a página legível enquanto o WOFF2 não chega.
    for (const familia of chaves("font.family")) {
      const pilha = buscar(`font.family.${familia}`).$value as string[];
      expect(pilha.length, `font.family.${familia}`).toBeGreaterThan(1);
    }
  });
});
