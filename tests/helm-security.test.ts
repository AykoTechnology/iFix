import { describe, expect, it } from "vitest";
import { analisar, contarWorkloads } from "../scripts/check-helm-security.mjs";

/**
 * Prova que o gate 11 reprova — mesmo espírito de `tests/design-literals.test.ts`:
 * fixtures em memória, sem depender do binário `helm` nem de um chart real.
 *
 * Cada regra tem ao menos um caso que a vê falhar. As burlas da seção "o contêiner
 * não escapa pelo próprio securityContext" existem porque a primeira versão deste
 * verificador aceitava todas elas — ver o playbook, entrada de 2026-09-24.
 */

const LABELS = { "app.kubernetes.io/name": "ifix-api", "app.kubernetes.io/instance": "r" };

function contêinerVálido(patch: Record<string, unknown> = {}) {
  return {
    name: "api",
    securityContext: {
      allowPrivilegeEscalation: false,
      readOnlyRootFilesystem: true,
      capabilities: { drop: ["ALL"] },
    },
    env: [{ name: "SHUTDOWN_TIMEOUT_MS", value: "20000" }],
    lifecycle: { preStop: { sleep: { seconds: 5 } } },
    startupProbe: { httpGet: { path: "/health/startup" } },
    livenessProbe: { httpGet: { path: "/health/live" } },
    readinessProbe: { httpGet: { path: "/health/ready" } },
    ...patch,
  };
}

function comSecurityContext(extra: Record<string, unknown>) {
  return contêinerVálido({
    securityContext: {
      allowPrivilegeEscalation: false,
      readOnlyRootFilesystem: true,
      capabilities: { drop: ["ALL"] },
      ...extra,
    },
  });
}

function deployment(
  patchPod: Record<string, unknown> = {},
  patchSpec: Record<string, unknown> = {},
  contêineres: unknown[] = [contêinerVálido()],
  kind = "Deployment",
) {
  return {
    kind,
    metadata: { name: "ifix-api" },
    spec: {
      template: {
        metadata: { labels: LABELS },
        spec: {
          securityContext: {
            runAsNonRoot: true,
            runAsUser: 65532,
            runAsGroup: 65532,
            seccompProfile: { type: "RuntimeDefault" },
            ...patchPod,
          },
          terminationGracePeriodSeconds: 30,
          containers: contêineres,
          ...patchSpec,
        },
      },
    },
  };
}

const service = { kind: "Service", metadata: { name: "ifix-api" }, spec: { selector: LABELS } };

const regras = (manifestos: unknown[]) =>
  analisar(manifestos as Record<string, unknown>[]).map((v) => v.regra);

describe("o verificador aceita workloads conformes", () => {
  it("Deployment servido por Service, com preStop e orçamento fechando", () => {
    expect(analisar([deployment(), service])).toEqual([]);
  });

  it("worker sem Service e sem preStop — tráfego puxado não precisa esperar endpoint", () => {
    const worker = deployment({}, {}, [
      contêinerVálido({
        lifecycle: undefined,
        env: [{ name: "SHUTDOWN_TIMEOUT_MS", value: "25000" }],
      }),
    ]);
    expect(analisar([worker])).toEqual([]);
  });

  it("ignora manifestos que não carregam pod", () => {
    expect(analisar([service, { kind: "ConfigMap", metadata: { name: "x" } }])).toEqual([]);
  });
});

