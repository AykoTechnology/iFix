import { describe, expect, it } from "vitest";
import { analisar } from "../scripts/check-helm-security.mjs";

/**
 * Prova que o gate 11 reprova — mesmo espírito de `tests/design-literals.test.ts`:
 * fixtures em memória, sem depender do binário `helm` nem de um chart real, então a
 * regra é provada mesmo antes (e independente) de qualquer chart existir.
 */

function contêinerVálido(patch: Record<string, unknown> = {}) {
  return {
    name: "api",
    securityContext: {
      allowPrivilegeEscalation: false,
      readOnlyRootFilesystem: true,
      capabilities: { drop: ["ALL"] },
    },
    lifecycle: { preStop: { sleep: { seconds: 5 } } },
    startupProbe: { httpGet: { path: "/health/startup" } },
    livenessProbe: { httpGet: { path: "/health/live" } },
    readinessProbe: { httpGet: { path: "/health/ready" } },
    ...patch,
  };
}

function deployment(
  patchPodSecurityContext: Record<string, unknown> = {},
  patchSpec: Record<string, unknown> = {},
  contêineres: unknown[] = [contêinerVálido()],
) {
  return {
    kind: "Deployment",
    metadata: { name: "ifix-api" },
    spec: {
      template: {
        spec: {
          securityContext: {
            runAsNonRoot: true,
            runAsUser: 65532,
            runAsGroup: 65532,
            seccompProfile: { type: "RuntimeDefault" },
            ...patchPodSecurityContext,
          },
          terminationGracePeriodSeconds: 30,
          containers: contêineres,
          ...patchSpec,
        },
      },
    },
  };
}

describe("o verificador aceita um Deployment totalmente conforme", () => {
  it("não reprova nada", () => {
    expect(analisar([deployment()])).toEqual([]);
  });

  it("ignora manifestos que não são Deployment", () => {
    const service = { kind: "Service", metadata: { name: "ifix-api" } };
    expect(analisar([service])).toEqual([]);
  });
});

describe("o verificador reprova a PodSecurityStandards Restricted", () => {
  it("pod sem runAsNonRoot", () => {
    const regras = analisar([deployment({ runAsNonRoot: false })]).map((v) => v.regra);
    expect(regras).toContain("pod-sem-runasnonroot");
  });

  it("uid diferente do nonroot da imagem Distroless (65532)", () => {
    const regras = analisar([deployment({ runAsUser: 0, runAsGroup: 0 })]).map((v) => v.regra);
    expect(regras).toContain("uid-diferente-de-nonroot");
  });

  it("gid diferente do nonroot mesmo com uid correto", () => {
    const regras = analisar([deployment({ runAsGroup: 0 })]).map((v) => v.regra);
    expect(regras).toContain("uid-diferente-de-nonroot");
  });

  it("seccompProfile ausente", () => {
    const regras = analisar([deployment({ seccompProfile: undefined })]).map((v) => v.regra);
    expect(regras).toContain("seccomp-ausente");
  });

  it("seccompProfile de tipo diferente de RuntimeDefault", () => {
    const regras = analisar([deployment({ seccompProfile: { type: "Unconfined" } })]).map(
      (v) => v.regra,
    );
    expect(regras).toContain("seccomp-ausente");
  });

  it("allowPrivilegeEscalation não desabilitado no contêiner", () => {
    const contêiner = contêinerVálido({
      securityContext: {
        allowPrivilegeEscalation: true,
        readOnlyRootFilesystem: true,
        capabilities: { drop: ["ALL"] },
      },
    });
    const regras = analisar([deployment({}, {}, [contêiner])]).map((v) => v.regra);
    expect(regras).toContain("escalonamento-de-privilegio-permitido");
  });

  it("sistema de arquivos raiz gravável", () => {
    const contêiner = contêinerVálido({
      securityContext: {
        allowPrivilegeEscalation: false,
        readOnlyRootFilesystem: false,
        capabilities: { drop: ["ALL"] },
      },
    });
    const regras = analisar([deployment({}, {}, [contêiner])]).map((v) => v.regra);
    expect(regras).toContain("sistema-de-arquivos-gravavel");
  });

  it("capabilities não dropadas por completo", () => {
    const contêiner = contêinerVálido({
      securityContext: {
        allowPrivilegeEscalation: false,
        readOnlyRootFilesystem: true,
        capabilities: { drop: ["NET_RAW"] },
      },
    });
    const regras = analisar([deployment({}, {}, [contêiner])]).map((v) => v.regra);
    expect(regras).toContain("capabilities-nao-dropadas");
  });

  it("Deployment sem nenhum contêiner", () => {
    const regras = analisar([deployment({}, {}, [])]).map((v) => v.regra);
    expect(regras).toContain("sem-conteiner");
  });
});

describe("o verificador reprova a Regra de Ouro 8 (encerramento coordenado)", () => {
  it("terminationGracePeriodSeconds diferente de 30", () => {
    const regras = analisar([deployment({}, { terminationGracePeriodSeconds: 5 })]).map(
      (v) => v.regra,
    );
    expect(regras).toContain("grace-period-incorreto");
  });

  it("terminationGracePeriodSeconds ausente", () => {
    const semGracePeriod = deployment();
    delete (semGracePeriod.spec.template.spec as Record<string, unknown>)
      .terminationGracePeriodSeconds;
    const regras = analisar([semGracePeriod]).map((v) => v.regra);
    expect(regras).toContain("grace-period-incorreto");
  });

  it("contêiner sem lifecycle.preStop.sleep — a imagem Distroless não tem shell para exec", () => {
    const contêiner = contêinerVálido({ lifecycle: undefined });
    const regras = analisar([deployment({}, {}, [contêiner])]).map((v) => v.regra);
    expect(regras).toContain("sem-prestop-sleep");
  });

  it("preStop.sleep.seconds não positivo", () => {
    const contêiner = contêinerVálido({ lifecycle: { preStop: { sleep: { seconds: 0 } } } });
    const regras = analisar([deployment({}, {}, [contêiner])]).map((v) => v.regra);
    expect(regras).toContain("sem-prestop-sleep");
  });
});

describe("o verificador reprova probes ausentes", () => {
  it.each(["startupProbe", "livenessProbe", "readinessProbe"])("%s sem httpGet.path", (probe) => {
    const contêiner = contêinerVálido({ [probe]: undefined });
    const violações = analisar([deployment({}, {}, [contêiner])]);
    expect(violações.map((v) => v.regra)).toContain("probe-ausente");
    expect(violações.find((v) => v.regra === "probe-ausente")?.mensagem).toContain(probe);
  });
});

describe("a violação identifica o contêiner, não só o Deployment", () => {
  it("aponta o nome do contêiner defeituoso", () => {
    const contêiner = contêinerVálido({
      name: "workers",
      securityContext: {
        allowPrivilegeEscalation: true,
        readOnlyRootFilesystem: true,
        capabilities: { drop: ["ALL"] },
      },
    });
    const violações = analisar([deployment({}, {}, [contêiner])]);
    const violação = violações.find((v) => v.regra === "escalonamento-de-privilegio-permitido");
    expect(violação?.contêiner).toBe("workers");
    expect(violação?.deployment).toBe("ifix-api");
  });
});
