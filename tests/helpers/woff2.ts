import { brotliDecompressSync } from "node:zlib";

/**
 * Leitor mínimo de WOFF2, só o bastante para listar as features OpenType de `GSUB`.
 *
 * Existe para que "a Outfit oferece numerais tabulares" (história 11.6) seja uma
 * propriedade verificada a cada execução, e não uma medição feita uma vez por alguém:
 * trocar o arquivo por uma versão sem `tnum` faz `font-variant-numeric: tabular-nums`
 * deixar de ter efeito, sem erro algum — os tempos de SLA simplesmente desalinham.
 *
 * Referência: W3C WOFF2, § 5 (cabeçalho e diretório de tabelas) e OpenType, `GSUB`.
 */

// Tags conhecidas do diretório WOFF2, na ordem normativa da especificação (índice 0–62).
const TAGS_CONHECIDAS = [
  "cmap",
  "head",
  "hhea",
  "hmtx",
  "maxp",
  "name",
  "OS/2",
  "post",
  "cvt ",
  "fpgm",
  "glyf",
  "loca",
  "prep",
  "CFF ",
  "VORG",
  "EBDT",
  "EBLC",
  "gasp",
  "hdmx",
  "kern",
  "LTSH",
  "PCLT",
  "VDMX",
  "vhea",
  "vmtx",
  "BASE",
  "GDEF",
  "GPOS",
  "GSUB",
  "EBSC",
  "JSTF",
  "MATH",
  "CBDT",
  "CBLC",
  "COLR",
  "CPAL",
  "SVG ",
  "sbix",
  "acnt",
  "avar",
  "bdat",
  "bloc",
  "bsln",
  "cvar",
  "fdsc",
  "feat",
  "fmtx",
  "fvar",
  "gvar",
  "hsty",
  "just",
  "lcar",
  "mort",
  "morx",
  "opbd",
  "prop",
  "trak",
  "Zapf",
  "Silf",
  "Glat",
  "Gloc",
  "Feat",
  "Sill",
];

interface Tabela {
  tag: string;
  tamanhoNoFluxo: number;
}

/** UIntBase128: 7 bits por byte, bit alto = continua. */
function lerBase128(dados: Buffer, posicao: { i: number }): number {
  let valor = 0;
  for (let n = 0; n < 5; n++) {
    const byte = dados[posicao.i++];
    if (byte === undefined) throw new Error("WOFF2 truncado no diretório de tabelas");
    valor = valor * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return valor;
  }
  throw new Error("UIntBase128 inválido");
}

/** Tags das features de `GSUB` (ex.: `tnum`, `liga`), ou lista vazia se a fonte não tem `GSUB`. */
export function featuresGsub(woff2: Buffer): string[] {
  if (woff2.subarray(0, 4).toString("latin1") !== "wOF2") {
    throw new Error("não é WOFF2: assinatura inválida");
  }
  const quantidade = woff2.readUInt16BE(12);
  const comprimidoTotal = woff2.readUInt32BE(20);

  const posicao = { i: 48 };
  const tabelas: Tabela[] = [];
  for (let n = 0; n < quantidade; n++) {
    const flags = woff2[posicao.i++];
    if (flags === undefined) throw new Error("WOFF2 truncado");
    const indice = flags & 0x3f;
    const versaoDeTransformacao = flags >> 6;
    let tag: string;
    if (indice === 63) {
      tag = woff2.subarray(posicao.i, posicao.i + 4).toString("latin1");
      posicao.i += 4;
    } else {
      const conhecida = TAGS_CONHECIDAS[indice];
      if (conhecida === undefined) throw new Error(`índice de tag desconhecido: ${indice}`);
      tag = conhecida;
    }
    const original = lerBase128(woff2, posicao);
    // glyf e loca usam a versão 3 como "sem transformação"; as demais, a versão 0.
    const ehGlyfOuLoca = tag === "glyf" || tag === "loca";
    const transformada = ehGlyfOuLoca ? versaoDeTransformacao !== 3 : versaoDeTransformacao !== 0;
    tabelas.push({ tag, tamanhoNoFluxo: transformada ? lerBase128(woff2, posicao) : original });
  }

  const fluxo = brotliDecompressSync(woff2.subarray(posicao.i, posicao.i + comprimidoTotal));

  let deslocamento = 0;
  for (const tabela of tabelas) {
    if (tabela.tag === "GSUB") {
      const base = deslocamento;
      const listaDeFeatures = base + fluxo.readUInt16BE(base + 6);
      const total = fluxo.readUInt16BE(listaDeFeatures);
      const tags: string[] = [];
      for (let n = 0; n < total; n++) {
        tags.push(
          fluxo
            .subarray(listaDeFeatures + 2 + n * 6, listaDeFeatures + 6 + n * 6)
            .toString("latin1"),
        );
      }
      return [...new Set(tags)].sort();
    }
    deslocamento += tabela.tamanhoNoFluxo;
  }
  return [];
}
