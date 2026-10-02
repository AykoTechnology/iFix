/**
 * Regras de produto que o Axe não detecta — história 11.7, ADR-005.
 *
 * O Axe roda em jsdom (sem layout) e cobre estrutura e semântica. Estas três regras
 * dependem do que o navegador de fato renderiza:
 *
 *   alvo mínimo     todo elemento clicável mede ao menos `a11y.min-tap-target` (44 px)
 *                   nos dois eixos, ou declara isenção com motivo
 *   cor + texto     nenhum elemento visível carrega informação só por cor de fundo
 *   gradiente       o gradiente de marca só aparece com um papel declarado, e só um
 *                   `destaque` por tela (`gradient.brand` em tokens.json)
 *
 * A separação é a mesma dos outros gates: `analisarRegras` é uma função PURA sobre um
 * instantâneo serializável dos elementos, testada com fixtures em
 * `tests/ui-rules.test.ts`; `coletarElementos` é o único trecho que roda na página.
 * Assim cada regra é provada reprovando sem precisar de navegador.
 */

/** Onde o `gradient.brand` é permitido (descrição do token em tokens.json). */
export const PAPEIS_DE_GRADIENTE = ["marca", "navegacao", "vazio", "assistente", "destaque"];

/**
 * @typedef {object} ElementoColetado
 * @property {string} alvo               descrição curta para a mensagem
 * @property {boolean} interativo
 * @property {boolean} controleDeFormulario  input/select/textarea (o rótulo é regra do Axe)
 * @property {number} w
 * @property {number} h
 * @property {string} texto              texto visível do subárvore
 * @property {string} nome               nome acessível declarado (aria-label, title, alt)
 * @property {boolean} ocultoParaLeitor  o elemento ou um ancestral tem aria-hidden="true"
 * @property {boolean} comFundo          fundo de cor opaca ou translúcida, ou gradiente
 * @property {boolean} gradienteDaMarca  o fundo é exatamente `gradient.brand`
 * @property {string | null} papelDoGradiente  valor de `data-gradiente`
 * @property {boolean} linkEmTexto       link inline dentro de um parágrafo (isento no WCAG)
 * @property {string | null} isencaoDeAlvo     valor de `data-alvo-isento`
 */

/**
 * @param {ElementoColetado[]} elementos
 * @param {{ alvoMinimoPx: number }} opcoes
 * @returns {{ regra: string, alvo: string, mensagem: string }[]}
 */
export function analisarRegras(elementos, { alvoMinimoPx }) {
  const violacoes = [];
  const registrar = (regra, alvo, mensagem) => violacoes.push({ regra, alvo, mensagem });

  for (const el of elementos) {
    if (el.interativo) {
      if (el.isencaoDeAlvo !== null) {
        // Mesma disciplina de `tokens-exempt`: dispensa sem motivo é silenciador.
        if (!/[\p{L}\p{N}]/u.test(el.isencaoDeAlvo)) {
          registrar("isencao-sem-motivo", el.alvo, "data-alvo-isento exige o motivo da isenção");
        }
      } else if (!el.linkEmTexto && (el.w < alvoMinimoPx - 0.01 || el.h < alvoMinimoPx - 0.01)) {
        registrar(
          "alvo-pequeno",
          el.alvo,
          `${round(el.w)}×${round(el.h)} px — o mínimo é ${alvoMinimoPx}×${alvoMinimoPx} px`,
        );
      }
    }

    if (el.gradienteDaMarca) {
      if (!el.papelDoGradiente) {
        registrar(
          "gradiente-sem-papel",
          el.alvo,
          "gradiente da marca sem data-gradiente declarado",
        );
      } else if (!PAPEIS_DE_GRADIENTE.includes(el.papelDoGradiente)) {
        registrar(
          "gradiente-papel-invalido",
          el.alvo,
          `data-gradiente="${el.papelDoGradiente}" — permitidos: ${PAPEIS_DE_GRADIENTE.join(", ")}`,
        );
      }
    }

    // Cor sozinha: fundo visível, nada legível e nada para o leitor de tela. O `aria-hidden`
    // é o que torna um ponto colorido decorativo legítimo (o rótulo está ao lado).
    if (
      el.comFundo &&
      !el.controleDeFormulario &&
      !el.ocultoParaLeitor &&
      el.texto === "" &&
      el.nome === ""
    ) {
      registrar("cor-sem-texto", el.alvo, "fundo colorido sem texto nem nome acessível");
    }
  }

  const destaques = elementos.filter(
    (e) => e.gradienteDaMarca && e.papelDoGradiente === "destaque",
  );
  if (destaques.length > 1) {
    registrar(
      "gradiente-destaque-multiplo",
      destaques.map((e) => e.alvo).join("; "),
      `${destaques.length} destaques com o gradiente da marca — o limite é um por tela`,
    );
  }

  return violacoes;
}

