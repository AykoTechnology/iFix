import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

/**
 * Invariantes de implantação que atravessam arquivos — o tipo de divergência que
 * lint, tipos e schema não enxergam, porque cada arquivo isolado está correto.
 */

const ler = (caminho: string): string =>
  readFileSync(new URL(`../${caminho}`, import.meta.url), "utf8");

interface ValuesComProbes {
  probes: Record<"liveness" | "readiness" | "startup", { path: string }>;
}

const caminhosDoChart = (chart: string): string[] => {
  const values = load(ler(`charts/${chart}/values.yaml`)) as ValuesComProbes;
  return [values.probes.liveness.path, values.probes.readiness.path, values.probes.startup.path];
};

describe("os caminhos das probes no chart batem com as rotas do código", () => {
  it("api: values.yaml ↔ src/api/src/server.ts", () => {
    const rotas = [...ler("src/api/src/server.ts").matchAll(/url:\s*"(\/health\/[a-z]+)"/g)].map(
      (m) => m[1],
    );
    expect(rotas).toHaveLength(3);
    expect(caminhosDoChart("api").sort()).toEqual(rotas.sort());
  });

  it("workers: values.yaml ↔ src/workers/src/probes.ts", () => {
    const rotas = [...ler("src/workers/src/probes.ts").matchAll(/"(\/health\/[a-z]+)":/g)].map(
      (m) => m[1],
    );
    expect(rotas).toHaveLength(3);
    expect(caminhosDoChart("workers").sort()).toEqual(rotas.sort());
  });
});

describe("o Dockerfile constrói a API quando não há --target", () => {
  it("o último estágio do arquivo é runtime-api", () => {
    // Sem `--target`, o Docker constrói o último estágio. Se `runtime-workers` vier por
    // último, `docker build -t ifix-api .` publica o worker com o nome da API — e a
    // esteira não vê, porque ela sempre passa `--target`.
    const estagios = [...ler("Dockerfile").matchAll(/^FROM\s+\S+\s+AS\s+(\S+)/gim)].map(
      (m) => m[1],
    );
    expect(estagios.at(-1)).toBe("runtime-api");
  });
});
