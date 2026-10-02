#!/usr/bin/env node
/**
 * Regras de produto no navegador real — história 11.7 (ADR-005), parte do gate 7.
 *
 * Abre CADA história do Storybook compilado, nos dois temas, e roda as regras de
 * `scripts/ui-rules.mjs` sobre o que foi renderizado: alvo mínimo de 44×44 px, cor
 * nunca como único portador de informação e gradiente da marca limitado a um destaque.
 *
 * Pré-requisito: `npm run storybook:build`. Navegador: o Chromium indicado em
 * `CHROME_PATH`, ou o Google Chrome instalado (`channel: "chrome"`), que os runners do
 * GitHub já trazem — o `playwright-core` é só o driver, não baixa navegador.
 *
 * Duas salvaguardas contra passar por vacuidade, no espírito do playbook:
 *
 *   - **Controle negativo.** A cada execução, uma página deliberadamente errada precisa
 *     ser reprovada por TODAS as regras. Se alguma deixar de reprovar, o gate falha por
 *     não conseguir provar nada.
 *   - **Nada medido é erro.** Zero histórias, ou zero elementos clicáveis medidos, falha:
 *     um gate que mediu nada não verificou nada.
 */

import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { analisarRegras, coletarElementos } from "./ui-rules.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ESTATICO = join(RAIZ, "storybook-static");
const TEMAS = ["dark", "light"];
const TIPOS = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

function falhar(mensagem) {
  console.error(`Gate 7 (regras de produto): ${mensagem}`);
  process.exit(1);
}

if (!existsSync(join(ESTATICO, "index.json"))) {
  falhar("storybook-static/ ausente — rode `npm run storybook:build` antes.");
}

const tokens = JSON.parse(readFileSync(join(RAIZ, "design-system/tokens.json"), "utf8"));
const alvoMinimoPx = Number.parseFloat(tokens.a11y["min-tap-target"].$value);
if (!Number.isFinite(alvoMinimoPx)) falhar("a11y.min-tap-target ilegível em tokens.json");

const historias = Object.values(
  JSON.parse(readFileSync(join(ESTATICO, "index.json"), "utf8")).entries,
)
  .filter((e) => e.type === "story")
  .map((e) => e.id);
if (historias.length === 0) falhar("nenhuma história encontrada em index.json");

const servidor = createServer((req, res) => {
  let caminho = join(ESTATICO, decodeURIComponent(req.url.split("?")[0]));
  if (existsSync(caminho) && statSync(caminho).isDirectory()) caminho = join(caminho, "index.html");
  if (!caminho.startsWith(ESTATICO) || !existsSync(caminho)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": TIPOS[extname(caminho)] ?? "application/octet-stream" });
  res.end(readFileSync(caminho));
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const origem = `http://127.0.0.1:${servidor.address().port}`;

const navegador = await chromium
  .launch({
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : { channel: "chrome" }),
    args: ["--no-sandbox"],
  })
  .catch((erro) => falhar(`não foi possível abrir o navegador: ${erro.message}`));

try {
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 800 } });
  const violacoes = [];
  let interativos = 0;
  let comFundo = 0;
  let gradientes = 0;

  for (const tema of TEMAS) {
    for (const id of historias) {
      await pagina.goto(`${origem}/iframe.html?id=${id}&viewMode=story`, {
        waitUntil: "networkidle",
      });
      await pagina.waitForSelector("#storybook-root > *", { timeout: 15_000 });
      await pagina.evaluate(async (t) => {
        document.documentElement.setAttribute("data-theme", t);
        await document.fonts.ready;
      }, tema);

      const elementos = await pagina.evaluate(coletarElementos);
      if (elementos === null) falhar(`${id}: a página não tem #storybook-root`);

      interativos += elementos.filter((e) => e.interativo).length;
      comFundo += elementos.filter((e) => e.comFundo).length;
      gradientes += elementos.filter((e) => e.gradienteDaMarca).length;

      for (const v of analisarRegras(elementos, { alvoMinimoPx })) {
        violacoes.push({ ...v, historia: id, tema });
      }
    }
  }

  // Controle negativo: uma página que viola TODAS as regras de propósito.
  await pagina.setContent(`<!doctype html><style>
      :root { --gradient-brand: linear-gradient(135deg, #ff902f, #4c11ce); }
      .g { background-image: var(--gradient-brand); width: 60px; height: 60px; }
    </style><div id="storybook-root">
      <button style="width:20px;height:20px">x</button>
      <button style="width:60px;height:60px" data-alvo-isento="">y</button>
      <div class="g" data-gradiente="destaque">a</div>
      <div class="g" data-gradiente="destaque">b</div>
      <div class="g">c</div>
      <div class="g" data-gradiente="fundo-de-fila">d</div>
      <div style="width:30px;height:30px;background:#c00"></div>
    </div>`);
  const esperadas = [
    "alvo-pequeno",
    "isencao-sem-motivo",
    "gradiente-sem-papel",
    "gradiente-papel-invalido",
    "gradiente-destaque-multiplo",
    "cor-sem-texto",
  ];
  const doControle = new Set(
    analisarRegras((await pagina.evaluate(coletarElementos)) ?? [], { alvoMinimoPx }).map(
      (v) => v.regra,
    ),
  );
  const naoReprovadas = esperadas.filter((r) => !doControle.has(r));
  if (naoReprovadas.length > 0) {
    falhar(
      `controle negativo APROVADO para: ${naoReprovadas.join(", ")}. Uma página que viola de ` +
        "propósito não foi reprovada — o gate não prova nada nessas regras.",
    );
  }

  if (violacoes.length > 0) {
    console.error(`Gate 7 — regras de produto reprovaram (${violacoes.length}):\n`);
    for (const v of violacoes) {
      console.error(`  ${v.historia} [${v.tema}]  ${v.regra}  ${v.alvo}\n      ${v.mensagem}`);
    }
    process.exit(1);
  }

  if (interativos === 0) {
    falhar("nenhum elemento clicável foi medido em nenhuma história — nada foi verificado.");
  }

  console.log(
    "✓ gate 7 (regras de produto, navegador real): " +
      `${historias.length} histórias × ${TEMAS.length} temas; ` +
      `${interativos} elementos clicáveis medidos (mínimo ${alvoMinimoPx}×${alvoMinimoPx} px), ` +
      `${comFundo} fundos coloridos conferidos, ${gradientes} gradiente(s) da marca; ` +
      "controle negativo reprovado em " +
      `${esperadas.length}/${esperadas.length} regras`,
  );
} finally {
  await navegador.close();
  servidor.close();
}