const round = (n) => Math.round(n * 10) / 10;

/**
 * Roda DENTRO da página (o Playwright serializa a função): precisa ser autocontida,
 * sem referência a nada deste módulo.
 *
 * @returns {ElementoColetado[] | null} `null` quando a página não é uma história
 */
export function coletarElementos() {
  const raiz = document.querySelector("#storybook-root");
  if (!raiz) return null;

  // O valor computado de `gradient.brand`, lido do próprio CSS da página: comparar por
  // igualdade com isto dispensa converter as paradas do token para rgb() à mão.
  const sonda = document.createElement("div");
  sonda.style.backgroundImage = "var(--gradient-brand)";
  raiz.append(sonda);
  const gradienteDaMarca = getComputedStyle(sonda).backgroundImage;
  sonda.remove();

  const INTERATIVO = [
    "a[href]",
    "button",
    "input:not([type=hidden])",
    "select",
    "textarea",
    "summary",
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");

  const descrever = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const rotulo = (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 24);
    return `<${el.tagName.toLowerCase()}${id}> "${rotulo}"`;
  };

  const elementos = [];
  for (const el of raiz.querySelectorAll("*")) {
    const estilo = getComputedStyle(el);
    const caixa = el.getBoundingClientRect();
    if (estilo.display === "none" || estilo.visibility === "hidden") continue;
    if (caixa.width === 0 || caixa.height === 0) continue;

    let oculto = false;
    for (let a = el; a && a !== raiz.parentElement; a = a.parentElement) {
      if (a.getAttribute("aria-hidden") === "true") {
        oculto = true;
        break;
      }
    }

    const partes = /rgba?\(([^)]+)\)/.exec(estilo.backgroundColor)?.[1]?.split(",") ?? [];
    const opacidade = partes.length === 4 ? Number(partes[3]) : partes.length === 3 ? 1 : 0;
    const daMarca = estilo.backgroundImage === gradienteDaMarca;

    const interativo = el.matches(INTERATIVO);
    const pai = el.parentElement;
    const linkEmTexto =
      el.tagName === "A" &&
      estilo.display === "inline" &&
      pai !== null &&
      (pai.innerText ?? "").trim().length > (el.innerText ?? "").trim().length;

    elementos.push({
      alvo: descrever(el),
      interativo,
      controleDeFormulario: el.matches("input,select,textarea"),
      w: caixa.width,
      h: caixa.height,
      texto: (el.innerText ?? "").trim(),
      nome: (
        el.getAttribute("aria-label") ??
        el.getAttribute("title") ??
        el.getAttribute("alt") ??
        (el.hasAttribute("aria-labelledby") ? "aria-labelledby" : "")
      ).trim(),
      ocultoParaLeitor: oculto,
      comFundo: opacidade > 0 || daMarca,
      gradienteDaMarca: daMarca,
      papelDoGradiente: el.getAttribute("data-gradiente"),
      linkEmTexto,
      isencaoDeAlvo: el.getAttribute("data-alvo-isento"),
    });
  }
  return elementos;
}
