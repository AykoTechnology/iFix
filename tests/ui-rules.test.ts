import { describe, expect, it } from "vitest";
import {
  analisarRegras,
  PAPEIS_DE_GRADIENTE,
  type ElementoColetado,
} from "../scripts/ui-rules.mjs";

/**
 * Prova da história 11.7: cada regra reprova de fato. A análise é pura — recebe um
 * instantâneo dos elementos —, então estas fixtures a exercitam sem navegador. A
 * verificação sobre o render real é `npm run ui:rules`.
 */

const MIN = 44;
const elemento = (patch: Partial<ElementoColetado> = {}): ElementoColetado => ({
  alvo: '<button> "Continuar"',
  interativo: false,
  controleDeFormulario: false,
  w: 100,
  h: 44,
  texto: "Continuar",
  nome: "",
  ocultoParaLeitor: false,
  comFundo: false,
  gradienteDaMarca: false,
  papelDoGradiente: null,
  linkEmTexto: false,
  isencaoDeAlvo: null,
  ...patch,
});
const botao = (patch: Partial<ElementoColetado> = {}) => elemento({ interativo: true, ...patch });
const regras = (els: ElementoColetado[]) =>
  analisarRegras(els, { alvoMinimoPx: MIN }).map((v) => v.regra);

describe("alvo mínimo de 44×44 px", () => {
  it("aceita o elemento no limite exato", () => {
    expect(regras([botao({ w: 44, h: 44 })])).toEqual([]);
  });

  it.each([
    ["largura", { w: 43, h: 60 }],
    ["altura", { w: 60, h: 43 }],
    ["os dois eixos", { w: 20, h: 20 }],
  ])("reprova %s abaixo do mínimo", (_n, patch) => {
    expect(regras([botao(patch)])).toEqual(["alvo-pequeno"]);
  });

  it("aceita folga de sub-pixel, não de pixel inteiro", () => {
    expect(regras([botao({ w: 43.995, h: 44 })])).toEqual([]);
    expect(regras([botao({ w: 43.5, h: 44 })])).toEqual(["alvo-pequeno"]);
  });

  it("mede só o que é clicável", () => {
    expect(regras([elemento({ w: 10, h: 10 })])).toEqual([]);
  });

  it("isenta link dentro de texto corrido (exceção do WCAG)", () => {
    expect(regras([botao({ w: 60, h: 18, linkEmTexto: true })])).toEqual([]);
  });

  it("aceita isenção com motivo", () => {
    expect(
      regras([botao({ w: 20, h: 20, isencaoDeAlvo: "alvo expandido por padding da linha" })]),
    ).toEqual([]);
  });

  it.each(["", "  ", "—"])("recusa isenção sem motivo (%j)", (motivo) => {
    expect(regras([botao({ w: 20, h: 20, isencaoDeAlvo: motivo })])).toEqual([
      "isencao-sem-motivo",
    ]);
  });

  it("reporta o tamanho medido, para quem corrige", () => {
    const [v] = analisarRegras([botao({ w: 20, h: 30.25 })], { alvoMinimoPx: MIN });
    expect(v?.mensagem).toContain("20×30.3 px");
  });
});

describe("gradiente da marca", () => {
  const gradiente = (papel: string | null, alvo = "<div>") =>
    elemento({ alvo, gradienteDaMarca: true, comFundo: true, papelDoGradiente: papel });

  it.each(PAPEIS_DE_GRADIENTE)("aceita o papel %s", (papel) => {
    expect(regras([gradiente(papel)])).toEqual([]);
  });

  it("reprova gradiente sem papel declarado", () => {
    expect(regras([gradiente(null)])).toEqual(["gradiente-sem-papel"]);
  });

  it("reprova papel fora da lista", () => {
    expect(regras([gradiente("fundo-de-fila")])).toEqual(["gradiente-papel-invalido"]);
  });

  it("reprova dois destaques na mesma tela", () => {
    expect(regras([gradiente("destaque", "<a>"), gradiente("destaque", "<b>")])).toEqual([
      "gradiente-destaque-multiplo",
    ]);
  });

  it("aceita um destaque ao lado de marca e navegação — o limite é só do destaque", () => {
    expect(regras([gradiente("marca"), gradiente("navegacao"), gradiente("destaque")])).toEqual([]);
  });

  it("não cobra papel de um gradiente que não é o da marca", () => {
    // Um skeleton com gradiente próprio tem fundo e texto, mas não é o `gradient.brand`.
    expect(regras([elemento({ comFundo: true, gradienteDaMarca: false })])).toEqual([]);
  });
});

describe("cor nunca é o único portador de informação", () => {
  const colorido = (patch: Partial<ElementoColetado> = {}) =>
    elemento({ comFundo: true, texto: "", ...patch });

  it("reprova fundo colorido sem texto nem nome", () => {
    expect(regras([colorido()])).toEqual(["cor-sem-texto"]);
  });

  it("aceita com texto visível", () => {
    expect(regras([colorido({ texto: "Novo" })])).toEqual([]);
  });

  it("aceita com nome acessível (botão só de ícone)", () => {
    expect(regras([colorido({ nome: "Fechar" })])).toEqual([]);
  });

  it("aceita o ponto decorativo escondido do leitor de tela", () => {
    expect(regras([colorido({ ocultoParaLeitor: true })])).toEqual([]);
  });

  it("não cobra de controle de formulário — o rótulo é regra do Axe", () => {
    expect(regras([colorido({ controleDeFormulario: true })])).toEqual([]);
  });

  it("ignora o que não tem fundo", () => {
    expect(regras([elemento({ texto: "" })])).toEqual([]);
  });
});

describe("a análise acumula, não para na primeira", () => {
  it("reporta todas as violações de uma tela", () => {
    const tela = [
      botao({ w: 20, h: 20 }),
      elemento({ comFundo: true, texto: "" }),
      elemento({ gradienteDaMarca: true, comFundo: true, texto: "x", papelDoGradiente: null }),
    ];
    expect(regras(tela).sort()).toEqual(["alvo-pequeno", "cor-sem-texto", "gradiente-sem-papel"]);
  });

  it("tela sem elementos não tem violação (o gate exige elementos medidos à parte)", () => {
    expect(regras([])).toEqual([]);
  });
});
