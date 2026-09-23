/**
 * Tipos do verificador de literais estéticos (gate 10).
 *
 * Declarados aqui em vez de convertidos para TypeScript porque o script precisa rodar
 * direto pelo `node`, sem etapa de compilação, tanto na esteira quanto localmente.
 */

export interface ViolacaoDeToken {
  caminho: string;
  linha: number;
  coluna: number;
  /** Identificador da regra: `hex`, `funcao-de-cor`, `medida`, `utilitaria-arbitraria`. */
  regra: string;
  mensagem: string;
  /** O texto exato que disparou a regra. */
  trecho: string;
}

export declare const PADROES: string[];
export declare const IGNORADOS: RegExp[];
export declare function analisar(conteudo: string, caminho?: string): ViolacaoDeToken[];