describe("o verificador reprova a PodSecurityStandards Restricted no pod", () => {
  it.each([
    ["pod sem runAsNonRoot", { runAsNonRoot: false }, "pod-sem-runasnonroot"],
    ["uid root", { runAsUser: 0, runAsGroup: 0 }, "uid-diferente-de-nonroot"],
    ["gid root com uid correto", { runAsGroup: 0 }, "uid-diferente-de-nonroot"],
    ["seccomp ausente", { seccompProfile: undefined }, "seccomp-ausente"],
    ["seccomp Unconfined", { seccompProfile: { type: "Unconfined" } }, "seccomp-ausente"],
  ])("%s", (_nome, patch, regra) => {
    expect(regras([deployment(patch), service])).toContain(regra);
  });

  it.each(["hostNetwork", "hostPID", "hostIPC"])("%s: true", (campo) => {
    expect(regras([deployment({}, { [campo]: true }), service])).toContain("namespace-do-host");
  });

  it("volume hostPath", () => {
    const d = deployment({}, { volumes: [{ name: "raiz", hostPath: { path: "/" } }] });
    expect(regras([d, service])).toContain("volume-hostpath");
  });

  it("Deployment sem nenhum contêiner", () => {
    expect(regras([deployment({}, {}, [])])).toContain("sem-conteiner");
  });
});

describe("o verificador reprova o contêiner inseguro", () => {
  it.each([
    [
      "allowPrivilegeEscalation",
      { allowPrivilegeEscalation: true },
      "escalonamento-de-privilegio-permitido",
    ],
    [
      "sistema de arquivos gravável",
      { readOnlyRootFilesystem: false },
      "sistema-de-arquivos-gravavel",
    ],
    ["drop sem ALL", { capabilities: { drop: ["NET_RAW"] } }, "capabilities-nao-dropadas"],
    [
      "capabilities.add",
      { capabilities: { drop: ["ALL"], add: ["SYS_ADMIN"] } },
      "capabilities-adicionadas",
    ],
    ["privileged", { privileged: true }, "conteiner-privilegiado"],
  ])("%s", (_nome, extra, regra) => {
    expect(regras([deployment({}, {}, [comSecurityContext(extra)]), service])).toContain(regra);
  });
});

describe("o contêiner não escapa pelo próprio securityContext", () => {
  // O securityContext do contêiner sobrescreve o do pod: um pod conforme não prova nada
  // se o contêiner declarar o contrário por conta própria.
  it.each([
    ["runAsUser: 0", { runAsUser: 0 }, "conteiner-sobrescreve-uid"],
    ["runAsGroup: 0", { runAsGroup: 0 }, "conteiner-sobrescreve-uid"],
    ["runAsNonRoot: false", { runAsNonRoot: false }, "conteiner-sobrescreve-nonroot"],
    [
      "seccomp Unconfined",
      { seccompProfile: { type: "Unconfined" } },
      "conteiner-sobrescreve-seccomp",
    ],
  ])("%s", (_nome, extra, regra) => {
    expect(regras([deployment({}, {}, [comSecurityContext(extra)]), service])).toContain(regra);
  });

  it("aceita o contêiner que repete o uid correto do pod", () => {
    expect(
      analisar([deployment({}, {}, [comSecurityContext({ runAsUser: 65532 })]), service]),
    ).toEqual([]);
  });

  it("initContainer também é verificado", () => {
    const init = { name: "migracao", securityContext: { runAsUser: 0 } };
    const violações = analisar([deployment({}, { initContainers: [init] }), service]);
    const doInit = violações.filter((v) => v.contêiner === "migracao").map((v) => v.regra);
    expect(doInit).toEqual(
      expect.arrayContaining([
        "conteiner-sobrescreve-uid",
        "escalonamento-de-privilegio-permitido",
        "sistema-de-arquivos-gravavel",
      ]),
    );
  });
});

describe("o verificador não deixa passar o que não enxerga", () => {
  it("StatefulSet é verificado como qualquer workload", () => {
    expect(regras([deployment({ runAsUser: 0 }, {}, undefined, "StatefulSet")])).toContain(
      "uid-diferente-de-nonroot",
    );
  });

  it.each(["Job", "CronJob"])("%s reprova por falta de suporte, não passa em silêncio", (kind) => {
    expect(regras([{ kind, metadata: { name: "x" }, spec: {} }])).toContain(
      "workload-nao-suportado",
    );
  });

  it("zero workloads é contado como zero — a esteira reprova esse caso", () => {
    expect(contarWorkloads([service])).toBe(0);
    expect(contarWorkloads([deployment(), service])).toBe(1);
  });
});

