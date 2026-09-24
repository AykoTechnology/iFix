/**
 * Tipos do verificador de segurança estrutural dos charts Helm (gate 11).
 *
 * Declarados aqui em vez de convertidos para TypeScript pelo mesmo motivo de
 * `check-design-literals.d.mts`: o script roda direto pelo `node`, sem etapa de
 * compilação, tanto na esteira quanto localmente.
 */

export interface ViolacaoDeSeguranca {
  /** Nome do workload (ou do chart, para `nenhum-workload`). */
  deployment: string;
  /** Nome do contêiner, quando a violação é por contêiner e não por pod. */
  contêiner?: string;
  regra: string;
  mensagem: string;
}

/** Manifesto Kubernetes decodificado de YAML — deliberadamente não tipado a fundo. */
export type Manifesto = Record<string, unknown>;

export declare const MARGEM_DE_ENCERRAMENTO_MS: number;
export declare const WORKLOADS: ReadonlySet<string>;
export declare function analisar(manifestos: readonly Manifesto[]): ViolacaoDeSeguranca[];
export declare function contarWorkloads(manifestos: readonly Manifesto[]): number;
export declare const CHARTS: readonly string[];
/** Renderiza um chart com `helm template` (exige o binário `helm`). */
export declare function renderizar(caminhoDoChart: string): Manifesto[];
