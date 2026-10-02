/**
 * Tipos das regras de produto verificadas no navegador (história 11.7).
 *
 * Declarados aqui em vez de convertidos para TypeScript pelo mesmo motivo de
 * `check-design-literals.d.mts`: o script roda direto pelo `node`.
 */

export interface ElementoColetado {
  alvo: string;
  interativo: boolean;
  controleDeFormulario: boolean;
  w: number;
  h: number;
  texto: string;
  nome: string;
  ocultoParaLeitor: boolean;
  comFundo: boolean;
  gradienteDaMarca: boolean;
  papelDoGradiente: string | null;
  linkEmTexto: boolean;
  isencaoDeAlvo: string | null;
}

export interface ViolacaoDeRegra {
  regra: string;
  alvo: string;
  mensagem: string;
}

export declare const PAPEIS_DE_GRADIENTE: readonly string[];
export declare function analisarRegras(
  elementos: readonly ElementoColetado[],
  opcoes: { alvoMinimoPx: number },
): ViolacaoDeRegra[];
export declare function coletarElementos(): ElementoColetado[] | null;
