/**
 * Tipos da validação e geração do `@font-face` (história 11.6).
 *
 * Declarados aqui em vez de convertidos para TypeScript pelo mesmo motivo de
 * `check-design-literals.d.mts`: o módulo roda direto pelo `node`, sem compilação.
 */

export interface ArquivoDeFonte {
  subset: string;
  file: string;
  sha256: string;
  unicodeRange: string;
}

export interface FamiliaDeFonte {
  family: string;
  style: string;
  /** Eixo de peso da fonte variável: [mínimo, máximo]. */
  weight: [number, number];
  license: string;
  licenseFile: string;
  copyright: string;
  source: { package: string; version: string; registry: string };
  /** Subconjunto a pré-carregar, ou `null` quando a família não é a fonte de corpo. */
  preload: string | null;
  files: ArquivoDeFonte[];
}

export interface ManifestoDeFontes {
  families: FamiliaDeFonte[];
}

export declare function validarFontes(entrada: {
  tokens: object;
  manifesto: ManifestoDeFontes;
  ler: (arquivo: string) => Buffer | null;
}): string[];

export declare function gerarFontsCss(entrada: {
  manifesto: ManifestoDeFontes;
  cabecalho: string;
}): string;