describe("o verificador reprova a Regra de Ouro 8 (encerramento coordenado)", () => {
  it("terminationGracePeriodSeconds diferente de 30", () => {
    expect(regras([deployment({}, { terminationGracePeriodSeconds: 5 }), service])).toContain(
      "grace-period-incorreto",
    );
  });

  it("terminationGracePeriodSeconds ausente", () => {
    const d = deployment();
    delete (d.spec.template.spec as Record<string, unknown>).terminationGracePeriodSeconds;
    expect(regras([d, service])).toContain("grace-period-incorreto");
  });

  it("workload servido por Service sem preStop", () => {
    const d = deployment({}, {}, [contêinerVálido({ lifecycle: undefined })]);
    expect(regras([d, service])).toContain("sem-prestop-sleep");
  });

  it("preStop presente com seconds não positivo", () => {
    const d = deployment({}, {}, [
      contêinerVálido({ lifecycle: { preStop: { sleep: { seconds: 0 } } } }),
    ]);
    expect(regras([d, service])).toContain("prestop-invalido");
  });

  it("preStop do tipo exec — Distroless não tem shell", () => {
    const exec = { lifecycle: { preStop: { exec: { command: ["sleep", "5"] } } } };
    expect(regras([deployment({}, {}, [contêinerVálido(exec)]), service])).toContain(
      "prestop-invalido",
    );
  });

  it("SHUTDOWN_TIMEOUT_MS ausente torna o orçamento inverificável", () => {
    const d = deployment({}, {}, [contêinerVálido({ env: [] })]);
    expect(regras([d, service])).toContain("shutdown-timeout-ausente");
  });

  it("reprova o orçamento que a primeira versão dos charts tinha: 5s + 25s = 30s, sem folga", () => {
    // O prazo do pod começa ANTES do preStop. Com 5s de preStop, o guard de 25s da
    // aplicação dispara no mesmo instante do SIGKILL — a saída ordenada vira sorteio.
    const d = deployment({}, {}, [
      contêinerVálido({ env: [{ name: "SHUTDOWN_TIMEOUT_MS", value: "25000" }] }),
    ]);
    const violação = analisar([d, service]).find(
      (v) => v.regra === "orcamento-de-encerramento-estourado",
    );
    expect(violação?.mensagem).toContain("32000ms > terminationGracePeriodSeconds 30000ms");
  });

  it("aceita o orçamento no limite exato da margem", () => {
    // 5s + 23s + 2s = 30s
    const d = deployment({}, {}, [
      contêinerVálido({ env: [{ name: "SHUTDOWN_TIMEOUT_MS", value: "23000" }] }),
    ]);
    expect(analisar([d, service])).toEqual([]);
  });
});

describe("o verificador reprova probes ausentes", () => {
  it.each(["startupProbe", "livenessProbe", "readinessProbe"])("%s sem httpGet.path", (probe) => {
    const violações = analisar([
      deployment({}, {}, [contêinerVálido({ [probe]: undefined })]),
      service,
    ]);
    expect(violações.find((v) => v.regra === "probe-ausente")?.mensagem).toContain(probe);
  });
});

describe("a violação identifica o contêiner, não só o workload", () => {
  it("aponta o nome do contêiner defeituoso", () => {
    const c = { ...comSecurityContext({ allowPrivilegeEscalation: true }), name: "workers" };
    const violação = analisar([deployment({}, {}, [c]), service]).find(
      (v) => v.regra === "escalonamento-de-privilegio-permitido",
    );
    expect(violação?.contêiner).toBe("workers");
    expect(violação?.deployment).toBe("ifix-api");
  });
});
