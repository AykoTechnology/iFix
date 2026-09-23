// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { composeStories } from "@storybook/react";
import { afterEach, describe, expect, it } from "vitest";
import * as statusChip from "../src/web/src/components/StatusChip.stories.js";

/**
 * Gate 7 — acessibilidade por história (ADR-005, História 11.5).
 *
 * As histórias do Storybook são a fonte: o mesmo arquivo que documenta o componente é
 * o que o testa. Um conjunto de casos separado divergiria da vitrine, e a vitrine é o
 * que a equipe de design revisa.
 *
 * ## O que este teste NÃO cobre, e por quê
 *
 * O Axe roda em jsdom, que não faz layout nem resolve `var()`. As regras que dependem
 * de pixels renderizados — `color-contrast` acima de todas — ficam inertes aqui.
 *
 * Isso é dito em voz alta em vez de escondido, porque um gate que parece cobrir
 * contraste e não cobre é pior que nenhum. O contraste é verificado em
 * `tests/design-tokens.test.ts`, por cálculo direto sobre os tokens nos dois temas —
 * uma garantia mais forte que a do Axe, que só enxergaria as combinações que alguma
 * história por acaso renderizou.
 *
 * O que sobra aqui é o que o Axe faz bem e o cálculo de contraste não alcança:
 * estrutura, papéis ARIA, nomes acessíveis, rótulos e ordem de cabeçalhos.
 */

const SUITES = [{ nome: "StatusChip", modulo: statusChip }];

/** Regras inertes em jsdom. Declaradas para não produzirem passagem por vacuidade. */
const SEM_LAYOUT = ["color-contrast"];

afterEach(cleanup);

describe("Axe-core por história", () => {
  for (const { nome, modulo } of SUITES) {
    const historias = composeStories(modulo);

    for (const [titulo, Historia] of Object.entries(historias)) {
      it(`${nome}/${titulo}`, async () => {
        const { container } = render(<Historia />);

        const resultado = await axe.run(container, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
          },
          rules: Object.fromEntries(SEM_LAYOUT.map((id) => [id, { enabled: false }])),
        });

        const violacoes = resultado.violations.map((v) => `${v.id}: ${v.help}`);
        expect(violacoes).toEqual([]);
      }, 20_000);
    }
  }
});

describe("regras que o Axe não detecta (História 11.7)", () => {
  // O Axe não sabe que uma cor está carregando informação sozinha: para ele, um
  // quadrado colorido sem texto é apenas um elemento sem conteúdo. A verificação é
  // nossa.
  it("toda etiqueta de estado expõe rótulo textual, não só cor", () => {
    const historias = composeStories(statusChip);

    for (const [titulo, Historia] of Object.entries(historias)) {
      const { container } = render(<Historia />);
      const texto = container.textContent?.trim() ?? "";
      expect(texto.length, `${titulo} não expõe texto`).toBeGreaterThan(0);
      cleanup();
    }
  });

  it("o ponto colorido é redundância visual e fica oculto ao leitor de tela", () => {
    // Anunciado, ele viraria ruído: o leitor já leu o rótulo textual ao lado.
    const { Novo } = composeStories(statusChip);
    const { container } = render(<Novo />);

    const ocultos = container.querySelectorAll('[aria-hidden="true"]');
    expect(ocultos.length).toBeGreaterThan(0);
  });
});
